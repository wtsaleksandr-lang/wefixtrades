/**
 * Onboarding email service — sends the onboarding form link to clients
 * after successful payment.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import type { Client, OnboardingSubmission } from "@shared/schema";

interface OnboardingEmailParams {
  client: Client;
  serviceName: string;
  accessToken: string;
  baseUrl: string;
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
  const contactName = params.client.contact_name || params.client.business_name;

  const html = `
    <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #1a1a2e;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background: #66E8FA; color: #181D1F; font-size: 13px; font-weight: 800; padding: 4px 14px; border-radius: 999px; letter-spacing: 0.04em;">WeFixTrades</div>
      </div>

      <h1 style="font-size: 22px; font-weight: 700; color: #1a1a2e; margin: 0 0 8px;">Welcome aboard, ${contactName}!</h1>
      <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Thank you for your purchase. To get started with <strong>${params.serviceName}</strong>,
        we need a few details from you.
      </p>

      <div style="background: #f7f8fa; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #1a1a2e; margin-bottom: 12px;">
          Please complete your onboarding form:
        </div>
        <a href="${onboardingUrl}" style="display: inline-block; background: #66E8FA; color: #181D1F; font-size: 14px; font-weight: 700; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
          Complete Onboarding &rarr;
        </a>
      </div>

      <div style="font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 24px;">
        <strong>What happens next:</strong><br/>
        1. Fill out the short form (takes ~5 minutes)<br/>
        2. Our team reviews your details and starts setup<br/>
        3. You'll receive updates as we progress
      </div>

      <div style="border-top: 1px solid #eee; padding-top: 16px; font-size: 12px; color: #999; line-height: 1.5;">
        If the button doesn't work, copy and paste this link:<br/>
        <a href="${onboardingUrl}" style="color: #66E8FA; word-break: break-all;">${onboardingUrl}</a>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: params.client.contact_email,
      subject: `Complete your onboarding for ${params.serviceName} — WeFixTrades`,
      html,
    });
    console.log(`[onboarding-email] Sent onboarding email to ${params.client.contact_email} for ${params.serviceName}`);
    return true;
  } catch (err: any) {
    console.error(`[onboarding-email] Failed to send:`, err.message);
    return false;
  }
}
