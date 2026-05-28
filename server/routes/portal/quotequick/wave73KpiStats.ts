/**
 * Portal QuoteQuick — Wave 73 KPI stat endpoints.
 *
 *   GET /api/portal/quotequick/stats/score?type=conversion       — SemiGauge
 *   GET /api/portal/quotequick/stats/peak?metric=best_revenue    — SparklineWithPeak
 *   GET /api/portal/quotequick/stats/monthly?months=6            — MonthlyBarSeries
 *   GET /api/portal/quotequick/stats/comparison?metric=views_vs_completions — BarComparisonCard
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clients, calculators, leads, calculatorAnalyticsDaily } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalQuotequickWave73KpiStats");

const TTL_MS = 5 * 60_000;
type Cached<T> = { at: number; payload: T };

interface ScoreResponse {
  value: number;
  verdict: string;
  advice: string;
  data_status: "real" | "illustrative";
}
interface PeakSeriesResponse {
  data: number[];
  peakLabel: string;
  peakIndex: number;
  data_status: "real" | "illustrative";
}
interface MonthlySeriesResponse {
  data: Array<{ label: string; value: number; highlighted?: boolean }>;
  data_status: "real" | "illustrative";
}
interface ComparisonResponse {
  data: Array<{ label: string; value: number }>;
  data_status: "real" | "illustrative";
}

const scoreCache = new Map<string, Cached<ScoreResponse>>();
const peakCache = new Map<string, Cached<PeakSeriesResponse>>();
const monthlyCache = new Map<string, Cached<MonthlySeriesResponse>>();
const comparisonCache = new Map<string, Cached<ComparisonResponse>>();

const EMPTY_SCORE: ScoreResponse = {
  value: 0,
  verdict: "Below average",
  advice: "Add a calculator to start tracking conversion.",
  data_status: "illustrative",
};
const EMPTY_PEAK: PeakSeriesResponse = {
  data: [],
  peakLabel: "",
  peakIndex: 0,
  data_status: "illustrative",
};
const EMPTY_MONTHLY: MonthlySeriesResponse = { data: [], data_status: "illustrative" };
const EMPTY_COMPARISON: ComparisonResponse = { data: [], data_status: "illustrative" };

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

async function calcIdsForClient(clientId: number): Promise<number[]> {
  const [client] = await db
    .select({ user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client?.user_id) return [];
  const calcs = await db
    .select({ id: calculators.id })
    .from(calculators)
    .where(eq(calculators.user_id, client.user_id));
  return calcs.map((c) => c.id);
}

export async function computeQuotequickConversionRate(
  clientId: number,
): Promise<ScoreResponse> {
  const calcIds = await calcIdsForClient(clientId);
  if (calcIds.length === 0) {
    return {
      value: 12,
      verdict: "Average conversion",
      advice: "Add a calculator to start tracking conversion.",
      data_status: "illustrative",
    };
  }

  const today = new Date();
  const thirtyAgo = new Date(today.getTime() - 30 * 86_400_000);
  const thirtyAgoIso = thirtyAgo.toISOString().slice(0, 10);

  const rows = await db
    .select({
      views: calculatorAnalyticsDaily.views,
      completions: calculatorAnalyticsDaily.completions,
    })
    .from(calculatorAnalyticsDaily)
    .where(
      and(
        inArray(calculatorAnalyticsDaily.calculator_id, calcIds),
        sql`${calculatorAnalyticsDaily.date} >= ${thirtyAgoIso}`,
      ),
    );

  const totalViews = rows.reduce((s, r) => s + (r.views ?? 0), 0);
  const totalCompletions = rows.reduce((s, r) => s + (r.completions ?? 0), 0);

  if (totalViews === 0) {
    return {
      value: 12,
      verdict: "Average conversion",
      advice: "Drive more traffic to your calculator to measure conversion.",
      data_status: "illustrative",
    };
  }

  const value = Math.round((totalCompletions / totalViews) * 100);
  const verdict =
    value >= 15 ? "Strong conversion"
      : value >= 8 ? "Average conversion"
        : "Below average";
  const advice =
    value >= 15
      ? "Your widget is converting well — keep nurturing repeat visitors."
      : value >= 8
        ? "Try a shorter form or social-proof badge to push above 15%."
        : "Run an A/B test on the first question — drop-off is highest there.";

  return { value, verdict, advice, data_status: "real" };
}

export async function computeQuotequickBestRevenueDay(
  clientId: number,
): Promise<PeakSeriesResponse> {
  const calcIds = await calcIdsForClient(clientId);
  if (calcIds.length === 0) {
    const synthetic = [200, 350, 280, 420, 380, 540, 480, 620, 700, 580, 660, 720, 800, 750];
    const peakIndex = synthetic.indexOf(Math.max(...synthetic));
    return {
      data: synthetic,
      peakLabel: `$${Math.max(...synthetic).toLocaleString()} peak day`,
      peakIndex,
      data_status: "illustrative",
    };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const fourteenAgo = new Date(today.getTime() - 14 * 86_400_000);

  const rows = await db
    .select({
      created_date: leads.created_date,
      quote_amount: leads.quote_amount,
      status: leads.status,
    })
    .from(leads)
    .where(
      and(
        inArray(leads.calculator_id, calcIds),
        gte(leads.created_date, fourteenAgo),
      ),
    );

  const buckets = new Array<number>(14).fill(0);
  for (const r of rows) {
    if (!r.created_date) continue;
    const isWon = r.status === "deposit_paid" || r.status === "won";
    if (!isWon) continue;
    const diff = Math.floor((today.getTime() - r.created_date.getTime()) / 86_400_000);
    if (diff >= 0 && diff < 14) {
      buckets[13 - diff]! += Math.round((r.quote_amount ?? 0) / 100);
    }
  }
  const anyData = buckets.some((v) => v > 0);
  if (!anyData) {
    const synthetic = [200, 350, 280, 420, 380, 540, 480, 620, 700, 580, 660, 720, 800, 750];
    const peakIndex = synthetic.indexOf(Math.max(...synthetic));
    return {
      data: synthetic,
      peakLabel: `$${Math.max(...synthetic).toLocaleString()} peak day`,
      peakIndex,
      data_status: "illustrative",
    };
  }
  const peakValue = Math.max(...buckets);
  const peakIndex = buckets.indexOf(peakValue);
  return {
    data: buckets,
    peakLabel: `$${peakValue.toLocaleString()} peak day`,
    peakIndex,
    data_status: "real",
  };
}

export async function computeQuotequickMonthlyQuotes(
  clientId: number,
  months: number,
): Promise<MonthlySeriesResponse> {
  const calcIds = await calcIdsForClient(clientId);
  const labels = monthLabels(months);
  if (calcIds.length === 0) {
    return {
      data: labels.map((m, i) => ({
        label: m.label,
        value: Math.round(5 + i * 1.5),
        highlighted: i === labels.length - 1,
      })),
      data_status: "illustrative",
    };
  }

  const periodStart = labels[0]!.start;
  const rows = await db
    .select({
      created_date: leads.created_date,
    })
    .from(leads)
    .where(
      and(
        inArray(leads.calculator_id, calcIds),
        gte(leads.created_date, periodStart),
      ),
    );

  const data = labels.map((m, idx) => {
    const count = rows.filter(
      (r) => r.created_date && r.created_date >= m.start && r.created_date < m.end,
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
        value: Math.round(5 + i * 1.5),
        highlighted: i === labels.length - 1,
      })),
      data_status: "illustrative",
    };
  }
  return { data, data_status: "real" };
}

export async function computeQuotequickViewsVsCompletions(
  clientId: number,
): Promise<ComparisonResponse> {
  const calcIds = await calcIdsForClient(clientId);
  if (calcIds.length === 0) {
    return {
      data: [
        { label: "Views", value: 500 },
        { label: "Completions", value: 60 },
      ],
      data_status: "illustrative",
    };
  }

  const today = new Date();
  const thirtyAgo = new Date(today.getTime() - 30 * 86_400_000);
  const thirtyAgoIso = thirtyAgo.toISOString().slice(0, 10);

  const rows = await db
    .select({
      views: calculatorAnalyticsDaily.views,
      completions: calculatorAnalyticsDaily.completions,
    })
    .from(calculatorAnalyticsDaily)
    .where(
      and(
        inArray(calculatorAnalyticsDaily.calculator_id, calcIds),
        sql`${calculatorAnalyticsDaily.date} >= ${thirtyAgoIso}`,
      ),
    );

  const totalViews = rows.reduce((s, r) => s + (r.views ?? 0), 0);
  const totalCompletions = rows.reduce((s, r) => s + (r.completions ?? 0), 0);

  if (totalViews === 0 && totalCompletions === 0) {
    return {
      data: [
        { label: "Views", value: 500 },
        { label: "Completions", value: 60 },
      ],
      data_status: "illustrative",
    };
  }
  return {
    data: [
      { label: "Views", value: totalViews },
      { label: "Completions", value: totalCompletions },
    ],
    data_status: "real",
  };
}

export function registerPortalQuotequickWave73KpiStatsRoutes(app: Express) {
  app.get(
    "/api/portal/quotequick/stats/score",
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
        const payload = await computeQuotequickConversionRate(clientId);
        scoreCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/quotequick/stats/score]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/quotequick/stats/peak",
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
        const payload = await computeQuotequickBestRevenueDay(clientId);
        peakCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/quotequick/stats/peak]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/quotequick/stats/monthly",
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
        const payload = await computeQuotequickMonthlyQuotes(clientId, months);
        monthlyCache.set(cacheKey, { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/quotequick/stats/monthly]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/quotequick/stats/comparison",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_COMPARISON as unknown as Record<string, unknown>,
        });
        if (clientId === null) return;
        const cached = comparisonCache.get(String(clientId));
        if (cached && Date.now() - cached.at < TTL_MS) {
          return res.json(cached.payload);
        }
        const payload = await computeQuotequickViewsVsCompletions(clientId);
        comparisonCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error(
          "[portal/quotequick/stats/comparison]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
