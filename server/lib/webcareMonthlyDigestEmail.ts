/**
 * WebCare Monthly Digest email — 5-number report.
 *
 * Sent by `webcareMonthlyDigest` worker on the 1st of each month.
 * Subject format: "Your WebCare report — <Month Year>: <Grade>, <Uptime%>".
 *
 * Uses the transactional shell (header + footer + chat-bubble). Per
 * CAN-SPAM the unsubscribe link is omitted (marketing: false).
 *
 * Closes the "what exactly am I paying you for?" gap surfaced by the
 * Wave 31 competitive research — competitors batch to PDFs, we ship
 * a 5-number digest the customer reads in 10 seconds.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildEmailHeader, buildLegalFooter, buildChatBubble } from "./emailFooter";
import { createLogger } from "./logger";

const log = createLogger("WebCareDigest");

export interface MonthlyDigestStats {
  uptimePct: number;
  securityLetter: string;
  updatesApplied: number;
  threatsBlocked: number;
  backupsTaken: number;
}

export interface MonthlyDigestData {
  businessName: string;
  recipientEmail: string;
  periodLabel: string; // "May 2026"
  stats: MonthlyDigestStats;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDigestHtml(data: MonthlyDigestData, portalUrl: string): string {
  const { stats } = data;
  const uptimeStr = `${stats.uptimePct.toFixed(1)}%`;
  return `
    <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
      <div style="max-width:560px;margin:0 auto;">
        ${buildEmailHeader()}
        <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
          <p style="font-size:12px;font-weight:700;color:#22C55E;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Monthly report</p>
          <h1 style="font-size:22px;font-weight:700;color:#F0F0F0;margin:0 0 8px;line-height:1.3;">
            Your WebCare report — ${escapeHtml(data.periodLabel)}
          </h1>
          <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 22px;">
            Five numbers that summarise the work we did on your website last month. Open the portal for the live Maintenance Log.
          </p>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:8px;margin:0 0 22px;">
            <tr>
              <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.04);">
                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;">
                  <span style="font-size:13px;color:#CDD1D6;">Uptime this month</span>
                  <span style="font-size:18px;font-weight:700;color:#22C55E;">${escapeHtml(uptimeStr)}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.04);">
                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;">
                  <span style="font-size:13px;color:#CDD1D6;">Security grade</span>
                  <span style="font-size:18px;font-weight:700;color:#F0F0F0;">${escapeHtml(stats.securityLetter)}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.04);">
                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;">
                  <span style="font-size:13px;color:#CDD1D6;">Updates applied</span>
                  <span style="font-size:18px;font-weight:700;color:#F0F0F0;">${stats.updatesApplied}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.04);">
                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;">
                  <span style="font-size:13px;color:#CDD1D6;">Threats blocked</span>
                  <span style="font-size:18px;font-weight:700;color:#F0F0F0;">${stats.threatsBlocked}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 16px;">
                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;">
                  <span style="font-size:13px;color:#CDD1D6;">Backups taken</span>
                  <span style="font-size:18px;font-weight:700;color:#F0F0F0;">${stats.backupsTaken}</span>
                </div>
              </td>
            </tr>
          </table>

          <a href="${escapeHtml(portalUrl)}/portal/webcare/dashboard" style="display:inline-block;background:#E6E3E0;color:#1E1E1E;font-size:14px;font-weight:700;padding:13px 24px;border-radius:10px;text-decoration:none;">
            Open your WebCare dashboard &rarr;
          </a>

          <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:18px 0 0;">
            Questions? Reply to this email or reach us at <a href="mailto:support@wefixtrades.com" style="color:#0d3cfc;text-decoration:none;">support@wefixtrades.com</a>.
          </p>
        </div>
        ${buildChatBubble()}
        ${buildLegalFooter({ recipientEmail: data.recipientEmail })}
      </div>
    </div>
  `;
}

/**
 * Send a monthly digest email to a WebCare client.
 *
 * Fail-safe: returns false on any error instead of throwing, so a
 * broken email never blocks downstream worker processing.
 */
export async function sendWebcareMonthlyDigest(
  data: MonthlyDigestData,
): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — skipping monthly digest");
    return false;
  }

  const baseUrl =
    process.env.APP_URL ||
    process.env.APP_PUBLIC_URL ||
    (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "https://wefixtrades.com");

  const subject = `Your WebCare report — ${data.periodLabel}: ${data.stats.securityLetter} grade, ${data.stats.uptimePct.toFixed(1)}% uptime`;

  try {
    await transporter.sendMail({
      from: `WeFixTrades WebCare <${getFromAddress()}>`,
      to: data.recipientEmail,
      replyTo: "support@wefixtrades.com",
      subject,
      html: buildDigestHtml(data, baseUrl),
    });

    log.info("Monthly digest sent", {
      recipientEmail: data.recipientEmail,
      periodLabel: data.periodLabel,
    });
    return true;
  } catch (err: any) {
    log.error("Failed to send monthly digest", {
      recipientEmail: data.recipientEmail,
      error: err.message,
    });
    return false;
  }
}
