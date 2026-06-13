/**
 * Unify the client's number with their Vapi AI assistant.
 *
 * THE PROBLEM THIS CLOSES (P0): the number a client picks/provisions/ports in
 * the setup wizard was never the number their AI answered on. Two disconnected
 * subsystems:
 *   - The wizard purchased a Twilio number and pointed its `voice_url` at a
 *     route that was never registered (`/api/twilio/voice/inbound`) → every
 *     inbound call 404'd → Twilio fallback voicemail.
 *   - The working Vapi path BOUGHT a separate Vapi-native number (it POSTed
 *     `provider:"twilio"` with no `number`), so even when an assistant existed
 *     it answered on a DIFFERENT number than the one the client was told.
 *
 * THE FIX (unify via Vapi-import): for every path that gives a client a number,
 * IMPORT that exact Twilio number into Vapi, attach it to the client's
 * assistant (building the assistant first if needed), and ensure the Twilio
 * number's inbound `voice_url` routes to the SAME Vapi inbound URL the working
 * platform number uses. The number the client gets === the number the AI
 * answers on.
 *
 * Used by:
 *   - provision-new wizard route (GAP 1+2)
 *   - port-complete (poll worker + admin force-complete) (GAP 3)
 *   - forward-setup completion
 *
 * Idempotent + safe to re-run: importing an already-imported number returns
 * the existing Vapi phone-number id (provisionVapiPhoneNumber short-circuits on
 * a stored vapiPhoneNumberId); re-setting the Twilio voice_url is a no-op when
 * already correct.
 */

import { and, eq, like } from "drizzle-orm";
import { db } from "../../db";
import { clientServices } from "@shared/schema";
import { storage } from "../../storage";
import { getTwilioClient, isTwilioConfigured } from "../../twilioClient";
import { createLogger } from "../../lib/logger";
import {
  provisionTradeLineAssistant,
  VAPI_TWILIO_INBOUND_VOICE_URL,
} from "../vapiService";

const log = createLogger("UnifyNumber");

export interface UnifyResult {
  /** True only when the assistant is built AND the number is imported+wired. */
  ready: boolean;
  /** The resolved tradeline client_service id (null if the client has none). */
  clientServiceId: number | null;
  /** Vapi assistant id, when built/pushed. */
  assistantId: string | null;
  /** Vapi phone-number id, when the Twilio number was imported. */
  vapiPhoneNumberId: string | null;
  /** Human-readable reason the line is not yet callable, when !ready. */
  notReadyReason?: string;
}

/**
 * Resolve the active tradeline client_service for a client. Prefers an active
 * row; falls back to the first tradeline row. Mirrors the resolution in
 * reprovisionTradeLineVoiceForClient.
 */
async function resolveTradeLineClientServiceId(clientId: number): Promise<number | null> {
  const services = await db
    .select({ id: clientServices.id, status: clientServices.status })
    .from(clientServices)
    .where(and(eq(clientServices.client_id, clientId), like(clientServices.service_id, "tradeline%")));
  const target = services.find((s) => s.status === "active") ?? services[0];
  return target?.id ?? null;
}

/**
 * Best-effort: ensure the Twilio IncomingPhoneNumber's inbound voice_url points
 * at Vapi. The provision-new purchase already sets this at create time; ports
 * and forwards do NOT (the number was bought earlier or is being repurposed),
 * so this re-asserts it. Non-fatal: a failure is logged and surfaced in the
 * verdict, never thrown — the import is the load-bearing step.
 */
async function ensureTwilioVoiceUrl(numberSid: string | null | undefined): Promise<{ ok: boolean; error?: string }> {
  if (!numberSid) return { ok: false, error: "no Twilio number SID on file" };
  if (!isTwilioConfigured()) return { ok: false, error: "Twilio not configured" };
  try {
    const client = getTwilioClient();
    await client.incomingPhoneNumbers(numberSid).update({
      voiceUrl: VAPI_TWILIO_INBOUND_VOICE_URL,
      voiceMethod: "POST",
    } as any);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Unify a client's Twilio number with their Vapi assistant.
 *
 * @param clientId      WeFixTrades client id (the wizard works at this level).
 * @param twilioNumber  E.164 number the client owns on Twilio (the one to import).
 * @param twilioNumberSid  Twilio IncomingPhoneNumber SID (PN…), for re-asserting voice_url.
 */
export async function unifyClientNumberWithVapi(
  clientId: number,
  twilioNumber: string,
  twilioNumberSid?: string | null,
): Promise<UnifyResult> {
  const clientServiceId = await resolveTradeLineClientServiceId(clientId);
  if (!clientServiceId) {
    // No tradeline subscription yet (e.g. admin previewing, or mid-onboarding).
    // The number is reserved; unification happens once the service exists.
    log.info("No tradeline client_service for client — deferring unification", { clientId });
    return {
      ready: false,
      clientServiceId: null,
      assistantId: null,
      vapiPhoneNumberId: null,
      notReadyReason: "No active TradeLine subscription yet — the number is reserved and will be connected once the service is active.",
    };
  }

  // 1) Make sure Twilio routes inbound voice to Vapi (idempotent re-assert).
  const voiceUrlResult = await ensureTwilioVoiceUrl(twilioNumberSid);
  if (!voiceUrlResult.ok) {
    log.warn("Could not assert Twilio voice_url → Vapi (continuing to import)", {
      clientServiceId,
      error: voiceUrlResult.error,
    });
  }

  // 2) Build/push the assistant AND import the client's number into Vapi,
  //    attaching it to that assistant. provisionTradeLineAssistant builds the
  //    assistant if it doesn't exist, then imports the number (importNumber).
  const prov = await provisionTradeLineAssistant(clientServiceId, { importNumber: twilioNumber });

  const ready = prov.status === "live" && Boolean(prov.assistantId) && Boolean(prov.phoneNumberId);
  return {
    ready,
    clientServiceId,
    assistantId: prov.assistantId,
    vapiPhoneNumberId: prov.phoneNumberId ?? null,
    notReadyReason: ready
      ? undefined
      : prov.notLiveReason ||
        prov.error ||
        prov.skipReason ||
        "Assistant or number wiring is incomplete — the AI cannot answer this number yet.",
  };
}

/**
 * Look up the Twilio IncomingPhoneNumber SID for an E.164 number we own.
 * Returns null when not found or Twilio is unconfigured.
 */
async function findTwilioNumberSid(e164: string): Promise<string | null> {
  if (!isTwilioConfigured()) return null;
  try {
    const client = getTwilioClient();
    const matches = await client.incomingPhoneNumbers.list({ phoneNumber: e164, limit: 1 });
    return matches[0]?.sid ?? null;
  } catch (err) {
    log.warn("Twilio number-SID lookup failed", { err: (err as Error).message });
    return null;
  }
}

/**
 * Best-effort: attach a Twilio number (by its IncomingPhoneNumber SID) to the
 * brand A2P messaging service so outbound SMS gets the registered sender id.
 * The provision-NEW path does this at create time via messagingServiceSid;
 * ported numbers land in the account WITHOUT that attachment, so we add it
 * here. Non-fatal.
 */
async function attachToMessagingService(numberSid: string): Promise<{ ok: boolean; error?: string }> {
  const messagingServiceSid = process.env.TWILIO_LINKED_MESSAGING_SERVICE?.trim() || "";
  if (!messagingServiceSid) return { ok: false, error: "TWILIO_LINKED_MESSAGING_SERVICE not set" };
  if (!isTwilioConfigured()) return { ok: false, error: "Twilio not configured" };
  try {
    const client = getTwilioClient();
    await (client as any).messaging.v1
      .services(messagingServiceSid)
      .phoneNumbers.create({ phoneNumberSid: numberSid });
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    // A number already in the service throws — treat "already" as success.
    if (/already/i.test(msg)) return { ok: true };
    return { ok: false, error: msg };
  }
}

/**
 * Complete a PORTED (or otherwise newly-landed) number end-to-end (GAP 3):
 * find its Twilio SID, point its inbound voice_url at Vapi, attach it to the
 * A2P messaging service for SMS, then import it into Vapi + attach the
 * assistant. Ported numbers previously had port_status flipped to
 * "port_complete" with NO voiceUrl/SMS/assistant wiring at all — so the AI
 * could never answer the number the client just ported in.
 *
 * Best-effort + idempotent. Returns the unify verdict.
 */
export async function completePortedNumberWiring(
  clientId: number,
  portedNumber: string,
): Promise<UnifyResult> {
  const numberSid = await findTwilioNumberSid(portedNumber);

  // Attach to messaging service (SMS sender registration) — best-effort.
  if (numberSid) {
    const sms = await attachToMessagingService(numberSid);
    if (!sms.ok) {
      log.warn("Could not attach ported number to messaging service", {
        clientId,
        error: sms.error,
      });
    }
  } else {
    log.warn("Ported number not found in Twilio account — cannot attach SMS / set voice_url, will still attempt Vapi import", {
      clientId,
    });
  }

  // The unify path sets voice_url→Vapi (via the SID) + imports + attaches assistant.
  return unifyClientNumberWithVapi(clientId, portedNumber, numberSid);
}
