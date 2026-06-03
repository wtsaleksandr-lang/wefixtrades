/**
 * Gate test for the self-learning apply-handoff preconditions (backlog F).
 *
 * The apply/rollback endpoints write to a live agent brain, so the guards that
 * decide what may be applied/rolled back are safety-critical. These pure
 * functions are the regression-catchers:
 *   - only an APPROVED, not-yet-applied candidate may be applied (no double-apply);
 *   - only an APPLIED candidate WITH a linked KB entry may be rolled back.
 *
 * Run: tsx tests/learning-apply.test.ts  (DATABASE_URL may be a dummy — the route
 * module imports db at load, but the guard functions are pure.)
 */

import { canApplyCandidate, canRollbackCandidate } from "../server/routes/adminTradelineLearningRoutes";

let failures = 0;
function check(name: string, got: boolean, want: boolean) {
  if (got === want) console.log(`  ✓ ${name} → ${got}`);
  else { failures++; console.error(`  ✗ ${name} → got ${got}, want ${want}`); }
}

console.log("learning-apply: canApplyCandidate (only approved + not-yet-applied)");
check("approved, not applied → can apply", canApplyCandidate({ status: "approved", applied_at: null }), true);
check("pending → cannot apply", canApplyCandidate({ status: "pending", applied_at: null }), false);
check("rejected → cannot apply", canApplyCandidate({ status: "rejected", applied_at: null }), false);
check("already applied (status) → cannot re-apply", canApplyCandidate({ status: "applied", applied_at: new Date() }), false);
check("approved but applied_at set → cannot double-apply", canApplyCandidate({ status: "approved", applied_at: new Date() }), false);

console.log("learning-apply: canRollbackCandidate (only applied + linked KB)");
check("applied + kb id → can rollback", canRollbackCandidate({ status: "applied", applied_kb_id: "kb_123" }), true);
check("approved → cannot rollback", canRollbackCandidate({ status: "approved", applied_kb_id: null }), false);
check("pending → cannot rollback", canRollbackCandidate({ status: "pending", applied_kb_id: null }), false);
check("applied but no kb id → cannot rollback (nothing to archive)", canRollbackCandidate({ status: "applied", applied_kb_id: null }), false);

if (failures > 0) {
  console.error(`\nlearning-apply: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nlearning-apply: all assertions passed");
process.exit(0);
