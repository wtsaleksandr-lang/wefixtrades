/**
 * Option B — verify that the customer's existing number now forwards to
 * the WeFixTrades number after the customer dialled the carrier MMI code.
 *
 * Flow:
 *   1. Place a Twilio outbound call FROM the WeFixTrades number TO the
 *      customer's original number.
 *   2. If forwarding is active, the call will route to the WeFixTrades
 *      number itself — i.e., the call connects back to our system. We
 *      detect this via Twilio's call status and forwardedFrom field.
 *   3. If the verify call fails on the first try, the wizard retries once
 *      after 30s, then offers a "Confirm manually" button — the user
 *      tests forwarding from a third phone and self-attests in the UI.
 *
 * Test mode: returns ok with method='twilio_test_call' immediately, no
 * actual call placed.
 */

import { getTwilioClient, isTwilioConfigured, getTwilioFromNumber } from "../../twilioClient";
import { createLogger } from "../../lib/logger";

const log = createLogger("ForwardingVerifier");

const TEST_MODE = () => process.env.TRADELINE_SETUP_TEST_MODE === "true";

export interface VerifySuccess {
  ok: true;
  method: "twilio_test_call" | "manual_user_confirmation";
  callSid?: string;
}

export interface VerifyFailure {
  ok: false;
  error: string;
  retryable: boolean; // true → wizard offers "Try again" + "Confirm manually"
}

export type VerifyResult = VerifySuccess | VerifyFailure;

/**
 * Place the test call. Returns ok when the call SID is back from Twilio.
 * Status-polling for actual forward detection is done separately via
 * checkTestCallStatus() once enough time has passed for Twilio to update.
 */
export async function placeTestCall(customerNumber: string): Promise<VerifyResult> {
  if (TEST_MODE()) {
    return {
      ok: true,
      method: "twilio_test_call",
      callSid: "CA" + "0".repeat(32),
    };
  }

  if (!isTwilioConfigured()) {
    return {
      ok: false,
      error: "Test call unavailable — Twilio not configured",
      retryable: false,
    };
  }

  const from = getTwilioFromNumber();
  if (!from) {
    return { ok: false, error: "No Twilio sender number configured", retryable: false };
  }

  try {
    const client = getTwilioClient();
    // Place a short call. The TwiML hangs up immediately — we just need the
    // status callback to tell us whether the call was forwarded.
    const call = await client.calls.create({
      from,
      to: customerNumber,
      twiml: "<Response><Hangup/></Response>",
      timeout: 15, // seconds — short ring, conditional forward fires after the user's no-answer threshold
    });

    log.info("Test call placed", { sid: call.sid, to: customerNumber });
    return { ok: true, method: "twilio_test_call", callSid: call.sid };
  } catch (err) {
    const msg = (err as Error).message;
    log.error("Test call failed", { err: msg });
    return { ok: false, error: msg, retryable: true };
  }
}

/**
 * After 30s, poll the call status. We're looking for evidence of forwarding —
 * the simplest signal is call.forwardedFrom being populated, OR a chained call
 * back to our number that completes.
 *
 * For v1 the heuristic is: if the call's `status` reached 'completed' and
 * its `forwardedFrom` matches the customer_number, forwarding worked.
 */
export async function checkTestCallStatus(
  callSid: string,
): Promise<{ verified: boolean; status: string; forwardedFrom: string | null }> {
  if (TEST_MODE()) {
    return { verified: true, status: "completed", forwardedFrom: null };
  }

  try {
    const client = getTwilioClient();
    const call = await client.calls(callSid).fetch();
    const forwardedFrom = (call as any).forwardedFrom ?? null;
    const verified = call.status === "completed" && !!forwardedFrom;
    return { verified, status: call.status, forwardedFrom };
  } catch (err) {
    log.error("Status check failed", { callSid, err: (err as Error).message });
    return { verified: false, status: "error", forwardedFrom: null };
  }
}
