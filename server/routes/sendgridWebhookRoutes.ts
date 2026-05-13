/**
 * SendGrid Event Webhook route.
 *
 *   POST /api/email/sendgrid-webhook
 *
 * Receives bounce / spam-report / dropped / unsubscribe events from
 * SendGrid and writes them into the `email_unsubscribes` suppression
 * table so future marketing sends to those addresses are blocked at
 * the `isEmailUnsubscribed()` check.
 *
 * Setup (Alex):
 *   1. SendGrid → Settings → Mail Settings → Event Webhook → enable
 *      and set the URL to https://wefixtrades.com/api/email/sendgrid-webhook
 *   2. Enable "Signed Event Webhook Requests" — copy the verification
 *      key SendGrid shows.
 *   3. Add to Replit Production Secrets (and Doppler if you mirror):
 *        SENDGRID_WEBHOOK_PUBLIC_KEY = <the key SendGrid showed>
 *      Accepts either a full PEM or the raw base64 SendGrid surfaces.
 *   4. Select the events to forward — recommend at minimum: Bounced,
 *      Dropped, Spam Report, Unsubscribed, Group Unsubscribed.
 *      (Delivered / Open / Click are also fine but we don't act on
 *      them here.)
 *   5. Hit "Test Your Integration" in the SendGrid UI to confirm a 200.
 *
 * Security posture:
 *   - If SENDGRID_WEBHOOK_PUBLIC_KEY is unset, the route returns 503 so
 *     a misconfiguration is loud, not silent.
 *   - All requests are signature-verified via ECDSA (SHA-256) before any
 *     event is processed. A failed signature → 401, no DB writes.
 *   - The handler swallows per-event errors so one malformed event
 *     doesn't fail the whole batch (SendGrid retries the entire batch
 *     on non-2xx).
 */

import type { Express, Request, Response } from "express";
import { recordUnsubscribe } from "../lib/unsubscribeStorage";
import {
  classifyEvent,
  verifySendgridSignature,
  type SendGridEvent,
} from "../lib/sendgridWebhook";
import { createLogger } from "../lib/logger";

const log = createLogger("SendgridWebhook");

const SIGNATURE_HEADER = "x-twilio-email-event-webhook-signature";
const TIMESTAMP_HEADER = "x-twilio-email-event-webhook-timestamp";

export function registerSendgridWebhookRoutes(app: Express): void {
  app.post("/api/email/sendgrid-webhook", async (req: Request, res: Response) => {
    const publicKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
    if (!publicKey) {
      log.warn("SENDGRID_WEBHOOK_PUBLIC_KEY not configured — refusing webhook");
      return res.status(503).json({ error: "webhook_not_configured" });
    }

    const signature = req.header(SIGNATURE_HEADER);
    const timestamp = req.header(TIMESTAMP_HEADER);
    if (!signature || !timestamp) {
      log.warn("missing signature headers", { hasSig: !!signature, hasTs: !!timestamp });
      return res.status(401).json({ error: "missing_signature" });
    }

    // Raw body captured globally via express.json({ verify }) — see server/index.ts
    const rawBody = (req as Request & { rawBody?: Buffer | string }).rawBody;
    if (!rawBody) {
      log.error("rawBody missing on request — express.json verify hook misconfigured?");
      return res.status(500).json({ error: "raw_body_unavailable" });
    }

    const ok = verifySendgridSignature(publicKey, rawBody, signature, timestamp);
    if (!ok) {
      log.warn("signature verification failed");
      return res.status(401).json({ error: "invalid_signature" });
    }

    const events: SendGridEvent[] = Array.isArray(req.body) ? req.body : [];
    if (events.length === 0) {
      // SendGrid sometimes sends empty test pings; treat as success.
      return res.json({ ok: true, processed: 0 });
    }

    let suppressed = 0;
    let monitored = 0;
    let ignored = 0;

    for (const ev of events) {
      try {
        const decision = classifyEvent(ev);
        if (decision === "suppress") {
          if (!ev.email) {
            ignored++;
            continue;
          }
          await recordUnsubscribe({
            email: ev.email,
            source: `sendgrid_${ev.event}`,
          });
          suppressed++;
        } else if (decision === "monitor") {
          // Don't auto-suppress on `blocked` / `deferred` — these can be
          // transient. Log so ops can pull repeat offenders out of
          // sender lists manually if a pattern emerges.
          log.info("monitor-only event", {
            event: ev.event,
            email: ev.email,
            reason: ev.reason,
            status: ev.status,
          });
          monitored++;
        } else {
          ignored++;
        }
      } catch (err: any) {
        // One malformed event must not fail the whole batch — SendGrid
        // would retry the entire batch, double-processing the good ones.
        log.error("per-event handler error", { event: ev?.event, error: err?.message });
        ignored++;
      }
    }

    log.info("processed batch", { suppressed, monitored, ignored, total: events.length });
    return res.json({ ok: true, suppressed, monitored, ignored });
  });
}
