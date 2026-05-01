/**
 * SocialSync monthly performance report.
 *
 * Pulls real data from socialsync_posts (publish history + AI quality
 * scores), socialsync_platform_connections (active platforms), and
 * socialsync_profiles (cadence target). Renders via the shared
 * `reportShell` in the same dark dashboard style as AdFlow / MapGuard /
 * ReputationShield / RankFlow.
 *
 * Forward-compatible analytics ingestion:
 *   The KPI grid auto-includes reach / engagement / follower KPIs when
 *   the per-post `publish_result` jsonb contains those fields. Until a
 *   future analytics-ingestion job populates that data from Meta /
 *   Instagram / Google Business APIs, the report falls back to internal
 *   posting metrics (count, consistency, AI quality, active platforms).
 *
 * Idempotent per period via client_service.metadata.last_socialsync_report_period.
 */

import { db } from "../db";
import { eq, and, sql, gte, lte, desc, isNotNull } from "drizzle-orm";
import {
  socialsyncPosts,
  socialsyncProfiles,
  socialsyncPlatformConnections,
} from "@shared/schemas/socialSync";
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

const log = createLogger("SocialSyncReports");

/* ─── Public types ─── */

export interface SocialsyncMonthlyReportData {
  business_name: string;
  client_id: number;
  month_label: string;
  period_start: string;
  period_end: string;
  // Publish metrics (real data — always present)
  posts_published: number;
  posts_published_prior: number;
  active_platforms: string[];        // ["facebook", "instagram", ...]
  posts_by_platform: Record<string, number>;
  avg_quality_score: number | null;  // 0-100 if any posts have quality_score
  posting_days: number;              // distinct calendar days with at least 1 publish
  total_days_in_period: number;
  cadence_target: string | null;     // from socialsync_profiles.frequency
  best_quality_post: { platform: string; quality: number; preview: string } | null;
  // Posting cadence trend (cumulative posts over period — drives chart)
  publish_history: Array<{ date: string; cumulative: number }>;
  // Forward-compatible analytics — only populated when publish_result jsonb
  // contains real platform-API data; null when no analytics ingestion yet
  total_reach: number | null;
  total_reach_prior: number | null;
  total_impressions: number | null;
  total_engagements: number | null;
  engagement_rate_pct: number | null;
  followers_gained: number | null;
  best_performing_post: { platform: string; reach: number; preview: string } | null;
  // Optional supplier-/AI-written next-month actions
  recommendations?: string[];
}

export interface CompileResult {
  sent: boolean;
  reason?: string;
  period?: string;
}

/* ─── Data compilation ─── */

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  google_business: "Google Business",
  linkedin: "LinkedIn",
};

export async function compileSocialsyncReport(
  clientId: number,
  year: number,
  month: number,
): Promise<SocialsyncMonthlyReportData | null> {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59);
  const monthLabel = periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));

  // Client
  const [client] = await db.select({ business_name: clients.business_name })
    .from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;

  // Profile (for cadence target)
  const [profile] = await db.select({
    frequency: socialsyncProfiles.frequency,
  })
    .from(socialsyncProfiles)
    .where(eq(socialsyncProfiles.client_id, clientId))
    .limit(1);

  // Connected platforms
  const connectionRows = await db.select({
    platform: socialsyncPlatformConnections.platform,
  })
    .from(socialsyncPlatformConnections)
    .where(and(
      eq(socialsyncPlatformConnections.client_id, clientId),
      eq(socialsyncPlatformConnections.connection_status, "connected"),
    ));
  const activePlatforms = connectionRows.map(r => r.platform);

  // Period publishes — main data pull
  const periodPosts = await db.select({
    id: socialsyncPosts.id,
    platform: socialsyncPosts.platform,
    quality_score: socialsyncPosts.quality_score,
    published_at: socialsyncPosts.published_at,
    publish_result: socialsyncPosts.publish_result,
    post_text: socialsyncPosts.post_text,
  })
    .from(socialsyncPosts)
    .where(and(
      eq(socialsyncPosts.client_id, clientId),
      eq(socialsyncPosts.status, "published"),
      isNotNull(socialsyncPosts.published_at),
      gte(socialsyncPosts.published_at, periodStart),
      lte(socialsyncPosts.published_at, periodEnd),
    ));

  const postsPublished = periodPosts.length;

  // Prior-period publishes (same length, immediately before)
  const priorStart = new Date(periodStart.getTime() - (periodEnd.getTime() - periodStart.getTime()));
  const priorEnd = new Date(periodStart.getTime() - 1);
  const [priorStats] = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(socialsyncPosts)
    .where(and(
      eq(socialsyncPosts.client_id, clientId),
      eq(socialsyncPosts.status, "published"),
      isNotNull(socialsyncPosts.published_at),
      gte(socialsyncPosts.published_at, priorStart),
      lte(socialsyncPosts.published_at, priorEnd),
    ));
  const postsPublishedPrior = priorStats?.count ?? 0;

  // Per-platform breakdown
  const postsByPlatform: Record<string, number> = {};
  for (const p of periodPosts) {
    postsByPlatform[p.platform] = (postsByPlatform[p.platform] ?? 0) + 1;
  }

  // Avg quality score across posts that have one
  const scoredPosts = periodPosts.filter(p => p.quality_score != null);
  const avgQualityScore = scoredPosts.length > 0
    ? Math.round(scoredPosts.reduce((s, p) => s + (p.quality_score ?? 0), 0) / scoredPosts.length)
    : null;

  // Best-quality post in period
  const bestQualityPost: SocialsyncMonthlyReportData["best_quality_post"] = scoredPosts.length > 0
    ? (() => {
        const winner = scoredPosts.reduce((best, p) => (p.quality_score ?? 0) > (best.quality_score ?? 0) ? p : best, scoredPosts[0]);
        const preview = (winner.post_text ?? "").slice(0, 140);
        return {
          platform: PLATFORM_LABELS[winner.platform] ?? winner.platform,
          quality: winner.quality_score ?? 0,
          preview,
        };
      })()
    : null;

  // Distinct posting days
  const distinctDays = new Set(periodPosts
    .filter(p => p.published_at)
    .map(p => p.published_at!.toISOString().slice(0, 10)));
  const postingDays = distinctDays.size;

  // Cumulative publish-cadence series for the chart
  const publishHistory: Array<{ date: string; cumulative: number }> = [];
  let cumulative = 0;
  const cur = new Date(periodStart);
  while (cur <= periodEnd) {
    const dayKey = cur.toISOString().slice(0, 10);
    const newToday = periodPosts.filter(p =>
      p.published_at && p.published_at.toISOString().slice(0, 10) === dayKey
    ).length;
    cumulative += newToday;
    publishHistory.push({ date: dayKey, cumulative });
    cur.setDate(cur.getDate() + 1);
  }

  // Forward-compatible analytics — read from publish_result jsonb if any
  // posts have shipped real platform metrics (Meta Insights, IG Graph, etc.)
  const analytics = aggregateAnalytics(periodPosts);

  // Prior-period reach for delta — only compute if current period has reach.
  // Inline-sum avoids re-running the full analytics aggregator (which needs
  // post_text + platform fields just for the best-performer card).
  let totalReachPrior: number | null = null;
  if (analytics.total_reach != null) {
    const priorPosts = await db.select({ publish_result: socialsyncPosts.publish_result })
      .from(socialsyncPosts)
      .where(and(
        eq(socialsyncPosts.client_id, clientId),
        eq(socialsyncPosts.status, "published"),
        isNotNull(socialsyncPosts.published_at),
        gte(socialsyncPosts.published_at, priorStart),
        lte(socialsyncPosts.published_at, priorEnd),
      ));
    let prSum = 0;
    let any = false;
    for (const p of priorPosts) {
      const r = p.publish_result as any;
      const m = r?.metrics ?? r?.insights ?? r;
      const reach = typeof m?.reach === "number" ? m.reach : null;
      if (reach != null) { prSum += reach; any = true; }
    }
    totalReachPrior = any ? prSum : null;
  }

  return {
    business_name: client.business_name,
    client_id: clientId,
    month_label: monthLabel,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    posts_published: postsPublished,
    posts_published_prior: postsPublishedPrior,
    active_platforms: activePlatforms,
    posts_by_platform: postsByPlatform,
    avg_quality_score: avgQualityScore,
    posting_days: postingDays,
    total_days_in_period: totalDays,
    cadence_target: profile?.frequency ?? null,
    best_quality_post: bestQualityPost,
    publish_history: publishHistory,
    total_reach: analytics.total_reach,
    total_reach_prior: totalReachPrior,
    total_impressions: analytics.total_impressions,
    total_engagements: analytics.total_engagements,
    engagement_rate_pct: analytics.engagement_rate_pct,
    followers_gained: analytics.followers_gained,
    best_performing_post: analytics.best_performing_post,
  };
}

interface AnalyticsBundle {
  total_reach: number | null;
  total_impressions: number | null;
  total_engagements: number | null;
  engagement_rate_pct: number | null;
  followers_gained: number | null;
  best_performing_post: SocialsyncMonthlyReportData["best_performing_post"];
}

/**
 * Forward-compatible reader for the per-post publish_result jsonb. Looks
 * for known platform-analytics keys and returns aggregated totals when
 * present. When none of the posts have analytics data, every field
 * returns null and the report renders without those KPI tiles.
 */
function aggregateAnalytics(posts: Array<{
  platform: string;
  publish_result: any;
  post_text: string | null;
}>): AnalyticsBundle {
  let totalReach = 0;
  let totalImpressions = 0;
  let totalEngagements = 0;
  let followersGained = 0;
  let anyReach = false;
  let anyImpressions = false;
  let anyEngagements = false;
  let anyFollowers = false;
  let topPost: { platform: string; reach: number; preview: string } | null = null;

  for (const p of posts) {
    const r = p.publish_result;
    if (!r || typeof r !== "object") continue;

    // Read flexible field names — different platforms use different shapes.
    // We accept either flat fields or a nested `metrics` / `insights` object.
    const m = r.metrics ?? r.insights ?? r;
    const reach = typeof m.reach === "number" ? m.reach : null;
    const impressions = typeof m.impressions === "number" ? m.impressions : null;
    const engagements = typeof m.engagements === "number" ? m.engagements
      : typeof m.engagement_count === "number" ? m.engagement_count
      : typeof m.total_engagements === "number" ? m.total_engagements
      : null;
    const newFollowers = typeof m.followers_gained === "number" ? m.followers_gained
      : typeof m.new_followers === "number" ? m.new_followers
      : null;

    if (reach != null) { totalReach += reach; anyReach = true; }
    if (impressions != null) { totalImpressions += impressions; anyImpressions = true; }
    if (engagements != null) { totalEngagements += engagements; anyEngagements = true; }
    if (newFollowers != null) { followersGained += newFollowers; anyFollowers = true; }

    if (reach != null && reach > (topPost?.reach ?? 0)) {
      topPost = {
        platform: PLATFORM_LABELS[p.platform] ?? p.platform,
        reach,
        preview: (p.post_text ?? "").slice(0, 140),
      };
    }
  }

  const engagementRate = (anyEngagements && anyImpressions && totalImpressions > 0)
    ? Math.round((totalEngagements / totalImpressions) * 1000) / 10  // 1 decimal
    : null;

  return {
    total_reach: anyReach ? totalReach : null,
    total_impressions: anyImpressions ? totalImpressions : null,
    total_engagements: anyEngagements ? totalEngagements : null,
    engagement_rate_pct: engagementRate,
    followers_gained: anyFollowers ? followersGained : null,
    best_performing_post: topPost,
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

/* ─── Chart ─── */

async function tryGenerateCadenceChart(
  clientId: number,
  data: SocialsyncMonthlyReportData,
): Promise<string | null> {
  if (data.publish_history.length < 4) return null;
  const last = data.publish_history[data.publish_history.length - 1];
  if (last.cumulative === 0) return null;

  const periodKey = data.period_start.slice(0, 7);
  const stride = Math.max(1, Math.floor(data.publish_history.length / 8));
  const labels = data.publish_history.map((p, i) =>
    i % stride === 0
      ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "",
  );

  const result = await generateLineChart({
    cacheKey: `socialsync-cs${clientId}-${periodKey}-fb`,
    labels,
    values: data.publish_history.map(p => p.cumulative),
    width: 700,
    height: 280,
    backgroundColor: REPORT_COLORS.card,
    variant: "integrated",
  });

  return result?.url || null;
}

/* ─── Compose ─── */

interface ComposeOpts {
  data: SocialsyncMonthlyReportData;
  chartUrl: string | null;
  portalUrl: string;
  recipientEmail: string;
}

function composeSocialsyncReport(o: ComposeOpts): { subject: string; html: string; badge: HeaderBadge } {
  const d = o.data;

  // Pick a primary delta — prefer reach when analytics data is live,
  // otherwise fall back to posts-published delta
  const reachDelta = pctChange(d.total_reach, d.total_reach_prior, { higherIsBetter: true });
  const postsDelta = pctChange(d.posts_published, d.posts_published_prior, { higherIsBetter: true });
  const primaryDelta = reachDelta.shown ? reachDelta : postsDelta;

  // Cadence: posting days vs total days in period
  const consistencyPct = d.total_days_in_period > 0
    ? Math.round((d.posting_days / d.total_days_in_period) * 100)
    : 0;

  // Header badge — critical when active platforms exist but nothing was published
  const critical = d.active_platforms.length > 0 && d.posts_published === 0;
  const badge: HeaderBadge = deriveHeaderBadge({ primaryDelta, critical });

  // Hero headline + dynamic subject — strongest signal first
  let heroHeadline: string;
  let subject: string;
  if (reachDelta.shown && reachDelta.rose && parseInt(reachDelta.pctText, 10) >= 20) {
    heroHeadline = `Reach up ${reachDelta.pctText} this month`;
    subject = `Reach up ${reachDelta.pctText} — your ${d.month_label} SocialSync report`;
  } else if (d.posts_published >= 12) {
    heroHeadline = `${d.posts_published} posts published this month`;
    subject = `${d.posts_published} posts published — your ${d.month_label} SocialSync update`;
  } else if (postsDelta.shown && postsDelta.rose && parseInt(postsDelta.pctText, 10) >= 20) {
    heroHeadline = `Posting cadence stepped up`;
    subject = `Posts up ${postsDelta.pctText} — your ${d.month_label} SocialSync update`;
  } else if (d.posts_published >= 4) {
    heroHeadline = `${d.posts_published} posts published this month`;
    subject = `${d.posts_published} posts published — your ${d.month_label} SocialSync update`;
  } else if (reachDelta.shown && reachDelta.good) {
    heroHeadline = `Engagement improving across your accounts`;
    subject = `Engagement improving — your ${d.month_label} SocialSync summary`;
  } else if (d.posts_published > 0) {
    heroHeadline = `${d.posts_published} post${d.posts_published === 1 ? "" : "s"} this month`;
    subject = `${d.posts_published} post${d.posts_published === 1 ? "" : "s"} published — your ${d.month_label} SocialSync update`;
  } else if (d.active_platforms.length === 0) {
    heroHeadline = `Connect a platform to start posting`;
    subject = `Your ${d.month_label} SocialSync update`;
  } else {
    heroHeadline = `Posting paused this month`;
    subject = `Your ${d.month_label} SocialSync summary`;
  }

  const summary = (() => {
    if (d.posts_published >= 12) {
      const platforms = d.active_platforms.length === 1
        ? PLATFORM_LABELS[d.active_platforms[0]] ?? d.active_platforms[0]
        : `${d.active_platforms.length} connected platform${d.active_platforms.length === 1 ? "" : "s"}`;
      return `Strong publishing month. We shipped ${d.posts_published} post${d.posts_published === 1 ? "" : "s"} across ${platforms} on ${d.posting_days} of ${d.total_days_in_period} days.`;
    }
    if (d.posts_published > 0) {
      return `${d.posts_published} post${d.posts_published === 1 ? "" : "s"} went live this month across ${d.active_platforms.length} connected platform${d.active_platforms.length === 1 ? "" : "s"}. ${d.avg_quality_score != null ? `Average AI quality score: ${d.avg_quality_score}/100.` : ""}`;
    }
    if (d.active_platforms.length === 0) {
      return `No platform connections active yet — once you connect Facebook, Instagram, or Google Business, our automation queues content for you to approve.`;
    }
    return `Publishing was paused this period. We'll resume the cadence next month and aim for ${d.cadence_target ? d.cadence_target.replace("_", " ") : "your target frequency"}.`;
  })();

  // KPI tiles — adapts to which signals exist
  const kpis: KpiTile[] = [];

  // Always show posts published (accent tile)
  kpis.push({
    label: "Posts published",
    value: `${d.posts_published}`,
    delta: postsDelta,
    accent: true,
  });

  // Reach OR Avg quality (whichever is real) OR Active platforms
  if (d.total_reach != null) {
    kpis.push({
      label: "Total reach",
      value: formatNumber(d.total_reach),
      delta: reachDelta,
    });
  } else if (d.avg_quality_score != null) {
    kpis.push({
      label: "Avg quality",
      value: `${d.avg_quality_score}/100`,
    });
  } else {
    kpis.push({
      label: "Active platforms",
      value: `${d.active_platforms.length}`,
    });
  }

  // Engagement rate OR Posting consistency
  if (d.engagement_rate_pct != null) {
    kpis.push({
      label: "Engagement rate",
      value: `${d.engagement_rate_pct}%`,
    });
  } else {
    kpis.push({
      label: "Posting consistency",
      value: `${consistencyPct}%`,
    });
  }

  // Followers gained OR Active platforms (when reach was shown above)
  if (d.followers_gained != null && d.followers_gained !== 0) {
    kpis.push({
      label: "Followers gained",
      value: `${d.followers_gained > 0 ? "+" : ""}${d.followers_gained}`,
    });
  } else if (d.total_reach != null) {
    // Reach occupied tile #2; surface platforms as #4
    kpis.push({
      label: "Active platforms",
      value: `${d.active_platforms.length}`,
    });
  } else {
    // Show posting days as the 4th tile
    kpis.push({
      label: "Posting days",
      value: `${d.posting_days}/${d.total_days_in_period}`,
    });
  }

  // Chart fallback cells
  const fallbackCells: Array<{ label: string; value: string; emphasis?: boolean }> = [];
  if (d.posts_published > 0) {
    fallbackCells.push({ label: "Posts this month", value: `${d.posts_published}`, emphasis: true });
  }
  fallbackCells.push({ label: "Active platforms", value: d.active_platforms.length > 0
    ? d.active_platforms.map(p => PLATFORM_LABELS[p] ?? p).join(" · ")
    : "None connected",
  });

  // Best-performing post (real analytics) OR best-quality post (internal)
  const bestPostBlock = d.best_performing_post ? `
    <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.25);border-radius:12px;padding:14px 16px;">
      <p style="font-size:11px;font-weight:700;color:#86EFAC;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Top performer · ${escapeHtml(d.best_performing_post.platform)}</p>
      <p style="font-size:13px;color:${REPORT_COLORS.text};line-height:1.5;margin:0 0 6px;">"${escapeHtml(d.best_performing_post.preview)}${d.best_performing_post.preview.length >= 140 ? "…" : ""}"</p>
      <p style="font-size:12px;color:${REPORT_COLORS.muted};margin:0;">${formatNumber(d.best_performing_post.reach)} reach</p>
    </div>
  ` : d.best_quality_post ? `
    <div style="background:${REPORT_COLORS.cardSubtle};border:1px solid ${REPORT_COLORS.border};border-radius:12px;padding:14px 16px;">
      <p style="font-size:11px;font-weight:700;color:${REPORT_COLORS.accent};text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Highest-quality post · ${escapeHtml(d.best_quality_post.platform)}</p>
      <p style="font-size:13px;color:${REPORT_COLORS.text};line-height:1.5;margin:0 0 6px;">"${escapeHtml(d.best_quality_post.preview)}${d.best_quality_post.preview.length >= 140 ? "…" : ""}"</p>
      <p style="font-size:12px;color:${REPORT_COLORS.muted};margin:0;">AI quality score: ${d.best_quality_post.quality}/100</p>
    </div>
  ` : "";

  // Activity / what we worked on
  const platformBreakdownItems = Object.entries(d.posts_by_platform)
    .sort(([, a], [, b]) => b - a)
    .map(([platform, count]) => `${count} on ${PLATFORM_LABELS[platform] ?? platform}`);
  const activityItems: string[] = [];
  if (d.posts_published > 0) {
    activityItems.push(`Published ${d.posts_published} post${d.posts_published === 1 ? "" : "s"}${platformBreakdownItems.length > 0 ? ` (${platformBreakdownItems.join(", ")})` : ""}`);
  }
  if (d.posting_days > 0) {
    activityItems.push(`Posted on ${d.posting_days} of ${d.total_days_in_period} days${consistencyPct >= 50 ? " — consistent cadence" : ""}`);
  }
  if (d.avg_quality_score != null) {
    activityItems.push(`Maintained ${d.avg_quality_score}/100 average AI quality across drafts`);
  }
  if (d.followers_gained != null && d.followers_gained > 0) {
    activityItems.push(`Net +${d.followers_gained} follower${d.followers_gained === 1 ? "" : "s"} across connected accounts`);
  }

  // Default recommendations when supplier hasn't provided any
  const recommendations = d.recommendations && d.recommendations.length > 0
    ? d.recommendations
    : buildDefaultRecommendations(d);

  // Compose body
  const body = [
    buildReportHero({
      eyebrow: "Social media report",
      headline: heroHeadline,
      period: d.month_label,
      businessName: d.business_name,
      summary,
    }),
    buildKpiGrid(kpis),
    o.chartUrl ? buildIntegratedChart({ chartUrl: o.chartUrl, alt: `Posting cadence across ${d.month_label}`, height: 280 }) : "",
    fallbackCells.length > 0 ? buildChartFallback({ title: "What the chart shows", cells: fallbackCells }) : "",
    bestPostBlock ? buildSection({ title: "Standout post", content: bestPostBlock }) : "",
    activityItems.length > 0 ? buildSection({ title: "What we worked on", content: buildActivityList(activityItems) }) : "",
    buildRecommendations({ items: recommendations }),
    buildCtaButton({ href: `${o.portalUrl}/portal/socialsync`, label: "View full social dashboard" }),
    buildMetricGlossary({
      metrics: [
        "Posts published",
        ...(d.total_reach != null ? ["Total reach"] : []),
        ...(d.engagement_rate_pct != null ? ["Engagement rate"] : ["Posting consistency"]),
        ...(d.followers_gained != null ? ["Followers gained"] : ["Posting days"]),
        ...(d.avg_quality_score != null && d.total_reach == null ? ["Avg quality"] : []),
        "Active platforms",
      ],
      customDefs: {
        "Posts published": "Posts that went live across your connected accounts during the period.",
        "Total reach": "Unique people who saw your posts at least once. Source: platform insights.",
        "Engagement rate": "Engagements (likes, comments, shares) divided by impressions, expressed as a percentage.",
        "Followers gained": "Net change in follower count across your connected accounts during the period.",
        "Posting consistency": "Share of days in the period when at least one post went live (0-100).",
        "Posting days": "Calendar days when at least one post went live.",
        "Avg quality": "Internal AI quality score (0-100) averaged across drafts shipped this period.",
        "Active platforms": "Connected accounts ready to receive scheduled posts.",
      },
    }),
  ].filter(Boolean).join("");

  const html = buildReportShell({
    product: "SocialSync Report",
    badge,
    body,
    recipientEmail: o.recipientEmail,
  });

  return { subject, html, badge };
}

function buildDefaultRecommendations(d: SocialsyncMonthlyReportData): string[] {
  const recs: string[] = [];
  if (d.active_platforms.length === 0) {
    recs.push("Connect Facebook, Instagram, or Google Business in your portal to activate scheduled posting.");
  }
  if (d.posts_published >= 12 && d.engagement_rate_pct == null) {
    recs.push("Once we activate analytics ingestion, you'll see reach + engagement here automatically — no setup on your side.");
  }
  if (d.posts_published > 0 && d.posts_published < 6) {
    recs.push(`Step up to ${d.cadence_target ? d.cadence_target.replace("_", " ") : "3 posts/week"} cadence — the top quartile of trades businesses post 12+ times per month and see compounding lifts.`);
  }
  if (d.avg_quality_score != null && d.avg_quality_score < 70) {
    recs.push("Refresh the topic bank — current AI drafts are scoring below the quality bar. We'll seed new angles next month.");
  }
  if (d.posts_published === 0 && d.active_platforms.length > 0) {
    recs.push("Resume the publishing cadence — we'll generate a fresh batch of drafts and queue them for your approval.");
  }
  if (recs.length === 0) {
    recs.push("Hold the cadence steady — we'll keep generating, scoring, and publishing on the established schedule.");
    recs.push("Add 1-2 testimonial posts this month — they tend to outperform tip posts on Facebook by ~30% on engagement.");
  }
  return recs.slice(0, 3);
}

/* ─── Public API ─── */

const SOCIALSYNC_FROM_NAME = "WeFixTrades SocialSync";

/**
 * Send a SocialSync monthly report to one client.
 * Idempotent per period via client_service.metadata.last_socialsync_report_period.
 */
export async function sendSocialsyncReport(
  clientServiceId: number,
  year: number,
  month: number,
): Promise<CompileResult> {
  const [cs] = await db.select().from(clientServices).where(eq(clientServices.id, clientServiceId)).limit(1);
  if (!cs) return { sent: false, reason: "client_service_not_found" };
  if (!cs.service_id.startsWith("socialsync")) return { sent: false, reason: "not_a_socialsync_service" };

  const [client] = await db.select().from(clients).where(eq(clients.id, cs.client_id)).limit(1);
  if (!client?.contact_email) return { sent: false, reason: "no_client_email" };
  if (await isEmailUnsubscribed(client.contact_email)) {
    return { sent: false, reason: "recipient_unsubscribed" };
  }

  const transporter = getEmailTransporter();
  if (!transporter) return { sent: false, reason: "smtp_not_configured" };

  const data = await compileSocialsyncReport(cs.client_id, year, month);
  if (!data) return { sent: false, reason: "could_not_compile" };

  const csMeta = (cs.metadata as any) || {};
  if (csMeta.last_socialsync_report_period === data.month_label) {
    return { sent: false, reason: "already_sent_this_period", period: data.month_label };
  }

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const chartUrl = await tryGenerateCadenceChart(cs.client_id, data);

  const { subject, html } = composeSocialsyncReport({
    data,
    chartUrl,
    portalUrl: baseUrl,
    recipientEmail: client.contact_email,
  });

  try {
    await transporter.sendMail({
      from: `${SOCIALSYNC_FROM_NAME} <${getFromAddress()}>`,
      to: client.contact_email,
      subject,
      html,
    });

    await db.update(clientServices)
      .set({
        metadata: { ...csMeta, last_socialsync_report_period: data.month_label, last_socialsync_report_sent_at: new Date().toISOString() },
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

export async function sendAllSocialsyncReports(): Promise<{ sent: number; skipped: number; errors: string[] }> {
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
      sql`${serviceCatalog.id} LIKE 'socialsync%'`,
      sql`${clients.contact_email} IS NOT NULL AND ${clients.contact_email} != ''`,
    ));

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const svc of activeServices) {
    const result = await sendSocialsyncReport(svc.cs_id, year, month);
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

/* ─── Preview (used by tooling / QA) ─── */

export async function previewSocialsyncReportHtml(opts: {
  data: SocialsyncMonthlyReportData;
  recipientEmail: string;
  cacheKey?: string;
  embedChartAsCid?: boolean;
}): Promise<{ subject: string; html: string; chartLocalPath: string | null; senderName: string }> {
  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";

  const chartResult = (opts.data.publish_history.length >= 4 && opts.data.publish_history[opts.data.publish_history.length - 1].cumulative > 0)
    ? await generateLineChart({
        cacheKey: opts.cacheKey || `socialsync-preview-${Date.now()}`,
        labels: opts.data.publish_history.map((p, i, arr) => {
          const stride = Math.max(1, Math.floor(arr.length / 8));
          return i % stride === 0
            ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "";
        }),
        values: opts.data.publish_history.map(p => p.cumulative),
        width: 700,
        height: 280,
        backgroundColor: REPORT_COLORS.card,
        variant: "integrated",
      })
    : null;

  const chartUrl = opts.embedChartAsCid && chartResult?.localPath
    ? "cid:chart"
    : (chartResult?.url || null);

  const { subject, html } = composeSocialsyncReport({
    data: opts.data,
    chartUrl,
    portalUrl: baseUrl,
    recipientEmail: opts.recipientEmail,
  });

  return { subject, html, chartLocalPath: chartResult?.localPath || null, senderName: SOCIALSYNC_FROM_NAME };
}
