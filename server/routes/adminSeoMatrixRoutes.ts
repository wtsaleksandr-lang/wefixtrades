/**
 * Admin SEO programmatic-matrix batch trigger (the riskiest SEO surface).
 *
 * The [trade]×[city]×[job] matrix is where programmatic SEO becomes Google-
 * penalized doorway slop, so it is NEVER fired by a cron — a human explicitly
 * triggers a single, hard-limited batch here, then reviews the resulting
 * in_review drafts in the existing review queue (/api/admin/seo/review/queue).
 *
 *   POST /api/admin/seo/matrix/generate-batch
 *         body: { limit?, trades?, cities?, jobTypes?, minUniqueDataScore? }
 *         → { generated[], skipped[], attempted, totalCells, enabled }
 *
 * Defaults to the tiny curated SEED_MATRIX (validation scope). Inert when the
 * SEO engine flag is off (enabled=false, nothing generated). Every page it
 * produces is an in_review draft — there is NO publish path here.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";
import {
  generateMatrixBatch,
  SEED_MATRIX,
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_CELLS,
} from "../services/seoContent/programmaticMatrixGenerator";

const log = createLogger("AdminSeoMatrix");

const tradeSchema = z.object({ tradeType: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(80) });
const jobSchema = z.object({
  jobType: z.string().trim().min(1).max(80),
  phrase: z.string().trim().min(1).max(120),
  intent: z.enum(["bottom", "mid", "top"]),
});

const batchSchema = z.object({
  // Hard-capped at MAX_BATCH_CELLS so a request can never fire the firehose.
  limit: z.number().int().min(1).max(MAX_BATCH_CELLS).optional(),
  trades: z.array(tradeSchema).max(10).optional(),
  cities: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  jobTypes: z.array(jobSchema).max(10).optional(),
  minUniqueDataScore: z.number().int().min(0).max(100).optional(),
});

export function registerAdminSeoMatrixRoutes(app: Express): void {
  /* ─── Inspect the default validation scope without generating anything ─── */
  app.get("/api/admin/seo/matrix/seed", requireAdmin, (_req: Request, res: Response) => {
    res.json({
      cells: SEED_MATRIX.map((c) => ({
        keyword: c.keyword,
        slug: c.slug,
        tradeType: c.tradeType,
        city: c.city,
        jobType: c.jobType,
        intent: c.intent,
      })),
      cellCount: SEED_MATRIX.length,
      defaultLimit: DEFAULT_BATCH_LIMIT,
      maxBatchCells: MAX_BATCH_CELLS,
    });
  });

  /* ─── Trigger one hard-limited batch ─── */
  app.post("/api/admin/seo/matrix/generate-batch", requireAdmin, async (req: Request, res: Response) => {
    const parsed = batchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    }
    try {
      const result = await generateMatrixBatch(parsed.data);
      log.info("matrix batch triggered by admin", {
        adminId: (req as any)?.user?.id ?? null,
        enabled: result.enabled,
        attempted: result.attempted,
        generated: result.generated.length,
        skipped: result.skipped.length,
      });
      res.json({
        enabled: result.enabled,
        totalCells: result.totalCells,
        attempted: result.attempted,
        generated: result.generated,
        skipped: result.skipped,
      });
    } catch (err) {
      log.error("matrix batch failed", { err: (err as Error).message });
      res.status(500).json({ error: "matrix_batch_failed" });
    }
  });
}
