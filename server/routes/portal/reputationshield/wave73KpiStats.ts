/**
 * Portal ReputationShield — Wave 73 KPI stat endpoints.
 *
 *   GET /api/portal/reputationshield/stats/score?type=composite — SemiGauge
 *   GET /api/portal/reputationshield/stats/segments?dimension=sentiment — DonutChart
 *   GET /api/portal/reputationshield/stats/monthly?months=6     — MonthlyBarSeries
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { monitoredReviews } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalReputationshieldWave73KpiStats");

const TTL_MS = 5 * 60_000;
type Cached<T> = { at: number; payload: T };

interface ScoreResponse {
  value: number;
  verdict: string;
  advice: string;
  data_status: "real" | "illustrative";
}
interface SegmentResponse {
  data: Array<{ label: string; value: number; color?: string }>;
  data_status: "real" | "illustrative";
}
interface MonthlySeriesResponse {
  data: Array<{ label: string; value: number; highlighted?: boolean }>;
  data_status: "real" | "illustrative";
}

const scoreCache = new Map<string, Cached<ScoreResponse>>();
const segmentsCache = new Map<string, Cached<SegmentResponse>>();
const monthlyCache = new Map<string, Cached<MonthlySeriesResponse>>();

const EMPTY_SCORE: ScoreResponse = {
  value: 0,
  verdict: "Needs attention",
  advice: "Start collecting reviews to build your reputation score.",
  data_status: "illustrative",
};
const EMPTY_SEGMENTS: SegmentResponse = { data: [], data_status: "illustrative" };
const EMPTY_MONTHLY: MonthlySeriesResponse = { data: [], data_status: "illustrative" };

function monthLabels(months: number): { label: string; start: Date; end: Date }[] {
  const out: { label: string; start: Date; end: Date }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    out.push({
      label: start.toLocaleString(undefined, { month: "short" }),
      start,
      end,
    });
  }
  return out;
}

export async function computeReputationComposite(
  clientId: number,
): Promise<ScoreResponse> {
  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);
  const oneEightyAgo = new Date(now.getTime() - 180 * 86_400_000);

  const rows = await db
    .select({
      rating: monitoredReviews.rating,
      published_at: monitoredReviews.published_at,
    })
    .from(monitoredReviews)
    .where(
      and(
        eq(monitoredReviews.client_id, clientId),
        gte(monitoredReviews.published_at, oneEightyAgo),
      ),
    );

  if (rows.length === 0) {
    return {
      value: 65,
      verdict: "Healthy but improvable",
      advice: "Start collecting reviews — each one lifts your composite score.",
      data_status: "illustrative",
    };
  }

  const ratings = rows.map((r) => r.rating).filter((n): n is number => n > 0);
  const avgRating = ratings.length > 0
    ? ratings.reduce((s, v) => s + v, 0) / ratings.length
    : 0;

  const recentRows = rows.filter(
    (r) => r.published_at && r.published_at >= thirtyAgo,
  );
  const volumeThisMonth = recentRows.length;

  const lastReview = rows.reduce<Date | null>((latest, r) => {
    if (!r.published_at) return latest;
    if (!latest || r.published_at > latest) return r.published_at;
    return latest;
  }, null);
  const daysSinceLast = lastReview
    ? Math.floor((now.getTime() - lastReview.getTime()) / 86_400_000)
    : 999;

  const ratingPart = (avgRating / 5) * 60;
  const recencyPart = Math.max(0, Math.min(20, 20 - (daysSinceLast / 30) * 10));
  const volumePart = Math.min(20, volumeThisMonth * 2);
  const value = Math.round(ratingPart + recencyPart + volumePart);

  const verdict =
    value >= 80 ? "Solid reputation"
      : value >= 50 ? "Healthy but improvable"
        : "Needs attention";
  const advice =
    value >= 80
      ? "Keep the review cadence going — you're outperforming most local competitors."
      : value >= 50
        ? "Reply to a few more reviews this week to lift the composite above 80."
        : "Run a review-request campaign — recent and frequent reviews lift this score fastest.";

  return { value, verdict, advice, data_status: "real" };
}

export async function computeReputationSentimentMix(
  clientId: number,
): Promise<SegmentResponse> {
  const now = new Date();
  const ninetyAgo = new Date(now.getTime() - 90 * 86_400_000);

  const rows = await db
    .select({
      rating: monitoredReviews.rating,
      n: sql<number>`count(*)::int`,
    })
    .from(monitoredReviews)
    .where(
      and(
        eq(monitoredReviews.client_id, clientId),
        gte(monitoredReviews.published_at, ninetyAgo),
      ),
    )
    .groupBy(monitoredReviews.rating);

  let positive = 0;
  let neutral = 0;
  let negative = 0;
  for (const r of rows) {
    const n = Number(r.n) || 0;
    if (r.rating >= 4) positive += n;
    else if (r.rating === 3) neutral += n;
    else if (r.rating > 0) negative += n;
  }

  if (positive + neutral + negative === 0) {
    return {
      data: [
        { label: "Positive", value: 18, color: "emerald" },
        { label: "Neutral", value: 6, color: "amber" },
        { label: "Negative", value: 2, color: "crimson" },
      ],
      data_status: "illustrative",
    };
  }
  return {
    data: [
      { label: "Positive", value: positive, color: "emerald" },
      { label: "Neutral", value: neutral, color: "amber" },
      { label: "Negative", value: negative, color: "crimson" },
    ],
    data_status: "real",
  };
}

export async function computeReputationMonthlyNewReviews(
  clientId: number,
  months: number,
): Promise<MonthlySeriesResponse> {
  const labels = monthLabels(months);
  const periodStart = labels[0]!.start;

  const rows = await db
    .select({
      published_at: monitoredReviews.published_at,
    })
    .from(monitoredReviews)
    .where(
      and(
        eq(monitoredReviews.client_id, clientId),
        gte(monitoredReviews.published_at, periodStart),
      ),
    );

  const data = labels.map((m, idx) => {
    const count = rows.filter(
      (r) => r.published_at && r.published_at >= m.start && r.published_at < m.end,
    ).length;
    return {
      label: m.label,
      value: count,
      highlighted: idx === labels.length - 1,
    };
  });
  const anyData = data.some((d) => d.value > 0);
  if (!anyData) {
    return {
      data: labels.map((m, i) => ({
        label: m.label,
        value: Math.round(1 + i * 0.9),
        highlighted: i === labels.length - 1,
      })),
      data_status: "illustrative",
    };
  }
  return { data, data_status: "real" };
}

export function registerPortalReputationshieldWave73KpiStatsRoutes(app: Express) {
  app.get(
    "/api/portal/reputationshield/stats/score",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_SCORE as unknown as Record<string, unknown>,
        });
        if (clientId === null) return;
        const cached = scoreCache.get(String(clientId));
        if (cached && Date.now() - cached.at < TTL_MS) {
          return res.json(cached.payload);
        }
        const payload = await computeReputationComposite(clientId);
        scoreCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error(
          "[portal/reputationshield/stats/score]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/reputationshield/stats/segments",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_SEGMENTS as unknown as Record<string, unknown>,
        });
        if (clientId === null) return;
        const cached = segmentsCache.get(String(clientId));
        if (cached && Date.now() - cached.at < TTL_MS) {
          return res.json(cached.payload);
        }
        const payload = await computeReputationSentimentMix(clientId);
        segmentsCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error(
          "[portal/reputationshield/stats/segments]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/reputationshield/stats/monthly",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_MONTHLY as unknown as Record<string, unknown>,
        });
        if (clientId === null) return;
        const months = Math.max(1, Math.min(12, Number(req.query.months) || 6));
        const cacheKey = `${clientId}:${months}`;
        const cached = monthlyCache.get(cacheKey);
        if (cached && Date.now() - cached.at < TTL_MS) {
          return res.json(cached.payload);
        }
        const payload = await computeReputationMonthlyNewReviews(clientId, months);
        monthlyCache.set(cacheKey, { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error(
          "[portal/reputationshield/stats/monthly]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
