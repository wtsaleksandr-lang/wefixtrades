/**
 * ContentFlow Phase 2 — video route prechecks (WP6) regression gate.
 *
 * Drives the PURE exported helpers of server/routes/portal/
 * contentflowVideo.ts (no express wiring, no DB — every dependency of
 * processCreateVideoRequest is injected):
 *
 *   1. Estimate math — 5×6s at the conservative Veo-quality default
 *      ($0.40/s) prices the scenes at exactly $12 and the precheck BLOCKS
 *      it against the default $7.50 per-video cap; VIDEO_COST_OVERRIDES_JSON
 *      is honored (cheaper rate → same plan passes); malformed override
 *      JSON falls back to the conservative default; the monthly-spend
 *      pre-commit blocks spend that would cross the admin monthly cap.
 *   2. Tier-cap clamp — the Director receives tierConstraints clamped to
 *      the tier's VIDEO_SCENE_CAPS regardless of what `advanced` asks for.
 *   3. Idempotency — a duplicate create (storage reports created:false)
 *      returns the EXISTING project's id/plan/estimate, not a new one.
 *   4. DELIBERATE-FAILURE FIXTURE — a regressed precheck that ignores the
 *      estimate lets an over-cap request reach the Director; the gate's
 *      invariant assertion fails red against it, proving this test catches
 *      that regression class rather than merely running.
 *   5. Quota-zero (Free tier) → 402 with {code:"tier_too_low",
 *      upgrade_required:true} — the exact shape the Create panel's
 *      upgrade-card path consumes.
 *   6. Director spend is booked on the draft EITHER WAY (also on a
 *      Director failure) — the dual-write monthly-cap invariant.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Runnable standalone:
 *
 *   npx tsx server/routes/portal/contentflowVideo.routes.test.ts
 *
 * Wired into CI as `npm run check:contentflow-video-routes`.
 */
import assert from "node:assert/strict";

/* Module-load prerequisite: server/db.ts throws without a DATABASE_URL.
 * Never used for real IO here — every dep is injected. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

const {
  parseVideoCostOverrides,
  precheckMicroPerSec,
  estimateVideoCostMicroUsd,
  resolveMaxVideoCostMicroUsd,
  checkVideoCostPrecheck,
  clampAdvancedToTier,
  computeProgressPct,
  buildIdempotencyKey,
  processCreateVideoRequest,
  DEFAULT_SCENE_COST_MICRO_PER_SEC,
  DEFAULT_MAX_VIDEO_COST_MICRO_USD,
} = await import("./contentflowVideo");
const { getVideoSceneCapsForTier, VIDEO_SCENE_CAPS } = await import("@shared/contentflow/quotas");

type CreateVideoDeps = import("./contentflowVideo").CreateVideoDeps;

let passed = 0;
let failed = 0;
async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

/* ═══ Mock deps factory ════════════════════════════════════════════ */

function okPlan(scenes: Array<{ durationSec: 4 | 6 | 8 }>) {
  return {
    title: "Test video",
    styleBible: "Consistent.",
    scenes: scenes.map((s, i) => ({
      index: i,
      visualPrompt: `Scene ${i}. Style: Consistent.`,
      narration: null,
      durationSec: s.durationSec,
    })),
    totalDurationSec: scenes.reduce((a, s) => a + s.durationSec, 0),
  };
}

interface Trace {
  order: string[];
  directorInput: any;
  draftCosts: Array<[number, number]>;
  draftUpdates: Array<[number, Record<string, unknown>]>;
  createProjectInput: any;
}

function makeDeps(overrides: Partial<CreateVideoDeps> & { trace?: Trace } = {}): {
  deps: CreateVideoDeps;
  trace: Trace;
} {
  const trace: Trace = overrides.trace ?? {
    order: [],
    directorInput: null,
    draftCosts: [],
    draftUpdates: [],
    createProjectInput: null,
  };
  const deps: CreateVideoDeps = {
    clientId: 7,
    env: {},
    resolveSource: async (input) => ({
      ok: true,
      source: {
        kind: "free",
        templateId: null,
        customPromptId: null,
        title: "Custom prompt",
        patternId: null,
        trade: null,
        goal: null,
        asset: null,
        rendered: String(input.rendered ?? ""),
        tokens: [],
      },
    }) as any,
    checkGate: async () => {
      trace.order.push("gate");
      return { allowed: true };
    },
    getQuota: async () => {
      trace.order.push("quota");
      return {
        tier: "contentflow-starter",
        limit: { videos: 1 },
        used: { videos_used: 0 },
        resetAt: "2026-07-01T00:05:00.000Z",
      };
    },
    getSettings: async () => {
      trace.order.push("settings");
      return { max_video_cost_usd: null, monthly_spend_cap_usd: null };
    },
    getMonthlySpendMicroUsd: async () => 0,
    getClient: async () => ({ metadata: {}, trade_type: "plumbing" }),
    direct: async (input) => {
      trace.order.push("director");
      trace.directorInput = input;
      return { ok: true, plan: okPlan([{ durationSec: 8 }, { durationSec: 8 }]), costMicroUsd: 5_000 };
    },
    createDraft: async () => {
      trace.order.push("draft");
      return { id: 42 };
    },
    updateDraft: async (id, updates) => {
      trace.draftUpdates.push([id, updates]);
      return {};
    },
    addDraftCost: async (draftId, micro) => {
      trace.draftCosts.push([draftId, micro]);
    },
    createProject: async (input) => {
      trace.order.push("project");
      trace.createProjectInput = input;
      return {
        project: {
          id: 101,
          scene_plan: input.scene_plan,
          estimated_cost_micro_usd: input.estimated_cost_micro_usd,
        } as any,
        scenes: input.scenes.map((s, i) => ({ id: i + 1 }) as any),
        created: true,
      };
    },
    ...overrides,
  };
  return { deps, trace };
}

const BODY = { description: "A plumber fixing a kitchen sink, friendly and fast." };

/* ═══ 1. Estimate math ══════════════════════════════════════════════ */

console.log("\nestimate math");

await check("5×6s at the Veo-quality default prices scenes at exactly $12", () => {
  const est = estimateVideoCostMicroUsd([6, 6, 6, 6, 6], { narrationEnabled: false, overrides: {} });
  assert.equal(est.scenesMicroUsd, 12_000_000);
  assert.equal(DEFAULT_SCENE_COST_MICRO_PER_SEC, 400_000);
});

await check("$12 of scenes blocks against the default $7.50 per-video cap", () => {
  const est = estimateVideoCostMicroUsd([6, 6, 6, 6, 6], { narrationEnabled: false, overrides: {} });
  const verdict = checkVideoCostPrecheck({
    estimateMicroUsd: est.totalMicroUsd,
    maxVideoCostMicroUsd: resolveMaxVideoCostMicroUsd(null, {}),
    monthlySpendMicroUsd: 0,
    monthlyCapUsd: null,
  });
  assert.equal(resolveMaxVideoCostMicroUsd(null, {}), DEFAULT_MAX_VIDEO_COST_MICRO_USD);
  assert.equal(verdict.allowed, false);
  assert.equal((verdict as any).code, "video_cost_capped");
});

await check("VIDEO_COST_OVERRIDES_JSON is honored (Fast pricing → same plan passes)", () => {
  const overrides = parseVideoCostOverrides('{"veo_31_fast": 120000, "bad": -5, "junk": "x"}');
  assert.deepEqual(overrides, { veo_31_fast: 120_000 });
  const est = estimateVideoCostMicroUsd([6, 6, 6, 6, 6], { narrationEnabled: false, overrides });
  assert.equal(est.scenesMicroUsd, 3_600_000); // 30s × $0.12/s
  const verdict = checkVideoCostPrecheck({
    estimateMicroUsd: est.totalMicroUsd,
    maxVideoCostMicroUsd: resolveMaxVideoCostMicroUsd(null, {}),
    monthlySpendMicroUsd: 0,
    monthlyCapUsd: null,
  });
  assert.equal(verdict.allowed, true);
});

await check("worst-case provider rate wins when several overrides exist", () => {
  assert.equal(precheckMicroPerSec({ a: 100_000, b: 420_000 }), 420_000);
});

await check("malformed override JSON falls back to the conservative default", () => {
  assert.deepEqual(parseVideoCostOverrides("{nope"), {});
  assert.deepEqual(parseVideoCostOverrides(""), {});
  assert.deepEqual(parseVideoCostOverrides("[1,2]"), {});
  assert.equal(precheckMicroPerSec(parseVideoCostOverrides("{nope")), DEFAULT_SCENE_COST_MICRO_PER_SEC);
});

await check("settings cap (whole USD) beats env; env beats the $7.50 default", () => {
  assert.equal(resolveMaxVideoCostMicroUsd(20, { VIDEO_MAX_COST_USD: "3" }), 20_000_000);
  assert.equal(resolveMaxVideoCostMicroUsd(null, { VIDEO_MAX_COST_USD: "3.25" }), 3_250_000);
  assert.equal(resolveMaxVideoCostMicroUsd(undefined, {}), 7_500_000);
});

await check("monthly-spend pre-commit blocks spend that would cross the admin cap", () => {
  const verdict = checkVideoCostPrecheck({
    estimateMicroUsd: 1_000_000,
    maxVideoCostMicroUsd: 7_500_000,
    monthlySpendMicroUsd: 9_500_000,
    monthlyCapUsd: 10,
  });
  assert.equal(verdict.allowed, false);
  assert.equal((verdict as any).code, "monthly_spend_capped");
});

await check("single-scene projects skip the stitch line item", () => {
  const single = estimateVideoCostMicroUsd([8], { narrationEnabled: false, overrides: {} });
  assert.equal(single.stitchMicroUsd, 0);
  const multi = estimateVideoCostMicroUsd([8, 8], { narrationEnabled: false, overrides: {} });
  assert.ok(multi.stitchMicroUsd > 0);
});

/* ═══ 2. Tier-cap clamp into the Director ═══════════════════════════ */

console.log("\ntier-cap clamp");

await check("VIDEO_SCENE_CAPS match the design table", () => {
  assert.deepEqual(VIDEO_SCENE_CAPS["contentflow-starter"], { maxScenes: 2, maxTotalSec: 16 });
  assert.deepEqual(VIDEO_SCENE_CAPS["contentflow-creator"], { maxScenes: 4, maxTotalSec: 32 });
  assert.deepEqual(VIDEO_SCENE_CAPS["contentflow-studio"], { maxScenes: 6, maxTotalSec: 48 });
  assert.deepEqual(VIDEO_SCENE_CAPS["contentflow-agency"], { maxScenes: 8, maxTotalSec: 64 });
  assert.deepEqual(VIDEO_SCENE_CAPS["contentflow-free"], { maxScenes: 0, maxTotalSec: 0 });
  /* Short-form tier ids (route resolvers) map to the same caps. */
  assert.deepEqual(getVideoSceneCapsForTier("studio"), { maxScenes: 6, maxTotalSec: 48 });
  assert.deepEqual(getVideoSceneCapsForTier("unknown-tier"), { maxScenes: 0, maxTotalSec: 0 });
});

await check("advanced requests are clamped INTO the tier caps (never above)", () => {
  const caps = getVideoSceneCapsForTier("contentflow-starter");
  assert.deepEqual(clampAdvancedToTier({ sceneCount: 10, durationSec: 999 }, caps), {
    maxScenes: 2,
    maxTotalSec: 16,
  });
  assert.deepEqual(clampAdvancedToTier({ sceneCount: 1, durationSec: 8 }, caps), {
    maxScenes: 1,
    maxTotalSec: 8,
  });
  assert.deepEqual(clampAdvancedToTier(undefined, caps), { maxScenes: 2, maxTotalSec: 16 });
  assert.equal(clampAdvancedToTier({ sceneCount: 4 }, getVideoSceneCapsForTier("contentflow-free")), null);
});

await check("the Director receives the clamped constraints end-to-end", async () => {
  const { deps, trace } = makeDeps();
  const outcome = await processCreateVideoRequest(
    { ...BODY, advanced: { sceneCount: 99, durationSec: 9_999 } },
    deps,
  );
  assert.equal(outcome.status, 202);
  assert.deepEqual(trace.directorInput.tierConstraints, { maxScenes: 2, maxTotalSec: 16 });
  /* Gate order is load-bearing: gate → quota → (caps) → settings/cost → director. */
  assert.deepEqual(trace.order, ["gate", "quota", "settings", "draft", "director", "project"]);
});

/* ═══ 3. Idempotency conflict returns the existing project ══════════ */

console.log("\nidempotency");

await check("idempotency key is stable per client|prompt|day|nonce", () => {
  const now = new Date("2026-06-11T10:00:00Z");
  const a = buildIdempotencyKey(7, "prompt", "nonce-1", now);
  assert.equal(a, buildIdempotencyKey(7, "prompt", "nonce-1", now));
  assert.notEqual(a, buildIdempotencyKey(7, "prompt", "nonce-2", now));
  assert.notEqual(a, buildIdempotencyKey(8, "prompt", "nonce-1", now));
});

await check("a duplicate create returns the EXISTING project (no double charge)", async () => {
  const priorPlan = okPlan([{ durationSec: 6 }]);
  const { deps } = makeDeps({
    createProject: async () => ({
      project: { id: 55, scene_plan: priorPlan, estimated_cost_micro_usd: 110_000 } as any,
      scenes: [{ id: 1 } as any],
      created: false,
    }),
  });
  const outcome = await processCreateVideoRequest({ ...BODY, idempotencyKey: "double-click" }, deps);
  assert.equal(outcome.status, 202);
  assert.equal(outcome.body.projectId, 55);
  assert.equal(outcome.body.created, false);
  assert.equal(outcome.body.estimateUsd, 0.11);
  assert.deepEqual((outcome.body.scenePlan as any).scenes.length, 1);
});

/* ═══ 4. Cap-bypass DELIBERATE-FAILURE fixture ══════════════════════ */

console.log("\ncap-bypass deliberate-failure fixture");

await check("an over-cap request 402s BEFORE the Director (no AI spend, no draft)", async () => {
  const { deps, trace } = makeDeps({ env: { VIDEO_MAX_COST_USD: "0.50" } });
  const outcome = await processCreateVideoRequest(BODY, deps);
  assert.equal(outcome.status, 402);
  assert.equal(outcome.body.code, "video_cost_capped");
  assert.ok(!trace.order.includes("director"), "director must not run on a capped request");
  assert.ok(!trace.order.includes("draft"), "no draft row for a capped request");
});

await check("DELIBERATE FAILURE: a regressed precheck ignoring the estimate fails red", async () => {
  /* The regression this gate exists to catch: someone "simplifies" the
   * precheck so it no longer looks at the estimate. */
  const regressedPrecheck = (() => ({ allowed: true })) as typeof checkVideoCostPrecheck;
  const { deps, trace } = makeDeps({
    env: { VIDEO_MAX_COST_USD: "0.50" },
    precheck: regressedPrecheck,
  });
  const outcome = await processCreateVideoRequest(BODY, deps);

  /* Against the regressed precheck, the over-cap request sails through… */
  assert.equal(outcome.status, 202, "fixture sanity: the regressed precheck lets the request through");

  /* …so the invariant assertion above ("director must not run") FAILS
   * red — proving the gate detects this regression class. */
  let invariantHeld = true;
  try {
    assert.ok(!trace.order.includes("director"), "director must not run on a capped request");
  } catch {
    invariantHeld = false;
  }
  assert.equal(
    invariantHeld,
    false,
    "the no-AI-spend invariant must FAIL against the regressed precheck (it caught the regression)",
  );
});

/* ═══ 5. Quota-zero (Free tier) → the panel's 402 upgrade shape ═════ */

console.log("\nquota gates");

await check("Free tier (videos quota 0) → 402 {code:'tier_too_low', upgrade_required:true}", async () => {
  const { deps, trace } = makeDeps({
    getQuota: async () => ({
      tier: "contentflow-free",
      limit: { videos: 0 },
      used: { videos_used: 0 },
      resetAt: "2026-07-01T00:05:00.000Z",
    }),
  });
  const outcome = await processCreateVideoRequest(BODY, deps);
  assert.equal(outcome.status, 402);
  /* EXACT shape the Create panel's upgrade-card path consumes
   * (toPanelError: code==="tier_too_low" || upgrade_required). */
  assert.equal(outcome.body.code, "tier_too_low");
  assert.equal(outcome.body.upgrade_required, true);
  assert.equal(outcome.body.tier, "contentflow-free");
  assert.ok(!trace.order.includes("director"));
  assert.ok(!trace.order.includes("draft"));
});

await check("exhausted (non-zero) quota → 402 quota_exceeded, still upgrade-capable", async () => {
  const { deps } = makeDeps({
    getQuota: async () => ({
      tier: "contentflow-starter",
      limit: { videos: 1 },
      used: { videos_used: 1 },
      resetAt: "2026-07-01T00:05:00.000Z",
    }),
  });
  const outcome = await processCreateVideoRequest(BODY, deps);
  assert.equal(outcome.status, 402);
  assert.equal(outcome.body.code, "quota_exceeded");
  assert.equal(outcome.body.upgrade_required, true);
});

await check("kill switch → 503 contentflow_paused before any other work", async () => {
  const { deps, trace } = makeDeps({
    checkGate: async () => ({ allowed: false, reason: "ContentFlow is paused — the admin kill switch is ON." }),
  });
  const outcome = await processCreateVideoRequest(BODY, deps);
  assert.equal(outcome.status, 503);
  assert.equal(outcome.body.code, "contentflow_paused");
  assert.ok(!trace.order.includes("quota") || trace.order.indexOf("gate") < trace.order.indexOf("quota"));
  assert.ok(!trace.order.includes("director"));
});

/* ═══ 6. Director spend booked EITHER WAY (dual-write invariant) ════ */

console.log("\ndirector cost booking");

await check("Director cost lands on the draft on success", async () => {
  const { deps, trace } = makeDeps();
  const outcome = await processCreateVideoRequest(BODY, deps);
  assert.equal(outcome.status, 202);
  assert.deepEqual(trace.draftCosts, [[42, 5_000]]);
});

await check("Director cost STILL lands on the draft when the plan fails to parse", async () => {
  const { deps, trace } = makeDeps({
    direct: async () => ({
      ok: false,
      error: { code: "parse_failed", message: "Could not parse the AI scene-plan output as JSON." },
      costMicroUsd: 3_000,
    }),
  });
  const outcome = await processCreateVideoRequest(BODY, deps);
  assert.equal(outcome.status, 502);
  assert.equal(outcome.body.code, "parse_failed");
  assert.deepEqual(trace.draftCosts, [[42, 3_000]], "spend happened → it must be booked");
  assert.equal(trace.draftUpdates.length, 1);
  assert.equal((trace.draftUpdates[0][1] as any).status, "failed");
});

await check("progressPct shape: planned 5 → rendering fraction → stitching 85 → ready 100", () => {
  assert.equal(computeProgressPct("planned", []), 5);
  assert.equal(
    computeProgressPct("rendering", [{ status: "rendered" }, { status: "rendered" }, { status: "planned" }, { status: "planned" }]),
    45,
  );
  assert.equal(computeProgressPct("stitching", [{ status: "rendered" }]), 85);
  assert.equal(computeProgressPct("ready", [{ status: "rendered" }]), 100);
});

/* ═══ Summary ═══════════════════════════════════════════════════════ */

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
