/**
 * Meta Messenger inbound webhook routes.
 *
 *   GET  /webhooks/meta/messaging  — hub.challenge verification (Meta calls
 *                                    this once when the webhook URL is first
 *                                    saved in the Meta App dashboard).
 *   POST /webhooks/meta/messaging  — signed inbound delivery. Meta POSTs
 *                                    here whenever a customer's connected
 *                                    Facebook Page receives a DM (or a
 *                                    messaging_postback event).
 *
 * Foundation only (Meta perm #4 of 5, `pages_messaging`). This PR:
 *   - verifies the X-Hub-Signature-256 HMAC against the Meta app secret
 *   - parses the standard Meta messaging payload
 *   - writes an audit-log row per inbound message
 *     (action: `socialsync.messenger.message_received`)
 *   - does NOT auto-reply — AI auto-reply ships as a follow-up PR.
 *
 * Configuration in the Meta App dashboard:
 *   Webhook URL: https://wefixtrades.com/webhooks/meta/messaging
 *   Verify token: env var META_WEBHOOK_VERIFY_TOKEN (any opaque string;
 *                 must match what is entered in the Meta dashboard)
 *   App secret: FACEBOOK_APP_SECRET (or FACEBOOK_OAUTH_CLIENT_SECRET
 *               as a fallback — same Meta App, two historical env names)
 *
 * Security posture:
 *   - GET refuses verification if META_WEBHOOK_VERIFY_TOKEN is unset (503)
 *   - POST refuses delivery if the app secret is unset (503), if the
 *     signature header is missing (401), or if HMAC verification fails
 *     (401). Constant-time comparison via crypto.timingSafeEqual.
 *   - Always returns 200 once verified so Meta does not retry. Per-event
 *     audit-log failures are swallowed and logged — they must not block
 *     subsequent events in the same batch.
 */

import type { Express, Request, Response } from "express";
import { createLogger } from "../lib/logger";
import { writeAudit } from "../lib/auditLog";
import {
  getMetaAppSecret,
  verifyMetaWebhookSignature,
} from "../services/socialSync/facebookService";

const log = createLogger("MetaMessagingWebhook");

const SIGNATURE_HEADER = "x-hub-signature-256";

/**
 * Shape of the Meta messaging webhook payload (only the fields we
 * actually consume). See:
 *   https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messages
 */
interface MetaMessagingEntry {
  id?: string;          // Page ID
  time?: number;        // ms epoch
  messaging?: Array<{
    sender?: { id?: string };     // PSID of the customer sending the DM
    recipient?: { id?: string };  // Page ID that received the DM
    timestamp?: number;
    message?: {
      mid?: string;
      text?: string;
      is_echo?: boolean;          // true when the message was sent by the Page itself
    };
    postback?: {
      title?: string;
      payload?: string;
      mid?: string;
    };
  }>;
}

interface MetaMessagingPayload {
  object?: string;                 // expected: "page"
  entry?: MetaMessagingEntry[];
}

export function registerMetaMessagingWebhookRoutes(app: Express): void {
  /**
   * GET /webhooks/meta/messaging
   *
   * Meta sends this once when the webhook is first added to verify we
   * own the endpoint. Echo back `hub.challenge` (as plain text) iff
   * `hub.verify_token` matches our pre-shared token.
   */
  app.get("/webhooks/meta/messaging", (req: Request, res: Response) => {
    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!expectedToken) {
      log.warn("META_WEBHOOK_VERIFY_TOKEN not configured — refusing verification");
      return res.status(503).json({ error: "webhook_not_configured" });
    }

    const mode = String(req.query["hub.mode"] || "");
    const token = String(req.query["hub.verify_token"] || "");
    const challenge = String(req.query["hub.challenge"] || "");

    if (mode === "subscribe" && token === expectedToken) {
      log.info("Webhook verification succeeded");
      return res.status(200).type("text/plain").send(challenge);
    }

    log.warn("Webhook verification failed", { mode, tokenMatches: token === expectedToken });
    return res.status(403).json({ error: "verification_failed" });
  });

  /**
   * POST /webhooks/meta/messaging
   *
   * Inbound DM / postback delivery from Meta. Body is signed with
   * HMAC-SHA256 using the Meta app secret; we verify the
   * `X-Hub-Signature-256` header against the raw request body before
   * processing.
   *
   * For now we only log received messages to the audit log. AI auto-reply
   * (route inbound to aiService.chat with customer KB) lands in a
   * follow-up PR.
   */
  app.post("/webhooks/meta/messaging", async (req: Request, res: Response) => {
    if (!getMetaAppSecret()) {
      log.warn("Meta app secret not configured — refusing webhook");
      return res.status(503).json({ error: "webhook_not_configured" });
    }

    const headerSignature = req.header(SIGNATURE_HEADER);
    if (!headerSignature) {
      log.warn("Missing X-Hub-Signature-256 header");
      return res.status(401).json({ error: "missing_signature" });
    }

    // Raw body captured globally via express.json({ verify }) — see
    // server/index.ts. If for any reason it's missing we cannot verify
    // the signature, so refuse the delivery.
    const rawBody = (req as Request & { rawBody?: Buffer | string }).rawBody;
    if (!rawBody) {
      log.error("rawBody missing on request — express.json verify hook misconfigured?");
      return res.status(500).json({ error: "raw_body_unavailable" });
    }

    if (!verifyMetaWebhookSignature(rawBody, headerSignature)) {
      log.warn("Signature verification failed");
      return res.status(401).json({ error: "invalid_signature" });
    }

    const payload = (req.body || {}) as MetaMessagingPayload;
    if (payload.object !== "page") {
      // Acknowledge but ignore non-page events — Meta delivers IG, WhatsApp,
      // etc. to the same app and we only handle Pages here.
      return res.status(200).json({ ok: true, ignored: true });
    }

    let received = 0;
    let echoesSkipped = 0;

    for (const entry of payload.entry || []) {
      const pageId = entry.id ? String(entry.id) : null;
      for (const m of entry.messaging || []) {
        // Skip echoes — these are deliveries of the Page's *own* outbound
        // messages, not customer messages. We don't want to AI-reply to
        // our own replies.
        if (m.message?.is_echo) {
          echoesSkipped++;
          continue;
        }

        const senderPsid = m.sender?.id ? String(m.sender.id) : null;
        const messageText = m.message?.text ?? null;
        const messageId = m.message?.mid ?? null;
        const postbackPayload = m.postback?.payload ?? null;
        const postbackTitle = m.postback?.title ?? null;

        try {
          await writeAudit({
            actorType: "system",
            action: "socialsync.messenger.message_received",
            entityType: "facebook_page",
            entityId: pageId ?? "unknown",
            after: {
              page_id: pageId,
              sender_psid: senderPsid,
              message_id: messageId,
              // Truncate message text in the audit row so a flood of long
              // DMs doesn't bloat audit_log. Full text is still in Meta's
              // inbox if needed for support.
              message_text: messageText ? messageText.slice(0, 500) : null,
              has_postback: !!m.postback,
              postback_title: postbackTitle,
              postback_payload: postbackPayload,
              meta_timestamp: m.timestamp ?? null,
            },
            metadata: {
              source: "meta_webhook",
              entry_time: entry.time ?? null,
            },
          });
          received++;
        } catch (err) {
          log.error("Failed to write audit row for inbound message", {
            error: String(err),
            pageId,
            messageId,
          });
        }
      }
    }

    log.info("Processed inbound Meta messaging webhook", {
      received,
      echoesSkipped,
      entries: payload.entry?.length ?? 0,
    });

    // Always 200 — Meta retries non-2xx and we've already accepted the
    // signed delivery. Per-event failures are recorded above.
    return res.status(200).json({ ok: true, received, echoes_skipped: echoesSkipped });
  });
}
