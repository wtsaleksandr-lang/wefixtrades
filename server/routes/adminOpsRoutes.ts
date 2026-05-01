/**
 * Admin Ops Routes — serves Background AI Ops Engine snapshots to the admin dashboard.
 *
 * All routes require admin authentication.
 * These endpoints serve read-only data from opsSnapshots.
 * No mutations happen here.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { opsSnapshots } from "@shared/schema";
import { desc, eq, and } from "drizzle-orm";

export function registerAdminOpsRoutes(app: Express): void {

  /**
   * GET /api/admin/ops/summary/daily
   * Returns the most recent daily_summary snapshot.
   * Used by the CRM Overview ops intelligence widget.
   */
  app.get("/api/admin/ops/summary/daily", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [latest] = await db
        .select()
        .from(opsSnapshots)
        .where(eq(opsSnapshots.snapshot_type, "daily_summary"))
        .orderBy(desc(opsSnapshots.generated_at))
        .limit(1);

      if (!latest) {
        return res.json({ snapshot: null });
      }

      res.json({ snapshot: latest });
    } catch (err) {
      console.error("[adminOps] GET /summary/daily error:", err);
      res.status(500).json({ error: "Failed to load daily ops summary" });
    }
  });

  /**
   * GET /api/admin/ops/snapshots
   * Returns paginated list of all ops snapshots (all types).
   * Query params: limit, offset, type
   */
  app.get("/api/admin/ops/snapshots", requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const type = typeof req.query.type === "string" ? req.query.type : undefined;

      const query = db
        .select({
          id: opsSnapshots.id,
          snapshot_type: opsSnapshots.snapshot_type,
          generated_at: opsSnapshots.generated_at,
          signal_count: opsSnapshots.signal_count,
          model_used: opsSnapshots.model_used,
          input_tokens: opsSnapshots.input_tokens,
          output_tokens: opsSnapshots.output_tokens,
          estimated_cost_usd: opsSnapshots.estimated_cost_usd,
          prompt_version: opsSnapshots.prompt_version,
          detector_version: opsSnapshots.detector_version,
          metadata: opsSnapshots.metadata,
          // Return summary from ai_output without full raw_signals to keep response light
          ai_output: opsSnapshots.ai_output,
        })
        .from(opsSnapshots)
        .orderBy(desc(opsSnapshots.generated_at))
        .limit(limit)
        .offset(offset);

      const snapshots = type
        ? await db
            .select({
              id: opsSnapshots.id,
              snapshot_type: opsSnapshots.snapshot_type,
              generated_at: opsSnapshots.generated_at,
              signal_count: opsSnapshots.signal_count,
              model_used: opsSnapshots.model_used,
              input_tokens: opsSnapshots.input_tokens,
              output_tokens: opsSnapshots.output_tokens,
              estimated_cost_usd: opsSnapshots.estimated_cost_usd,
              prompt_version: opsSnapshots.prompt_version,
              detector_version: opsSnapshots.detector_version,
              metadata: opsSnapshots.metadata,
              ai_output: opsSnapshots.ai_output,
            })
            .from(opsSnapshots)
            .where(eq(opsSnapshots.snapshot_type, type))
            .orderBy(desc(opsSnapshots.generated_at))
            .limit(limit)
            .offset(offset)
        : await query;

      res.json({ snapshots, limit, offset });
    } catch (err) {
      console.error("[adminOps] GET /snapshots error:", err);
      res.status(500).json({ error: "Failed to load ops snapshots" });
    }
  });

  /**
   * GET /api/admin/ops/snapshots/:id
   * Returns a single snapshot including raw_signals and full ai_output.
   * Used for drill-down / audit views.
   */
  app.get("/api/admin/ops/snapshots/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id));
      if (!id || isNaN(id)) {
        return res.status(400).json({ error: "Invalid snapshot id" });
      }

      const [snapshot] = await db
        .select()
        .from(opsSnapshots)
        .where(eq(opsSnapshots.id, id))
        .limit(1);

      if (!snapshot) {
        return res.status(404).json({ error: "Snapshot not found" });
      }

      res.json({ snapshot });
    } catch (err) {
      console.error("[adminOps] GET /snapshots/:id error:", err);
      res.status(500).json({ error: "Failed to load snapshot" });
    }
  });

  /**
   * POST /api/admin/ops/run
   * Manually triggers a single ops intelligence run.
   * Admin-only. Useful for testing and immediate refresh.
   */
  app.post("/api/admin/ops/run", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { runDailyOpsIntelligence } = await import("../jobs/opsIntelligenceJob");
      const result = await runDailyOpsIntelligence();
      res.json({ ok: true, result });
    } catch (err: any) {
      console.error("[adminOps] POST /run error:", err);
      res.status(500).json({ error: "Ops run failed", detail: err.message });
    }
  });
}
