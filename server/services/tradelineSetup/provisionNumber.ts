/**
 * Option A — provision a fresh WeFixTrades number via Twilio.
 *
 * Three modes:
 *   1. TRADELINE_SETUP_TEST_MODE=true → returns Twilio magic test number
 *      +15005550006 with a fake SID; no real Twilio API call.
 *   2. Twilio configured (isTwilioConfigured() true) → real provision.
 *   3. Twilio not configured → returns { ok: true, queued: true } so the
 *      wizard surfaces the "We're finalizing your setup" copy and the
 *      provision is retried by the autoActivation worker when admin
 *      drops the Twilio admin key into Doppler.
 */

import { getTwilioClient, isTwilioConfigured } from "../../twilioClient";
import { createLogger } from "../../lib/logger";

const log = createLogger("ProvisionNumber");

const TEST_MODE = () => process.env.TRADELINE_SETUP_TEST_MODE === "true";

export interface ProvisionSuccess {
  ok: true;
  queued: false;
  number: string;          // E.164
  sid: string;             // Twilio Incoming-Phone-Number SID (PNxxxx…)
}

export interface ProvisionQueued {
  ok: true;
  queued: true;
  reason: string;
}

export interface ProvisionFailure {
  ok: false;
  error: string;
}

export type ProvisionResult = ProvisionSuccess | ProvisionQueued | ProvisionFailure;

/**
 * @param countryCode  ISO-3166-1 alpha-2, "US" or "CA".
 * @param preference   "local" or "toll_free". Local is default.
 */
export async function provisionNumber(
  countryCode: "US" | "CA",
  preference: "local" | "toll_free" = "local",
): Promise<ProvisionResult> {
  if (TEST_MODE()) {
    log.info("test-mode: returning magic test number");
    return {
      ok: true,
      queued: false,
      number: "+15005550006",
      sid: "PN" + "0".repeat(32),
    };
  }

  if (!isTwilioConfigured()) {
    log.info("Twilio not configured — queueing provision");
    return {
      ok: true,
      queued: true,
      reason: "Your number is reserved. We're finalizing the connection — you'll get an email within 24 hours when it's ready to use.",
    };
  }

  try {
    const client = getTwilioClient();

    // Search available numbers
    const available = preference === "toll_free"
      ? await client.availablePhoneNumbers(countryCode).tollFree.list({ smsEnabled: true, voiceEnabled: true, limit: 5 })
      : await client.availablePhoneNumbers(countryCode).local.list({ smsEnabled: true, voiceEnabled: true, limit: 5 });

    const candidate = available[0];
    if (!candidate) {
      return { ok: false, error: `No ${preference} numbers available in ${countryCode}` };
    }

    // Purchase
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: candidate.phoneNumber,
      // Voice + SMS webhooks wired in Phase 4. Numbers without webhooks just
      // ring the Twilio-default voicemail until the inbound router lands.
    });

    log.info("Provisioned number", { sid: purchased.sid, number: purchased.phoneNumber });
    return {
      ok: true,
      queued: false,
      number: purchased.phoneNumber,
      sid: purchased.sid,
    };
  } catch (err) {
    const msg = (err as Error).message;
    log.error("Provision failed", { err: msg });
    return { ok: false, error: msg };
  }
}
