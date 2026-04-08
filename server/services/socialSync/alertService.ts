/**
 * SocialSync lightweight internal alerting.
 *
 * Sends operator alerts via email (reusing existing SMTP transport)
 * and/or webhook for critical SocialSync events.
 *
 * Required env vars:
 *   SOCIALSYNC_ALERT_EMAIL — recipient email for operator alerts
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS — SMTP config (existing)
 *   SOCIALSYNC_ALERT_WEBHOOK — (optional) webhook URL for alerts
 */
import nodemailer from "nodemailer";
import { storage } from "../../storage";
import { markAlerted } from "./cooldownManager";

/* ─── Config ─── */

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

function getAlertEmail(): string | null {
  return process.env.SOCIALSYNC_ALERT_EMAIL || null;
}

function getAlertWebhook(): string | null {
  return process.env.SOCIALSYNC_ALERT_WEBHOOK || null;
}

export function isAlertingConfigured(): boolean {
  return !!(getAlertEmail() || getAlertWebhook());
}

/* ─── Types ─── */

export interface AlertPayload {
  type: "token_expired" | "publish_failures" | "no_recent_publishes" | "media_failures" | "rate_limited";
  client_id: number;
  business_name: string | null;
  platform: string;
  summary: string;
  details: Record<string, any>;
  admin_url: string;
}

/* ─── Send ─── */

/**
 * Send an operator alert via configured channels.
 * Automatically marks the client/platform as alerted to prevent spam.
 */
export async function sendAlert(alert: AlertPayload): Promise<{ sent: boolean; channels: string[] }> {
  const channels: string[] = [];

  // Email
  const alertEmail = getAlertEmail();
  const mailer = getTransporter();
  if (alertEmail && mailer) {
    try {
      const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@wefixtrades.com";
      await mailer.sendMail({
        from,
        to: alertEmail,
        subject: `[SocialSync] ${alert.type.replace(/_/g, " ")} — ${alert.business_name || `Client #${alert.client_id}`}`,
        html: buildEmailHtml(alert),
      });
      channels.push("email");
    } catch (err: any) {
      console.error("[socialsync-alert] Email send failed:", err.message);
    }
  }

  // Webhook
  const webhookUrl = getAlertWebhook();
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alert),
        signal: AbortSignal.timeout(10000),
      });
      channels.push("webhook");
    } catch (err: any) {
      console.error("[socialsync-alert] Webhook send failed:", err.message);
    }
  }

  // Mark alerted to prevent spam
  if (channels.length > 0) {
    await markAlerted(alert.client_id, alert.platform);
  }

  // Log
  await storage.createSocialSyncLog({
    client_id: alert.client_id,
    entity_type: "profile",
    entity_id: null as any,
    action: `alert.${alert.type}`,
    status: channels.length > 0 ? "success" : "failure",
    details: { channels, summary: alert.summary },
  });

  return { sent: channels.length > 0, channels };
}

/* ─── Alert Builders ─── */

function buildAdminUrl(clientId: number): string {
  const base = process.env.APP_PUBLIC_URL || "http://localhost:5000";
  return `${base}/admin/crm/clients/${clientId}?tab=socialsync`;
}

export function buildTokenExpiredAlert(clientId: number, businessName: string | null, platform: string): AlertPayload {
  return {
    type: "token_expired",
    client_id: clientId,
    business_name: businessName,
    platform,
    summary: `${platform} token has expired for ${businessName || `Client #${clientId}`}. Reconnection required.`,
    details: { platform },
    admin_url: buildAdminUrl(clientId),
  };
}

export function buildPublishFailuresAlert(
  clientId: number, businessName: string | null, platform: string, consecutiveFailures: number,
): AlertPayload {
  return {
    type: "publish_failures",
    client_id: clientId,
    business_name: businessName,
    platform,
    summary: `${consecutiveFailures} consecutive publish failures on ${platform} for ${businessName || `Client #${clientId}`}.`,
    details: { consecutive_failures: consecutiveFailures, platform },
    admin_url: buildAdminUrl(clientId),
  };
}

export function buildNoRecentPublishesAlert(clientId: number, businessName: string | null): AlertPayload {
  return {
    type: "no_recent_publishes",
    client_id: clientId,
    business_name: businessName,
    platform: "all",
    summary: `Autopilot is enabled but no successful publishes in 7+ days for ${businessName || `Client #${clientId}`}.`,
    details: {},
    admin_url: buildAdminUrl(clientId),
  };
}

export function buildRateLimitedAlert(clientId: number, businessName: string | null, platform: string): AlertPayload {
  return {
    type: "rate_limited",
    client_id: clientId,
    business_name: businessName,
    platform,
    summary: `Repeated rate limiting on ${platform} for ${businessName || `Client #${clientId}`}. Client is in cooldown.`,
    details: { platform },
    admin_url: buildAdminUrl(clientId),
  };
}

/* ─── Email Template ─── */

function buildEmailHtml(alert: AlertPayload): string {
  return `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:20px 24px;background:#2D6A4F;">
    <h1 style="color:#fff;font-size:16px;margin:0;">SocialSync Alert</h1>
    <p style="color:#d1e8d5;font-size:12px;margin:4px 0 0;">${alert.type.replace(/_/g, " ").toUpperCase()}</p>
  </td></tr>
  <tr><td style="padding:20px 24px;">
    <p style="font-size:14px;color:#333;margin:0 0 12px;">${alert.summary}</p>
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="padding:4px 0;font-size:13px;color:#666;">Client</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${alert.business_name || `#${alert.client_id}`}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#666;">Platform</td><td style="padding:4px 0;font-size:13px;">${alert.platform}</td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 24px 20px;text-align:center;">
    <a href="${alert.admin_url}" style="display:inline-block;background:#2D6A4F;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">View in Admin</a>
  </td></tr>
  <tr><td style="padding:10px 24px;background:#f9fafb;text-align:center;">
    <p style="font-size:10px;color:#9ca3af;margin:0;">SocialSync — WeFixTrades Internal Alert</p>
  </td></tr>
</table>
</body></html>`;
}
