/**
 * Admin routes for the TradeLine learning pipeline (Phase D v1).
 *
 *   GET    /api/admin/tradeline/learning-candidates                — list + filter
 *   GET    /api/admin/tradeline/learning-candidates/:id            — detail
 *   PATCH  /api/admin/tradeline/learning-candidates/:id            — approve/reject
 *   POST   /api/admin/tradeline/research/:niche/trigger            — manual research
 *
 * The Researcher AI integration is a stub for v1: it creates a placeholder
 * candidate marked source_url='manual-trigger://{niche}' so the queue UI
 * is exercise-able end-to-end. The actual Anthropic web-search call lands
 * in v1.5 with the per-niche source whitelist Alex approved.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { tradelineLearningCandidates, LEARNING_CANDIDATE_STATUSES, LEARNING_CANDIDATE_KINDS, TEMPLATE_KIND_VALUES_LC } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";

const log = createLogger("LearningPipeline");

export function registerAdminTradelineLearningRoutes(app: Express) {
  /* ─── List candidates ─── */
  app.get("/api/admin/tradeline/learning-candidates", requireAdmin, async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : null;
      const niche = typeof req.query.niche === "string" ? req.query.niche : null;
      const conditions = [];
      if (status) conditions.push(eq(tradelineLearningCandidates.status, status));
      if (niche) conditions.push(eq(tradelineLearningCandidates.niche, niche));
      const rows = await db
        .select()
        .from(tradelineLearningCandidates)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(tradelineLearningCandidates.created_at))
        .limit(200);
      return res.json({ rows });
    } catch (err: any) {
      log.error("list failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to load candidates" });
    }
  });

  /* ─── Get single ─── */
  app.get("/api/admin/tradeline/learning-candidates/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [row] = await db.select().from(tradelineLearningCandidates).where(eq(tradelineLearningCandidates.id, id)).limit(1);
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json(row);
    } catch (err: any) {
      log.error("get failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to load candidate" });
    }
  });

  /* ─── Approve / reject ─── */
  const patchBody = z.object({
    status: z.enum(["approved", "rejected"]),
    rejection_reason: z.string().max(500).optional(),
  });
  app.patch("/api/admin/tradeline/learning-candidates/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const parsed = patchBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const [updated] = await db
        .update(tradelineLearningCandidates)
        .set({
          status: parsed.data.status,
          rejection_reason: parsed.data.rejection_reason ?? null,
          reviewed_by: req.user?.id ?? null,
          reviewed_at: new Date(),
        })
        .where(eq(tradelineLearningCandidates.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      return res.json(updated);
    } catch (err: any) {
      log.error("patch failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to update candidate" });
    }
  });

  /* ─── Manual research trigger (stub for v1) ─── */
  app.post("/api/admin/tradeline/research/:niche/trigger", requireAdmin, async (req: Request, res: Response) => {
    try {
      const niche = String(req.params.niche).toLowerCase();
      const templateKind = (typeof req.body?.template_kind === "string" && TEMPLATE_KIND_VALUES_LC.includes(req.body.template_kind as any))
        ? req.body.template_kind
        : "tradeline";

      // V1 stub: create a placeholder pending candidate so the admin queue
      // exercises end-to-end. V1.5 will replace this with a real Anthropic
      // web-search call against the per-niche source whitelist.
      const [row] = await db
        .insert(tradelineLearningCandidates)
        .values({
          niche,
          template_kind: templateKind,
          kind: "research",
          source_url: `manual-trigger://${niche}`,
          title: `Manual research trigger — ${niche}`,
          body: `Research trigger queued by ${req.user?.email ?? "admin"} on ${new Date().toISOString()}.\n\nIn v1.5 of the learning pipeline this row will be replaced with the Anthropic web-search summary from the niche source whitelist (NFPA, EPA, OSHA, state licensing boards). For v1 it serves as a placeholder so the admin queue is exercised end-to-end.`,
          status: "pending",
        })
        .returning();
      return res.json({ ok: true, candidate: row });
    } catch (err: any) {
      log.error("trigger failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to trigger research" });
    }
  });

  /* ─── Get training-budget setting (UI-only v1; stored client-side) ─── */
  app.get("/api/admin/tradeline/training-budget", requireAdmin, async (_req: Request, res: Response) => {
    // V1: settings are client-side only. The actual learning pipeline (v2)
    // will read from a settings table; for v1 the slider tier is informational.
    return res.json({
      version: 1,
      activeTier: "paused",
      tiers: [
        { id: "paused", label: "Paused", monthlyEstimate: "$0", description: "Learning pipeline is off." },
        { id: "conservative", label: "Conservative", monthlyEstimate: "$1-5", description: "Gemini Flash summarization, DeepSeek-V3 trainer (opt-in), weekly review." },
        { id: "balanced", label: "Balanced", monthlyEstimate: "$5-25", description: "Gemini Flash + Claude Haiku trainer, weekly review." },
        { id: "aggressive", label: "Aggressive", monthlyEstimate: "$25-100", description: "Claude Haiku + Sonnet trainer, twice-weekly review." },
        { id: "maximum", label: "Maximum", monthlyEstimate: "$100+", description: "Claude Sonnet + Opus trainer, daily review." },
      ],
    });
  });
}
