/**
 * Portal ReputationShield Save Reply — Wave 28.
 *
 * POST /api/portal/reputationshield/reviews/:id/reply
 *
 * Persists the final reply text from the AIDraftEditor onto a monitored
 * review row. Mirrors the admin-side review-management infrastructure but
 * is restricted to the customer's own reviews.
 *
 * Anti-pattern avoided: do NOT auto-post via the Google Business Profile
 * API in this route. Posting back to Google requires GBP OAuth tokens
 * which live behind admin-side flows; for the customer dashboard we
 * persist the approved reply text + flip approval_status to "approved" so
 * the existing reply-poster worker picks it up on its next pass.
 *
 * Auth: requireClient + reputationshield service ownership.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { monitoredReviews } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalReputationshieldSaveReply");

const bodySchema = z.object({
  reply: z.string().min(1).max(8_000),
});

const PREVIEW_RESPONSE = {
  previewMode: true,
  ok: true as const,
  message: "Preview mode — reply not saved.",
};

export function registerPortalReputationshieldSaveReplyRoutes(app: Express) {
  app.post(
    "/api/portal/reputationshield/reviews/:id/reply",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: PREVIEW_RESPONSE,
          mode: "write",
          action: "reputationshield.save-reply",
        });
        if (clientId === null) return;

        const reviewId = Number(req.params.id);
        if (!Number.isFinite(reviewId)) {
          return res.status(400).json({ error: "Invalid review id" });
        }

        const parsed = bodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid body",
            details: parsed.error.flatten(),
          });
        }

        // Verify ownership before mutating.
        const [row] = await db
          .select({
            id: monitoredReviews.id,
            client_id: monitoredReviews.client_id,
          })
          .from(monitoredReviews)
          .where(eq(monitoredReviews.id, reviewId))
          .limit(1);
        if (!row || row.client_id !== clientId) {
          return res.status(404).json({ error: "Review not found" });
        }

        await db
          .update(monitoredReviews)
          .set({
            draft_response: parsed.data.reply,
            draft_generated_at: new Date(),
            draft_model: "customer_approved",
            approval_status: "approved",
            approved_at: new Date(),
            requires_approval: false,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(monitoredReviews.id, reviewId),
              eq(monitoredReviews.client_id, clientId),
            ),
          );

        log.info("reputationshield.reply.saved", { clientId, reviewId });
        res.json({
          ok: true,
          message:
            "Reply approved. Posting to the platform within the next sync cycle.",
        });
      } catch (err: any) {
        log.error(
          "[portal/reputationshield/save-reply]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
