import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { generateEmailId, injectTracking } from "./emailTracking";
import {
  computeDedupeHash,
  enqueueSend,
  isDuplicate,
  markRetrying,
  markSent,
  recordSkip,
} from "./emailSendQueue";

let cached: Transporter | null = null;

/**
 * SendGrid X-SMTPAPI header that disables per-email click tracking +
 * open tracking + subscription tracking, regardless of account-level
 * defaults. We force this on every outbound message because:
 *
 *   1. Click tracking rewrites every <a href> to a branded subdomain
 *      like url1527.wefixtrades.com.
 *   2. SendGrid's auto-issued SSL cert for that subdomain is currently
 *      not provisioned, so the rewritten URL resolves as `http://`.
 *   3. Gmail flags the email — strikes through HTTPS in the URL bar
 *      and may show a "this site is not secure" interstitial on click.
 *
 * Until link branding SSL is fixed via the SendGrid dashboard
 * (Sender Authentication → Link Branding → enable Automated Security
 * + verify the new CNAMEs), the safest behavior is to bypass tracking
 * entirely. Tracking adds little value to transactional + report
 * emails, and the broken links would damage trust.
 *
 * Re-enable by removing this header (or setting `enable: 1`) once the
 * branded link domain shows a valid green-padlock HTTPS cert.
 *
 * Reference: https://docs.sendgrid.com/api-reference/tracking-settings
 */
const SENDGRID_TRACKING_DISABLED_HEADER = JSON.stringify({
  filters: {
    clicktrack: { settings: { enable: 0, enable_text: false } },
    opentrack: { settings: { enable: 0 } },
  },
});

/**
 * Returns a shared nodemailer SMTP transporter.
 * Returns null if SMTP env vars are not configured.
 *
 * Every outbound email goes through three layered enhancements at the
 * wrapper level (so individual callers don't need to know):
 *
 *   1. Tracking — fresh email_id, 1x1 pixel, click-redirect link rewrites
 *   2. Dedupe — content-level 60s collapse window via email_send_queue
 *   3. Reliability — durable queue row + retry semantics for transient
 *                    SMTP failures (drained by emailSendQueueWorker)
 *
 * Failures in any of those layers fall back to a raw send — the layered
 * enhancements MUST NEVER block real email delivery.
 */
export function getEmailTransporter(): Transporter | null {
  if (cached) return cached;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const transporter = nodemailer.createTransport(
    {
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    },
    {
      // Defaults applied to every sendMail() call
      headers: {
        "X-SMTPAPI": SENDGRID_TRACKING_DISABLED_HEADER,
      },
    },
  );

  /* ── Send wrapper: tracking + queue + retry ──
   *
   * Every outbound HTML email goes through:
   *   1. Generate fresh email_id
   *   2. Compute dedupe_hash, check 60s window — if duplicate, return
   *      a fake success object and record skip in queue (caller is
   *      transparently de-duped)
   *   3. Inject tracking pixel + click-redirect links
   *   4. INSERT queue row → status='pending'
   *   5. Synchronous SMTP attempt
   *      success → UPDATE row → status='sent', return nodemailer info
   *      failure → UPDATE row → status='retrying', re-throw error so
   *                              caller sees same behavior as today;
   *                              the retry worker will drain it later
   *
   * Queue/tracking failures NEVER block the send: any error in the
   * queue layer falls back to the original raw sendMail.
   */
  const origSendMail = transporter.sendMail.bind(transporter);
  transporter.sendMail = (async (mailOpts: any) => {
    let emailId: string | null = null;
    let queueRowId: number | null = null;
    let trackedOpts: any = mailOpts;

    try {
      emailId = generateEmailId();
      const baseUrl = process.env.APP_URL
        || process.env.APP_PUBLIC_URL
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");

      const recipient = String(mailOpts.to || "");
      const subject = mailOpts.subject || "";
      const dedupeHash = computeDedupeHash({
        recipient,
        subject,
        html: mailOpts.html,
        text: mailOpts.text,
      });

      // Dedupe: if same content sent within 60s, return fake success.
      if (await isDuplicate(dedupeHash)) {
        await recordSkip(emailId, recipient, dedupeHash, "duplicate");
        console.log(`[email-queue] skipped duplicate · email_id=${emailId} to=${recipient}`);
        return {
          envelope: { from: mailOpts.from, to: [recipient] },
          messageId: `<deduped-${emailId}@wefixtrades.local>`,
          accepted: [recipient],
          rejected: [],
          response: "250 deduped",
        } as any;
      }

      const trackedHtml = mailOpts.html
        ? injectTracking(mailOpts.html, { emailId, baseUrl })
        : mailOpts.html;

      trackedOpts = {
        ...mailOpts,
        html: trackedHtml,
        headers: {
          ...(mailOpts.headers || {}),
          "X-WeFixTrades-Email-Id": emailId,
        },
      };

      // Insert queue row BEFORE sending — durability anchor.
      const queueRow = await enqueueSend({
        emailId,
        recipient,
        subject,
        // Persist the tracked payload so the retry worker can re-fire as-is.
        payload: {
          from: trackedOpts.from,
          to: trackedOpts.to,
          replyTo: trackedOpts.replyTo,
          subject: trackedOpts.subject,
          html: trackedOpts.html,
          text: trackedOpts.text,
          headers: trackedOpts.headers,
        },
        dedupeHash,
      });
      queueRowId = queueRow.id;
    } catch (preflightErr: any) {
      // Anything in the pre-send pipeline (tracking inject, queue insert,
      // dedupe check) must NEVER block sending. Fall back to raw send.
      console.warn(`[email-queue] preflight failed, sending raw: ${preflightErr.message}`);
      return origSendMail(mailOpts);
    }

    // Synchronous SMTP attempt
    try {
      const info = await origSendMail(trackedOpts);
      if (queueRowId !== null) {
        await markSent(queueRowId, (info as any)?.messageId ?? null).catch((markErr: any) => {
          console.warn(`[email-queue] markSent failed: ${markErr.message}`);
        });
      }
      console.log(`[email-tracking] sent email_id=${emailId} to=${mailOpts.to}`);
      return info;
    } catch (sendErr: any) {
      if (queueRowId !== null) {
        await markRetrying(queueRowId, sendErr.message || String(sendErr)).catch((markErr: any) => {
          console.warn(`[email-queue] markRetrying failed: ${markErr.message}`);
        });
      }
      console.warn(`[email-queue] send failed (queued for retry) email_id=${emailId} err=${sendErr.message}`);
      throw sendErr;
    }
  }) as typeof transporter.sendMail;

  cached = transporter;
  return cached;
}

/** Default "from" address for outbound emails. */
export function getFromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@wefixtrades.com";
}

/**
 * For callers that hit the SendGrid REST API directly (preview tooling,
 * one-shot test scripts), include this object in the JSON body to
 * disable click + open tracking on a single message.
 *
 *   const payload = {
 *     personalizations: [...],
 *     from: { ... },
 *     subject: "...",
 *     content: [...],
 *     tracking_settings: SENDGRID_TRACKING_OFF,
 *   };
 */
export const SENDGRID_TRACKING_OFF = {
  click_tracking: { enable: false, enable_text: false },
  open_tracking: { enable: false },
  subscription_tracking: { enable: false },
} as const;
