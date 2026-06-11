/**
 * Regression tests for the ContentFlow Phase 2 video render worker
 * (server/jobs/videoRenderWorker.ts).
 *
 * What this gate protects:
 *
 *   1. Flag inertness — CONTENTFLOW_VIDEO_PIPELINE_ENABLED unset/false is a
 *      TRUE no-op: zero storage calls, zero gate reads, zero provider work.
 *   2. Gate-blocked behavior — kill-switch/spend-cap blocks NEW spend
 *      (submitNew + stitchTick skipped) but in-flight renders are STILL
 *      polled and collected.
 *   3. Full happy path across ticks — claim → record-request-BEFORE-submit
 *      → rendering with op ref → poll done → scene asset on R2 at the
 *      design §1.5 key → markSceneRendered + dual-write cost (category
 *      "scenes") → project advanced → stitch → final R2 asset → ready +
 *      draft media_plan updated + video quota incremented exactly once.
 *   4. Double-spend guard — a claimed scene that already carries a
 *      provider_operation_ref is NEVER resubmitted. DELIBERATE-FAILURE
 *      fixture: a "regressed" submitNew that ignores the operation ref is
 *      run against the same fixture and the no-resubmit invariant
 *      assertion fails red — proving the gate catches that regression
 *      class, not just that it runs.
 *   5. Partial permanent failure — one scene terminally failed → project
 *      needs_attention; the stitcher is NEVER invoked on an incomplete
 *      set; quota never increments.
 *   6. Runtime cost ceiling (design §4.5) — actual + nextSceneCost >
 *      estimate × 1.5 → submit skipped, project needs_attention with an
 *      explanatory error, summary.capped counted.
 *
 * Runnable standalone via:
 *   npx tsx server/jobs/videoRenderWorker.test.ts
 * Wired as `npm run check:contentflow-video-worker`.
 *
 * Excluded from `tsc --noEmit` via the tsconfig test pattern. Uses
 * node:assert/strict, no test-runner dependency, no live DB, no real
 * providers/stitcher/R2: every dependency is injected through the
 * worker's deps parameter (its lazy-import defaults never run here).
 */
import assert from "node:assert/strict";

/* The worker statically imports ../db (via the WP1 storage default
 * bindings), which throws without a DATABASE_URL. Nothing in these tests
 * ever touches the pool — every call injects fakes. Must be set BEFORE
 * the dynamic import. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

const {
  processVideoRenderTick,
  videoPipelineEnabled,
} = await import("./videoRenderWorker");

type WorkerSceneRow = import("./videoRenderWorker").WorkerSceneRow;
type RenderingSceneRow = import("./videoRenderWorker").RenderingSceneRow;
type WorkerProjectRow = import("./videoRenderWorker").WorkerProjectRow;
type VideoWorkerStorage = import("./videoRenderWorker").VideoWorkerStorage;
type VideoRenderWorkerDeps = import("./videoRenderWorker").VideoRenderWorkerDeps;
type VideoRenderProviderDep = import("./videoRenderWorker").VideoRenderProviderDep;
type VideoPollResult = import("./videoRenderWorker").VideoPollResult;

const ENABLED_ENV = { CONTENTFLOW_VIDEO_PIPELINE_ENABLED: "true" } as NodeJS.ProcessEnv;

/* ═══ In-memory fake of the worker's storage seam ══════════════════════
   Implements the same state semantics as WP1's SQL (statuses, attempts
   ceiling, advance rules, dual-write cost) so multi-tick scenarios behave
   like production. Every mutation is also recorded in `calls` so tests
   can assert ordering (e.g. record-request BEFORE submit). */

interface FakeDraft {
  id: number;
  generation_cost_micro_usd: number;
}

class FakeStorage implements VideoWorkerStorage {
  projects = new Map<number, WorkerProjectRow>();
  scenes = new Map<number, WorkerSceneRow & { next_attempt_at: Date | null }>();
  drafts = new Map<number, FakeDraft>();
  calls: string[] = [];
  attemptsCeiling = 3;

  seed(project: Partial<WorkerProjectRow> & { id: number }, scenes: Array<Partial<WorkerSceneRow> & { id: number }>): void {
    const proj: WorkerProjectRow = {
      client_id: 7,
      draft_id: 70,
      status: "planned",
      stitch_status: "pending",
      aspect_ratio: "16:9",
      narration_enabled: true,
      audio_mode: "native",
      estimated_cost_micro_usd: null,
      actual_cost_micro_usd: 0,
      video_url: null,
      ...project,
    };
    this.projects.set(proj.id, proj);
    this.drafts.set(proj.draft_id, { id: proj.draft_id, generation_cost_micro_usd: 0 });
    for (const s of scenes) {
      this.scenes.set(s.id, {
        project_id: proj.id,
        scene_index: 0,
        prompt: `scene prompt ${s.id}`,
        narration: null,
        duration_sec: 6,
        status: "planned",
        provider: null,
        provider_operation_ref: null,
        provider_request_id: null,
        video_url: null,
        attempts: 0,
        next_attempt_at: null,
        ...s,
      });
    }
  }

  async recoverStaleVideoClaims() {
    this.calls.push("recoverStaleVideoClaims");
    return { recovered_scene_claims: 0, recovered_lost_submits: 0, recovered_stitch_claims: 0 };
  }

  async listRenderingScenes(limit: number): Promise<RenderingSceneRow[]> {
    this.calls.push("listRenderingScenes");
    const out: RenderingSceneRow[] = [];
    for (const s of this.scenes.values()) {
      const p = this.projects.get(s.project_id)!;
      if (s.status === "rendering" && s.provider_operation_ref && p.status === "rendering") {
        out.push({ ...s, client_id: p.client_id });
      }
      if (out.length >= limit) break;
    }
    return out;
  }

  async countInflightByProvider(): Promise<Record<string, number>> {
    this.calls.push("countInflightByProvider");
    const counts: Record<string, number> = {};
    for (const s of this.scenes.values()) {
      if (s.status === "rendering" && s.provider) counts[s.provider] = (counts[s.provider] ?? 0) + 1;
    }
    return counts;
  }

  async claimPlannedScenes(limit: number, _lockedBy: string, opts?: { now?: Date }): Promise<WorkerSceneRow[]> {
    this.calls.push(`claimPlannedScenes:${limit}`);
    const now = opts?.now ?? new Date();
    const out: WorkerSceneRow[] = [];
    for (const s of [...this.scenes.values()].sort((a, b) => a.project_id - b.project_id || a.scene_index - b.scene_index)) {
      if (out.length >= limit) break;
      const p = this.projects.get(s.project_id)!;
      if (s.status !== "planned") continue;
      if (!["planned", "rendering"].includes(p.status)) continue;
      if (s.next_attempt_at && s.next_attempt_at > now) continue;
      out.push({ ...s });
      if (p.status === "planned") p.status = "rendering";
    }
    return out;
  }

  async claimStitchableProject(): Promise<WorkerProjectRow | null> {
    this.calls.push("claimStitchableProject");
    for (const p of this.projects.values()) {
      if (p.status === "stitching" && p.stitch_status === "pending") {
        p.stitch_status = "stitching";
        return { ...p };
      }
    }
    return null;
  }

  async recordSceneProviderRequest(sceneId: number, provider: string, requestId: string) {
    this.calls.push(`recordSceneProviderRequest:${sceneId}`);
    const s = this.scenes.get(sceneId)!;
    s.provider = provider;
    s.provider_request_id = requestId;
    return { ...s };
  }

  async markSceneRendering(sceneId: number, fields: { provider: string; operationRef: string; requestId?: string }) {
    this.calls.push(`markSceneRendering:${sceneId}`);
    const s = this.scenes.get(sceneId)!;
    s.status = "rendering";
    s.provider = fields.provider;
    s.provider_operation_ref = fields.operationRef;
    if (fields.requestId) s.provider_request_id = fields.requestId;
    return { ...s };
  }

  async markSceneRendered(sceneId: number, fields: { videoUrl: string; costMicroUsd?: number }) {
    this.calls.push(`markSceneRendered:${sceneId}`);
    const s = this.scenes.get(sceneId)!;
    s.status = "rendered";
    s.video_url = fields.videoUrl;
    return { ...s };
  }

  async markSceneFailed(sceneId: number, fields: { error: string; retryable?: boolean }) {
    this.calls.push(`markSceneFailed:${sceneId}`);
    const s = this.scenes.get(sceneId)!;
    s.attempts += 1;
    s.provider_operation_ref = null;
    const retryable = fields.retryable ?? true;
    s.status = retryable && s.attempts < this.attemptsCeiling ? "planned" : "failed";
    return { ...s };
  }

  async advanceProjectIfComplete(projectId: number): Promise<WorkerProjectRow | null> {
    this.calls.push(`advanceProjectIfComplete:${projectId}`);
    const p = this.projects.get(projectId)!;
    const scenes = [...this.scenes.values()].filter((s) => s.project_id === projectId);
    if (p.status === "rendering" && scenes.length > 0 && scenes.every((s) => s.status === "rendered")) {
      p.status = "stitching";
      p.stitch_status = "pending";
      return { ...p };
    }
    if (["planned", "rendering"].includes(p.status) && scenes.some((s) => s.status === "failed")) {
      p.status = "needs_attention";
      return { ...p };
    }
    return null;
  }

  async addProjectCost(projectId: number, category: "director" | "scenes" | "tts" | "stitch", microUsd: number) {
    this.calls.push(`addProjectCost:${projectId}:${category}:${microUsd}`);
    const p = this.projects.get(projectId)!;
    // Dual-write invariant, mirrored from WP1: project ledger AND draft.
    p.actual_cost_micro_usd += microUsd;
    const draft = this.drafts.get(p.draft_id)!;
    draft.generation_cost_micro_usd += microUsd;
    return { ...p };
  }

  async getProjectWithScenes(projectId: number) {
    this.calls.push(`getProjectWithScenes:${projectId}`);
    const p = this.projects.get(projectId);
    if (!p) return undefined;
    const scenes = [...this.scenes.values()]
      .filter((s) => s.project_id === projectId)
      .sort((a, b) => a.scene_index - b.scene_index)
      .map((s) => ({ ...s }));
    return { project: { ...p }, scenes };
  }

  async markProjectReady(projectId: number, videoUrl: string) {
    this.calls.push(`markProjectReady:${projectId}`);
    const p = this.projects.get(projectId)!;
    p.status = "ready";
    p.stitch_status = "done";
    p.video_url = videoUrl;
  }

  async markProjectNeedsAttention(projectId: number, error: string) {
    this.calls.push(`markProjectNeedsAttention:${projectId}`);
    const p = this.projects.get(projectId)!;
    p.status = "needs_attention";
    (p as any).error = error;
  }

  async markProjectStitchFailed(projectId: number, error: string) {
    this.calls.push(`markProjectStitchFailed:${projectId}`);
    const p = this.projects.get(projectId)!;
    p.status = "needs_attention";
    p.stitch_status = "failed";
    (p as any).error = error;
  }
}

/* ═══ Fake provider / registry / stitcher / R2 ════════════════════════ */

class FakeProvider implements VideoRenderProviderDep {
  id = "veo_31";
  clipCost = 100_000; // µ$ per clip
  submitCalls: Array<{ sceneRequestId: string; prompt: string }> = [];
  pollCalls: string[] = [];
  pollScript = new Map<string, VideoPollResult[]>(); // opRef → queued results
  submitResult: (requestId: string) => import("./videoRenderWorker").VideoSubmitResult = (requestId) => ({
    status: "submitted",
    operationRef: `op-${requestId}`,
  });

  isConfigured() { return true; }
  costMicroUsdPerClip() { return this.clipCost; }
  async submit(req: { prompt: string; requestId: string } & Record<string, unknown>) {
    this.submitCalls.push({ sceneRequestId: req.requestId, prompt: req.prompt });
    return this.submitResult(req.requestId);
  }
  async poll(operationRef: string): Promise<VideoPollResult> {
    this.pollCalls.push(operationRef);
    const queue = this.pollScript.get(operationRef);
    const next = queue?.shift();
    return next ?? { status: "running" };
  }
}

function makeRegistry(provider: FakeProvider) {
  return {
    getConfiguredProviders: () => [provider],
    pickProviderForScene: () => provider,
  };
}

function makeDeps(overrides: Partial<VideoRenderWorkerDeps> & { storage: VideoWorkerStorage }): Partial<VideoRenderWorkerDeps> & {
  uploads: Array<{ key: string; hasBuffer: boolean; sourceUrl?: string }>;
  quotaIncrements: number[];
  mediaPlans: Array<{ draftId: number; plan: Record<string, unknown> }>;
  stitchCalls: any[];
} {
  const uploads: Array<{ key: string; hasBuffer: boolean; sourceUrl?: string }> = [];
  const quotaIncrements: number[] = [];
  const mediaPlans: Array<{ draftId: number; plan: Record<string, unknown> }> = [];
  const stitchCalls: any[] = [];
  return {
    env: ENABLED_ENV,
    checkGate: async () => ({ allowed: true }),
    getProviderRegistry: async () => null,
    getStitcher: async () => ({
      isAvailable: async () => true,
      stitch: async (input: any, opts: any) => {
        stitchCalls.push({ input, opts });
        // Write a tiny "final video" into the provided workDir so the
        // worker's readFile → upload path runs for real.
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const filePath = path.join(opts.workDir, "final.mp4");
        await fs.writeFile(filePath, Buffer.from("stitched-bytes"));
        return { ok: true as const, filePath };
      },
    }),
    getTts: async () => null,
    uploadToR2: async (args) => {
      uploads.push({ key: args.key, hasBuffer: !!args.buffer, sourceUrl: args.sourceUrl });
      return { ok: true, url: `https://cdn.example/${args.key}` };
    },
    updateDraftMediaPlan: async (draftId, plan) => {
      mediaPlans.push({ draftId, plan });
    },
    incrementVideoQuota: async (clientId) => {
      quotaIncrements.push(clientId);
    },
    ...overrides,
    uploads,
    quotaIncrements,
    mediaPlans,
    stitchCalls,
  };
}

let passed = 0;
function ok(name: string): void {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/* ═══ 1. Flag-unset inertness — zero calls ════════════════════════════ */
{
  // Every dep throws if touched: an inert tick must never reach any of them.
  const boom = (what: string) => () => {
    throw new Error(`inert tick must not call ${what}`);
  };
  const trapStorage = new Proxy({} as VideoWorkerStorage, { get: (_t, prop) => boom(`storage.${String(prop)}`) });
  for (const env of [{}, { CONTENTFLOW_VIDEO_PIPELINE_ENABLED: "false" }, { CONTENTFLOW_VIDEO_PIPELINE_ENABLED: "TRUE" }, { VIDEO_GENERATION_ENABLED: "true" }]) {
    const summary = await processVideoRenderTick(new Date(), {
      env: env as NodeJS.ProcessEnv,
      storage: trapStorage,
      checkGate: boom("checkGate") as any,
      getProviderRegistry: boom("getProviderRegistry") as any,
      getStitcher: boom("getStitcher") as any,
      getTts: boom("getTts") as any,
      uploadToR2: boom("uploadToR2") as any,
      updateDraftMediaPlan: boom("updateDraftMediaPlan") as any,
      incrementVideoQuota: boom("incrementVideoQuota") as any,
    });
    assert.equal(summary.enabled, false);
    assert.deepEqual(
      [summary.considered, summary.submitted, summary.polled, summary.completed, summary.failed, summary.stitched, summary.capped],
      [0, 0, 0, 0, 0, 0, 0],
    );
  }
  assert.equal(videoPipelineEnabled({ CONTENTFLOW_VIDEO_PIPELINE_ENABLED: "true" } as any), true);
  assert.equal(videoPipelineEnabled({} as any), false);
  // Legacy flag must NOT enable the pipeline.
  assert.equal(videoPipelineEnabled({ VIDEO_GENERATION_ENABLED: "true" } as any), false);
  ok("flag-unset/false/legacy-flag tick is fully inert (zero dep calls, enabled:false)");
}

/* ═══ 2. Gate-blocked tick: polls in-flight, never submits/stitches ═══ */
{
  const storage = new FakeStorage();
  storage.seed(
    { id: 1, status: "rendering" },
    [
      { id: 11, scene_index: 0, status: "rendering", provider: "veo_31", provider_operation_ref: "op-a" },
      { id: 12, scene_index: 1, status: "planned" }, // must NOT be claimed
    ],
  );
  const provider = new FakeProvider();
  provider.pollScript.set("op-a", [{ status: "running" }]);
  const deps = makeDeps({ storage, getProviderRegistry: async () => makeRegistry(provider) });
  deps.checkGate = async () => ({ allowed: false, reason: "kill switch" });

  const summary = await processVideoRenderTick(new Date(), deps);
  assert.equal(summary.gate_blocked, true);
  assert.equal(summary.polled, 1, "in-flight scene must still be polled");
  assert.equal(summary.submitted, 0);
  assert.equal(summary.considered, 0);
  assert.equal(summary.stitched, 0);
  assert.equal(provider.submitCalls.length, 0, "gate-blocked tick must not submit");
  assert.ok(!storage.calls.some((c) => c.startsWith("claimPlannedScenes")), "gate-blocked tick must not claim planned scenes");
  assert.ok(!storage.calls.includes("claimStitchableProject"), "gate-blocked tick must not claim a stitch");
  // Recovery still ran (step 1).
  assert.ok(storage.calls.includes("recoverStaleVideoClaims"));
  ok("gate-blocked tick still recovers + polls but skips submitNew and stitchTick");
}

/* ═══ 3. Full happy path across three ticks ═══════════════════════════ */
{
  const storage = new FakeStorage();
  storage.seed(
    { id: 1, client_id: 7, draft_id: 70, status: "planned", estimated_cost_micro_usd: 1_000_000 },
    [
      { id: 11, scene_index: 0, duration_sec: 6 },
      { id: 12, scene_index: 1, duration_sec: 8, narration: "call us today" },
    ],
  );
  const provider = new FakeProvider();
  const deps = makeDeps({ storage, getProviderRegistry: async () => makeRegistry(provider) });

  // Tick 1 — submit both scenes.
  const t1 = await processVideoRenderTick(new Date(), deps);
  assert.equal(t1.considered, 2);
  assert.equal(t1.submitted, 2);
  assert.equal(provider.submitCalls.length, 2);
  // Request id persisted BEFORE submit, per scene (idempotency to provider).
  for (const sceneId of [11, 12]) {
    const recordIdx = storage.calls.indexOf(`recordSceneProviderRequest:${sceneId}`);
    const renderingIdx = storage.calls.indexOf(`markSceneRendering:${sceneId}`);
    assert.ok(recordIdx >= 0 && renderingIdx > recordIdx, `record-request must precede markSceneRendering for scene ${sceneId}`);
  }
  const scene11 = storage.scenes.get(11)!;
  assert.equal(scene11.status, "rendering");
  assert.ok(scene11.provider_operation_ref, "operation ref persisted");
  assert.ok(scene11.provider_request_id, "request id persisted");

  // Tick 2 — both renders complete: bytes for one, URL for the other;
  // scene assets land at the §1.5 key; cost dual-written per scene.
  provider.pollScript.set(storage.scenes.get(11)!.provider_operation_ref!, [
    { status: "done", videoBytes: Buffer.from("clip-11"), actualCostMicroUsd: 120_000 },
  ]);
  provider.pollScript.set(storage.scenes.get(12)!.provider_operation_ref!, [
    { status: "done", videoUrl: "https://provider.example/clip-12.mp4" }, // no actual cost → falls back to costMicroUsdPerClip
  ]);
  // Tick order is poll → advance → stitch, so the same tick that collects
  // the last scene also advances AND stitches the project (design §1).
  const t2 = await processVideoRenderTick(new Date(), deps);
  assert.equal(t2.polled, 2);
  assert.equal(t2.completed, 2);
  assert.deepEqual(
    deps.uploads.map((u) => u.key).slice(0, 2),
    ["contentflow/videos/7/1/scene-0.mp4", "contentflow/videos/7/1/scene-1.mp4"],
    "scene assets use contentflow/videos/{clientId}/{projectId}/scene-{n}.mp4",
  );
  assert.equal(deps.uploads[0].hasBuffer, true, "bytes payload uploads as buffer");
  assert.equal(deps.uploads[1].sourceUrl, "https://provider.example/clip-12.mp4", "url payload uploads via sourceUrl");
  // Dual-write cost invariant: project ledger AND draft accrued both scenes.
  const project = storage.projects.get(1)!;
  assert.equal(project.actual_cost_micro_usd, 120_000 + 100_000);
  assert.equal(storage.drafts.get(70)!.generation_cost_micro_usd, 220_000, "draft spend (monthly cap input) must accrue the same scene costs");
  assert.ok(storage.calls.includes("addProjectCost:1:scenes:120000"), 'cost recorded under category "scenes"');

  // Stitch (same tick): TWO scenes → real stitcher path, final asset at
  // the §1.5 final key, project ready, draft media_plan, quota +1.
  assert.equal(t2.stitched, 1);
  assert.equal(deps.stitchCalls.length, 1, "multi-scene project must go through the stitcher");
  assert.equal(deps.stitchCalls[0].input.scenes.length, 2);
  const finalUpload = deps.uploads.find((u) => u.key === "contentflow/videos/7/1.mp4");
  assert.ok(finalUpload?.hasBuffer, "final stitched asset uploaded as buffer to contentflow/videos/{clientId}/{projectId}.mp4");
  const ready = storage.projects.get(1)!;
  assert.equal(ready.status, "ready");
  assert.equal(ready.stitch_status, "done");
  assert.equal(ready.video_url, "https://cdn.example/contentflow/videos/7/1.mp4");
  assert.deepEqual(deps.quotaIncrements, [7], "video quota incremented exactly once, at ready");
  assert.equal(deps.mediaPlans.length, 1);
  assert.equal(deps.mediaPlans[0].draftId, 70);
  assert.equal(deps.mediaPlans[0].plan.type, "video");
  assert.equal(deps.mediaPlans[0].plan.video_url, ready.video_url);
  assert.equal(deps.mediaPlans[0].plan.duration_seconds, 14);
  assert.deepEqual(deps.mediaPlans[0].plan.provider_mix, ["veo_31"]);

  // Tick 3 — nothing left: fully idle, no double quota / double stitch.
  const t3 = await processVideoRenderTick(new Date(), deps);
  assert.equal(t3.stitched + t3.submitted + t3.completed, 0);
  assert.deepEqual(deps.quotaIncrements, [7]);
  ok("full happy tick chain: submit → poll done → R2 → dual cost → advance → stitch → ready + quota + media_plan");
}

/* ═══ 4. Double-spend guard + deliberate-failure fixture ══════════════ */
{
  // Fixture: a scene the claim hands out even though it ALREADY carries a
  // provider operation ref (simulates a regressed/raced claim or a manual
  // DB edit). The real worker must refuse to resubmit it.
  const buildFixture = () => {
    const storage = new FakeStorage();
    storage.seed(
      { id: 1, status: "rendering" },
      [{
        id: 11,
        scene_index: 0,
        status: "planned", // claimable...
        provider: "veo_31",
        provider_operation_ref: "op-live-render", // ...but mid-render at the provider!
        provider_request_id: "req-original",
      }],
    );
    const provider = new FakeProvider();
    return { storage, provider };
  };

  // 4a. The REAL worker never resubmits.
  {
    const { storage, provider } = buildFixture();
    const deps = makeDeps({ storage, getProviderRegistry: async () => makeRegistry(provider) });
    const summary = await processVideoRenderTick(new Date(), deps);
    assert.equal(provider.submitCalls.length, 0, "scene with an operation ref must NEVER be resubmitted");
    assert.equal(summary.submitted, 0);
    const scene = storage.scenes.get(11)!;
    assert.equal(scene.provider_operation_ref, "op-live-render", "live operation ref must be preserved");
    assert.equal(scene.provider_request_id, "req-original", "original request id must be preserved");
  }

  // 4b. DELIBERATE-FAILURE: a "regressed" submitNew that ignores the
  // operation ref, run against the SAME fixture and the SAME invariant
  // assertion — it must fail red, proving the assertion catches this
  // regression class (the gate tests the guard, not just the happy path).
  {
    const { storage, provider } = buildFixture();
    const regressedSubmitNew = async () => {
      // Regression under test: claims scenes and submits unconditionally —
      // the `if (scene.provider_operation_ref) continue` guard is missing.
      const claimed = await storage.claimPlannedScenes(3, "regressed", {});
      for (const scene of claimed) {
        await storage.recordSceneProviderRequest(scene.id, provider.id, "req-regressed");
        await provider.submit({
          prompt: scene.prompt,
          durationSec: scene.duration_sec,
          aspectRatio: "16:9",
          narration: scene.narration,
          requestId: "req-regressed",
        });
      }
    };
    await regressedSubmitNew();
    let invariantTripped = false;
    try {
      assert.equal(provider.submitCalls.length, 0, "scene with an operation ref must NEVER be resubmitted");
    } catch {
      invariantTripped = true;
    }
    assert.equal(invariantTripped, true, "deliberate-failure fixture: the no-resubmit invariant must fail red against a regressed submitNew");
    assert.equal(provider.submitCalls.length, 1, "fixture sanity: the regressed loop really double-submitted");
  }
  ok("double-spend guard holds, and the deliberate-failure fixture fails red without it");
}

/* ═══ 5. Partial permanent failure → needs_attention, never stitched ══ */
{
  const storage = new FakeStorage();
  storage.seed(
    { id: 1, client_id: 7, status: "rendering" },
    [
      { id: 11, scene_index: 0, status: "rendering", provider: "veo_31", provider_operation_ref: "op-ok" },
      { id: 12, scene_index: 1, status: "rendering", provider: "veo_31", provider_operation_ref: "op-bad", attempts: 2 },
    ],
  );
  const provider = new FakeProvider();
  provider.pollScript.set("op-ok", [{ status: "done", videoBytes: Buffer.from("clip") }]);
  provider.pollScript.set("op-bad", [{ status: "failed", error: "content policy violation", retryable: false }]);
  const deps = makeDeps({ storage, getProviderRegistry: async () => makeRegistry(provider) });

  const t1 = await processVideoRenderTick(new Date(), deps);
  assert.equal(t1.completed, 1);
  assert.equal(t1.failed, 1);
  assert.equal(storage.scenes.get(12)!.status, "failed", "non-retryable failure is terminal");
  assert.equal(storage.projects.get(1)!.status, "needs_attention");

  // Further ticks: the incomplete project must never stitch or count quota.
  const t2 = await processVideoRenderTick(new Date(), deps);
  assert.equal(t2.stitched, 0);
  assert.equal(deps.stitchCalls.length, 0, "stitcher must never run for a project with a failed scene");
  assert.deepEqual(deps.quotaIncrements, [], "failed project must not consume video quota");
  assert.ok(!deps.uploads.some((u) => u.key === "contentflow/videos/7/1.mp4"), "no final asset for an incomplete project");
  ok("partial permanent failure → needs_attention; never stitched, no quota");
}

/* ═══ 6. Runtime cost ceiling (design §4.5) ═══════════════════════════ */
{
  const storage = new FakeStorage();
  // estimate $1.00, already spent $1.40; next clip $0.20 → 1.60 > 1.50 → skip.
  storage.seed(
    { id: 1, status: "rendering", estimated_cost_micro_usd: 1_000_000, actual_cost_micro_usd: 1_400_000 },
    [{ id: 11, scene_index: 0, duration_sec: 6 }],
  );
  const provider = new FakeProvider();
  provider.clipCost = 200_000;
  const deps = makeDeps({ storage, getProviderRegistry: async () => makeRegistry(provider) });

  const summary = await processVideoRenderTick(new Date(), deps);
  assert.equal(provider.submitCalls.length, 0, "over-ceiling scene must not be submitted");
  assert.equal(summary.submitted, 0);
  assert.equal(summary.capped, 1);
  const project = storage.projects.get(1)!;
  assert.equal(project.status, "needs_attention");
  assert.match(String((project as any).error), /cost ceiling/i, "needs_attention must carry an explanatory cost-ceiling error");
  assert.match(String((project as any).error), /1\.5/, "error explains the ×1.5 ceiling");

  // Control: exactly AT the ceiling is allowed (strict 'exceeds' semantics).
  const storage2 = new FakeStorage();
  storage2.seed(
    { id: 2, draft_id: 71, status: "rendering", estimated_cost_micro_usd: 1_000_000, actual_cost_micro_usd: 1_300_000 },
    [{ id: 21, scene_index: 0, duration_sec: 6 }],
  );
  const provider2 = new FakeProvider();
  provider2.clipCost = 200_000; // 1.3 + 0.2 = 1.5 == estimate × 1.5 → allowed
  const deps2 = makeDeps({ storage: storage2, getProviderRegistry: async () => makeRegistry(provider2) });
  const summary2 = await processVideoRenderTick(new Date(), deps2);
  assert.equal(summary2.submitted, 1, "spend exactly at estimate × 1.5 is still allowed");
  ok("cost ceiling: over → skip + needs_attention with explanation; at-ceiling still submits");
}

console.log(`\ncheck:contentflow-video-worker — OK (${passed} scenario groups passed)`);
