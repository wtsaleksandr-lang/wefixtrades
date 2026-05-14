/**
 * Twilio webhook callbacks for Voice SDK flows.
 *
 *   POST /api/twilio/voice/outbound-twiml
 *
 * Configured as the VoiceUrl on the TwiML App (AP...) referenced by the
 * Voice SDK's `outgoingApplicationSid` grant. When the mobile SDK calls
 * `voice.connect(token, { params: { To: "+15551234567" } })`, Twilio
 * issues an outbound call leg and hits this endpoint to learn how to
 * route it. We respond with `<Dial>` TwiML pointing at the destination
 * number, using the configured Twilio sender number as callerId.
 *
 * v1 scope: single global callerId from TWILIO_PHONE_NUMBER (or
 * TWILIO_FROM_NUMBER). Per-user / per-tradeline callerId is a v2
 * concern once we resolve user→tradeline→number mapping in the schema.
 *
 * Auth: Twilio signs every webhook with HMAC-SHA1 of the full URL +
 * sorted form params using AUTH_TOKEN. We verify before responding to
 * prevent third-party callers from coercing the server into dialling
 * arbitrary numbers (toll-fraud risk).
 */

import type { Express, Request, Response } from "express";
import { verifyTwilioSignature, getTwilioFromNumber } from "../twilioClient";
import { createLogger } from "../lib/logger";

const log = createLogger("TwilioVoiceCallback");

/** Escape XML special chars so a malicious `To` can't inject TwiML. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Phone numbers: digits, leading +, optional spaces/dashes/parens. */
const PHONE_RE = /^\+?[0-9 ()\-.]{4,32}$/;

function rejectTwiml(res: Response, status: number, body: string) {
  res.set("Content-Type", "text/xml");
  return res.status(status).send(`<Response><Say>${body}</Say><Hangup/></Response>`);
}

export function registerTwilioVoiceCallbackRoutes(app: Express): void {
  app.post("/api/twilio/voice/outbound-twiml", (req: Request, res: Response) => {
    if (!verifyTwilioSignature(req)) {
      log.warn("Signature verification failed", { path: req.originalUrl });
      res.set("Content-Type", "text/xml");
      return res.status(403).send("<Response/>");
    }

    const callerId = getTwilioFromNumber();
    if (!callerId) {
      log.error("Outbound call attempted but TWILIO_PHONE_NUMBER not set");
      return rejectTwiml(res, 503, "Outbound calling is not configured.");
    }

    const to = typeof req.body?.To === "string" ? req.body.To.trim() : "";
    if (!to || !PHONE_RE.test(to)) {
      log.warn("Outbound call rejected: invalid To", { to });
      return rejectTwiml(res, 400, "Invalid destination number.");
    }

    // From the Voice SDK comes through as `client:user_42` per the
    // identity format in twilioVoiceAccessToken.ts. We log it for audit
    // but don't currently use it to pick a per-user callerId.
    const from = typeof req.body?.From === "string" ? req.body.From : "";
    log.info("Outbound TwiML issued", { from, to, callerId });

    res.set("Content-Type", "text/xml");
    return res.send(
      `<Response><Dial callerId="${escapeXml(callerId)}" answerOnBridge="true"><Number>${escapeXml(to)}</Number></Dial></Response>`,
    );
  });

  log.info("Twilio voice callback routes registered");
}
