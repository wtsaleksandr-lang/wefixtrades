/**
 * Pure outcome derivation for the /checkout/success page.
 *
 * P0-2 (night audit 2026-06-11): the old page asserted "Payment successful"
 * on a bare page-load — `if (!sessionId) return;` skipped verification and
 * the default copy claimed success unconditionally. Anyone hitting
 * /checkout/success with no (or a fabricated) session_id saw a payment
 * confirmation for a payment that never happened.
 *
 * Contract (single source of truth — the component renders FROM this):
 *   - no session_id                  → "no_session"  (redirect to /pricing)
 *   - verification in flight         → "verifying"   (neutral copy, no claims)
 *   - 200 from /api/auth/checkout-login → "verified" (the ONLY success state;
 *     that endpoint re-verifies payment_status with Stripe server-side)
 *   - 403 (Stripe says not settled)  → "unconfirmed" (honest not-yet copy)
 *   - 404 after retries (webhook race or consumed token) → "pending"
 *   - network failure after retries  → "pending"
 *
 * Kept free of React/DOM so it is unit-testable via
 * `npx tsx client/src/pages/checkoutSuccessState.test.ts`.
 */

export type CheckoutOutcome =
  | "no_session"
  | "verifying"
  | "verified"
  | "pending"
  | "unconfirmed";

/** Sentinel HTTP status for a thrown fetch (network failure). */
export const NETWORK_ERROR = 0;

/** Outcome for the initial page load, before any server call. */
export function initialOutcome(sessionId: string | null | undefined): CheckoutOutcome {
  return sessionId ? "verifying" : "no_session";
}

/**
 * Map a /api/auth/checkout-login response status to the page outcome.
 * Returns "retry" when the caller should try again (webhook may still be
 * processing — 404 means the one-time login token isn't stored yet).
 */
export function outcomeForLoginResponse(
  httpStatus: number,
  attemptsLeft: number,
): CheckoutOutcome | "retry" {
  if (httpStatus === 200) return "verified";
  // 403 = the endpoint asked Stripe and the session has NOT settled.
  if (httpStatus === 403) return "unconfirmed";
  // 404 = token not minted yet (webhook race) or already consumed.
  // Transient network failures get the same retry budget.
  if ((httpStatus === 404 || httpStatus === NETWORK_ERROR) && attemptsLeft > 0) {
    return "retry";
  }
  return "pending";
}

/**
 * The ONE gate for success copy. Every render of "Payment successful" /
 * "You're all set" must pass through this — anything else is the P0-2
 * regression coming back.
 */
export function isSuccess(outcome: CheckoutOutcome): boolean {
  return outcome === "verified";
}
