/**
 * AdFlow creative approval email — sent when an AdFlow fulfillment task
 * containing "approves creatives" moves to waiting_on = "client".
 *
 * Uses the transactional shell for consistent brand styling.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("AdflowCreativeApproval");

interface AdflowCreativeApprovalData {
  recipientEmail: string;
  businessName: string;
  clientServiceId: number;
}

export async function sendAdflowCreativeApprovalEmail(data: AdflowCreativeApprovalData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping creative approval email");
    return false;
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const portalUrl = `${baseUrl}/portal/services/${data.clientServiceId}`;
  const subject = "Your ad creatives are ready for review";

  const bodyHtml = `
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      Our agency team has prepared your ad creatives for <strong style="color:#F0F0F0;">${escapeHtml(data.businessName)}</strong>. Please review and approve them in your portal so we can get your campaigns running.
    </p>
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 4px;">
      If you'd like any changes, you can request revisions directly from the portal.
    </p>
  `;

  const html = buildTransactionalEmail({
    recipientEmail: data.recipientEmail,
    subjectForTitle: subject,
    headerTagline: "Creative review",
    eyebrow: "ACTION NEEDED",
    headline: "Your ad creatives are ready",
    bodyHtml,
    cta: {
      label: "Review Creatives",
      url: portalUrl,
      style: "primary",
    },
    supportNote: `Log in to your <a href="${portalUrl}" style="color:#66E8FA;text-decoration:none;">portal</a> to review and approve your creatives.`,
  });

  const text = buildPlainText({
    headline: "Your ad creatives are ready for review",
    intro: `Our agency team has prepared your ad creatives for ${data.businessName}. Please review and approve them in your portal.`,
    ctaLabel: "Review Creatives",
    ctaUrl: portalUrl,
    supportNote: `Visit your portal: ${portalUrl}`,
  });

  try {
    await transporter.sendMail({
      from: `"WeFixTrades AdFlow" <${getFromAddress()}>`,
      to: data.recipientEmail,
      subject,
      html,
      text,
    });
    log.info("Creative approval email sent", { to: data.recipientEmail, csId: data.clientServiceId });
    return true;
  } catch (err: any) {
    log.error("Creative approval email send failed", { error: err.message, csId: data.clientServiceId });
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
