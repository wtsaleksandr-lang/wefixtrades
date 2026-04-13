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
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #0B0F14; padding: 40px 16px;">
      <div style="max-width: 480px; margin: 0 auto;">

        <!-- Logo -->
        <div style="text-align: center; margin-bottom: 32px;">
          <span style="display: inline-block; background: rgba(102,232,250,0.12); color: #66E8FA; font-size: 12px; font-weight: 800; padding: 5px 16px; border-radius: 999px; letter-spacing: 0.06em;">WeFixTrades</span>
        </div>

        <!-- Card -->
        <div style="background: #151A21; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 36px 28px;">

          <!-- Headline -->
          <h1 style="font-size: 24px; font-weight: 700; color: #F0F0F0; margin: 0 0 6px; text-align: center;">
            Your system is ready
          </h1>
          <p style="font-size: 14px; color: #8B919A; margin: 0 0 28px; text-align: center;">
            Takes 2\u20133 minutes. We'll handle the rest.
          </p>

          <!-- CTA -->
          <a href="${onboardingUrl}" style="display: block; background: #66E8FA; color: #0B0F14; font-size: 15px; font-weight: 700; padding: 14px 24px; border-radius: 10px; text-decoration: none; text-align: center;">
            Complete Setup
          </a>

          <!-- Divider -->
          <div style="border-top: 1px solid rgba(255,255,255,0.06); margin: 28px 0;"></div>

          <!-- Steps -->
          <p style="font-size: 12px; font-weight: 600; color: #8B919A; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 16px;">
            What happens next
          </p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px;">
                <span style="display: inline-block; width: 22px; height: 22px; background: rgba(102,232,250,0.12); color: #66E8FA; font-size: 11px; font-weight: 700; border-radius: 6px; text-align: center; line-height: 22px;">1</span>
              </td>
              <td style="padding: 8px 0; font-size: 13px; color: #CDD1D6; line-height: 1.4;">
                You answer a few quick questions
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 12px 8px 0; vertical-align: top;">
                <span style="display: inline-block; width: 22px; height: 22px; background: rgba(102,232,250,0.12); color: #66E8FA; font-size: 11px; font-weight: 700; border-radius: 6px; text-align: center; line-height: 22px;">2</span>
              </td>
              <td style="padding: 8px 0; font-size: 13px; color: #CDD1D6; line-height: 1.4;">
                We configure your system automatically
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 12px 8px 0; vertical-align: top;">
                <span style="display: inline-block; width: 22px; height: 22px; background: rgba(102,232,250,0.12); color: #66E8FA; font-size: 11px; font-weight: 700; border-radius: 6px; text-align: center; line-height: 22px;">3</span>
              </td>
              <td style="padding: 8px 0; font-size: 13px; color: #CDD1D6; line-height: 1.4;">
                You go live and start capturing jobs
              </td>
            </tr>
          </table>
        </div>

        <!-- Footer -->
        <p style="font-size: 12px; color: #555B63; text-align: center; margin: 24px 0 0; line-height: 1.5;">
          No technical work required. Everything is handled for you.
        </p>
        <p style="font-size: 11px; color: #3A3F47; text-align: center; margin: 16px 0 0; line-height: 1.5;">
          If the button doesn\u2019t work, copy this link:<br/>
          <a href="${onboardingUrl}" style="color: #66E8FA; word-break: break-all;">${onboardingUrl}</a>
        </p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: params.client.contact_email,
      subject: `Your system is ready — let's finish setup`,
      html,
    });
    console.log(`[onboarding-email] Sent onboarding email to ${params.client.contact_email} for ${params.serviceName}`);
    return true;
  } catch (err: any) {
    console.error(`[onboarding-email] Failed to send:`, err.message);
    return false;
  }
}
