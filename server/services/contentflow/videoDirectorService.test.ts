/**
 * ContentFlow Phase 2 — video Director service tests (WP2).
 *
 * Runnable standalone (no test-runner dep, no live DB / no API key):
 *   npx tsx server/services/contentflow/videoDirectorService.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes ** /*.test.ts). Pattern
 * matches referenceReplication.test.ts — node assert/strict + mocked
 * text generation (the Director's AI call is dependency-injected).
 *
 * Coverage:
 *   1. Happy path — plan invariants: totalDurationSec == Σ durations,
 *      styleBible injected into EVERY visualPrompt, narration within the
 *      2.3 words/sec budget, 0-based indexes, durations ∈ {4,6,8},
 *      cost surfaced from the mocked text gen.
 *   2. Unparseable JSON → typed parse_failed error (cost still booked).
 *   3. 12-scene overshoot → clamped to tier maxScenes + maxTotalSec.
 *   4. Narration-too-long → TRIMMED to the word budget (documented
 *      strategy: deterministic trim, no regenerate).
 *   5. narrationEnabled=false → narration null everywhere.
 *   6. Gate-blocked + provider-exhausted throws → typed errors, no throw.
 *   7. Degenerate tier constraints → validation_impossible, no AI spend.
 *   8. DELIBERATE-FAILURE FIXTURE — a regressed validator that skips the
 *      duration-sum invariant produces a plan that the invariant check
 *      catches red (proves the check actually detects a regression).
 */

import assert from "node:assert/strict";
import {
  directScenePlan,
  validateAndClampPlan,
  tryParseScenePlan,
  clampSceneDuration,
  clampNarration,
  buildStyleBible,
  NARRATION_WORDS_PER_SEC,
  SCENE_DURATION_OPTIONS,
  type DirectorInput,
  type DirectorTextGen,
  type ScenePlan,
} from "./videoDirectorService";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

/* ─── Shared fixtures ───────────────────────────────────────────────── */

const BRAND = {
  primary_color: "#1A2B3C",
  secondary_color: "#FF6600",
  style_keywords: ["clean", "modern"],
  tone: "professional" as const,
  location_cue: "Hamilton, Ontario suburbs",
  service_focus: ["drain cleaning", "water heaters"],
  visual_style: "realistic job-site footage",
  avoid: ["cartoon"],
};

function makeInput(overrides: Partial<DirectorInput> = {}): DirectorInput {
  return {
    description: "Show our plumbing team fixing a burst pipe fast",
    brand: BRAND,
    tradeType: "plumbing",
    tierConstraints: { maxScenes: 4, maxTotalSec: 32 },
    aspectRatio: "16:9",
    narrationEnabled: true,
    ...overrides,
  };
}

function mockGen(json: unknown, costMicroUsd = 12_345): DirectorTextGen {
  return async () => ({
    text: typeof json === "string" ? json : JSON.stringify(json),
    costMicroUsd,
    provider: "mock",
  });
}

const HAPPY_PLAN = {
  title: "Burst Pipe? Fixed Fast.",
  styleBible: "Same plumber in navy uniform, suburban home, soft daylight.",
  scenes: [
    { index: 0, visualPrompt: "Water spraying from a burst copper pipe under a kitchen sink", narration: "A burst pipe never waits for business hours.", durationSec: 4 },
    { index: 1, visualPrompt: "Plumber's van pulling into a suburban driveway", narration: "Our team arrives fast, ready to work.", durationSec: 6 },
    { index: 2, visualPrompt: "Close-up of gloved hands replacing the pipe section with a wrench", narration: "We repair it right the first time, with quality parts.", durationSec: 8 },
    { index: 3, visualPrompt: "Homeowner turning the tap on, water running clean", narration: "Call us today.", durationSec: 4 },
  ],
  musicMood: "upbeat confident",
  totalDurationSec: 22,
};

/** The plan-invariant checker the happy path AND the deliberate-failure
 *  fixture both rely on. If a regression makes a plan violate any
 *  invariant, this throws. */
function assertPlanInvariants(plan: ScenePlan): void {
  const sum = plan.scenes.reduce((a, s) => a + s.durationSec, 0);
  assert.equal(plan.totalDurationSec, sum, "totalDurationSec must equal the sum of scene durations");
  assert.ok(plan.scenes.length >= 1, "plan has at least one scene");
  assert.ok(plan.styleBible.length > 0, "styleBible non-empty");
  plan.scenes.forEach((s, i) => {
    assert.equal(s.index, i, "scene indexes are 0-based and sequential");
    assert.ok(
      (SCENE_DURATION_OPTIONS as readonly number[]).includes(s.durationSec),
      `scene ${i} durationSec ${s.durationSec} must be one of {4,6,8}`,
    );
    assert.ok(
      s.visualPrompt.includes(plan.styleBible),
      `scene ${i} visualPrompt must contain the styleBible`,
    );
    if (s.narration !== null) {
      const words = s.narration.split(/\s+/).filter(Boolean).length;
      assert.ok(
        words <= Math.floor(s.durationSec * NARRATION_WORDS_PER_SEC),
        `scene ${i} narration (${words} words) must fit ${s.durationSec}s budget`,
      );
    }
  });
}

/* ─── Tests ─────────────────────────────────────────────────────────── */

async function main() {
  console.log("videoDirectorService.test.ts");

  await test("happy path: plan invariants hold + cost surfaced", async () => {
    const res = await directScenePlan(makeInput(), mockGen(HAPPY_PLAN, 9_999));
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assertPlanInvariants(res.plan);
    assert.equal(res.plan.scenes.length, 4);
    assert.equal(res.plan.totalDurationSec, 22);
    assert.equal(res.plan.title, HAPPY_PLAN.title);
    assert.equal(res.plan.musicMood, "upbeat confident");
    assert.equal(res.costMicroUsd, 9_999, "cost from the text gen surfaced for booking");
    assert.equal(res.provider, "mock");
    /* Brand facts make it into the styleBible (and thus every prompt). */
    assert.ok(res.plan.styleBible.includes("#1A2B3C"), "brand primary color in styleBible");
    assert.ok(res.plan.styleBible.includes("plumbing"), "trade context in styleBible");
    /* The model's own continuity paragraph is preserved too. */
    assert.ok(res.plan.styleBible.includes("navy uniform"));
  });

  await test("unparseable JSON → typed parse_failed (cost still booked)", async () => {
    const res = await directScenePlan(
      makeInput(),
      mockGen("Sorry, I cannot produce a scene plan right now.", 4_321),
    );
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "parse_failed");
    assert.equal(res.costMicroUsd, 4_321, "AI spend before the failure is surfaced");
  });

  await test("malformed scene shape (missing visualPrompt) → parse_failed", async () => {
    const bad = { ...HAPPY_PLAN, scenes: [{ index: 0, narration: "hi", durationSec: 4 }] };
    const res = await directScenePlan(makeInput(), mockGen(bad));
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "parse_failed");
  });

  await test("12-scene overshoot → clamped to tier maxScenes + maxTotalSec", async () => {
    const twelve = {
      title: "Overshoot",
      styleBible: "Continuity.",
      scenes: Array.from({ length: 12 }, (_, i) => ({
        index: i,
        visualPrompt: `Scene number ${i} of the job`,
        narration: "Short line.",
        durationSec: 8,
      })),
      totalDurationSec: 96,
    };
    const res = await directScenePlan(
      makeInput({ tierConstraints: { maxScenes: 4, maxTotalSec: 20 } }),
      mockGen(twelve),
    );
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assertPlanInvariants(res.plan);
    assert.ok(res.plan.scenes.length <= 4, "scene count clamped to tier max");
    assert.ok(res.plan.totalDurationSec <= 20, "total duration clamped to tier max");
    /* Step-down works from the LAST scene back: earlier scenes keep length. */
    assert.equal(res.plan.scenes[0]!.durationSec, 8, "first scene keeps its 8s");
  });

  await test("out-of-range durations snapped to {4,6,8}", () => {
    assert.equal(clampSceneDuration(1), 4);
    assert.equal(clampSceneDuration(5), 4);
    assert.equal(clampSceneDuration(5.5), 6);
    assert.equal(clampSceneDuration(7), 6);
    assert.equal(clampSceneDuration(7.2), 8);
    assert.equal(clampSceneDuration(30), 8);
  });

  await test("narration-too-long → TRIMMED to the word budget (documented strategy)", async () => {
    const longLine = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const plan = {
      ...HAPPY_PLAN,
      scenes: [
        { index: 0, visualPrompt: "Plumber explains the fix to camera", narration: longLine, durationSec: 8 },
      ],
      totalDurationSec: 8,
    };
    const res = await directScenePlan(makeInput(), mockGen(plan));
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assertPlanInvariants(res.plan);
    const narration = res.plan.scenes[0]!.narration;
    assert.ok(narration !== null);
    const words = narration!.split(/\s+/).filter(Boolean).length;
    const budget = Math.floor(8 * NARRATION_WORDS_PER_SEC); // 18
    assert.equal(words, budget, "trimmed exactly to floor(durationSec × 2.3) words");
    assert.ok(/[.!?]$/.test(narration!), "trimmed narration closes with sentence punctuation");
    /* Unit check: trailing comma stripped at the cut. */
    assert.equal(clampNarration("one, two, three, four, five,", 1), "one, two.");
  });

  await test("narrationEnabled=false → narration null on every scene", async () => {
    const res = await directScenePlan(makeInput({ narrationEnabled: false }), mockGen(HAPPY_PLAN));
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assertPlanInvariants(res.plan);
    for (const s of res.plan.scenes) assert.equal(s.narration, null);
  });

  await test("gate-blocked throw → typed gate_blocked, never throws", async () => {
    const gen: DirectorTextGen = async () => {
      throw new Error("ContentFlow is paused — the admin kill switch is ON.");
    };
    const res = await directScenePlan(makeInput(), gen);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "gate_blocked");
    assert.equal(res.costMicroUsd, 0);
  });

  await test("provider-exhausted throw → typed ai_failed, never throws", async () => {
    const gen: DirectorTextGen = async () => {
      throw new Error("AI text generation failed — all providers exhausted (anthropic:429, openai:500)");
    };
    const res = await directScenePlan(makeInput(), gen);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "ai_failed");
  });

  await test("empty description → invalid_input without spending", async () => {
    let called = false;
    const gen: DirectorTextGen = async () => {
      called = true;
      return { text: "{}", costMicroUsd: 1 };
    };
    const res = await directScenePlan(makeInput({ description: "   " }), gen);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "invalid_input");
    assert.equal(called, false, "no AI call on invalid input");
  });

  await test("degenerate tier (maxTotalSec=2) → validation_impossible without spending", async () => {
    let called = false;
    const gen: DirectorTextGen = async () => {
      called = true;
      return { text: JSON.stringify(HAPPY_PLAN), costMicroUsd: 1 };
    };
    const res = await directScenePlan(
      makeInput({ tierConstraints: { maxScenes: 2, maxTotalSec: 2 } }),
      gen,
    );
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "validation_impossible");
    assert.equal(called, false, "no AI call when no plan can exist");
  });

  await test("styleBible builds from brand even when the model omits one", () => {
    const bible = buildStyleBible(BRAND, "plumbing", null);
    assert.ok(bible.includes("plumbing"));
    assert.ok(bible.includes("#1A2B3C"));
    assert.ok(bible.includes("Hamilton, Ontario suburbs"));
    assert.ok(bible.toLowerCase().includes("lighting"));
  });

  await test("tryParseScenePlan tolerates prose-wrapped JSON", () => {
    const wrapped = `Here is the plan:\n${JSON.stringify(HAPPY_PLAN)}\nEnjoy!`;
    const parsed = tryParseScenePlan(wrapped);
    assert.ok(parsed !== null);
    assert.equal(parsed!.scenes.length, 4);
  });

  /* ── DELIBERATE-FAILURE FIXTURE ──────────────────────────────────────
   * Prove the duration-sum invariant check CATCHES a regression — not
   * just that it runs. We simulate a regressed validator that trusts the
   * model's totalDurationSec instead of recomputing it, feed it a plan
   * whose stated total is wrong, and assert (a) the real validator fixes
   * it, (b) the invariant check goes red on the regressed output. */
  await test("deliberate-failure: regressed sum-validator is caught red", () => {
    const lyingPlan = {
      title: "Liar",
      styleBible: "Continuity.",
      scenes: [
        { visualPrompt: "Scene A", narration: null, durationSec: 8 },
        { visualPrompt: "Scene B", narration: null, durationSec: 8 },
      ],
      // Model claims 10s; real sum is 16s.
      musicMood: undefined,
    };
    const input = makeInput({ tierConstraints: { maxScenes: 4, maxTotalSec: 32 } });
    const bible = buildStyleBible(BRAND, "plumbing", "Continuity.");

    /* (a) The REAL validator recomputes: invariants hold. */
    const real = validateAndClampPlan(lyingPlan as any, input, bible);
    assert.equal(real.ok, true);
    if (real.ok) {
      assertPlanInvariants(real.plan);
      assert.equal(real.plan.totalDurationSec, 16);
    }

    /* (b) REGRESSED validator: skips the recompute and passes the
     * model's total straight through. The invariant check must FAIL. */
    function regressedValidator(): ScenePlan {
      const good = (real as { ok: true; plan: ScenePlan }).plan;
      return { ...good, totalDurationSec: 10 }; // regression: trusts model total
    }
    const regressed = regressedValidator();
    assert.throws(
      () => assertPlanInvariants(regressed),
      /totalDurationSec must equal the sum/,
      "the duration-sum invariant check must catch the regressed validator",
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
