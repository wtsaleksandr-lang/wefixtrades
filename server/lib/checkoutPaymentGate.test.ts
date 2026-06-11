/**
 * Lane C — checkout payment-status gate tests.
 *
 * Excluded from `tsc --noEmit` (tsconfig **\/*.test.ts). Runnable
 * standalone via:
 *
 *   npx tsx server/lib/checkoutPaymentGate.test.ts
 *
 * Uses node's built-in `assert/strict`. No test runner dep added.
 *
 * Coverage (regression contract for the async-payment security fix):
 *   1. DELIBERATE-FAILURE FIXTURE: a real-shaped ACH session with
 *      payment_status "unpaid" must NOT be provisionable. This is the
 *      exact pre-fix bug — if someone removes the gate's unpaid branch
 *      (or flips the default to provision), this test fails.
 *   2. paid → provision
 *   3. no_payment_required (100% promo / trial) → provision
 *   4. fail-closed on null / undefined / unknown statuses
 *   5. verifyCheckoutSessionPaid (checkout-login belt-and-braces):
 *      paid → ok; unpaid → refused; fabricated session id (Stripe
 *      resource_missing throw) → refused; null session → refused.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  gateCheckoutSession,
  isProvisionablePaymentStatus,
  verifyCheckoutSessionPaid,
} from "./checkoutPaymentGate";

let passed = 0;
let failed = 0;

function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      // eslint-disable-next-line no-console
      console.log(`  ok  ${label}`);
    })
    .catch((err: any) => {
      failed++;
      // eslint-disable-next-line no-console
      console.error(`  FAIL ${label}: ${err?.message ?? err}`);
    });
}

/**
 * Deliberate-failure fixture: the shape Stripe actually delivers for a
 * checkout.session.completed event paid via us_bank_account (ACH).
 * The Checkout UI is done, the event has fired — but the money has NOT
 * settled and can still bounce. Pre-fix, the webhook provisioned
 * services + stored the auto-login token for exactly this payload.
 */
const ACH_UNPAID_SESSION = {
  id: "cs_test_ach_delayed_001",
  object: "checkout.session",
  status: "complete",
  payment_status: "unpaid", // ← the trap: session "completed" but money pending
  amount_total: 49900,
  currency: "usd",
  metadata: {
    source: "public_checkout",
    crm_client_id: "42",
    service_catalog_id: "mapguard-pro",
  },
} as const;

const PAID_SESSION = {
  ...ACH_UNPAID_SESSION,
  id: "cs_test_paid_001",
  payment_status: "paid",
} as const;

async function main() {
  // 1 — THE regression test for the security fix.
  await check("DELIBERATE-FAILURE FIXTURE: ACH unpaid session must NOT provision", () => {
    const decision = gateCheckoutSession(ACH_UNPAID_SESSION.payment_status);
    assert.notEqual(
      decision,
      "provision",
      "SECURITY REGRESSION: an unpaid (delayed ACH) session was gated as provisionable — " +
        "a customer whose payment later fails would get a live account + services",
    );
    assert.equal(decision, "defer_async_payment");
    assert.equal(isProvisionablePaymentStatus(ACH_UNPAID_SESSION.payment_status), false);
  });

  // 2
  await check("paid session → provision", () => {
    assert.equal(gateCheckoutSession(PAID_SESSION.payment_status), "provision");
    assert.equal(isProvisionablePaymentStatus("paid"), true);
  });

  // 3
  await check("no_payment_required (trial / 100% promo) → provision", () => {
    assert.equal(gateCheckoutSession("no_payment_required"), "provision");
  });

  // 4 — fail closed on anything not positively settled.
  await check("missing / unknown payment_status fails closed (defer)", () => {
    assert.equal(gateCheckoutSession(null), "defer_async_payment");
    assert.equal(gateCheckoutSession(undefined), "defer_async_payment");
    assert.equal(gateCheckoutSession(""), "defer_async_payment");
    assert.equal(gateCheckoutSession("partially_paid_or_future_status"), "defer_async_payment");
  });

  // 5a — checkout-login verification: paid session grants.
  await check("verifyCheckoutSessionPaid: paid session → ok", async () => {
    const result = await verifyCheckoutSessionPaid("cs_test_paid_001", async (sid) => {
      assert.equal(sid, "cs_test_paid_001");
      return { payment_status: "paid" };
    });
    assert.equal(result.ok, true);
    assert.equal(result.reason, "paid");
  });

  // 5b — unpaid session refused even if a token somehow existed.
  await check("verifyCheckoutSessionPaid: unpaid session → refused", async () => {
    const result = await verifyCheckoutSessionPaid(
      ACH_UNPAID_SESSION.id,
      async () => ({ payment_status: "unpaid" }),
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unpaid");
  });

  // 5c — fabricated session id: Stripe throws resource_missing → refused.
  await check("verifyCheckoutSessionPaid: fabricated session id (Stripe throw) → refused", async () => {
    const result = await verifyCheckoutSessionPaid("cs_live_FABRICATED_attacker", async () => {
      const err: any = new Error("No such checkout.session: 'cs_live_FABRICATED_attacker'");
      err.code = "resource_missing";
      throw err;
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "retrieve_failed");
  });

  // 5d — null/undefined session → refused.
  await check("verifyCheckoutSessionPaid: empty retrieval → refused", async () => {
    const result = await verifyCheckoutSessionPaid("cs_test_void", async () => null);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_found");
  });

  // 5e — no_payment_required also grants (parity with the webhook gate).
  await check("verifyCheckoutSessionPaid: no_payment_required → ok", async () => {
    const result = await verifyCheckoutSessionPaid(
      "cs_test_promo",
      async () => ({ payment_status: "no_payment_required" }),
    );
    assert.equal(result.ok, true);
  });

  /* ─── Webhook wiring contract ─────────────────────────────────────
   * The webhook handler imports db/storage at module load (needs a live
   * DATABASE_URL), so we can't execute it here without a full harness.
   * Instead, pin the wiring as a source contract: the gate is only a
   * fix if (a) handleCheckoutCompleted actually calls it before any
   * provisioning, (b) async_payment_succeeded re-enters the SAME
   * provisioning pipeline (completing provisioning + login token), and
   * (c) async_payment_failed routes to the cleanup handler. Deleting
   * any of those lines fails this test. */
  const routeSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "routes", "stripeBillingRoutes.ts"),
    "utf-8",
  );

  await check("wiring: handleCheckoutCompleted is gated on payment_status", () => {
    const body = routeSource.slice(routeSource.indexOf("async function handleCheckoutCompleted"));
    const gateIdx = body.indexOf("gateCheckoutSession(session.payment_status)");
    assert.ok(gateIdx !== -1, "handleCheckoutCompleted must call gateCheckoutSession");
    // The gate must run BEFORE the first provisioning dispatch.
    const firstDispatch = body.indexOf("handleQuoteQuickCheckout(session)");
    assert.ok(firstDispatch === -1 || gateIdx < firstDispatch, "gate must precede provisioning dispatch");
  });

  await check("wiring: async_payment_succeeded completes provisioning via the same pipeline", () => {
    const caseIdx = routeSource.indexOf('case "checkout.session.async_payment_succeeded"');
    assert.ok(caseIdx !== -1, "webhook must handle checkout.session.async_payment_succeeded");
    const caseBlock = routeSource.slice(caseIdx, routeSource.indexOf("break;", caseIdx));
    assert.ok(
      caseBlock.includes("handleCheckoutCompleted(session)"),
      "async_payment_succeeded must run the full provisioning pipeline (provision + login token)",
    );
  });

  await check("wiring: async_payment_failed routes to cleanup (never provisions)", () => {
    const caseIdx = routeSource.indexOf('case "checkout.session.async_payment_failed"');
    assert.ok(caseIdx !== -1, "webhook must handle checkout.session.async_payment_failed");
    const caseBlock = routeSource.slice(caseIdx, routeSource.indexOf("break;", caseIdx));
    assert.ok(caseBlock.includes("handleCheckoutAsyncPaymentFailed("));
    assert.ok(!caseBlock.includes("handleCheckoutCompleted("), "failed payments must never provision");
    // And the cleanup handler must drop any stored login token.
    const failedHandler = routeSource.slice(
      routeSource.indexOf("async function handleCheckoutAsyncPaymentFailed"),
    );
    assert.ok(failedHandler.includes("deleteCheckoutLoginToken(session.id)"));
  });

  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
