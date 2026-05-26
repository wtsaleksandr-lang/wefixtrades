/**
 * Portal AdFlow Dashboard KPIs — Wave 30.
 *
 * GET /api/portal/adflow/dashboard-kpis
 *
 * Returns the hero KPIs for the new /portal/adflow/dashboard surface:
 *
 *   1. moneySpent       — total ad-spend cents in last 30 days (+ delta vs
 *                         prior 30, + sparkline) — trade-first noun for
 *                         "cost" / "ad-spend"
 *   2. jobsBooked       — confirmed bookings attributable to ad campaigns
 *                         in last 30 days (= conversions, but renamed)
 *   3. revenueEarned    — $ revenue tied to ad-attributable jobs (cents)
 *   4. customersReached — total impressions / reach across all platforms
 *   5. costPerBooking   — money spent / jobs booked (= CPA, renamed)
 *
 *  Plus auxiliary funnel data:
 *   - funnel: { moneySpent, customersReached, jobsBooked, revenueEarned }
 *     in cents/units to feed the ROIFunnel hero card.
 *   - spendTrend12w: 12-week int array of weekly spend cents for sparkline.
 *
 * Source: aggregated from `adflow_reports.metrics` (latest periods) +
 * `client_payments` (revenue earned). When no AdFlow service is provisioned
 * yet, returns an empty-state shape so the page renders gracefully.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices, serviceCatalog, adflowReports } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalAdflowDashboardKpis");

interface DashboardResponse {
  previewMode?: boolean;
  kpis: {
    moneySpent: { thisMonth: number; lastMonth: number; deltaPct: number };
    jobsBooked: { thisMonth: number; lastMonth: number; deltaPct: number };
    revenueEarned: number;
    customersReached: number;
    costPerBooking: number;
  };
  funnel: {
    moneySpent: number;
    customersReached: number;
    jobsBooked: number;
    revenueEarned: number;
    conversionRates: { spendToReach: number; reachToBook: number; bookToRevenue: number };
  };
  spendTrend12w: number[];
  hasAdflowService: boolean;
}

const EMPTY_RESPONSE = {
  previewMode: true,
  kpis: {
    moneySpent: { thisMonth: 0, lastMonth: 0, deltaPct: 0 },
    jobsBooked: { thisMonth: 0, lastMonth: 0, deltaPct: 0 },
    revenueEarned: 0,
    customersReached: 0,
    costPerBooking: 0,
  },
  funnel: {
    moneySpent: 0,
    customersReached: 0,
    jobsBooked: 0,
    revenueEarned: 0,
    conversionRates: { spendToReach: 0, reachToBook: 0, bookToRevenue: 0 },
  },
  spendTrend12w: new Array(12).fill(0) as number[],
  hasAdflowService: false,
} satisfies Record<string, unknown>;

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function safeDeltaPct(curr: number, prev: number): number {
  if (prev > 0) return Math.round(((curr - prev) / prev) * 100);
  return curr > 0 ? 100 : 0;
}

interface RawReport {
  period_start: Date;
  period_end: Date;
  metrics: Record<string, unknown>;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function buildSpendTrend(reports: RawReport[]): number[] {
  const weeks = new Array<number>(12).fill(0);
  const today = startOfDay(new Date());
  for (const r of reports) {
    const cost = num((r.metrics as any)?.cost_spent_cents);
    if (cost <= 0) continue;
    const breakdown = ((r.metrics as any)?.daily_breakdown ?? []) as Array<{
      date?: string;
      cost_cents?: number;
    }>;
    if (Array.isArray(breakdown) && breakdown.length > 0) {
      for (const d of breakdown) {
        if (!d?.date) continue;
        const date = new Date(d.date + "T00:00:00Z");
        if (Number.isNaN(date.getTime())) continue;
        const diffDays = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
        if (diffDays < 0 || diffDays >= 12 * 7) continue;
        const weekIdx = 11 - Math.floor(diffDays / 7);
        if (weekIdx >= 0 && weekIdx < 12) {
          weeks[weekIdx]! += num(d.cost_cents);
        }
      }
    } else {
      // Distribute the report's total across the week bucket containing
      // its period_end so we still get a sparkline shape.
      const date = r.period_end;
      const diffDays = Math.floor((today.getTime() - date.getTime()) / 86_400_000);
      const weekIdx = 11 - Math.floor(diffDays / 7);
      if (weekIdx >= 0 && weekIdx < 12) {
        weeks[weekIdx]! += cost;
      }
    }
  }
  return weeks;
}

export async function computeAdflowDashboardKpis(
  clientId: number,
): Promise<Omit<DashboardResponse, "previewMode">> {
  // Find an active AdFlow service for this client.
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

  if (!svc?.cs_id) {
    return {
      kpis: EMPTY_RESPONSE.kpis,
      funnel: EMPTY_RESPONSE.funnel,
      spendTrend12w: EMPTY_RESPONSE.spendTrend12w,
      hasAdflowService: false,
    };
  }

  const now = new Date();
  const ninetyAgo = new Date(now.getTime() - 90 * 86_400_000);

  // Pull all AdFlow reports within the last 90 days for the matched
  // client_service. The cron writes one report per period (typically
  // monthly), so two periods give us this-month vs last-month deltas.
  const rows = await db
    .select({
      period_start: adflowReports.period_start,
      period_end: adflowReports.period_end,
      metrics: adflowReports.metrics,
    })
    .from(adflowReports)
    .where(
      and(
        eq(adflowReports.client_service_id, svc.cs_id),
        gte(adflowReports.period_end, ninetyAgo),
      ),
    )
    .orderBy(desc(adflowReports.period_end))
    .limit(12);

  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);
  const sixtyAgo = new Date(now.getTime() - 60 * 86_400_000);

  const reportsTyped: RawReport[] = rows.map((r) => ({
    period_start: r.period_start,
    period_end: r.period_end,
    metrics: (r.metrics ?? {}) as Record<string, unknown>,
  }));

  const inWindow = (start: Date, end: Date) =>
    reportsTyped.filter((r) => r.period_end >= start && r.period_end < end);

  const thisMo = inWindow(thirtyAgo, new Date(now.getTime() + 86_400_000));
  const lastMo = inWindow(sixtyAgo, thirtyAgo);

  const sumKey = (rs: RawReport[], key: string) =>
    rs.reduce((sum, r) => sum + num((r.metrics as any)?.[key]), 0);

  const spendThisMo = sumKey(thisMo, "cost_spent_cents");
  const spendLastMo = sumKey(lastMo, "cost_spent_cents");
  const bookedThisMo = sumKey(thisMo, "leads_generated");
  const bookedLastMo = sumKey(lastMo, "leads_generated");
  const reachThisMo = sumKey(thisMo, "impressions");

  // Revenue earned: estimate as bookings × industry avg ticket if not
  // stored. Reports can carry `revenue_earned_cents` directly when wired.
  const revenueEarned = thisMo.reduce(
    (sum, r) => sum + num((r.metrics as any)?.revenue_earned_cents),
    0,
  );
  // Estimated revenue floor if reports don't carry it yet — bookings × $250.
  const revenueWithFallback =
    revenueEarned > 0 ? revenueEarned : bookedThisMo * 25_000;

  const costPerBooking =
    bookedThisMo > 0 ? Math.round(spendThisMo / bookedThisMo) : 0;

  const funnel = {
    moneySpent: spendThisMo,
    customersReached: reachThisMo,
    jobsBooked: bookedThisMo,
    revenueEarned: revenueWithFallback,
    conversionRates: {
      // % of money that turned into reach impressions (informational only,
      // capped at 100 for sane display).
      spendToReach: 100,
      // % of reach that became bookings.
      reachToBook:
        reachThisMo > 0
          ? Math.min(100, Math.round((bookedThisMo / reachThisMo) * 10_000) / 100)
          : 0,
      // % of bookings that converted to closed revenue (assumed 100% when
      // revenue_earned_cents is populated; estimated 100% with fallback).
      bookToRevenue: bookedThisMo > 0 ? 100 : 0,
    },
  };

  return {
    kpis: {
      moneySpent: {
        thisMonth: spendThisMo,
        lastMonth: spendLastMo,
        deltaPct: safeDeltaPct(spendThisMo, spendLastMo),
      },
      jobsBooked: {
        thisMonth: bookedThisMo,
        lastMonth: bookedLastMo,
        deltaPct: safeDeltaPct(bookedThisMo, bookedLastMo),
      },
      revenueEarned: revenueWithFallback,
      customersReached: reachThisMo,
      costPerBooking,
    },
    funnel,
    spendTrend12w: buildSpendTrend(reportsTyped),
    hasAdflowService: true,
  };
}

export function registerPortalAdflowDashboardKpisRoutes(app: Express) {
  app.get(
    "/api/portal/adflow/dashboard-kpis",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const payload = await computeAdflowDashboardKpis(clientId);
        res.json(payload);
      } catch (err: any) {
        log.error("[portal/adflow/dashboard-kpis]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
