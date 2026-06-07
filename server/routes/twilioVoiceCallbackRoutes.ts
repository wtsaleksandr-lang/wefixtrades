/**
 * Twilio webhook callbacks for Voice SDK flows.
 *
 *   POST /api/twilio/voice/outbound-twiml   call routing (TwiML response)
 *   POST /api/twilio/voice/status           per-event status updates
 *
 * The outbound TwiML endpoint is configured as the VoiceUrl on the
 * TwiML App (AP...) referenced by the Voice SDK's
 * `outgoingApplicationSid` grant. When the mobile SDK calls
 * `voice.connect(token, { params: { To: "+15551234567" } })`, Twilio
 * issues an outbound call leg and hits this endpoint to learn how to
 * route it. We respond with `<Dial>` TwiML pointing at the destination
 * number, using the configured Twilio sender number as callerId.
 *
 * The status endpoint receives per-event callbacks (initiated, ringing,
 * answered, completed) and upserts `mobile_call_records` so the mobile
 * Calls tab can show a history list.
 *
 * v1 scope on caller-id: single global from TWILIO_PHONE_NUMBER. Per-user /
 * per-tradeline callerId is a v2 concern once user→tradeline→number
 * mapping is finalised.
 *
 * Auth: Twilio signs every webhook with HMAC-SHA1 of the full URL +
 * sorted form params using AUTH_TOKEN. We verify before responding to
 * prevent third-party callers from coercing the server into dialling
 * arbitrary numbers (toll-fraud risk).
 */

import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { mobileCallRecords } from "@shared/schema";
import { verifyTwilioSignature, getTwilioFromNumber } from "../twilioClient";
import { resolveVoiceEntitlement, consumeOutboundCall } from "../lib/voiceEntitlement";
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

/**
 * NANP restriction (P0 toll-fraud guard). By default we ONLY dial North
 * American Numbering Plan destinations (+1, 10 national digits). International
 * / premium-rate numbers are the cheapest, highest-loss toll-fraud vector, so
 * they are rejected unless an entitlement explicitly opts in.
 *
 * Returns the canonical E.164 NANP form (+1XXXXXXXXXX) when the input is a
 * valid NANP number after stripping spaces / dashes / parens, else null.
 * NANP rule: area code (NXX) and exchange (NXX) first digit must be 2-9.
 */
function toNanpE164(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  let national: string;
  if (digits.startsWith("+1")) {
    national = digits.slice(2);
  } else if (digits.startsWith("+")) {
    return null; // some other country code → not NANP
  } else if (digits.startsWith("1") && digits.length === 11) {
    national = digits.slice(1);
  } else {
    national = digits;
  }
  // Exactly 10 national digits, with NXX area code + NXX exchange (N = 2-9).
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
  return `+1${national}`;
}

/**
 * Whether this entitlement is permitted to dial outside the NANP. Today no
 * tier grants international dialling — kept as an explicit hook so enabling it
 * is a deliberate, auditable change rather than the current implicit default.
 */
function allowsInternational(_entitlement: "active" | "trial"): boolean {
  return false;
}

/** Status values Twilio reports that we treat as terminal. */
const TERMINAL_STATUSES = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);

function rejectTwiml(res: Response, status: number, body: string) {
  res.set("Content-Type", "text/xml");
  return res.status(status).send(`<Response><Say>${body}</Say><Hangup/></Response>`);
}

/** Pull the userId out of `client:user_42` → 42. Returns null on miss. */
function parseUserIdFromIdentity(from: string): number | null {
  const m = from.match(/^client:user_(\d+)$/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

function statusCallbackUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers.host;
  return `${proto}://${host}/api/twilio/voice/status`;
}

export function registerTwilioVoiceCallbackRoutes(app: Express): void {
  /* ─── Outbound TwiML — how to route the SDK-initiated call ─── */
  app.post("/api/twilio/voice/outbound-twiml", async (req: Request, res: Response) => {
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

    const from = typeof req.body?.From === "string" ? req.body.From : "";
    const callSid = typeof req.body?.CallSid === "string" ? req.body.CallSid : null;
    const userId = parseUserIdFromIdentity(from);

    // P0 ENTITLEMENT RE-CHECK (defence in depth — the access token is
    // long-lived, so a token minted while entitled must not keep dialling
    // after the subscription lapses). The caller identity is `client:user_N`;
    // if we can't resolve it to an entitled user, refuse the dial.
    if (userId === null) {
      log.warn("Outbound call rejected: unrecognised caller identity", { from });
      return rejectTwiml(res, 403, "Calling is not enabled for this account.");
    }
    const entitlement = await resolveVoiceEntitlement(userId);
    if (!entitlement) {
      log.warn("Outbound call rejected: no voice entitlement", { userId });
      return rejectTwiml(res, 403, "Your plan does not include outbound calling.");
    }

    // P0 NANP restriction — by default only North American destinations.
    const rawTo = typeof req.body?.To === "string" ? req.body.To.trim() : "";
    if (!rawTo || !PHONE_RE.test(rawTo)) {
      log.warn("Outbound call rejected: invalid To", { to: rawTo });
      return rejectTwiml(res, 400, "Invalid destination number.");
    }
    const nanp = toNanpE164(rawTo);
    if (!nanp && !allowsInternational(entitlement)) {
      log.warn("Outbound call rejected: non-NANP destination blocked", { userId });
      return rejectTwiml(res, 403, "International calling is not enabled on your plan.");
    }
    // Dial the canonical NANP form when we have it; otherwise (only reachable
    // if international is ever allowed) fall back to the validated raw input.
    const to = nanp ?? rawTo;

    // P0 USAGE CAP — consume one outbound-call unit against the user's daily
    // AND monthly ceiling. Bounds a runaway / compromised client's bill.
    const usage = await consumeOutboundCall(userId, entitlement);
    if (!usage.allowed) {
      log.warn("Outbound call rejected: usage cap reached", { userId, scope: usage.scope });
      return rejectTwiml(
        res,
        429,
        usage.scope === "daily"
          ? "You've reached your daily calling limit. Try again tomorrow."
          : "You've reached your monthly calling limit.",
      );
    }

    log.info("Outbound TwiML issued", { from, to, callerId, callSid, entitlement });

    // Seed the call-record row so the status webhook can update it. We
    // ignore failures here — the record is a UX nicety, not a critical
    // path. Twilio's status callback also upserts via ON CONFLICT.
    if (callSid) {
      try {
        await db
          .insert(mobileCallRecords)
          .values({
            call_sid: callSid,
            user_id: userId ?? undefined,
            direction: "outbound",
            from_number: callerId,
            to_number: to,
            status: "queued",
          })
          .onConflictDoNothing({ target: mobileCallRecords.call_sid });
      } catch (err) {
        log.warn("Seed record insert failed", { err: (err as Error).message });
      }
    }

    const statusUrl = statusCallbackUrl(req);
    res.set("Content-Type", "text/xml");
    return res.send(
      `<Response>` +
        `<Dial callerId="${escapeXml(callerId)}" answerOnBridge="true">` +
          `<Number statusCallback="${escapeXml(statusUrl)}" ` +
            `statusCallbackEvent="initiated ringing answered completed" ` +
            `statusCallbackMethod="POST">` +
            `${escapeXml(to)}` +
          `</Number>` +
        `</Dial>` +
      `</Response>`,
    );
  });

  /* ─── Status callback — call lifecycle events ─── */
  app.post("/api/twilio/voice/status", async (req: Request, res: Response) => {
    if (!verifyTwilioSignature(req)) {
      log.warn("Status callback signature failed", { path: req.originalUrl });
      return res.status(403).send();
    }

    const callSid = typeof req.body?.CallSid === "string" ? req.body.CallSid : "";
    const status = typeof req.body?.CallStatus === "string" ? req.body.CallStatus : "";
    if (!callSid || !status) {
      return res.status(400).send();
    }

    const duration = Number(req.body?.CallDuration);
    const errorCode = typeof req.body?.ErrorCode === "string" ? req.body.ErrorCode : null;
    const errorMsg = typeof req.body?.ErrorMessage === "string" ? req.body.ErrorMessage : null;
    const isTerminal = TERMINAL_STATUSES.has(status);

    // Build the error note in JS and pass it as a single BOUND parameter
    // (Drizzle parameterises `${value}` placeholders). Previously this used
    // sql.raw(errorCode)/sql.raw(errorMsg) which spliced webhook-supplied
    // strings straight into SQL — an injection sink. Coerce to string safely.
    const errorNote = errorCode
      ? ` Twilio error ${String(errorCode)}: ${String(errorMsg ?? "n/a")}`
      : null;

    try {
      await db
        .insert(mobileCallRecords)
        .values({
          call_sid: callSid,
          direction: "outbound", // status-only inserts are outbound by default; inbound seeds via push flow (Phase 4 part 2)
          status,
          from_number: typeof req.body?.From === "string" ? req.body.From : null,
          to_number: typeof req.body?.To === "string" ? req.body.To : null,
          duration_sec: Number.isFinite(duration) ? duration : undefined,
          notes: errorNote ? errorNote.trimStart() : undefined,
        })
        .onConflictDoUpdate({
          target: mobileCallRecords.call_sid,
          set: {
            status,
            duration_sec: Number.isFinite(duration) ? duration : sql`mobile_call_records.duration_sec`,
            notes: errorNote
              ? sql`COALESCE(mobile_call_records.notes, '') || ${errorNote}`
              : sql`mobile_call_records.notes`,
            ended_at: isTerminal ? sql`NOW()` : sql`mobile_call_records.ended_at`,
          },
        });
    } catch (err) {
      log.error("Status upsert failed", { callSid, status, err: (err as Error).message });
      return res.status(500).send();
    }

    return res.status(204).send();
  });

  log.info("Twilio voice callback routes registered");
}
