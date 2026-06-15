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

  /* ─────────────────────────────────────────────────────────────────────────
   * INTEGRATION SEAM — resolveTradeAndCategory()
   *
   * The pieces above were unit-tested but the FULL /generate flow wasn't: a live
   * "Access Air" audit was reported to return categoryLabel:null even though
   * primaryType fetched "shipping_service" and the cascade resolved it in
   * isolation. This guards the exact route seam — detectTrade() deciding
   * "general" → the isGeneralTrade gate → resolveCategoryLabelCascade()
   * threading the enriched primaryType/displayName/types into a real category —
   * so the full-flow wiring can't regress.
   * ───────────────────────────────────────────────────────────────────────── */
  const { resolveTradeAndCategory, detectTrade } = await import("./auditRoutes");
  {
    // THE REGRESSION CASE. Access Air: Google files it as "shipping_service"
    // (not a trade → detectTrade returns "general"), so the route MUST run the
    // cascade and layer 1 MUST yield the display name "Shipping Service".
    // Pre-flight: confirm primaryType genuinely is NOT a trade, else the cascade
    // would never run and this would be a false pass.
    assert.equal(
      detectTrade("Access Air", ["shipping_service", "transportation_service", "establishment"], "shipping_service"),
      "general",
      "shipping_service must resolve to 'general' so the cascade actually runs",
    );
    let called = 0;
    const chatFn = async () => { called++; return JSON.stringify({ niche: "x", confidence: 1 }); };
    const r = await resolveTradeAndCategory({
      businessName: "Access Air",
      types: ["shipping_service", "transportation_service", "service", "point_of_interest", "establishment"],
      primaryType: "shipping_service",
      primaryTypeDisplayName: "Shipping Service",
      placeId: "p-access-air",
      website: "http://www.accessair.ca/",
      chatFn,
    });
    assert.equal(r.trade, "general", "Access Air is a non-trade business");
    assert.equal(r.nicheLayer, "primaryType", "layer 1 (Google display name) resolves it");
    assert.equal(r.categoryLabel, "Shipping Service", "FULL-FLOW seam yields the real category, NOT null/empty");
    assert.notEqual(r.categoryLabel, "", "categoryLabel must never be empty for Access Air");
    assert.notEqual(r.categoryLabel.toLowerCase(), "general", "never the literal 'general'");
    assert.equal(called, 0, "COST GUARD: layer 1 resolved → no LLM call");
  }
  {
    // Real trade short-circuits: detectTrade finds "plumber" → no cascade.
    let called = 0;
    const chatFn = async () => { called++; return ""; };
    const r = await resolveTradeAndCategory({
      businessName: "Bob's Plumbing", types: ["plumber"], primaryType: "plumber",
      placeId: "p-bob", chatFn,
    });
    assert.equal(r.trade, "plumbing", "real trade detected (plumber → plumbing via TYPE_TRADE_MAP)");
    assert.equal(r.categoryLabel, "plumbing", "real trade passes through as its own label");
    assert.equal(r.nicheLayer, "none", "real trade never enters the cascade");
    assert.equal(called, 0, "real trade → no LLM call");
  }
  {
    // Name-less non-trade with no Google category + no website → seam reaches
    // layer 3 (LLM) and threads its result through to categoryLabel.
    let called = 0;
    const chatFn = async () => { called++; return JSON.stringify({ niche: "managed IT services", confidence: 0.9 }); };
    const r = await resolveTradeAndCategory({
      businessName: "Northwind Solutions Inc", types: ["establishment", "point_of_interest"],
      primaryType: "establishment", placeId: "p-northwind", website: null, chatFn,
    });
    assert.equal(r.trade, "general");
    assert.equal(r.nicheLayer, "llm", "layers 1 & 2 miss → LLM layer 3 resolves it");
    assert.equal(r.categoryLabel, "managed IT services", "LLM result threads through to categoryLabel");
    assert.equal(called, 1, "layer 3 (only paid layer) ran once");
  }
  {
    // tradeOverride from the frontend wins over detection and skips the cascade.
    let called = 0;
    const chatFn = async () => { called++; return ""; };
    const r = await resolveTradeAndCategory({
      businessName: "Access Air", types: ["shipping_service"], primaryType: "shipping_service",
      primaryTypeDisplayName: "Shipping Service", tradeOverride: "electrician", chatFn,
    });
    assert.equal(r.trade, "electrician", "user override wins");
    assert.equal(r.categoryLabel, "electrician", "override passes through as the label");
    assert.equal(called, 0, "override → no cascade, no LLM call");
  }

  console.log("auditRoutes.niche-cascade.test.ts — all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
  console.error(err);
  process.exit(1);
});
