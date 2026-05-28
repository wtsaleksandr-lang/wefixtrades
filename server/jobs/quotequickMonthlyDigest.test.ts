/**
 * Wave 75 — QuoteQuick monthly digest smoke tests.
 *
 * Runnable standalone via:
 *   DATABASE_URL=postgres://test:test@127.0.0.1:5432/test_unused \
 *     npx tsx server/jobs/quotequickMonthlyDigest.test.ts
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
  console.log("Wave 75 QuoteQuick monthly digest smoke tests:\n");

  await test("worker module loads cleanly", async () => {
    const mod = await import("./quotequickMonthlyDigest");
    assert.equal(
      typeof mod.processQuotequickMonthlyDigest,
      "function",
      "processQuotequickMonthlyDigest exported",
    );
  });

  await test("email template module loads cleanly", async () => {
    const mod = await import("../lib/quotequickMonthlyDigestEmail");
    assert.equal(
      typeof mod.sendQuotequickMonthlyDigest,
      "function",
      "sendQuotequickMonthlyDigest exported",
    );
    assert.equal(
      typeof mod.composeQuotequickMonthlyDigest,
      "function",
      "composeQuotequickMonthlyDigest exported",
    );
    assert.equal(
      typeof mod.compileQuotequickMonthlyDigest,
      "function",
      "compileQuotequickMonthlyDigest exported",
    );
  });

  await test("composeQuotequickMonthlyDigest renders subject + html (real data)", async () => {
    const { composeQuotequickMonthlyDigest } = await import(
      "../lib/quotequickMonthlyDigestEmail"
    );
    const result = composeQuotequickMonthlyDigest({
      data: {
        client_id: 99,
        business_name: "Test Plumbing Co",
        recipient_email: "test@example.com",
        period_label: "April 2026",
        conversion: {
          value: 22,
          verdict: "Strong conversion",
          advice: "Your widget is converting well — keep nurturing repeat visitors.",
          data_status: "real",
        },
        peak: {
          data: [200, 350, 280, 420, 380, 540, 480, 620, 700, 580, 660, 720, 800, 750],
          peakIndex: 12,
          peakLabel: "$800 peak day",
          data_status: "real",
        },
        monthly: {
          data: [
            { label: "Nov", value: 8 },
            { label: "Dec", value: 12 },
            { label: "Jan", value: 14 },
            { label: "Feb", value: 18 },
            { label: "Mar", value: 22 },
            { label: "Apr", value: 28, highlighted: true },
          ],
          data_status: "real",
        },
        quotes_generated: 28,
        quotes_completed: 9,
        deposits_captured_cents: 425000, // $4,250
      },
      portalUrl: "https://wefixtrades.com",
      conversionChartUrl: null,
      peakChartUrl: null,
      monthlyChartUrl: null,
    });

    assert.ok(result.subject.length > 0, "subject is non-empty");
    assert.match(result.subject, /QuoteQuick/, "subject mentions product");
    assert.match(result.subject, /\$4\.3k|\$4250|\$4,250/, "subject mentions deposits captured");
    assert.ok(result.html.includes("Test Plumbing Co"), "business name in body");
    assert.ok(result.html.includes("QuoteQuick Report"), "product label in shell");
    assert.ok(
      result.html.includes("Conversion rate"),
      "conversion KPI card rendered",
    );
    assert.ok(
      result.html.includes("Best revenue day"),
      "best-day sparkline rendered",
    );
    assert.ok(
      result.html.includes("Quotes generated per month"),
      "monthly bar card rendered",
    );
    assert.ok(result.html.includes("unsubscribe"), "unsubscribe link present");
  });

  await test("composeQuotequickMonthlyDigest skips illustrative-only KPI cards", async () => {
    const { composeQuotequickMonthlyDigest } = await import(
      "../lib/quotequickMonthlyDigestEmail"
    );
    const result = composeQuotequickMonthlyDigest({
      data: {
        client_id: 99,
        business_name: "Test Plumbing Co",
        recipient_email: "test@example.com",
        period_label: "April 2026",
        conversion: {
          value: 12,
          verdict: "demo",
          advice: "demo",
          data_status: "illustrative",
        },
        peak: {
          data: [1, 2, 3],
          peakIndex: 2,
          peakLabel: "demo",
          data_status: "illustrative",
        },
        monthly: {
          data: [{ label: "Apr", value: 4, highlighted: true }],
          data_status: "illustrative",
        },
        quotes_generated: 0,
        quotes_completed: 0,
        deposits_captured_cents: 0,
      },
      portalUrl: "https://wefixtrades.com",
      conversionChartUrl: null,
      peakChartUrl: null,
      monthlyChartUrl: null,
    });

    assert.ok(
      !result.html.includes("Conversion rate (views → quotes)"),
      "conversion gauge skipped when illustrative",
    );
    assert.ok(
      !result.html.includes("Best revenue day"),
      "sparkline skipped when illustrative",
    );
    assert.ok(
      !result.html.includes("Quotes generated per month"),
      "monthly bar skipped when illustrative",
    );
  });

  console.log("");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

void run();
