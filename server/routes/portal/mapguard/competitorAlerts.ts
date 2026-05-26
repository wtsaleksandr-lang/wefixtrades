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
import { mapguardAlerts } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalMapguardCompetitorAlerts");

interface AlertEvent {
  id: string;
  competitor_name: string;
  keyword: string;
  pin_row: number;
  pin_col: number;
  previous_rank: number | null;
  current_rank: number | null;
  severity: "info" | "warning" | "critical";
  occurred_at: string;
}

const EMPTY_RESPONSE = {
  previewMode: true,
  events: [] as AlertEvent[],
};

/**
 * Pull the structured competitor metadata out of the alert row. The
 * scanner writes a `metric_data` jsonb blob; we surface only the fields
 * needed to render a feed row.
 */
function projectAlert(row: typeof mapguardAlerts.$inferSelect): AlertEvent | null {
  const meta = (row.metric_data ?? {}) as Record<string, unknown>;
  const competitor =
    typeof meta.competitor_name === "string"
      ? meta.competitor_name
      : typeof meta.top_competitor === "string"
        ? meta.top_competitor
        : "A competitor";
  const keyword =
    typeof meta.keyword === "string"
      ? meta.keyword
      : Array.isArray(meta.keywords) && typeof meta.keywords[0] === "string"
        ? (meta.keywords[0] as string)
        : null;
  if (!keyword) return null;

  const pinRow = typeof meta.pin_row === "number" ? meta.pin_row : 2;
  const pinCol = typeof meta.pin_col === "number" ? meta.pin_col : 2;
  const previous = typeof meta.previous_rank === "number" ? meta.previous_rank : null;
  const current = typeof meta.current_rank === "number" ? meta.current_rank : null;

  const sev = (row.severity ?? "warning") as AlertEvent["severity"];
  const occurred = (row.created_at ?? new Date()).toISOString();

  return {
    id: String(row.id),
    competitor_name: competitor,
    keyword,
    pin_row: pinRow,
    pin_col: pinCol,
    previous_rank: previous,
    current_rank: current,
    severity: sev,
    occurred_at: occurred,
  };
}

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

        const events = rows
          .map(projectAlert)
          .filter((e): e is AlertEvent => e != null);

        res.json({ events });
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
