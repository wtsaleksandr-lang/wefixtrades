/**
 * Non-trade / "general" business audit correctness tests
 * (fix/audit-trade-generalization).
 *
 * The free-audit's detectTrade() returns the literal "general" for any business
 * that isn't a recognized trade (freight forwarder, logistics co, accountant…).
 * Feeding "general" downstream poisoned three customer-facing things:
 *
 *   (a) the competitor search ran `"general near <city>"` (junk competitors);
 *   (b) the revenue figure fabricated a $ band from a $250 default ticket;
 *   (c) the prose said "your last 20 happy general customers".
 *
 * This guards the generalization fix: for a general business we (a) search the
 * REAL Google Places category (or suppress competitors entirely), (b) return
 * isReal:false instead of a fabricated $, (c) use a generic noun + never the
 * word "general" as a customer descriptor, and we expose a `leadNoun`.
 *
 * Runnable standalone:  npx tsx server/auditRoutes.audit-general.test.ts
 * Wired into CI as `npm run check:audit-general`.
 *
 * DB-free: auditRoutes.ts transitively imports server/db, which throws at
 * module-eval when DATABASE_URL is unset. We set a dummy URL FIRST (mirror of
 * auditScoring.test.ts), THEN dynamically import. The functions under test never
 * open a DB connection. `globalThis.fetch` is stubbed for the Places case so no
 * real network call is made.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Uses node:assert/strict, no test-runner dependency.
 */
import assert from "node:assert/strict";

// Must run before importing auditRoutes (which pulls server/db) AND before
// competitorSearch fetches (GOOGLE_MAPS_API_KEY must be set so it doesn't throw).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://audit:audit@127.0.0.1:1/audit_no_connect";
}
process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "test-key-not-used";

/** Recursively collect every string value in an object/array. */
function allStrings(v: any, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) allStrings(x, out);
  else if (v && typeof v === "object") for (const k of Object.keys(v)) allStrings(v[k], out);
  return out;
}

/** Word-boundary check: does any string use "general" as a standalone word? */
function hasStandaloneGeneral(strings: string[]): string | null {
  const re = /\bgeneral\b/i;
  for (const s of strings) if (re.test(s)) return s;
  return null;
}

async function main() {
  const {
    isGeneralTrade,
    deriveCategoryLabel,
    leadNounForTrade,
    deriveRevenueLoss,
    buildTemplatedNarrative,
    calculateDemandGaps,
  } = await import("./auditRoutes");
  const { fetchCompetitors, fetchPlacesCompetitors } = await import("./services/competitorSearch");

  /* ─── helpers behave as documented ─── */
  {
    assert.equal(isGeneralTrade("general"), true, "'general' is a general trade");
    assert.equal(isGeneralTrade(""), true, "empty trade is general");
    assert.equal(isGeneralTrade(null), true, "null trade is general");
    assert.equal(isGeneralTrade("plumbing"), false, "a real trade is not general");

    // Derives a human category from Places primaryType / types — never "general".
    assert.equal(
      deriveCategoryLabel("Acme Freight Co", ["freight_forwarding_service", "point_of_interest"], null),
      "freight forwarding service",
      "derives label from the first non-generic Places type",
    );
    assert.equal(
      deriveCategoryLabel("Acme Co", ["establishment"], "logistics_service"),
      "logistics service",
      "prefers a specific primaryType",
    );
    // Generic-only types → "" (truly unknown), NOT "general".
    assert.equal(
      deriveCategoryLabel("Mystery LLC", ["establishment", "point_of_interest"], "establishment"),
      "",
      "generic-only types yield empty (unknown), not 'general'",
    );
    assert.notEqual(
      deriveCategoryLabel("X", ["freight_forwarding_service"], null).toLowerCase(),
      "general",
      "deriveCategoryLabel never returns 'general'",
    );
  }

  /* ─── (c) leadNoun is the generic noun for general, trade-noun for trades ─── */
  {
    assert.equal(leadNounForTrade("general"), "new enquiries", "general → 'new enquiries'");
    assert.equal(leadNounForTrade(""), "new enquiries", "empty → 'new enquiries'");
    assert.equal(leadNounForTrade("plumbing"), "service calls", "plumbing → trade noun");
    assert.ok(!/\bgeneral\b/i.test(leadNounForTrade("general")), "leadNoun never contains 'general'");
  }

  /* ─── (b) revenue-loss isReal:false for a general business (no fabricated $) ─── */
  {
    // A general business with the SAME capture gaps that would produce a floor
    // band for a real trade must NOT get a dollar figure.
    const captureGaps = ["no-after-hours", "low-visibility", "not-in-maps-pack"];

    const generalLoss = deriveRevenueLoss("general", captureGaps, null);
    assert.equal(generalLoss.isReal, false, "general business → isReal:false (no fabricated $)");
    assert.equal(generalLoss.low, 0, "general business → $low is 0");
    assert.equal(generalLoss.high, 0, "general business → $high is 0");
    assert.equal(generalLoss.monthlyMissedLeads, 0, "general business → 0 missed leads (honest)");

    // Even a measured demand-gap loss (computed off the $250 default for general)
    // must be discarded for general businesses.
    const generalWithMeasured = deriveRevenueLoss(
      "general",
      captureGaps,
      { low: 400, high: 600, monthlyMissedLeads: 7 },
    );
    assert.equal(
      generalWithMeasured.isReal,
      false,
      "general business with a $250-default-derived measured loss is still suppressed",
    );

    // A REAL trade keeps its honest floor figure (proves we didn't break trades).
    const realLoss = deriveRevenueLoss("plumbing", captureGaps, null);
    assert.equal(realLoss.isReal, true, "real trade keeps a defensible $ figure");
    assert.ok(realLoss.high > 0, "real trade has a positive $ band");
  }

  /* ─── (d) templated prose for a general business contains NO standalone 'general' ─── */
  {
    const narrative = buildTemplatedNarrative({
      businessName: "Acme Freight Co",
      trade: "general",
      categoryLabel: "freight forwarding service",
      city: "Toronto",
      scores: { grade: "C", total: 62, googleMaps: { score: 10 } },
      reviewsCount: 8,
      rating: 4.1,
      hasWebsite: false,
      mobileScore: null,
      marketLeader: { name: "Best Freight", reviewsCount: 120 },
      detectedIssues: ["low-reviews", "bad-rating", "no-website", "low-visibility", "not-in-maps-pack"],
      recommendedServices: [{ name: "Local SEO" }],
      estimatedRevenueLoss: null, // isReal:false → no $ in prose
    });
    const strings = allStrings(narrative);
    const leak = hasStandaloneGeneral(strings);
    assert.equal(
      leak,
      null,
      `templated narrative for a general business must never use 'general' as a descriptor — leaked in: ${leak}`,
    );
    // Sanity: it DID say "customers" (the generalized phrasing), proving the
    // qualifier was actually applied rather than the whole sentence dropped.
    assert.ok(
      strings.some((s) => /customers/i.test(s)),
      "generalized prose still references 'customers'",
    );

    // Control: a REAL trade still interpolates its trade word (didn't over-strip).
    const realNarrative = buildTemplatedNarrative({
      businessName: "Joe's Plumbing",
      trade: "plumbing",
      categoryLabel: "plumbing",
      city: "Toronto",
      scores: { grade: "C", total: 60 },
      reviewsCount: 5,
      rating: 4.0,
      hasWebsite: false,
      mobileScore: null,
      marketLeader: null,
      detectedIssues: ["low-reviews"],
      recommendedServices: [],
      estimatedRevenueLoss: null,
    });
    assert.ok(
      allStrings(realNarrative).some((s) => /plumbing customers/i.test(s)),
      "a real trade still gets its trade-qualified customer phrasing",
    );
  }

  /* ─── (a-i) competitor search SUPPRESSED for an unknown/general category ─── */
  {
    let fetchCalled = false;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as any;
    try {
      const noopGet = (_: string) => undefined;
      const noopSet = (_: string, __: any) => {};
      const suppressed = await fetchCompetitors("general", "Toronto", "Acme", "ON", noopGet, noopSet, null);
      assert.equal(suppressed, null, "'general' category → competitors suppressed (null)");
      const suppressedEmpty = await fetchCompetitors("", "Toronto", "Acme", "ON", noopGet, noopSet, null);
      assert.equal(suppressedEmpty, null, "empty category → competitors suppressed (null)");
      assert.equal(fetchCalled, false, "suppressed search must NOT hit the network");
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  /* ─── (a-ii) Places query uses the REAL category + a locationBias circle ─── */
  {
    let capturedBody: any = null;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      // Return one competitor so the result is non-empty.
      return new Response(
        JSON.stringify({
          places: [
            {
              id: "p1",
              displayName: { text: "Some Competitor" },
              rating: 4.5,
              userRatingCount: 50,
              websiteUri: "https://x.example",
              formattedAddress: "1 Main St",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as any;
    try {
      const res = await fetchPlacesCompetitors(
        "freight forwarding service",
        "Toronto",
        "Acme Freight Co",
        "ON",
        { lat: 43.65, lng: -79.38 },
      );
      assert.ok(capturedBody, "Places fetch was invoked");
      const tq: string = capturedBody.textQuery || "";
      assert.ok(/freight forwarding service/i.test(tq), "query uses the real category, not 'general'");
      assert.ok(!/\bgeneral near\b/i.test(tq), "query is NEVER 'general near ...'");
      // locationBias circle ~30km around the business coords.
      assert.ok(capturedBody.locationBias?.circle, "locationBias circle present when coords supplied");
      assert.equal(capturedBody.locationBias.circle.center.latitude, 43.65, "bias centered on the business lat");
      assert.equal(capturedBody.locationBias.circle.radius, 30000, "bias radius is 30km");
      assert.ok(res.competitors.length > 0, "self-filter + slice still yield mapped competitors");
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  /* ─── Financial-credibility fixes ─────────────────────────────────────── */

  /* (a) $ isReal:false when search volume is placeholder (totalMonthlySearchVolume<=0) */
  {
    // Closed all hours → evening + weekend gaps both fire; volume 0 → placeholder.
    const placeholder = await calculateDemandGaps("plumber near me", [], "plumbing", 0);
    assert.equal(
      placeholder.estimatedRevenueLoss.isRealVolume,
      false,
      "placeholder (fallback) volume must flag isRealVolume:false",
    );
    // deriveRevenueLoss must then suppress the demand-gap $ (no fabricated band
    // off placeholder volume). With capture gaps it may still show a real FLOOR,
    // but the basis must NEVER be 'demand-gap' when volume was placeholder.
    const derivedFromPlaceholder = deriveRevenueLoss("plumbing", [], placeholder.estimatedRevenueLoss);
    assert.notEqual(
      derivedFromPlaceholder.basis,
      "demand-gap",
      "placeholder-volume $ must not be quoted as a measured demand-gap loss",
    );
    assert.equal(
      derivedFromPlaceholder.isReal,
      false,
      "placeholder volume + no capture gaps → isReal:false (no fabricated $)",
    );

    // Control: REAL volume keeps a measured demand-gap loss.
    const real = await calculateDemandGaps("plumber near me", [], "plumbing", 8000);
    assert.equal(real.estimatedRevenueLoss.isRealVolume, true, "real volume → isRealVolume:true");
    const derivedFromReal = deriveRevenueLoss("plumbing", [], real.estimatedRevenueLoss);
    assert.equal(derivedFromReal.basis, "demand-gap", "real volume → measured demand-gap basis");
    assert.equal(derivedFromReal.isReal, true, "real volume → isReal:true");
  }

  /* (c) combined missed-share is CAPPED below the raw sum of the gaps */
  {
    // Real volume, closed all hours → both 31% gaps fire. The raw sum would be
    // 62% of monthly leads; the cap holds the combined total at ≤40%.
    const vol = 10000;
    const gaps = await calculateDemandGaps("plumber near me", [], "plumbing", vol);
    const monthlyLeads = vol * 0.05 * 0.15; // mirrors clickRate * conversionRate
    const rawSum = gaps.demandGaps.reduce(
      (s: number, g: any) => s + g.estimatedMissedLeadsPerMonth,
      0,
    );
    const capped = gaps.estimatedRevenueLoss.monthlyMissedLeads;
    assert.ok(gaps.demandGaps.length === 2, "both evening + weekend gaps should be present");
    assert.ok(capped < rawSum, "combined missed leads must be capped below the raw sum (no double-count)");
    assert.ok(
      capped <= Math.round(monthlyLeads * 0.40) + 1,
      "combined missed share is capped at ~40% of monthly leads",
    );
  }

  /* (b) general business → NO dollar string anywhere in the templated prose */
  {
    // deriveRevenueLoss for a general business is isReal:false; feed THAT typed
    // estimate to the narrative — the prose must contain no "$" figure.
    const generalEstimate = deriveRevenueLoss(
      "general",
      ["low-visibility", "not-in-maps-pack", "no-after-hours"],
      { low: 400, high: 600, monthlyMissedLeads: 7, isRealVolume: true },
    );
    assert.equal(generalEstimate.isReal, false, "general estimate is not real");
    const narrative = buildTemplatedNarrative({
      businessName: "Acme Freight Co",
      trade: "general",
      categoryLabel: "freight forwarding service",
      city: "Toronto",
      scores: { grade: "D", total: 41, googleMaps: { score: 6 } },
      reviewsCount: 3,
      rating: 3.8,
      hasWebsite: false,
      mobileScore: null,
      marketLeader: { name: "Best Freight", reviewsCount: 120 },
      detectedIssues: ["low-reviews", "no-website", "low-visibility", "not-in-maps-pack", "no-after-hours"],
      recommendedServices: [{ name: "Local SEO" }],
      estimatedRevenueLoss: generalEstimate,
      areaAverageReviews: 40,
      topMissingKeyword: "freight forwarding toronto",
    });
    const dollarLeak = allStrings(narrative).find((s) => /\$\s*\d/.test(s));
    assert.equal(
      dollarLeak,
      undefined,
      `general business templated prose must contain NO dollar figure — leaked: ${dollarLeak}`,
    );
  }

  /* (d) a grade-D business gets ≥1 HIGH-priority action item */
  {
    // Grade D, only a MEDIUM-class issue (low-visibility) + a LOW service pitch —
    // previously could yield NO HIGH item. The guarantee must promote one.
    const narrative = buildTemplatedNarrative({
      businessName: "Joe's Plumbing",
      trade: "plumbing",
      categoryLabel: "plumbing",
      city: "Toronto",
      scores: { grade: "D", total: 44 },
      reviewsCount: 12,
      rating: 4.3,
      hasWebsite: true,
      mobileScore: 80,
      marketLeader: { name: "Top Plumb", reviewsCount: 200 },
      detectedIssues: ["low-visibility"],
      recommendedServices: [{ name: "Local SEO" }],
      estimatedRevenueLoss: deriveRevenueLoss("plumbing", ["low-visibility"], null),
      areaAverageReviews: 60,
      topMissingKeyword: "emergency plumber toronto",
    });
    const hasHigh = (narrative.actionPlan || []).some((i: any) => i.priority === "HIGH");
    assert.ok(hasHigh, "a grade-D business must get at least one HIGH-priority action item");

    // The data-cited content actually threaded the real keyword + benchmark.
    const planStrings = allStrings(narrative.actionPlan);
    assert.ok(
      planStrings.some((s) => /emergency plumber toronto/i.test(s)),
      "templated plan cites the real top-missing keyword",
    );
  }

  console.log("✓ audit-general: all assertions passed");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ audit-general test FAILED:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  });
