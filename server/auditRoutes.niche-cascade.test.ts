/**
 * Niche-recognition cascade tests (feat/audit-niche-recognition).
 *
 * Layer 1 (Google Places primaryType/display) ships in #1839 via
 * deriveCategoryLabel(). This guards layers 2 & 3 + the cascade orchestration so
 * a name-less business ("Mike's Solutions Inc") whose Google category is ALSO
 * generic/absent still resolves a REAL niche → real competitors + keywords,
 * WITHOUT ever fabricating one or reintroducing the literal "general".
 *
 *   Layer 2  — inferNicheFromWebsiteText(): cheap, no LLM, from title/meta/H1.
 *   Layer 3  — classifyNicheWithLLM(): Haiku via injectable chat(); honest-null.
 *   Cascade  — resolveCategoryLabelCascade(): 1 → 2 → 3 → "" with a structural
 *              cost guard (layer 3 fires ONLY when 1 & 2 both missed).
 *
 * Runnable standalone:  npx tsx server/auditRoutes.niche-cascade.test.ts
 * Wired into CI as `npm run check:audit-niche`.
 *
 * DB-free: auditRoutes.ts transitively imports server/db, which throws at
 * module-eval when DATABASE_URL is unset. Set a dummy URL FIRST, THEN import.
 * The functions under test never open a DB connection and chat() is injected.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Uses node:assert/strict, no test-runner dependency.
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://audit:audit@127.0.0.1:1/audit_no_connect";
}
process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "test-key-not-used";

function siteText(over: Partial<{ title: string; metaDescription: string; headings: string; bodySnippet: string; ok: boolean }> = {}) {
  return {
    ok: over.ok ?? true,
    title: over.title ?? "",
    metaDescription: over.metaDescription ?? "",
    headings: over.headings ?? "",
    bodySnippet: over.bodySnippet ?? "",
  };
}

async function main() {
  const {
    inferNicheFromWebsiteText,
    classifyNicheWithLLM,
    resolveCategoryLabelCascade,
    isGeneralTrade,
  } = await import("./auditRoutes");

  /* ─────────────────────────────────────────────────────────────────────────
   * LAYER 2 — website-text inference
   * ───────────────────────────────────────────────────────────────────────── */
  {
    // Title alone is enough.
    const n = inferNicheFromWebsiteText(siteText({ title: "Commercial Plumbing & Drain Services" }));
    assert.equal(n, "commercial plumbing", "layer-2 infers 'commercial plumbing' from a website title");
  }
  {
    // Non-trade local-business category from a website title.
    const n = inferNicheFromWebsiteText(siteText({ title: "AcmeCo — Global Freight Forwarding & Customs" }));
    assert.equal(n, "freight forwarding", "layer-2 infers a non-trade niche (freight forwarding)");
  }
  {
    // Niche found in body text when the title is a bare brand name.
    const n = inferNicheFromWebsiteText(siteText({
      title: "Mike's Solutions Inc",
      headings: "Trusted local experts",
      bodySnippet: "We are a full-service auto repair and collision repair shop serving the area for 20 years.",
    }));
    assert.equal(n, "auto repair", "layer-2 falls through to body text for a bare-brand title");
  }
  {
    // ok:false (fetch blocked) → empty, never a guess.
    assert.equal(inferNicheFromWebsiteText(siteText({ ok: false, title: "Plumbing Co" })), "",
      "layer-2 returns '' when website wasn't fetched (ok:false)");
  }
  {
    // Genuinely unclassifiable text → empty (no fabrication, never 'general').
    const n = inferNicheFromWebsiteText(siteText({ title: "Welcome", bodySnippet: "Home About Contact us today." }));
    assert.equal(n, "", "layer-2 returns '' for unclassifiable text");
    assert.equal(isGeneralTrade(n), true, "empty layer-2 result counts as general/suppressed");
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * LAYER 3 — LLM classifier (injectable chat())
   * ───────────────────────────────────────────────────────────────────────── */
  {
    let called = 0;
    const chatFn = async (_opts: any) => { called++; return JSON.stringify({ niche: "personal injury law firm", confidence: 0.92 }); };
    const niche = await classifyNicheWithLLM({
      businessName: "Smith & Associates", placeId: "p-l3-1", chatFn,
      site: siteText({ ok: false }),
    });
    assert.equal(niche, "personal injury law firm", "layer-3 returns the model's confident niche");
    assert.equal(called, 1, "layer-3 calls chat() once");
  }
  {
    // Model honest-null → empty (no fabrication).
    const chatFn = async () => JSON.stringify({ niche: null, confidence: 0 });
    const niche = await classifyNicheWithLLM({ businessName: "Vague Holdings", placeId: "p-l3-2", chatFn });
    assert.equal(niche, "", "layer-3 returns '' when model says null");
  }
  {
    // Low confidence → suppressed.
    const chatFn = async () => JSON.stringify({ niche: "consulting", confidence: 0.2 });
    const niche = await classifyNicheWithLLM({ businessName: "Acme", placeId: "p-l3-3", chatFn, minConfidence: 0.6 });
    assert.equal(niche, "", "layer-3 suppresses a below-threshold niche");
  }
  {
    // Model returns 'general' → treated as unclassifiable.
    const chatFn = async () => JSON.stringify({ niche: "general", confidence: 0.99 });
    const niche = await classifyNicheWithLLM({ businessName: "Whatever", placeId: "p-l3-4", chatFn });
    assert.equal(niche, "", "layer-3 never accepts the literal 'general'");
  }
  {
    // chat() throws → suppressed, no fabrication, no rethrow.
    const chatFn = async () => { throw new Error("provider down"); };
    const niche = await classifyNicheWithLLM({ businessName: "Acme", placeId: "p-l3-5", chatFn });
    assert.equal(niche, "", "layer-3 suppresses on chat() error");
  }
  {
    // Cache: second call with same placeId does NOT re-invoke chat().
    let called = 0;
    const chatFn = async () => { called++; return JSON.stringify({ niche: "auto repair", confidence: 0.9 }); };
    const a = await classifyNicheWithLLM({ businessName: "Cached Co", placeId: "p-cache", chatFn });
    const b = await classifyNicheWithLLM({ businessName: "Cached Co", placeId: "p-cache", chatFn });
    assert.equal(a, "auto repair");
    assert.equal(b, "auto repair");
    assert.equal(called, 1, "layer-3 caches by placeId (one chat() call for two resolves)");
  }
  {
    // Chatty model (prose around JSON) still parses.
    const chatFn = async () => "Sure! Here is the classification:\n{\"niche\":\"managed IT services\",\"confidence\":0.8}\nHope that helps.";
    const niche = await classifyNicheWithLLM({ businessName: "TechBros", placeId: "p-l3-6", chatFn });
    assert.equal(niche, "managed IT services", "layer-3 tolerates prose-wrapped JSON");
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * CASCADE — order + cost guard
   * ───────────────────────────────────────────────────────────────────────── */
  {
    // Layer 1 wins → chat() NEVER called.
    let called = 0;
    const chatFn = async () => { called++; return JSON.stringify({ niche: "x", confidence: 1 }); };
    const r = await resolveCategoryLabelCascade({
      businessName: "Acme", types: [], primaryTypeDisplayName: "Freight Forwarding Service",
      site: siteText({ ok: false }), chatFn,
    });
    assert.equal(r.layer, "primaryType", "cascade uses layer 1 when Places has a display name");
    assert.equal(r.categoryLabel, "Freight Forwarding Service");
    assert.equal(called, 0, "COST GUARD: layer 1 resolved → no LLM call");
  }
  {
    // Layer 1 misses, layer 2 wins → chat() NEVER called.
    let called = 0;
    const chatFn = async () => { called++; return JSON.stringify({ niche: "x", confidence: 1 }); };
    const r = await resolveCategoryLabelCascade({
      businessName: "Mike's Solutions Inc", types: ["establishment", "point_of_interest"],
      site: siteText({ title: "Mike's — Residential & Commercial Plumbing" }), chatFn,
    });
    assert.equal(r.layer, "website", "cascade falls to layer 2 when Places is generic");
    assert.equal(r.categoryLabel, "commercial plumbing");
    assert.equal(called, 0, "COST GUARD: layer 2 resolved → no LLM call");
  }
  {
    // Layers 1 & 2 miss, layer 3 wins → chat() called exactly once.
    let called = 0;
    const chatFn = async () => { called++; return JSON.stringify({ niche: "personal injury law firm", confidence: 0.9 }); };
    const r = await resolveCategoryLabelCascade({
      businessName: "Mike's Solutions Inc", types: ["establishment"], placeId: "p-cascade-l3",
      site: siteText({ title: "Mike's Solutions Inc", bodySnippet: "Welcome. Home About Contact." }), chatFn,
    });
    assert.equal(r.layer, "llm", "cascade falls to layer 3 when 1 & 2 both miss");
    assert.equal(r.categoryLabel, "personal injury law firm");
    assert.equal(called, 1, "layer 3 is the only paid layer and runs once");
  }
  {
    // All layers miss → honest suppression ("", layer 'none'), never 'general'.
    const chatFn = async () => JSON.stringify({ niche: null, confidence: 0 });
    const r = await resolveCategoryLabelCascade({
      businessName: "ZZZ Inc", types: ["establishment"], placeId: "p-cascade-none",
      site: siteText({ title: "ZZZ Inc", bodySnippet: "Home About Contact." }), chatFn,
    });
    assert.equal(r.categoryLabel, "", "all layers miss → honest suppression");
    assert.equal(r.layer, "none");
    assert.notEqual(r.categoryLabel.toLowerCase(), "general", "never the literal 'general'");
  }
  {
    // Real-trade short-circuit happens in the route (isGeneralTrade gate), but the
    // cascade itself still honors layer 1 for a clear Places type.
    const r = await resolveCategoryLabelCascade({
      businessName: "Bob's Plumbing", types: ["plumber"], primaryType: "plumber",
    });
    assert.equal(r.layer, "primaryType", "clear Places type resolves at layer 1");
    assert.ok(r.categoryLabel.length > 0, "layer 1 yields a non-empty label");
  }

  console.log("auditRoutes.niche-cascade.test.ts — all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
