/**
 * Portal RankFlow — Wave 73 KPI stat endpoints.
 *
 *   GET /api/portal/rankflow/stats/monthly?months=6  — MonthlyBarSeries
 *   GET /api/portal/rankflow/stats/peak?metric=best_rank — SparklineWithPeak
 *
 * Backed by rankflow_keywords + rankflow_rankings (per-keyword position
 * history). Caches at 5-min TTL per client.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, sql, inArray } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { rankflowKeywords, rankflowRankings } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalRankflowWave73KpiStats");

const TTL_MS = 5 * 60_000;
type Cached<T> = { at: number; payload: T };

interface MonthlySeriesResponse {
  data: Array<{ label: string; value: number; highlighted?: boolean }>;
  data_status: "real" | "illustrative";
}
interface PeakSeriesResponse {
  data: number[];
  peakLabel: string;
  peakIndex: number;
  data_status: "real" | "illustrative";
}

const monthlyCache = new Map<string, Cached<MonthlySeriesResponse>>();
const peakCache = new Map<string, Cached<PeakSeriesResponse>>();

const EMPTY_MONTHLY: MonthlySeriesResponse = { data: [], data_status: "illustrative" };
const EMPTY_PEAK: PeakSeriesResponse = {
  data: [],
  peakLabel: "",
  peakIndex: 0,
  data_status: "illustrative",
};

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

export async function computeRankflowMonthlyTop10(
  clientId: number,
  months: number,
): Promise<MonthlySeriesResponse> {
  // Pull all this client's keyword IDs once.
  const keywordRows = await db
    .select({ id: rankflowKeywords.id })
    .from(rankflowKeywords)
    .where(eq(rankflowKeywords.client_id, clientId));
  const keywordIds = keywordRows.map((r) => r.id);

  const labels = monthLabels(months);
  if (keywordIds.length === 0) {
    return {
      data: labels.map((m, i) => ({
        label: m.label,
        value: Math.round(2 + i * 1.2),
        highlighted: i === labels.length - 1,
      })),
      data_status: "illustrative",
    };
  }

  // For each month, count distinct keywords with at least one ranking
  // observation at position <= 10 in that month.
  const periodStart = labels[0]!.start;
  const rankings = await db
    .select({
      keyword_id: rankflowRankings.keyword_id,
      position: rankflowRankings.position,
      checked_at: rankflowRankings.checked_at,
    })
    .from(rankflowRankings)
    .where(
      and(
        inArray(rankflowRankings.keyword_id, keywordIds),
        gte(rankflowRankings.checked_at, periodStart),
      ),
    );

  const data = labels.map((m, idx) => {
    const setInMonth = new Set<number>();
    for (const r of rankings) {
      if (!r.checked_at || !r.position) continue;
      if (r.checked_at >= m.start && r.checked_at < m.end && r.position <= 10) {
        setInMonth.add(r.keyword_id);
      }
    }
    return {
      label: m.label,
      value: setInMonth.size,
      highlighted: idx === labels.length - 1,
    };
  });
  const anyData = data.some((d) => d.value > 0);
  if (!anyData) {
    return {
      data: labels.map((m, i) => ({
        label: m.label,
        value: Math.round(2 + i * 1.2),
        highlighted: i === labels.length - 1,
      })),
      data_status: "illustrative",
    };
  }
  return { data, data_status: "real" };
}

export async function computeRankflowWeeklyBestRankSpike(
  clientId: number,
): Promise<PeakSeriesResponse> {
  // 12 weekly buckets of "best (lowest) average position across this client's
  // keywords in that week". Lower position = better, so we transform to a
  // 0-100 score where higher is better for the sparkline.
  const keywordRows = await db
    .select({ id: rankflowKeywords.id })
    .from(rankflowKeywords)
    .where(eq(rankflowKeywords.client_id, clientId));
  const keywordIds = keywordRows.map((r) => r.id);

  if (keywordIds.length === 0) {
    const synthetic = [40, 45, 50, 48, 60, 65, 70, 75, 72, 80, 85, 82];
    const peakIndex = synthetic.indexOf(Math.max(...synthetic));
    return {
      data: synthetic,
      peakLabel: `Best rank: top ${100 - Math.max(...synthetic)}`,
      peakIndex,
      data_status: "illustrative",
    };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const twelveWeeksAgo = new Date(today.getTime() - 12 * 7 * 86_400_000);

  const rankings = await db
    .select({
      position: rankflowRankings.position,
      checked_at: rankflowRankings.checked_at,
    })
    .from(rankflowRankings)
    .where(
      and(
        inArray(rankflowRankings.keyword_id, keywordIds),
        gte(rankflowRankings.checked_at, twelveWeeksAgo),
      ),
    );

  const weekBuckets: Array<{ sum: number; n: number }> = new Array(12)
    .fill(null)
    .map(() => ({ sum: 0, n: 0 }));
  for (const r of rankings) {
    if (!r.checked_at || !r.position) continue;
    const diff = Math.floor((today.getTime() - r.checked_at.getTime()) / 86_400_000);
    if (diff < 0 || diff >= 12 * 7) continue;
    const idx = 11 - Math.floor(diff / 7);
    if (idx >= 0 && idx < 12) {
      weekBuckets[idx]!.sum += r.position;
      weekBuckets[idx]!.n += 1;
    }
  }

  const weeklyScores = weekBuckets.map(({ sum, n }) => {
    if (n === 0) return 0;
    const avg = sum / n; // lower better
    // Convert position 1..100 to score 100..0 (clamped).
    return Math.max(0, Math.min(100, Math.round(100 - Math.min(avg, 100))));
  });

  const anyData = weeklyScores.some((v) => v > 0);
  if (!anyData) {
    const synthetic = [40, 45, 50, 48, 60, 65, 70, 75, 72, 80, 85, 82];
    const peakIndex = synthetic.indexOf(Math.max(...synthetic));
    return {
      data: synthetic,
      peakLabel: `Best rank: top ${100 - Math.max(...synthetic)}`,
      peakIndex,
      data_status: "illustrative",
    };
  }
  const peakValue = Math.max(...weeklyScores);
  const peakIndex = weeklyScores.indexOf(peakValue);
  return {
    data: weeklyScores,
    peakLabel: `Best rank: top ${Math.max(1, 100 - peakValue)}`,
    peakIndex,
    data_status: "real",
  };
}

export function registerPortalRankflowWave73KpiStatsRoutes(app: Express) {
  app.get(
    "/api/portal/rankflow/stats/monthly",
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
        const payload = await computeRankflowMonthlyTop10(clientId, months);
        monthlyCache.set(cacheKey, { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/rankflow/stats/monthly]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/rankflow/stats/peak",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_PEAK as unknown as Record<string, unknown>,
        });
        if (clientId === null) return;
        const cached = peakCache.get(String(clientId));
        if (cached && Date.now() - cached.at < TTL_MS) {
          return res.json(cached.payload);
        }
        const payload = await computeRankflowWeeklyBestRankSpike(clientId);
        peakCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/rankflow/stats/peak]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
