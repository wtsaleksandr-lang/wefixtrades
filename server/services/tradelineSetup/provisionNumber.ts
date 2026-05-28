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
 *
 * Wave 85 — provisionNumber() now accepts an optional `targetPhoneNumber`
 * (E.164). When the wizard's number-picker step picks one specifically,
 * the route forwards that value and we skip the availability search and
 * purchase the chosen number directly. The webhook wiring from Wave 76
 * is preserved verbatim either way. "Pick for me" still works — it just
 * calls this function without `targetPhoneNumber`.
 */

import { getTwilioClient, isTwilioConfigured } from "../../twilioClient";
import { createLogger } from "../../lib/logger";

const log = createLogger("ProvisionNumber");

const TEST_MODE = () => process.env.TRADELINE_SETUP_TEST_MODE === "true";

/**
 * Derive the public base URL used to construct Twilio webhook callbacks.
 * Mirrors the convention used by tradelineNotifications / adflowReports.
 * Returns no trailing slash.
 */
function getPublicBaseUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.APP_PUBLIC_URL ||
    "https://wefixtrades.com";
  return raw.replace(/\/+$/, "");
}

/**
 * Build the desired webhook-URL set for an IncomingPhoneNumber. Centralized
 * so the live provision (Fix 1) and the one-shot patch script (Fix 2) can
 * agree on the exact URLs without drift.
 *
 * /api/twilio/voice/inbound      — primary voice handler (Wave 77+ lands the route)
 * /api/twilio/voice-fallback     — already live; surfaces Vapi outages
 * /api/twilio/inbound            — already live; inbound SMS dispatcher
 * /api/twilio/sms-status         — status callbacks (Wave 78 lands the route)
 */
export function buildTwilioWebhookConfig(): {
  voiceUrl: string;
  voiceMethod: "POST";
  voiceFallbackUrl: string;
  voiceFallbackMethod: "POST";
  smsUrl: string;
  smsMethod: "POST";
  statusCallback: string;
  statusCallbackMethod: "POST";
} {
  const base = getPublicBaseUrl();
  return {
    voiceUrl: `${base}/api/twilio/voice/inbound`,
    voiceMethod: "POST",
    voiceFallbackUrl: `${base}/api/twilio/voice-fallback`,
    voiceFallbackMethod: "POST",
    smsUrl: `${base}/api/twilio/inbound`,
    smsMethod: "POST",
    statusCallback: `${base}/api/twilio/sms-status`,
    statusCallbackMethod: "POST",
  };
}

export interface ProvisionSuccess {
  ok: true;
  queued: false;
  number: string;          // E.164
  sid: string;             // Twilio Incoming-Phone-Number SID (PNxxxx…)
  /**
   * Non-blocking warning surfaced to the wizard. Currently populated by the
   * A2P 10DLC campaign-status pre-flight (Wave 76 Fix 5). The number is
   * provisioned regardless — the admin just sees the warning so they know
   * outbound SMS may be filtered until the campaign is VERIFIED.
   */
  warning?: string;
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
 * Wave 85 — optional explicit-target signature. When `targetPhoneNumber`
 * is provided (from the wizard's picker step), we skip the availability
 * search and purchase that number directly. Otherwise the original
 * search-and-pick-first behavior is preserved as the auto-pick fallback.
 */
export interface ProvisionOptions {
  /** Specific E.164 number to purchase. Bypasses the availability search. */
  targetPhoneNumber?: string;
}

/**
 * @param countryCode  ISO-3166-1 alpha-2, "US" or "CA".
 * @param preference   "local" or "toll_free". Local is default.
 * @param options      Wave 85 — optional `targetPhoneNumber` overrides search.
 */
export async function provisionNumber(
  countryCode: "US" | "CA",
  preference: "local" | "toll_free" = "local",
  options: ProvisionOptions = {},
): Promise<ProvisionResult> {
  const targetPhoneNumber = options.targetPhoneNumber?.trim() || undefined;

  if (TEST_MODE()) {
    log.info("test-mode: returning magic test number", {
      targeted: Boolean(targetPhoneNumber),
    });
    return {
      ok: true,
      queued: false,
      // If the wizard passed a specific target in test-mode, echo it back so
      // the success screen reads naturally. Otherwise return the Twilio
      // magic test number as before.
      number: targetPhoneNumber || "+15005550006",
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

    // Wave 85 — if the wizard handed us a specific number, skip the search
    // entirely and try to purchase it directly. Twilio will surface an
    // error if the number was claimed between the picker render and submit
    // (inventory turns over fast) — we propagate that as ok:false so the
    // UI can offer "Try a different number" or "Pick for me".
    let candidatePhoneNumber: string | undefined = targetPhoneNumber;

    if (!candidatePhoneNumber) {
      // Search available numbers (auto-pick fallback)
      const available = preference === "toll_free"
        ? await client.availablePhoneNumbers(countryCode).tollFree.list({ smsEnabled: true, voiceEnabled: true, limit: 5 })
        : await client.availablePhoneNumbers(countryCode).local.list({ smsEnabled: true, voiceEnabled: true, limit: 5 });

      const candidate = available[0];
      if (!candidate) {
        return { ok: false, error: `No ${preference} numbers available in ${countryCode}` };
      }
      candidatePhoneNumber = candidate.phoneNumber;
    }

    // Purchase + wire webhooks atomically. Wave 76 — without these URLs,
    // inbound calls fall through to Twilio default voicemail and inbound
    // SMS is dropped at Twilio's edge, so the "your number is ready" email
    // would lie. messagingServiceSid attaches the number to the brand-wide
    // A2P 10DLC campaign so outbound SMS gets the registered sender id.
    const webhookCfg = buildTwilioWebhookConfig();
    const messagingServiceSid = process.env.TWILIO_LINKED_MESSAGING_SERVICE?.trim() || "";

    if (!messagingServiceSid) {
      log.warn(
        "TWILIO_LINKED_MESSAGING_SERVICE not set — provisioning number without messaging service. " +
          "A2P 10DLC sender registration will not apply until this is configured.",
      );
    }

    const createParams: Record<string, unknown> = {
      phoneNumber: candidatePhoneNumber,
      voiceUrl: webhookCfg.voiceUrl,
      voiceMethod: webhookCfg.voiceMethod,
      voiceFallbackUrl: webhookCfg.voiceFallbackUrl,
      voiceFallbackMethod: webhookCfg.voiceFallbackMethod,
      smsUrl: webhookCfg.smsUrl,
      smsMethod: webhookCfg.smsMethod,
      statusCallback: webhookCfg.statusCallback,
      statusCallbackMethod: webhookCfg.statusCallbackMethod,
    };
    if (messagingServiceSid) {
      createParams.messagingServiceSid = messagingServiceSid;
    }

    const purchased = await client.incomingPhoneNumbers.create(createParams as any);

    log.info("Provisioned number", {
      sid: purchased.sid,
      number: purchased.phoneNumber,
      messagingServiceAttached: Boolean(messagingServiceSid),
      targeted: Boolean(targetPhoneNumber),
    });

    // A2P 10DLC pre-flight (non-blocking).
    const a2pCheck = await validateA2PReadiness();

    return {
      ok: true,
      queued: false,
      number: purchased.phoneNumber,
      sid: purchased.sid,
      ...(a2pCheck.warning ? { warning: a2pCheck.warning } : {}),
    };
  } catch (err) {
    const msg = (err as Error).message;
    log.error("Provision failed", { err: msg, targeted: Boolean(targetPhoneNumber) });
    return { ok: false, error: msg };
  }
}

/**
 * A2P 10DLC campaign-status pre-flight (Wave 76 Fix 5).
 *
 * If TWILIO_CAMPAIGN_SID is set, fetch the underlying usAppToPerson resource
 * from the linked Messaging Service and report whether its campaignStatus is
 * VERIFIED. Non-blocking: returns a warning when status is anything else.
 *
 * Exported so a runtime health card on the admin dashboard can surface the
 * same signal without re-implementing the Twilio call.
 */
export async function validateA2PReadiness(): Promise<{
  ok: boolean;
  status: string | null;
  warning?: string;
}> {
  const campaignSid = process.env.TWILIO_CAMPAIGN_SID?.trim() || "";
  const messagingServiceSid = process.env.TWILIO_LINKED_MESSAGING_SERVICE?.trim() || "";

  if (!campaignSid || !messagingServiceSid) {
    // Not configured — nothing to validate. No warning surfaced; this is the
    // legitimate state during initial setup before A2P registration lands.
    return { ok: true, status: null };
  }

  if (!isTwilioConfigured()) {
    return { ok: true, status: null };
  }

  try {
    const client = getTwilioClient();
    // Twilio SDK: client.messaging.v1.services(SID).usAppToPerson(CAMPAIGN_SID).fetch()
    const a2p = await (client as any)
      .messaging.v1.services(messagingServiceSid)
      .usAppToPerson(campaignSid)
      .fetch();
    const status: string = a2p?.campaignStatus || a2p?.campaign_status || "UNKNOWN";

    if (status === "VERIFIED") {
      return { ok: true, status };
    }

    const warning = `A2P 10DLC campaign status is "${status}" (not VERIFIED) — outbound SMS may be filtered by carriers until the campaign is approved.`;
    log.warn("A2P campaign not VERIFIED", { status, campaignSid });
    return { ok: true, status, warning };
  } catch (err) {
    const msg = (err as Error).message;
    log.warn("A2P readiness check failed (non-blocking)", { err: msg });
    return { ok: true, status: null };
  }
}
