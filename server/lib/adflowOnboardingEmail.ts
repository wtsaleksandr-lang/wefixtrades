/**
 * AdFlow onboarding kickoff email — sent when an AdFlow client_service
 * is first created (after payment via Stripe webhook provisioning).
 *
 * Subject: "Welcome to AdFlow — here's what happens next"
 * Body: Timeline of what to expect in the first 30 days.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { createLogger } from "./logger";

const log = createLogger("AdflowOnboarding");

interface AdflowOnboardingData {
  recipientEmail: string;
  businessName: string;
  contactName: string;
  clientServiceId: number;
}

export async function sendAdflowOnboardingEmail(data: AdflowOnboardingData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("No email transporter — skipping AdFlow onboarding email");
    return false;
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const portalUrl = `${baseUrl}/portal/services/${data.clientServiceId}`;
  const subject = "Welcome to AdFlow -- here's what happens next";

  const timelineHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:11px;font-weight:700;color:#66E8FA;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Day 1-2</div>
          <div style="font-size:14px;color:#CDD1D6;line-height:1.5;">Agency partner briefed on your business and campaign goals.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:11px;font-weight:700;color:#66E8FA;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Day 3-5</div>
          <div style="font-size:14px;color:#CDD1D6;line-height:1.5;">Ad account setup and campaign structure created. You may be asked to approve creatives.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="font-size:11px;font-weight:700;color:#66E8FA;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Day 7-10</div>
          <div style="font-size:14px;color:#CDD1D6;line-height:1.5;">Campaigns go live. Initial performance data starts flowing in.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;">
          <div style="font-size:11px;font-weight:700;color:#66E8FA;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Day 30</div>
          <div style="font-size:14px;color:#CDD1D6;line-height:1.5;">Your first monthly performance report arrives with leads, spend, and optimization recommendations.</div>
        </td>
      </tr>
    </table>
  `;

  const bodyHtml = `
    <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 16px;">
      Within 2 business days, our agency partner will begin setting up your campaigns for <strong style="color:#F0F0F0;">${escapeHtml(data.businessName)}</strong>. Here's what to expect:
    </p>
    ${timelineHtml}
    <p style="font-size:13px;color:#8B919A;line-height:1.6;margin:0;">
      Ad spend is funded separately — you'll pay the ad platforms directly. We handle everything else.
    </p>
  `;

  const html = buildTransactionalEmail({
    recipientEmail: data.recipientEmail,
    subjectForTitle: subject,
    headerTagline: "Getting started",
    eyebrow: "WELCOME TO ADFLOW",
    headline: "Here's what happens next",
    bodyHtml,
    cta: {
      label: "View Your Dashboard",
      url: portalUrl,
      style: "primary",
    },
    supportNote: `Questions? Reply to this email or visit your <a href="${portalUrl}" style="color:#66E8FA;text-decoration:none;">portal</a>.`,
  });

  const text = buildPlainText({
    headline: "Welcome to AdFlow -- here's what happens next",
    intro: `Within 2 business days, our agency partner will begin setting up your campaigns for ${data.businessName}.`,
    bodyText: [
      "Day 1-2: Agency partner briefed on your business and campaign goals.",
      "Day 3-5: Ad account setup and campaign structure created.",
      "Day 7-10: Campaigns go live.",
      "Day 30: Your first monthly performance report arrives.",
    ].join("\n"),
    ctaLabel: "View Your Dashboard",
    ctaUrl: portalUrl,
    supportNote: "Questions? Reply to this email.",
  });

  try {
    await transporter.sendMail({
      from: `"WeFixTrades AdFlow" <${getFromAddress()}>`,
      to: data.recipientEmail,
      subject,
      html,
      text,
    });
    log.info("AdFlow onboarding email sent", { to: data.recipientEmail, csId: data.clientServiceId });
    return true;
  } catch (err: any) {
    log.error("AdFlow onboarding email send failed", { error: err.message, csId: data.clientServiceId });
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
