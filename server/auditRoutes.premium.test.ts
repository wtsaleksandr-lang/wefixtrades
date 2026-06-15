/**
 * Premium value-first data block tests (feat/audit-premium-data).
 *
 * Guards the pure derivation functions that build the report's `premium` block:
 * head-to-head comparison, KPI tiles, GBP completeness, on-page SEO, review
 * recency. The whole point of this layer is HONESTY — every module self-nulls
 * when its source data is absent and NOTHING fabricates a value. These tests
 * assert that discipline (no "empty bands") alongside the math.
 *
 * Runnable standalone:  npx tsx server/auditRoutes.premium.test.ts
 * Wired into CI as `npm run check:audit-premium`.
 *
 * DB-free: auditRoutes.ts transitively imports server/db, which throws at
 * module-eval when DATABASE_URL is unset. Set a dummy URL FIRST, THEN import.
 * The functions under test are pure and never open a DB connection.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Uses node:assert/strict, no test-runner dependency.
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://audit:audit@127.0.0.1:1/audit_no_connect";
}
process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "test-key-not-used";

async function main() {
  const {
    buildPremiumComparison,
    buildPremiumGbp,
    buildPremiumKpis,
    buildPremiumOnPage,
    buildPremiumReviewDepth,
    buildPremiumBlock,
  } = await import("./auditRoutes");

  /* ─────────────────────────────────────────────────────────────────────────
   * COMPARISON — rank math + null when no competitors
   * ───────────────────────────────────────────────────────────────────────── */
  {
    // You sit in the middle of three competitors by review count.
    const c = buildPremiumComparison({
      name: "You Co", reviews: 40, rating: 4.6,
      competitors: [
        { name: "Alpha", reviewsCount: 120, rating: 4.8, distanceKm: 1.234 },
        { name: "Bravo", reviewsCount: 60, rating: 4.5, distanceKm: 12.6 },
        { name: "Charlie", reviewsCount: 10, rating: 4.2, distanceKm: null },
      ],
    })!;
    assert.ok(c, "comparison built when competitors exist");
    assert.equal(c.you.isYou, true, "you row is flagged isYou");
    assert.equal(c.you.reviews, 40);
    // rows sorted by reviews desc.
    assert.deepEqual(c.rows.map((r: any) => r.name), ["Alpha", "Bravo", "Charlie"], "rows sorted by reviews desc");
    // 2 competitors (120, 60) have MORE reviews than you (40) → rank 3.
    assert.equal(c.yourRank, 3, "yourRank counts strictly-greater competitors + 1");
    // distanceLabel: <10km rounds to 1dp, >=10km to integer, null stays null.
    assert.equal(c.rows[0].distanceLabel, "1.2 km away");
    assert.equal(c.rows[1].distanceLabel, "13 km away");
    assert.equal(c.rows[2].distanceLabel, null);
  }
  {
    // You lead → rank 1. Ties do not push you down.
    const c = buildPremiumComparison({
      name: "Top", reviews: 100, rating: 4.9,
      competitors: [
        { name: "Tie", reviewsCount: 100, rating: 4.7, distanceKm: 2 },
        { name: "Below", reviewsCount: 50, rating: 4.1, distanceKm: 3 },
      ],
    })!;
    assert.equal(c.yourRank, 1, "ties don't push your rank down");
  }
  {
    // maxRows caps the competitor rows.
    const c = buildPremiumComparison({
      name: "You", reviews: 0, rating: 0,
      competitors: Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, reviewsCount: 100 - i, rating: 4 })),
      maxRows: 5,
    })!;
    assert.equal(c.rows.length, 5, "rows capped at maxRows");
    assert.equal(c.yourRank, 10, "rank is over the FULL set, not just shown rows");
    // REGRESSION GUARD: total = all competitors + you, computed PRE-slice — so
    // the UI badge ("#N of total") can never be smaller than yourRank (the
    // "#10 of 6" bug when there are more competitors than displayed rows).
    assert.equal(c.total, 10, "total counts ALL competitors + you, not just shown rows");
    assert.ok(c.yourRank <= c.total, "yourRank never exceeds total (badge stays sane)");
  }
  {
    // total stays consistent in the common small-field case.
    const c = buildPremiumComparison({
      name: "You", reviews: 40, rating: 4.6,
      competitors: [
        { name: "Alpha", reviewsCount: 120, rating: 4.8 },
        { name: "Bravo", reviewsCount: 10, rating: 4.2 },
      ],
    })!;
    assert.equal(c.total, 3, "total = 2 competitors + you");
    assert.ok(c.yourRank <= c.total, "yourRank within total");
  }
  {
    // No competitors → null (never a lone "you" row implying a comparison).
    assert.equal(buildPremiumComparison({ name: "Lonely", reviews: 5, rating: 4, competitors: [] }), null,
      "comparison is null with no competitors");
    // Competitors all nameless → filtered out → null.
    assert.equal(buildPremiumComparison({ name: "X", reviews: 5, rating: 4, competitors: [{ reviewsCount: 9 } as any] }), null,
      "comparison is null when no competitor has a name");
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * GBP COMPLETENESS — pct math + missing list, from REAL fields only
   * ───────────────────────────────────────────────────────────────────────── */
  {
    // All 6 checks pass → 100%, empty missing.
    const g = buildPremiumGbp({
      description: "We do great work", website: "https://x.com",
      hours: ["Mon 9-5"], photos: ["a", "b", "c"],
      primaryType: "plumber", rating: 4.7,
    });
    assert.equal(g.completenessPct, 100, "all checks pass → 100%");
    assert.deepEqual(g.missing, [], "no missing when all pass");
    assert.equal(g.checks.length, 6, "six checks total");
  }
  {
    // 3 of 6 pass → 50%; failed ones surface in missing with labels.
    const g = buildPremiumGbp({
      description: "", website: "https://x.com",
      hours: [], photos: ["a", "b"], // only 2 photos → fail (needs >=3)
      primaryType: "", primaryTypeDisplayName: "Plumber", // passes via display name
      rating: 4.5,
    });
    // pass: website, category, rating = 3 of 6 → 50%
    assert.equal(g.completenessPct, 50, "3/6 → 50%");
    assert.deepEqual(g.missing.sort(), ["At least 3 photos", "Business description", "Opening hours"].sort(),
      "missing lists exactly the failed labels");
    // every failed check carries an actionable hint
    for (const c of g.checks.filter((c: any) => !c.pass)) {
      assert.ok(c.hint && c.hint.length > 0, `failed check ${c.key} has a hint`);
    }
  }
  {
    // Empty profile → 0%, all 6 missing, never throws.
    const g = buildPremiumGbp({});
    assert.equal(g.completenessPct, 0, "empty profile → 0%");
    assert.equal(g.missing.length, 6, "all six missing on empty profile");
  }
  {
    // rating 0 does NOT count as present (must be > 0).
    const g = buildPremiumGbp({ rating: 0 });
    const ratingCheck = g.checks.find((c: any) => c.key === "rating")!;
    assert.equal(ratingCheck.pass, false, "rating=0 is not 'present'");
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * ON-PAGE — null without HTML; detects tel:/schema; status thresholds
   * ───────────────────────────────────────────────────────────────────────── */
  {
    // No parsed HTML → null (never imply checks we couldn't run).
    assert.equal(buildPremiumOnPage(null), null, "onPage is null when no HTML was parsed");
    assert.equal(buildPremiumOnPage(undefined), null, "onPage is null for undefined meta");
  }
  {
    // Healthy page: tel: + JSON-LD + viewport + good title/meta + single H1.
    const op = buildPremiumOnPage({
      titleLength: 40, metaDescriptionLength: 140, h1Count: 1,
      hasTelLink: true, hasJsonLd: true, hasViewport: true,
    })!;
    const byKey = Object.fromEntries(op.checks.map((c: any) => [c.key, c.status]));
    assert.equal(byKey.clickToCall, "pass", "tel: link detected → pass");
    assert.equal(byKey.schema, "pass", "JSON-LD detected → pass");
    assert.equal(byKey.viewport, "pass");
    assert.equal(byKey.title, "pass", "title 40 chars → pass");
    assert.equal(byKey.metaDescription, "pass", "meta 140 chars → pass");
    assert.equal(byKey.singleH1, "pass", "exactly one H1 → pass");
  }
  {
    // Problem page: no tel:, no schema, no viewport, long title, no meta, two H1s.
    const op = buildPremiumOnPage({
      titleLength: 80, metaDescriptionLength: 0, h1Count: 2,
      hasTelLink: false, hasJsonLd: false, hasViewport: false,
    })!;
    const byKey = Object.fromEntries(op.checks.map((c: any) => [c.key, c.status]));
    assert.equal(byKey.clickToCall, "warn", "missing tel: → warn");
    assert.equal(byKey.schema, "warn", "missing JSON-LD → warn");
    assert.equal(byKey.viewport, "fail", "missing viewport → fail");
    assert.equal(byKey.title, "warn", "long title → warn");
    assert.equal(byKey.metaDescription, "warn", "missing meta → warn");
    assert.equal(byKey.singleH1, "warn", "multiple H1s → warn");
  }
  {
    // No H1 at all → fail (distinct from too-many → warn).
    const op = buildPremiumOnPage({
      titleLength: 5, metaDescriptionLength: 200, h1Count: 0,
      hasTelLink: false, hasJsonLd: false, hasViewport: true,
    })!;
    const byKey = Object.fromEntries(op.checks.map((c: any) => [c.key, c.status]));
    assert.equal(byKey.singleH1, "fail", "no H1 → fail");
    assert.equal(byKey.title, "warn", "short title → warn");
    assert.equal(byKey.metaDescription, "warn", "over-long meta → warn");
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * REVIEW DEPTH — null without data; only defensible fields
   * ───────────────────────────────────────────────────────────────────────── */
  {
    assert.equal(buildPremiumReviewDepth(null), null, "reviewDepth null when no review intel");
    // Intel object present but with no usable fields → still null (no empty shell).
    assert.equal(
      buildPremiumReviewDepth({ mostRecentReviewDate: null, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }),
      null,
      "reviewDepth null when date absent AND distribution empty",
    );
  }
  {
    const recent = new Date(Date.now() - 10 * 86400000).toISOString();
    const rd = buildPremiumReviewDepth({
      mostRecentReviewDate: recent,
      ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 4, 5: 5 }, // 9/10 positive → 90%
    })!;
    assert.equal(rd.newestReviewAgeDays, 10, "newestReviewAgeDays computed from most-recent date");
    assert.ok(rd.sentimentHint && rd.sentimentHint.includes("90%"), "sentimentHint reflects 90% positive");
  }
  {
    // Unparseable date → null age, but distribution still yields a hint.
    const rd = buildPremiumReviewDepth({
      mostRecentReviewDate: "not-a-date",
      ratingDistribution: { 1: 5, 2: 3, 3: 1, 4: 1, 5: 0 }, // 1/10 positive → 10%
    })!;
    assert.equal(rd.newestReviewAgeDays, null, "unparseable date → null age, not fabricated");
    assert.ok(rd.sentimentHint && rd.sentimentHint.includes("10%"), "low sentiment hint");
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * KPIs — tiles omitted when source absent; benchmark/trend only with benchmark
   * ───────────────────────────────────────────────────────────────────────── */
  {
    const kpis = buildPremiumKpis({
      reviews: 80, areaAverageReviews: 50, rating: 4.6,
      keywords: [{ organicRank: 3 }, { organicRank: 11 }, { organicRank: null }, {}],
      gbpCompletenessPct: 67,
    });
    const byKey = Object.fromEntries(kpis.map((k: any) => [k.key, k]));
    // reviews tile: benchmark 50, reviews 80 > 50 → trend up
    assert.equal(byKey.reviews.benchmark, 50);
    assert.equal(byKey.reviews.trend, "up", "reviews above benchmark → up");
    // avgPosition over ranked (3, 11) → 7
    assert.equal(byKey.avgPosition.value, 7, "avg position over ranked keywords only");
    // visibility: 2 ranked / 4 tracked → 50%
    assert.equal(byKey.visibility.value, 50, "visibility = ranked/tracked");
    assert.equal(byKey.rating.value, 4.6);
    assert.equal(byKey.gbpCompleteness.value, 67);
  }
  {
    // No benchmark → reviews tile has NO benchmark/trend (not a fabricated 0/flat).
    const kpis = buildPremiumKpis({ reviews: 10, areaAverageReviews: 0, rating: 0, keywords: [], gbpCompletenessPct: undefined as any });
    const reviewsTile = kpis.find((k: any) => k.key === "reviews")!;
    assert.equal(reviewsTile.benchmark, undefined, "no benchmark when area avg is 0");
    assert.equal(reviewsTile.trend, undefined, "no trend without a benchmark");
    // rating 0 omitted, no keywords → no avgPosition/visibility, no gbp tile.
    assert.equal(kpis.find((k: any) => k.key === "rating"), undefined, "rating=0 tile omitted");
    assert.equal(kpis.find((k: any) => k.key === "avgPosition"), undefined, "no avgPosition without ranked keywords");
    assert.equal(kpis.find((k: any) => k.key === "visibility"), undefined, "no visibility tile when no keywords tracked");
    assert.equal(kpis.find((k: any) => k.key === "gbpCompleteness"), undefined, "no gbp tile without a pct");
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * ORCHESTRATOR — composes modules, self-nulls absent sources
   * ───────────────────────────────────────────────────────────────────────── */
  {
    // Minimal data: a business with nothing but a name → gbp present (0%),
    // comparison/onPage/reviewDepth all null, kpis empty (no source data).
    const block = buildPremiumBlock({ business: { name: "Bare Co" } });
    assert.equal(block.comparison, null, "no competitors → comparison null");
    assert.equal(block.onPage, null, "no onPageMeta → onPage null");
    assert.equal(block.reviewDepth, null, "no review intel → reviewDepth null");
    assert.ok(block.gbp, "gbp always present (it's a checklist, not data we might lack)");
    assert.equal(block.gbp.completenessPct, 0, "bare profile → 0% completeness");
    // reviews=0, rating absent, no keywords → reviews tile present (value 0), nothing else.
    assert.ok(Array.isArray(block.kpis), "kpis is an array");
    assert.equal(block.kpis.find((k: any) => k.key === "avgPosition"), undefined, "no keyword KPIs without keywords");
  }
  {
    // Full data flows through to every module.
    const block = buildPremiumBlock({
      business: {
        name: "Full Co", reviewsCount: 75, rating: 4.7,
        description: "desc", website: "https://x.com", hours: ["Mon"], photos: ["a", "b", "c"],
        primaryType: "plumber",
      },
      competitors: [{ name: "Rival", reviewsCount: 90, rating: 4.5, distanceKm: 4 }],
      areaAverageReviews: 40,
      keywords: [{ organicRank: 2 }, { organicRank: 8 }],
      onPageMeta: { titleLength: 30, metaDescriptionLength: 120, h1Count: 1, hasTelLink: true, hasJsonLd: true, hasViewport: true },
      reviewIntel: { mostRecentReviewDate: new Date().toISOString(), ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 8 } },
    });
    assert.ok(block.comparison, "comparison built");
    assert.equal(block.comparison!.yourRank, 2, "you (75) behind rival (90) → rank 2");
    assert.ok(block.onPage, "onPage built from meta");
    assert.ok(block.reviewDepth, "reviewDepth built");
    assert.equal(block.reviewDepth!.newestReviewAgeDays, 0, "review today → 0 days old");
    assert.equal(block.gbp.completenessPct, 100, "full profile → 100%");
    // KPIs: reviews(benchmark 40, up), rating, avgPosition(5), visibility(100), gbp(100)
    const keys = block.kpis.map((k: any) => k.key);
    assert.ok(keys.includes("reviews") && keys.includes("rating") && keys.includes("avgPosition")
      && keys.includes("visibility") && keys.includes("gbpCompleteness"), "all KPI tiles present with full data");
  }

  console.log("auditRoutes.premium.test.ts: all assertions passed ✓");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
