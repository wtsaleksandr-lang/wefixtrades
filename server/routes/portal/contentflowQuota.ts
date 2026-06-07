/**
 * ContentFlow Phase 4 — portal quota endpoint.
 *
 *   GET /api/portal/contentflow/quota
 *
 * Returns the calling client's current tier + monthly usage counters +
 * the next-reset timestamp. Backs the QuotaBanner component on the
 * ContentFlow portal page.
 *
 * Phase 3 owns the main contentflow.ts route file; Phase 4 ships this
 * disjoint sibling file to avoid step-on collisions during parallel
 * development. Registered from server/routes/index.ts.
 */

import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { requireClient } from "../../auth";
import { db } from "../../db";
import { clients } from "@shared/schema";
import { getQuotaState } from "../../services/contentflow/quotaService";
import {
  getQuotaForTier,
  emptyUsage,
  nextMonthlyResetAt,
} from "@shared/contentflow/quotas";
import { createLogger } from "../../lib/logger";

const log = createLogger("PortalContentflowQuota");

/** YYYY-MM-01 in UTC (mirrors quotaService.utcPeriodStart). */
function utcPeriodStart(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Resolve client_id from the authenticated user's id. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

export function registerPortalContentflowQuotaRoutes(app: Express) {
  app.get(
    "/api/portal/contentflow/quota",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await resolveClientId(req.user!.id);
        if (!clientId) {
          // Wave 12C: admin previewing the portal — return zero-quota envelope
          // so QuotaBanner renders an empty state instead of a 403 red error.
          if (req.user!.role === "admin") {
            // Return the SAME QuotaState shape the real client path returns
            // (tier / limit / used / resetAt / period_start) so QuotaBanner
            // renders a clean empty state instead of crashing on data.used.
            return res.json({
              previewMode: true,
              tier: "contentflow-starter",
              limit: getQuotaForTier("contentflow-starter"),
              used: emptyUsage(),
              resetAt: nextMonthlyResetAt(),
              period_start: utcPeriodStart(),
            });
          }
          return res
            .status(403)
            .json({ error: "No client record linked to this account", code: "no_client_linked" });
        }
        const state = await getQuotaState(clientId);
        return res.json(state);
      } catch (err: any) {
        log.error("[portal/contentflow/quota][get]", err?.message || err);
        return res.status(500).json({ error: err.message });
      }
    },
  );
}
