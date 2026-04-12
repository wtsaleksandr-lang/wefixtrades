/**
 * MapGuard Alert Service
 *
 * Evaluates scan results for alert-worthy conditions, deduplicates
 * against recent alerts, sends internal email notifications, and
 * logs alerts for ops visibility.
 */

import { db } from "../db";
import { mapguardAlerts, type InsertMapguardAlert, type MapguardAlert } from "@shared/schemas/mapguardMonitoring";
import { mapguardTasks } from "@shared/schemas/mapguard";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import type { SnapshotChanges } from "./mapguardMonitor";
import type { InsertMapguardSnapshot } from "@shared/schemas/mapguardMonitoring";

/* ═══════════════════════════════════════════
   ALERT CONFIGURATION
   ═══════════════════════════════════════════ */

const COST_ALERT_THRESHOLD_CENTS = 10000; // $100/month — alert if supplier costs exceed this

const ALERT_RECIPIENT = process.env.MAPGUARD_ALERT_EMAIL || process.env.SMTP_USER || "";
const DEDUP_WINDOW_DAYS = 6; // Don't re-alert same type for same client within this window
const APP_URL = process.env.VAPI_SERVER_URL || process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : "https://wefixtrades.co.uk";

/* ═══════════════════════════════════════════
   ALERT TRIGGER EVALUATION
   ═══════════════════════════════════════════ */

interface AlertCandidate {
  alert_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  summary: string;
  metric_data: Record<string, any>;
}

export function evaluateAlertTriggers(
  changes: SnapshotChanges,
  snapshot: Partial<InsertMapguardSnapshot>,
  businessName: string,
): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];

  // 1. Score drop > 15 points → critical
  if (changes.score_delta !== null && changes.score_delta < -15) {
    alerts.push({
      alert_type: "score_drop",
      severity: "critical",
      title: `Score dropped ${Math.abs(changes.score_delta)} pts for ${businessName}`,
      summary: `Visibility score fell from ${(snapshot.score_total ?? 0) - changes.score_delta} to ${snapshot.score_total}. Urgent review needed.`,
      metric_data: { score_delta: changes.score_delta, current_score: snapshot.score_total },
    });
  }
  // Score drop > 8 points → warning
  else if (changes.score_delta !== null && changes.score_delta < -8) {
    alerts.push({
      alert_type: "score_drop",
      severity: "warning",
      title: `Score dropped ${Math.abs(changes.score_delta)} pts for ${businessName}`,
      summary: `Visibility score fell from ${(snapshot.score_total ?? 0) - changes.score_delta} to ${snapshot.score_total}.`,
      metric_data: { score_delta: changes.score_delta, current_score: snapshot.score_total },
    });
  }

  // 2. Rating drop > 0.3 → critical; > 0.2 → warning
  if (changes.rating_delta !== null && changes.rating_delta < -0.3) {
    const prev = ((snapshot.rating ?? 0) - changes.rating_delta).toFixed(1);
    alerts.push({
      alert_type: "rating_drop",
      severity: "critical",
      title: `Rating dropped from ${prev} to ${snapshot.rating?.toFixed(1)} for ${businessName}`,
      summary: `Google rating declined significantly. Check for negative reviews.`,
      metric_data: { rating_delta: changes.rating_delta, current_rating: snapshot.rating },
    });
  } else if (changes.rating_delta !== null && changes.rating_delta < -0.2) {
    const prev = ((snapshot.rating ?? 0) - changes.rating_delta).toFixed(1);
    alerts.push({
      alert_type: "rating_drop",
      severity: "warning",
      title: `Rating dropped from ${prev} to ${snapshot.rating?.toFixed(1)} for ${businessName}`,
      summary: `Google rating declined. Monitor for further drops.`,
      metric_data: { rating_delta: changes.rating_delta, current_rating: snapshot.rating },
    });
  }

  // 3. 2+ keyword rank drops → warning
  if (changes.rank_drops.length >= 2) {
    alerts.push({
      alert_type: "rank_drops",
      severity: changes.rank_drops.length >= 4 ? "critical" : "warning",
      title: `${changes.rank_drops.length} keywords lost ranking for ${businessName}`,
      summary: changes.rank_drops.map(r => `${r.keyword}: ${r.from}→${r.to}`).join(", "),
      metric_data: { rank_drops: changes.rank_drops, count: changes.rank_drops.length },
    });
  }

  // 4. Lost local pack visibility
  if (changes.local_pack_delta !== null && changes.local_pack_delta < -1) {
    alerts.push({
      alert_type: "local_pack_lost",
      severity: "warning",
      title: `Lost local pack position for ${businessName}`,
      summary: `Keywords in local pack dropped by ${Math.abs(changes.local_pack_delta)} (now ${snapshot.keywords_in_local_pack}).`,
      metric_data: { local_pack_delta: changes.local_pack_delta, current: snapshot.keywords_in_local_pack },
    });
  }

  // 5. New critical issues
  const criticalIssues = changes.new_issues.filter(i =>
    ["no-website", "no-gbp-description", "bad-rating"].includes(i)
  );
  if (criticalIssues.length > 0) {
    alerts.push({
      alert_type: "new_critical_issue",
      severity: "warning",
      title: `New issue${criticalIssues.length > 1 ? "s" : ""} detected for ${businessName}`,
      summary: `New: ${criticalIssues.join(", ")}. Profile may have been modified.`,
      metric_data: { new_issues: criticalIssues },
    });
  }

  return alerts;
}

/* ═══════════════════════════════════════════
   DEDUPLICATION
   ═══════════════════════════════════════════ */

async function isDuplicate(clientId: number, alertType: string): Promise<boolean> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DEDUP_WINDOW_DAYS);

  const [existing] = await db.select({ id: mapguardAlerts.id })
    .from(mapguardAlerts)
    .where(and(
      eq(mapguardAlerts.client_id, clientId),
      eq(mapguardAlerts.alert_type, alertType),
      gte(mapguardAlerts.created_at, cutoff),
    ))
    .limit(1);

  return !!existing;
}

/* ═══════════════════════════════════════════
   EMAIL TEMPLATE
   ═══════════════════════════════════════════ */

const SEVERITY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: "#EF4444", text: "#ffffff", label: "CRITICAL" },
  warning:  { bg: "#F59E0B", text: "#ffffff", label: "WARNING" },
  info:     { bg: "#3B82F6", text: "#ffffff", label: "INFO" },
};

function buildAlertEmail(alert: InsertMapguardAlert & { business_name: string }, clientId: number): { subject: string; html: string } {
  const sev = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.warning;
  const dashboardLink = `${APP_URL}/admin/crm/clients/${clientId}`;
  const metricData = alert.metric_data as Record<string, any> || {};

  // Build metric rows
  const metricRows: string[] = [];
  if (metricData.score_delta != null) metricRows.push(`<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Score Change</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:${metricData.score_delta < 0 ? '#EF4444' : '#22C55E'};">${metricData.score_delta > 0 ? '+' : ''}${metricData.score_delta} pts</td></tr>`);
  if (metricData.rating_delta != null) metricRows.push(`<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Rating Change</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:${metricData.rating_delta < 0 ? '#EF4444' : '#22C55E'};">${metricData.rating_delta > 0 ? '+' : ''}${metricData.rating_delta}</td></tr>`);
  if (metricData.current_score != null) metricRows.push(`<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Current Score</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${metricData.current_score}/100</td></tr>`);
  if (metricData.current_rating != null) metricRows.push(`<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Current Rating</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${Number(metricData.current_rating).toFixed(1)}</td></tr>`);
  if (metricData.count != null) metricRows.push(`<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Keywords Affected</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${metricData.count}</td></tr>`);

  const subject = `MapGuard ${sev.label}: ${alert.title}`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:20px 28px;background:${sev.bg};">
    <table width="100%"><tr>
      <td><p style="color:${sev.text};font-size:11px;font-weight:700;letter-spacing:0.05em;margin:0;opacity:0.9;">MAPGUARD ${sev.label}</p>
      <p style="color:${sev.text};font-size:16px;font-weight:600;margin:6px 0 0;">${escHtml(alert.title)}</p></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">${escHtml(alert.summary)}</p>
    ${metricRows.length > 0 ? `<table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e5e7eb;margin-bottom:16px;padding-top:12px;">${metricRows.join("")}</table>` : ""}
    <p style="font-size:12px;color:#9ca3af;margin:0 0 16px;">Client: <strong style="color:#374151;">${escHtml(alert.business_name)}</strong></p>
  </td></tr>
  <tr><td style="padding:0 28px 24px;text-align:center;">
    <a href="${dashboardLink}" style="display:inline-block;background:#2D6A4F;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Client</a>
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent by MapGuard Monitoring &middot; WeFixTrades</p>
  </td></tr>
</table>
</body></html>`;

  return { subject, html };
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ═══════════════════════════════════════════
   SEND ALERT
   ═══════════════════════════════════════════ */

async function sendAlertEmail(subject: string, html: string): Promise<boolean> {
  if (!ALERT_RECIPIENT) {
    console.log("[mapguard-alert] No ALERT_RECIPIENT configured, skipping email");
    return false;
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    console.log("[mapguard-alert] SMTP not configured, skipping email");
    return false;
  }

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to: ALERT_RECIPIENT,
      subject,
      html,
    });
    return true;
  } catch (err: any) {
    console.error("[mapguard-alert] Email send failed:", err.message);
    return false;
  }
}

/* ═══════════════════════════════════════════
   MAIN: PROCESS ALERTS FOR A SCAN
   ═══════════════════════════════════════════ */

export async function processMapguardAlerts(
  clientId: number,
  businessName: string,
  changes: SnapshotChanges,
  snapshot: Partial<InsertMapguardSnapshot>,
  snapshotId: number,
): Promise<{ sent: number; deduplicated: number }> {
  const candidates = evaluateAlertTriggers(changes, snapshot, businessName);

  if (candidates.length === 0) return { sent: 0, deduplicated: 0 };

  let sent = 0;
  let deduplicated = 0;

  for (const candidate of candidates) {
    // Check dedup
    const isDup = await isDuplicate(clientId, candidate.alert_type);
    if (isDup) {
      deduplicated++;
      continue;
    }

    // Store alert
    const alertData: InsertMapguardAlert = {
      client_id: clientId,
      alert_type: candidate.alert_type,
      severity: candidate.severity,
      title: candidate.title,
      summary: candidate.summary,
      metric_data: candidate.metric_data,
      snapshot_id: snapshotId,
      email_sent: false,
      dismissed: false,
    };

    const [alert] = await db.insert(mapguardAlerts).values(alertData).returning();

    // Send email
    const { subject, html } = buildAlertEmail(
      { ...alertData, business_name: businessName },
      clientId,
    );
    const emailSent = await sendAlertEmail(subject, html);

    if (emailSent) {
      await db.update(mapguardAlerts)
        .set({ email_sent: true })
        .where(eq(mapguardAlerts.id, alert.id));
    }

    sent++;
  }

  if (sent > 0) {
    console.log(`[mapguard-alert] ${businessName}: ${sent} alert(s) sent, ${deduplicated} deduplicated`);
  }

  return { sent, deduplicated };
}

/* ═══════════════════════════════════════════
   COST THRESHOLD ALERT
   ═══════════════════════════════════════════ */

export async function checkCostAlert(clientId: number, businessName: string): Promise<void> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [row] = await db.select({ total: sql<number>`coalesce(sum(${mapguardTasks.cost_cents}), 0)::int` })
    .from(mapguardTasks)
    .where(and(
      eq(mapguardTasks.client_id, clientId),
      sql`${mapguardTasks.cost_cents} > 0`,
      sql`(${mapguardTasks.updated_at} >= ${monthStart} OR ${mapguardTasks.completed_at} >= ${monthStart})`,
    ));

  const totalCost = row?.total || 0;
  if (totalCost < COST_ALERT_THRESHOLD_CENTS) return;

  // Dedup
  const isDup = await isDuplicate(clientId, "cost_threshold");
  if (isDup) return;

  const alertData: InsertMapguardAlert = {
    client_id: clientId,
    alert_type: "cost_threshold",
    severity: "warning",
    title: `Supplier costs exceeded $${(COST_ALERT_THRESHOLD_CENTS / 100).toFixed(0)} for ${businessName}`,
    summary: `Total supplier spend this month: $${(totalCost / 100).toFixed(2)}. Review task assignments and margins.`,
    metric_data: { total_cost_cents: totalCost, threshold_cents: COST_ALERT_THRESHOLD_CENTS },
    email_sent: false,
    dismissed: false,
  };

  const [alert] = await db.insert(mapguardAlerts).values(alertData).returning();

  const { subject, html } = buildAlertEmail({ ...alertData, business_name: businessName }, clientId);
  const emailSent = await sendAlertEmail(subject, html);
  if (emailSent) {
    await db.update(mapguardAlerts).set({ email_sent: true }).where(eq(mapguardAlerts.id, alert.id));
  }

  console.log(`[mapguard-alert] Cost threshold alert for ${businessName}: $${(totalCost / 100).toFixed(2)}`);
}

/* ═══════════════════════════════════════════
   ALERT QUERIES (for dashboard/ops)
   ═══════════════════════════════════════════ */

export async function getRecentAlerts(opts: {
  clientId?: number;
  limit?: number;
  severity?: string;
}): Promise<MapguardAlert[]> {
  const { clientId, limit = 20, severity } = opts;
  const conditions = [];
  if (clientId) conditions.push(eq(mapguardAlerts.client_id, clientId));
  if (severity) conditions.push(eq(mapguardAlerts.severity, severity));
  conditions.push(eq(mapguardAlerts.dismissed, false));

  return db.select().from(mapguardAlerts)
    .where(and(...conditions))
    .orderBy(desc(mapguardAlerts.created_at))
    .limit(limit);
}

export async function dismissAlert(alertId: number): Promise<void> {
  await db.update(mapguardAlerts)
    .set({ dismissed: true })
    .where(eq(mapguardAlerts.id, alertId));
}

export async function getAlertCountSince(days = 7): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const [row] = await db.select({ count: sql<number>`count(*)::int` })
    .from(mapguardAlerts)
    .where(gte(mapguardAlerts.created_at, cutoff));
  return row?.count || 0;
}
