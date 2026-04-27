import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

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
  cached = nodemailer.createTransport(
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
