/**
 * Pure CRM-KPI math regression test (DB-free).
 *
 * Covers server/lib/crmKpiMath.ts — the period-over-period delta + churn-rate
 * helpers behind the admin overview MRR/subscribers/collected cards.
 *
 *   1. pctDelta normal growth / decline rounding.
 *   2. pctDelta null when there is no prior baseline (prev <= 0) — the UI
 *      shows "new" instead of a misleading "+100%" / NaN.
 *   3. pctDelta guards non-finite inputs.
 *   4. churnRate ratio + divide-by-zero guard.
 *   5. DELIBERATE FAILURE — a regression that made pctDelta return 0 (instead
 *      of null) on a zero baseline would flip case 2 red. Asserted explicitly.
 *
 * No test-runner dep (assert/strict only). Run standalone:
 *   npx tsx tests/crm-kpi-math.test.ts
 */

import assert from "node:assert/strict";
import { pctDelta, churnRate } from "../server/lib/crmKpiMath";

let passed = 0;
function ok(label: string) {
  passed += 1;
  console.log(`  PASS ${label}`);
}

function main(): void {
  /* ── 1. growth + decline rounding ── */
  assert.equal(pctDelta(112, 100), 12, "+12% growth");
  assert.equal(pctDelta(88, 100), -12, "-12% decline");
  assert.equal(pctDelta(150, 100), 50);
  assert.equal(pctDelta(133, 100), 33, "rounds .33 → 33");
  ok("pctDelta computes rounded percent change");

  /* ── 2. no prior baseline → null (NOT 0, NOT +100%) ── */
  assert.equal(pctDelta(500, 0), null, "prev=0 → null");
  assert.equal(pctDelta(0, 0), null);
  assert.equal(pctDelta(10, -5), null, "negative prev → null");
  ok("pctDelta returns null when there is no prior-period baseline");

  /* ── 3. non-finite guard ── */
  assert.equal(pctDelta(NaN, 100), null);
  assert.equal(pctDelta(100, NaN), null);
  assert.equal(pctDelta(Infinity, 100), null);
  ok("pctDelta guards non-finite inputs");

  /* ── 4. churn rate ── */
  assert.equal(churnRate(2, 8), 0.2, "2 of 10 churned");
  assert.equal(churnRate(0, 10), 0, "nobody churned");
  assert.equal(churnRate(0, 0), 0, "nobody at risk → 0, no divide-by-zero");
  assert.equal(churnRate(5, 5), 0.5);
  ok("churnRate computes cancelled / (active + cancelled) with zero guard");

  /* ── 5. deliberate-failure anchor ── */
  assert.notEqual(
    pctDelta(50, 0),
    0,
    "regression guard: zero baseline must be null, not a real 0% delta",
  );
  ok("deliberate-failure anchor: zero baseline never reads as 0%");
}

try {
  main();
  console.log(`[crm-kpi-math] ALL ${passed} cases passed`);
} catch (err) {
  console.error("[crm-kpi-math] FAIL");
  console.error(err);
  process.exit(1);
}
