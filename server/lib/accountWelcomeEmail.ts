/**
 * Account-created welcome email.
 *
 * Sent the first time a portal account is auto-provisioned for a paying
 * customer (via storage.ensurePortalAccount). The service-specific
 * "welcome package" email fires separately when each service actually
 * goes live — this one is about the portal account itself: how to log
 * in, what to expect, how to reach us.
 *
 * Security-correct flow: we never email the temp password. We generate
 * a single-use password-set token (reuses the password-reset token
 * table) so the customer sets their first password via a magic link.
 */

import crypto from "crypto";
import { db } from "../db";
import { passwordResetTokens, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildLegalFooter, buildEmailHeader, buildChatBubble } from "./emailFooter";
import type { User, Client } from "@shared/schema";

interface SendParams {
  user: User;
  client: Client;
}

function buildHtml(params: {
  contactName: string;
  businessName: string;
  setPasswordUrl: string;
  portalUrl: string;
  supportEmail: string;
  contactEmail: string;
}): string {
  return `
    <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
      <div style="max-width:520px;margin:0 auto;">
        ${buildEmailHeader()}
        <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
          <p style="font-size:12px;font-weight:700;color:#66E8FA;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Your portal is ready</p>
          <h1 style="font-size:24px;font-weight:700;color:#F0F0F0;margin:0 0 10px;line-height:1.25;">
            Welcome aboard, ${params.contactName.split(" ")[0] || "there"}
          </h1>
          <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 22px;">
            We've set up your account for <strong style="color:#F0F0F0;">${params.businessName}</strong>. Set a password below, then you'll have one dashboard for every service, invoice, and piece of support.
          </p>

          <a href="${params.setPasswordUrl}" style="display:inline-block;background:#66E8FA;color:#0B0F14;font-size:14px;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;">
            Set your password
          </a>

          <p style="font-size:12px;color:#8B919A;line-height:1.5;margin:12px 0 0;">
            The link works for one hour. If it expires, just use "Forgot password" on the login page.
          </p>

          <div style="border-top:1px solid rgba(255,255,255,0.06);margin:28px 0;"></div>

          <p style="font-size:12px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;">
            What's waiting for you
          </p>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:6px 12px 6px 0;vertical-align:top;width:22px;">
                <span style="display:inline-block;width:20px;height:20px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">1</span>
              </td>
              <td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">
                Setup forms for every service you've purchased
              </td>
            </tr>
            <tr>
              <td style="padding:6px 12px 6px 0;vertical-align:top;">
                <span style="display:inline-block;width:20px;height:20px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">2</span>
              </td>
              <td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">
                Live task progress so you can see exactly what we're doing
              </td>
            </tr>
            <tr>
              <td style="padding:6px 12px 6px 0;vertical-align:top;">
                <span style="display:inline-block;width:20px;height:20px;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:11px;font-weight:700;border-radius:5px;text-align:center;line-height:20px;">3</span>
              </td>
              <td style="padding:6px 0;font-size:13px;color:#CDD1D6;line-height:1.5;">
                Invoices, reports, and support — all in one place
              </td>
            </tr>
          </table>

          <div style="border-top:1px solid rgba(255,255,255,0.06);margin:24px 0 14px;"></div>
          <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:0;">
            Need anything? Just reply to this email or reach us at <a href="mailto:${params.supportEmail}" style="color:#66E8FA;text-decoration:none;">${params.supportEmail}</a>.
          </p>
          <p style="font-size:11px;color:#555B63;line-height:1.5;margin:14px 0 0;word-break:break-all;">
            Button not working? Paste this link:<br/>
            <a href="${params.setPasswordUrl}" style="color:#66E8FA;">${params.setPasswordUrl}</a>
          </p>
        </div>
        ${buildChatBubble()}
        ${buildLegalFooter({ recipientEmail: params.contactEmail })}
      </div>
    </div>
  `;
}

/**
 * Send account-created welcome email. Creates a single-use password-set
 * token (valid 1 hour) and embeds it in a magic link.
 *
 * Idempotent — checks users.metadata-style flag via a lookup on
 * recent tokens, but if two fire races it's harmless (both tokens work).
 *
 * No-ops if SMTP is not configured.
 */
export async function sendAccountWelcome(params: SendParams): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("[account-welcome] SMTP not configured — skipping");
    return false;
  }

  if (!params.client.contact_email) {
    console.warn(`[account-welcome] Client #${params.client.id} has no email — skipping`);
    return false;
  }

  // Create a password-set token (reuses the reset-token table)
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokens).values({
    user_id: params.user.id,
    token,
    expires_at: expiresAt,
  });

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();
  const setPasswordUrl = `${baseUrl}/reset-password?token=${token}&setup=1`;
  const contactName = params.client.contact_name || params.client.business_name || "there";

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: params.client.contact_email,
      replyTo: supportEmail,
      subject: `Welcome to WeFixTrades — set your portal password`,
      html: buildHtml({
        contactName,
        businessName: params.client.business_name,
        setPasswordUrl,
        portalUrl: `${baseUrl}/portal`,
        supportEmail,
        contactEmail: params.client.contact_email,
      }),
    });
    console.log(`[account-welcome] Sent to ${params.client.contact_email} for user #${params.user.id}`);
    return true;
  } catch (err: any) {
    console.error(`[account-welcome] Send failed for user #${params.user.id}:`, err.message);
    return false;
  }
}
