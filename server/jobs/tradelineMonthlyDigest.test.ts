/**
 * Wave 75 — TradeLine monthly digest smoke tests.
 *
 * Runnable standalone via:
 *   DATABASE_URL=postgres://test:test@127.0.0.1:5432/test_unused \
 *     npx tsx server/jobs/tradelineMonthlyDigest.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig.json excludes **\/*.test.ts).
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

async function run(): Promise<void> {
  console.log("Wave 75 TradeLine monthly digest smoke tests:\n");

  await test("worker module loads cleanly", async () => {
    const mod = await import("./tradelineMonthlyDigest");
    assert.equal(
      typeof mod.processTradelineMonthlyDigest,
      "function",
      "processTradelineMonthlyDigest exported",
    );
  });

  await test("email template module loads cleanly", async () => {
    const mod = await import("../lib/tradelineMonthlyDigestEmail");
    assert.equal(
      typeof mod.sendTradelineMonthlyDigest,
      "function",
      "sendTradelineMonthlyDigest exported",
    );
    assert.equal(
      typeof mod.composeTradelineMonthlyDigest,
      "function",
      "composeTradelineMonthlyDigest exported",
    );
    assert.equal(
      typeof mod.compileTradelineMonthlyDigest,
      "function",
      "compileTradelineMonthlyDigest exported",
    );
  });

  await test("composeTradelineMonthlyDigest renders subject + html (real data)", async () => {
    const { composeTradelineMonthlyDigest } = await import(
      "../lib/tradelineMonthlyDigestEmail"
    );
    const result = composeTradelineMonthlyDigest({
      data: {
        client_id: 99,
        business_name: "Test Plumbing Co",
        recipient_email: "test@example.com",
        period_label: "April 2026",
        csat: {
          value: 84,
          verdict: "Excellent",
          advice: "Customers are happy — keep response times tight.",
          data_status: "real",
        },
        peak: {
          data: [
            0, 0, 0, 0, 0, 1, 2, 4, 7, 9, 11, 12, 10, 8, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0,
          ],
          peakIndex: 11,
          peakLabel: "Peak hour: 11:00",
          data_status: "real",
        },
        calls_total: 60,
        calls_answered: 52,
        calls_missed: 8,
        bookings_captured: 18,
        approx_hours_saved: 6,
      },
      portalUrl: "https://wefixtrades.com",
      csatChartUrl: null,
      callsChartUrl: null,
      peakChartUrl: null,
    });

    assert.ok(result.subject.length > 0, "subject is non-empty");
    assert.match(result.subject, /TradeLine/, "subject mentions product");
    assert.match(result.subject, /60 call/, "subject mentions call count");
    assert.ok(result.html.includes("Test Plumbing Co"), "business name in body");
    assert.ok(result.html.includes("TradeLine Report"), "product label in shell");
    assert.ok(
      result.html.includes("Customer satisfaction score") ||
      result.html.includes("CSAT"),
      "CSAT gauge rendered",
    );
    assert.ok(
      result.html.includes("Calls answered vs missed"),
      "calls comparison rendered",
    );
    assert.ok(
      result.html.includes("Peak call hour"),
      "peak hour sparkline rendered",
    );
    assert.ok(result.html.includes("unsubscribe"), "unsubscribe link present");
  });

  await test("composeTradelineMonthlyDigest hides cards with illustrative data", async () => {
    const { composeTradelineMonthlyDigest } = await import(
      "../lib/tradelineMonthlyDigestEmail"
    );
    const result = composeTradelineMonthlyDigest({
      data: {
        client_id: 99,
        business_name: "Test Plumbing Co",
        recipient_email: "test@example.com",
        period_label: "April 2026",
        csat: {
          value: 70,
          verdict: "Good",
          advice: "demo",
          data_status: "illustrative",
        },
        peak: {
          data: [1, 2, 3],
          peakIndex: 2,
          peakLabel: "demo",
          data_status: "illustrative",
        },
        calls_total: 0,
        calls_answered: 0,
        calls_missed: 0,
        bookings_captured: 0,
        approx_hours_saved: 0,
      },
      portalUrl: "https://wefixtrades.com",
      csatChartUrl: null,
      callsChartUrl: null,
      peakChartUrl: null,
    });

    assert.ok(
      !result.html.includes("Customer satisfaction score"),
      "CSAT gauge skipped when illustrative",
    );
    assert.ok(
      !result.html.includes("Calls answered vs missed"),
      "calls comparison skipped when no calls",
    );
    assert.ok(
      !result.html.includes("Peak call hour"),
      "peak hour sparkline skipped when illustrative",
    );
  });

  console.log("");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

void run();
