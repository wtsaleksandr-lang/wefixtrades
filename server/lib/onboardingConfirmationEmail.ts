/**
 * Onboarding submission confirmation email.
 *
 * Sent after a client successfully submits their onboarding form via
 * the public /api/onboarding/:token endpoint. Reassures the customer
 * that their info was received and tells them what happens next.
 *
 * Distinct from onboardingEmail.ts (which sends the form link) — this
 * one fires AFTER they fill it in.
 *
 * Safe-fail: never throws — catches errors and logs.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("onboarding-confirmation");

export interface OnboardingConfirmationData {
  businessName: string;
  serviceName: string;
  portalUrl: string;
}

function stepRow(n: number, text: string): string {
  return `<tr>
    <td style="padding:6px 12px 6px 0;vertical-align:top;width:22px;">
      <span style="display:inline-block;width:20px;height:20px;background:rgba(13,60,252,0.12);color:#0d3cfc;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">${n}</span>
    </td>
    <td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">${text}</td>
  </tr>`;
}

function buildHtml(recipientEmail: string, data: OnboardingConfirmationData): string {
  return buildTransactionalEmail({
    recipientEmail,
    subjectForTitle: `Setup info received — ${data.serviceName}`,
    eyebrow: "Setup info received",
    headline: "Thanks for submitting your details",
    intro: `We've received your setup information for <strong style="color:#F0F0F0;">${data.serviceName}</strong>. No further action is needed from you right now.`,
    bodyHtml: `
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:22px 0;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;">
        What happens now
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${stepRow(1, "Our team reviews your submission")}
        ${stepRow(2, "We configure and activate your service")}
        ${stepRow(3, "You'll get notified once everything is live")}
      </table>
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:22px 0;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:0;">
        You can track progress any time from your portal dashboard.
      </p>`,
    cta: { label: "Go to Dashboard", url: data.portalUrl },
    pasteLinkFallback: { url: data.portalUrl },
    supportNote: `Questions? Reply to this email or reach us at <a href="mailto:support@wefixtrades.com" style="color:#0d3cfc;text-decoration:none;">support@wefixtrades.com</a>.`,
  });
}

/**
 * Send an onboarding submission confirmation email.
 * Returns true if sent successfully, false otherwise.
 * Never throws.
 */
export async function sendOnboardingConfirmationEmail(
  recipientEmail: string,
  data: OnboardingConfirmationData,
): Promise<boolean> {
  try {
    const transporter = getEmailTransporter();
    if (!transporter) {
      log.warn("SMTP not configured — skipping onboarding confirmation");
      return false;
    }

    if (!recipientEmail) {
      log.warn("No recipient email — skipping onboarding confirmation");
      return false;
    }

    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: recipientEmail,
      replyTo: process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress(),
      subject: `Setup info received — ${data.serviceName}`,
      html: buildHtml(recipientEmail, data),
      text: buildPlainText({
        headline: "Thanks for submitting your details",
        intro: `We've received your setup information for ${data.serviceName}. No further action is needed from you right now.`,
        bodyText: "What happens now:\n  1. Our team reviews your submission\n  2. We configure and activate your service\n  3. You'll get notified once everything is live\n\nYou can track progress any time from your portal dashboard.",
        ctaLabel: "Go to Dashboard",
        ctaUrl: data.portalUrl,
        supportNote: "Questions? Reply to this email or reach us at support@wefixtrades.com.",
      }),
    });

    log.info(`Sent to ${recipientEmail} for ${data.serviceName}`);
    return true;
  } catch (err: any) {
    log.error(`Send failed for ${recipientEmail}: ${err.message}`);
    return false;
  }
}
