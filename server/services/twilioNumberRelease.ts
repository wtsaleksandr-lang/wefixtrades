/**
 * Twilio number release — cost-leak plug.
 *
 * Numbers are purchased in services/tradelineSetup/provisionNumber.ts via
 * `client.incomingPhoneNumbers.create(...)` but, until this service existed,
 * were NEVER released. Every churned / force-cancelled / abandoned tradeline
 * therefore leaked a paid Twilio number forever (Twilio bills monthly per
 * owned IncomingPhoneNumber regardless of usage).
 *
 * `releaseTwilioNumber(sid)` is the single chokepoint that relinquishes an
 * owned number back to Twilio. It is:
 *   - idempotent / safe: a SID that is already gone (HTTP 404 / Twilio code
 *     20404) is treated as a successful release, not an error;
 *   - loud, never silent: every failure path LOGS with the SID + reason so
 *     the no-silent-catch guard passes and leaks are visible in ops logs;
 *   - non-throwing: returns a result object so callers (admin cancel paths)
 *     can decide whether to surface or proceed — the DB status flip must not
 *     be blocked by a Twilio API blip.
 *
 * Callers should only invoke this when the setup row actually has an
 * `assigned_number_sid`, and should null out `assigned_number` /
 * `assigned_number_sid` after a successful (or already-gone) release.
 */

import { getTwilioClient, isTwilioConfigured } from "../twilioClient";
import { createLogger } from "../lib/logger";

const log = createLogger("TwilioNumberRelease");

export interface ReleaseResult {
  /** True when the number is no longer owned by us (released now, or already gone). */
  released: boolean;
  /** True specifically when Twilio reported the SID was already absent. */
  alreadyGone?: boolean;
  /** Populated on failure — a human-readable reason, also logged. */
  error?: string;
}

/**
 * Test-mode / placeholder SIDs minted by provisionNumber() in
 * TRADELINE_SETUP_TEST_MODE (`"PN" + "0".repeat(32)`). Releasing these would
 * hit Twilio with a bogus SID; treat them as no-ops that succeed.
 */
function isPlaceholderSid(sid: string): boolean {
  return /^PN0{32}$/.test(sid);
}

/**
 * Release (relinquish) an owned Twilio IncomingPhoneNumber by its SID.
 *
 * Never throws. Returns `{ released: true }` when the number is gone from our
 * account (either released by this call or already absent). Returns
 * `{ released: false, error }` when Twilio is unreachable / unconfigured or
 * the delete failed for a non-404 reason — in which case the SID is logged so
 * the leak can be reconciled manually.
 */
export async function releaseTwilioNumber(sid: string): Promise<ReleaseResult> {
  const trimmed = (sid ?? "").trim();
  if (!trimmed) {
    // Nothing to release — caller passed an empty/null SID. Not an error.
    log.warn("releaseTwilioNumber called with empty SID — nothing to release");
    return { released: false, error: "empty_sid" };
  }

  if (isPlaceholderSid(trimmed)) {
    log.info("Skipping release of test-mode placeholder SID", { sid: trimmed });
    return { released: true, alreadyGone: true };
  }

  if (!isTwilioConfigured()) {
    // Can't reach Twilio to release — surface loudly so the SID is reconciled
    // once Twilio creds are configured. Caller still proceeds with the DB flip.
    log.error(
      "Cannot release Twilio number — Twilio not configured; number will keep billing until reconciled",
      { sid: trimmed },
    );
    return { released: false, error: "twilio_not_configured" };
  }

  try {
    const client = getTwilioClient();
    await client.incomingPhoneNumbers(trimmed).remove();
    log.info("Released Twilio number", { sid: trimmed });
    return { released: true };
  } catch (err) {
    // Twilio's "resource not found" is code 20404 / HTTP status 404. If the
    // number is already gone, the desired end-state (we no longer own it) is
    // already true → treat as a successful, idempotent release.
    const status = (err as any)?.status ?? (err as any)?.statusCode;
    const code = (err as any)?.code;
    const message = (err as Error).message;
    if (status === 404 || code === 20404) {
      log.info("Twilio number already gone — treating as released (idempotent)", {
        sid: trimmed,
        code,
      });
      return { released: true, alreadyGone: true };
    }
    log.error("Failed to release Twilio number — it may keep billing until reconciled", {
      sid: trimmed,
      status,
      code,
      err: message,
    });
    return { released: false, error: message };
  }
}

/**
 * The account-deletion entry point — the `twilioNumber` store's deleter in
 * `services/accountDeletion/deleteAccount.ts`.
 *
 * A thin, deliberately narrow wrapper. It exists rather than wiring
 * `releaseTwilioNumber` straight into the store table so that the ONE
 * destructive capability reachable from a deletion receipt is bounded by a
 * shape check performed here, at the point of use, after the SID has round-
 * tripped through the receipt as a plain string. `deleteTwilioArtefact` cannot
 * address a phone number by construction and this cannot address anything BUT
 * one, so neither can be steered into the other's territory.
 *
 * Returns true only when the number is no longer ours — released now, or
 * already gone. Never throws: a caller mid-erasure records the failure and
 * carries on, and the SID reaches `audit_log` so the charge can be reconciled.
 */
export async function releaseNumberArtefact(key: string): Promise<boolean> {
  // `PN` + 32 hex, anchored. The value is interpolated into a Twilio REST path,
  // and the plan reaches this deleter only for `assigned_number_sid` — so
  // anything that is not an IncomingPhoneNumber SID is a bug upstream, not a
  // resource to try deleting.
  if (!/^PN[0-9a-f]{32}$/i.test(key)) {
    log.error("refusing to release a value that is not an IncomingPhoneNumber SID", { key });
    return false;
  }

  /* Dev, staging and production share one Twilio account and a release is
   * irreversible — the number goes back to Twilio's pool and somebody else can
   * buy it. Anywhere we would not send a live message, we do not relinquish a
   * live number either. Reported as NOT released, never as done, which is what
   * puts it on the receipt and into `audit_log` instead of silently passing.
   *
   * Imported lazily: this module is loaded by the plan's executor, and a
   * top-level import of the Twilio client would drag the SDK into the graph of
   * anything that merely reads the release helper. */
  const { isTwilioDryRun } = await import("../twilioClient");
  if (isTwilioDryRun()) {
    log.error(
      "Twilio number NOT released — dry-run posture. Recorded for manual release; " +
        "a release from a non-production boot would relinquish a live customer's number.",
      { sid: key },
    );
    return false;
  }

  const result = await releaseTwilioNumber(key);
  return result.released;
}
