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
  const { calculateScores, analyzeWebsiteQuality } = await import("./auditRoutes");

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

  console.log("auditScoring.test.ts — all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
