/**
 * Checkout payment-status gate (Lane C security fix).
 *
 * Stripe fires `checkout.session.completed` as soon as the customer
 * finishes the Checkout UI — for delayed-notification payment methods
 * (ACH / us_bank_account, acss_debit, etc.) the session arrives with
 * `payment_status === "unpaid"` and the money may STILL bounce days
 * later. Provisioning services / storing an auto-login token off that
 * event without checking `payment_status` hands a live account to a
 * customer whose payment subsequently fails.
 *
 * Canonical flow (mirrors the existing correct pattern at
 * server/routes/bookingRoutes.ts:287):
 *
 *   completed + payment_status "paid"                → provision now
 *   completed + payment_status "no_payment_required" → provision now
 *                (100% promo / trial sessions — Stripe's documented
 *                "nothing owed" status)
 *   completed + payment_status "unpaid"              → DEFER. Stripe will
 *                later fire `checkout.session.async_payment_succeeded`
 *                (provision then) or `…async_payment_failed` (never
 *                provision).
 *
 * Pure decision logic lives here so it is unit-testable without DB /
 * Stripe imports.
 */

export type CheckoutGateDecision = "provision" | "defer_async_payment";

/** Stripe Checkout payment_status values we accept as settled. */
export function isProvisionablePaymentStatus(
  paymentStatus: string | null | undefined,
): boolean {
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}

/**
 * Gate a checkout.session.completed event. Anything not positively
 * settled is deferred — fail closed on missing/unknown statuses.
 */
export function gateCheckoutSession(
  paymentStatus: string | null | undefined,
): CheckoutGateDecision {
  return isProvisionablePaymentStatus(paymentStatus)
    ? "provision"
    : "defer_async_payment";
}

/** Minimal slice of the Stripe client the verifier needs (injectable for tests). */
export interface CheckoutSessionRetriever {
  (sessionId: string): Promise<{ payment_status?: string | null } | null | undefined>;
}

export interface SessionPaidVerification {
  ok: boolean;
  status: string | null;
  reason: "paid" | "no_payment_required" | "unpaid" | "not_found" | "retrieve_failed";
}

/**
 * Belt-and-braces verification used by /api/auth/checkout-login: even
 * if a login token exists for a session, refuse the auto-login unless
 * Stripe confirms the session is actually settled. A fabricated or
 * still-pending session id never yields a session.
 */
export async function verifyCheckoutSessionPaid(
  sessionId: string,
  retrieve: CheckoutSessionRetriever,
): Promise<SessionPaidVerification> {
  let session: { payment_status?: string | null } | null | undefined;
  try {
    session = await retrieve(sessionId);
  } catch (_err) {
    // Stripe throws `resource_missing` for fabricated ids — and any
    // other retrieval failure must fail CLOSED (no login).
    return { ok: false, status: null, reason: "retrieve_failed" };
  }
  if (!session) return { ok: false, status: null, reason: "not_found" };

  const status = session.payment_status ?? null;
  if (status === "paid") return { ok: true, status, reason: "paid" };
  if (status === "no_payment_required") {
    return { ok: true, status, reason: "no_payment_required" };
  }
  return { ok: false, status, reason: "unpaid" };
}
