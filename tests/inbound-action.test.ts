/**
 * Gate test for the classifier routing fix (backlog-C Phase A): a hot-but-complex
 * buyer on the brand VOICE line must stay inline with Riley to be closed, NOT get
 * punted to a no-op ticket — while SMS/chat behaviour and the availability-off
 * take-a-message path are unchanged.
 *
 * Tests the pure `resolveInboundAction` (no I/O). Regression-catching: the SAME
 * inputs (needs_human + available) must flip reply↔ticket based ONLY on
 * keepComplexInline — so if the flag handling is removed, the test fails.
 *
 * Run: tsx tests/inbound-action.test.ts  (DATABASE_URL may be a dummy — the
 * module imports storage at load, but resolveInboundAction itself is pure.)
 */

import { resolveInboundAction, classifyInbound } from "../server/services/inboundClassifier";

let failures = 0;
function check(name: string, got: string, want: string) {
  if (got === want) console.log(`  ✓ ${name} → ${got}`);
  else { failures++; console.error(`  ✗ ${name} → got ${got}, want ${want}`); }
}
function checkBool(name: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}`); }
}

console.log("inbound-action: spam / out-of-scope unaffected by the voice flag");
check("spam → drop", resolveInboundAction({ category: "spam", isAvailable: true, keepComplexInline: true }), "drop");
check("out_of_scope → polite_decline", resolveInboundAction({ category: "out_of_scope", isAvailable: true, keepComplexInline: true }), "polite_decline");

console.log("inbound-action: THE FIX — needs_human + available flips on keepComplexInline");
check("needs_human + available + keepComplexInline (voice/Riley) → reply (NOT ticket)",
  resolveInboundAction({ category: "needs_human", isAvailable: true, keepComplexInline: true }), "reply");
check("needs_human + available + NO flag (sms/chat) → ticket (unchanged)",
  resolveInboundAction({ category: "needs_human", isAvailable: true }), "ticket");
check("needs_human + available + flag explicitly false → ticket",
  resolveInboundAction({ category: "needs_human", isAvailable: true, keepComplexInline: false }), "ticket");

console.log("inbound-action: availability-off always takes a message (flag cannot override)");
check("needs_human + UNAVAILABLE + keepComplexInline → ticket (availability wins)",
  resolveInboundAction({ category: "needs_human", isAvailable: false, keepComplexInline: true }), "ticket");
check("legitimate + UNAVAILABLE → ticket (take a message)",
  resolveInboundAction({ category: "legitimate", isAvailable: false }), "ticket");

console.log("inbound-action: legitimate while available → reply");
check("legitimate + available → reply",
  resolveInboundAction({ category: "legitimate", isAvailable: true }), "reply");
check("legitimate + available + flag → reply (flag only affects needs_human)",
  resolveInboundAction({ category: "legitimate", isAvailable: true, keepComplexInline: true }), "reply");

// Emergency keyword detection — heuristic pre-check must route to needs_human
// BEFORE the AI model call so a timeout can never drop an emergency.
console.log("inbound-action: emergency keyword heuristic (life-safety gate)");
(async () => {
  const emergencies = [
    "I smell gas in my kitchen",
    "My house is on fire!",
    "Someone got an electrical shock",
    "There's a downed power line outside",
    "CO alarm is going off",
    "Call 911 please",
  ];
  for (const msg of emergencies) {
    const r = await classifyInbound(msg);
    checkBool(`"${msg}" → needs_human`, r.category === "needs_human" && r.confidence === 1.0);
  }
  // Sanity: a normal message should NOT trip the emergency heuristic
  const normal = await classifyInbound("crypto investment opportunity");
  checkBool("spam still routes to spam (not emergency)", normal.category === "spam");

  if (failures > 0) {
    console.error(`\ninbound-action: ${failures} assertion(s) FAILED`);
    process.exit(1);
  }
  console.log("\ninbound-action: all assertions passed");
  process.exit(0);
})();
