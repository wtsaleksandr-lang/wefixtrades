/**
 * WebCare downtime alert email — transactional notification.
 *
 * Sent when the WebCare health worker detects a client's website is
 * unreachable or returning a non-2xx status. Uses the transactional
 * email shell (header + footer), NOT the report shell — this is an
 * alert, not a monthly report.
 *
 * Dedup: callers must enforce a per-site cooldown (no more than 1 alert
 * per site per 4 hours). The worker tracks this via
 * client_service.metadata.last_downtime_alert_at.
 *
 * Transactional emails are exempt from CAN-SPAM unsubscribe
 * requirements, but we still pass `marketing: false` to the footer
 * so the unsubscribe link is omitted.
 */

import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildEmailHeader, buildLegalFooter, buildChatBubble } from "./emailFooter";
import { createLogger } from "./logger";

const log = createLogger("WebCareAlert");

export interface DowntimeAlertData {
  businessName: string;
  websiteUrl: string;
  httpStatus: number | null;
  error: string | null;
  detectedAt: string;          // ISO timestamp
  recipientEmail: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAlertHtml(data: DowntimeAlertData, portalUrl: string): string {
  const detectedDate = new Date(data.detectedAt);
  const timeStr = detectedDate.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const statusDetail = data.httpStatus
    ? `returning HTTP ${data.httpStatus}`
    : `unreachable (${escapeHtml(data.error || "connection failed")})`;

  return `
    <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
      <div style="max-width:520px;margin:0 auto;">
        ${buildEmailHeader()}
        <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
          <p style="font-size:12px;font-weight:700;color:#EF4444;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Website alert</p>
          <h1 style="font-size:22px;font-weight:700;color:#F0F0F0;margin:0 0 10px;line-height:1.3;">
            Your website appears to be down
          </h1>
          <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 18px;">
            Our automated monitoring detected that <strong style="color:#F0F0F0;">${escapeHtml(data.websiteUrl)}</strong> is currently ${statusDetail}.
          </p>

          <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;margin:0 0 22px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="padding:0 0 8px;">
                  <span style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;">Detected at</span>
                </td>
                <td style="padding:0 0 8px;text-align:right;">
                  <span style="font-size:13px;color:#CDD1D6;">${escapeHtml(timeStr)}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:0 0 8px;">
                  <span style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;">Status</span>
                </td>
                <td style="padding:0 0 8px;text-align:right;">
                  <span style="font-size:13px;color:#EF4444;font-weight:600;">${data.httpStatus ? `HTTP ${data.httpStatus}` : "Unreachable"}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:0;">
                  <span style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;">Website</span>
                </td>
                <td style="padding:0;text-align:right;">
                  <span style="font-size:13px;color:#66E8FA;">${escapeHtml(data.websiteUrl)}</span>
                </td>
              </tr>
            </table>
          </div>

          <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.20);border-radius:10px;padding:14px 16px;margin:0 0 22px;">
            <p style="font-size:11px;font-weight:600;color:#FCA5A5;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">What we're doing</p>
            <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;">
              Our team has been notified and is investigating. We'll continue monitoring your site and will follow up when it's back online. If you're already aware of planned maintenance, you can safely ignore this alert.
            </p>
          </div>

          <a href="${escapeHtml(portalUrl)}/portal" style="display:inline-block;background:#66E8FA;color:#0B0F14;font-size:14px;font-weight:700;padding:13px 24px;border-radius:10px;text-decoration:none;">
            View your portal &rarr;
          </a>

          <p style="font-size:12px;color:#8B919A;line-height:1.6;margin:16px 0 0;">
            If you have questions, reply to this email or reach us at <a href="mailto:support@wefixtrades.com" style="color:#66E8FA;text-decoration:none;">support@wefixtrades.com</a>.
          </p>
        </div>
        ${buildChatBubble()}
        ${buildLegalFooter({ recipientEmail: data.recipientEmail })}
      </div>
    </div>
  `;
}

/**
 * Send a downtime alert email to a WebCare client.
 *
 * Fail-safe: returns false on any error instead of throwing,
 * so a broken email never blocks the health worker's task creation.
 */
export async function sendWebcareDowntimeAlert(data: DowntimeAlertData): Promise<boolean> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("SMTP not configured — skipping downtime alert");
    return false;
  }

  const baseUrl = process.env.APP_URL
    || process.env.APP_PUBLIC_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");

  const subject = `Alert: ${data.websiteUrl} appears to be down`;

  try {
    await transporter.sendMail({
      from: `WeFixTrades WebCare <${getFromAddress()}>`,
      to: data.recipientEmail,
      replyTo: "support@wefixtrades.com",
      subject,
      html: buildAlertHtml(data, baseUrl),
    });

    log.info("Downtime alert sent", {
      recipientEmail: data.recipientEmail,
      websiteUrl: data.websiteUrl,
    });
    return true;
  } catch (err: any) {
    log.error("Failed to send downtime alert", {
      recipientEmail: data.recipientEmail,
      error: err.message,
    });
    return false;
  }
}
