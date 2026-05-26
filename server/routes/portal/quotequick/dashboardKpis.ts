/**
 * Portal QuoteQuick Dashboard KPIs — Wave 29.
 *
 * GET /api/portal/quotequick/dashboard-kpis
 *
 * Returns the hero KPIs for the QuoteQuick portal dashboard:
 *
 *   1. quotesSent          — total leads/quotes created in last 30 days +
 *                            12-week sparkline trend.
 *   2. avgDepositPaidRate  — % of sent quotes where a deposit was paid
 *                            (KpiGauge 0-100).
 *   3. revenueThisMonth    — $ collected via Stripe Connect (deposits).
 *   4. activeEmbeds        — { active, configured } embed sites for
 *                            ProgressRing.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clients, calculators, leads } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalQuotequickDashboardKpis");

interface DashboardResponse {
  previewMode?: boolean;
  kpis: {
    quotesSent: {
      thisMonth: number;
      lastMonth: number;
      deltaPct: number;
    };
    avgDepositPaidRate: number;
    revenueThisMonth: number;
    activeEmbeds: { active: number; configured: number };
  };
  velocityTrend12w: number[];
}

const EMPTY_RESPONSE = {
  previewMode: true,
  kpis: {
    quotesSent: { thisMonth: 0, lastMonth: 0, deltaPct: 0 },
    avgDepositPaidRate: 0,
    revenueThisMonth: 0,
    activeEmbeds: { active: 0, configured: 0 },
  },
  velocityTrend12w: [] as number[],
} satisfies Record<string, unknown>;

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function buildVelocityTrend(
  rows: Array<{ created_date: Date | null }>,
): number[] {
  const today = startOfDay(new Date());
  const weeks = new Array<number>(12).fill(0);
  for (const r of rows) {
    if (!r.created_date) continue;
    const diffDays = Math.floor(
      (today.getTime() - r.created_date.getTime()) / 86_400_000,
    );
    if (diffDays < 0 || diffDays >= 12 * 7) continue;
    const weekIdx = 11 - Math.floor(diffDays / 7);
    if (weekIdx >= 0 && weekIdx < 12) weeks[weekIdx]!++;
  }
  return weeks;
}

/**
 * Pure compute path so Copilot metricsContext can reuse it without Express.
 */
export async function computeQuotequickDashboardKpis(
  clientId: number,
): Promise<Omit<DashboardResponse, "previewMode">> {
  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);
  const sixtyAgo = new Date(now.getTime() - 60 * 86_400_000);
  const ninetyAgo = new Date(now.getTime() - 90 * 86_400_000);

  // Find the client's user_id to scope calculators.
  const [client] = await db
    .select({ user_id: clients.user_id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client?.user_id) {
    return {
      kpis: EMPTY_RESPONSE.kpis,
      velocityTrend12w: EMPTY_RESPONSE.velocityTrend12w,
    };
  }

  // All calculators owned by this client.
  const calcs = await db
    .select({
      id: calculators.id,
      slug: calculators.slug,
    })
    .from(calculators)
    .where(eq(calculators.user_id, client.user_id));

  const calcIds = calcs.map((c) => c.id);
  const configured = calcs.length;
  const active = calcs.filter((c) => c.slug !== null).length;

  if (calcIds.length === 0) {
    return {
      kpis: { ...EMPTY_RESPONSE.kpis, activeEmbeds: { active, configured } },
      velocityTrend12w: EMPTY_RESPONSE.velocityTrend12w,
    };
  }

  // Pull leads (= quotes sent) across all owned calculators in 90d.
  const leadsRows = await db
    .select({
      id: leads.id,
      created_date: leads.created_date,
      status: leads.status,
      quote_amount: leads.quote_amount,
    })
    .from(leads)
    .where(
      and(
        sql`${leads.calculator_id} IN (${sql.join(
          calcIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
        gte(leads.created_date, ninetyAgo),
      ),
    )
    .orderBy(desc(leads.created_date))
    .limit(2000);

  const thisMonthLeads = leadsRows.filter(
    (r) => r.created_date && r.created_date >= thirtyAgo,
  );
  const lastMonthLeads = leadsRows.filter(
    (r) =>
      r.created_date && r.created_date >= sixtyAgo && r.created_date < thirtyAgo,
  );
  const thisMonth = thisMonthLeads.length;
  const lastMonth = lastMonthLeads.length;
  const deltaPct =
    lastMonth > 0
      ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100)
      : thisMonth > 0
        ? 100
        : 0;

  // Deposit-paid conversion rate = leads.status === 'deposit_paid' / total sent.
  const depositPaidThisMonth = thisMonthLeads.filter(
    (r) => r.status === "deposit_paid" || r.status === "won",
  ).length;
  const avgDepositPaidRate =
    thisMonthLeads.length > 0
      ? Math.round((depositPaidThisMonth / thisMonthLeads.length) * 100)
      : 0;

  // Revenue this month = sum of quote_amount on deposit-paid leads (cents).
  const revenueThisMonth = thisMonthLeads
    .filter((r) => r.status === "deposit_paid" || r.status === "won")
    .reduce((sum, r) => sum + (r.quote_amount ?? 0), 0);

  const velocityTrend12w = buildVelocityTrend(
    leadsRows.map((r) => ({ created_date: r.created_date })),
  );

  return {
    kpis: {
      quotesSent: { thisMonth, lastMonth, deltaPct },
      avgDepositPaidRate,
      revenueThisMonth,
      activeEmbeds: { active, configured },
    },
    velocityTrend12w,
  };
}

export function registerPortalQuotequickDashboardKpisRoutes(app: Express) {
  app.get(
    "/api/portal/quotequick/dashboard-kpis",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const payload = await computeQuotequickDashboardKpis(clientId);
        res.json(payload);
      } catch (err: any) {
        log.error(
          "[portal/quotequick/dashboard-kpis]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
