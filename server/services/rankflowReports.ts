/**
 * RankFlow monthly performance report.
 *
 * Pulls real data from rankflow_signals (current visibility), rankflow_rankings
 * (per-keyword position history), rankflow_pages (publish activity), rankflow_tasks
 * (work delivered), and rankflow_progress (per-month rollups). Renders via the
 * shared `reportShell` in the same dark dashboard style as AdFlow / MapGuard /
 * ReputationShield.
 *
 * Idempotent per period via client_service.metadata.last_rankflow_report_period.
 * Every section degrades gracefully — missing data hides the block instead of
 * showing "—" placeholders.
 */

import { db } from "../db";
import { eq, and, sql, gte, lte, desc, isNotNull } from "drizzle-orm";
import {
  rankflowSignals,
  rankflowKeywords,
  rankflowRankings,
  rankflowPages,
  rankflowTasks,
  rankflowProgress,
} from "@shared/schemas/rankflow";
import { clients, clientServices, serviceCatalog } from "@shared/schemas/adminCrm";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";
import { generateLineChart } from "./emailCharts";
import { createLogger } from "../lib/logger";
import {
  REPORT_COLORS,
  buildReportShell,
  buildReportHero,
  buildKpiGrid,
  buildIntegratedChart,
  buildChartFallback,
  buildSection,
  buildActivityList,
  buildRecommendations,
  buildCtaButton,
  buildMetricGlossary,
  deriveHeaderBadge,
  type KpiTile,
  type HeaderBadge,
} from "../lib/reportShell";

const log = createLogger("RankFlowReports");

/* ─── Public types ─── */

export interface RankflowMonthlyReportData {
  business_name: string;
  client_id: number;
  month_label: string;            // "April 2026"
  period_start: string;
  period_end: string;
  // Visibility totals (current state)
  total_keywords: number;
  keywords_top_10: number;
  keywords_top_20: number;
  visibility_score: number | null;       // 0-100, derived: keywords_top_10 / total * 100
  visibility_score_prior: number | null; // same metric for prior period (null if no baseline)
  avg_position: number | null;
  // Period activity
  keywords_improved: number;             // distinct keywords with positive avg change in period
  avg_position_gain: number | null;      // average of positive change values
  top_winner: { keyword: string; gain: number; from_position: number; to_position: number } | null;
  // Work shipped
  pages_created: number;
  pages_indexed: number;
  tasks_completed: number;
  citations_built: number;
  // Trend chart
  position_history: Array<{ date: string; avg_position: number }>;
  // Optional supplier-/AI-written next-month actions
  recommendations?: string[];
}

export interface CompileResult {
  sent: boolean;
  reason?: string;
  period?: string;
}

/* ─── Data compilation ─── */

export async function compileRankflowReport(
  clientId: number,
  year: number,
  month: number,
): Promise<RankflowMonthlyReportData | null> {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59);
  const monthLabel = periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  // Client
  const [client] = await db.select({ business_name: clients.business_name })
    .from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;

  // Current signals (single row per client — running totals)
  const [signals] = await db.select()
    .from(rankflowSignals)
    .where(eq(rankflowSignals.client_id, clientId))
    .limit(1);

  const totalKeywords = signals?.total_keywords ?? 0;
  const keywordsTop10 = signals?.keywords_top_10 ?? 0;
  const keywordsTop20 = signals?.keywords_top_20 ?? 0;
  const avgPositionStr = signals?.avg_position;
  const avgPosition = avgPositionStr != null ? Number(avgPositionStr) : null;

  // Visibility score: share of tracked keywords landing in the top 10
  const visibilityScore = totalKeywords > 0
    ? Math.round((keywordsTop10 / totalKeywords) * 100)
    : null;

  // Per-keyword averaged change across the period — drives "keywords improved"
  // and "avg ranking gain"
  const periodChanges = await db
    .select({
      keyword_id: rankflowRankings.keyword_id,
      avg_change: sql<number>`coalesce(avg(${rankflowRankings.change}), 0)::float`,
      best_change: sql<number>`coalesce(max(${rankflowRankings.change}), 0)::int`,
      latest_position: sql<number>`(array_agg(${rankflowRankings.position} order by ${rankflowRankings.checked_at} desc))[1]::int`,
      earliest_position: sql<number>`(array_agg(${rankflowRankings.position} order by ${rankflowRankings.checked_at} asc))[1]::int`,
    })
    .from(rankflowRankings)
    .innerJoin(rankflowKeywords, eq(rankflowRankings.keyword_id, rankflowKeywords.id))
    .where(and(
      eq(rankflowKeywords.client_id, clientId),
      gte(rankflowRankings.checked_at, periodStart),
      lte(rankflowRankings.checked_at, periodEnd),
      isNotNull(rankflowRankings.change),
    ))
    .groupBy(rankflowRankings.keyword_id);

  const improvedKeywords = periodChanges.filter(k => k.avg_change > 0);
  const keywordsImproved = improvedKeywords.length;
  const avgPositionGain = improvedKeywords.length > 0
    ? Number((improvedKeywords.reduce((sum, k) => sum + k.avg_change, 0) / improvedKeywords.length).toFixed(1))
    : null;

  // Top winner — most positive ranking gain
  let topWinner: RankflowMonthlyReportData["top_winner"] = null;
  if (periodChanges.length > 0) {
    const winner = periodChanges.reduce((best, k) => k.avg_change > best.avg_change ? k : best, periodChanges[0]);
    if (winner.avg_change > 0) {
      const [kw] = await db.select({ keyword: rankflowKeywords.keyword })
        .from(rankflowKeywords).where(eq(rankflowKeywords.id, winner.keyword_id)).limit(1);
      if (kw) {
        topWinner = {
          keyword: kw.keyword,
          gain: Math.round(winner.avg_change),
          from_position: winner.earliest_position ?? 0,
          to_position: winner.latest_position ?? 0,
        };
      }
    }
  }

  // Pages created in the period
  const periodPages = await db.select({
    created: sql<number>`count(*)::int`,
    indexed: sql<number>`count(*) filter (where ${rankflowPages.indexed} = true)::int`,
  })
    .from(rankflowPages)
    .where(and(
      eq(rankflowPages.client_id, clientId),
      gte(rankflowPages.created_at, periodStart),
      lte(rankflowPages.created_at, periodEnd),
    ));
  const pagesCreated = periodPages[0]?.created ?? 0;
  const pagesIndexed = periodPages[0]?.indexed ?? 0;

  // Tasks completed in the period (canonically `done`/`approved` end states)
  const [taskStats] = await db.select({
    completed: sql<number>`count(*) filter (where ${rankflowTasks.status} in ('done','approved') and ${rankflowTasks.completed_at} between ${periodStart} and ${periodEnd})::int`,
  })
    .from(rankflowTasks)
    .where(eq(rankflowTasks.client_id, clientId));
  const tasksCompleted = taskStats?.completed ?? 0;

  // Progress rollup — citations is only tracked here, not as its own table
  const [progress] = await db.select()
    .from(rankflowProgress)
    .where(and(
      eq(rankflowProgress.client_id, clientId),
      eq(rankflowProgress.month, monthKey),
    ))
    .limit(1);
  const citationsBuilt = progress?.citations_built ?? 0;

  // Daily avg position across all tracked keywords — the chart series
  const positionRows = await db.select({
    day: sql<string>`to_char(${rankflowRankings.checked_at}, 'YYYY-MM-DD')`,
    avg_pos: sql<number>`avg(${rankflowRankings.position})::float`,
  })
    .from(rankflowRankings)
    .innerJoin(rankflowKeywords, eq(rankflowRankings.keyword_id, rankflowKeywords.id))
    .where(and(
      eq(rankflowKeywords.client_id, clientId),
      gte(rankflowRankings.checked_at, periodStart),
      lte(rankflowRankings.checked_at, periodEnd),
      isNotNull(rankflowRankings.position),
    ))
    .groupBy(sql`to_char(${rankflowRankings.checked_at}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${rankflowRankings.checked_at}, 'YYYY-MM-DD')`);

  const positionHistory = positionRows.map(r => ({
    date: r.day,
    avg_position: Number(r.avg_pos.toFixed(1)),
  }));

  // Prior-period visibility: signals.last_updated is a single row, so we
  // approximate "prior" from the earliest snapshot in the period vs current
  let visibilityScorePrior: number | null = null;
  if (positionHistory.length >= 2 && totalKeywords > 0) {
    // Approximate: the earliest period avg_position is the "before"; convert
    // to a rough visibility proxy. (We don't have a true historical
    // top_10 count over time, so this is a reasonable surrogate trend.)
    const earliestAvg = positionHistory[0].avg_position;
    const latestAvg = positionHistory[positionHistory.length - 1].avg_position;
    if (earliestAvg > 0 && latestAvg > 0) {
      // Lower position = better; use 1/avg as a relative score
      const priorRel = 100 / earliestAvg;
      const currRel = 100 / latestAvg;
      // Scale relative to current visibility score
      if (visibilityScore != null && currRel > 0) {
        visibilityScorePrior = Math.round(visibilityScore * (priorRel / currRel));
      }
    }
  }

  return {
    business_name: client.business_name,
    client_id: clientId,
    month_label: monthLabel,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    total_keywords: totalKeywords,
    keywords_top_10: keywordsTop10,
    keywords_top_20: keywordsTop20,
    visibility_score: visibilityScore,
    visibility_score_prior: visibilityScorePrior,
    avg_position: avgPosition,
    keywords_improved: keywordsImproved,
    avg_position_gain: avgPositionGain,
    top_winner: topWinner,
    pages_created: pagesCreated,
    pages_indexed: pagesIndexed,
    tasks_completed: tasksCompleted,
    citations_built: citationsBuilt,
    position_history: positionHistory,
  };
}

/* ─── Delta helper ─── */

interface DeltaShape {
  shown: boolean;
  pctText: string;
  rose: boolean;
  good: boolean;
}

function pctChange(curr: number | null, prev: number | null, opts: { higherIsBetter?: boolean } = {}): DeltaShape {
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ─── Chart ─── */

async function tryGenerateRankingChart(
  clientId: number,
  data: RankflowMonthlyReportData,
): Promise<string | null> {
  if (data.position_history.length < 4) return null;

  const periodKey = data.period_start.slice(0, 7);
  const stride = Math.max(1, Math.floor(data.position_history.length / 8));
  const labels = data.position_history.map((p, i) =>
    i % stride === 0
      ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "",
  );

  // Lower position = better (page 1 = better than page 5). Invert so the
  // chart slopes UP for improvements: visibility = max(100 - avg_position, 0).
  // This produces a familiar "growing" line for clients seeing rank gains.
  const values = data.position_history.map(p => Math.max(0, 100 - p.avg_position));

  const result = await generateLineChart({
    cacheKey: `rankflow-cs${clientId}-${periodKey}-fb`,
    labels,
    values,
    width: 700,
    height: 280,
    backgroundColor: REPORT_COLORS.card,
    variant: "integrated",
  });

  return result?.url || null;
}

/* ─── Compose ─── */

interface ComposeOpts {
  data: RankflowMonthlyReportData;
  chartUrl: string | null;
  portalUrl: string;
  recipientEmail: string;
}

function composeRankflowReport(o: ComposeOpts): { subject: string; html: string; badge: HeaderBadge } {
  const d = o.data;

  // Visibility delta drives the badge
  const visibilityDelta = pctChange(d.visibility_score, d.visibility_score_prior, { higherIsBetter: true });
  const critical = (d.total_keywords > 0 && (d.visibility_score ?? 0) < 15)
    || (d.tasks_completed === 0 && d.pages_created === 0 && d.keywords_improved === 0 && d.total_keywords > 0);
  const badge: HeaderBadge = deriveHeaderBadge({ primaryDelta: visibilityDelta, critical });

  // Hero headline + dynamic subject — picks the strongest signal first
  let heroHeadline: string;
  let subject: string;
  if (d.keywords_improved >= 5) {
    heroHeadline = `${d.keywords_improved} keywords moved up this month`;
    subject = `${d.keywords_improved} keywords moved up — your ${d.month_label} RankFlow report`;
  } else if (d.pages_created >= 3) {
    heroHeadline = `${d.pages_created} new pages published this month`;
    subject = `${d.pages_created} new pages published — your ${d.month_label} RankFlow update`;
  } else if (visibilityDelta.shown && visibilityDelta.good) {
    heroHeadline = `Rankings improving across your tracked terms`;
    subject = `Rankings improving — your ${d.month_label} RankFlow summary`;
  } else if (d.keywords_improved >= 1) {
    heroHeadline = `${d.keywords_improved} keyword${d.keywords_improved === 1 ? "" : "s"} moved up`;
    subject = `${d.keywords_improved} keyword${d.keywords_improved === 1 ? "" : "s"} moved up — your ${d.month_label} RankFlow report`;
  } else if (d.tasks_completed > 0 || d.pages_created > 0) {
    heroHeadline = `Foundation laid — ${d.tasks_completed} task${d.tasks_completed === 1 ? "" : "s"} shipped`;
    subject = `Your ${d.month_label} RankFlow update — ${d.tasks_completed} task${d.tasks_completed === 1 ? "" : "s"} shipped`;
  } else if (d.total_keywords === 0) {
    heroHeadline = `Setup in progress`;
    subject = `Your ${d.month_label} RankFlow update`;
  } else {
    heroHeadline = `Rankings holding steady`;
    subject = `Your ${d.month_label} RankFlow summary`;
  }

  const summary = (() => {
    if (d.keywords_improved >= 5) {
      return `Strong organic momentum this month. ${d.keywords_improved} of your tracked keywords moved up the rankings, with an average gain of ${d.avg_position_gain ?? "?"} positions per improver.`;
    }
    if (d.pages_created >= 3) {
      return `${d.pages_created} new ranking-targeted page${d.pages_created === 1 ? "" : "s"} went live this month${d.pages_indexed > 0 ? ` (${d.pages_indexed} already indexed by Google)` : ""}. Rankings typically follow new pages by 2-6 weeks.`;
    }
    if (d.tasks_completed > 0) {
      return `We shipped ${d.tasks_completed} optimization task${d.tasks_completed === 1 ? "" : "s"} this period. Most rank improvements arrive 2-6 weeks after the work lands — expect movement in next month's report.`;
    }
    if (d.total_keywords === 0) {
      return `RankFlow is in setup. Once we finish keyword discovery and your first batch of tasks ships, you'll start seeing rank movement here.`;
    }
    return `Your tracked keywords stayed in their current positions this period. We continued monitoring and queued the next batch of optimization work.`;
  })();

  // KPI tiles — only render tiles where we have meaningful data
  const kpis: KpiTile[] = [];

  // Always show visibility / keyword improvements as the headline pair
  kpis.push({
    label: "Keywords improved",
    value: `${d.keywords_improved}`,
    accent: true,
  });

  if (d.avg_position_gain != null) {
    kpis.push({
      label: "Avg position gain",
      value: `+${d.avg_position_gain}`,
    });
  } else if (d.avg_position != null) {
    kpis.push({
      label: "Avg position",
      value: `${d.avg_position.toFixed(1)}`,
    });
  } else {
    kpis.push({
      label: "Tracked keywords",
      value: `${d.total_keywords}`,
    });
  }

  kpis.push({
    label: "New pages",
    value: `${d.pages_created}`,
  });

  if (d.tasks_completed > 0 || d.citations_built > 0) {
    kpis.push({
      label: "Tasks shipped",
      value: `${d.tasks_completed}`,
    });
  } else if (d.visibility_score != null) {
    kpis.push({
      label: "Visibility",
      value: `${d.visibility_score}`,
      delta: visibilityDelta,
    });
  }

  // Chart fallback cells
  const fallbackCells: Array<{ label: string; value: string; emphasis?: boolean }> = [];
  if (d.position_history.length >= 2) {
    const first = d.position_history[0];
    const last = d.position_history[d.position_history.length - 1];
    fallbackCells.push({ label: "Start avg position", value: `${first.avg_position.toFixed(1)}` });
    fallbackCells.push({ label: "End avg position", value: `${last.avg_position.toFixed(1)}`, emphasis: true });
  }
  if (d.keywords_top_10 > 0) {
    fallbackCells.push({ label: "Top-10 keywords", value: `${d.keywords_top_10}` });
  }

  // Top winner highlight
  const topWinnerCard = d.top_winner ? `
    <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.25);border-radius:12px;padding:14px 16px;">
      <p style="font-size:11px;font-weight:700;color:#86EFAC;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Top mover</p>
      <p style="font-size:14px;color:${REPORT_COLORS.bright};font-weight:600;line-height:1.4;margin:0 0 4px;">"${escapeHtml(d.top_winner.keyword)}"</p>
      <p style="font-size:12px;color:${REPORT_COLORS.muted};line-height:1.5;margin:0;">Position #${d.top_winner.from_position} → #${d.top_winner.to_position} <span style="color:#86EFAC;font-weight:700;">(+${d.top_winner.gain})</span></p>
    </div>
  ` : "";

  // What we worked on
  const activityItems: string[] = [];
  if (d.tasks_completed > 0) activityItems.push(`Shipped ${d.tasks_completed} optimization task${d.tasks_completed === 1 ? "" : "s"}`);
  if (d.pages_created > 0) activityItems.push(`Published ${d.pages_created} new ranking-targeted page${d.pages_created === 1 ? "" : "s"}${d.pages_indexed > 0 ? ` (${d.pages_indexed} indexed by Google)` : ""}`);
  if (d.citations_built > 0) activityItems.push(`Built ${d.citations_built} new citation${d.citations_built === 1 ? "" : "s"} on directories and aggregators`);
  if (d.keywords_improved > 0) activityItems.push(`Tracked rank movement on ${d.keywords_improved} improving keyword${d.keywords_improved === 1 ? "" : "s"}`);

  // Default recommendations when supplier hasn't provided any
  const recommendations = d.recommendations && d.recommendations.length > 0
    ? d.recommendations
    : buildDefaultRecommendations(d);

  // Compose body — every block opt-in based on real data
  const body = [
    buildReportHero({
      eyebrow: "Rankings report",
      headline: heroHeadline,
      period: d.month_label,
      businessName: d.business_name,
      summary,
    }),
    buildKpiGrid(kpis),
    o.chartUrl ? buildIntegratedChart({ chartUrl: o.chartUrl, alt: `Visibility trend across ${d.month_label}`, height: 280 }) : "",
    fallbackCells.length > 0 ? buildChartFallback({ title: "What the chart shows", cells: fallbackCells }) : "",
    topWinnerCard ? buildSection({ title: "Biggest gain this month", content: topWinnerCard }) : "",
    activityItems.length > 0 ? buildSection({ title: "What we worked on", content: buildActivityList(activityItems) }) : "",
    buildRecommendations({ items: recommendations }),
    buildCtaButton({ href: `${o.portalUrl}/portal/rankflow`, label: "View full ranking dashboard" }),
    buildMetricGlossary({
      metrics: ["Keywords improved", "Avg position gain", "New pages", "Visibility", "Local Pack"],
      customDefs: {
        "Keywords improved": "Tracked search terms whose rank moved up across the period.",
        "Avg position gain": "Average number of spots up the search results for keywords that improved.",
        "New pages": "Pages we published or rebuilt this period to capture new search traffic.",
        "Visibility": "Share of your tracked keywords landing in Google's top 10 results (0-100).",
        "Tracked keywords": "Search terms we monitor for your business each cycle.",
        "Avg position": "Mean search-result position across all your tracked keywords. Lower is better.",
        "Tasks shipped": "On-page edits, link-building, content rewrites, or technical fixes we completed.",
      },
    }),
  ].filter(Boolean).join("");

  const html = buildReportShell({
    product: "RankFlow Report",
    badge,
    body,
    recipientEmail: o.recipientEmail,
  });

  return { subject, html, badge };
}

function buildDefaultRecommendations(d: RankflowMonthlyReportData): string[] {
  const recs: string[] = [];
  if (d.keywords_improved >= 5) {
    recs.push("Reinforce the winners — we'll add internal links and supporting content to the keywords that moved up.");
  }
  if (d.pages_created > 0 && d.pages_indexed < d.pages_created) {
    const unindexed = d.pages_created - d.pages_indexed;
    recs.push(`Push ${unindexed} new page${unindexed === 1 ? "" : "s"} into Google's index — submitting via Search Console and earning at least one inbound link each.`);
  }
  if (d.total_keywords > 0 && d.keywords_top_10 / d.total_keywords < 0.3) {
    recs.push("Focus on the top-20 keywords that are 1-3 spots away from the top-10 — those are the highest-leverage rank gains.");
  }
  if (d.tasks_completed === 0 && d.pages_created === 0) {
    recs.push("Restart the optimization cadence — we'll queue a fresh batch of on-page improvements and one supporting content piece this month.");
  }
  if (recs.length === 0) {
    recs.push("Continue the current cadence — we'll keep tracking, optimizing, and publishing as planned.");
    recs.push("Add 2-3 fresh photos to your Google Business Profile to compound the visibility lifts.");
  }
  return recs.slice(0, 3);
}

/* ─── Public API ─── */

const RANKFLOW_FROM_NAME = "WeFixTrades RankFlow";

/**
 * Send a RankFlow monthly report to one client.
 * Idempotent per period — stores `last_rankflow_report_period` in client_service.metadata.
 */
export async function sendRankflowReport(
  clientServiceId: number,
  year: number,
  month: number,
): Promise<CompileResult> {
  const [cs] = await db.select().from(clientServices).where(eq(clientServices.id, clientServiceId)).limit(1);
  if (!cs) return { sent: false, reason: "client_service_not_found" };
  if (!cs.service_id.startsWith("rankflow")) return { sent: false, reason: "not_a_rankflow_service" };

  const [client] = await db.select().from(clients).where(eq(clients.id, cs.client_id)).limit(1);
  if (!client?.contact_email) return { sent: false, reason: "no_client_email" };
  if (await isEmailUnsubscribed(client.contact_email)) {
    return { sent: false, reason: "recipient_unsubscribed" };
  }

  const transporter = getEmailTransporter();
  if (!transporter) return { sent: false, reason: "smtp_not_configured" };

  const data = await compileRankflowReport(cs.client_id, year, month);
  if (!data) return { sent: false, reason: "could_not_compile" };

  const csMeta = (cs.metadata as any) || {};
  if (csMeta.last_rankflow_report_period === data.month_label) {
    return { sent: false, reason: "already_sent_this_period", period: data.month_label };
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const chartUrl = await tryGenerateRankingChart(cs.client_id, data);

  const { subject, html } = composeRankflowReport({
    data,
    chartUrl,
    portalUrl: baseUrl,
    recipientEmail: client.contact_email,
  });

  try {
    await transporter.sendMail({
      from: `${RANKFLOW_FROM_NAME} <${getFromAddress()}>`,
      to: client.contact_email,
      subject,
      html,
    });

    await db.update(clientServices)
      .set({
        metadata: { ...csMeta, last_rankflow_report_period: data.month_label, last_rankflow_report_sent_at: new Date().toISOString() },
        updated_at: new Date(),
      } as any)
      .where(eq(clientServices.id, cs.id));

    log.info("Sent report", { period: data.month_label, serviceId: cs.id, email: client.contact_email });
    return { sent: true, period: data.month_label };
  } catch (err: any) {
    log.error("Send failed", { serviceId: cs.id, error: err.message });
    return { sent: false, reason: `send_failed: ${err.message}` };
  }
}

/* ─── Batch sender ─── */

export async function sendAllRankflowReports(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();

  const activeServices = await db.select({
    cs_id: clientServices.id,
    client_id: clientServices.client_id,
    contact_email: clients.contact_email,
    business_name: clients.business_name,
  })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(and(
      eq(clientServices.status, "active"),
      eq(clientServices.enabled, true),
      sql`${serviceCatalog.id} LIKE 'rankflow%'`,
      sql`${clients.contact_email} IS NOT NULL AND ${clients.contact_email} != ''`,
    ));

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const svc of activeServices) {
    const result = await sendRankflowReport(svc.cs_id, year, month);
    if (result.sent) {
      sent++;
    } else if (result.reason === "already_sent_this_period" || result.reason === "recipient_unsubscribed") {
      skipped++;
    } else {
      errors.push(`${svc.business_name}: ${result.reason}`);
    }
  }

  log.info("Batch complete", { sent, skipped, errors: errors.length });
  return { sent, skipped, errors };
}

/* ─── Preview helper (used by tooling / QA) ─── */

export async function previewRankflowReportHtml(opts: {
  data: RankflowMonthlyReportData;
  recipientEmail: string;
  cacheKey?: string;
  embedChartAsCid?: boolean;
}): Promise<{ subject: string; html: string; chartLocalPath: string | null; senderName: string }> {
  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";

  const chartResult = opts.data.position_history.length >= 4
    ? await generateLineChart({
        cacheKey: opts.cacheKey || `rankflow-preview-${Date.now()}`,
        labels: opts.data.position_history.map((p, i, arr) => {
          const stride = Math.max(1, Math.floor(arr.length / 8));
          return i % stride === 0
            ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "";
        }),
        values: opts.data.position_history.map(p => Math.max(0, 100 - p.avg_position)),
        width: 700,
        height: 280,
        backgroundColor: REPORT_COLORS.card,
        variant: "integrated",
      })
    : null;

  const chartUrl = opts.embedChartAsCid && chartResult?.localPath
    ? "cid:chart"
    : (chartResult?.url || null);

  const { subject, html } = composeRankflowReport({
    data: opts.data,
    chartUrl,
    portalUrl: baseUrl,
    recipientEmail: opts.recipientEmail,
  });

  return { subject, html, chartLocalPath: chartResult?.localPath || null, senderName: RANKFLOW_FROM_NAME };
}
