/**
 * Portal ReputationShield Platform Scorecard + Inbox feed — Wave 28.
 *
 * GET /api/portal/reputationshield/inbox
 *
 * Returns the last N (default 50) reviews for the customer mapped into
 * Wave 22C ApprovalInbox `InboxItem` shape. Each row includes the AI draft
 * (if generated) so the AIDraftEditor can render instantly without a
 * second fetch.
 *
 * The hero scorecard itself ships in dashboard-kpis.ts (`scorecard`), so
 * this route's only job is the inbox feed. Keeping the file name reflects
 * the cluster of "scorecard + inbox" review-side data.
 *
 * Anti-pattern avoided: do NOT auto-post AI replies. Status stays
 * `unread` until the customer explicitly approves via AIDraftEditor.
 *
 * Auth: requireClient. adminPreviewSafe-wrapped.
 */

import type { Express, Request, Response } from "express";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import { monitoredReviews } from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalReputationshieldInbox");

type InboxStatus =
  | "unread"
  | "starred"
  | "replied"
  | "approved"
  | "archived";

type Sentiment = "positive" | "neutral" | "negative";

interface InboxRow {
  id: string;
  platform: string;
  reviewer: string;
  rating: number;
  reviewText: string;
  publishedAt: string;
  status: InboxStatus;
  sentiment: Sentiment;
  responseText: string | null;
  draftResponse: string | null;
  draftModel: string | null;
  approvalStatus: string;
}

const EMPTY_RESPONSE = {
  previewMode: true,
  items: [] as InboxRow[],
};

function deriveStatus(r: {
  response_text: string | null;
  approval_status: string;
  is_new: boolean;
}): InboxStatus {
  if (r.approval_status === "approved" && !r.response_text) return "approved";
  if (r.response_text && r.response_text.trim().length > 0) return "replied";
  if (r.approval_status === "rejected") return "archived";
  return r.is_new ? "unread" : "starred";
}

function deriveSentiment(rating: number): Sentiment {
  if (rating >= 4) return "positive";
  if (rating === 3) return "neutral";
  return "negative";
}

export function registerPortalReputationshieldInboxRoutes(app: Express) {
  app.get(
    "/api/portal/reputationshield/inbox",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const limit = Math.min(
          200,
          Math.max(1, Number(req.query.limit) || 50),
        );

        const rows = await db
          .select({
            id: monitoredReviews.id,
            platform: monitoredReviews.platform,
            reviewer_name: monitoredReviews.reviewer_name,
            rating: monitoredReviews.rating,
            review_text: monitoredReviews.review_text,
            published_at: monitoredReviews.published_at,
            response_text: monitoredReviews.response_text,
            draft_response: monitoredReviews.draft_response,
            draft_model: monitoredReviews.draft_model,
            approval_status: monitoredReviews.approval_status,
            is_new: monitoredReviews.is_new,
          })
          .from(monitoredReviews)
          .where(eq(monitoredReviews.client_id, clientId))
          .orderBy(desc(monitoredReviews.published_at))
          .limit(limit);

        const items: InboxRow[] = rows.map((r) => ({
          id: String(r.id),
          platform: (r.platform ?? "google").toLowerCase(),
          reviewer: r.reviewer_name ?? "Anonymous",
          rating: r.rating ?? 0,
          reviewText: r.review_text ?? "",
          publishedAt: (r.published_at ?? new Date()).toISOString(),
          status: deriveStatus({
            response_text: r.response_text,
            approval_status: r.approval_status ?? "unreviewed",
            is_new: r.is_new ?? true,
          }),
          sentiment: deriveSentiment(r.rating ?? 0),
          responseText: r.response_text,
          draftResponse: r.draft_response,
          draftModel: r.draft_model,
          approvalStatus: r.approval_status ?? "unreviewed",
        }));

        res.json({ items });
      } catch (err: any) {
        log.error(
          "[portal/reputationshield/inbox]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
