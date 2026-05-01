/**
 * Alert Service -- centralized alert system for critical platform issues.
 *
 * fireAlert() inserts into the systemAlerts table, sends an email to the
 * admin, and optionally POSTs to a Slack webhook. Deduplication prevents
 * the same (category + title) alert from firing more than once per hour.
 */

import { storage } from "../storage";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { createLogger } from "../lib/logger";

const log = createLogger("AlertService");

const DEDUPE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface AlertInput {
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire a system alert -- insert into DB, email admin, optional Slack.
 * Dedupes same (category + title) within 1 hour.
 * Never throws -- catches all errors and logs.
 */
export async function fireAlert(alert: AlertInput): Promise<void> {
  try {
    const recent = await storage.findRecentAlert(alert.category, alert.title, DEDUPE_WINDOW_MS);
    if (recent) {
      log.debug(`Alert deduped: ${alert.category} / ${alert.title}`);
      return;
    }

    const row = await storage.createSystemAlert({
      severity: alert.severity,
      category: alert.category,
      title: alert.title,
      details: alert.details ?? null,
      metadata: alert.metadata ?? null,
    });

    log.info(`Alert #${row.id} fired: [${alert.severity}] ${alert.category} -- ${alert.title}`);

    // Send email to admin
    try {
      const transporter = getEmailTransporter();
      if (transporter) {
        const recipientEmail = process.env.ADMIN_EMAIL || process.env.SMTP_FROM;
        if (recipientEmail) {
          const severityColor = alert.severity === "critical" ? "#EF4444" : alert.severity === "warning" ? "#F59E0B" : "#3B82F6";
          await transporter.sendMail({
            from: `WeFixTrades Alerts <${getFromAddress()}>`,
            to: recipientEmail,
            subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;"><div style="background:${severityColor};color:white;padding:12px 16px;border-radius:8px 8px 0 0;"><strong>[${alert.severity.toUpperCase()}]</strong> ${escapeHtml(alert.category)}</div><div style="border:1px solid #e5e7eb;border-top:none;padding:16px;border-radius:0 0 8px 8px;"><h3 style="margin:0 0 8px;">${escapeHtml(alert.title)}</h3>${alert.details ? `<p style="color:#6b7280;margin:0 0 12px;white-space:pre-wrap;">${escapeHtml(alert.details)}</p>` : ""}<p style="font-size:12px;color:#9ca3af;margin:0;">Fired at ${new Date().toISOString()}</p></div></div>`,
            text: `[${alert.severity.toUpperCase()}] ${alert.title}\nCategory: ${alert.category}\n${alert.details ? `Details: ${alert.details}\n` : ""}Fired at: ${new Date().toISOString()}`,
          });
        }
      }
    } catch (emailErr: any) {
      log.error("sendAlertEmail failed (non-fatal)", { error: emailErr.message });
    }

    // Slack webhook (if configured)
    try {
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (webhookUrl) {
        const severityEmoji = alert.severity === "critical" ? ":rotating_light:" : alert.severity === "warning" ? ":warning:" : ":information_source:";
        const text = `${severityEmoji} *[${alert.severity.toUpperCase()}]* ${alert.title}\n_Category:_ ${alert.category}${alert.details ? `\n${alert.details}` : ""}`;
        await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      }
    } catch (slackErr: any) {
      log.error("sendSlackAlert failed (non-fatal)", { error: slackErr.message });
    }
  } catch (err: any) {
    log.error("fireAlert failed (non-fatal)", { error: err.message, category: alert.category, title: alert.title });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
