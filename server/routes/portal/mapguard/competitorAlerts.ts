/**
 * Portal MapGuard Competitor Alerts — Wave 27.
 *
 * GET /api/portal/mapguard/competitor-alerts
 *
 * Returns the 10-50 most recent competitor outranking events for the
 * authenticated customer. Sourced from `mapguard_alerts` rows with
 * alert_type IN (rank_drops, local_pack_lost) — the ops layer already
 * writes these when the weekly scan detects a competitor pulling ahead.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 *
 * Empty state is honest: returns `events: []` when no competitor moves
 * detected (anti-pattern: never fake competitor data).
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { mapguardAlerts, mapguardSnapshots } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";
import { projectAlerts, type AlertEvent } from "./competitorAlertProjection";

const log = createLogger("PortalMapguardCompetitorAlerts");

const EMPTY_RESPONSE = {
  previewMode: true,
  monitored: false,
  events: [] as AlertEvent[],
};

export function registerPortalMapguardCompetitorAlertsRoutes(app: Express) {
  app.get(
    "/api/portal/mapguard/competitor-alerts",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const limit = Math.min(
          50,
          Math.max(1, Number(req.query.limit) || 25),
        );

        const rows = await db
          .select()
          .from(mapguardAlerts)
          .where(
            and(
              eq(mapguardAlerts.client_id, clientId),
              eq(mapguardAlerts.dismissed, false),
              sql`alert_type IN ('rank_drops','local_pack_lost','competitor_outranked')`,
            ),
          )
          .orderBy(desc(mapguardAlerts.created_at))
          .limit(limit);

        const events = rows.flatMap(projectAlerts).slice(0, limit);

        // Has a rank-grid scan ever run for this client? Without this the
        // client cannot tell "activated, scan pending" from "scanned, and
        // nobody overtook you" — and the feed defaulted to claiming the
        // first scan was still pending, permanently.
        const snap = await db
          .select({ id: mapguardSnapshots.id })
          .from(mapguardSnapshots)
          .where(eq(mapguardSnapshots.client_id, clientId))
          .limit(1);

        res.json({ events, monitored: snap.length > 0, previewMode: false });
      } catch (err: any) {
        log.error(
          "[portal/mapguard/competitor-alerts]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
