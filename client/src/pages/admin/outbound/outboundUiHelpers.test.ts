/**
 * Lane OC — outbound UI helper tests (SendingPage pure logic).
 *
 * Runnable standalone via:
 *   npx tsx client/src/pages/admin/outbound/outboundUiHelpers.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig.json excludes **\/*.test.ts).
 * The repo has no React component-test harness (standalone tsx + Playwright
 * e2e are the conventions), so the SendingPage's logic lives in
 * outboundUiHelpers.ts — React-free — and is covered here; the rendered
 * page is covered by the merge-time visual-review pass.
 */

import assert from "node:assert/strict";
import {
  normalizeSendingRows, warmupAgeDays, ratePercent, formatRate, rateSeverity,
  statusCounts,
  BOUNCE_WARN_PCT, BOUNCE_CRITICAL_PCT, COMPLAINT_WARN_PCT, COMPLAINT_CRITICAL_PCT,
  type SendingDomainRow,
} from "./outboundUiHelpers";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

console.log("Lane OC outbound UI helper tests:\n");

const row = (over: Partial<SendingDomainRow> = {}): SendingDomainRow => ({
  id: 1,
  domain: "mail.example.com",
  status: "active",
  warmup_started_at: null,
  daily_cap: 40,
  bounce_rate: null,
  complaint_rate: null,
  ...over,
});

test("normalizeSendingRows accepts bare array / {data} / {domains} / junk", () => {
  const rows = [row()];
  assert.deepEqual(normalizeSendingRows(rows), rows);
  assert.deepEqual(normalizeSendingRows({ data: rows }), rows);
  assert.deepEqual(normalizeSendingRows({ domains: rows }), rows);
  assert.deepEqual(normalizeSendingRows(null), []);
  assert.deepEqual(normalizeSendingRows("nope"), []);
  assert.deepEqual(normalizeSendingRows({ total: 3 }), []);
});

test("warmupAgeDays: whole days, null on missing/invalid, 0 on future", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  assert.equal(warmupAgeDays("2026-06-01T00:00:00Z", now), 9);
  assert.equal(warmupAgeDays("2026-06-10T00:00:00Z", now), 0);
  assert.equal(warmupAgeDays("2026-06-11T00:00:00Z", now), 0); // clock skew → never negative
  assert.equal(warmupAgeDays(null, now), null);
  assert.equal(warmupAgeDays("not-a-date", now), null);
});

test("ratePercent: fraction vs percent disambiguation + pg string decimals", () => {
  assert.equal(ratePercent(0.023), 2.3);            // fraction → percent
  assert.equal(ratePercent("0.023"), 2.3);          // pg decimal string
  assert.equal(ratePercent(2.3), 2.3);              // already percent
  assert.equal(ratePercent("2.3"), 2.3);
  assert.equal(ratePercent(1), 100);                // boundary: 1 = 100%
  assert.equal(ratePercent(0), 0);
  assert.equal(ratePercent(null), null);
  assert.equal(ratePercent(""), null);
  assert.equal(ratePercent("junk"), null);
  assert.equal(ratePercent(-0.5), null);            // negative rates are invalid
});

test("formatRate renders percent strings and em-dash for missing", () => {
  assert.equal(formatRate(0.05), "5%");
  assert.equal(formatRate("0.023"), "2.3%");
  assert.equal(formatRate(null), "—");
  assert.equal(formatRate(undefined), "—");
});

test("rateSeverity thresholds bite (deliberate-failure fixtures)", () => {
  // bounce: warn at 2%, critical at 5%
  assert.equal(rateSeverity(0.01, BOUNCE_WARN_PCT, BOUNCE_CRITICAL_PCT), "ok");        // 1%
  assert.equal(rateSeverity(0.02, BOUNCE_WARN_PCT, BOUNCE_CRITICAL_PCT), "warn");      // 2%
  assert.equal(rateSeverity("0.05", BOUNCE_WARN_PCT, BOUNCE_CRITICAL_PCT), "critical");// 5%
  // complaint: warn at 0.1%, critical at 0.3%
  assert.equal(rateSeverity(0.0005, COMPLAINT_WARN_PCT, COMPLAINT_CRITICAL_PCT), "ok");      // 0.05%
  assert.equal(rateSeverity(0.001, COMPLAINT_WARN_PCT, COMPLAINT_CRITICAL_PCT), "warn");     // 0.1%
  assert.equal(rateSeverity(0.004, COMPLAINT_WARN_PCT, COMPLAINT_CRITICAL_PCT), "critical"); // 0.4%
  // missing data never alarms
  assert.equal(rateSeverity(null, BOUNCE_WARN_PCT, BOUNCE_CRITICAL_PCT), "ok");
});

test("statusCounts tallies the four pool states and ignores unknowns", () => {
  const rows = [
    row({ status: "warming" }),
    row({ id: 2, status: "active" }),
    row({ id: 3, status: "active" }),
    row({ id: 4, status: "paused" }),
    row({ id: 5, status: "burned" }),
    row({ id: 6, status: "weird-future-status" }),
  ];
  assert.deepEqual(statusCounts(rows), { warming: 1, active: 2, paused: 1, burned: 1 });
  assert.deepEqual(statusCounts([]), { warming: 0, active: 0, paused: 0, burned: 0 });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
