/**
 * Portal ReputationShield Dashboard KPIs — Wave 28.
 *
 * GET /api/portal/reputationshield/dashboard-kpis
 *
 * Returns the hero KPIs + the 12-week sentiment heatmap data + per-platform
 * scorecard deltas needed by /portal/reputationshield/dashboard.
 *
 *   1. avgRating          — average across ALL platforms (4★+ scale)
 *   2. reviewVelocity     — reviews this month + MoM delta + 12-week sparkline
 *   3. daysSinceLastReview — int (0 = today; pulses red at 30+)
 *   4. replyRate          — % of recent reviews replied-to
 *
 * Plus auxiliary payload:
 *   - scorecard:    { google, yelp, facebook, bbb } each {rating, count, recentCount, delta30d}
 *   - heatmap:      Map of dateKey (YYYY-MM-DD) → { count, sentiment, breakdown }
 *   - velocityTrend: 12-week int array for AnimatedCounter Sparkline
 *
 * Sentiment derivation: 5★/4★ = positive, 3★ = neutral, 1-2★ = negative.
 * Matches Wave 22C ApprovalInbox InboxItemSentiment.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { monitoredReviews } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalReputationshieldDashboardKpis");

type Platform = "google" | "yelp" | "facebook" | "bbb";
const PLATFORMS: Platform[] = ["google", "yelp", "facebook", "bbb"];

interface PlatformStats {
  rating: number;
  count: number;
  recentCount: number;
  delta30d: number;
}

interface HeatmapCell {
  date: string; // YYYY-MM-DD
  count: number;
  positive: number;
  neutral: number;
  negative: number;
  /** Aggregate sentiment for the cell. */
  sentiment: "positive" | "neutral" | "negative" | "mixed" | "none";
}

interface DashboardResponse {
  previewMode?: boolean;
  kpis: {
    avgRating: number;
    reviewVelocity: {
      thisMonth: number;
      lastMonth: number;
      deltaPct: number;
    };
    daysSinceLastReview: number | null;
    replyRate: number;
  };
  scorecard: Record<Platform, PlatformStats>;
  heatmap: HeatmapCell[];
  velocityTrend12w: number[];
}

const EMPTY_PLATFORM: PlatformStats = {
  rating: 0,
  count: 0,
  recentCount: 0,
  delta30d: 0,
};

const EMPTY_RESPONSE = {
  previewMode: true,
  kpis: {
    avgRating: 0,
    reviewVelocity: { thisMonth: 0, lastMonth: 0, deltaPct: 0 },
    daysSinceLastReview: null,
    replyRate: 0,
  },
  scorecard: {
    google: EMPTY_PLATFORM,
    yelp: EMPTY_PLATFORM,
    facebook: EMPTY_PLATFORM,
    bbb: EMPTY_PLATFORM,
  },
  heatmap: [],
  velocityTrend12w: [],
};

function ratingToSentiment(
  rating: number,
): "positive" | "neutral" | "negative" {
  if (rating >= 4) return "positive";
  if (rating === 3) return "neutral";
  return "negative";
}

function dateKey(d: Date): string {
  const iso = d.toISOString();
  return iso.slice(0, 10); // YYYY-MM-DD
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function buildHeatmap(
  reviews: Array<{ published_at: Date | null; rating: number }>,
): HeatmapCell[] {
  // 12 weeks * 7 days = 84 cells, ending today (UTC).
  const today = startOfDay(new Date());
  const cells: HeatmapCell[] = [];
  const buckets: Map<string, { p: number; ne: number; n: number }> = new Map();

  for (const r of reviews) {
    if (!r.published_at) continue;
    const k = dateKey(startOfDay(r.published_at));
    const cur = buckets.get(k) ?? { p: 0, ne: 0, n: 0 };
    const sent = ratingToSentiment(r.rating);
    if (sent === "positive") cur.p++;
    else if (sent === "neutral") cur.ne++;
    else cur.n++;
    buckets.set(k, cur);
  }

  for (let i = 83; i >= 0; i--) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - i);
    const k = dateKey(day);
    const b = buckets.get(k) ?? { p: 0, ne: 0, n: 0 };
    const total = b.p + b.ne + b.n;
    let sentiment: HeatmapCell["sentiment"] = "none";
    if (total > 0) {
      if (b.n > 0 && (b.p > 0 || b.ne > 0)) sentiment = "mixed";
      else if (b.n > 0) sentiment = "negative";
      else if (b.p > b.ne) sentiment = "positive";
      else sentiment = "neutral";
    }
    cells.push({
      date: k,
      count: total,
      positive: b.p,
      neutral: b.ne,
      negative: b.n,
      sentiment,
    });
  }
  return cells;
}

function buildVelocityTrend(
  reviews: Array<{ published_at: Date | null }>,
): number[] {
  // 12 weekly buckets, oldest → newest.
  const today = startOfDay(new Date());
  const weeks = new Array<number>(12).fill(0);
  for (const r of reviews) {
    if (!r.published_at) continue;
    const diffDays = Math.floor(
      (today.getTime() - r.published_at.getTime()) / 86_400_000,
    );
    if (diffDays < 0 || diffDays >= 12 * 7) continue;
    const weekIdx = 11 - Math.floor(diffDays / 7);
    if (weekIdx >= 0 && weekIdx < 12) weeks[weekIdx]!++;
  }
  return weeks;
}

function buildScorecard(
  rows: Array<{
    platform: string;
    rating: number;
    published_at: Date | null;
  }>,
  thirtyAgo: Date,
  sixtyAgo: Date,
): Record<Platform, PlatformStats> {
  const out: Record<Platform, PlatformStats> = {
    google: { ...EMPTY_PLATFORM },
    yelp: { ...EMPTY_PLATFORM },
    facebook: { ...EMPTY_PLATFORM },
    bbb: { ...EMPTY_PLATFORM },
  };

  // Pre-bucket per platform.
  const byPlatform: Record<Platform, typeof rows> = {
    google: [],
    yelp: [],
    facebook: [],
    bbb: [],
  };
  for (const r of rows) {
    const p = (r.platform ?? "google").toLowerCase();
    if (!PLATFORMS.includes(p as Platform)) continue;
    byPlatform[p as Platform].push(r);
  }

  for (const p of PLATFORMS) {
    const pr = byPlatform[p];
    if (pr.length === 0) continue;
    const allRatings = pr.map((r) => r.rating).filter((n) => n > 0);
    const recentRatings = pr
      .filter((r) => r.published_at && r.published_at >= thirtyAgo)
      .map((r) => r.rating)
      .filter((n) => n > 0);
    const priorRatings = pr
      .filter(
        (r) =>
          r.published_at &&
          r.published_at >= sixtyAgo &&
          r.published_at < thirtyAgo,
      )
      .map((r) => r.rating)
      .filter((n) => n > 0);

    const avg = allRatings.length
      ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length
      : 0;
    const recentAvg = recentRatings.length
      ? recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length
      : avg;
    const priorAvg = priorRatings.length
      ? priorRatings.reduce((a, b) => a + b, 0) / priorRatings.length
      : recentAvg;

    out[p] = {
      rating: Math.round(avg * 10) / 10,
      count: pr.length,
      recentCount: recentRatings.length,
      delta30d: Math.round((recentAvg - priorAvg) * 10) / 10,
    };
  }
  return out;
}

/**
 * Pure compute path so Copilot metricsContext can reuse it without Express.
 */
export async function computeReputationshieldDashboardKpis(
  clientId: number,
): Promise<Omit<DashboardResponse, "previewMode">> {
  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);
  const sixtyAgo = new Date(now.getTime() - 60 * 86_400_000);
  const ninetyAgo = new Date(now.getTime() - 90 * 86_400_000);

  // Pull last 200 reviews — sufficient for 84-day heatmap + 12-week velocity.
  // Order desc so heatmap fold-back is straightforward.
  const reviews = await db
    .select({
      id: monitoredReviews.id,
      platform: monitoredReviews.platform,
      rating: monitoredReviews.rating,
      published_at: monitoredReviews.published_at,
      response_text: monitoredReviews.response_text,
    })
    .from(monitoredReviews)
    .where(
      and(
        eq(monitoredReviews.client_id, clientId),
        gte(monitoredReviews.published_at, ninetyAgo),
      ),
    )
    .orderBy(desc(monitoredReviews.published_at))
    .limit(500);

  // All-time aggregates for avg-rating + reply-rate (use a separate query
  // capped wider so reply-rate is honest even when many old reviews exist).
  const allRecent = await db
    .select({
      rating: monitoredReviews.rating,
      response_text: monitoredReviews.response_text,
      published_at: monitoredReviews.published_at,
    })
    .from(monitoredReviews)
    .where(eq(monitoredReviews.client_id, clientId))
    .orderBy(desc(monitoredReviews.published_at))
    .limit(500);

  const allRatings = allRecent
    .map((r) => r.rating)
    .filter((n): n is number => typeof n === "number" && n > 0);
  const avgRating = allRatings.length
    ? Math.round(
        (allRatings.reduce((a, b) => a + b, 0) / allRatings.length) * 10,
      ) / 10
    : 0;

  const thisMonthReviews = allRecent.filter(
    (r) => r.published_at && r.published_at >= thirtyAgo,
  );
  const lastMonthReviews = allRecent.filter(
    (r) =>
      r.published_at &&
      r.published_at >= sixtyAgo &&
      r.published_at < thirtyAgo,
  );
  const thisMonth = thisMonthReviews.length;
  const lastMonth = lastMonthReviews.length;
  const deltaPct =
    lastMonth > 0
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
      : thisMonth > 0
        ? 100
        : 0;

  // days since last review — null if no reviews ever.
  const mostRecent = allRecent.find((r) => r.published_at);
  const daysSinceLastReview = mostRecent?.published_at
    ? Math.floor(
        (now.getTime() - mostRecent.published_at.getTime()) / 86_400_000,
      )
    : null;

  const repliedCount = thisMonthReviews.filter(
    (r) => r.response_text && r.response_text.trim().length > 0,
  ).length;
  const replyRate =
    thisMonthReviews.length > 0
      ? Math.round((repliedCount / thisMonthReviews.length) * 100)
      : 0;

  const heatmap = buildHeatmap(
    reviews.map((r) => ({
      published_at: r.published_at,
      rating: r.rating ?? 0,
    })),
  );
  const velocityTrend12w = buildVelocityTrend(
    allRecent.map((r) => ({ published_at: r.published_at })),
  );

  const scorecard = buildScorecard(
    allRecent.map((r) => ({
      platform: "google", // monitoredReviews stores platform per row — see below
      rating: r.rating ?? 0,
      published_at: r.published_at,
    })),
    thirtyAgo,
    sixtyAgo,
  );
  // Replace the synthetic "google" stamp above with the real per-row value.
  // (We re-query the platform column on the same 500-row window.)
  const platformRows = await db
    .select({
      platform: monitoredReviews.platform,
      rating: monitoredReviews.rating,
      published_at: monitoredReviews.published_at,
    })
    .from(monitoredReviews)
    .where(eq(monitoredReviews.client_id, clientId))
    .orderBy(desc(monitoredReviews.published_at))
    .limit(500);
  const realScorecard = buildScorecard(
    platformRows.map((r) => ({
      platform: r.platform ?? "google",
      rating: r.rating ?? 0,
      published_at: r.published_at,
    })),
    thirtyAgo,
    sixtyAgo,
  );

  return {
    kpis: {
      avgRating,
      reviewVelocity: { thisMonth, lastMonth, deltaPct },
      daysSinceLastReview,
      replyRate,
    },
    scorecard: realScorecard,
    heatmap,
    velocityTrend12w,
  };
}

export function registerPortalReputationshieldDashboardKpisRoutes(
  app: Express,
) {
  app.get(
    "/api/portal/reputationshield/dashboard-kpis",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const payload = await computeReputationshieldDashboardKpis(clientId);
        res.json(payload);
      } catch (err: any) {
        log.error(
          "[portal/reputationshield/dashboard-kpis]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
