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
import { storage } from "../../storage";
import { markAlerted } from "./cooldownManager";
import { getEmailTransporter, getFromAddress } from "../../lib/emailTransport";
import { buildAdminAlertEmail, buildAdminAlertPlainText, ADMIN_ALERT_FROM_NAME, type AlertTone } from "../../lib/adminAlertShell";

/* ─── Config ─── */

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
  type: "token_expired" | "publish_failures" | "no_recent_publishes" | "media_failures" | "rate_limited" | "negative_review" | "escalated_review";
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
  const mailer = getEmailTransporter();
  if (alertEmail && mailer) {
    try {
      const subject = `[SocialSync] ${alert.type.replace(/_/g, " ")} — ${alert.business_name || `Client #${alert.client_id}`}`;
      const html = buildEmailHtml(alert);
      const text = buildEmailPlainText(alert);
      await mailer.sendMail({
        from: `${ADMIN_ALERT_FROM_NAME} <${getFromAddress()}>`,
        to: alertEmail,
        subject,
        html,
        text,
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

export function buildNegativeReviewAlert(
  clientId: number, businessName: string | null, platform: string,
  rating: number, reviewerName: string | null, snippet: string,
): AlertPayload {
  return {
    type: "negative_review",
    client_id: clientId,
    business_name: businessName,
    platform,
    summary: `${rating}-star review from ${reviewerName || "anonymous"} on ${platform} for ${businessName || `Client #${clientId}`}.`,
    details: { rating, reviewer: reviewerName, snippet: snippet.slice(0, 200) },
    admin_url: buildAdminUrl(clientId),
  };
}

export function buildEscalatedReviewAlert(
  clientId: number, businessName: string | null, platform: string,
  rating: number, reviewerName: string | null, snippet: string,
): AlertPayload {
  return {
    type: "escalated_review",
    client_id: clientId,
    business_name: businessName,
    platform,
    summary: `ESCALATED ${rating}-star review from ${reviewerName || "anonymous"} on ${platform} for ${businessName || `Client #${clientId}`}. Contains risk keywords.`,
    details: { rating, reviewer: reviewerName, snippet: snippet.slice(0, 200), escalated: true },
    admin_url: buildAdminUrl(clientId),
  };
}

/* ─── Email Template ─── */

/** Map alert type to severity tone. */
function alertTone(type: AlertPayload["type"]): AlertTone {
  if (type === "token_expired" || type === "publish_failures" || type === "escalated_review") return "critical";
  if (type === "negative_review") return "warning";
  if (type === "rate_limited" || type === "media_failures") return "warning";
  return "info";
}

function buildEmailHtml(alert: AlertPayload): string {
  const prettyType = alert.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return buildAdminAlertEmail({
    subjectForTitle: `[SocialSync] ${prettyType}`,
    alertType: `SocialSync · ${prettyType}`,
    alertTone: alertTone(alert.type),
    headline: alert.summary,
    detailRows: [
      { label: "Client", value: alert.business_name || `#${alert.client_id}` },
      { label: "Platform", value: alert.platform },
    ],
    cta: { label: "View in admin", url: alert.admin_url },
    footerNote: "SocialSync internal alert",
  });
}

function buildEmailPlainText(alert: AlertPayload): string {
  const prettyType = alert.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return buildAdminAlertPlainText({
    alertType: `SocialSync · ${prettyType}`,
    headline: alert.summary,
    detailRows: [
      { label: "Client", value: alert.business_name || `#${alert.client_id}` },
      { label: "Platform", value: alert.platform },
    ],
    cta: { label: "View in admin", url: alert.admin_url },
    footerNote: "SocialSync internal alert",
  });
}
