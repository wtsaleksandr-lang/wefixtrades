/**
 * Portal AdFlow — KPI stat endpoints.
 *
 *   GET /api/portal/adflow/stats/monthly?months=6        — MonthlyBarSeries
 *   GET /api/portal/adflow/stats/peak?metric=roas        — SparklineWithPeak
 *   GET /api/portal/adflow/stats/segments?dimension=platform — DonutChart
 *
 * HONESTY CONTRACT (guarded by server/services/aiActions/handlers/adflow.test.ts)
 * ──────────────────────────────────────────────────────────────────────────────
 * Every series here is either the ads team's reported figures or nothing.
 * `data_status: 'empty'` means the customer's dashboard shows an empty state.
 * There is no third state where we draw a shape we made up.
 *
 * DELETED, and must not come back (see the guard):
 *
 *   - `[3, 4, 6, 5, 8, 9, 11, 14, 12, 10, 11, 13]`, returned from BOTH the
 *     no-service branch and the no-data branch of the peak series, labelled
 *     "+11x ROAS". Every AdFlow customer without revenue data — which is all of
 *     them, since revenue was never captured — saw the same rising curve and
 *     the same 11x return. It was permanent, not a placeholder.
 *
 *   - `Google 1800 / Meta 1100 / Bing 400`, likewise returned from both the
 *     no-service and no-data branches of the spend-by-platform donut. A fixed
 *     $3,300 split across three platforms, shown to customers who may not be
 *     running on any of them.
 *
 *   - `Math.round(4 + i * 1.2)` monthly bars — a straight synthetic ramp.
 *
 *   - `value: leads * 2` on the REAL monthly series. Reported leads were
 *     doubled before display to "match Wave 72 derived leads ≈ jobs × 2". The
 *     number on the chart was twice the number the ads team reported.
 *
 * `data_status` keeps its 'real' | 'illustrative' union for wire compatibility
 * with the shared KPI components, but 'illustrative' is now only ever returned
 * alongside an EMPTY data array.
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

/** The only non-'real' payload any handler may return: nothing to draw. */
const EMPTY_MONTHLY: MonthlySeriesResponse = { data: [], data_status: "illustrative" };
const EMPTY_PEAK: PeakSeriesResponse = {
  data: [],
  peakLabel: "",
  peakIndex: 0,
  data_status: "illustrative",
};
const EMPTY_SEGMENTS: SegmentResponse = { data: [], data_status: "illustrative" };

/** Null, not 0, when a reported field is absent — see dashboardKpis.ts. */
function reportedNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

/* ◀◀◀ Leads reported per month — verbatim, no multiplier ◀◀◀◀◀◀◀◀◀◀◀◀◀◀ */
export async function computeAdflowMonthlySeries(
  clientId: number,
  months: number,
): Promise<MonthlySeriesResponse> {
  const csId = await findAdflowClientServiceId(clientId);
  if (csId === null) return EMPTY_MONTHLY;

  const labels = monthLabels(months);
  const periodStart = labels[0]!.start;
  const rows = await db
    .select({
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

  if (rows.length === 0) return EMPTY_MONTHLY;

  let anyReported = false;
  const data = labels.map((m, idx) => {
    const inBucket = rows.filter(
      (r) => r.period_end >= m.start && r.period_end < m.end,
    );
    let leads = 0;
    for (const r of inBucket) {
      const v = reportedNum((r.metrics as Record<string, unknown>)?.leads_generated);
      if (v !== null) {
        leads += v;
        anyReported = true;
      }
    }
    return {
      label: m.label,
      value: leads,
      highlighted: idx === labels.length - 1,
    };
  });

  // Months with no report stay at 0 within a series that has real months —
  // that reads correctly as "nothing reported". A series where NOTHING was
  // reported is empty, not a flat line of zeroes presented as performance.
  return anyReported ? { data, data_status: "real" } : EMPTY_MONTHLY;
}

/* ◀◀◀ Weekly reported revenue − spend, 12 weeks ◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀ */
export async function computeAdflowPeakSeries(
  clientId: number,
): Promise<PeakSeriesResponse> {
  const csId = await findAdflowClientServiceId(clientId);
  if (csId === null) return EMPTY_PEAK;

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

  // Only a day-by-day breakdown carrying BOTH revenue and cost can be bucketed
  // into weeks. A month total has no weekly shape; the old code dropped it into
  // whichever bucket held its period_end, drawing a month as a one-week spike.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const weeks = new Array<number>(12).fill(0);
  let sawDailyRow = false;

  for (const r of rows) {
    const breakdown = ((r.metrics as Record<string, unknown>)?.daily_breakdown ??
      []) as Array<{ date?: string; cost_cents?: number; revenue_cents?: number }>;
    if (!Array.isArray(breakdown)) continue;
    for (const d of breakdown) {
      if (!d?.date) continue;
      const revenue = reportedNum(d.revenue_cents);
      const cost = reportedNum(d.cost_cents);
      if (revenue === null && cost === null) continue;
      const date = new Date(d.date + "T00:00:00Z");
      if (Number.isNaN(date.getTime())) continue;
      const diff = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
      if (diff < 0 || diff >= 12 * 7) continue;
      const idx = 11 - Math.floor(diff / 7);
      if (idx < 0 || idx >= 12) continue;
      weeks[idx]! += ((revenue ?? 0) - (cost ?? 0)) / 100;
      sawDailyRow = true;
    }
  }

  if (!sawDailyRow) return EMPTY_PEAK;

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

/* ◀◀◀ Reported spend by platform ◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀◀ */
export async function computeAdflowSpendByPlatform(
  clientId: number,
): Promise<SegmentResponse> {
  const csId = await findAdflowClientServiceId(clientId);
  if (csId === null) return EMPTY_SEGMENTS;

  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);

  const rows = await db
    .select({ metrics: adflowReports.metrics })
    .from(adflowReports)
    .where(
      and(
        eq(adflowReports.client_service_id, csId),
        gte(adflowReports.period_end, thirtyAgo),
      ),
    )
    .limit(4);

  // `by_platform` is populated only when the ads team reports a per-platform
  // split. Absent it, the split is unknown — and unknown renders as empty.
  const totals = new Map<string, number>();
  for (const r of rows) {
    const platforms = ((r.metrics as Record<string, unknown>)?.by_platform ?? {}) as Record<
      string,
      { spend_cents?: number }
    >;
    for (const [platform, v] of Object.entries(platforms)) {
      const cents = reportedNum((v as { spend_cents?: number })?.spend_cents);
      if (cents !== null && cents > 0) {
        totals.set(platform, (totals.get(platform) ?? 0) + Math.round(cents / 100));
      }
    }
  }

  if (totals.size === 0) return EMPTY_SEGMENTS;

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
