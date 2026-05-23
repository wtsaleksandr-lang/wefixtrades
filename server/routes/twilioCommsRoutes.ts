/**
 * Wave R-pre W-TWILIO — Admin Communications Panel (SMS + Voice).
 *
 * Surfaces Alex's Twilio account to the admin dashboard so he can
 * read/send SMS and (best-effort) make outbound calls without using
 * the Twilio console.
 *
 * Routes (all admin-only except the inbound webhook):
 *
 *   GET  /api/admin/twilio/messages
 *   GET  /api/admin/twilio/messages/thread
 *   POST /api/admin/twilio/messages
 *   GET  /api/admin/twilio/calls
 *   GET  /api/admin/twilio/voice-token
 *   GET  /api/admin/twilio/config       — readiness summary for the UI
 *   POST /api/twilio/sms-webhook        — PUBLIC; Twilio inbound SMS
 *   POST /api/twilio/voice-twiml        — PUBLIC; Twilio Voice JS SDK outbound
 *
 * No DB writes for v1 — every inbox/thread read is a passthrough to
 * Twilio's REST API. If volume grows, add a `twilio_messages` cache
 * table later (see migration TODO at bottom of this file).
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import {
  getTwilioClient,
  getTwilioFromNumber,
  isTwilioConfigured,
  normalizePhone,
  verifyTwilioSignature,
} from "../twilioClient";
import {
  mintAccessToken,
  voiceConfigMissingKeys,
} from "../lib/twilioVoiceAccessToken";
import { aiChannelGateOn } from "../services/aiChannelGate";
import { createLogger } from "../lib/logger";

const log = createLogger("TwilioComms");

/* ─── helpers ────────────────────────────────────────────────────── */

interface NormalizedMessage {
  sid: string;
  direction: "inbound" | "outbound" | "unknown";
  from: string | null;
  to: string | null;
  body: string;
  date_sent: string | null; // ISO
  status: string | null;
  thread_contact: string | null; // the OTHER party from Alex's number
}

function normalizeTwilioMessage(
  m: any,
  alexNumber: string | null,
): NormalizedMessage {
  // Twilio's `direction` is one of: inbound, outbound-api, outbound-call,
  // outbound-reply. Collapse outbound-* → outbound for the UI.
  const dir: NormalizedMessage["direction"] = m.direction === "inbound"
    ? "inbound"
    : (typeof m.direction === "string" && m.direction.startsWith("outbound"))
    ? "outbound"
    : "unknown";

  const from = m.from ?? null;
  const to = m.to ?? null;

  // Thread contact = whichever side ISN'T Alex's number. Used to group the
  // inbox into per-contact threads.
  let threadContact: string | null = null;
  if (alexNumber) {
    const aNorm = normalizePhone(alexNumber);
    const fromNorm = from ? normalizePhone(from) : "";
    const toNorm = to ? normalizePhone(to) : "";
    if (fromNorm === aNorm) threadContact = to;
    else if (toNorm === aNorm) threadContact = from;
    else threadContact = dir === "inbound" ? from : to;
  } else {
    threadContact = dir === "inbound" ? from : to;
  }

  const date = m.dateSent || m.dateCreated;
  const dateISO = date
    ? (date instanceof Date ? date.toISOString() : new Date(date).toISOString())
    : null;

  return {
    sid: m.sid,
    direction: dir,
    from,
    to,
    body: m.body ?? "",
    date_sent: dateISO,
    status: m.status ?? null,
    thread_contact: threadContact,
  };
}

function isE164ish(value: string): boolean {
  return /^\+\d{7,15}$/.test(value);
}

/* ─── route registration ─────────────────────────────────────────── */

export function registerTwilioCommsRoutes(app: Express): void {
  /**
   * Readiness summary. The UI calls this on mount to decide which
   * panels to render and what setup hints to surface.
   */
  app.get("/api/admin/twilio/config", requireAdmin, (_req: Request, res: Response) => {
    const fromNumber = getTwilioFromNumber();
    const smsReady = isTwilioConfigured();
    const voiceMissing = voiceConfigMissingKeys();
    const voiceReady = voiceMissing.length === 0;
    res.json({
      smsReady,
      voiceReady,
      fromNumber: fromNumber ?? null,
      missing: {
        sms: smsReady
          ? []
          : [
              process.env.TWILIO_ACCOUNT_SID ? null : "TWILIO_ACCOUNT_SID",
              process.env.TWILIO_AUTH_TOKEN ? null : "TWILIO_AUTH_TOKEN",
              fromNumber ? null : "TWILIO_PHONE_NUMBER",
            ].filter(Boolean),
        voice: voiceMissing,
      },
    });
  });

  /**
   * GET /api/admin/twilio/messages
   *
   * Recent messages on Alex's Twilio number (inbound + outbound).
   * Returns the raw list — the client groups them by thread_contact.
   */
  app.get("/api/admin/twilio/messages", requireAdmin, async (req: Request, res: Response) => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);
    const fromNumber = getTwilioFromNumber();
    if (!isTwilioConfigured() || !fromNumber) {
      return res.status(503).json({
        error: "twilio_not_configured",
        message: "TWILIO_PHONE_NUMBER and/or TWILIO_ACCOUNT_SID/AUTH_TOKEN not configured.",
      });
    }
    try {
      const client = getTwilioClient();
      // Twilio doesn't have a single "all messages where my number is on either
      // side" filter — it's already implicit because the account only owns
      // messages where it is one party. We just list the most recent.
      const raw = await client.messages.list({ limit });
      const messages = raw.map((m) => normalizeTwilioMessage(m, fromNumber));
      res.json({ messages, hasMore: raw.length === limit });
    } catch (err: any) {
      log.error("messages list failed", { message: err?.message });
      res.status(500).json({ error: "twilio_api_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * GET /api/admin/twilio/messages/thread?contact=+1...&limit=50
   *
   * All messages between Alex's number and a single contact, sorted
   * oldest → newest (chronological for a chat-style view).
   */
  app.get("/api/admin/twilio/messages/thread", requireAdmin, async (req: Request, res: Response) => {
    const contact = String(req.query.contact ?? "").trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1), 500);
    if (!contact) return res.status(400).json({ error: "missing_contact" });

    const fromNumber = getTwilioFromNumber();
    if (!isTwilioConfigured() || !fromNumber) {
      return res.status(503).json({
        error: "twilio_not_configured",
        message: "TWILIO_PHONE_NUMBER and/or TWILIO_ACCOUNT_SID/AUTH_TOKEN not configured.",
      });
    }

    try {
      const client = getTwilioClient();
      // Twilio API: filter `to` OR `from`. Issue both calls in parallel.
      const [aSide, bSide] = await Promise.all([
        client.messages.list({ to: fromNumber, from: contact, limit }),
        client.messages.list({ from: fromNumber, to: contact, limit }),
      ]);
      const all = [...aSide, ...bSide];
      // De-dupe by SID (Twilio occasionally returns the same row in both
      // filters when a message is bounced back somehow).
      const seen = new Set<string>();
      const dedup = all.filter((m) => {
        if (seen.has(m.sid)) return false;
        seen.add(m.sid);
        return true;
      });
      const messages = dedup
        .map((m) => normalizeTwilioMessage(m, fromNumber))
        .sort((a, b) => {
          const aT = a.date_sent ? Date.parse(a.date_sent) : 0;
          const bT = b.date_sent ? Date.parse(b.date_sent) : 0;
          return aT - bT;
        });
      res.json({ messages, contact });
    } catch (err: any) {
      log.error("thread fetch failed", { message: err?.message });
      res.status(500).json({ error: "twilio_api_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * POST /api/admin/twilio/messages
   * Body: { to: '+1xxxxxxxxxx', body: 'message' }
   *
   * Sends an SMS from Alex's Twilio number. Returns the new SID +
   * Twilio status so the UI can show "queued → sent → delivered".
   */
  app.post("/api/admin/twilio/messages", requireAdmin, async (req: Request, res: Response) => {
    const to = String(req.body?.to ?? "").trim();
    const body = String(req.body?.body ?? "");
    if (!to || !body) return res.status(400).json({ error: "missing_to_or_body" });
    if (!isE164ish(to)) {
      return res.status(400).json({ error: "invalid_to", message: "Use E.164 format (+1...)" });
    }
    if (body.length > 1600) {
      return res.status(400).json({ error: "body_too_long", message: "Max 1600 chars per send" });
    }

    const fromNumber = getTwilioFromNumber();
    if (!isTwilioConfigured() || !fromNumber) {
      return res.status(503).json({
        error: "twilio_not_configured",
        message: "TWILIO_PHONE_NUMBER and/or TWILIO_ACCOUNT_SID/AUTH_TOKEN not configured.",
      });
    }

    try {
      const client = getTwilioClient();
      const msg = await client.messages.create({ from: fromNumber, to, body });
      log.info("admin SMS sent", { to, sid: msg.sid, length: body.length });
      res.json({ sid: msg.sid, status: msg.status, to: msg.to, from: msg.from });
    } catch (err: any) {
      log.error("admin SMS send failed", { to, message: err?.message });
      res.status(500).json({ error: "twilio_send_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * DELETE /api/admin/twilio/messages/:sid
   *
   * Delete a single message via Twilio's REST API. Idempotent — a 404
   * from Twilio (already-gone) is treated as success. Twilio's SDK
   * exposes this as `client.messages(sid).remove()`.
   */
  app.delete("/api/admin/twilio/messages/:sid", requireAdmin, async (req: Request, res: Response) => {
    const sid = String(req.params.sid ?? "").trim();
    if (!sid) return res.status(400).json({ error: "missing_sid" });
    if (!isTwilioConfigured()) {
      return res.status(503).json({ error: "twilio_not_configured" });
    }
    try {
      const client = getTwilioClient();
      await client.messages(sid).remove();
      log.info("admin message deleted", { sid });
      return res.status(204).send();
    } catch (err: any) {
      const status = err?.status ?? err?.code;
      if (status === 404 || status === 20404 || /not found/i.test(err?.message ?? "")) {
        return res.status(204).send();
      }
      log.error("message delete failed", { sid, message: err?.message });
      return res.status(500).json({ error: "twilio_delete_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * DELETE /api/admin/twilio/conversations/:phone
   *
   * Delete every message between Alex's Twilio number and the given
   * contact phone. Twilio has no bulk-delete endpoint, so we list
   * messages on both sides of the thread and remove them one by one.
   * Returns `{ deleted: N }`.
   */
  app.delete("/api/admin/twilio/conversations/:phone", requireAdmin, async (req: Request, res: Response) => {
    const contact = String(req.params.phone ?? "").trim();
    if (!contact) return res.status(400).json({ error: "missing_phone" });
    const fromNumber = getTwilioFromNumber();
    if (!isTwilioConfigured() || !fromNumber) {
      return res.status(503).json({ error: "twilio_not_configured" });
    }
    try {
      const client = getTwilioClient();
      const [aSide, bSide] = await Promise.all([
        client.messages.list({ to: fromNumber, from: contact, limit: 500 }),
        client.messages.list({ from: fromNumber, to: contact, limit: 500 }),
      ]);
      const seen = new Set<string>();
      const sids: string[] = [];
      for (const m of [...aSide, ...bSide]) {
        if (seen.has(m.sid)) continue;
        seen.add(m.sid);
        sids.push(m.sid);
      }
      let deleted = 0;
      for (const sid of sids) {
        try {
          await client.messages(sid).remove();
          deleted += 1;
        } catch (err: any) {
          const status = err?.status ?? err?.code;
          if (status === 404 || status === 20404) {
            deleted += 1;
            continue;
          }
          log.warn("conversation delete: per-message remove failed", { sid, message: err?.message });
        }
      }
      log.info("admin conversation deleted", { contact, deleted, attempted: sids.length });
      return res.json({ deleted });
    } catch (err: any) {
      log.error("conversation delete failed", { contact, message: err?.message });
      return res.status(500).json({ error: "twilio_delete_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * DELETE /api/admin/twilio/calls/:sid
   *
   * Delete a single call record via Twilio's REST API. Idempotent.
   */
  app.delete("/api/admin/twilio/calls/:sid", requireAdmin, async (req: Request, res: Response) => {
    const sid = String(req.params.sid ?? "").trim();
    if (!sid) return res.status(400).json({ error: "missing_sid" });
    if (!isTwilioConfigured()) {
      return res.status(503).json({ error: "twilio_not_configured" });
    }
    try {
      const client = getTwilioClient();
      await client.calls(sid).remove();
      log.info("admin call deleted", { sid });
      return res.status(204).send();
    } catch (err: any) {
      const status = err?.status ?? err?.code;
      if (status === 404 || status === 20404 || /not found/i.test(err?.message ?? "")) {
        return res.status(204).send();
      }
      log.error("call delete failed", { sid, message: err?.message });
      return res.status(500).json({ error: "twilio_delete_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * GET /api/admin/twilio/calls
   *
   * Recent call records for the account. Used by the dialer panel's
   * "Recent calls" list.
   */
  app.get("/api/admin/twilio/calls", requireAdmin, async (req: Request, res: Response) => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);
    if (!isTwilioConfigured()) {
      return res.status(503).json({
        error: "twilio_not_configured",
        message: "TWILIO_ACCOUNT_SID/AUTH_TOKEN not configured.",
      });
    }
    try {
      const client = getTwilioClient();
      const raw = await client.calls.list({ limit });
      const calls = raw.map((c: any) => ({
        sid: c.sid,
        direction: c.direction,
        from: c.from,
        to: c.to,
        status: c.status,
        duration_sec: c.duration ? Number(c.duration) : null,
        start_time: c.startTime
          ? (c.startTime instanceof Date ? c.startTime.toISOString() : new Date(c.startTime).toISOString())
          : null,
        end_time: c.endTime
          ? (c.endTime instanceof Date ? c.endTime.toISOString() : new Date(c.endTime).toISOString())
          : null,
        price: c.price ?? null,
      }));
      res.json({ calls });
    } catch (err: any) {
      log.error("calls list failed", { message: err?.message });
      res.status(500).json({ error: "twilio_api_failed", message: err?.message ?? "Unknown error" });
    }
  });

  /**
   * GET /api/admin/twilio/voice-token
   *
   * Mints a Twilio Voice JS SDK access token for the admin dialer.
   * Re-uses the existing minter (server/lib/twilioVoiceAccessToken.ts).
   *
   * Requires TWILIO_API_KEY + TWILIO_API_KEY_SECRET + TWILIO_APP_SID.
   * Returns 503 + missing-keys list when not all are set.
   */
  app.get("/api/admin/twilio/voice-token", requireAdmin, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const userId = typeof user?.id === "number" ? user.id : 0;
    if (!userId) return res.status(401).json({ error: "no_user_id" });
    const missing = voiceConfigMissingKeys();
    if (missing.length) {
      return res.status(503).json({ error: "voice_not_configured", missing });
    }
    try {
      const token = mintAccessToken({ userId });
      res.json(token);
    } catch (err: any) {
      log.error("voice token mint failed", { message: err?.message });
      res.status(500).json({ error: "voice_token_failed", message: err?.message });
    }
  });

  /**
   * POST /api/twilio/sms-webhook  (PUBLIC, no auth)
   *
   * Twilio inbound SMS hook. We don't currently persist — the API list
   * call in /api/admin/twilio/messages picks up everything. Just
   * acknowledge with empty TwiML so Twilio doesn't retry.
   *
   * Alex must configure in Twilio Console:
   *   Phone Numbers → his number → "A MESSAGE COMES IN"
   *   → Webhook → POST https://wefixtrades.com/api/twilio/sms-webhook
   */
  app.post("/api/twilio/sms-webhook", async (req: Request, res: Response) => {
    // Verify Twilio signature to prevent forged inbound events.
    if (!verifyTwilioSignature(req)) {
      log.warn("sms-webhook signature verification failed");
      res.set("Content-Type", "text/xml");
      return res.status(403).send("<Response/>");
    }
    const from = req.body?.From ?? "";
    const body = req.body?.Body ?? "";
    const sid = req.body?.MessageSid ?? "";
    log.info("inbound SMS webhook", { from, sid, len: body.length });
    res.set("Content-Type", "text/xml");

    // W-BA-1: per-channel emergency kill switch. When AI is OFF on SMS, reply
    // with the team-will-follow-up auto-reply so the customer isn't ghosted.
    // (The current TwiML body is a no-op — once SMS-AI is wired in, the AI
    // branch belongs in the `gateOn` arm. Gate fails CLOSED.)
    const gateOn = await aiChannelGateOn("sms");
    if (!gateOn) {
      return res.send(
        `<Response><Message>Thanks — our team will follow up shortly.</Message></Response>`,
      );
    }
    res.send("<Response/>");
  });

  /**
   * POST /api/twilio/voice-twiml  (PUBLIC, no auth)
   *
   * Twilio Voice TwiML for the admin dialer. When the JS SDK places
   * an outbound call, Twilio hits this URL to learn what to do — we
   * dial the requested `To` number from Alex's Twilio number.
   *
   * Alex must wire this up in a TwiML App in the Twilio Console and
   * set TWILIO_APP_SID env var to that app's SID before voice works.
   */
  app.post("/api/twilio/voice-twiml", (req: Request, res: Response) => {
    // Verify Twilio signature — without this, anyone who knows the URL
    // can POST a `To` and coerce Alex's Twilio number into dialing it
    // (toll-fraud risk).
    if (!verifyTwilioSignature(req)) {
      log.warn("voice-twiml signature verification failed");
      res.set("Content-Type", "text/xml");
      return res.status(403).send("<Response/>");
    }
    const to = String(req.body?.To ?? "").trim();
    const fromNumber = getTwilioFromNumber();
    res.set("Content-Type", "text/xml");
    if (!to || !fromNumber) {
      // No callee — speak an error and hang up.
      res.send(
        `<Response><Say voice="alice">Sorry, missing call destination or Twilio number.</Say><Hangup/></Response>`,
      );
      return;
    }
    // Basic outbound dial. callerId is Alex's Twilio number so the
    // callee sees that, not the anonymous client identity. Escape both
    // values defensively even though `fromNumber` is server-controlled.
    const escape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    res.send(
      `<Response><Dial callerId="${escape(fromNumber)}"><Number>${escape(to)}</Number></Dial></Response>`,
    );
  });
}

/*
 * TODO (future): cache-table migration if the messages API gets noisy.
 *
 *   migrations/00XX_twilio_messages.sql:
 *     CREATE TABLE IF NOT EXISTS twilio_messages (
 *       sid           VARCHAR(60) PRIMARY KEY,
 *       direction     VARCHAR(20) NOT NULL,
 *       from_number   VARCHAR(30),
 *       to_number     VARCHAR(30),
 *       body          TEXT,
 *       status        VARCHAR(30),
 *       date_sent     TIMESTAMP,
 *       thread_key    VARCHAR(30),     -- normalized contact phone
 *       created_at    TIMESTAMP DEFAULT NOW()
 *     );
 *     CREATE INDEX IF NOT EXISTS idx_twilio_messages_thread ON twilio_messages(thread_key, date_sent DESC);
 *     CREATE INDEX IF NOT EXISTS idx_twilio_messages_date ON twilio_messages(date_sent DESC);
 *
 * The webhook above would insert; the GET routes would read from the
 * table first then fall back to the Twilio API for cold history.
 * Skipped for v1 — Twilio's API is fast enough.
 */
