/**
 * Onboarding email service — sends the onboarding form link to clients
 * after successful payment.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import type { Client, OnboardingSubmission } from "@shared/schema";

interface OnboardingEmailParams {
  client: Client;
  serviceName: string;
  accessToken: string;
  baseUrl: string;
}

function stepRow(n: number, text: string): string {
  return `<tr>
    <td style="padding:8px 12px 8px 0;vertical-align:top;width:24px;">
      <span style="display:inline-block;width:22px;height:22px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:6px;text-align:center;line-height:22px;">${n}</span>
    </td>
    <td style="padding:8px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">${text}</td>
  </tr>`;
}

export async function sendOnboardingEmail(params: OnboardingEmailParams): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("[onboarding-email] SMTP not configured — skipping email");
    return false;
  }

  if (!params.client.contact_email) {
    console.warn(`[onboarding-email] Client #${params.client.id} has no email — skipping`);
    return false;
  }

  const onboardingUrl = `${params.baseUrl}/onboarding/${params.accessToken}`;

  const html = buildTransactionalEmail({
    recipientEmail: params.client.contact_email,
    subjectForTitle: "Your system is ready — let's finish setup",
    headline: "Your system is ready",
    intro: "Takes 2–3 minutes. We'll handle the rest.",
    cta: { label: "Complete Setup", url: onboardingUrl, style: "block" },
    bodyHtml: `
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:28px 0;line-height:1px;font-size:0;">&nbsp;</div>
      <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 16px;">
        What happens next
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${stepRow(1, "You answer a few quick questions")}
        ${stepRow(2, "We configure your system automatically")}
        ${stepRow(3, "You go live and start capturing jobs")}
      </table>`,
    pasteLinkFallback: { label: "If the button doesn’t work, copy this link:", url: onboardingUrl },
    supportNote: "No technical work required. Everything is handled for you.",
    showDividerBeforeSupport: true,
  });

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: params.client.contact_email,
      subject: `Your system is ready — let's finish setup`,
      html,
      text: buildPlainText({
        headline: "Your system is ready",
        intro: "Takes 2–3 minutes. We'll handle the rest.",
        bodyText: "What happens next:\n  1. You answer a few quick questions\n  2. We configure your system automatically\n  3. You go live and start capturing jobs",
        ctaLabel: "Complete Setup",
        ctaUrl: onboardingUrl,
        supportNote: "No technical work required. Everything is handled for you.",
      }),
    });
    console.log(`[onboarding-email] Sent onboarding email to ${params.client.contact_email} for ${params.serviceName}`);
    return true;
  } catch (err: any) {
    console.error(`[onboarding-email] Failed to send:`, err.message);
    return false;
  }
}
