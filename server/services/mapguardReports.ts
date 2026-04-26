/**
 * MapGuard Monthly Report Engine
 *
 * Compiles monthly metrics from snapshots and tasks into a client-safe
 * report, generates HTML email, and stores report data for web viewing.
 */

import { db } from "../db";
import { mapguardSnapshots } from "@shared/schemas/mapguardMonitoring";
import { mapguardTasks } from "@shared/schemas/mapguard";
import { clients, clientServices, serviceCatalog } from "@shared/schemas/adminCrm";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { buildLegalFooter } from "../lib/emailFooter";

/* ═══════════════════════════════════════════
   TASK TYPE → CLIENT LANGUAGE
   ═══════════════════════════════════════════ */

const TASK_TYPE_CLIENT_PAST: Record<string, string> = {
  baseline_audit_review: "Reviewed your visibility data and created an improvement plan",
  gbp_optimization: "Optimized your Google Business profile",
  citation_cleanup: "Improved your online listings consistency",
  review_issue_response: "Addressed customer review issues",
  competitor_reaction: "Responded to competitor changes in your area",
  profile_content_update: "Updated your profile content for better performance",
  photo_upload: "Refreshed your business photos",
  post_scheduling: "Created and scheduled posts for your profile",
  suspension_support: "Resolved a profile issue with Google",
  monthly_report_review: "Reviewed your monthly performance data",
  manual_followup: "Followed up on an improvement action",
};

const TASK_TYPE_CLIENT_ACTIVE: Record<string, string> = {
  baseline_audit_review: "Reviewing your visibility data and planning improvements",
  gbp_optimization: "Optimizing your Google Business profile",
  citation_cleanup: "Improving your online listings consistency",
  review_issue_response: "Handling and improving your customer reviews",
  competitor_reaction: "Monitoring competitors and adjusting your strategy",
  profile_content_update: "Updating your profile content",
  photo_upload: "Refreshing your business photos",
  post_scheduling: "Creating and scheduling profile posts",
  suspension_support: "Resolving a profile issue with Google",
  monthly_report_review: "Preparing your performance review",
  manual_followup: "Following up on an improvement action",
};

/* ═══════════════════════════════════════════
   REPORT DATA COMPILATION
   ═══════════════════════════════════════════ */

export interface MonthlyReportData {
  business_name: string;
  client_id: number;
  month_label: string;           // "March 2026"
  period_start: string;
  period_end: string;
  // Metrics
  score_start: number | null;
  score_end: number | null;
  score_delta: number | null;
  grade_end: string | null;
  rating_start: number | null;
  rating_end: number | null;
  rating_delta: number | null;
  reviews_start: number | null;
  reviews_end: number | null;
  reviews_gained: number | null;
  local_pack_end: number | null;
  top_10_end: number | null;
  scans_this_month: number;
  // Profile
  has_website: boolean;
  has_description: boolean;
  photo_count: number | null;
  // Activity (client-safe)
  completed_actions: string[];    // past tense
  active_work: string[];          // present tense
  total_completed: number;
  total_active: number;
  // Summary
  movement: "improving" | "stable" | "declining" | "new";
}

export async function compileMonthlyReport(clientId: number, year: number, month: number): Promise<MonthlyReportData | null> {
  // Period bounds
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59);
  const monthLabel = periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Get client info
  const [client] = await db.select({ business_name: clients.business_name })
    .from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;

  // Get snapshots in this month (chronological)
  const snapshots = await db.select()
    .from(mapguardSnapshots)
    .where(and(
      eq(mapguardSnapshots.client_id, clientId),
      gte(mapguardSnapshots.captured_at, periodStart),
      lte(mapguardSnapshots.captured_at, periodEnd),
    ))
    .orderBy(mapguardSnapshots.captured_at);

  // Also get the last snapshot before this month for start-of-month baseline
  const [preMonthSnap] = await db.select()
    .from(mapguardSnapshots)
    .where(and(
      eq(mapguardSnapshots.client_id, clientId),
      lte(mapguardSnapshots.captured_at, periodStart),
    ))
    .orderBy(desc(mapguardSnapshots.captured_at))
    .limit(1);

  const firstSnap = preMonthSnap || snapshots[0] || null;
  const lastSnap = snapshots[snapshots.length - 1] || firstSnap;

  // Completed tasks this month
  const completedTasks = await db.selectDistinct({ task_type: mapguardTasks.task_type })
    .from(mapguardTasks)
    .where(and(
      eq(mapguardTasks.client_id, clientId),
      eq(mapguardTasks.status, "completed"),
      gte(mapguardTasks.completed_at, periodStart),
      lte(mapguardTasks.completed_at, periodEnd),
    ))
    .limit(5);

  const [completedCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(mapguardTasks)
    .where(and(
      eq(mapguardTasks.client_id, clientId),
      eq(mapguardTasks.status, "completed"),
      gte(mapguardTasks.completed_at, periodStart),
      lte(mapguardTasks.completed_at, periodEnd),
    ));

  // Active tasks
  const activeTasks = await db.selectDistinct({ task_type: mapguardTasks.task_type })
    .from(mapguardTasks)
    .where(and(
      eq(mapguardTasks.client_id, clientId),
      sql`${mapguardTasks.status} NOT IN ('completed', 'cancelled')`,
    ))
    .limit(3);

  const [activeCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(mapguardTasks)
    .where(and(
      eq(mapguardTasks.client_id, clientId),
      sql`${mapguardTasks.status} NOT IN ('completed', 'cancelled')`,
    ));

  // Compute deltas
  const scoreStart = firstSnap?.score_total ?? null;
  const scoreEnd = lastSnap?.score_total ?? null;
  const scoreDelta = scoreStart != null && scoreEnd != null ? scoreEnd - scoreStart : null;

  const ratingStart = firstSnap?.rating ?? null;
  const ratingEnd = lastSnap?.rating ?? null;
  const ratingDelta = ratingStart != null && ratingEnd != null
    ? Math.round((ratingEnd - ratingStart) * 10) / 10
    : null;

  const reviewsStart = firstSnap?.review_count ?? null;
  const reviewsEnd = lastSnap?.review_count ?? null;
  const reviewsGained = reviewsStart != null && reviewsEnd != null ? reviewsEnd - reviewsStart : null;

  // Movement
  let movement: MonthlyReportData["movement"] = "new";
  if (scoreDelta !== null) {
    if (scoreDelta > 3) movement = "improving";
    else if (scoreDelta < -3) movement = "declining";
    else movement = "stable";
  }

  return {
    business_name: client.business_name,
    client_id: clientId,
    month_label: monthLabel,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    score_start: scoreStart,
    score_end: scoreEnd,
    score_delta: scoreDelta,
    grade_end: lastSnap?.score_grade ?? null,
    rating_start: ratingStart,
    rating_end: ratingEnd,
    rating_delta: ratingDelta,
    reviews_start: reviewsStart,
    reviews_end: reviewsEnd,
    reviews_gained: reviewsGained,
    local_pack_end: lastSnap?.keywords_in_local_pack ?? null,
    top_10_end: lastSnap?.keywords_in_top_10 ?? null,
    scans_this_month: snapshots.length,
    has_website: lastSnap?.has_website ?? false,
    has_description: lastSnap?.has_description ?? false,
    photo_count: lastSnap?.photo_count ?? null,
    completed_actions: completedTasks
      .map(t => TASK_TYPE_CLIENT_PAST[t.task_type])
      .filter(Boolean) as string[],
    active_work: activeTasks
      .map(t => TASK_TYPE_CLIENT_ACTIVE[t.task_type])
      .filter(Boolean) as string[],
    total_completed: completedCount?.count || 0,
    total_active: activeCount?.count || 0,
    movement,
  };
}

/* ═══════════════════════════════════════════
   EMAIL TEMPLATE
   ═══════════════════════════════════════════ */

const GRADE_COLORS: Record<string, string> = {
  A: "#22C55E", B: "#66E8FA", C: "#F59E0B", D: "#EF4444",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function deltaText(delta: number | null, suffix = ""): string {
  if (delta === null || delta === 0) return "No change";
  const sign = delta > 0 ? "+" : "";
  const color = delta > 0 ? "#22C55E" : "#EF4444";
  return `<span style="color:${color};font-weight:600;">${sign}${typeof delta === "number" && !Number.isInteger(delta) ? delta.toFixed(1) : delta}${suffix}</span>`;
}

export function buildMonthlyReportEmail(report: MonthlyReportData, portalUrl: string): { subject: string; html: string } {
  const grade = report.grade_end || "—";
  const gradeColor = GRADE_COLORS[grade] || "#8B919A";
  const movementLabel = { improving: "Improving", stable: "Stable", declining: "Needs attention", new: "Getting started" }[report.movement];
  const movementColor = { improving: "#22C55E", stable: "#66E8FA", declining: "#F59E0B", new: "#66E8FA" }[report.movement];

  // Activity bullets
  const activityHtml = report.completed_actions.length > 0
    ? report.completed_actions.map(a => `<li style="margin-bottom:4px;color:#CDD1D6;font-size:13px;">${esc(a)}</li>`).join("")
    : `<li style="color:#8B919A;font-size:13px;">We continued monitoring and improving your visibility</li>`;

  const activeHtml = report.active_work.length > 0
    ? `<p style="font-size:12px;color:#8B919A;margin:8px 0 0;">Currently working on: ${report.active_work.map(a => esc(a).toLowerCase()).join(", ")}</p>`
    : "";

  const subject = `MapGuard Report: ${report.month_label} — ${esc(report.business_name)}`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;">
<div style="background:#0B0F14;padding:40px 16px;">
<div style="max-width:600px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:24px;">
    <span style="display:inline-block;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:12px;font-weight:800;padding:5px 16px;border-radius:999px;letter-spacing:0.06em;">WeFixTrades · MapGuard</span>
  </div>

  <table cellpadding="0" cellspacing="0" width="100%" style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="padding:26px 28px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
    <p style="color:#66E8FA;font-size:11px;font-weight:700;letter-spacing:0.06em;margin:0;text-transform:uppercase;">MapGuard Monthly Report</p>
    <p style="color:#F0F0F0;font-size:20px;font-weight:700;margin:6px 0 0;">${esc(report.month_label)}</p>
    <p style="color:#8B919A;font-size:13px;margin:4px 0 0;">${esc(report.business_name)}</p>
  </td></tr>

  <!-- Score + Status -->
  <tr><td style="padding:24px 28px;">
    <table cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="vertical-align:top;">
        <p style="font-size:11px;color:#8B919A;margin:0;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Visibility Score</p>
        <p style="font-size:36px;font-weight:800;color:#F0F0F0;margin:6px 0 0;letter-spacing:-1px;">${report.score_end ?? "—"}<span style="font-size:14px;color:#555B63;font-weight:600;">/100</span></p>
        <p style="font-size:12px;margin:4px 0 0;">${deltaText(report.score_delta, " pts")}</p>
      </td>
      <td style="vertical-align:top;text-align:right;">
        <div style="display:inline-block;background:${gradeColor};color:#0B0F14;font-size:24px;font-weight:800;padding:12px 18px;border-radius:10px;">${grade}</div>
        <p style="font-size:11px;color:${movementColor};font-weight:700;margin:6px 0 0;text-align:right;text-transform:uppercase;letter-spacing:0.04em;">${movementLabel}</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- Key Metrics -->
  <tr><td style="padding:0 28px 20px;">
    <table cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
      <tr>
        <td style="padding:8px 0;width:50%;">
          <p style="font-size:11px;color:#8B919A;margin:0;text-transform:uppercase;letter-spacing:0.04em;">Rating</p>
          <p style="font-size:18px;font-weight:700;color:#F0F0F0;margin:4px 0 0;">${report.rating_end?.toFixed(1) ?? "—"} ${deltaText(report.rating_delta)}</p>
        </td>
        <td style="padding:8px 0;width:50%;">
          <p style="font-size:11px;color:#8B919A;margin:0;text-transform:uppercase;letter-spacing:0.04em;">Reviews</p>
          <p style="font-size:18px;font-weight:700;color:#F0F0F0;margin:4px 0 0;">${report.reviews_end ?? "—"} ${report.reviews_gained != null && report.reviews_gained > 0 ? `<span style="color:#22C55E;font-size:13px;">+${report.reviews_gained} this month</span>` : ""}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;width:50%;">
          <p style="font-size:11px;color:#8B919A;margin:0;text-transform:uppercase;letter-spacing:0.04em;">Map Pack</p>
          <p style="font-size:18px;font-weight:700;color:#F0F0F0;margin:4px 0 0;">${report.local_pack_end ?? "—"} <span style="font-size:12px;color:#8B919A;font-weight:500;">keywords</span></p>
        </td>
        <td style="padding:8px 0;width:50%;">
          <p style="font-size:11px;color:#8B919A;margin:0;text-transform:uppercase;letter-spacing:0.04em;">Scans</p>
          <p style="font-size:18px;font-weight:700;color:#F0F0F0;margin:4px 0 0;">${report.scans_this_month} <span style="font-size:12px;color:#8B919A;font-weight:500;">this month</span></p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- What We Did -->
  <tr><td style="padding:0 28px 20px;">
    <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px 18px;">
      <p style="font-size:13px;font-weight:700;color:#F0F0F0;margin:0 0 10px;">What we worked on</p>
      <ul style="margin:0;padding-left:18px;line-height:1.7;">
        ${activityHtml}
      </ul>
      ${activeHtml}
      ${report.total_completed > 0 ? `<p style="font-size:11px;color:#8B919A;margin:10px 0 0;">${report.total_completed} improvement${report.total_completed !== 1 ? "s" : ""} completed this month</p>` : ""}
    </div>
  </td></tr>

  <!-- Profile Status -->
  <tr><td style="padding:0 28px 20px;">
    <p style="font-size:13px;font-weight:700;color:#F0F0F0;margin:0 0 10px;">Profile status</p>
    <table cellpadding="0" cellspacing="0" width="100%">
      ${profileRow("Website linked", report.has_website)}
      ${profileRow("Business description", report.has_description)}
      ${profileRow("Photos uploaded", (report.photo_count ?? 0) > 0, report.photo_count != null ? `${report.photo_count} photos` : undefined)}
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:0 28px 28px;text-align:center;">
    <a href="${portalUrl}/portal/mapguard" style="display:inline-block;background:#66E8FA;color:#0B0F14;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">View Full Dashboard</a>
  </td></tr>

  </table>
  ${buildLegalFooter()}
</div>
</div>
</body></html>`;

  return { subject, html };
}

function profileRow(label: string, ok: boolean, detail?: string): string {
  const icon = ok
    ? `<span style="color:#22C55E;font-weight:700;">&#10003;</span>`
    : `<span style="color:#3D434A;">&#9675;</span>`;
  return `<tr><td style="padding:3px 0;font-size:13px;color:${ok ? "#CDD1D6" : "#555B63"};">${icon} ${esc(label)}${detail ? ` <span style="color:#8B919A;font-size:11px;">(${esc(detail)})</span>` : ""}</td></tr>`;
}

/* ═══════════════════════════════════════════
   SEND MONTHLY REPORT EMAIL
   ═══════════════════════════════════════════ */

export async function sendMonthlyReportEmail(
  clientId: number,
  recipientEmail: string,
  year: number,
  month: number,
): Promise<{ ok: boolean; error?: string }> {
  const report = await compileMonthlyReport(clientId, year, month);
  if (!report) return { ok: false, error: "Could not compile report data" };

  const transporter = getEmailTransporter();
  if (!transporter) return { ok: false, error: "SMTP not configured" };

  const portalUrl = process.env.VAPI_SERVER_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.co.uk");

  const { subject, html } = buildMonthlyReportEmail(report, portalUrl);

  try {
    await transporter.sendMail({
      from: `"MapGuard" <${getFromAddress()}>`,
      to: recipientEmail,
      subject,
      html,
    });
    return { ok: true };
  } catch (err: any) {
    console.error(`[mapguard-report] Email send failed for client ${clientId}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/* ═══════════════════════════════════════════
   BATCH: SEND ALL MONTHLY REPORTS
   ═══════════════════════════════════════════ */

export async function sendAllMonthlyReports(): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
}> {
  // Previous month
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-12

  // Find active MapGuard clients with email
  const activeClients = await db.select({
    client_id: clients.id,
    contact_email: clients.contact_email,
    business_name: clients.business_name,
  })
  .from(clientServices)
  .innerJoin(clients, eq(clientServices.client_id, clients.id))
  .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
  .where(and(
    eq(clientServices.status, "active"),
    eq(clientServices.enabled, true),
    sql`${serviceCatalog.id} LIKE 'mapguard%'`,
    sql`${clients.contact_email} IS NOT NULL AND ${clients.contact_email} != ''`,
  ));

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const client of activeClients) {
    if (!client.contact_email) {
      skipped++;
      continue;
    }

    const result = await sendMonthlyReportEmail(
      client.client_id,
      client.contact_email,
      year,
      month,
    );

    if (result.ok) {
      sent++;
      console.log(`[mapguard-report] Sent monthly report to ${client.business_name} (${client.contact_email})`);
    } else {
      errors.push(`${client.business_name}: ${result.error}`);
    }
  }

  console.log(`[mapguard-report] Batch complete: ${sent} sent, ${skipped} skipped, ${errors.length} errors`);
  return { sent, skipped, errors };
}
