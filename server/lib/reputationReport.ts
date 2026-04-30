/**
 * ReputationShield monthly/periodic review report.
 *
 * Compiled from real data (monitoredReviews, reviewRequests) and rendered
 * via the shared `reportShell` premium dashboard layout. Focus metrics:
 * review growth, star rating, requests sent, response rate, negative
 * feedback recovered, next-month actions.
 */

import { db } from "../db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { monitoredReviews, reviewRequests, clients } from "@shared/schema";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { isEmailUnsubscribed } from "./unsubscribeStorage";
import { generateLineChart } from "../services/emailCharts";
import {
  REPORT_COLORS,
  buildReportShell,
  buildReportHero,
  buildKpiGrid,
  buildIntegratedChart,
  buildChartFallback,
  buildSection,
  buildRecommendations,
  buildCtaButton,
  buildMetricGlossary,
  deriveHeaderBadge,
  type KpiTile,
  type HeaderBadge,
} from "./reportShell";

/* ─── Public types ─── */

export interface ReportData {
  businessName: string;
  contactEmail: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  // Reviews
  totalReviews: number;
  averageRating: number;
  newReviewsCount: number;
  newReviewsPriorPeriod: number;
  reviewsWithoutResponse: number;
  lowRatingNoResponse: number;
  // Requests
  requestsSent: number;
  feedbackCaptured: number;          // negatives gated privately
  routedPositive: number;            // happy customers sent to Google
  // Highlight
  bestReview: { reviewerName: string; rating: number; text: string } | null;
  // Time series for the chart (cumulative new reviews per day in period)
  reviewVelocity: Array<{ date: string; count: number }>;
  // Optional supplier-/AI-written next-month actions
  recommendations?: string[];
}

/* ─── Data aggregation ─── */

export async function aggregateReportData(
  clientId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<ReportData | null> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client || !client.contact_email) return null;

  // All-time stats (used for response rate baseline)
  const [allTimeStats] = await db.select({
    total: sql<number>`count(*)::int`,
    avgRating: sql<number>`coalesce(round(avg(${monitoredReviews.rating})::numeric, 2), 0)::float`,
    noResponse: sql<number>`count(*) filter (where ${monitoredReviews.response_text} is null)::int`,
    lowNoResponse: sql<number>`count(*) filter (where ${monitoredReviews.rating} <= 2 and ${monitoredReviews.response_text} is null)::int`,
  }).from(monitoredReviews).where(eq(monitoredReviews.client_id, clientId));

  // New reviews in period
  const [periodStats] = await db.select({
    newCount: sql<number>`count(*)::int`,
  }).from(monitoredReviews).where(and(
    eq(monitoredReviews.client_id, clientId),
    gte(monitoredReviews.first_seen_at, periodStart),
    lte(monitoredReviews.first_seen_at, periodEnd),
  ));

  // Prior period (same length) for review-growth delta
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  const priorStart = new Date(periodStart.getTime() - periodMs);
  const priorEnd = new Date(periodStart.getTime() - 1);
  const [priorStats] = await db.select({
    newCount: sql<number>`count(*)::int`,
  }).from(monitoredReviews).where(and(
    eq(monitoredReviews.client_id, clientId),
    gte(monitoredReviews.first_seen_at, priorStart),
    lte(monitoredReviews.first_seen_at, priorEnd),
  ));

  // Review requests in period
  const [requestStats] = await db.select({
    sent: sql<number>`count(*) filter (where ${reviewRequests.status} != 'pending')::int`,
    feedbackCaptured: sql<number>`count(*) filter (where ${reviewRequests.internal_feedback} is not null)::int`,
    routedPositive: sql<number>`count(*) filter (where ${reviewRequests.status} = 'routed_positive')::int`,
  }).from(reviewRequests).where(and(
    eq(reviewRequests.client_id, clientId),
    gte(reviewRequests.created_at, periodStart),
    lte(reviewRequests.created_at, periodEnd),
  ));

  // Best review in period
  const [bestReview] = await db.select({
    reviewerName: monitoredReviews.reviewer_name,
    rating: monitoredReviews.rating,
    text: monitoredReviews.review_text,
  }).from(monitoredReviews).where(and(
    eq(monitoredReviews.client_id, clientId),
    gte(monitoredReviews.first_seen_at, periodStart),
    lte(monitoredReviews.first_seen_at, periodEnd),
    sql`${monitoredReviews.rating} >= 4`,
    sql`${monitoredReviews.review_text} is not null`,
    sql`length(${monitoredReviews.review_text}) > 20`,
  )).orderBy(desc(monitoredReviews.rating), sql`length(${monitoredReviews.review_text}) desc`)
    .limit(1);

  // Review velocity — daily new reviews across the period (for chart)
  const velocityRows = await db.select({
    day: sql<string>`to_char(${monitoredReviews.first_seen_at}, 'YYYY-MM-DD')`,
    count: sql<number>`count(*)::int`,
  })
    .from(monitoredReviews)
    .where(and(
      eq(monitoredReviews.client_id, clientId),
      gte(monitoredReviews.first_seen_at, periodStart),
      lte(monitoredReviews.first_seen_at, periodEnd),
    ))
    .groupBy(sql`to_char(${monitoredReviews.first_seen_at}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${monitoredReviews.first_seen_at}, 'YYYY-MM-DD')`);

  // Build cumulative series (running total) — much cleaner curve than raw daily counts
  const velocityMap = new Map(velocityRows.map((r) => [r.day, r.count]));
  const reviewVelocity: Array<{ date: string; count: number }> = [];
  let cum = 0;
  const cur = new Date(periodStart);
  while (cur <= periodEnd) {
    const key = cur.toISOString().slice(0, 10);
    cum += velocityMap.get(key) ?? 0;
    reviewVelocity.push({ date: key, count: cum });
    cur.setDate(cur.getDate() + 1);
  }

  const periodLabel = `${periodStart.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} – ${periodEnd.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;

  return {
    businessName: client.business_name,
    contactEmail: client.contact_email,
    periodLabel,
    periodStart,
    periodEnd,
    totalReviews: allTimeStats?.total ?? 0,
    averageRating: allTimeStats?.avgRating ?? 0,
    newReviewsCount: periodStats?.newCount ?? 0,
    newReviewsPriorPeriod: priorStats?.newCount ?? 0,
    reviewsWithoutResponse: allTimeStats?.noResponse ?? 0,
    lowRatingNoResponse: allTimeStats?.lowNoResponse ?? 0,
    requestsSent: requestStats?.sent ?? 0,
    feedbackCaptured: requestStats?.feedbackCaptured ?? 0,
    routedPositive: requestStats?.routedPositive ?? 0,
    bestReview: bestReview?.text ? {
      reviewerName: bestReview.reviewerName,
      rating: bestReview.rating,
      text: bestReview.text.slice(0, 300),
    } : null,
    reviewVelocity,
  };
}

/* ─── Delta helper ─── */

function pctChange(curr: number, prev: number, opts: { higherIsBetter?: boolean } = {}) {
  if (prev === 0) {
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

/* ─── Stars (used inside best-review card) ─── */

function starsHtml(rating: number): string {
  let s = "";
  for (let i = 1; i <= 5; i++) {
    s += `<span style="color:${i <= rating ? "#FBBF24" : REPORT_COLORS.tiny};font-size:14px;">&#9733;</span>`;
  }
  return s;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ─── Best review card (custom block — keeps the existing green-tinted highlight) ─── */

function buildBestReviewCard(review: ReportData["bestReview"]): string {
  if (!review) return "";
  return `
    <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.25);border-radius:12px;padding:14px 16px;margin:0 0 18px;">
      <div style="margin-bottom:6px;">${starsHtml(review.rating)}</div>
      <p style="font-size:13px;color:#86EFAC;line-height:1.55;margin:0 0 6px;font-style:italic;">&ldquo;${escapeHtml(review.text)}&rdquo;</p>
      <p style="font-size:12px;color:${REPORT_COLORS.muted};margin:0;">— ${escapeHtml(review.reviewerName)}</p>
    </div>`;
}

/* ─── Attention call (low-rating reviews still unanswered) ─── */

function buildAttentionCard(count: number): string {
  if (count <= 0) return "";
  return `
    <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:12px 16px;margin:0 0 18px;font-size:13px;color:#FCD34D;line-height:1.55;">
      <strong style="color:${REPORT_COLORS.bright};">${count}</strong> low-rating review${count === 1 ? "" : "s"} still need${count === 1 ? "s" : ""} a response. Replying within 48 hours improves your local rank and shows future customers you care.
    </div>`;
}

/* ─── Chart ─── */

async function tryGenerateVelocityChart(
  clientId: number,
  data: ReportData,
): Promise<string | null> {
  if (data.reviewVelocity.length < 4) return null;
  // Skip chart if zero growth — flat line at 0 is uninformative
  const last = data.reviewVelocity[data.reviewVelocity.length - 1].count;
  if (last <= 0) return null;

  const periodKey = data.periodStart.toISOString().slice(0, 7);
  const stride = Math.max(1, Math.floor(data.reviewVelocity.length / 8));
  const labels = data.reviewVelocity.map((p, i) =>
    i % stride === 0
      ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "",
  );

  const result = await generateLineChart({
    cacheKey: `repshield-cs${clientId}-${periodKey}-fb`,
    labels,
    values: data.reviewVelocity.map((p) => p.count),
    width: 700,
    height: 280,
    backgroundColor: REPORT_COLORS.card,
    variant: "integrated",
  });

  return result?.url || null;
}

/* ─── Compose ─── */

interface ComposeOpts {
  data: ReportData;
  chartUrl: string | null;
  portalUrl: string;
  recipientEmail: string;
}

function composeReputationReport(o: ComposeOpts): { subject: string; html: string; badge: HeaderBadge } {
  const d = o.data;

  // Deltas
  const reviewGrowthDelta = pctChange(d.newReviewsCount, d.newReviewsPriorPeriod, { higherIsBetter: true });

  // Response rate (across all-time tracked reviews)
  const responseRate = d.totalReviews > 0
    ? Math.round(((d.totalReviews - d.reviewsWithoutResponse) / d.totalReviews) * 100)
    : null;

  // Critical flags — drives badge tone independently of delta
  const critical = d.lowRatingNoResponse >= 3 || (d.averageRating > 0 && d.averageRating < 4.0);

  const badge: HeaderBadge = deriveHeaderBadge({ primaryDelta: reviewGrowthDelta, critical });

  // Hero headline + dynamic subject
  const ratingDisplay = d.averageRating > 0 ? `${d.averageRating.toFixed(1)}★` : "";
  let heroHeadline: string;
  let subject: string;

  if (d.newReviewsCount >= 10) {
    heroHeadline = `${d.newReviewsCount} new reviews this month`;
    subject = `${d.newReviewsCount} new reviews${ratingDisplay ? ` · ${ratingDisplay}` : ""} — your ${d.periodLabel.split(" – ")[1] || d.periodLabel} reputation report`;
  } else if (d.feedbackCaptured >= 3) {
    heroHeadline = `${d.feedbackCaptured} negative${d.feedbackCaptured === 1 ? "" : "s"} caught privately`;
    subject = `${d.feedbackCaptured} issue${d.feedbackCaptured === 1 ? "" : "s"} caught privately — your reputation report`;
  } else if (d.lowRatingNoResponse >= 3) {
    heroHeadline = `${d.lowRatingNoResponse} reviews waiting for your reply`;
    subject = `${d.lowRatingNoResponse} reviews need a reply — your reputation report`;
  } else if (d.newReviewsCount > 0) {
    heroHeadline = `${d.newReviewsCount} new review${d.newReviewsCount === 1 ? "" : "s"} this month`;
    subject = `${d.newReviewsCount} new review${d.newReviewsCount === 1 ? "" : "s"}${ratingDisplay ? ` · ${ratingDisplay}` : ""} — your reputation report`;
  } else if (d.requestsSent > 0) {
    heroHeadline = `${d.requestsSent} review request${d.requestsSent === 1 ? "" : "s"} out the door`;
    subject = `Your reputation report — ${d.requestsSent} request${d.requestsSent === 1 ? "" : "s"} sent`;
  } else {
    heroHeadline = `Reputation holding steady`;
    subject = `Your reputation report${ratingDisplay ? ` — ${ratingDisplay}` : ""}`;
  }

  // Period summary copy
  const summary = (() => {
    if (d.newReviewsCount >= 10) {
      return `Strong review momentum this period. We sent ${d.requestsSent} request${d.requestsSent === 1 ? "" : "s"} to recent customers and ${d.feedbackCaptured > 0 ? `caught ${d.feedbackCaptured} negative${d.feedbackCaptured === 1 ? "" : "s"} privately before they posted publicly` : "routed happy customers to Google"}.`;
    }
    if (d.feedbackCaptured >= 3) {
      return `We caught ${d.feedbackCaptured} negative experience${d.feedbackCaptured === 1 ? "" : "s"} privately this period — those would otherwise have landed as low-star public reviews. Your team can follow up directly.`;
    }
    if (d.lowRatingNoResponse >= 3) {
      return `Your overall trajectory is fine, but a handful of recent low-rating reviews are still waiting for a reply. Even a brief response moves the needle on local rank.`;
    }
    if (d.requestsSent > 0) {
      return `${d.requestsSent} review request${d.requestsSent === 1 ? "" : "s"} ${d.requestsSent === 1 ? "was" : "were"} sent this period. Reviews typically follow 5-10 days behind requests, so expect more activity in the next cycle.`;
    }
    return `No new review activity this period. Once you connect a recent-customer source we'll start sending requests automatically.`;
  })();

  // Star rating display string (used in KPI tile)
  const ratingValue = d.averageRating > 0 ? `${d.averageRating.toFixed(1)}★` : "—";

  // KPI tiles — the 4 metrics the user asked for
  const kpis: KpiTile[] = [
    {
      label: "New reviews",
      value: `${d.newReviewsCount}`,
      delta: reviewGrowthDelta,
      accent: true,
    },
    {
      label: "Average rating",
      value: ratingValue,
    },
    {
      label: "Requests sent",
      value: `${d.requestsSent}`,
    },
    {
      label: "Response rate",
      value: responseRate != null ? `${responseRate}%` : "—",
    },
  ];

  // Chart fallback cells
  const fallbackCells: Array<{ label: string; value: string; emphasis?: boolean }> = [];
  const peakDayPoint = d.reviewVelocity.length >= 2
    ? d.reviewVelocity.reduce((peak, p, i, arr) => {
        const prev = i > 0 ? arr[i - 1].count : 0;
        const dailyAdd = p.count - prev;
        return dailyAdd > peak.dailyAdd ? { date: p.date, dailyAdd } : peak;
      }, { date: d.reviewVelocity[0].date, dailyAdd: 0 })
    : null;
  if (peakDayPoint && peakDayPoint.dailyAdd > 0) {
    fallbackCells.push({
      label: "Best day",
      value: `${new Date(peakDayPoint.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · +${peakDayPoint.dailyAdd}`,
      emphasis: true,
    });
  }
  fallbackCells.push({
    label: "All-time tracked",
    value: `${d.totalReviews}`,
  });

  // Activity / what we worked on
  const activityItems: string[] = [];
  if (d.requestsSent > 0) activityItems.push(`Sent ${d.requestsSent} review request${d.requestsSent === 1 ? "" : "s"}`);
  if (d.routedPositive > 0) activityItems.push(`Routed ${d.routedPositive} happy customer${d.routedPositive === 1 ? "" : "s"} to Google`);
  if (d.feedbackCaptured > 0) activityItems.push(`Caught ${d.feedbackCaptured} negative${d.feedbackCaptured === 1 ? "" : "s"} privately for your team to follow up`);
  if (d.totalReviews > 0 && d.reviewsWithoutResponse < d.totalReviews) {
    const responded = d.totalReviews - d.reviewsWithoutResponse;
    activityItems.push(`Tracked ${responded} reviewed-and-responded conversation${responded === 1 ? "" : "s"}`);
  }
  const activityHtml = activityItems.length > 0 ? `
    <div style="background:${REPORT_COLORS.cardSubtle};border:1px solid ${REPORT_COLORS.border};border-radius:10px;padding:14px 18px;">
      ${activityItems.map((item) => `
        <p style="font-size:13px;color:${REPORT_COLORS.text};line-height:1.55;margin:0 0 4px;padding-left:14px;position:relative;">
          <span style="color:${REPORT_COLORS.accent};position:absolute;left:0;top:0;font-weight:700;">✓</span>${escapeHtml(item)}
        </p>
      `).join("")}
    </div>
  ` : "";

  // Default next-month actions if supplier hasn't provided any
  const recommendations = d.recommendations && d.recommendations.length > 0
    ? d.recommendations
    : buildDefaultRecommendations(d);

  // Compose body
  const body = [
    buildReportHero({
      eyebrow: "Reputation report",
      headline: heroHeadline,
      period: d.periodLabel,
      businessName: d.businessName,
      summary,
    }),
    buildKpiGrid(kpis),
    o.chartUrl ? buildIntegratedChart({ chartUrl: o.chartUrl, alt: `Cumulative reviews over ${d.periodLabel}`, height: 280 }) : "",
    fallbackCells.length > 0 ? buildChartFallback({ title: "What the chart shows", cells: fallbackCells }) : "",
    d.bestReview ? buildSection({ title: "Best review this period", content: buildBestReviewCard(d.bestReview) }) : "",
    d.lowRatingNoResponse > 0 ? buildSection({ title: "Needs your attention", content: buildAttentionCard(d.lowRatingNoResponse) }) : "",
    activityHtml ? buildSection({ title: "What we worked on", content: activityHtml }) : "",
    buildRecommendations({ title: "Next month actions", items: recommendations }),
    buildCtaButton({ href: `${o.portalUrl}/portal/reviews`, label: "View full review dashboard" }),
    buildMetricGlossary({
      metrics: ["New reviews", "Average rating", "Requests sent", "Response rate"],
      customDefs: {
        "New reviews": "Reviews you received during this period across all tracked platforms.",
        "Average rating": "Your current average across all reviews we've collected.",
        "Requests sent": "Personal review-request emails or texts our system delivered to recent customers.",
        "Response rate": "Share of reviews where you (or our auto-reply system) have already replied.",
      },
    }),
  ].filter(Boolean).join("");

  const html = buildReportShell({
    product: "ReputationShield Report",
    badge,
    body,
    recipientEmail: o.recipientEmail,
  });

  return { subject, html, badge };
}

/** Rule-based default next-month actions based on the data shape. */
function buildDefaultRecommendations(d: ReportData): string[] {
  const recs: string[] = [];
  if (d.lowRatingNoResponse > 0) {
    recs.push(`Reply to the ${d.lowRatingNoResponse} unanswered low-rating review${d.lowRatingNoResponse === 1 ? "" : "s"} — even a 2-line response moves the needle on local rank.`);
  }
  if (d.requestsSent < 5) {
    recs.push("Push more recent customers into the request flow — the top 25% of trade businesses send 30+ requests/month.");
  }
  if (d.routedPositive > 0 && d.feedbackCaptured / Math.max(1, d.routedPositive) > 0.4) {
    recs.push("Several customers gated as negatives — review the captured feedback and use it for service-process improvements.");
  }
  if (recs.length === 0) {
    recs.push("Keep doing what's working — we'll keep monitoring for new reviews and run requests on schedule.");
    recs.push("Add 1-2 photos to your Google Business Profile this month — fresh photos lift visibility scores measurably.");
  }
  return recs.slice(0, 3);
}

/* ─── Public API ─── */

const REPSHIELD_FROM_NAME = "WeFixTrades ReputationShield";

/**
 * Build the report HTML + subject (no send). Used by tooling.
 */
export function buildReportEmailHtml(data: ReportData, portalUrl: string): { subject: string; html: string } {
  const { subject, html } = composeReputationReport({
    data,
    chartUrl: null,
    portalUrl,
    recipientEmail: data.contactEmail,
  });
  return { subject, html };
}

/**
 * Send a ReputationShield report for one client.
 */
export async function sendReputationReport(data: ReportData, portalUrl: string): Promise<{ ok: boolean; error?: string }> {
  const transporter = getEmailTransporter();
  if (!transporter) return { ok: false, error: "SMTP not configured" };
  if (!data.contactEmail) return { ok: false, error: "No contact email" };

  if (await isEmailUnsubscribed(data.contactEmail)) {
    console.log(`[reputation-report] Recipient ${data.contactEmail} is unsubscribed — skipping`);
    return { ok: false, error: "Recipient unsubscribed" };
  }

  // Pre-generate chart at send time (best-effort; null is fine)
  const chartUrl = await tryGenerateVelocityChart(0 /* clientId is unknown here; cache key uses 0 */, data);

  const { subject, html } = composeReputationReport({
    data,
    chartUrl,
    portalUrl,
    recipientEmail: data.contactEmail,
  });

  try {
    await transporter.sendMail({
      from: `${REPSHIELD_FROM_NAME} <${getFromAddress()}>`,
      to: data.contactEmail,
      subject,
      html,
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/* ─── Preview helper (used by tooling / QA) ─── */

export async function previewReputationReportHtml(opts: {
  data: ReportData;
  recipientEmail: string;
  cacheKey?: string;
  embedChartAsCid?: boolean;
}): Promise<{ subject: string; html: string; chartLocalPath: string | null; senderName: string }> {
  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";

  const chartResult = opts.data.reviewVelocity.length >= 4 && opts.data.reviewVelocity[opts.data.reviewVelocity.length - 1].count > 0
    ? await generateLineChart({
        cacheKey: opts.cacheKey || `repshield-preview-${Date.now()}`,
        labels: opts.data.reviewVelocity.map((p, i, arr) => {
          const stride = Math.max(1, Math.floor(arr.length / 8));
          return i % stride === 0
            ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "";
        }),
        values: opts.data.reviewVelocity.map((p) => p.count),
        width: 700,
        height: 280,
        backgroundColor: REPORT_COLORS.card,
        variant: "integrated",
      })
    : null;

  const chartUrl = opts.embedChartAsCid && chartResult?.localPath
    ? "cid:chart"
    : (chartResult?.url || null);

  const { subject, html } = composeReputationReport({
    data: opts.data,
    chartUrl,
    portalUrl: baseUrl,
    recipientEmail: opts.recipientEmail,
  });

  return { subject, html, chartLocalPath: chartResult?.localPath || null, senderName: REPSHIELD_FROM_NAME };
}
