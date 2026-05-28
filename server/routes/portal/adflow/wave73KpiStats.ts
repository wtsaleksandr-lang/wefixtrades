/**
 * Portal AdFlow — Wave 73 KPI stat endpoints.
 *
 * Wires the new KPI cards added in Wave 72 to real data, replacing the
 * client-side mock derivations. One file per product, one route per card.
 *
 *   GET /api/portal/adflow/stats/monthly?months=6        — MonthlyBarSeries
 *   GET /api/portal/adflow/stats/peak?metric=roas        — SparklineWithPeak
 *   GET /api/portal/adflow/stats/segments?dimension=platform — DonutChart
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 *
 * Data status flag on every response:
 *   data_status: 'real' | 'illustrative'
 *   - 'real'         : query backed by source rows
 *   - 'illustrative' : no rows yet; UI should show "Example data" badge
 *
 * Cache: each handler maintains an in-memory 5-min TTL keyed by clientId.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices, serviceCatalog, adflowReports } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalAdflowWave73KpiStats");

const TTL_MS = 5 * 60_000; // 5 minutes
type Cached<T> = { at: number; payload: T };
const monthlyCache = new Map<string, Cached<MonthlySeriesResponse>>();
const peakCache = new Map<string, Cached<PeakSeriesResponse>>();
const segmentsCache = new Map<string, Cached<SegmentResponse>>();

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

interface SegmentResponse {
  data: Array<{ label: string; value: number; color?: string }>;
  data_status: "real" | "illustrative";
}

const EMPTY_MONTHLY: MonthlySeriesResponse = { data: [], data_status: "illustrative" };
const EMPTY_PEAK: PeakSeriesResponse = {
  data: [],
  peakLabel: "",
  peakIndex: 0,
  data_status: "illustrative",
};
const EMPTY_SEGMENTS: SegmentResponse = { data: [], data_status: "illustrative" };

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

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

async function findAdflowClientServiceId(clientId: number): Promise<number | null> {
  const [svc] = await db
    .select({ cs_id: clientServices.id })
    .from(clientServices)
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${serviceCatalog.id} LIKE 'adflow%'`,
        sql`${clientServices.status} IN ('active', 'onboarding')`,
      ),
    )
    .limit(1);
  return svc?.cs_id ?? null;
}

/* ◀◀◀ Monthly leads (jobs booked × 2 derived from adflow_reports) ◀◀◀◀ */
export async function computeAdflowMonthlySeries(
  clientId: number,
  months: number,
): Promise<MonthlySeriesResponse> {
  const csId = await findAdflowClientServiceId(clientId);
  const labels = monthLabels(months);

  if (csId === null) {
    return {
      data: labels.map((m, i) => ({
        label: m.label,
        value: Math.round(4 + i * 1.2),
        highlighted: i === labels.length - 1,
      })),
      data_status: "illustrative",
    };
  }

  const periodStart = labels[0]!.start;
  const rows = await db
    .select({
      period_start: adflowReports.period_start,
      period_end: adflowReports.period_end,
      metrics: adflowReports.metrics,
    })
    .from(adflowReports)
    .where(
      and(
        eq(adflowReports.client_service_id, csId),
        gte(adflowReports.period_end, periodStart),
      ),
    )
    .orderBy(desc(adflowReports.period_end))
    .limit(months + 2);

  let anyRows = false;
  const data = labels.map((m, idx) => {
    const inBucket = rows.filter(
      (r) => r.period_end >= m.start && r.period_end < m.end,
    );
    if (inBucket.length > 0) anyRows = true;
    const leads = inBucket.reduce(
      (sum, r) => sum + num((r.metrics as Record<string, unknown>)?.leads_generated),
      0,
    );
    return {
      label: m.label,
      value: leads * 2, // matches Wave 72 derived leads ≈ jobs × 2
      highlighted: idx === labels.length - 1,
    };
  });

  return {
    data,
    data_status: anyRows ? "real" : "illustrative",
  };
}

/* ◀◀◀ Peak ROAS day — sparkline from last 12 weekly spend deltas ◀◀◀◀◀◀ */
export async function computeAdflowPeakSeries(
  clientId: number,
): Promise<PeakSeriesResponse> {
  const csId = await findAdflowClientServiceId(clientId);

  if (csId === null) {
    const synthetic = [3, 4, 6, 5, 8, 9, 11, 14, 12, 10, 11, 13];
    const peakIndex = synthetic.indexOf(Math.max(...synthetic));
    return {
      data: synthetic,
      peakLabel: `+${Math.max(...synthetic) - synthetic[0]!}x ROAS`,
      peakIndex,
      data_status: "illustrative",
    };
  }

  const now = new Date();
  const ninetyAgo = new Date(now.getTime() - 90 * 86_400_000);

  const rows = await db
    .select({
      period_end: adflowReports.period_end,
      metrics: adflowReports.metrics,
    })
    .from(adflowReports)
    .where(
      and(
        eq(adflowReports.client_service_id, csId),
        gte(adflowReports.period_end, ninetyAgo),
      ),
    )
    .orderBy(desc(adflowReports.period_end))
    .limit(12);

  // Build 12 weekly buckets of (revenue - spend) as a coarse ROAS proxy.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const weeks = new Array<number>(12).fill(0);
  for (const r of rows) {
    const spend = num((r.metrics as Record<string, unknown>)?.cost_spent_cents) / 100;
    const revenue =
      num((r.metrics as Record<string, unknown>)?.revenue_earned_cents) / 100;
    const breakdown = ((r.metrics as Record<string, unknown>)?.daily_breakdown ??
      []) as Array<{ date?: string; cost_cents?: number; revenue_cents?: number }>;
    if (Array.isArray(breakdown) && breakdown.length > 0) {
      for (const d of breakdown) {
        if (!d?.date) continue;
        const date = new Date(d.date + "T00:00:00Z");
        if (Number.isNaN(date.getTime())) continue;
        const diff = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
        if (diff < 0 || diff >= 12 * 7) continue;
        const idx = 11 - Math.floor(diff / 7);
        if (idx >= 0 && idx < 12) {
          weeks[idx]! += (num(d.revenue_cents) - num(d.cost_cents)) / 100;
        }
      }
    } else {
      const diff = Math.floor((today.getTime() - r.period_end.getTime()) / 86_400_000);
      const idx = 11 - Math.floor(diff / 7);
      if (idx >= 0 && idx < 12) {
        weeks[idx]! += revenue - spend;
      }
    }
  }

  const anyData = weeks.some((v) => v !== 0);
  if (!anyData) {
    const synthetic = [3, 4, 6, 5, 8, 9, 11, 14, 12, 10, 11, 13];
    const peakIndex = synthetic.indexOf(Math.max(...synthetic));
    return {
      data: synthetic,
      peakLabel: `+${Math.max(...synthetic) - synthetic[0]!}x ROAS`,
      peakIndex,
      data_status: "illustrative",
    };
  }

  const integerWeeks = weeks.map((v) => Math.round(v));
  const peakValue = Math.max(...integerWeeks);
  const peakIndex = integerWeeks.indexOf(peakValue);
  return {
    data: integerWeeks,
    peakLabel: `$${peakValue.toLocaleString()} peak`,
    peakIndex,
    data_status: "real",
  };
}

/* ◀◀◀ Spend by platform — GROUP BY platform on metrics.daily_breakdown ◀◀ */
export async function computeAdflowSpendByPlatform(
  clientId: number,
): Promise<SegmentResponse> {
  const csId = await findAdflowClientServiceId(clientId);

  if (csId === null) {
    return {
      data: [
        { label: "Google", value: 1800 },
        { label: "Meta", value: 1100 },
        { label: "Bing", value: 400 },
      ],
      data_status: "illustrative",
    };
  }

  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);

  const rows = await db
    .select({
      metrics: adflowReports.metrics,
    })
    .from(adflowReports)
    .where(
      and(
        eq(adflowReports.client_service_id, csId),
        gte(adflowReports.period_end, thirtyAgo),
      ),
    )
    .limit(4);

  const totals = new Map<string, number>();
  for (const r of rows) {
    const platforms = ((r.metrics as Record<string, unknown>)?.by_platform ?? {}) as Record<
      string,
      { spend_cents?: number }
    >;
    for (const [platform, v] of Object.entries(platforms)) {
      const cents = num((v as { spend_cents?: number })?.spend_cents);
      if (cents > 0) {
        totals.set(platform, (totals.get(platform) ?? 0) + Math.round(cents / 100));
      }
    }
  }

  if (totals.size === 0) {
    return {
      data: [
        { label: "Google", value: 1800 },
        { label: "Meta", value: 1100 },
        { label: "Bing", value: 400 },
      ],
      data_status: "illustrative",
    };
  }

  const data = Array.from(totals.entries()).map(([platform, value]) => ({
    label: platform.charAt(0).toUpperCase() + platform.slice(1),
    value,
  }));
  return { data, data_status: "real" };
}

export function registerPortalAdflowWave73KpiStatsRoutes(app: Express) {
  app.get(
    "/api/portal/adflow/stats/monthly",
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
        const payload = await computeAdflowMonthlySeries(clientId, months);
        monthlyCache.set(cacheKey, { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/adflow/stats/monthly]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/adflow/stats/peak",
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
        const payload = await computeAdflowPeakSeries(clientId);
        peakCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/adflow/stats/peak]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  app.get(
    "/api/portal/adflow/stats/segments",
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
        const payload = await computeAdflowSpendByPlatform(clientId);
        segmentsCache.set(String(clientId), { at: Date.now(), payload });
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/adflow/stats/segments]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
