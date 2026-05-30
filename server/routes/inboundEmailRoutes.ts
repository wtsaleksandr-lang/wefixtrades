/**
 * Inbound email webhook — SendGrid Inbound Parse (Phase 3e-i).
 *
 * SendGrid POSTs incoming mail (multipart/form-data) here. The handler turns
 * each email into the support-ticket system:
 *   - subject carries "#<id>" (our outbound ticket emails include it) AND the
 *     sender owns that ticket → append a reply, reopening it if it was closed.
 *   - otherwise → open a new support ticket.
 *
 * Identity is UNVERIFIED — a From: header is spoofable. The sender is matched
 * to a client by email only as a convenience for threading/ownership; an
 * unmatched sender always gets a fresh, flagged ticket and can never append
 * to an existing one. The concierge's answer layer (3e-ii) must not disclose
 * account data or run account-changing actions for an unverified sender.
 *
 * Security: Inbound Parse does not sign its requests, so the webhook URL
 * carries an unguessable token (SENDGRID_INBOUND_TOKEN) in the path.
 */

import type { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import crypto from "crypto";
import { createLogger } from "../lib/logger";
import { ingestInboundEmail } from "../services/inboundEmailIngest";

const log = createLogger("InboundEmail");

/* Multipart parser — fields only. Attachment file parts are drained and
 * dropped; attachment handling lands with shared-files retention (3g). */
const upload = multer({
  limits: { fieldSize: 5 * 1024 * 1024, fields: 60 },
  fileFilter: (_req, _file, cb) => cb(null, false),
});

/** Cap on a single ingested message body. */
const MAX_CONTENT = 12000;

/* ─── Helpers ─── */

/** Extract a bare email address from a From-style header value. */
function extractEmail(raw: string): string | null {
  if (!raw) return null;
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

/** Pull the Message-ID from a raw header block (for dedup). */
function extractMessageId(headers: string): string | null {
  const m = (headers || "").match(/^message-id:\s*(.+)$/im);
  return m ? m[1].trim() : null;
}

/** Reply markers — text at/after the earliest one is the quoted original. */
const QUOTE_MARKERS: RegExp[] = [
  /^On .+ wrote:\s*$/im,                  // Gmail / Apple Mail
  /^-{2,}\s*Original Message\s*-{2,}/im,  // Outlook
  /^_{5,}/m,                              // Outlook divider line
  /^From:\s.+\r?\nSent:\s/im,             // Outlook reply header
];

/** Strip the quoted reply chain — keep just the new message text. */
function stripQuotedText(text: string): string {
  let cut = text.length;
  for (const re of QUOTE_MARKERS) {
    const m = text.match(re);
    if (m && m.index !== undefined && m.index < cut) cut = m.index;
  }
  let body = text.slice(0, cut);
  // Drop a trailing run of ">"-quoted lines the markers above didn't catch.
  body = body.replace(/(?:^>.*$\r?\n?)+\s*$/m, "");
  return body.trim();
}

/** Rough HTML → text — used only when SendGrid sends no plain-text part. */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Constant-time compare of the path token against SENDGRID_INBOUND_TOKEN. */
function tokenOk(provided: string): boolean {
  const expected = process.env.SENDGRID_INBOUND_TOKEN || "";
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Reject the request before multer parses anything if the token is wrong. */
function requireInboundToken(req: Request, res: Response, next: NextFunction): void {
  if (!tokenOk(String(req.params.token))) {
    log.warn("[inbound-email] rejected — bad or missing token");
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

/* ─── Route ─── */

export function registerInboundEmailRoutes(app: Express): void {
  /**
   * POST /api/inbound/email/:token — SendGrid Inbound Parse destination.
   * Returns 200 on success, 500 on a recoverable error (SendGrid retries),
   * 403 on a bad token.
   */
  app.post(
    "/api/inbound/email/:token",
    requireInboundToken,
    upload.any(),
    async (req: Request, res: Response) => {
      try {
        const body = (req.body ?? {}) as Record<string, string>;

        // Sender — prefer the SMTP envelope, fall back to the From header.
        let senderEmail: string | null = null;
        try {
          const env = body.envelope ? JSON.parse(body.envelope) : null;
          if (env?.from) senderEmail = extractEmail(String(env.from));
        } catch { /* malformed envelope — fall through to the From header */ }
        if (!senderEmail) senderEmail = extractEmail(body.from || "");

        const subject = (body.subject || "(no subject)").slice(0, 300).trim() || "(no subject)";
        const rawText = body.text && body.text.trim()
          ? body.text
          : (body.html ? htmlToText(body.html) : "");
        const content = stripQuotedText(rawText).slice(0, MAX_CONTENT)
          || "(no readable text in this email)";
        const messageId = extractMessageId(body.headers || "");

        // Shared ingestion: dedup → identity match → threading → ticket →
        // AI concierge handoff. Same path the IONOS IMAP poller uses.
        const result = await ingestInboundEmail({ senderEmail, subject, content, messageId });
        if (result.duplicate) {
          return res.status(200).json({ ok: true, duplicate: true });
        }
        return res.status(200).json({ ok: true, ticket_id: result.ticketId });
      } catch (err: any) {
        log.error("[inbound-email] processing error:", err?.message);
        // 500 → SendGrid retries; a transient DB hiccup gets another chance.
        return res.status(500).json({ error: "Inbound processing failed" });
      }
    },
  );
}
