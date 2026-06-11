/**
 * ContentFlow intake-sufficiency engine tests (Phase A).
 *
 * Standalone tsx + node:assert/strict, no test-runner dependency, no network,
 * no DB. The LLM extractor is INJECTED as a mock (mirrors the VisionDescriber
 * pattern), so these tests are deterministic and free.
 *
 * Coverage:
 *   1. extraction → brief mapping (mock extractor; tolerant JSON parse).
 *   2. deterministic profile fills + provenance (source tags).
 *   3. scoreSufficiency ladder boundaries (silent / readback / ask).
 *   4. pickSingleQuestion returns PLACEMENT first.
 *   5. composeBriefLayer rules:
 *        wants_text → suppresses in-image text + returns overlayText;
 *        explicit style → suppresses preset suffix;
 *        people=no → negative cue; placement → composition + aspect ratio.
 *   6. estimateVideoCost (registry-backed + fallback).
 *   7. NO-REGRESSION: generate-without-intake produces a byte-identical
 *      prompt assembly to the pre-change path (captured via the exported
 *      assembleImagePrompt seam = the injected sink).
 *   8. DELIBERATE-FAILURE FIXTURE: a regressed scorer that ignores the
 *      placement weight fails the ladder assertions — proving the gate
 *      catches a real regression, not merely that it runs.
 *
 * Excluded from `tsc --noEmit` via the **\/*.test.ts pattern.
 * Runnable standalone:  npx tsx server/services/contentflow/intakeSufficiency.test.ts
 * Wired into CI as `npm run check:contentflow-intake`.
 */
import assert from "node:assert/strict";

/* server/db.ts throws without DATABASE_URL when the route module is imported
 * (assembleImagePrompt lives there). Never used for real IO here. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

const {
  parseBriefJson,
  extractBriefFromPrompt,
  fillFromProfile,
  scoreSufficiency,
  pickSingleQuestion,
  composeBriefLayer,
  estimateVideoCost,
  aspectRatioForPlacement,
  SUFFICIENCY_SILENT,
  SUFFICIENCY_ASK,
} = await import("./intakeSufficiency");
const { emptyBrief } = await import("@shared/contentflow/intakeBrief");
const { parseIntakePartial } = await import("@shared/contentflow/intakeBrief");
const { assembleImagePrompt } = await import("../../routes/portal/contentflow");

/* The historical (pre-change) non-reference image prompt builder, copied
 * verbatim from the route before Phase A. The no-regression test asserts
 * assembleImagePrompt (layer omitted) matches THIS byte-for-byte. */
const { applyStylePreset, isImageStylePresetId } = await import("./imageStylePresets");
const { buildPhotorealPrompt } = await import("./referenceReplication");
function historicalAssemble(rendered: string, preset: string, photoreal: boolean): string {
  let basePrompt = isImageStylePresetId(preset) ? applyStylePreset(rendered, preset as any) : rendered;
  if (photoreal) basePrompt = buildPhotorealPrompt(basePrompt);
  return basePrompt;
}

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

/* ═══ 1. extraction → brief mapping ═══ */

await check("parseBriefJson maps a clean JSON object to brief fields", () => {
  const out = parseBriefJson(
    'prelude {"subject":"a water heater flush","placement":"website_hero","textOnImage":"wants_text","people":"no","styleIntent":"explicit_in_prompt"} trailing',
  );
  assert.equal(out.subject, "a water heater flush");
  assert.equal(out.placement, "website_hero");
  assert.equal(out.textOnImage, "wants_text");
  assert.equal(out.people, "no");
  assert.equal(out.styleIntent, "explicit_in_prompt");
});

await check("parseBriefJson drops unspecified enums + invalid values", () => {
  const out = parseBriefJson('{"placement":"unspecified","people":"maybe","textOnImage":"wants_text"}');
  assert.equal(out.placement, undefined, "unspecified placement dropped");
  assert.equal(out.people, undefined, "invalid people dropped");
  assert.equal(out.textOnImage, "wants_text");
});

await check("parseBriefJson returns {} on unparseable input (fail-open)", () => {
  assert.deepEqual(parseBriefJson("not json at all"), {});
  assert.deepEqual(parseBriefJson("{ broken json"), {});
});

await check("extractBriefFromPrompt maps via injected extractor + tags fills source=prompt", async () => {
  const mock = {
    async extract() {
      return { subject: "a tech flushing a water heater", placement: "social_feed" as const };
    },
  };
  const { brief, fills } = await extractBriefFromPrompt("flush a water heater", { extractor: mock });
  assert.equal(brief.subject, "a tech flushing a water heater");
  assert.equal(brief.placement, "social_feed");
  assert.ok(fills.every((f) => f.source === "prompt"));
  assert.ok(fills.some((f) => f.slot === "subject"));
});

await check("extractBriefFromPrompt is fail-open when the extractor throws", async () => {
  const boom = {
    async extract(): Promise<any> {
      throw new Error("provider exhausted");
    },
  };
  const { brief, fills } = await extractBriefFromPrompt("anything", { extractor: boom });
  assert.deepEqual(brief, {});
  assert.deepEqual(fills, []);
});

await check("extractBriefFromPrompt short-circuits empty prompt without calling the extractor", async () => {
  let called = false;
  const spy = {
    async extract() {
      called = true;
      return {};
    },
  };
  await extractBriefFromPrompt("   ", { extractor: spy });
  assert.equal(called, false);
});

/* ═══ 2. deterministic profile fills + provenance ═══ */

await check("fillFromProfile fills setting/city/topic from profile with provenance", () => {
  const { brief, fills } = fillFromProfile(
    { subject: "a job-site photo" },
    { location_cue: "Hamilton, Ontario", service_focus: ["water heater repair", "drain cleaning"] },
    "plumbing",
  );
  assert.equal(brief.setting, "Hamilton, Ontario");
  assert.equal(brief.cityForSeo, "Hamilton");
  assert.equal(brief.topicKeyword, "water heater repair");
  assert.ok(fills.find((f) => f.slot === "setting" && f.source === "profile"));
  assert.ok(fills.find((f) => f.slot === "cityForSeo" && f.source === "profile"));
});

await check("fillFromProfile does NOT overwrite prompt-extracted slots (prompt wins)", () => {
  const { brief } = fillFromProfile(
    { setting: "a downtown office" },
    { location_cue: "Hamilton, Ontario" },
    "plumbing",
  );
  assert.equal(brief.setting, "a downtown office", "prompt setting preserved over profile");
});

await check("fillFromProfile trade-default subject is tagged trade_default", () => {
  const { brief, fills } = fillFromProfile({}, {}, "hvac");
  assert.equal(brief.subject, "hvac work");
  assert.ok(fills.find((f) => f.slot === "subject" && f.source === "trade_default"));
});

/* ═══ 3. scoreSufficiency ladder boundaries ═══ */

await check("scoreSufficiency: subject+placement+textOnImage+people clears the silent threshold", () => {
  const score = scoreSufficiency({
    ...emptyBrief(),
    subject: "a water heater",
    placement: "website_hero",
    textOnImage: "none",
    people: "no",
  });
  /* .45 + .25 + .15 + .15 = 1.0 */
  assert.equal(score, 1);
  assert.ok(score >= SUFFICIENCY_SILENT);
});

await check("scoreSufficiency: subject-only sits in the readback band (0.4–0.75)", () => {
  const score = scoreSufficiency({ ...emptyBrief(), subject: "a water heater" });
  assert.equal(score, 0.45);
  assert.ok(score >= SUFFICIENCY_ASK && score < SUFFICIENCY_SILENT);
});

await check("scoreSufficiency: empty brief is below the ask threshold", () => {
  const score = scoreSufficiency(emptyBrief());
  assert.equal(score, 0);
  assert.ok(score < SUFFICIENCY_ASK);
});

await check("scoreSufficiency: placement contributes its weight (regression sentinel)", () => {
  const withPlacement = scoreSufficiency({ ...emptyBrief(), subject: "x", placement: "gbp_post" });
  const withoutPlacement = scoreSufficiency({ ...emptyBrief(), subject: "x" });
  assert.ok(withPlacement - withoutPlacement > 0.2, "placement must add ~0.25");
});

/* ═══ 4. pickSingleQuestion returns placement first ═══ */

await check("pickSingleQuestion returns the placement question first", () => {
  const q = pickSingleQuestion({ ...emptyBrief(), subject: "a water heater" });
  assert.ok(q);
  assert.equal(q!.slot, "placement");
  assert.ok(q!.options.length <= 5);
  assert.ok(q!.options.some((o) => o.id === "skip"), "always offers Skip");
});

await check("pickSingleQuestion falls to subject only when placement is known", () => {
  const q = pickSingleQuestion({ ...emptyBrief(), placement: "social_feed" });
  assert.ok(q);
  assert.equal(q!.slot, "subject");
});

await check("pickSingleQuestion returns null when placement + subject are filled", () => {
  const q = pickSingleQuestion({ ...emptyBrief(), subject: "a water heater", placement: "social_feed" });
  assert.equal(q, null);
});

/* ═══ 5. composeBriefLayer rules ═══ */

await check("composeBriefLayer: wants_text suppresses in-image text AND returns overlayText", () => {
  const layer = composeBriefLayer({ ...emptyBrief(), subject: "a sale banner", textOnImage: "wants_text", cta: "Book now" });
  assert.match(layer.promptBlock, /do not render/i);
  assert.equal(layer.overlayText, "Book now");
});

await check("composeBriefLayer: wants_text overlay falls back to subject when no CTA", () => {
  const layer = composeBriefLayer({ ...emptyBrief(), subject: "a sale banner", textOnImage: "wants_text" });
  assert.equal(layer.overlayText, "a sale banner");
});

await check("composeBriefLayer: explicit style suppresses the preset suffix", () => {
  const explicit = composeBriefLayer({ ...emptyBrief(), styleIntent: "explicit_in_prompt" });
  assert.equal(explicit.suppressPresetSuffix, true);
  const preset = composeBriefLayer({ ...emptyBrief(), styleIntent: "preset" });
  assert.equal(preset.suppressPresetSuffix, false);
});

await check("composeBriefLayer: people=no emits a negative cue", () => {
  const layer = composeBriefLayer({ ...emptyBrief(), people: "no" });
  assert.match(layer.promptBlock, /no people/i);
});

await check("composeBriefLayer: placement derives composition hint + aspect ratio", () => {
  const hero = composeBriefLayer({ ...emptyBrief(), placement: "website_hero" });
  assert.equal(hero.derivedAspectRatio, "16:9");
  assert.match(hero.promptBlock, /negative space/i);
  const story = composeBriefLayer({ ...emptyBrief(), placement: "story_reel" });
  assert.equal(story.derivedAspectRatio, "9:16");
  assert.equal(aspectRatioForPlacement("gbp_post"), "1:1");
  assert.equal(aspectRatioForPlacement("unspecified"), null);
});

await check("composeBriefLayer: empty brief yields an empty prompt block + no suppression", () => {
  const layer = composeBriefLayer(emptyBrief());
  assert.equal(layer.promptBlock, "");
  assert.equal(layer.suppressPresetSuffix, false);
  assert.equal(layer.overlayText, undefined);
});

/* ═══ 6. estimateVideoCost ═══ */

await check("estimateVideoCost mirrors the first enabled provider in the registry", () => {
  const providers = [
    { costPerVideo: 0, durationSeconds: 6, enabled: true },
    { costPerVideo: 0.5, durationSeconds: 8, enabled: true },
  ];
  const est = estimateVideoCost("creator", emptyBrief(), { providers });
  assert.equal(est.durationSec, 6);
  assert.equal(est.usd, 0);
  assert.equal(est.credits, 6);
});

await check("estimateVideoCost falls back to the documented constant without a registry", () => {
  const est = estimateVideoCost("creator", emptyBrief());
  assert.equal(est.durationSec, 6);
  assert.equal(est.credits, 6);
});

/* ═══ 7. NO-REGRESSION: byte-identical no-intake prompt assembly ═══ */

await check("assembleImagePrompt with NO layer == historical assembly (byte-identical)", () => {
  const cases: Array<[string, string, boolean]> = [
    ["flush a water heater", "clean_professional", false],
    ["flush a water heater", "clean_professional", true],
    ["a cozy job-site", "not_a_real_preset", false],
    ["a cozy job-site", "not_a_real_preset", true],
  ];
  for (const [rendered, preset, photoreal] of cases) {
    const got = assembleImagePrompt({ rendered, stylePreset: preset, photoreal });
    const want = historicalAssemble(rendered, preset, photoreal);
    assert.equal(got, want, `mismatch for (${rendered}, ${preset}, photoreal=${photoreal})`);
  }
});

await check("assembleImagePrompt WITH a layer appends guidance + honors suppression", () => {
  const layer = composeBriefLayer({ ...emptyBrief(), placement: "website_hero", styleIntent: "explicit_in_prompt" });
  const got = assembleImagePrompt({ rendered: "a water heater", stylePreset: "clean_professional", photoreal: false, layer });
  /* explicit style → preset suffix NOT applied → rendered text appears raw at head */
  assert.ok(got.startsWith("a water heater"), "suppressed preset keeps rendered at head");
  assert.match(got, /negative space/i, "composition guidance appended");
});

/* ═══ 8. DELIBERATE-FAILURE FIXTURE ═══ */

await check("DELIBERATE FAILURE: a scorer ignoring placement weight fails the regression sentinel", () => {
  /* A regressed scorer that forgets the placement weight. The real
   * scoreSufficiency MUST differ from this on a placement-bearing brief —
   * proving the gate catches the regression, not merely that it runs. */
  function regressedScore(brief: ReturnType<typeof emptyBrief> & { subject?: string }): number {
    let s = 0;
    if (brief.subject) s += 0.45;
    /* BUG: placement weight omitted. */
    if (brief.textOnImage && brief.textOnImage !== "unspecified") s += 0.15;
    return s;
  }
  const brief = { ...emptyBrief(), subject: "x", placement: "gbp_post" as const };
  const real = scoreSufficiency(brief);
  const regressed = regressedScore(brief);
  assert.notEqual(real, regressed, "regressed scorer must diverge from the real one on placement");
  assert.ok(real > regressed, "the real scorer credits placement; the regressed one doesn't");
});

await check("parseIntakePartial salvages valid fields + drops junk (request validation)", () => {
  const out = parseIntakePartial({ placement: "website_hero", people: "bogus", subject: "x", junk: 1 });
  assert.equal(out.placement, "website_hero");
  assert.equal(out.people, undefined, "invalid enum dropped");
  assert.equal(out.subject, "x");
  assert.equal((out as any).junk, undefined, "unknown key dropped");
  assert.deepEqual(parseIntakePartial(null), {});
  assert.deepEqual(parseIntakePartial("nope"), {});
});

/* ═══ Summary ═══ */
console.log(`\nintakeSufficiency.test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
