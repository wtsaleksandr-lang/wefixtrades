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
import { generateSequence } from "../services/copyEngine";
import { validateSequenceCanSpam } from "../services/outboundSafety";

const log = createLogger("AdminOutreachSequences");

/**
 * LANE OB — CAN-SPAM activation gate.
 *
 * A sequence may only go `active` when EVERY step body carries:
 *   1. a physical postal address (merge token like {{sender_address}} or a
 *      literal street address), and
 *   2. an unsubscribe mechanism (merge token like {{unsubscribe}} or an
 *      explicit unsubscribe/opt-out mention).
 * Returns null when compliant; otherwise a response payload describing
 * exactly which steps fail and why, for a 422.
 */
function canSpamActivationError(
  steps: { order_index: number; body_template: string }[],
): { error: string; failures: { order_index: number; missing: string[] }[] } | null {
  if (steps.length === 0) {
    return {
      error: "Cannot activate: sequence has no steps",
      failures: [],
    };
  }
  const result = validateSequenceCanSpam(steps);
  if (result.ok) return null;
  return {
    error:
      "Cannot activate: CAN-SPAM requires every step body to contain a physical " +
      "postal address (e.g. {{sender_address}} or a literal street address) and " +
      "an unsubscribe mechanism (e.g. {{unsubscribe}}). Fix the listed steps and retry.",
    failures: result.failures,
  };
}

/* AI multi-agent sequence-generation inputs (copy engine). */
const generateSequenceSchema = z.object({
  icp: z.string().min(3).max(500),
  painPoint: z.string().min(3).max(500),
  offer: z.string().min(3).max(500),
  senderPersona: z.string().min(3).max(300),
  tone: z.enum(["direct", "warm", "playful", "technical"]).default("direct"),
  stepCount: z.number().int().min(2).max(8).default(4),
  // P1-3: when persist is set, the generated steps are saved into
  // outreach_sequences + outreach_sequence_steps and the new sequence id
  // is returned. Without it, the route stays preview-only (legacy behaviour).
  persist: z.boolean().optional().default(false),
  name: z.string().min(2).max(200).optional(),
  campaign_id: z.number().int().positive().nullable().optional(),
  trade_filter: z.string().max(100).nullable().optional(),
  region_filter: z.string().max(200).nullable().optional(),
  ai_personalize: z.boolean().optional().default(false),
});

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
  /* ─── AI: generate a multi-step sequence (preview or persist) ───
   *
   * Runs the multi-agent copy engine (research → draft → edit → QA) and returns
   * the generated brief + steps + QA report for the admin to review. By default
   * it is preview-only. Pass `persist: true` (P1-3) to also save the generated
   * steps into outreach_sequences + outreach_sequence_steps and get back the new
   * `sequenceId`. The engine routes through aiService, so it inherits the
   * multi-provider failover.
   */
  app.post("/api/admin/outbound/sequences/generate", requireAdmin, async (req: Request, res: Response) => {
    const parsed = generateSequenceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    try {
      const input = parsed.data;
      const result = await generateSequence(input);

      let savedSequenceId: number | undefined;

      // P1-3: optionally persist the AI-generated steps into the live tables.
      // Each generated SequenceStepDraft maps to one outreach_sequence_steps row;
      // we take the first subject variant as the step subject (the variants array
      // is preserved in the response for the operator to A/B later).
      if (input.persist) {
        const ownerId = (req.user as any)?.id ?? null;
        const seqName =
          input.name?.trim() ||
          `AI sequence — ${new Date().toISOString().slice(0, 10)}`;

        const [seq] = await db.insert(outreachSequences).values({
          name: seqName,
          campaign_id: input.campaign_id ?? null,
          trade_filter: input.trade_filter ?? null,
          region_filter: input.region_filter ?? null,
          icp: input.icp,
          pain_point: input.painPoint,
          offer: input.offer,
          sender_persona: input.senderPersona,
          tone: input.tone,
          ai_personalize: input.ai_personalize ?? false,
          status: "draft",
          owner_id: ownerId,
          metadata: { generated_run_id: result.runId, source: "ai_generate" },
        } as InsertOutreachSequence).returning();

        savedSequenceId = seq.id;

        if (result.steps.length > 0) {
          await db.insert(outreachSequenceSteps).values(
            result.steps.map((s, i) => ({
              sequence_id: seq.id,
              order_index: s.stepNumber ?? i + 1,
              delay_days: s.delayDays ?? 0,
              subject_template: s.subjectVariants?.[0] ?? "",
              body_template: s.body ?? "",
              ai_personalize: input.ai_personalize ?? false,
            } as InsertOutreachSequenceStep)),
          );
        }
      }

      res.json({
        runId: result.runId,
        brief: result.brief,
        steps: result.steps,
        qaReport: result.qaReport,
        models: result.models,
        ...(savedSequenceId !== undefined ? { sequenceId: savedSequenceId, persisted: true } : {}),
      });
    } catch (err: any) {
      log.error("[sequences] AI generate error:", err.message);
      res.status(502).json({ error: "Sequence generation failed", detail: err?.message?.slice(0, 300) });
    }
  });

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

    // LANE OB: creating directly as `active` runs the CAN-SPAM gate on the
    // provided step(s) — a sequence can never be born active and non-compliant.
    if (seqInput.status === "active") {
      const canSpamErr = canSpamActivationError(
        initial_step
          ? [{ order_index: 1, body_template: initial_step.body_template }]
          : [],
      );
      if (canSpamErr) return res.status(422).json(canSpamErr);
    }

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
      // LANE OB: CAN-SPAM activation gate — transitioning to `active`
      // validates EVERY step body (physical address + unsubscribe mechanism).
      if (parsed.data.status === "active") {
        const steps = await db
          .select({
            order_index: outreachSequenceSteps.order_index,
            body_template: outreachSequenceSteps.body_template,
          })
          .from(outreachSequenceSteps)
          .where(eq(outreachSequenceSteps.sequence_id, id))
          .orderBy(outreachSequenceSteps.order_index);

        const canSpamErr = canSpamActivationError(steps);
        if (canSpamErr) return res.status(422).json(canSpamErr);
      }

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
      // ai_personalize wiring (P1-2): when a step has ai_personalize=true, the
      // campaign-assign route (adminOutboundRoutes) calls personalizeForProspect
      // for each queued prospect and writes ai_first_line / ai_offer_angle /
      // ai_cta_variant / ai_reason_to_target onto prospect_enrichment; the sync
      // worker then pushes them as custom merge fields.
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
    const stepId = parseInt(String(req.params.stepId), 10);
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
    const stepId = parseInt(String(req.params.stepId), 10);
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
