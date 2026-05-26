/**
 * Portal SocialSync Approvals (Gmail-style inbox) — Wave 25.
 *
 * GET /api/portal/socialsync/approvals
 *   Returns paginated pending-approval posts shaped to feed the shared
 *   ApprovalInbox primitive (Wave 22C). Each row maps directly to InboxItem:
 *     id, kind=social_post, status=unread|approved|archived,
 *     title=caption first 60 chars, preview=full post_text,
 *     thumbnailUrl=media_plan.image_url, channelBadge=platform label,
 *     channelColor=platform color, createdAt=created_at.
 *
 *   This route DOES NOT duplicate the legacy approve/reject/edit endpoints
 *   under socialsync.ts. The Wave 25 dashboard calls those existing
 *   /api/portal/socialsync/posts/:id/{approve,reject} routes for the
 *   per-row Approve / Edit / Reject actions. We add only the listing here
 *   plus a "regenerate" trigger that queues a fresh ContentFlow draft.
 *
 * POST /api/portal/socialsync/approvals/:id/regenerate
 *   Triggers a regeneration request for the given pending post. Marks the
 *   post as cancelled and emits an activity-log event the worker picks up
 *   to enqueue a replacement draft. Returns ok.
 *
 * Auth: requireClient (list) + requireClient (regenerate).
 * adminPreviewSafe-wrapped — list returns empty shape, regenerate returns
 * 200 ok with persisted:false.
 */

import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import {
  socialsyncPosts,
  socialsyncActivityLogs,
} from "@shared/schema";
import { createLogger } from "../../../lib/logger";
import { withClientIdOrPreview } from "../../../middleware/adminPreviewSafe";

const log = createLogger("PortalSocialsyncApprovals");

const PLATFORM_COLORS: Record<string, string> = {
  facebook: "rgb(24, 119, 242)",
  instagram: "rgb(225, 48, 108)",
  linkedin: "rgb(10, 102, 194)",
  whatsapp: "rgb(37, 211, 102)",
  whatsapp_business: "rgb(37, 211, 102)",
  google_business: "rgb(66, 133, 244)",
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  whatsapp_business: "WhatsApp",
  google_business: "Google Business",
};

const EMPTY_RESPONSE = {
  previewMode: true,
  items: [] as unknown[],
  total: 0,
};

function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(200, Math.floor(n));
}

function clampOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function registerPortalSocialsyncApprovalsRoutes(app: Express) {
  app.get(
    "/api/portal/socialsync/approvals",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: EMPTY_RESPONSE,
        });
        if (clientId === null) return;

        const limit = clampLimit(req.query.limit);
        const offset = clampOffset(req.query.offset);

        const rows = await db
          .select({
            id: socialsyncPosts.id,
            platform: socialsyncPosts.platform,
            post_text: socialsyncPosts.post_text,
            caption: socialsyncPosts.caption,
            hashtags: socialsyncPosts.hashtags,
            media_plan: socialsyncPosts.media_plan,
            scheduled_for: socialsyncPosts.scheduled_for,
            created_at: socialsyncPosts.created_at,
            status: socialsyncPosts.status,
          })
          .from(socialsyncPosts)
          .where(
            and(
              eq(socialsyncPosts.client_id, clientId),
              eq(socialsyncPosts.status, "pending_approval"),
            ),
          )
          .orderBy(asc(socialsyncPosts.scheduled_for))
          .limit(limit)
          .offset(offset);

        const totalRow = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(socialsyncPosts)
          .where(
            and(
              eq(socialsyncPosts.client_id, clientId),
              eq(socialsyncPosts.status, "pending_approval"),
            ),
          );
        const total = Number(totalRow[0]?.n ?? 0);

        const items = rows.map((r) => {
          const platformKey = (r.platform || "").toLowerCase();
          const label = PLATFORM_LABELS[platformKey] ?? r.platform ?? "Unknown";
          const color = PLATFORM_COLORS[platformKey] ?? "rgb(148, 163, 184)";
          const mediaPlan = (r.media_plan ?? {}) as { image_url?: string };
          const captionFull = (r.caption || r.post_text || "").toString();
          const title = captionFull.slice(0, 60) + (captionFull.length > 60 ? "…" : "");
          return {
            id: String(r.id),
            kind: "social_post" as const,
            status: "unread" as const,
            createdAt: r.created_at?.toISOString?.() ?? new Date().toISOString(),
            title: title || `${label} post`,
            preview: captionFull,
            thumbnailUrl: mediaPlan.image_url ?? null,
            channelBadge: label,
            channelColor: color,
            hashtags: Array.isArray(r.hashtags) ? r.hashtags : [],
            scheduledFor: r.scheduled_for?.toISOString?.() ?? null,
            platform: platformKey,
          };
        });

        res.json({ items, total });
      } catch (err: any) {
        log.error("[portal/socialsync/approvals]", err?.message || err);
        res.status(500).json({ error: err?.message });
      }
    },
  );

  /**
   * POST /api/portal/socialsync/approvals/:id/regenerate
   * Cancels the existing draft and emits an activity log so the worker can
   * queue a regeneration via ContentFlow. We deliberately don't call into
   * ContentFlow inline here — the worker is the single source of truth for
   * post generation. Worst-case if the worker is offline, the post simply
   * stays cancelled until the next scheduled drafting pass.
   */
  app.post(
    "/api/portal/socialsync/approvals/:id/regenerate",
    requireClient,
    async (req: Request, res: Response) => {
      try {
        const clientId = await withClientIdOrPreview(req, res, {
          previewShape: { ok: true, persisted: false },
        });
        if (clientId === null) return;

        const postId = parseInt(req.params.id as string);
        if (isNaN(postId)) {
          return res.status(400).json({ error: "Invalid post id" });
        }

        const [post] = await db
          .select()
          .from(socialsyncPosts)
          .where(
            and(
              eq(socialsyncPosts.client_id, clientId),
              eq(socialsyncPosts.id, postId),
            ),
          )
          .limit(1);

        if (!post) return res.status(404).json({ error: "Post not found" });
        if (post.status !== "pending_approval") {
          return res
            .status(400)
            .json({
              error: `Post is "${post.status}" — only pending_approval posts can be regenerated`,
            });
        }

        await db
          .update(socialsyncPosts)
          .set({ status: "cancelled", failure_reason: "Regenerated by customer", updated_at: new Date() })
          .where(eq(socialsyncPosts.id, postId));

        await db.insert(socialsyncActivityLogs).values({
          client_id: clientId,
          entity_type: "post",
          entity_id: postId,
          action: "post.customer_regenerate_requested",
          status: "info",
          details: {
            original_post_id: postId,
            platform: post.platform,
            topic_id: post.topic_id,
            requested_via: "portal_inbox",
          },
        });

        res.json({ ok: true });
      } catch (err: any) {
        log.error(
          "[portal/socialsync/approvals/regenerate]",
          err?.message || err,
        );
        res.status(500).json({ error: err?.message });
      }
    },
  );
}
