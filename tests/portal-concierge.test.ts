/**
 * Gate test for backlog-D: the Portal Concierge.
 *
 * (1) Niche parity on web: buildConciergeAddendum (now attached to the live web
 *     portal help prompt) must give real PER-TRADE owner coaching that varies by
 *     trade and falls back to generic for an unmatched trade. This is the content
 *     that was previously dark on the web surface.
 * (2) Latent safety bug: the two portal account-WRITE actions
 *     (set_notification_preference, update_business_hours) must NOT be "auto"
 *     tier — every live-system write goes through the confirm card. Reads stay
 *     auto; the draft stays draft.
 *
 * Regression-catching: if the niche wiring regresses to a constant the per-trade
 * assertions fail; if a write is flipped back to "auto" that assertion fails.
 *
 * Run: tsx tests/portal-concierge.test.ts  (DATABASE_URL may be a dummy.)
 */

import { buildConciergeAddendum } from "../server/services/portalConciergeTemplates";
// Importing portalTools runs its registerCopilotAction() side effects, so the
// portal actions (with their riskTier) are in the registry for this test.
import "../server/services/portalTools";
import { getCopilotActionsForSurface } from "../server/services/copilotActionRegistry";

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}

console.log("portal-concierge: per-trade owner coaching reaches the web (varies by trade, generic fallback)");
{
  const plumbing = buildConciergeAddendum("plumbing");
  const electrical = buildConciergeAddendum("electrical");
  const generic = buildConciergeAddendum(null);
  const unmatched = buildConciergeAddendum("zzz-not-a-real-trade");

  check("plumbing concierge is substantial", plumbing.length > 50, plumbing.length);
  check("plumbing and electrical concierge differ (real per-trade content)", plumbing !== electrical);
  check("a matched trade differs from generic", plumbing !== generic);
  check("unmatched/mistyped trade falls back to the generic concierge", unmatched === generic);
  check("empty/undefined trade falls back to generic", buildConciergeAddendum(undefined) === generic);
}

console.log("portal-concierge: account WRITES are confirm-gated, not auto (latent safety fix)");
{
  const portalActions = getCopilotActionsForSurface("portal");
  const byName = (n: string) => portalActions.find((a: any) => a.name === n) as any;

  const setNotif = byName("set_notification_preference");
  const updateHours = byName("update_business_hours");
  check("set_notification_preference exists", !!setNotif);
  check("update_business_hours exists", !!updateHours);
  check("set_notification_preference is NOT auto (confirm-gated)", setNotif?.riskTier !== "auto", setNotif?.riskTier);
  check("set_notification_preference is low/confirm tier", setNotif?.riskTier === "low", setNotif?.riskTier);
  check("update_business_hours is NOT auto (confirm-gated)", updateHours?.riskTier !== "auto", updateHours?.riskTier);
  check("update_business_hours is low/confirm tier", updateHours?.riskTier === "low", updateHours?.riskTier);

  // Sanity: reads may stay auto, the draft stays draft — proves only the writes were demoted.
  const lookup = byName("look_up_product_info");
  const draft = byName("draft_invoice");
  check("read tool look_up_product_info stays auto (reads are safe)", lookup?.riskTier === "auto", lookup?.riskTier);
  check("draft_invoice stays draft", draft?.riskTier === "draft", draft?.riskTier);
}

if (failures > 0) {
  console.error(`\nportal-concierge: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nportal-concierge: all assertions passed");
process.exit(0);
