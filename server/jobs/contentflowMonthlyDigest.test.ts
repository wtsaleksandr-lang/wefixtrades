/**
 * Wave 75 — ContentFlow monthly digest smoke tests.
 *
 * Runnable standalone via:
 *   DATABASE_URL=postgres://test:test@127.0.0.1:5432/test_unused \
 *     npx tsx server/jobs/contentflowMonthlyDigest.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig.json excludes **\/*.test.ts).
 *
 * Pattern matches server/routes/portal/wave73KpiStats.test.ts — node
 * assert/strict, no test-runner dep, no live DB required for the
 * compose-pure paths.
 *
 * Coverage:
 *   1. Module import smoke (catches column-rename drift)
 *   2. Worker function exported
 *   3. composeContentflowMonthlyDigest renders without throwing
 *   4. Subject is set and non-empty
 *   5. Hero card + KPI cards rendered into html
 *   6. Footer (unsubscribe link) present
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
  console.log("Wave 75 ContentFlow monthly digest smoke tests:\n");

  await test("worker module loads cleanly", async () => {
    const mod = await import("./contentflowMonthlyDigest");
    assert.equal(
      typeof mod.processContentflowMonthlyDigest,
      "function",
      "processContentflowMonthlyDigest exported",
    );
  });

  await test("email template module loads cleanly", async () => {
    const mod = await import("../lib/contentflowMonthlyDigestEmail");
    assert.equal(
      typeof mod.sendContentflowMonthlyDigest,
      "function",
      "sendContentflowMonthlyDigest exported",
    );
    assert.equal(
      typeof mod.composeContentflowMonthlyDigest,
      "function",
      "composeContentflowMonthlyDigest exported",
    );
    assert.equal(
      typeof mod.compileContentflowMonthlyDigest,
      "function",
      "compileContentflowMonthlyDigest exported",
    );
  });

  await test("composeContentflowMonthlyDigest renders subject + html (real data)", async () => {
    const { composeContentflowMonthlyDigest } = await import(
      "../lib/contentflowMonthlyDigestEmail"
    );
    const result = composeContentflowMonthlyDigest({
      data: {
        client_id: 99,
        business_name: "Test Plumbing Co",
        recipient_email: "test@example.com",
        period_label: "April 2026",
        monthly: {
          data: [
            { label: "Nov", value: 2 },
            { label: "Dec", value: 4 },
            { label: "Jan", value: 5 },
            { label: "Feb", value: 6 },
            { label: "Mar", value: 8 },
            { label: "Apr", value: 11, highlighted: true },
          ],
          data_status: "real",
        },
        segments: {
          data: [
            { label: "Article", value: 4 },
            { label: "Social post", value: 6 },
            { label: "Image", value: 1 },
          ],
          data_status: "real",
        },
        peak: {
          data: [1, 2, 1, 3, 4, 2, 5, 3, 6, 4, 7, 5, 8, 6],
          peakIndex: 12,
          peakLabel: "8 on best day",
          data_status: "real",
        },
      },
      portalUrl: "https://wefixtrades.com",
      monthlyChartUrl: null,
      segmentsChartUrl: null,
      peakChartUrl: null,
    });

    assert.ok(result.subject.length > 0, "subject is non-empty");
    assert.match(result.subject, /ContentFlow/, "subject mentions product");
    assert.match(result.subject, /April 2026/, "subject mentions period");
    assert.ok(result.html.includes("Test Plumbing Co"), "business name in body");
    assert.ok(result.html.includes("ContentFlow Report"), "product label in shell");
    assert.ok(
      result.html.includes("Posts published per month"),
      "monthly KPI card rendered",
    );
    assert.ok(
      result.html.includes("Content type mix"),
      "donut KPI card rendered",
    );
    assert.ok(
      result.html.includes("Top publishing day"),
      "sparkline KPI card rendered",
    );
    assert.ok(result.html.includes("unsubscribe"), "unsubscribe link present");
    assert.equal(result.posts_this_month, 11, "posts_this_month surfaced");
  });

  await test("composeContentflowMonthlyDigest skips illustrative-only KPI cards", async () => {
    const { composeContentflowMonthlyDigest } = await import(
      "../lib/contentflowMonthlyDigestEmail"
    );
    const result = composeContentflowMonthlyDigest({
      data: {
        client_id: 99,
        business_name: "Test Plumbing Co",
        recipient_email: "test@example.com",
        period_label: "April 2026",
        monthly: {
          data: [{ label: "Apr", value: 3, highlighted: true }],
          data_status: "real",
        },
        segments: {
          data: [
            { label: "Article", value: 4 },
            { label: "Social post", value: 6 },
          ],
          data_status: "illustrative",
        },
        peak: {
          data: [1, 2, 3, 4],
          peakIndex: 3,
          peakLabel: "demo",
          data_status: "illustrative",
        },
      },
      portalUrl: "https://wefixtrades.com",
      monthlyChartUrl: null,
      segmentsChartUrl: null,
      peakChartUrl: null,
    });

    assert.ok(
      !result.html.includes("Content type mix"),
      "donut skipped when illustrative",
    );
    assert.ok(
      !result.html.includes("Top publishing day"),
      "sparkline skipped when illustrative",
    );
  });

  console.log("");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

void run();
