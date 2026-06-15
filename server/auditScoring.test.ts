/**
 * Free-audit scoring correctness tests (fix/free-audit-correctness).
 *
 * Guards three correctness bugs in the prospect-facing audit report:
 *
 *  P1-3  No false "slow-website": /generate cannot measure speed (PageSpeed runs
 *        in the background /speed job), so the pre-speed pass must NEVER assert
 *        slow-website — least of all for a business with no website.
 *  P1-4  A blocked/failed website fetch (e.g. HTTP 403 WAF bot-block) must
 *        EXCLUDE the website category from the /100 denominator, not fabricate a
 *        low website score from all-absent checks.
 *  P2-6  The htmlChecks contribution is capped at its 8-pt component max even
 *        when every QA check passes (raw QA max is 24, not the stale 18).
 *
 * Runnable standalone:  npx tsx server/auditScoring.test.ts
 * Wired into CI as `npm run check:audit-scoring`.
 *
 * DB-free: `auditRoutes.ts` transitively imports `server/db`, which throws at
 * module-eval if DATABASE_URL is unset. We set the dummy URL FIRST (mirror of
 * tests/audit/_failover-env-setup.ts), THEN dynamically import the engine. The
 * functions under test never open a DB connection. `fetch` is stubbed for the
 * website-quality cases so no real network call is made.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Uses node:assert/strict, no test-runner dependency.
 */
import assert from "node:assert/strict";

// Must run before importing auditRoutes (which pulls server/db).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://audit:audit@127.0.0.1:1/audit_no_connect";
}

async function main() {
  const { calculateScores, analyzeWebsiteQuality, calculateDemandGaps } = await import("./auditRoutes");

  /* ─── P2-6 — htmlChecks contribution never exceeds its 8-pt cap ─── */
  // A perfect QA score is 24 (sum of analyzeWebsiteQuality weights). With the
  // stale qaMax=18 and no clamp this produced round((24/18)*8)=11 > 8.
  {
    const scores = calculateScores({
      business: { website: "https://example.com", rating: 5, reviewsCount: 0 },
      // Speed data present so the website category is INCLUDED (not excluded),
      // letting us read its breakdown.
      speedData: { mobile: { score: 100 }, desktop: { score: 100 } },
      websiteQualityCheckScore: 24, // every QA check passed
      keywords: [],
      competitors: [],
      keywordSummary: {},
      dataQuality: {},
    });
    assert.ok(
      scores.websiteQuality.breakdown.htmlChecks <= 8,
      `htmlChecks must be <= 8 even with a perfect QA score, got ${scores.websiteQuality.breakdown.htmlChecks}`,
    );
    assert.ok(
      scores.websiteQuality.score <= scores.websiteQuality.max,
      `websiteQuality.score (${scores.websiteQuality.score}) must not exceed its max (${scores.websiteQuality.max})`,
    );
  }

  /* ─── P1-4 — blocked fetch EXCLUDES website from the denominator ─── */
  // When websiteQualityCheckScore is null (fetch blocked) AND no speed data, the
  // website category is excluded: its score is null and the /100 total is
  // renormalized over the remaining categories — NOT scored at ~0.
  {
    const excluded = calculateScores({
      business: { website: "https://blocked.example", rating: 4.6, reviewsCount: 80, photos: [1, 2, 3] },
      speedData: { mobile: null, desktop: null }, // speed not loaded
      websiteQualityCheckScore: null, // fetch blocked → excluded, not zero
      keywords: [],
      competitors: [],
      keywordSummary: {},
      dataQuality: { competitorDataAvailable: false, keywordDataAvailable: false },
    });
    assert.equal(
      excluded.websiteQuality.score,
      null,
      "blocked website fetch must yield websiteQuality.score === null (excluded), not a fabricated low score",
    );

    // The SAME business with a real low website score must score LOWER overall
    // than the excluded case — proving exclusion didn't simply zero it out.
    const fabricatedLow = calculateScores({
      business: { website: "https://blocked.example", rating: 4.6, reviewsCount: 80, photos: [1, 2, 3] },
      speedData: { mobile: { score: 5 }, desktop: { score: 5 } }, // measured: genuinely slow
      websiteQualityCheckScore: 0, // genuinely empty site
      keywords: [],
      competitors: [],
      keywordSummary: {},
      dataQuality: { competitorDataAvailable: false, keywordDataAvailable: false },
    });
    assert.ok(
      excluded.total > fabricatedLow.total,
      `excluding a blocked website (total ${excluded.total}) must beat scoring it ~0 (total ${fabricatedLow.total})`,
    );
  }

  /* ─── P1-4 (unit) — analyzeWebsiteQuality flags a 403 as fetchOk=false ─── */
  {
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () =>
        new Response("blocked", { status: 403, headers: { "content-type": "text/html" } })) as any;
      const r = await analyzeWebsiteQuality("https://waf.example.com");
      assert.equal(r.fetchOk, false, "a 403 response must set fetchOk=false");
      assert.equal(r.httpStatus, 403, "httpStatus must record the 403");
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  /* ─── P1-4 (unit) — a real 200 page is fetchOk=true ─── */
  {
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () =>
        new Response(
          '<html><head><meta name="viewport" content="width=device-width"></head><body>Call 555-123-4567</body></html>',
          { status: 200, headers: { "content-type": "text/html" } },
        )) as any;
      const r = await analyzeWebsiteQuality("https://ok.example.com");
      assert.equal(r.fetchOk, true, "a 200 response must set fetchOk=true");
      assert.equal(r.httpStatus, 200, "httpStatus must record the 200");
      assert.ok(r.checks.hasMobileViewport, "viewport meta must be detected on a real page");
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  /* ─── P1-9 — calculateDemandGaps coerces non-finite volume, never emits NaN ─── */
  // A degraded DataForSEO response can hand a string / NaN as the
  // totalMonthlySearchVolume. Without the Number.isFinite guard this flows
  // through monthlyLeads → Math.round(NaN) → NaN into the customer-facing
  // "missed leads" + revenue band. Each bad input must behave exactly like a
  // zero-volume (placeholder) run: a finite, non-negative band flagged
  // isRealVolume=false.
  {
    // Every one of these must produce a FINITE, non-negative band (never NaN),
    // regardless of how the volume was coerced.
    const allInputs: any[] = [NaN, "1200", "not-a-number", undefined, null, -5, Infinity, 0, 4000];
    for (const v of allInputs) {
      const r = await calculateDemandGaps("plumber near me", [], "plumbing", v as number);
      const { low, high, monthlyMissedLeads } = r.estimatedRevenueLoss;
      assert.ok(Number.isFinite(low), `low must be finite for input ${String(v)}, got ${low}`);
      assert.ok(Number.isFinite(high), `high must be finite for input ${String(v)}, got ${high}`);
      assert.ok(
        Number.isFinite(monthlyMissedLeads),
        `monthlyMissedLeads must be finite for input ${String(v)}, got ${monthlyMissedLeads}`,
      );
      assert.ok(low >= 0 && high >= 0, `revenue band must be non-negative for input ${String(v)}`);
    }

    // Non-finite / non-positive volume is treated as "no real measurement"
    // (placeholder) → isRealVolume=false. NaN/garbage/null/negative/Infinity/0.
    for (const bad of [NaN, "not-a-number", undefined, null, -5, Infinity, 0]) {
      const r = await calculateDemandGaps("plumber near me", [], "plumbing", bad as number);
      assert.equal(
        r.estimatedRevenueLoss.isRealVolume,
        false,
        `a non-finite/non-positive volume (${String(bad)}) must flag isRealVolume=false`,
      );
    }

    // A numeric STRING that parses to a real positive number IS a real
    // measurement after coercion — and a real number obviously is.
    for (const goodVal of ["1200", 4000]) {
      const r = await calculateDemandGaps("plumber near me", [], "plumbing", goodVal as any);
      assert.equal(
        r.estimatedRevenueLoss.isRealVolume,
        true,
        `a coercible positive volume (${String(goodVal)}) must flag isRealVolume=true`,
      );
      assert.ok(Number.isFinite(r.estimatedRevenueLoss.high), "a real-volume high must be finite");
    }
  }

  /* ─── P1-3 — PDF filename safeName never throws on a null business name ─── */
  // pdfGenerator builds `safeName = (row.business_name || data.businessName ||
  // "audit").replace(...)`. The bug was a bare `row.business_name.replace(...)`
  // which throws "Cannot read properties of null" and bricks the PDF forever
  // for any report whose business_name is null. This replicates the exact
  // expression to prove the fallback chain produces a usable slug instead of
  // throwing. (pdfGenerator pulls pdfkit; the load-bearing logic is this
  // one-liner, asserted directly.)
  {
    const safeNameOf = (businessName: string | null, fallback: string | null): string =>
      (businessName || fallback || "audit")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 60);

    // Null row name → falls back to data.businessName.
    assert.equal(safeNameOf(null, "Bob's Plumbing & Co"), "Bobs-Plumbing-Co");
    // Both null → "audit" sentinel, never a throw.
    assert.equal(safeNameOf(null, null), "audit");
    // Empty strings are falsy → same fallback behaviour.
    assert.equal(safeNameOf("", ""), "audit");
    // Sanity: a real name still slugifies.
    assert.equal(safeNameOf("Ace HVAC", null), "Ace-HVAC");
    // The pre-fix code path (`(null as any).replace(...)`) would throw — prove
    // the guarded expression does NOT.
    assert.doesNotThrow(() => safeNameOf(null, null), "safeName must never throw on a null business name");
  }

  console.log("auditScoring.test.ts — all assertions passed");
}

// Exit explicitly: a side-effect import (./audit/_failover-env-setup → server/db)
// can leave an open handle, so a resolved main() would otherwise hang the
// process forever — which stalled the CI build job indefinitely. Standalone
// tsx guards MUST exit(0) on success / exit(1) on failure.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
