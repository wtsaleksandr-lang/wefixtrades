/**
 * TradeLine Call Notification Email
 *
 * Sent to business owners when a homeowner calls their TradeLine number
 * and lead data is extracted from the conversation.
 */

import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { queueEmail } from "../services/emailQueueService";
import { createLogger } from "./logger";

const log = createLogger("tradeline-call-email");

export interface TradeLineCallEmailData {
  callerName: string;
  callerPhone: string;
  callerAddress?: string;
  jobType: string;
  urgency: string;
  jobDescription?: string;
  preferredDate?: string;
  callSummary: string;
  recordingUrl?: string;
  portalUrl: string;
  callLogId: number;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function urgencyColor(urgency: string): string {
  switch (urgency) {
    case "emergency": return "#EF4444";
    case "high": return "#F97316";
    case "medium": return "#EAB308";
    default: return "#22C55E";
  }
}

function buildCallNotificationHtml(recipientEmail: string, data: TradeLineCallEmailData): string {
  const urgencyBadge = `<span style="display:inline-block;background:${urgencyColor(data.urgency)};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;">${escapeHtml(data.urgency)}</span>`;

  const detailRows = [
    `<tr><td style="padding:6px 0;font-size:12px;color:#8B919A;width:120px;">Caller</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;font-weight:600;">${escapeHtml(data.callerName)}</td></tr>`,
    `<tr><td style="padding:6px 0;font-size:12px;color:#8B919A;">Phone</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;">${escapeHtml(data.callerPhone)}</td></tr>`,
    data.callerAddress
      ? `<tr><td style="padding:6px 0;font-size:12px;color:#8B919A;">Address</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;">${escapeHtml(data.callerAddress)}</td></tr>`
      : "",
    `<tr><td style="padding:6px 0;font-size:12px;color:#8B919A;">Job type</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;">${escapeHtml(data.jobType)}</td></tr>`,
    `<tr><td style="padding:6px 0;font-size:12px;color:#8B919A;">Urgency</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;">${urgencyBadge}</td></tr>`,
    data.preferredDate
      ? `<tr><td style="padding:6px 0;font-size:12px;color:#8B919A;">Preferred date</td><td style="padding:6px 0;font-size:14px;color:#F0F0F0;">${escapeHtml(data.preferredDate)}</td></tr>`
      : "",
  ].filter(Boolean).join("");

  const summarySection = data.callSummary
    ? `<div style="margin-top:16px;padding:12px 14px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;">
        <div style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">AI Summary</div>
        <div style="font-size:13px;color:#CDD1D6;line-height:1.5;">${escapeHtml(data.callSummary)}</div>
       </div>`
    : "";

  const recordingLink = data.recordingUrl
    ? `<p style="margin-top:12px;font-size:12px;"><a href="${data.recordingUrl}" style="color:#66E8FA;text-decoration:none;">Listen to recording</a></p>`
    : "";

  const bodyHtml = `
    <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.10);border-radius:10px;padding:14px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        ${detailRows}
      </table>
    </div>
    ${summarySection}
    ${recordingLink}
  `;

  return buildTransactionalEmail({
    recipientEmail,
    subjectForTitle: `New TradeLine call — ${data.callerName}`,
    eyebrow: "New Call",
    eyebrowColor: "#66E8FA",
    headline: `New call from ${escapeHtml(data.callerName)}`,
    intro: `Your TradeLine answered a call and captured the following lead details.`,
    bodyHtml,
    cta: { label: "View in Portal", url: `${data.portalUrl}/portal` },
    supportNote: `This is an automated notification from your TradeLine AI phone assistant.`,
  });
}

/**
 * Send a TradeLine call notification email. Never throws.
 */
export async function sendTradeLineCallNotificationEmail(
  recipientEmail: string,
  data: TradeLineCallEmailData,
): Promise<boolean> {
  try {
    if (!recipientEmail) {
      log.warn("No recipient email — skipping TradeLine call notification");
      return false;
    }

    const subject = `New TradeLine call — ${data.callerName}`;
    const html = buildCallNotificationHtml(recipientEmail, data);
    const text = buildPlainText({
      headline: `New call from ${data.callerName}`,
      intro: "Your TradeLine answered a call and captured the following lead details.",
      bodyText: [
        `Caller: ${data.callerName}`,
        `Phone: ${data.callerPhone}`,
        data.callerAddress ? `Address: ${data.callerAddress}` : "",
        `Job type: ${data.jobType}`,
        `Urgency: ${data.urgency}`,
        data.jobDescription ? `Description: ${data.jobDescription}` : "",
        data.preferredDate ? `Preferred date: ${data.preferredDate}` : "",
        "",
        `Summary: ${data.callSummary}`,
        data.recordingUrl ? `Recording: ${data.recordingUrl}` : "",
      ].filter(Boolean).join("\n"),
      ctaLabel: "View in Portal",
      ctaUrl: `${data.portalUrl}/portal`,
    });

    await queueEmail(recipientEmail, subject, html, text, {
      source: "tradeline_call_notification",
      entity_type: "tradeline_call_log",
      entity_id: data.callLogId,
    });

    return true;
  } catch (err: any) {
    log.error(`TradeLine call notification email failed for ${recipientEmail}: ${err.message}`);
    return false;
  }
}
