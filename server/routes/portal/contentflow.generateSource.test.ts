/**
 * ContentFlow generate-source tests — generation is NOT template-bound.
 *
 * Phase 3 audit (2026-06-11): POST /api/portal/contentflow/generate used to
 * 404 anything without a LIBRARY templateId, so prompts saved via
 * POST /custom-prompts could be listed/deleted but never actually drive a
 * generation. resolveGeneratePromptSource() un-binds it: the route accepts
 * exactly one of { templateId, customPromptId, free-form rendered } and
 * normalizes each into the single shape the pipeline consumes. Free-form
 * prompts (rendered text with no template / saved prompt) are moderated
 * via moderatePromptText; reference-only requests may resolve to an EMPTY
 * free source via allowEmptyRendered (the prompt is vision-derived).
 *
 * These tests drive the REAL exported helper with an injected saved-prompt
 * loader (no express, no DB):
 *
 *   1. Template path is byte-compatible with the old behavior (unknown id
 *      404s, rendered required, 8k cap).
 *   2. Custom path resolves the SESSION client's saved prompt; rendered +
 *      tokens default from the saved prompt; body overrides win; provenance
 *      (customPromptId + baseTemplateId) is carried.
 *   3. Free-form path: rendered-only resolves kind=free; moderation
 *      (empty / denylist / 8k cap) rejects with 400 invalid_prompt;
 *      allowEmptyRendered admits a reference-only request.
 *   4. Exactly-one-source contract (none of the three → 400, template +
 *      custom → 400, explicit free-form + template/custom → 400).
 *   5. DELIBERATE-FAILURE FIXTURE: a re-implementation of the OLD
 *      template-bound resolver fails the custom-prompt AND free-form
 *      expectations — proving this gate catches the regression, not merely
 *      that it runs.
 *   6. SOURCE CONTRACT: the /generate route in contentflow.ts must go
 *      through resolveGeneratePromptSource (no bypass back to a raw
 *      getPromptTemplate-only check).
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Runnable standalone:
 *
 *   npx tsx server/routes/portal/contentflow.generateSource.test.ts
 *
 * Wired into CI as `npm run check:contentflow-generate-source`.
 * Uses node:assert/strict, no test-runner dependency. No network, no DB —
 * the saved-prompt loader is injected and never touches storage.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* Module-load prerequisites (same pattern as catalog.test.ts):
 * server/db.ts throws without a DATABASE_URL. Never used for real IO here. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

const { resolveGeneratePromptSource } = await import("./contentflow");
const { filterPromptTemplates, getPromptTemplate } = await import("@shared/contentflow/promptLibrary");

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

/* ═══ Fixtures ═══ */

const libraryTemplate = filterPromptTemplates({})[0];
assert.ok(libraryTemplate, "prompt library must expose at least one template");

const SAVED = {
  id: "cf_custom_171_abc123",
  baseTemplateId: libraryTemplate.id,
  title: "My winter furnace promo",
  rendered: "Photo of a technician tuning a furnace in a snowy driveway, warm lighting",
  tokens: [{ placeholder: "{season}", selected: "winter", alternatives: ["fall"] }],
  savedAt: "2026-06-11T00:00:00.000Z",
};
const SAVED_ORPHAN = {
  ...SAVED,
  id: "cf_custom_171_orphan",
  baseTemplateId: "tmpl_deleted_from_library",
  title: "Orphaned base template",
};
const loadSaved = async () => [SAVED, SAVED_ORPHAN] as any[];
const loadNone = async () => [] as any[];

/* ═══ 1. Template path — unchanged legacy behavior ═══ */

await check("template path: valid library template resolves with body rendered/tokens", async () => {
  const r = await resolveGeneratePromptSource({
    templateId: libraryTemplate.id,
    rendered: "a rendered prompt",
    tokens: [{ placeholder: "{x}", selected: "y" }],
    loadCustomPrompts: loadNone,
  });
  assert.ok(r.ok, "expected ok");
  assert.equal(r.source.kind, "template");
  assert.equal(r.source.templateId, libraryTemplate.id);
  assert.equal(r.source.customPromptId, null);
  assert.equal(r.source.title, libraryTemplate.title);
  assert.equal(r.source.rendered, "a rendered prompt");
  assert.equal((r.source.tokens as any[]).length, 1);
});

await check("template path: unknown templateId → 404 prompt_not_found", async () => {
  const r = await resolveGeneratePromptSource({
    templateId: "tmpl_does_not_exist",
    rendered: "x",
    loadCustomPrompts: loadNone,
  });
  assert.ok(!r.ok && r.status === 404 && r.code === "prompt_not_found");
});

await check("template path: missing rendered → 400 missing_rendered", async () => {
  const r = await resolveGeneratePromptSource({
    templateId: libraryTemplate.id,
    rendered: "   ",
    loadCustomPrompts: loadNone,
  });
  assert.ok(!r.ok && r.status === 400 && r.code === "missing_rendered");
});

await check("template path: >8000 chars → 400 prompt_too_long", async () => {
  const r = await resolveGeneratePromptSource({
    templateId: libraryTemplate.id,
    rendered: "x".repeat(8_001),
    loadCustomPrompts: loadNone,
  });
  assert.ok(!r.ok && r.status === 400 && r.code === "prompt_too_long");
});

/* ═══ 2. Custom path — saved prompts drive generation ═══ */

await check("custom path: saved prompt resolves; rendered+tokens default from saved", async () => {
  const r = await resolveGeneratePromptSource({
    customPromptId: SAVED.id,
    loadCustomPrompts: loadSaved,
  });
  assert.ok(r.ok, `expected ok, got ${!r.ok ? r.code : ""}`);
  assert.equal(r.source.kind, "custom");
  assert.equal(r.source.customPromptId, SAVED.id);
  assert.equal(r.source.templateId, SAVED.baseTemplateId);
  assert.equal(r.source.title, SAVED.title);
  assert.equal(r.source.rendered, SAVED.rendered);
  assert.deepEqual(r.source.tokens, SAVED.tokens);
  /* base-template metadata enrichment */
  const base = getPromptTemplate(SAVED.baseTemplateId)!;
  assert.equal(r.source.patternId, base.patternId);
});

await check("custom path: body rendered override wins over saved rendered", async () => {
  const r = await resolveGeneratePromptSource({
    customPromptId: SAVED.id,
    rendered: "tweaked just before generating",
    loadCustomPrompts: loadSaved,
  });
  assert.ok(r.ok);
  assert.equal(r.source.rendered, "tweaked just before generating");
});

await check("custom path: base template deleted from library is NOT a 404 (metadata nulls)", async () => {
  const r = await resolveGeneratePromptSource({
    customPromptId: SAVED_ORPHAN.id,
    loadCustomPrompts: loadSaved,
  });
  assert.ok(r.ok, "orphaned base template must still generate");
  assert.equal(r.source.patternId, null);
  assert.equal(r.source.templateId, SAVED_ORPHAN.baseTemplateId);
});

await check("custom path: unknown id in the caller's list → 404 custom_prompt_not_found", async () => {
  const r = await resolveGeneratePromptSource({
    customPromptId: "cf_custom_someone_elses",
    loadCustomPrompts: loadSaved,
  });
  assert.ok(!r.ok && r.status === 404 && r.code === "custom_prompt_not_found");
});

await check("custom path: saved >8000 chars rendered → 400 prompt_too_long", async () => {
  const fat = async () => [{ ...SAVED, rendered: "x".repeat(8_001) }] as any[];
  const r = await resolveGeneratePromptSource({
    customPromptId: SAVED.id,
    loadCustomPrompts: fat,
  });
  assert.ok(!r.ok && r.status === 400 && r.code === "prompt_too_long");
});

/* ═══ 3. Free-form path — rendered text with no template / saved prompt ═══ */

await check("free-form: rendered-only resolves kind=free with null template provenance", async () => {
  const r = await resolveGeneratePromptSource({
    rendered: "  A plumber's van parked outside a brick house at golden hour  ",
    loadCustomPrompts: loadNone,
  });
  assert.ok(r.ok, `expected ok, got ${!r.ok ? r.code : ""}`);
  assert.equal(r.source.kind, "free");
  assert.equal(r.source.templateId, null);
  assert.equal(r.source.customPromptId, null);
  assert.equal(r.source.title, "Custom prompt");
  assert.equal(r.source.patternId, null);
  assert.equal(r.source.rendered, "A plumber's van parked outside a brick house at golden hour");
});

await check("free-form: explicit freeForm:true + rendered resolves kind=free", async () => {
  const r = await resolveGeneratePromptSource({
    freeForm: true,
    rendered: "minimalist flat-lay of HVAC tools on a workbench",
    loadCustomPrompts: loadNone,
  });
  assert.ok(r.ok && r.source.kind === "free");
});

await check("free-form: moderation rejects >8000 chars → 400 invalid_prompt", async () => {
  const r = await resolveGeneratePromptSource({
    rendered: "x".repeat(8_001),
    loadCustomPrompts: loadNone,
  });
  assert.ok(!r.ok && r.status === 400 && r.code === "invalid_prompt");
});

await check("free-form: moderation denylist hit → 400 invalid_prompt", async () => {
  const r = await resolveGeneratePromptSource({
    rendered: "anything involving csam content",
    loadCustomPrompts: loadNone,
  });
  assert.ok(!r.ok && r.status === 400 && r.code === "invalid_prompt");
});

await check("free-form: allowEmptyRendered (reference-only request) → empty free source", async () => {
  const r = await resolveGeneratePromptSource({
    allowEmptyRendered: true,
    loadCustomPrompts: loadNone,
  });
  assert.ok(r.ok, "reference-only request must resolve");
  assert.equal(r.source.kind, "free");
  assert.equal(r.source.rendered, "");
});

/* ═══ 4. Exactly-one-source contract ═══ */

await check("none of templateId/customPromptId/rendered → 400 missing_template_id", async () => {
  const r = await resolveGeneratePromptSource({ loadCustomPrompts: loadNone });
  assert.ok(!r.ok && r.status === 400 && r.code === "missing_template_id");
});

await check("both templateId and customPromptId → 400 ambiguous_prompt_source", async () => {
  const r = await resolveGeneratePromptSource({
    templateId: libraryTemplate.id,
    customPromptId: SAVED.id,
    rendered: "x",
    loadCustomPrompts: loadSaved,
  });
  assert.ok(!r.ok && r.status === 400 && r.code === "ambiguous_prompt_source");
});

await check("explicit free-form + templateId + rendered → 400 ambiguous_prompt_source", async () => {
  /* templateId + rendered alone is the legacy template request (rendered is
   * the client-rendered template text) and must keep working — so the
   * template/free ambiguity is expressed via the explicit freeForm marker:
   * declaring free-form while ALSO addressing a template is two sources. */
  const r = await resolveGeneratePromptSource({
    freeForm: true,
    templateId: libraryTemplate.id,
    rendered: "x",
    loadCustomPrompts: loadNone,
  });
  assert.ok(!r.ok && r.status === 400 && r.code === "ambiguous_prompt_source");
});

await check("explicit free-form + customPromptId → 400 ambiguous_prompt_source", async () => {
  const r = await resolveGeneratePromptSource({
    freeForm: true,
    customPromptId: SAVED.id,
    rendered: "x",
    loadCustomPrompts: loadSaved,
  });
  assert.ok(!r.ok && r.status === 400 && r.code === "ambiguous_prompt_source");
});

await check("templateId + rendered stays the legacy TEMPLATE source (not free-form)", async () => {
  const r = await resolveGeneratePromptSource({
    templateId: libraryTemplate.id,
    rendered: "rendered template text",
    loadCustomPrompts: loadNone,
  });
  assert.ok(r.ok && r.source.kind === "template", "templateId+rendered must remain the template path");
});

/* ═══ 5. Deliberate-failure fixture — the OLD template-bound resolver ═══
 *
 * Re-implements the pre-fix validation (templateId required, library
 * lookup 404s everything else, customPromptId ignored) and proves the
 * custom-path expectations above FAIL against it. If someone reverts the
 * route to template-bound behavior, this is the regression the suite
 * would catch — demonstrated here against a live re-implementation. */

async function oldTemplateBoundResolver(input: {
  templateId?: unknown;
  customPromptId?: unknown;
  rendered?: unknown;
  loadCustomPrompts: () => Promise<any[]>;
}): Promise<any> {
  const { templateId, rendered } = input; // customPromptId ignored — the bug
  if (!templateId || typeof templateId !== "string") {
    return { ok: false, status: 400, code: "missing_template_id" };
  }
  const tmpl = getPromptTemplate(templateId);
  if (!tmpl) return { ok: false, status: 404, code: "prompt_not_found" };
  if (!rendered || typeof rendered !== "string" || !rendered.trim()) {
    return { ok: false, status: 400, code: "missing_rendered" };
  }
  return { ok: true, source: { kind: "template", templateId, customPromptId: null } };
}

await check("deliberate-failure fixture: old template-bound resolver rejects a valid saved prompt", async () => {
  const r = await oldTemplateBoundResolver({
    customPromptId: SAVED.id,
    loadCustomPrompts: loadSaved,
  });
  /* The OLD behavior bounces the exact request the new path accepts —
   * proving the custom-path assertions are a real gate. */
  assert.ok(!r.ok, "old resolver must reject customPromptId-only input");
  const fixed = await resolveGeneratePromptSource({
    customPromptId: SAVED.id,
    loadCustomPrompts: loadSaved,
  });
  assert.ok(fixed.ok, "new resolver must accept the same input");
});

await check("deliberate-failure fixture: old template-bound resolver rejects a free-form prompt", async () => {
  const input = { rendered: "a free-form prompt with no template", loadCustomPrompts: loadNone };
  const r = await oldTemplateBoundResolver(input);
  assert.ok(!r.ok, "old resolver must reject rendered-only input");
  const fixed = await resolveGeneratePromptSource(input);
  assert.ok(fixed.ok && fixed.source.kind === "free", "new resolver must accept the same input as free-form");
});

/* ═══ 6. Source contract — the route goes through the helper ═══ */

await check("source contract: /generate route calls resolveGeneratePromptSource", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "contentflow.ts"), "utf8");
  const routeStart = src.indexOf('app.post("/api/portal/contentflow/generate"');
  assert.ok(routeStart > -1, "generate route not found");
  /* Window: from route registration to the next route registration. */
  const handler = src.slice(routeStart, src.indexOf("app.get(", routeStart + 10));
  assert.ok(
    handler.includes("resolveGeneratePromptSource("),
    "generate handler must resolve its prompt source via resolveGeneratePromptSource()",
  );
  assert.ok(
    handler.includes("customPromptId"),
    "generate handler must accept customPromptId",
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
