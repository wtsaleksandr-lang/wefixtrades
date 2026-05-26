/**
 * Portal TradeLine Booking Funnel — Wave 26.
 *
 * GET /api/portal/tradeline/funnel
 *
 * Returns the 4-stage funnel the BookingFunnel component renders:
 *   Calls Today → Qualified Leads → Bookings Created → Completed Jobs
 *
 * Stages are computed against this calendar month so the funnel is
 * meaningful even for low-volume customers (a single-day funnel would
 * read "1 → 1 → 0 → 0" on most days).
 *
 *  - calls:      total tradeline_call_log rows this month
 *  - qualified:  rows with outcome IN ('answered','transferred') this month
 *  - bookings:   rows whose transcript_json indicates a booking_created
 *                event OR summary mentions booked/scheduled/appointment
 *  - completed:  bookings from above whose call is older than 7d (rough
 *                "the job should be done by now" approximation; we don't
 *                wire to a job-completion table because TradeLine doesn't
 *                own one)
 *
 * Plus aggregateRevenue = completed * avgJobValue (avgJobValue currently 0
 * — surfaces as $0 until we persist per-customer averages).
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

const log = createLogger("PortalTradelineFunnel");

const EMPTY_FUNNEL = {
  calls: 0,
  qualified: 0,
  bookings: 0,
  completed: 0,
  aggregateRevenue: 0,
  windowLabel: "This month",
};

const EMPTY_RESPONSE = {
  previewMode: true,
  funnel: EMPTY_FUNNEL,
};

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function registerPortalTradelineFunnelRoutes(app: Express) {
  app.get(
    "/api/portal/tradeline/funnel",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const monthStart = startOfMonth();
        const completedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

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
          return res.json({ funnel: EMPTY_FUNNEL, empty: true });
        }

        const csInList = sql`${tradelineCallLog.client_service_id} IN (${sql.join(csIds.map((id) => sql`${id}`), sql`, `)})`;

        const rows = await db
          .select({
            calls: sql<number>`count(*)::int`,
            qualified: sql<number>`count(*) FILTER (WHERE outcome IN ('answered','transferred'))::int`,
            bookings: sql<number>`count(*) FILTER (WHERE (transcript_json->>'booking_created' = 'true' OR summary ILIKE '%booked%' OR summary ILIKE '%scheduled%' OR summary ILIKE '%appointment%'))::int`,
            completed: sql<number>`count(*) FILTER (WHERE (transcript_json->>'booking_created' = 'true' OR summary ILIKE '%booked%' OR summary ILIKE '%scheduled%' OR summary ILIKE '%appointment%') AND created_at < ${completedCutoff})::int`,
          })
          .from(tradelineCallLog)
          .where(
            and(
              csInList,
              gte(tradelineCallLog.created_at, monthStart),
            ),
          );

        const calls = Number(rows[0]?.calls ?? 0);
        const qualified = Number(rows[0]?.qualified ?? 0);
        const bookings = Number(rows[0]?.bookings ?? 0);
        const completed = Number(rows[0]?.completed ?? 0);

        // aggregateRevenue: we don't have per-customer avg job value yet.
        // Surface 0 — UI hides the row when 0 (anti-pattern: never fake $).
        const aggregateRevenue = 0;

        res.json({
          funnel: {
            calls,
            qualified,
            bookings,
            completed,
            aggregateRevenue,
            windowLabel: "This month",
          },
        });
      } catch (err: any) {
        log.error("[portal/tradeline/funnel]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
