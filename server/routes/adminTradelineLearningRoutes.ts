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
import { tradelineLearningCandidates, tradelineKnowledgeBase, LEARNING_CANDIDATE_STATUSES, LEARNING_CANDIDATE_KINDS, TEMPLATE_KIND_VALUES_LC, TRADELINE_KB_KINDS } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";
import { generateCuid } from "../lib/apiKeys";
import { storage } from "../storage";

const log = createLogger("LearningPipeline");

/**
 * Pure preconditions for the apply-handoff (unit-testable).
 * An approved, not-yet-applied candidate may be applied. An applied candidate
 * (with a linked KB entry) may be rolled back. These guard against double-apply
 * and rolling back something that was never applied.
 */
export function canApplyCandidate(c: { status: string; applied_at: unknown | null }): boolean {
  return c.status === "approved" && !c.applied_at;
}
export function canRollbackCandidate(c: { status: string; applied_kb_id: string | null }): boolean {
  return c.status === "applied" && !!c.applied_kb_id;
}

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

  /* ─── Apply an approved candidate to a live brain ───────────────────────
   * Creates an ACTIVE tradeline_knowledge_base entry for the chosen client from
   * the candidate's title/body. The live voice prompt reads active KB rows, so
   * the change is live on the next call. Records the link (applied_kb_id) so it
   * is versioned + reversible. Idempotent: only an approved, not-yet-applied
   * candidate can be applied. ──────────────────────────────────────────────── */
  const applyBody = z.object({
    client_id: z.number().int().positive(),
    kind: z.enum(TRADELINE_KB_KINDS).optional(),
  });
  app.post("/api/admin/tradeline/learning-candidates/:id/apply", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const parsed = applyBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      // Atomic: SELECT + INSERT + UPDATE inside a single transaction so a
      // concurrent apply can't orphan a KB entry.
      const result = await db.transaction(async (tx) => {
        const [cand] = await tx.select().from(tradelineLearningCandidates).where(eq(tradelineLearningCandidates.id, id)).limit(1);
        if (!cand) return { error: "Not found", status: 404 } as const;
        if (!canApplyCandidate(cand)) {
          return { error: "Candidate must be approved and not already applied", status: 409 } as const;
        }

        // Sanitize title/body before inserting to the live KB — same pattern as
        // greeting sanitization in portalTradelineKnowledgeRoutes (strips prompt
        // injection markers: brackets, pipes, backticks).
        const sanitize = (s: string) => s.replace(/[\[\]{}|\\`]/g, "").replace(/\n{2,}/g, "\n").trim();

        const kbId = generateCuid();
        await tx.insert(tradelineKnowledgeBase).values({
          id: kbId,
          client_id: parsed.data.client_id,
          kind: parsed.data.kind ?? "doc",
          title: sanitize(cand.title),
          content: sanitize(cand.body),
          priority: 0,
          status: "active",
        });

        const [updated] = await tx
          .update(tradelineLearningCandidates)
          .set({ status: "applied", applied_at: new Date(), applied_kb_id: kbId, applied_by: req.user?.id ?? null })
          .where(eq(tradelineLearningCandidates.id, id))
          .returning();

        return { ok: true, candidate: updated, kbId, title: cand.title } as const;
      });

      if ("error" in result) return res.status(result.status as number).json({ error: result.error });

      // Fire-and-forget audit logging — don't let a logging failure break the
      // response after a successful apply (would cause admin to retry → double-apply).
      storage.logAdminActivity({
        actor_type: "admin",
        actor_id: req.user?.id ?? null,
        actor_name: (req.user as any)?.email ?? "admin",
        action: "tradeline.learning_applied",
        entity_type: "tradeline_learning_candidate",
        entity_id: id,
        summary: `Applied learning candidate "${result.title}" → KB ${result.kbId} for client ${parsed.data.client_id}`,
        metadata: { candidateId: id, kbId: result.kbId, clientId: parsed.data.client_id },
      }).catch((err: any) => log.warn("audit log failed after successful apply", { err: err?.message, candidateId: id }));

      return res.json({ ok: true, candidate: result.candidate, kbId: result.kbId });
    } catch (err: any) {
      log.error("apply failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to apply candidate" });
    }
  });

  /* ─── One-click rollback of an applied candidate ────────────────────────
   * Archives the KB entry the apply created (the live brain reads active-only,
   * so it stops using it on the next call) and reverts the candidate to
   * 'approved' so it can be re-applied. No data is deleted — fully reversible. */
  app.post("/api/admin/tradeline/learning-candidates/:id/rollback", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);

      // Atomic: SELECT + archive KB + reset candidate in a single transaction
      // so a partial failure can't leave corrupted state.
      const result = await db.transaction(async (tx) => {
        const [cand] = await tx.select().from(tradelineLearningCandidates).where(eq(tradelineLearningCandidates.id, id)).limit(1);
        if (!cand) return { error: "Not found", status: 404 } as const;
        if (!canRollbackCandidate(cand)) {
          return { error: "Candidate is not in an applied state", status: 409 } as const;
        }

        // Archive the live KB entry → the voice prompt (active-only) drops it.
        await tx
          .update(tradelineKnowledgeBase)
          .set({ status: "archived", updated_at: new Date() })
          .where(eq(tradelineKnowledgeBase.id, cand.applied_kb_id!));

        const [updated] = await tx
          .update(tradelineLearningCandidates)
          .set({ status: "approved", applied_at: null, applied_kb_id: null, applied_by: null })
          .where(eq(tradelineLearningCandidates.id, id))
          .returning();

        return { ok: true, candidate: updated, title: cand.title, archivedKbId: cand.applied_kb_id } as const;
      });

      if ("error" in result) return res.status(result.status as number).json({ error: result.error });

      // Fire-and-forget audit logging.
      storage.logAdminActivity({
        actor_type: "admin",
        actor_id: req.user?.id ?? null,
        actor_name: (req.user as any)?.email ?? "admin",
        action: "tradeline.learning_rolled_back",
        entity_type: "tradeline_learning_candidate",
        entity_id: id,
        summary: `Rolled back learning candidate "${result.title}" — archived KB ${result.archivedKbId}`,
        metadata: { candidateId: id, archivedKbId: result.archivedKbId },
      }).catch((err: any) => log.warn("audit log failed after successful rollback", { err: err?.message, candidateId: id }));

      return res.json({ ok: true, candidate: result.candidate, archivedKbId: result.archivedKbId });
    } catch (err: any) {
      log.error("rollback failed", { err: err?.message });
      return res.status(500).json({ error: "Failed to roll back candidate" });
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
