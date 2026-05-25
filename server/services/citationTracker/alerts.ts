/**
 * Citation Tracker — alert dispatch.
 *
 * Sends an email to the customer when a new alert row is created.
 * Uses the existing emailOrchestrator (PR #788) so volume rides on
 * free-tier providers (Resend/Brevo/SES) before SendGrid.
 *
 * The DB alert row is the source of truth — the email is best-effort.
 * Failure to send does NOT prevent the alert from appearing on the
 * dashboard.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db";
import {
  citationTrackerAlerts,
  citationTrackerSubscriptions,
  type CitationTrackerAlert,
} from "@shared/schema";
import { users } from "@shared/schemas/db";
import { sendEmailViaOrchestrator } from "../../lib/emailOrchestrator";
import { createLogger } from "../../lib/logger";

const log = createLogger("citation-tracker:alerts");

const FROM_ADDRESS = process.env.CITATION_TRACKER_FROM_EMAIL || "alerts@wefixtrades.com";
const APP_URL = process.env.APP_URL || "https://wefixtrades.com";

/* ─── Public helpers ──────────────────────────────────────────────── */

export async function dispatchAlertEmail(alertId: string): Promise<void> {
  const [alert] = await db
    .select()
    .from(citationTrackerAlerts)
    .where(eq(citationTrackerAlerts.id, alertId))
    .limit(1);

  if (!alert) {
    log.warn("alert not found", { alert_id: alertId });
    return;
  }

  // Resolve the customer email via the subscription -> users join.
  const [sub] = await db
    .select()
    .from(citationTrackerSubscriptions)
    .where(eq(citationTrackerSubscriptions.id, alert.subscription_id))
    .limit(1);

  if (!sub) {
    log.warn("subscription not found for alert", { alert_id: alertId });
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, sub.customer_id))
    .limit(1);

  if (!user?.email) {
    log.warn("user email missing — skipping email dispatch", {
      alert_id: alertId,
      customer_id: sub.customer_id,
    });
    return;
  }

  const { subject, text, html } = renderAlertEmail(alert, sub.business_name);

  try {
    await sendEmailViaOrchestrator({
      to: user.email,
      from: FROM_ADDRESS,
      subject,
      text,
      html,
      category: "transactional",
    });
  } catch (err: any) {
    log.warn("email dispatch failed", { alert_id: alertId, error: err?.message });
  }
}

/* ─── Templates ────────────────────────────────────────────────────── */

function renderAlertEmail(alert: CitationTrackerAlert, businessName: string): {
  subject: string;
  text: string;
  html: string;
} {
  const title = titleFor(alert);
  const dashboardUrl = `${APP_URL}/portal/citation-tracker`;

  const subject = `Citation Tracker alert — ${title} (${businessName})`;
  const lines = [
    `Hi,`,
    ``,
    `We detected a change to one of your citations for ${businessName}.`,
    ``,
    `Alert: ${title}`,
    `Severity: ${alert.severity}`,
    ``,
    `Review the full diff and dismiss or act on this alert from your dashboard:`,
    dashboardUrl,
    ``,
    `— WeFixTrades Citation Tracker`,
  ];
  const text = lines.join("\n");
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: rgb(34, 40, 42);">
      <h2 style="margin: 0 0 12px; font-size: 20px;">Citation Tracker alert</h2>
      <p style="margin: 0 0 16px; font-size: 15px;">We detected a change to one of your citations for <strong>${escapeHtml(businessName)}</strong>.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 20px; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: rgb(110, 119, 122);">Alert</td><td style="padding: 6px 0; text-align: right;"><strong>${escapeHtml(title)}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: rgb(110, 119, 122);">Severity</td><td style="padding: 6px 0; text-align: right;"><strong>${escapeHtml(alert.severity)}</strong></td></tr>
      </table>
      <p style="margin: 0 0 20px;">
        <a href="${dashboardUrl}" style="display: inline-block; background: rgb(46, 114, 196); color: rgb(255, 255, 255); text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">Review on dashboard</a>
      </p>
      <p style="margin: 0; font-size: 12px; color: rgb(110, 119, 122);">— WeFixTrades Citation Tracker</p>
    </div>
  `;
  return { subject, text, html };
}

function titleFor(alert: CitationTrackerAlert): string {
  switch (alert.alert_type) {
    case "nap_change": return "NAP change detected";
    case "new_listing": return "New citation discovered";
    case "removed_listing": return "Citation removed";
    case "inconsistency": return "NAP inconsistency detected";
    default: return "Citation update";
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] as string));
}
