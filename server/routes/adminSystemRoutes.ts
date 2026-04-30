/**
 * Admin System Routes (Phase 3D).
 *
 * Cross-cutting system + integrations health endpoints. Registered
 * under /api/admin/system/*. All endpoints require admin auth and
 * never return secret values (only presence booleans).
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { getSystemHealth } from "../services/systemHealth";

export function registerAdminSystemRoutes(app: Express): void {
  /**
   * GET /api/admin/system/integrations-health
   *
   * Aggregate cross-integration health snapshot. Read-only. Returns
   * structured JSON suitable for an admin dashboard. Never returns
   * secret values — webhook secrets are reported as booleans only.
   *
   * Query: ?windowHours=N (default 24, clamped 1..168).
   */
  app.get(
    "/api/admin/system/integrations-health",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const raw = req.query.windowHours;
        const windowHours = raw
          ? Math.max(1, Math.min(168, parseInt(String(raw), 10) || 24))
          : 24;
        const data = await getSystemHealth({ windowHours });
        res.json(data);
      } catch (err: any) {
        console.error("[admin/system/integrations-health]", err?.message || err);
        res.status(500).json({ error: "system health probe failed" });
      }
    },
  );
}
