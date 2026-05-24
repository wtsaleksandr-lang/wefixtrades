import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { generateEmailId, injectTracking } from "./emailTracking";
import { createLogger } from "./logger";

const log = createLogger("EmailTransport");

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
