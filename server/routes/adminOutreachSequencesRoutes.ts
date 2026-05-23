/**
 * Admin Outreach Sequences Routes — sequence-template CRUD.
 *
 * Mounted under /api/admin/outbound/sequences.
 * Requires admin authentication.
 *
 * Tables: outreach_sequences (header) + outreach_sequence_steps (children).
 * Schema is defined in shared/schemas/outbound.ts and seeded by
 * migrations/0037_outbound.sql.
 *
 * Split off from adminOutboundRoutes.ts (already ~1.5k LOC) so this
 * feature has a clear home. Personalization tokens
 * (ai_first_line, ai_offer_angle, etc.) live on prospect_enrichment —
 * Smartlead substitutes them at send time. The actual Anthropic call to
 * populate per-prospect AI fields is OUT OF SCOPE for this wave; the
 * `ai_personalize` flag exists so the UI can surface "AI: enabled" and
 * a future wave can wire the generation worker.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { db } from "../db";
import {
  outreachSequences,
  outreachSequenceSteps,
  type InsertOutreachSequence,
  type InsertOutreachSequenceStep,
} from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { z } from "zod";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminOutreachSequences");

/* ─── Input schemas ─── */
const createSequenceSchema = z.object({
  name: z.string().min(2).max(200),
  trade_filter: z.string().max(100).nullable().optional(),
  region_filter: z.string().max(200).nullable().optional(),
  campaign_id: z.number().int().positive().nullable().optional(),
  icp: z.string().max(2000).nullable().optional(),
  pain_point: z.string().max(2000).nullable().optional(),
  offer: z.string().max(2000).nullable().optional(),
  sender_persona: z.string().max(500).nullable().optional(),
  tone: z.string().max(30).optional(),
  ai_personalize: z.boolean().optional().default(false),
  status: z.enum(["draft", "active", "archived"]).optional().default("draft"),
  // Optional initial step — keeps the "create + first step in one click" UX simple
  initial_step: z.object({
    subject_template: z.string().min(1).max(500),
    body_template: z.string().min(1).max(5000),
    delay_days: z.number().int().min(0).max(365).optional().default(0),
  }).optional(),
});

const updateSequenceSchema = createSequenceSchema.partial().omit({ initial_step: true });

const stepSchema = z.object({
  order_index: z.number().int().min(1).max(50),
  delay_days: z.number().int().min(0).max(365).default(0),
  subject_template: z.string().min(1).max(500),
  body_template: z.string().min(1).max(5000),
  ai_personalize: z.boolean().optional().default(false),
});
const updateStepSchema = stepSchema.partial();

/* ─── Route registration ─── */
export function registerAdminOutreachSequencesRoutes(app: Express): void {
  /* ─── List sequences (with step counts) ─── */
  app.get("/api/admin/outbound/sequences", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          sequence: outreachSequences,
          step_count: sql<number>`(SELECT COUNT(*)::int FROM outreach_sequence_steps WHERE sequence_id = ${outreachSequences.id})`,
        })
        .from(outreachSequences)
        .orderBy(desc(outreachSequences.updated_at))
        .limit(200);
      res.json({ data: rows });
    } catch (err: any) {
      log.error("[sequences] list error:", err.message);
      res.status(500).json({ error: "Failed to list sequences" });
    }
  });

  /* ─── Create sequence (optionally with first step) ─── */
  app.post("/api/admin/outbound/sequences", requireAdmin, async (req: Request, res: Response) => {
    const parsed = createSequenceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const { initial_step, ...seqInput } = parsed.data;
    const ownerId = (req.user as any)?.id ?? null;

    try {
      const [created] = await db.insert(outreachSequences).values({
        ...seqInput,
        owner_id: ownerId,
      } as InsertOutreachSequence).returning();

      if (initial_step) {
        await db.insert(outreachSequenceSteps).values({
          sequence_id: created.id,
          order_index: 1,
          delay_days: initial_step.delay_days ?? 0,
          subject_template: initial_step.subject_template,
          body_template: initial_step.body_template,
          ai_personalize: seqInput.ai_personalize ?? false,
        } as InsertOutreachSequenceStep);
      }

      res.status(201).json(created);
    } catch (err: any) {
      log.error("[sequences] create error:", err.message);
      res.status(500).json({ error: "Failed to create sequence" });
    }
  });

  /* ─── Update sequence metadata ─── */
  app.patch("/api/admin/outbound/sequences/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const parsed = updateSequenceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const [updated] = await db
        .update(outreachSequences)
        .set({ ...parsed.data, updated_at: new Date() })
        .where(eq(outreachSequences.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: any) {
      log.error("[sequences] update error:", err.message);
      res.status(500).json({ error: "Failed to update sequence" });
    }
  });

  /* ─── Delete sequence (soft-archive if requested) ─── */
  app.delete("/api/admin/outbound/sequences/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const soft = req.query.soft === "true" || req.query.soft === "1";

    try {
      if (soft) {
        const [archived] = await db
          .update(outreachSequences)
          .set({ status: "archived", updated_at: new Date() })
          .where(eq(outreachSequences.id, id))
          .returning();
        if (!archived) return res.status(404).json({ error: "Not found" });
        return res.json({ archived: true });
      }
      // Hard delete cascades to steps via FK ON DELETE CASCADE
      const deleted = await db
        .delete(outreachSequences)
        .where(eq(outreachSequences.id, id))
        .returning({ id: outreachSequences.id });
      if (deleted.length === 0) return res.status(404).json({ error: "Not found" });
      res.json({ deleted: true });
    } catch (err: any) {
      log.error("[sequences] delete error:", err.message);
      res.status(500).json({ error: "Failed to delete sequence" });
    }
  });

  /* ─── Duplicate sequence (with steps) ─── */
  app.post("/api/admin/outbound/sequences/:id/duplicate", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const ownerId = (req.user as any)?.id ?? null;

    try {
      const [original] = await db.select().from(outreachSequences).where(eq(outreachSequences.id, id)).limit(1);
      if (!original) return res.status(404).json({ error: "Not found" });

      const [copy] = await db.insert(outreachSequences).values({
        campaign_id: original.campaign_id,
        name: `${original.name} (copy)`,
        trade_filter: original.trade_filter,
        region_filter: original.region_filter,
        icp: original.icp,
        pain_point: original.pain_point,
        offer: original.offer,
        sender_persona: original.sender_persona,
        tone: original.tone,
        ai_personalize: original.ai_personalize,
        status: "draft",
        owner_id: ownerId,
      } as InsertOutreachSequence).returning();

      const steps = await db
        .select()
        .from(outreachSequenceSteps)
        .where(eq(outreachSequenceSteps.sequence_id, id));

      if (steps.length > 0) {
        await db.insert(outreachSequenceSteps).values(
          steps.map((s) => ({
            sequence_id: copy.id,
            order_index: s.order_index,
            delay_days: s.delay_days,
            subject_template: s.subject_template,
            body_template: s.body_template,
            ai_personalize: s.ai_personalize,
          })),
        );
      }

      res.status(201).json(copy);
    } catch (err: any) {
      log.error("[sequences] duplicate error:", err.message);
      res.status(500).json({ error: "Failed to duplicate sequence" });
    }
  });

  /* ─── List steps for a sequence ─── */
  app.get("/api/admin/outbound/sequences/:id/steps", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      const steps = await db
        .select()
        .from(outreachSequenceSteps)
        .where(eq(outreachSequenceSteps.sequence_id, id))
        .orderBy(outreachSequenceSteps.order_index);
      res.json({ data: steps });
    } catch (err: any) {
      log.error("[sequences] list steps error:", err.message);
      res.status(500).json({ error: "Failed to list steps" });
    }
  });

  /* ─── Create step ─── */
  app.post("/api/admin/outbound/sequences/:id/steps", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid sequence id" });

    const parsed = stepSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      // TODO(ai-personalize): when ai_personalize=true, schedule a worker
      //   that generates per-prospect ai_first_line / ai_offer_angle /
      //   ai_cta_variant via Anthropic. Out of scope for this wave —
      //   storage path exists on prospect_enrichment already.
      const [created] = await db.insert(outreachSequenceSteps).values({
        sequence_id: id,
        ...parsed.data,
      } as InsertOutreachSequenceStep).returning();
      res.status(201).json(created);
    } catch (err: any) {
      log.error("[sequences] create step error:", err.message);
      res.status(500).json({ error: "Failed to create step" });
    }
  });

  /* ─── Update step ─── */
  app.patch("/api/admin/outbound/sequences/:id/steps/:stepId", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    const stepId = parseInt(req.params.stepId, 10);
    if (Number.isNaN(id) || Number.isNaN(stepId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const parsed = updateStepSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const [updated] = await db
        .update(outreachSequenceSteps)
        .set({ ...parsed.data, updated_at: new Date() })
        .where(and(
          eq(outreachSequenceSteps.id, stepId),
          eq(outreachSequenceSteps.sequence_id, id),
        ))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: any) {
      log.error("[sequences] update step error:", err.message);
      res.status(500).json({ error: "Failed to update step" });
    }
  });

  /* ─── Delete step ─── */
  app.delete("/api/admin/outbound/sequences/:id/steps/:stepId", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    const stepId = parseInt(req.params.stepId, 10);
    if (Number.isNaN(id) || Number.isNaN(stepId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    try {
      const deleted = await db
        .delete(outreachSequenceSteps)
        .where(and(
          eq(outreachSequenceSteps.id, stepId),
          eq(outreachSequenceSteps.sequence_id, id),
        ))
        .returning({ id: outreachSequenceSteps.id });
      if (deleted.length === 0) return res.status(404).json({ error: "Not found" });
      res.json({ deleted: true });
    } catch (err: any) {
      log.error("[sequences] delete step error:", err.message);
      res.status(500).json({ error: "Failed to delete step" });
    }
  });
}
