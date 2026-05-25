/**
 * Meta WhatsApp Cloud API inbound webhook routes.
 *
 *   GET  /webhooks/meta/whatsapp  — hub.challenge verification (Meta calls
 *                                   this once when the webhook URL is first
 *                                   saved in the Meta App dashboard for the
 *                                   WhatsApp product).
 *   POST /webhooks/meta/whatsapp  — signed inbound delivery. Meta POSTs
 *                                   here when a customer's WhatsApp
 *                                   Business number receives a message,
 *                                   status update, etc.
 *
 * Foundation only (Meta perm #5 of 5, `whatsapp_business_messaging`).
 * This PR:
 *   - verifies the X-Hub-Signature-256 HMAC against the Meta app secret
 *   - parses the standard WhatsApp Cloud webhook payload
 *   - writes an audit-log row per inbound message
 *     (action: `socialsync.whatsapp.message_received`)
 *   - does NOT auto-reply — AI auto-reply ships as a follow-up PR.
 *
 * Configuration in the Meta App dashboard (WhatsApp → Configuration):
 *   Callback URL: https://wefixtrades.com/webhooks/meta/whatsapp
 *   Verify token: env var META_WEBHOOK_VERIFY_TOKEN (same token used for
 *                 the Messenger webhook — Meta accepts the same value
 *                 across products on the same App)
 *   App secret:   FACEBOOK_APP_SECRET (or FACEBOOK_OAUTH_CLIENT_SECRET
 *                 as a fallback — same Meta App, two historical env names)
 *   Subscribed fields: `messages` (covers inbound + status updates)
 *
 * Coexistence with Twilio WhatsApp:
 *   The existing Twilio WhatsApp inbound path (TwiML / `/api/twilio/*`)
 *   is unchanged. A customer who routes WhatsApp through Twilio never
 *   hits this webhook; a customer who routes WhatsApp through Meta Cloud
 *   never hits the Twilio one. Both can coexist for different customers
 *   on the same WeFixTrades deployment.
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
import { getMetaAppSecret } from "../services/socialSync/facebookService";
import { verifyWhatsappWebhookSignature } from "../services/whatsappCloudService";

const log = createLogger("MetaWhatsappWebhook");

const SIGNATURE_HEADER = "x-hub-signature-256";

/**
 * Shape of the WhatsApp Cloud webhook payload (only the fields we
 * actually consume). See:
 *   https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */
interface WhatsappValueContact {
  profile?: { name?: string };
  wa_id?: string;
}

interface WhatsappValueMessage {
  from?: string;          // E.164 (no leading +) of the sender
  id?: string;            // Meta-issued message id (wamid.xxx)
  timestamp?: string;     // seconds-epoch as string
  type?: string;          // "text" | "image" | "audio" | ...
  text?: { body?: string };
}

interface WhatsappValueStatus {
  id?: string;
  status?: string;        // "sent" | "delivered" | "read" | "failed"
  timestamp?: string;
  recipient_id?: string;
}

interface WhatsappChangeValue {
  messaging_product?: string;   // "whatsapp"
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: WhatsappValueContact[];
  messages?: WhatsappValueMessage[];
  statuses?: WhatsappValueStatus[];
}

interface WhatsappChange {
  field?: string;               // "messages"
  value?: WhatsappChangeValue;
}

interface WhatsappEntry {
  id?: string;                  // WhatsApp Business Account id
  changes?: WhatsappChange[];
}

interface WhatsappWebhookPayload {
  object?: string;              // expected: "whatsapp_business_account"
  entry?: WhatsappEntry[];
}

export function registerMetaWhatsappWebhookRoutes(app: Express): void {
  /**
   * GET /webhooks/meta/whatsapp
   *
   * Meta sends this once when the WhatsApp Callback URL is first saved
   * (or re-saved) in the App dashboard. Echo back `hub.challenge` (as
   * plain text) iff `hub.verify_token` matches our pre-shared token.
   */
  app.get("/webhooks/meta/whatsapp", (req: Request, res: Response) => {
    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!expectedToken) {
      log.warn("META_WEBHOOK_VERIFY_TOKEN not configured — refusing verification");
      return res.status(503).json({ error: "webhook_not_configured" });
    }

    const mode = String(req.query["hub.mode"] || "");
    const token = String(req.query["hub.verify_token"] || "");
    const challenge = String(req.query["hub.challenge"] || "");

    if (mode === "subscribe" && token === expectedToken) {
      log.info("WhatsApp webhook verification succeeded");
      return res.status(200).type("text/plain").send(challenge);
    }

    log.warn("WhatsApp webhook verification failed", {
      mode,
      tokenMatches: token === expectedToken,
    });
    return res.status(403).json({ error: "verification_failed" });
  });

  /**
   * POST /webhooks/meta/whatsapp
   *
   * Inbound message / status delivery from Meta. Body is signed with
   * HMAC-SHA256 using the Meta app secret; we verify the
   * `X-Hub-Signature-256` header against the raw request body before
   * processing.
   *
   * For now we only audit-log received messages. AI auto-reply
   * (route inbound to aiService.chat with the customer's KB) lands in a
   * follow-up PR.
   */
  app.post("/webhooks/meta/whatsapp", async (req: Request, res: Response) => {
    const appSecret = getMetaAppSecret();
    if (!appSecret) {
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

    if (!verifyWhatsappWebhookSignature(rawBody, headerSignature, appSecret)) {
      log.warn("WhatsApp signature verification failed");
      return res.status(401).json({ error: "invalid_signature" });
    }

    const payload = (req.body || {}) as WhatsappWebhookPayload;
    if (payload.object !== "whatsapp_business_account") {
      // Acknowledge but ignore non-WhatsApp events — Meta delivers
      // Messenger, IG, etc. through their own webhooks, but a customer
      // could mis-subscribe a field. 200 stops retries either way.
      return res.status(200).json({ ok: true, ignored: true });
    }

    let received = 0;
    let statusEvents = 0;

    for (const entry of payload.entry || []) {
      const wabaId = entry.id ? String(entry.id) : null;
      for (const change of entry.changes || []) {
        if (change.field !== "messages") {
          // Future Meta change types (account_update, etc.) we don't
          // yet handle.
          continue;
        }
        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id
          ? String(value.metadata.phone_number_id)
          : null;
        const displayPhoneNumber = value.metadata?.display_phone_number
          ? String(value.metadata.display_phone_number)
          : null;

        // Inbound messages.
        for (const m of value.messages || []) {
          const senderWaId = m.from ? String(m.from) : null;
          const messageId = m.id ? String(m.id) : null;
          const messageType = m.type ? String(m.type) : null;
          const messageText = m.text?.body ?? null;

          try {
            await writeAudit({
              actorType: "system",
              action: "socialsync.whatsapp.message_received",
              entityType: "whatsapp_phone_number",
              entityId: phoneNumberId ?? wabaId ?? "unknown",
              after: {
                waba_id: wabaId,
                phone_number_id: phoneNumberId,
                display_phone_number: displayPhoneNumber,
                sender_wa_id: senderWaId,
                message_id: messageId,
                message_type: messageType,
                // Truncate body in the audit row so a flood of long
                // messages doesn't bloat audit_log. Full text is still
                // retrievable from Meta if needed.
                message_text:
                  messageText && messageType === "text"
                    ? messageText.slice(0, 500)
                    : null,
                meta_timestamp: m.timestamp ?? null,
              },
              metadata: {
                source: "meta_whatsapp_webhook",
              },
            });
            received++;
          } catch (err) {
            log.error("Failed to write audit row for inbound WhatsApp message", {
              error: String(err),
              phoneNumberId,
              messageId,
            });
          }
        }

        // Status updates (sent / delivered / read / failed). Counted but
        // not individually audited in this foundation PR — they're high
        // volume and not customer-actionable until the inbox UI ships.
        if (value.statuses && value.statuses.length > 0) {
          statusEvents += value.statuses.length;
        }
      }
    }

    log.info("Processed inbound Meta WhatsApp webhook", {
      received,
      statusEvents,
      entries: payload.entry?.length ?? 0,
    });

    // Always 200 — Meta retries non-2xx and we've already accepted the
    // signed delivery. Per-event failures are recorded above.
    return res.status(200).json({
      ok: true,
      received,
      status_events: statusEvents,
    });
  });
}
