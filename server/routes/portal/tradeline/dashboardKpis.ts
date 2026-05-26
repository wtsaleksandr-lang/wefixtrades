/**
 * Portal TradeLine Dashboard KPIs — Wave 26.
 *
 * GET /api/portal/tradeline/dashboard-kpis
 *
 * Single round-trip for the new TradeLine dashboard hero KPIs:
 *  - callsToday          — tradeline_call_log rows for the client's
 *                          tradeline client_services where created_at is
 *                          inside the local-day window
 *  - callsYesterday      — same metric for the prior day (used by the
 *                          AnimatedCounter deltaIndicator)
 *  - callsSameTimeLastWeek
 *                        — calls 7d ago up to "now" within that day; lets
 *                          the dashboard compare pace ("at this point last
 *                          week you'd had X")
 *  - answeredToday       — outcome IN ('answered','transferred') today
 *  - missedToday         — outcome IN ('missed','voicemail','failed') today
 *  - monthSubscriptionCost
 *                        — derived from active tradeline tier subscriptions
 *                          (best-effort; surfaces 0 if no SKU price metadata)
 *  - bookingsThisMonth   — best-effort booking count for the customer's
 *                          tradeline calls (joined via tradeline_call_log
 *                          summary heuristics — see notes below)
 *  - costPerBooking      — monthSubscriptionCost / bookingsThisMonth
 *
 * Auth: requireClient. adminPreviewSafe-wrapped so admin preview returns
 * `{previewMode:true, …zeros}` instead of 403.
 *
 * Notes:
 *  - The booking count uses a heuristic against `summary` because TradeLine
 *    does not (yet) persist a direct call→booking foreign key. When the
 *    Voice agent logs a "booking_created" outcome to the JSON summary, we
 *    count it. The dashboard treats this number as best-effort and the
 *    funnel route exposes the raw counts so the UI can surface "empty"
 *    states when nothing's been booked yet.
 *  - Keep this endpoint fast — no Vapi network calls. Only DB.
 */

import type { Express, Request, Response } from "express";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { clientServices } from "@shared/schema";
import { tradelineCallLog } from "@shared/schemas/adminCrm";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalTradelineDashboardKpis");

const EMPTY_KPIS = {
  callsToday: 0,
  callsYesterday: 0,
  callsSameTimeLastWeek: 0,
  answeredToday: 0,
  missedToday: 0,
  monthSubscriptionCost: 0,
  bookingsThisMonth: 0,
  costPerBooking: 0,
  avgJobValue: 0,
  estimatedMissedRevenue: 0,
};

const EMPTY_DASHBOARD_RESPONSE = {
  previewMode: true,
  kpis: EMPTY_KPIS,
};

function startOfDay(d = new Date()): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Wave 26.6 — pure compute path for the TradeLine dashboard KPIs. Extracted
 * from the route handler so the Copilot metricsContext can reuse it.
 *
 * Returns `{ kpis, empty? }` matching the route shape.
 */
export async function computeTradelineDashboardKpis(clientId: number): Promise<
  { kpis: typeof EMPTY_KPIS; empty?: boolean }
> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const monthStart = startOfMonth(now);

  const lastWeekStart = new Date(now);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekDayStart = startOfDay(lastWeekStart);

  const csRows = await db
    .select({ id: clientServices.id })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${clientServices.service_id} LIKE 'tradeline%'`,
      ),
    );

  const csIds = csRows.map((r) => r.id);

  if (csIds.length === 0) {
    return { kpis: EMPTY_KPIS, empty: true };
  }

  const csInList = sql`${tradelineCallLog.client_service_id} IN (${sql.join(csIds.map((id) => sql`${id}`), sql`, `)})`;

  const todayRows = await db
    .select({
      n: sql<number>`count(*)::int`,
      answered: sql<number>`count(*) FILTER (WHERE outcome IN ('answered','transferred'))::int`,
      missed: sql<number>`count(*) FILTER (WHERE outcome IN ('missed','voicemail','failed'))::int`,
    })
    .from(tradelineCallLog)
    .where(
      and(
        csInList,
        gte(tradelineCallLog.created_at, todayStart),
      ),
    );
  const callsToday = Number(todayRows[0]?.n ?? 0);
  const answeredToday = Number(todayRows[0]?.answered ?? 0);
  const missedToday = Number(todayRows[0]?.missed ?? 0);

  const yRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tradelineCallLog)
    .where(
      and(
        csInList,
        gte(tradelineCallLog.created_at, yesterdayStart),
        lt(tradelineCallLog.created_at, todayStart),
      ),
    );
  const callsYesterday = Number(yRows[0]?.n ?? 0);

  const lwRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tradelineCallLog)
    .where(
      and(
        csInList,
        gte(tradelineCallLog.created_at, lastWeekDayStart),
        lt(tradelineCallLog.created_at, lastWeekStart),
      ),
    );
  const callsSameTimeLastWeek = Number(lwRows[0]?.n ?? 0);

  const bookRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tradelineCallLog)
    .where(
      and(
        csInList,
        gte(tradelineCallLog.created_at, monthStart),
        sql`(transcript_json->>'booking_created' = 'true' OR summary ILIKE '%booked%' OR summary ILIKE '%appointment%' OR summary ILIKE '%scheduled%')`,
      ),
    );
  const bookingsThisMonth = Number(bookRows[0]?.n ?? 0);

  const TIER_PRICE: Record<string, number> = {
    "tradeline-starter": 99,
    "tradeline-pro": 149,
    "tradeline-elite": 249,
    "tradeline-business": 249,
  };
  const tierRows = await db
    .select({ service_id: clientServices.service_id })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.client_id, clientId),
        sql`${clientServices.service_id} LIKE 'tradeline%'`,
      ),
    );
  let monthSubscriptionCost = 0;
  for (const r of tierRows) {
    const price = TIER_PRICE[r.service_id] ?? 99;
    if (price > monthSubscriptionCost) monthSubscriptionCost = price;
  }

  const costPerBooking = bookingsThisMonth > 0
    ? Math.round((monthSubscriptionCost / bookingsThisMonth) * 100) / 100
    : 0;

  const avgJobValue = 0;
  const estimatedMissedRevenue = 0;

  return {
    kpis: {
      callsToday,
      callsYesterday,
      callsSameTimeLastWeek,
      answeredToday,
      missedToday,
      monthSubscriptionCost,
      bookingsThisMonth,
      costPerBooking,
      avgJobValue,
      estimatedMissedRevenue,
    },
  };
}

export function registerPortalTradelineDashboardKpisRoutes(app: Express) {
  app.get(
    "/api/portal/tradeline/dashboard-kpis",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_DASHBOARD_RESPONSE,
        });
        if (clientId === null) return;

        const payload = await computeTradelineDashboardKpis(clientId);
        return res.json(payload);
      } catch (err: any) {
        log.error("[portal/tradeline/dashboard-kpis]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
