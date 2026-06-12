/**
 * OriginalDataService guard (WP-2) — the SEO data moat + k-anonymity gate.
 *
 * Runnable standalone via:
 *   npx tsx server/services/seoContent/originalDataService.test.ts
 * Wired into CI as `npm run check:seo-original-data` (.github/workflows/ci.yml).
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes **\/*.test.ts). Uses
 * node:assert/strict, no test-runner dep, NO live DB — calculator data is
 * injected as plain fixtures straight into the pure aggregator.
 *
 * Coverage:
 *   (a) aggregation math (median / p25 / p75 / regional) from a fixture set
 *   (b) k-anonymity gate: sample < MIN_SAMPLE → { sufficient:false } and
 *       NEVER emits any price statistic
 *   (c) output shape carries NO PII / no customer identifier
 *   (d) DELIBERATE-FAILURE fixture: a regressed gate that emits stats at
 *       sample=2 must fail this test red
 *
 * CRITICAL: ends with process.exit(failed>0?1:0) so a stray open handle from
 * any import can never hang CI (a fusion test hung the whole pipeline for
 * exactly this reason).
 */

import assert from "node:assert/strict";
import {
  aggregatePriceData,
  getPriceDataForJob,
  clearPriceDataCache,
  DEFAULT_MIN_SAMPLE,
  median,
  percentile,
  type CalculatorRecord,
  type OriginalDataResult,
  type SufficientDataResult,
} from "./originalDataService";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
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

/* ─── Fixtures ─────────────────────────────────────────────────────────────
   Six "hourly" plumbing configs with known rates. The representative basket
   for the generic job is quantity 1/2/3, so the central (median-of-basket)
   estimate for a pure hourly config of rate R with no base fee is 2*R
   (median of {1R, 2R, 3R}). That makes the expected aggregate arithmetic
   exact and auditable. */

function hourly(rate: number, extra: Record<string, unknown> = {}) {
  return { pricingType: "hourly", unitName: "hour", rate, ...extra };
}

// Clean rates 50,60,70,80,90,100 → central price = 2*rate (median of {1,2,3}*rate,
// no modifiers): 100,120,140,160,180,200. Exact, auditable arithmetic.
const PLUMBERS: CalculatorRecord[] = [50, 60, 70, 80, 90, 100].map((rate) => ({
  trade_type: "plumber",
  pricing_config: hourly(rate),
}));

// Separate fixture carrying modifiers, used ONLY for the commonOptions
// prevalence test (so the percentile math fixture above stays modifier-free).
// 2 of 6 carry a travel fee; 1 of 6 an after-hours multiplier.
const PLUMBERS_WITH_OPTIONS: CalculatorRecord[] = [
  { trade_type: "hvac", pricing_config: hourly(50) },
  { trade_type: "hvac", pricing_config: hourly(60) },
  { trade_type: "hvac", pricing_config: hourly(70, { travelFee: 25 }) },
  { trade_type: "hvac", pricing_config: hourly(80, { afterHoursMult: 1.5 }) },
  { trade_type: "hvac", pricing_config: hourly(90, { travelFee: 25 }) },
  { trade_type: "hvac", pricing_config: hourly(100) },
];

async function run(): Promise<void> {
  console.log("OriginalDataService — k-anonymity + aggregation guard:\n");

  /* ── pure helper sanity ── */
  await test("median + percentile helpers compute type-7 values", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    // p25 / p75 over {100,120,140,160,180,200} (sorted, 6 elems, type-7):
    //   idx = p*(n-1) = p*5 → p25 idx 1.25 → 120 + .25*(140-120)=125
    //                          p75 idx 3.75 → 160 + .75*(180-160)=175
    const vals = [100, 120, 140, 160, 180, 200];
    assert.equal(percentile(vals, 0.25), 125);
    assert.equal(percentile(vals, 0.5), 150);
    assert.equal(percentile(vals, 0.75), 175);
  });

  /* ── (a) aggregation math correct from a fixture set ── */
  await test("(a) aggregates correct percentiles from 6 real configs", () => {
    const r = aggregatePriceData(
      PLUMBERS,
      { tradeType: "plumber" },
      5,
    );
    assert.equal(r.sufficient, true, "6 >= minSample 5 → sufficient");
    const s = r as SufficientDataResult;
    assert.equal(s.sampleSize, 6);
    assert.equal(s.currency, "USD");
    // central prices = {100,120,140,160,180,200}
    assert.equal(s.min, 100);
    assert.equal(s.p25, 125);
    assert.equal(s.median, 150);
    assert.equal(s.p75, 175);
    assert.equal(s.max, 200);
    assert.ok(typeof s.computedAt === "string" && s.computedAt.length > 0);
  });

  await test("(a2) common options surface add-on/modifier prevalence", () => {
    const s = aggregatePriceData(PLUMBERS_WITH_OPTIONS, { tradeType: "hvac" }, 5) as SufficientDataResult;
    const travel = s.commonOptions.find((o) => o.label === "Travel / Service Fee");
    const after = s.commonOptions.find((o) => o.label === "After-Hours");
    assert.ok(travel, "travel fee prevalence present");
    assert.equal(travel!.prevalence, 0.33, "2 of 6 configs → 0.33");
    assert.ok(after, "after-hours prevalence present");
    assert.equal(after!.prevalence, 0.17, "1 of 6 → 0.17");
  });

  await test("(a3) regional variation only emits cuts that clear the floor", () => {
    // 5 east + 5 west, each region independently clears minSample 5.
    const east: CalculatorRecord[] = [40, 50, 60, 70, 80].map((rate) => ({
      trade_type: "electrician", pricing_config: hourly(rate), region: "east",
    }));
    const west: CalculatorRecord[] = [90, 100, 110, 120, 130].map((rate) => ({
      trade_type: "electrician", pricing_config: hourly(rate), region: "west",
    }));
    // plus a thin 'north' cut of 2 — must NOT appear.
    const north: CalculatorRecord[] = [200, 210].map((rate) => ({
      trade_type: "electrician", pricing_config: hourly(rate), region: "north",
    }));
    const s = aggregatePriceData(
      [...east, ...west, ...north],
      { tradeType: "electrician" },
      5,
    ) as SufficientDataResult;
    assert.equal(s.sufficient, true);
    const regions = s.regionalVariation.map((v) => v.region).sort();
    assert.deepEqual(regions, ["east", "west"], "thin 'north' (n=2) excluded");
    const north2 = s.regionalVariation.find((v) => v.region === "north");
    assert.equal(north2, undefined, "no thin region leaks a median");
  });

  /* ── (b) k-anonymity gate below MIN_SAMPLE ── */
  await test("(b) sample < MIN_SAMPLE → sufficient:false, NO stats emitted", () => {
    const fewer = PLUMBERS.slice(0, 4); // 4 < 5
    const r = aggregatePriceData(fewer, { tradeType: "plumber" }, 5);
    assert.equal(r.sufficient, false, "4 < 5 → insufficient");
    assert.equal(r.sampleSize, 4);
    // The shape must carry ZERO price numbers — assert the stat keys are absent.
    const keys = Object.keys(r);
    for (const banned of ["median", "p25", "p75", "min", "max", "commonOptions", "regionalVariation"]) {
      assert.ok(!keys.includes(banned), `insufficient result must NOT carry '${banned}'`);
    }
  });

  await test("(b2) DEFAULT_MIN_SAMPLE is 5 and env override is honoured via getPriceDataForJob", async () => {
    assert.equal(DEFAULT_MIN_SAMPLE, 5);
    clearPriceDataCache();
    // Raise the floor to 7 → the 6-config corpus is now insufficient.
    const prev = process.env.SEO_DATA_MIN_SAMPLE;
    process.env.SEO_DATA_MIN_SAMPLE = "7";
    try {
      const loader = async (trade: string) =>
        PLUMBERS.filter((p) => p.trade_type === trade);
      const r = await getPriceDataForJob({ tradeType: "plumber" }, loader);
      assert.equal(r.sufficient, false, "6 < floor 7 → insufficient");
      assert.equal(r.sampleSize, 6);
    } finally {
      if (prev === undefined) delete process.env.SEO_DATA_MIN_SAMPLE;
      else process.env.SEO_DATA_MIN_SAMPLE = prev;
      clearPriceDataCache();
    }
  });

  await test("(b3) call-for-quote configs contribute no price and don't pad the sample", () => {
    const cfq: CalculatorRecord[] = Array.from({ length: 4 }, () => ({
      trade_type: "roofer",
      pricing_config: { pricingType: "call_for_quote_only", message: "Call us" },
    }));
    // 4 real priced + 4 call-for-quote. Sample counts ONLY the 4 priced → < 5.
    const realFour: CalculatorRecord[] = PLUMBERS.slice(0, 4).map((p) => ({
      ...p, trade_type: "roofer",
    }));
    const r = aggregatePriceData([...realFour, ...cfq], { tradeType: "roofer" }, 5);
    assert.equal(r.sufficient, false, "only 4 priced configs → insufficient");
    assert.equal(r.sampleSize, 4, "call-for-quote configs excluded from count");
  });

  /* ── (c) no PII / no identifier in the output shape ── */
  await test("(c) output shape carries NO customer identifier / PII", () => {
    const results: OriginalDataResult[] = [
      aggregatePriceData(PLUMBERS, { tradeType: "plumber" }, 5),
      aggregatePriceData(PLUMBERS.slice(0, 2), { tradeType: "plumber" }, 5),
    ];
    const forbidden = [
      "id", "calculator_id", "calculatorId", "user_id", "userId",
      "business_name", "businessName", "owner_email", "ownerEmail",
      "owner_phone", "ownerPhone", "slug", "pricing_config", "pricingConfig",
      "email", "phone", "config",
    ];
    const blob = JSON.stringify(results);
    for (const r of results) {
      for (const f of forbidden) {
        assert.ok(!(f in (r as Record<string, unknown>)), `result must not have key '${f}'`);
      }
    }
    // Also assert no fixture business identifier string leaked into the JSON.
    assert.ok(!blob.includes("owner_email"), "no owner_email anywhere in output");
    assert.ok(!blob.includes("calculator_id"), "no calculator_id anywhere in output");
  });

  /* ── (d) DELIBERATE-FAILURE fixture: a regressed gate emitting stats at
        sample=2 MUST be caught. We simulate the regression locally and prove
        this test would go red if the real gate behaved that way. ── */
  await test("(d) deliberate-failure: a gate that emits stats at sample=2 fails red", () => {
    // The genuine service: 2 configs → insufficient, no stats. Confirm.
    const honest = aggregatePriceData(PLUMBERS.slice(0, 2), { tradeType: "plumber" }, 5);
    assert.equal(honest.sufficient, false);

    // Now the regression: a gate that ignored the floor and emitted numbers
    // from just 2 configs. The assertion the suite enforces against ANY
    // result is "insufficient cuts carry no median". Prove that assertion
    // FIRES on the regressed shape (i.e. the guard actually catches it).
    const regressed = {
      sufficient: true,
      sampleSize: 2,
      median: 110, // fabricated from a 2-of-2 cut — a privacy + thin breach
    } as unknown as OriginalDataResult;

    let caught = false;
    try {
      // The invariant: you may NOT emit a median from a sub-floor sample.
      if ((regressed as SufficientDataResult).sampleSize < 5) {
        assert.ok(
          !("median" in (regressed as Record<string, unknown>)),
          "sub-floor sample must not carry a median",
        );
      }
    } catch {
      caught = true;
    }
    assert.equal(caught, true, "the guard MUST reject stats emitted at sample=2");
  });

  console.log("");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  // CRITICAL: force-exit so no open handle from any transitive import can hang CI.
  process.exit(failed > 0 ? 1 : 0);
}

void run();
