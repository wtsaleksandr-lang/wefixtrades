/**
 * MapGuard Monthly Report Engine.
 *
 * Compiles monthly visibility metrics from snapshots + tasks into a
 * client-safe report and emails it through the shared `reportShell`
 * premium dashboard layout.
 */

import { db } from "../db";
import { mapguardSnapshots } from "@shared/schemas/mapguardMonitoring";
import { mapguardTasks } from "@shared/schemas/mapguard";
import { clients, clientServices, serviceCatalog } from "@shared/schemas/adminCrm";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";
import { generateLineChart } from "./emailCharts";
import { createLogger } from "../lib/logger";
import { storage } from "../storage";
import {
  REPORT_COLORS,
  buildReportShell,
  buildReportHero,
  buildKpiGrid,
  buildIntegratedChart,
  buildChartFallback,
  buildSection,
  buildActivityList,
  buildChecklist,
  buildCtaButton,
  buildMetricGlossary,
  deriveHeaderBadge,
  type KpiTile,
  type HeaderBadge,
} from "../lib/reportShell";

const log = createLogger("MapGuardReports");

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
   REPORT DATA SHAPE
   ═══════════════════════════════════════════ */

export interface MonthlyReportData {
  business_name: string;
  client_id: number;
  month_label: string;
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
  // Activity
  completed_actions: string[];
  active_work: string[];
  total_completed: number;
  total_active: number;
  // Trend
  movement: "improving" | "stable" | "declining" | "new";
  /** Visibility score over time across the period — drives the chart */
  score_history: Array<{ date: string; score: number }>;
}

/* ═══════════════════════════════════════════
   DATA COMPILATION
   ═══════════════════════════════════════════ */

export async function compileMonthlyReport(
  clientId: number,
  year: number,
  month: number,
): Promise<MonthlyReportData | null> {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59);
  const monthLabel = periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const [client] = await db.select({ business_name: clients.business_name })
    .from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;

  const snapshots = await db.select()
    .from(mapguardSnapshots)
    .where(and(
      eq(mapguardSnapshots.client_id, clientId),
      gte(mapguardSnapshots.captured_at, periodStart),
      lte(mapguardSnapshots.captured_at, periodEnd),
    ))
    .orderBy(mapguardSnapshots.captured_at);

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

  let movement: MonthlyReportData["movement"] = "new";
  if (scoreDelta !== null) {
    if (scoreDelta > 3) movement = "improving";
    else if (scoreDelta < -3) movement = "declining";
    else movement = "stable";
  }

  // Score time-series for the chart (only when we have ≥2 snapshots)
  const score_history: Array<{ date: string; score: number }> = snapshots
    .filter((s) => s.score_total != null)
    .map((s) => ({
      date: s.captured_at.toISOString().slice(0, 10),
      score: s.score_total as number,
    }));

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
      .map((t) => TASK_TYPE_CLIENT_PAST[t.task_type])
      .filter(Boolean) as string[],
    active_work: activeTasks
      .map((t) => TASK_TYPE_CLIENT_ACTIVE[t.task_type])
      .filter(Boolean) as string[],
    total_completed: completedCount?.count || 0,
    total_active: activeCount?.count || 0,
    movement,
    score_history,
  };
}

/* ═══════════════════════════════════════════
   DELTA + KPI HELPERS
   ═══════════════════════════════════════════ */

function pctChange(curr: number | null, prev: number | null, opts: { higherIsBetter?: boolean } = {}) {
  if (curr == null || prev == null || prev === 0) {
    return { shown: false, pctText: "", rose: false, good: true };
  }
  const change = ((curr - prev) / prev) * 100;
  if (Math.abs(change) < 1) {
    return { shown: false, pctText: "", rose: false, good: true };
  }
  const rose = change > 0;
  const good = (opts.higherIsBetter ?? true) ? rose : !rose;
  return {
    shown: true,
    pctText: `${Math.round(Math.abs(change))}%`,
    rose,
    good,
  };
}

/* ═══════════════════════════════════════════
   CHART
   ═══════════════════════════════════════════ */

async function tryGenerateScoreChart(
  clientId: number,
  data: MonthlyReportData,
): Promise<string | null> {
  if (data.score_history.length < 2) return null;

  const periodKey = data.period_start.slice(0, 7);
  const stride = Math.max(1, Math.floor(data.score_history.length / 8));
  const labels = data.score_history.map((p, i) =>
    i % stride === 0
      ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "",
  );

  const result = await generateLineChart({
    cacheKey: `mapguard-cs${clientId}-${periodKey}-fb`,
    labels,
    values: data.score_history.map((p) => p.score),
    width: 700,
    height: 280,
    backgroundColor: REPORT_COLORS.card,
    variant: "integrated",
  });

  return result?.url || null;
}

/* ═══════════════════════════════════════════
   EMAIL COMPOSITION
   ═══════════════════════════════════════════ */

interface ComposeOpts {
  data: MonthlyReportData;
  chartUrl: string | null;
  portalUrl: string;
  recipientEmail: string;
}

function composeMapguardReport(o: ComposeOpts): { subject: string; html: string; badge: HeaderBadge } {
  const d = o.data;

  // Score delta as a percentage of 100 — used for the badge logic
  const scoreDeltaPct = d.score_delta != null && d.score_start
    ? pctChange(d.score_end, d.score_start, { higherIsBetter: true })
    : { shown: false, pctText: "", rose: false, good: true };

  const ratingDelta = pctChange(d.rating_end, d.rating_start, { higherIsBetter: true });

  // Header badge
  const critical = (d.movement === "declining") ||
    (d.rating_end != null && d.rating_end < 4.0);
  const badge: HeaderBadge = deriveHeaderBadge({ primaryDelta: scoreDeltaPct, critical });

  // Hero headline + dynamic subject
  let heroHeadline: string;
  let subject: string;
  if (d.score_delta != null && d.score_delta >= 5) {
    heroHeadline = `Visibility up ${d.score_delta} pts this month`;
    subject = `Visibility +${d.score_delta} pts — your ${d.month_label} MapGuard report`;
  } else if (d.score_delta != null && d.score_delta <= -5) {
    heroHeadline = `Visibility dipped ${Math.abs(d.score_delta)} pts — adjusting`;
    subject = `Visibility -${Math.abs(d.score_delta)} pts — your ${d.month_label} MapGuard report`;
  } else if (d.reviews_gained != null && d.reviews_gained >= 5) {
    const rt = d.rating_end != null ? `${d.rating_end.toFixed(1)}★` : "";
    heroHeadline = `${d.reviews_gained} new review${d.reviews_gained === 1 ? "" : "s"} this month`;
    subject = `${d.reviews_gained} new reviews${rt ? ` · ${rt}` : ""} — your ${d.month_label} MapGuard report`;
  } else if (d.movement === "improving") {
    heroHeadline = "Steady improvement this month";
    subject = `Your ${d.month_label} MapGuard report — improving`;
  } else if (d.movement === "stable") {
    heroHeadline = "Holding steady";
    subject = `Your ${d.month_label} MapGuard report — holding steady`;
  } else if (d.movement === "new") {
    heroHeadline = "Baseline established";
    subject = `Your ${d.month_label} MapGuard report — first baseline`;
  } else {
    heroHeadline = "MapGuard monthly report";
    subject = `Your ${d.month_label} MapGuard report`;
  }

  // KPI tiles
  const kpis: KpiTile[] = [
    {
      label: "Visibility Score",
      value: d.score_end != null ? `${d.score_end}` : "—",
      delta: scoreDeltaPct,
      accent: true,
    },
    {
      label: "Rating",
      value: d.rating_end != null ? `${d.rating_end.toFixed(1)}★` : "—",
      delta: ratingDelta,
    },
    {
      label: "Reviews",
      value: d.reviews_end != null
        ? (d.reviews_gained != null && d.reviews_gained > 0
          ? `${d.reviews_end}`
          : `${d.reviews_end}`)
        : "—",
      delta: d.reviews_gained != null && d.reviews_gained !== 0
        ? { shown: true, pctText: `+${d.reviews_gained}`, rose: d.reviews_gained > 0, good: d.reviews_gained > 0 }
        : undefined,
    },
    {
      label: "Map Pack keywords",
      value: d.local_pack_end != null ? `${d.local_pack_end}` : "—",
    },
  ];

  // Chart fallback (start vs end)
  const fallbackCells: Array<{ label: string; value: string; emphasis?: boolean }> = [];
  if (d.score_start != null) {
    fallbackCells.push({ label: "Start of month", value: `${d.score_start}` });
  }
  if (d.score_end != null) {
    fallbackCells.push({ label: "End of month", value: `${d.score_end}`, emphasis: true });
  }
  if (d.scans_this_month > 0) {
    fallbackCells.push({ label: "Scans this month", value: `${d.scans_this_month}` });
  }

  // Profile checklist
  const profileItems = [
    { label: "Website linked", ok: d.has_website },
    { label: "Business description", ok: d.has_description },
    {
      label: "Photos uploaded",
      ok: (d.photo_count ?? 0) > 0,
      detail: d.photo_count != null ? `${d.photo_count} photo${d.photo_count === 1 ? "" : "s"}` : undefined,
    },
  ];

  // Movement-based summary
  const summary = (() => {
    if (d.movement === "improving") {
      return `Your visibility is trending up. We logged ${d.scans_this_month} scan${d.scans_this_month === 1 ? "" : "s"} this month and shipped ${d.total_completed} improvement${d.total_completed === 1 ? "" : "s"}.`;
    }
    if (d.movement === "declining") {
      return `Visibility dipped this period. We've prioritized recovery actions for next cycle — see what's currently underway below.`;
    }
    if (d.movement === "new") {
      return `This is your first report. We've captured ${d.scans_this_month} baseline scan${d.scans_this_month === 1 ? "" : "s"}; trends will appear next month.`;
    }
    return `Your visibility held steady this month. We continued monitoring and shipped ${d.total_completed} small improvement${d.total_completed === 1 ? "" : "s"}.`;
  })();

  // Compose body
  const body = [
    buildReportHero({
      eyebrow: "Visibility report",
      headline: heroHeadline,
      period: d.month_label,
      businessName: d.business_name,
      summary,
    }),
    buildKpiGrid(kpis),
    o.chartUrl ? buildIntegratedChart({ chartUrl: o.chartUrl, alt: `Visibility score over ${d.month_label}`, height: 280 }) : "",
    fallbackCells.length ? buildChartFallback({ cells: fallbackCells }) : "",
    d.completed_actions.length > 0 ? buildSection({
      title: "What we worked on",
      content: buildActivityList(d.completed_actions) + (d.active_work.length > 0
        ? `<p style="font-size:12px;color:${REPORT_COLORS.muted};margin:8px 0 0;line-height:1.5;">Currently working on: ${d.active_work.map((a) => a.toLowerCase()).join(", ")}.</p>`
        : ""),
    }) : "",
    buildSection({ title: "Profile status", content: buildChecklist(profileItems) }),
    buildCtaButton({ href: `${o.portalUrl}/portal/mapguard`, label: "View full visibility dashboard" }),
    buildMetricGlossary({ metrics: ["Visibility Score", "Rating", "Reviews", "Map Pack keywords"] }),
  ].filter(Boolean).join("");

  const html = buildReportShell({
    product: "MapGuard Report",
    badge,
    body,
    recipientEmail: o.recipientEmail,
  });

  return { subject, html, badge };
}

/* ═══════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════ */

const MAPGUARD_FROM_NAME = "WeFixTrades MapGuard";

/**
 * Build the report email (subject + HTML + badge) without sending.
 * Re-exported for tooling and the preview script.
 */
export function buildMonthlyReportEmail(
  data: MonthlyReportData,
  portalUrl: string,
  recipientEmail?: string,
): { subject: string; html: string } {
  const { subject, html } = composeMapguardReport({
    data,
    chartUrl: null, // Caller can pre-generate and pass via composeMapguardReport directly if needed
    portalUrl,
    recipientEmail: recipientEmail || "",
  });
  return { subject, html };
}

/**
 * Send a MapGuard monthly report for one client.
 *
 * When called from the batch sender, `clientServiceId` enables per-period
 * dedup via `client_service.metadata.last_mapguard_report_period` and
 * an opt-out check via `metadata.report_enabled`.
 */
export async function sendMonthlyReportEmail(
  clientId: number,
  recipientEmail: string,
  year: number,
  month: number,
  clientServiceId?: number,
): Promise<{ ok: boolean; error?: string; reason?: string }> {
  if (await isEmailUnsubscribed(recipientEmail)) {
    log.info("Recipient unsubscribed — skipping", { recipientEmail });
    return { ok: false, error: "Recipient unsubscribed", reason: "recipient_unsubscribed" };
  }

  const data = await compileMonthlyReport(clientId, year, month);
  if (!data) return { ok: false, error: "Could not compile report data", reason: "could_not_compile" };

  // Per-service dedup + opt-out when called from the batch sender
  let csMeta: Record<string, any> = {};
  if (clientServiceId) {
    const [cs] = await db.select({ metadata: clientServices.metadata })
      .from(clientServices).where(eq(clientServices.id, clientServiceId)).limit(1);
    csMeta = (cs?.metadata as Record<string, any>) || {};

    if (csMeta.report_enabled === false) {
      log.debug("Reports disabled for this service — skipping", { clientId, clientServiceId });
      return { ok: false, error: "Reports disabled", reason: "reports_disabled" };
    }
    if (csMeta.last_mapguard_report_period === data.month_label) {
      log.debug("Already sent this period — skipping", { clientId, period: data.month_label });
      return { ok: false, error: "Already sent this period", reason: "already_sent_this_period" };
    }
  }

  const transporter = getEmailTransporter();
  if (!transporter) return { ok: false, error: "SMTP not configured", reason: "smtp_not_configured" };

  const portalUrl = process.env.APP_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");

  const chartUrl = await tryGenerateScoreChart(clientId, data);
  const { subject, html } = composeMapguardReport({ data, chartUrl, portalUrl, recipientEmail });

  try {
    await transporter.sendMail({
      from: `${MAPGUARD_FROM_NAME} <${getFromAddress()}>`,
      to: recipientEmail,
      subject,
      html,
    });

    // Stamp dedup marker so re-runs within the same month are safe
    if (clientServiceId) {
      await db.update(clientServices)
        .set({
          metadata: {
            ...csMeta,
            last_mapguard_report_period: data.month_label,
            last_report_sent_at: new Date().toISOString(),
          },
          updated_at: new Date(),
        } as any)
        .where(eq(clientServices.id, clientServiceId));
    }

    // Audit trail
    await storage.logAdminActivity({
      actor_type: "system",
      actor_id: null,
      actor_name: "MapGuardReport",
      action: "report.sent",
      entity_type: "client",
      entity_id: clientId,
      summary: `Monthly MapGuard report sent to ${recipientEmail} (${data.month_label})`,
      metadata: {
        month_label: data.month_label,
        score_end: data.score_end,
        movement: data.movement,
      },
    });

    return { ok: true };
  } catch (err: any) {
    log.error("Email send failed", { clientId, error: err.message });
    return { ok: false, error: err.message, reason: "send_failed" };
  }
}

/* ═══════════════════════════════════════════
   BATCH SEND
   ═══════════════════════════════════════════ */

export async function sendAllMonthlyReports(): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
}> {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();

  const activeServices = await db.select({
    cs_id: clientServices.id,
    client_id: clientServices.client_id,
    contact_email: clients.contact_email,
    business_name: clients.business_name,
    client_status: clients.status,
  })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(and(
      eq(clientServices.status, "active"),
      eq(clientServices.enabled, true),
      sql`${serviceCatalog.id} LIKE 'mapguard%'`,
      sql`${clients.status} IN ('active')`,
      sql`${clients.contact_email} IS NOT NULL AND ${clients.contact_email} != ''`,
    ));

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const svc of activeServices) {
    if (!svc.contact_email) {
      skipped++;
      continue;
    }
    const result = await sendMonthlyReportEmail(
      svc.client_id,
      svc.contact_email,
      year,
      month,
      svc.cs_id,
    );
    if (result.ok) {
      sent++;
      log.info("Sent monthly report", { businessName: svc.business_name, email: svc.contact_email });
    } else if (result.reason === "already_sent_this_period" || result.reason === "recipient_unsubscribed" || result.reason === "reports_disabled") {
      skipped++;
      log.debug("Skipped report", { businessName: svc.business_name, reason: result.reason });
    } else {
      errors.push(`${svc.business_name}: ${result.error}`);
    }
  }

  log.info("Batch complete", { sent, skipped, errors: errors.length });
  return { sent, skipped, errors };
}

/* ═══════════════════════════════════════════
   PREVIEW (used by tooling / QA)
   ═══════════════════════════════════════════ */

export async function previewMapguardReportHtml(opts: {
  data: MonthlyReportData;
  recipientEmail: string;
  cacheKey?: string;
  embedChartAsCid?: boolean;
}): Promise<{ subject: string; html: string; chartLocalPath: string | null; senderName: string }> {
  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";

  const chartResult = opts.data.score_history.length >= 2
    ? await generateLineChart({
        cacheKey: opts.cacheKey || `mapguard-preview-${Date.now()}`,
        labels: opts.data.score_history.map((p, i, arr) => {
          const stride = Math.max(1, Math.floor(arr.length / 8));
          return i % stride === 0
            ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "";
        }),
        values: opts.data.score_history.map((p) => p.score),
        width: 700,
        height: 280,
        backgroundColor: REPORT_COLORS.card,
        variant: "integrated",
      })
    : null;

  const chartUrl = opts.embedChartAsCid && chartResult?.localPath
    ? "cid:chart"
    : (chartResult?.url || null);

  const { subject, html } = composeMapguardReport({
    data: opts.data,
    chartUrl,
    portalUrl: baseUrl,
    recipientEmail: opts.recipientEmail,
  });

  return { subject, html, chartLocalPath: chartResult?.localPath || null, senderName: MAPGUARD_FROM_NAME };
}
