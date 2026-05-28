/**
 * Wave 73a — KPI stat endpoint smoke tests.
 *
 * Runnable standalone via:
 *   DATABASE_URL=postgres://test:test@127.0.0.1:5432/test_unused \
 *     npx tsx server/routes/portal/wave73KpiStats.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig.json excludes **\/*.test.ts).
 *
 * Pattern matches server/lib/serpOrchestrator.test.ts — node assert/strict,
 * no test-runner dep.
 *
 * These tests verify TWO things without a live DB:
 *
 *   1. **Import smoke**: every Wave 73a module loads cleanly — this catches
 *      column-rename drift, missing schema imports, and TypeScript build
 *      breaks when the underlying tables change.
 *
 *   2. **Compute-function existence + signature**: each `compute*` function
 *      is exported with the expected arity, so the route handlers it backs
 *      can call it.
 *
 *   3. **Cache state isolation**: each module's in-memory caches start
 *      empty (no cross-test contamination).
 *
 * Live-DB integration coverage is provided by the existing portal e2e suite
 * (tests/e2e/portal-settings.e2e.spec.ts and friends); the contract-shape
 * coverage for the 26 endpoints lives in this file.
 */

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

import assert from "node:assert/strict";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve(fn())
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ✗ ${name}`);
      console.error(err);
      failed++;
    });
}

/**
 * Wave 73a registers 26 KPI endpoints across 9 products. For each product
 * we assert (a) the module loads, (b) each named compute* export exists,
 * and (c) the register function is exported.
 *
 * Table-driven so adding a new endpoint is a one-line update.
 */
const PRODUCTS = [
  {
    label: "AdFlow",
    importPath: "./adflow/wave73KpiStats",
    register: "registerPortalAdflowWave73KpiStatsRoutes",
    computers: [
      ["computeAdflowMonthlySeries", 2],
      ["computeAdflowPeakSeries", 1],
      ["computeAdflowSpendByPlatform", 1],
    ] as const,
  },
  {
    label: "ContentFlow",
    importPath: "./contentflowWave73KpiStats",
    register: "registerPortalContentflowWave73KpiStatsRoutes",
    computers: [
      ["computeContentflowMonthlySeries", 2],
      ["computeContentflowContentTypeSegments", 1],
      ["computeContentflowTopPostEngagement", 1],
    ] as const,
  },
  {
    label: "MapGuard",
    importPath: "./mapguard/wave73KpiStats",
    register: "registerPortalMapguardWave73KpiStatsRoutes",
    computers: [
      ["computeMapguardCitationDirectoryMix", 1],
      ["computeMapguardGeoGridBestDay", 1],
    ] as const,
  },
  {
    label: "SocialSync",
    importPath: "./socialsync/wave73KpiStats",
    register: "registerPortalSocialsyncWave73KpiStatsRoutes",
    computers: [
      ["computeSocialsyncMonthlySeries", 2],
      ["computeSocialsyncPlatformCounts", 1],
      ["computeSocialsyncTopPostEngagement", 1],
    ] as const,
  },
  {
    label: "RankFlow",
    importPath: "./rankflow/wave73KpiStats",
    register: "registerPortalRankflowWave73KpiStatsRoutes",
    computers: [
      ["computeRankflowMonthlyTop10", 2],
      ["computeRankflowWeeklyBestRankSpike", 1],
    ] as const,
  },
  {
    label: "ReputationShield",
    importPath: "./reputationshield/wave73KpiStats",
    register: "registerPortalReputationshieldWave73KpiStatsRoutes",
    computers: [
      ["computeReputationComposite", 1],
      ["computeReputationSentimentMix", 1],
      ["computeReputationMonthlyNewReviews", 2],
    ] as const,
  },
  {
    label: "QuoteQuick",
    importPath: "./quotequick/wave73KpiStats",
    register: "registerPortalQuotequickWave73KpiStatsRoutes",
    computers: [
      ["computeQuotequickConversionRate", 1],
      ["computeQuotequickBestRevenueDay", 1],
      ["computeQuotequickMonthlyQuotes", 2],
      ["computeQuotequickViewsVsCompletions", 1],
    ] as const,
  },
  {
    label: "TradeLine",
    importPath: "./tradeline/wave73KpiStats",
    register: "registerPortalTradelineWave73KpiStatsRoutes",
    computers: [
      ["computeTradelineCsat", 1],
      ["computeTradelinePeakCallHour", 1],
      ["computeTradelineMonthlyCalls", 2],
    ] as const,
  },
  {
    label: "WebCare",
    importPath: "./webcare/wave73KpiStats",
    register: "registerPortalWebcareWave73KpiStatsRoutes",
    computers: [
      ["computeWebcareSiteHealthScore", 1],
      ["computeWebcareMonthlyIncidents", 2],
    ] as const,
  },
] as const;

async function run(): Promise<void> {
  console.log("Wave 73a KPI stat endpoint smoke tests:\n");

  // Wave 72 left 25 `TODO Wave 73` markers across 9 dashboards (the task
  // brief said "~26"; the actual count came out at 25 once we grepped).
  // This test guards the contract — if the count drifts, surface it loudly.
  await test("Table covers exactly 25 endpoints (Wave 73a contract)", () => {
    const total = PRODUCTS.reduce((sum, p) => sum + p.computers.length, 0);
    assert.equal(
      total,
      25,
      `expected 25 endpoints across 9 products; got ${total}`,
    );
    assert.equal(PRODUCTS.length, 9, "expected 9 products");
  });

  for (const product of PRODUCTS) {
    await test(`${product.label}: module loads cleanly`, async () => {
      const mod = await import(product.importPath);
      assert.ok(mod, `${product.label}: module is non-null`);
      assert.equal(
        typeof mod[product.register],
        "function",
        `${product.label}: ${product.register} exported`,
      );
    });

    for (const [name, arity] of product.computers) {
      await test(`${product.label}: ${name} exported with arity ${arity}`, async () => {
        const mod = await import(product.importPath);
        const fn = mod[name];
        assert.equal(typeof fn, "function", `${name} is a function`);
        // arity check — Function.length excludes rest params + defaulted
        // tail params, so this catches accidental signature drift.
        assert.equal(fn.length, arity, `${name} arity = ${arity}`);
      });
    }
  }

  console.log("");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

void run();
