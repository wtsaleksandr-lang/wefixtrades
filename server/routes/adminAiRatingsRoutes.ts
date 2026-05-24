/**
 * Admin AI ratings endpoints — message-level 👍 / 👎 feedback on AI
 * responses surfaced anywhere in the admin UI.
 *
 *   POST /api/admin/ai/ratings           — upsert one rating per admin per response.
 *   GET  /api/admin/ai/ratings/recent    — list recent ratings for the analytics view.
 *
 * Upsert key: (rated_by, response_id). Flipping 👍↔👎 or editing the
 * comment reuses the existing row instead of stacking duplicates.
 *
 * Wired by:
 *   - 0049_ai_response_ratings.sql (table + indexes)
 *   - server/cron/learningCandidateSweep.ts (nightly 👎→candidate sweep)
 *
 * Source: PR #669 AI infrastructure audit — missing message-level
 * feedback loop blocked the conversation→KB pipeline scaffolded in
 * tradeline_learning_candidates (kind='conversation').
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { db } from "../db";
import {
  aiResponseRatings,
  upsertAiRatingRequestSchema,
} from "@shared/schema";
import { AI_SURFACE_LIST } from "../services/aiSurfaces";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminAiRatings");

const SURFACE_SET = new Set<string>(AI_SURFACE_LIST as readonly string[]);

export function registerAdminAiRatingsRoutes(app: Express): void {
  /* ─── Upsert a rating ─── */
  app.post("/api/admin/ai/ratings", requireAdmin, async (req: Request, res: Response) => {
    const parsed = upsertAiRatingRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", issues: parsed.error.flatten() });
    }
    const body = parsed.data;
    if (!SURFACE_SET.has(body.surface)) {
      return res.status(400).json({ error: "invalid_surface" });
    }

    const adminId = (req.user as Express.User).id;
    const comment = body.comment?.trim() ? body.comment.trim() : null;

    try {
      const upserted = await db
        .insert(aiResponseRatings)
        .values({
          response_id: body.response_id,
          surface: body.surface,
          rating: body.rating,
          comment,
          rated_by: adminId,
          client_id: body.client_id ?? null,
        })
        .onConflictDoUpdate({
          target: [aiResponseRatings.rated_by, aiResponseRatings.response_id],
          set: {
            rating: body.rating,
            comment,
            surface: body.surface,
            client_id: body.client_id ?? null,
            rated_at: new Date(),
          },
        })
        .returning();

      res.json({ ok: true, rating: upserted[0] });
    } catch (err: any) {
      log.error("upsert failed", {
        error: err?.message,
        surface: body.surface,
        response_id: body.response_id,
      });
      res.status(500).json({ error: "upsert_failed" });
    }
  });

  /* ─── Recent ratings (analytics) ─── */
  app.get("/api/admin/ai/ratings/recent", requireAdmin, async (req: Request, res: Response) => {
    try {
      const surfaceRaw = String(req.query.surface ?? "").trim();
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);

      const where =
        surfaceRaw && SURFACE_SET.has(surfaceRaw)
          ? eq(aiResponseRatings.surface, surfaceRaw)
          : undefined;

      const baseQuery = db
        .select({
          id: aiResponseRatings.id,
          response_id: aiResponseRatings.response_id,
          surface: aiResponseRatings.surface,
          rating: aiResponseRatings.rating,
          comment: aiResponseRatings.comment,
          rated_by: aiResponseRatings.rated_by,
          rated_at: aiResponseRatings.rated_at,
          client_id: aiResponseRatings.client_id,
        })
        .from(aiResponseRatings);

      const rows = await (where ? baseQuery.where(where) : baseQuery)
        .orderBy(desc(aiResponseRatings.rated_at))
        .limit(limit);

      // Lightweight aggregate so the analytics view can render a meter
      // without a second round-trip.
      const aggRows = await db
        .select({
          surface: aiResponseRatings.surface,
          rating: aiResponseRatings.rating,
          count: sql<number>`count(*)::int`,
        })
        .from(aiResponseRatings)
        .where(
          surfaceRaw && SURFACE_SET.has(surfaceRaw)
            ? eq(aiResponseRatings.surface, surfaceRaw)
            : sql`true`,
        )
        .groupBy(aiResponseRatings.surface, aiResponseRatings.rating);

      res.json({ rows, aggregates: aggRows });
    } catch (err: any) {
      log.error("recent list failed", { error: err?.message });
      res.status(500).json({ error: "list_failed" });
    }
  });

  /* ─── Per-response lookup (so the UI can hydrate prior state) ─── */
  app.get("/api/admin/ai/ratings/by-response", requireAdmin, async (req: Request, res: Response) => {
    const responseId = String(req.query.response_id ?? "").trim();
    if (!responseId) return res.status(400).json({ error: "missing_response_id" });

    const adminId = (req.user as Express.User).id;
    try {
      const rows = await db
        .select()
        .from(aiResponseRatings)
        .where(
          and(
            eq(aiResponseRatings.response_id, responseId),
            eq(aiResponseRatings.rated_by, adminId),
          ),
        )
        .limit(1);
      res.json({ rating: rows[0] ?? null });
    } catch (err: any) {
      log.error("by-response failed", { error: err?.message });
      res.status(500).json({ error: "lookup_failed" });
    }
  });
}
