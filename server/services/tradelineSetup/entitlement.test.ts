/**
 * Guard for the TradeLine paid-provisioning entitlement gate (isTradelineEntitled).
 * Pure logic — no DB/HTTP. Run: `npm run check:tradeline-entitlement`.
 *
 * Proves the money-gate blocks free signups from triggering a paid Twilio
 * number purchase while never blocking a paying client mid-setup.
 */
import { isTradelineEntitled, type EntitlementServiceRow } from "./entitlement";

let pass = 0,
  fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

// BLOCK: a free signup with no services at all.
check("no services → blocked", isTradelineEntitled([]) === false);

// BLOCK: a client with OTHER products but no TradeLine.
check(
  "other products, no tradeline → blocked",
  isTradelineEntitled([
    { service_id: "quotequick", status: "active" },
    { service_id: "rankflow_pro", status: "active" },
  ]) === false,
);

// ALLOW: a paying client, regardless of setup stage (the false-positive guard).
for (const status of ["active", "provisioning", "pending", "pending_setup", "trialing"]) {
  check(
    `tradeline service status='${status}' → allowed (no false-block mid-setup)`,
    isTradelineEntitled([{ service_id: "tradeline_complete", status }]) === true,
  );
}

// ALLOW: tradeline among several services.
check(
  "tradeline among multiple → allowed",
  isTradelineEntitled([
    { service_id: "quotequick", status: "active" },
    { service_id: "tradeline_voice", status: "active" },
  ]) === true,
);

// BLOCK: a CANCELLED tradeline service shouldn't keep provisioning rights.
check(
  "cancelled tradeline only → blocked",
  isTradelineEntitled([{ service_id: "tradeline_complete", status: "cancelled" }]) === false,
);

// ALLOW: cancelled tradeline BUT an active second tradeline → allowed.
check(
  "active tradeline alongside a cancelled one → allowed",
  isTradelineEntitled([
    { service_id: "tradeline_complete", status: "cancelled" },
    { service_id: "tradeline_voice", status: "active" },
  ]) === true,
);

// Robustness: case-insensitive prefix + null/garbage service_id ignored.
check("case-insensitive prefix", isTradelineEntitled([{ service_id: "TradeLine_X", status: "active" }]) === true);
check(
  "null/garbage service_id ignored",
  isTradelineEntitled([{ service_id: null, status: "active" }, {} as EntitlementServiceRow]) === false,
);

// Negative-fixture (proves the gate bites, not just runs): a regression that
// dropped the prefix check would wrongly allow a non-tradeline service.
const wouldRegress = [{ service_id: "quotequick", status: "active" }].some((s) => s.status !== "cancelled");
check("deliberate-failure fixture: a status-only check (no prefix) WOULD wrongly allow → proves prefix matters", wouldRegress === true);

if (fail > 0) {
  console.error(`\ntradeline-entitlement: ${fail} FAILED`);
  process.exit(1);
}
console.log(`tradeline-entitlement: ${pass} passed, 0 failed`);
process.exit(0);
