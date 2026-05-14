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
import { buildAdminAlertEmail, buildAdminAlertPlainText, ADMIN_ALERT_FROM_NAME, type AlertTone } from "../lib/adminAlertShell";
import type { SnapshotChanges } from "./mapguardMonitor";
import type { InsertMapguardSnapshot } from "@shared/schemas/mapguardMonitoring";
import { createLogger } from "../lib/logger";

const log = createLogger("MapguardAlerts");

/* ═══════════════════════════════════════════
   ALERT CONFIGURATION
   ═══════════════════════════════════════════ */

const COST_ALERT_THRESHOLD_CENTS = 10000; // $100/month — alert if supplier costs exceed this

const ALERT_RECIPIENT = process.env.MAPGUARD_ALERT_EMAIL || process.env.SMTP_USER || "";
const DEDUP_WINDOW_DAYS = 6; // Don't re-alert same type for same client within this window
// Phase-2: previous ternary had operator-precedence bug
// (`A || B ? \`https://${B}\` : ...`) — if A was set but B unset, it
// produced "https://undefined". Use the same fallback chain reports use.
const APP_URL = process.env.APP_URL
  || process.env.APP_PUBLIC_URL
  || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");

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

function buildAlertEmail(alert: InsertMapguardAlert & { business_name: string }, clientId: number): { subject: string; html: string; text: string } {
  const severity = (alert.severity ?? "warning") as AlertTone;
  const sevLabel = severity.charAt(0).toUpperCase() + severity.slice(1);
  const dashboardLink = `${APP_URL}/admin/crm/clients/${clientId}`;
  const metricData = (alert.metric_data as Record<string, any>) || {};

  const detailRows: Array<{ label: string; value: string; valueColor?: string }> = [
    { label: "Client", value: alert.business_name },
  ];
  if (metricData.score_delta != null) {
    const positive = metricData.score_delta >= 0;
    detailRows.push({
      label: "Score change",
      value: `${positive ? "+" : ""}${metricData.score_delta} pts`,
      valueColor: positive ? "#15803D" : "#B91C1C",
    });
  }
  if (metricData.rating_delta != null) {
    const positive = metricData.rating_delta >= 0;
    detailRows.push({
      label: "Rating change",
      value: `${positive ? "+" : ""}${metricData.rating_delta}`,
      valueColor: positive ? "#15803D" : "#B91C1C",
    });
  }
  if (metricData.current_score != null) detailRows.push({ label: "Current score", value: `${metricData.current_score}/100` });
  if (metricData.current_rating != null) detailRows.push({ label: "Current rating", value: Number(metricData.current_rating).toFixed(1) });
  if (metricData.count != null) detailRows.push({ label: "Keywords affected", value: String(metricData.count) });

  const subject = `MapGuard ${sevLabel}: ${alert.title}`;

  const html = buildAdminAlertEmail({
    subjectForTitle: subject,
    alertType: `MapGuard ${sevLabel}`,
    alertTone: severity,
    headline: alert.title,
    summary: alert.summary,
    detailRows,
    cta: { label: "View client", url: dashboardLink },
    footerNote: "MapGuard monitoring · WeFixTrades",
  });

  const text = buildAdminAlertPlainText({
    alertType: `MapGuard ${sevLabel}`,
    headline: alert.title,
    summary: alert.summary,
    detailRows: detailRows.map(({ label, value }) => ({ label, value })),
    cta: { label: "View client", url: dashboardLink },
    footerNote: "MapGuard monitoring · WeFixTrades",
  });

  return { subject, html, text };
}

/* ═══════════════════════════════════════════
   SEND ALERT
   ═══════════════════════════════════════════ */

async function sendAlertEmail(subject: string, html: string, text: string): Promise<boolean> {
  if (!ALERT_RECIPIENT) {
    log.info("[mapguard-alert] No ALERT_RECIPIENT configured, skipping email");
    return false;
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    log.info("[mapguard-alert] SMTP not configured, skipping email");
    return false;
  }

  try {
    await transporter.sendMail({
      from: `${ADMIN_ALERT_FROM_NAME} <${getFromAddress()}>`,
      to: ALERT_RECIPIENT,
      subject,
      html,
      text,
    });
    return true;
  } catch (err: any) {
    log.error("[mapguard-alert] Email send failed:", err.message);
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
    const { subject, html, text } = buildAlertEmail(
      { ...alertData, business_name: businessName },
      clientId,
    );
    const emailSent = await sendAlertEmail(subject, html, text);

    if (emailSent) {
      await db.update(mapguardAlerts)
        .set({ email_sent: true })
        .where(eq(mapguardAlerts.id, alert.id));
    }

    // Customer-facing reassurance email — only on critical severity,
    // and only for score/rating drops (lost rankings are too noisy for
    // a direct customer email). Positive framing: "we noticed and
    // we're already on it" rather than alarming technical details.
    if (
      candidate.severity === "critical" &&
      (candidate.alert_type === "score_drop" || candidate.alert_type === "rating_drop")
    ) {
      try {
        await sendCustomerReassuranceEmail(clientId, businessName, candidate);
      } catch (err: any) {
        log.warn("[mapguard-alert] customer reassurance email failed", {
          client_id: clientId,
          error: err.message,
        });
      }
    }

    sent++;
  }

  if (sent > 0) {
    log.info(`[mapguard-alert] ${businessName}: ${sent} alert(s) sent, ${deduplicated} deduplicated`);
  }

  return { sent, deduplicated };
}

/* ═══════════════════════════════════════════
   CUSTOMER-FACING REASSURANCE EMAIL
   ═══════════════════════════════════════════ */

async function sendCustomerReassuranceEmail(
  clientId: number,
  businessName: string,
  candidate: AlertCandidate,
): Promise<void> {
  // Pull customer contact email lazily to avoid coupling the trigger
  // evaluator to the clients table. Skip silently if no email or the
  // customer has weekly_summary disabled (we treat that toggle as a
  // proxy for "leave me alone unless it's truly critical" — and this
  // IS truly critical, but we still want a single mute).
  const { clients } = await import("@shared/schemas/adminCrm");
  const [client] = await db
    .select({
      contact_email: clients.contact_email,
      metadata: clients.metadata,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client?.contact_email) return;

  // Respect the same alerts.weekly_summary toggle the portal exposes —
  // if the customer turned that off, hold these too. The portal copy
  // describes it broadly enough to cover this case.
  const meta = (client.metadata as Record<string, any> | null) || {};
  const mgConfig = meta?.mapguard_config as Record<string, any> | undefined;
  if (mgConfig?.alerts?.weekly_summary === false) return;

  const transporter = getEmailTransporter();
  if (!transporter) return;

  const portalUrl = `${APP_URL}/portal/mapguard`;
  const dropLabel =
    candidate.alert_type === "score_drop"
      ? `your visibility score dipped`
      : `your Google rating dipped`;

  const subject = `MapGuard noticed a dip for ${businessName} — we're on it`;

  const text = [
    `Hi,`,
    ``,
    `Quick heads-up: ${dropLabel} on Google over the last week.`,
    ``,
    `What this means: short-term changes like this happen for lots of`,
    `reasons — a fresh competitor review, a temporary Google index`,
    `shuffle, a holiday traffic dip. They don't always indicate a`,
    `problem with your business.`,
    ``,
    `What we're doing: our team is already reviewing the change. If`,
    `there's something to fix on your profile — outdated info, missing`,
    `photos, a review needing a reply — we'll handle it as part of your`,
    `MapGuard plan and you'll see it in your next weekly recap.`,
    ``,
    `No action needed from you. We just wanted you to hear it from us`,
    `before you stumbled across it yourself.`,
    ``,
    `See your dashboard:`,
    `  ${portalUrl}`,
    ``,
    `— The WeFixTrades MapGuard team`,
    ``,
    `(You can adjust alert preferences any time in your MapGuard`,
    ` settings, or reply to mute these emails.)`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px; line-height: 1.5;">
  <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
    <div style="width: 36px; height: 36px; background: #2D6A4F; border-radius: 8px;"></div>
    <div>
      <h2 style="margin: 0; color: #2D6A4F; font-size: 18px;">MapGuard</h2>
      <p style="margin: 0; font-size: 12px; color: #6b7280;">A heads-up about ${escapeHtml(businessName)}</p>
    </div>
  </div>

  <p>Hi,</p>

  <p>Quick heads-up: <strong>${dropLabel}</strong> on Google over the last week.</p>

  <p style="background: #f0fdf4; border-left: 3px solid #2D6A4F; padding: 12px 14px; margin: 16px 0; border-radius: 0 6px 6px 0;">
    <strong style="color: #2D6A4F;">What we're doing:</strong> our team is already reviewing the change.
    If there's something to fix on your profile — outdated info, missing photos, a review needing a reply —
    we'll handle it as part of your MapGuard plan and you'll see it in your next weekly recap.
  </p>

  <p style="color: #6b7280; font-size: 14px;">
    Short-term changes like this happen for lots of reasons — a fresh competitor review, a temporary Google
    index shuffle, a holiday traffic dip. They don't always indicate a problem with your business.
    <strong style="color: #1f2937;">No action needed from you.</strong> We just wanted you to hear it from
    us before you stumbled across it yourself.
  </p>

  <p style="margin: 24px 0;">
    <a href="${escapeAttr(portalUrl)}" style="display: inline-block; background: #2D6A4F; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: 500;">
      Open your dashboard →
    </a>
  </p>

  <p style="margin-top: 32px; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 12px;">
    You can adjust alert preferences any time in your MapGuard settings, or reply to this email to mute
    these reassurance notes. Your monthly performance report is unaffected.
  </p>
</body></html>`;

  await transporter.sendMail({
    from: `WeFixTrades MapGuard <${getFromAddress()}>`,
    to: client.contact_email,
    subject,
    text,
    html,
  });

  log.info("[mapguard-alert] customer reassurance email sent", {
    client_id: clientId,
    alert_type: candidate.alert_type,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
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

  const { subject, html, text } = buildAlertEmail({ ...alertData, business_name: businessName }, clientId);
  const emailSent = await sendAlertEmail(subject, html, text);
  if (emailSent) {
    await db.update(mapguardAlerts).set({ email_sent: true }).where(eq(mapguardAlerts.id, alert.id));
  }

  log.info(`[mapguard-alert] Cost threshold alert for ${businessName}: $${(totalCost / 100).toFixed(2)}`);
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
