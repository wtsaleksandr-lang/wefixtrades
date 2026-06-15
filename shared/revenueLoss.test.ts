/**
 * Free-Audit Wave 2 (Agent D) — honest revenue-loss realness tests.
 *
 * The conversion audit found the report showed a hardcoded "5–15 leads /
 * $800–$2,400" placeholder as if it were business-specific even when the real
 * demand-gap math computed 0. The contract under test:
 *
 *   - A REAL measured demand-gap loss is honored verbatim (rounded to $100)
 *     with isReal:true and basis:"demand-gap".
 *   - When there is NO measured loss but the business has capture gaps, a
 *     conservative FLOOR is computed from the trade's avg ticket — a real,
 *     defensible number (isReal:true, basis:"floor"), NEVER a fake placeholder.
 *   - When there is genuinely no loss and no capture gap, isReal:false with
 *     low/high = 0 so the UI positive-frames instead of inventing a loss.
 *
 * Also guards the per-trade avg-ticket lookup that the floor math depends on.
 *
 * Runnable standalone via:
 *   npx tsx shared/revenueLoss.test.ts
 * Wired into CI as `npm run check:revenue-loss` (.github/workflows/ci.yml).
 *
 * DB-free: imports only pure functions from ./services. We set a dummy
 * DATABASE_URL first anyway (defensive, mirrors the audit guard convention) so
 * a future transitive server import can never make this hang.
 *
 * Excluded from `tsc --noEmit` via the project tsconfig's **\/*.test.ts
 * pattern. Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
}

import {
  computeRevenueLoss,
  avgTicketForTrade,
  DEFAULT_AVG_TICKET,
  TRADE_AVG_TICKET,
} from "./services";

function main() {
  /* ─── 1. avg-ticket lookup ─── */
  // Known trade resolves to its table value (HVAC = $800).
  assert.equal(avgTicketForTrade("HVAC"), 800, "HVAC avg ticket must be 800");
  assert.equal(avgTicketForTrade("hvac"), 800, "lookup is case-insensitive");
  assert.equal(avgTicketForTrade("Pest Control"), TRADE_AVG_TICKET["pest-control"], "normalizes 'Pest Control' → 'pest-control'");
  // Unknown trade falls back to the conservative default, never 0.
  assert.equal(avgTicketForTrade("underwater-basket-weaving"), DEFAULT_AVG_TICKET, "unknown trade → DEFAULT_AVG_TICKET");
  assert.equal(avgTicketForTrade(null), DEFAULT_AVG_TICKET, "null trade → DEFAULT_AVG_TICKET");
  assert.equal(avgTicketForTrade(""), DEFAULT_AVG_TICKET, "empty trade → DEFAULT_AVG_TICKET");

  /* ─── 2. REAL measured demand-gap loss is honored (isReal:true) ─── */
  {
    const r = computeRevenueLoss({
      trade: "plumbing",
      demandLoss: { low: 820, high: 2380, monthlyMissedLeads: 6 },
      floorMissedLeads: 0,
    });
    assert.equal(r.isReal, true, "a measured loss must be isReal:true");
    assert.equal(r.basis, "demand-gap", "measured loss basis must be 'demand-gap'");
    assert.equal(r.low, 800, "low rounds to nearest $100 (820 → 800)");
    assert.equal(r.high, 2400, "high rounds to nearest $100 (2380 → 2400)");
    assert.equal(r.monthlyMissedLeads, 6, "missed leads carried through");
    assert.ok(r.low > 0 && r.high >= r.low, "real loss is a positive band");
  }

  /* ─── 3. No measured loss + capture gaps → computed FLOOR (isReal:true) ─── */
  {
    // HVAC ($800 avg ticket), demand-gap math zero, but 2 capture gaps exist.
    const r = computeRevenueLoss({
      trade: "hvac",
      demandLoss: { low: 0, high: 0, monthlyMissedLeads: 0 },
      floorMissedLeads: 2,
    });
    assert.equal(r.isReal, true, "a computed floor from a real gap count is still real");
    assert.equal(r.basis, "floor", "floor path basis must be 'floor'");
    assert.equal(r.avgTicket, 800, "floor uses the trade avg ticket");
    // low = 1 lead × $800 = 800 ; high = 2 leads × $800 = 1600.
    assert.equal(r.low, 800, "floor low = 1 × avgTicket");
    assert.equal(r.high, 1600, "floor high = floorMissedLeads × avgTicket");
    assert.equal(r.monthlyMissedLeads, 2, "floor carries the gap count");
    assert.ok(r.high > r.low, "floor band is non-degenerate when leads > 1");
  }

  /* ─── 4. No measured loss + NO capture gaps → isReal:false, no fake number ─── */
  {
    const r = computeRevenueLoss({
      trade: "plumbing",
      demandLoss: { low: 0, high: 0, monthlyMissedLeads: 0 },
      floorMissedLeads: 0,
    });
    assert.equal(r.isReal, false, "zero loss + zero gaps MUST NOT fabricate a number");
    assert.equal(r.basis, "none", "no-loss basis must be 'none'");
    assert.equal(r.low, 0, "isReal:false → low is 0");
    assert.equal(r.high, 0, "isReal:false → high is 0");
    assert.equal(r.monthlyMissedLeads, 0, "isReal:false → no missed leads");
    // The avg ticket is still exposed so the UI can caption the positive frame.
    assert.equal(r.avgTicket, avgTicketForTrade("plumbing"), "avgTicket still exposed when isReal:false");
  }

  /* ─── 5. Null demand loss behaves like zero (isReal:false without gaps) ─── */
  {
    const r = computeRevenueLoss({ trade: "roofing", demandLoss: null, floorMissedLeads: 0 });
    assert.equal(r.isReal, false, "null demandLoss + no floor → isReal:false");
    assert.equal(r.basis, "none", "null demandLoss + no floor → basis 'none'");
  }

  /* ─── 6. Measured loss takes precedence over the floor ─── */
  {
    const r = computeRevenueLoss({
      trade: "hvac",
      demandLoss: { low: 1200, high: 3600, monthlyMissedLeads: 4 },
      floorMissedLeads: 3, // would compute a floor, but measured wins
    });
    assert.equal(r.basis, "demand-gap", "a real measured loss wins over the floor");
    assert.equal(r.low, 1200, "measured low preserved");
    assert.equal(r.high, 3600, "measured high preserved");
  }

  /* ─── 7. roughEstimate honest-labeling flag ─── */
  {
    // A real band (demand-gap or floor) MUST be flagged roughEstimate:true so the
    // UI labels it directional, not a precise forecast.
    const dg = computeRevenueLoss({
      trade: "plumbing",
      demandLoss: { low: 820, high: 2380, monthlyMissedLeads: 6 },
      floorMissedLeads: 0,
    });
    assert.equal(dg.roughEstimate, true, "a real demand-gap band must be flagged roughEstimate");

    const floor = computeRevenueLoss({
      trade: "hvac",
      demandLoss: null,
      floorMissedLeads: 2,
    });
    assert.equal(floor.roughEstimate, true, "a real floor band must be flagged roughEstimate");

    // No real loss → nothing to qualify → roughEstimate:false.
    const none = computeRevenueLoss({ trade: "plumbing", demandLoss: null, floorMissedLeads: 0 });
    assert.equal(none.roughEstimate, false, "isReal:false → roughEstimate:false (no band to label)");
  }

  console.log("revenueLoss.test.ts — all assertions passed");
}

// Standalone tsx guard: MUST exit(0) on success / exit(1) on failure. A
// resolved main() that left an open handle once stalled CI for an hour — so
// exit explicitly here.
try {
  main();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
