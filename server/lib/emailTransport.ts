import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { generateEmailId, injectTracking } from "./emailTracking";
import { createLogger } from "./logger";
import {
  sendEmailViaOrchestrator,
  type EmailCategory,
} from "./emailOrchestrator";

const log = createLogger("EmailTransport");

/**
 * Master kill switch for the multi-provider orchestrator. When set to
 * `"true"` (any case), every call to `transporter.sendMail()` flows through
 * `sendEmailViaOrchestrator()` — which routes to Resend → Brevo →
 * MailerLite → AWS SES → SendGrid based on category. When unset or
 * `"false"`, the legacy SMTP-via-SendGrid path is used and nothing
 * changes for callers.
 *
 * This single env-var flag lets us roll out provider rotation gradually
 * (one provider at a time gets a Doppler key set) and snap back to
 * SendGrid-only on a moment's notice if a vendor outage hits.
 */
function orchestratorEnabled(): boolean {
  return String(process.env.EMAIL_ORCHESTRATOR_ENABLED || "").toLowerCase() === "true";
}

/**
 * Marker URL fragment that buildLegalFooter() emits when called with
 * `marketing: true` (the unsubscribe link). If the rendered HTML contains
 * this fragment we know the message is marketing-class and must carry the
 * RFC 8058 List-Unsubscribe + One-Click POST headers — Gmail / Yahoo /
 * Apple require these on bulk mail since Feb 2024 or the message is
 * flagged as spam.
 */
const UNSUBSCRIBE_URL_FRAGMENT = "/api/unsubscribe/";

/**
 * Heuristic category classifier for legacy callers that don't pass an
 * explicit `category` field on `sendMail()`. The orchestrator routes
 * marketing vs transactional vs cold_outreach down different provider
 * chains; callers can override by setting `mailOpts.category` directly,
 * but most existing call sites won't.
 *
 * Marker: the unsubscribe-link fragment that `buildLegalFooter()` emits
 * with `marketing: true` is our strongest marketing signal. Cold outreach
 * is rare and currently always explicitly tagged.
 */
function inferCategory(mailOpts: any): EmailCategory {
  if (mailOpts.category) return mailOpts.category as EmailCategory;
  const html = typeof mailOpts.html === "string" ? mailOpts.html : "";
  if (html.includes(UNSUBSCRIBE_URL_FRAGMENT)) return "marketing";
  return "transactional";
}

/**
 * Extracts the absolute unsubscribe URL embedded in the email footer (if
 * any). Returns null for transactional mail that doesn't carry one.
 */
function extractUnsubscribeUrl(html: string | undefined): string | null {
  if (!html) return null;
  // Look for href="https://.../api/unsubscribe/<token>"
  const re = /href="(https?:\/\/[^"]+\/api\/unsubscribe\/[^"]+)"/i;
  const match = html.match(re);
  return match ? match[1] : null;
}

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
 * Every message sent through the transporter automatically receives the
 * X-SMTPAPI header that disables SendGrid click + open tracking. See
 * SENDGRID_TRACKING_DISABLED_HEADER above for rationale.
 */
export function getEmailTransporter(): Transporter | null {
  if (cached) return cached;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // ── Orchestrator-only mode ──
  // When SMTP is not configured but the orchestrator IS enabled, return
  // a stub transporter whose only job is to forward to
  // sendEmailViaOrchestrator(). This lets us drop SendGrid SMTP entirely
  // once Resend/Brevo are providing reliable transactional volume.
  if ((!host || !user || !pass) && orchestratorEnabled()) {
    const stub = nodemailer.createTransport({ jsonTransport: true });
    const origStubSend = stub.sendMail.bind(stub);
    stub.sendMail = (async (mailOpts: any) => {
      const emailId = generateEmailId();
      const baseUrl = process.env.APP_URL
        || process.env.APP_PUBLIC_URL
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");
      let trackedHtml = mailOpts.html;
      try {
        trackedHtml = mailOpts.html ? injectTracking(mailOpts.html, { emailId, baseUrl }) : mailOpts.html;
      } catch {
        /* tracking is best-effort */
      }
      const recipients = Array.isArray(mailOpts.to) ? mailOpts.to : [mailOpts.to];
      const result = await sendEmailViaOrchestrator({
        to: recipients,
        from: typeof mailOpts.from === "string" ? mailOpts.from : `${mailOpts.from?.name || ""} <${mailOpts.from?.address}>`.trim(),
        subject: mailOpts.subject,
        html: trackedHtml,
        text: mailOpts.text,
        replyTo: typeof mailOpts.replyTo === "string" ? mailOpts.replyTo : mailOpts.replyTo?.address,
        headers: { ...(mailOpts.headers || {}), "X-WeFixTrades-Email-Id": emailId },
        attachments: Array.isArray(mailOpts.attachments)
          ? mailOpts.attachments
              .filter((a: any) => a?.content && Buffer.isBuffer(a.content))
              .map((a: any) => ({ filename: a.filename, content: a.content }))
          : undefined,
        category: (mailOpts.category as any) ||
          (typeof mailOpts.html === "string" && mailOpts.html.includes(UNSUBSCRIBE_URL_FRAGMENT)
            ? "marketing"
            : "transactional"),
      });
      return {
        messageId: result.messageId,
        accepted: recipients,
        rejected: [],
        response: `250 OK via=${result.providerUsed}`,
        envelope: { from: mailOpts.from, to: recipients },
      } as any;
    }) as typeof stub.sendMail;
    // Suppress unused-var warning for origStubSend (kept for nodemailer
    // typing parity — same shape we use in the SMTP path above).
    void origStubSend;
    cached = stub;
    return cached;
  }

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

  /* ── Tracking auto-injection wrapper ──
     Every outbound HTML email gets a unique opaque email_id, a 1x1
     tracking pixel, and rewritten <a href> links pointing through the
     /api/email/click/:id redirect. Plain-text portion is unchanged.
     If injection throws, we fall back to sending the original HTML
     so a tracking bug can never block a real send. */
  const origSendMail = transporter.sendMail.bind(transporter);
  transporter.sendMail = (async (mailOpts: any) => {
    try {
      const emailId = generateEmailId();
      const baseUrl = process.env.APP_URL
        || process.env.APP_PUBLIC_URL
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");

      const trackedHtml = mailOpts.html
        ? injectTracking(mailOpts.html, { emailId, baseUrl })
        : mailOpts.html;

      /* ── List-Unsubscribe auto-injection (RFC 8058 + Gmail/Yahoo 2024) ──
         If the rendered HTML carries a /api/unsubscribe/<token> link (which
         buildLegalFooter() emits when `marketing: true`), promote it to the
         List-Unsubscribe + List-Unsubscribe-Post headers so mailbox providers
         render their native one-click unsubscribe UI and don't mark us as
         spam. Transactional mail without that footer link skips this.
         Callers may also opt-in explicitly by setting a header beginning
         with the URL fragment. Existing headers are not overridden. */
      const callerHeaders = (mailOpts.headers || {}) as Record<string, string>;
      const headers: Record<string, string> = {
        ...callerHeaders,
        "X-WeFixTrades-Email-Id": emailId,
      };
      if (!headers["List-Unsubscribe"] && trackedHtml && typeof trackedHtml === "string"
          && trackedHtml.includes(UNSUBSCRIBE_URL_FRAGMENT)) {
        const unsubUrl = extractUnsubscribeUrl(trackedHtml);
        if (unsubUrl) {
          headers["List-Unsubscribe"] = `<${unsubUrl}>`;
          headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
        }
      }

      const enrichedOpts = {
        ...mailOpts,
        html: trackedHtml,
        headers,
      };

      log.info(`[email-tracking] sent email_id=${emailId} to=${mailOpts.to}`);

      // ── Orchestrator routing ──
      // When the multi-provider orchestrator is enabled, hand off to it
      // instead of the SendGrid SMTP transporter. The orchestrator
      // picks Resend / Brevo / MailerLite / AWS SES based on category
      // and free-tier budget, falling back to SendGrid only as
      // overflow. We still emit the email_id header + tracking so
      // webhooks reconcile cleanly regardless of which provider sent.
      if (orchestratorEnabled()) {
        const recipients = Array.isArray(mailOpts.to) ? mailOpts.to : [mailOpts.to];
        const result = await sendEmailViaOrchestrator({
          to: recipients,
          from: typeof mailOpts.from === "string" ? mailOpts.from : `${mailOpts.from?.name || ""} <${mailOpts.from?.address}>`.trim(),
          subject: mailOpts.subject,
          html: trackedHtml,
          text: mailOpts.text,
          replyTo: typeof mailOpts.replyTo === "string" ? mailOpts.replyTo : mailOpts.replyTo?.address,
          headers,
          attachments: Array.isArray(mailOpts.attachments)
            ? mailOpts.attachments
                .filter((a: any) => a?.content && Buffer.isBuffer(a.content))
                .map((a: any) => ({ filename: a.filename, content: a.content }))
            : undefined,
          category: inferCategory(mailOpts),
        });
        // Return a nodemailer-shaped response so callers that inspect
        // `info.messageId` continue to work transparently.
        return {
          messageId: result.messageId,
          accepted: recipients,
          rejected: [],
          response: `250 OK via=${result.providerUsed}`,
          envelope: { from: mailOpts.from, to: recipients },
        } as any;
      }

      return await origSendMail(enrichedOpts);
    } catch (injectionErr: any) {
      // Tracking failure must never break sending. Fall back to original.
      log.warn(`[email-tracking] injection failed, sending raw: ${injectionErr.message}`);
      return await origSendMail(mailOpts);
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
