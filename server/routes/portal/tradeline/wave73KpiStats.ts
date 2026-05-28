/**
 * Portal TradeLine — Wave 73 KPI stat endpoints.
 *
 *   GET /api/portal/tradeline/stats/score?type=csat           — SemiGauge
 *   GET /api/portal/tradeline/stats/peak?metric=peak_call_hour — SparklineWithPeak (24-hour series)
 *   GET /api/portal/tradeline/stats/monthly?months=6           — MonthlyBarSeries
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices } from "@shared/schema";
import { tradelineCallLog } from "@shared/schemas/adminCrm";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalTradelineWave73KpiStats");

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

const scoreCache = new Map<string, Cached<ScoreResponse>>();
const peakCache = new Map<string, Cached<PeakSeriesResponse>>();
const monthlyCache = new Map<string, Cached<MonthlySeriesResponse>>();

const EMPTY_SCORE: ScoreResponse = {
  value: 0,
  verdict: "Needs attention",
  advice: "Set up TradeLine call routing to start collecting CSAT data.",
  data_status: "illustrative",
};
const EMPTY_PEAK: PeakSeriesResponse = {
  data: [],
  peakLabel: "",
  peakIndex: 0,
  data_status: "illustrative",
};
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

async function tradelineCsIds(clientId: number): Promise<number[]> {
  const rows = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${clientServices.service_id} LIKE 'tradeline%'`,
      ),
    );
  return rows.map((r) => r.id);
}

export async function computeTradelineCsat(
  clientId: number,
): Promise<ScoreResponse> {
  const csIds = await tradelineCsIds(clientId);
  if (csIds.length === 0) {
    return {
      value: 70,
      verdict: "Good, room to improve",
      advice: "Set up TradeLine call routing to start measuring CSAT.",
      data_status: "illustrative",
    };
  }

  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);
  const csInList = sql`${tradelineCallLog.client_service_id} IN (${sql.join(
    csIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;

  const rows = await db
    .select({
      n: sql<number>`count(*)::int`,
      answered: sql<number>`count(*) FILTER (WHERE outcome IN ('answered','transferred'))::int`,
      booked: sql<number>`count(*) FILTER (WHERE (transcript_json->>'booking_created' = 'true' OR summary ILIKE '%booked%' OR summary ILIKE '%appointment%'))::int`,
    })
    .from(tradelineCallLog)
    .where(
      and(
        csInList,
        gte(tradelineCallLog.created_at, thirtyAgo),
      ),
    );

  const calls = Number(rows[0]?.n ?? 0);
  const answered = Number(rows[0]?.answered ?? 0);
  const booked = Number(rows[0]?.booked ?? 0);

  if (calls === 0) {
    return {
      value: 70,
      verdict: "Good, room to improve",
      advice: "Drive more calls to TradeLine to start measuring CSAT.",
      data_status: "illustrative",
    };
  }

  const answeredShare = (answered / calls) * 100;
  const bookingBonus = Math.min(20, booked * 0.6);
  const value = Math.round(Math.min(100, Math.max(0, answeredShare * 0.85 + bookingBonus)));
  const verdict =
    value >= 80 ? "Excellent" : value >= 50 ? "Good, room to improve" : "Needs attention";
  const advice =
    value >= 80
      ? "Customers are happy — keep response times tight."
      : value >= 50
        ? "Focus on faster pickup times to push above 80."
        : "Many calls are going unanswered — review staffing and AI escalation rules.";

  return { value, verdict, advice, data_status: "real" };
}

export async function computeTradelinePeakCallHour(
  clientId: number,
): Promise<PeakSeriesResponse> {
  const csIds = await tradelineCsIds(clientId);
  if (csIds.length === 0) {
    const synthetic = [
      1, 0, 0, 0, 0, 1, 3, 5, 7, 9, 10, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 1, 1,
    ];
    const peakIndex = synthetic.indexOf(Math.max(...synthetic));
    return {
      data: synthetic,
      peakLabel: `Peak hour: ${peakIndex}:00`,
      peakIndex,
      data_status: "illustrative",
    };
  }

  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);
  const csInList = sql`${tradelineCallLog.client_service_id} IN (${sql.join(
    csIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;

  const rows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM created_at)::int`,
      n: sql<number>`count(*)::int`,
    })
    .from(tradelineCallLog)
    .where(
      and(
        csInList,
        gte(tradelineCallLog.created_at, thirtyAgo),
      ),
    )
    .groupBy(sql`EXTRACT(HOUR FROM created_at)`);

  const buckets = new Array<number>(24).fill(0);
  let any = false;
  for (const r of rows) {
    const h = Number(r.hour) || 0;
    const n = Number(r.n) || 0;
    if (h >= 0 && h < 24) {
      buckets[h] = n;
      if (n > 0) any = true;
    }
  }

  if (!any) {
    const synthetic = [
      1, 0, 0, 0, 0, 1, 3, 5, 7, 9, 10, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 1, 1,
    ];
    const peakIndex = synthetic.indexOf(Math.max(...synthetic));
    return {
      data: synthetic,
      peakLabel: `Peak hour: ${peakIndex}:00`,
      peakIndex,
      data_status: "illustrative",
    };
  }
  const peakValue = Math.max(...buckets);
  const peakIndex = buckets.indexOf(peakValue);
  return {
    data: buckets,
    peakLabel: `Peak hour: ${peakIndex}:00`,
    peakIndex,
    data_status: "real",
  };
}

export async function computeTradelineMonthlyCalls(
  clientId: number,
  months: number,
): Promise<MonthlySeriesResponse> {
  const csIds = await tradelineCsIds(clientId);
  const labels = monthLabels(months);
  if (csIds.length === 0) {
    return {
      data: labels.map((m, i) => ({
        label: m.label,
        value: Math.round(15 + i * 4),
        highlighted: i === labels.length - 1,
      })),
      data_status: "illustrative",
    };
  }

  const periodStart = labels[0]!.start;
  const csInList = sql`${tradelineCallLog.client_service_id} IN (${sql.join(
    csIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;

  const rows = await db
    .select({
      created_at: tradelineCallLog.created_at,
    })
    .from(tradelineCallLog)
    .where(
      and(
        csInList,
        gte(tradelineCallLog.created_at, periodStart),
      ),
    );

  const data = labels.map((m, idx) => {
    const count = rows.filter(
      (r) => r.created_at && r.created_at >= m.start && r.created_at < m.end,
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
        value: Math.round(15 + i * 4),
        highlighted: i === labels.length - 1,
      })),
      data_status: "illustrative",
    };
  }
  return { data, data_status: "real" };
}

export function registerPortalTradelineWave73KpiStatsRoutes(app: Express) {
  app.get(
    "/api/portal/tradeline/stats/score",
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
        const payload = await computeTradelineCsat(clientId);
        scoreCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/tradeline/stats/score]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/tradeline/stats/peak",
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
        const payload = await computeTradelinePeakCallHour(clientId);
        peakCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/tradeline/stats/peak]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/tradeline/stats/monthly",
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
        const payload = await computeTradelineMonthlyCalls(clientId, months);
        monthlyCache.set(cacheKey, { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/tradeline/stats/monthly]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
