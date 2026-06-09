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
 *   Regenerates the given pending post SYNCHRONOUSLY. Re-runs the same
 *   generate→draft→approve→enqueue path the SocialSync orchestrator uses
 *   (generatePostFromTopic + createDraftFromSocialPost + autoApproveDraft +
 *   enqueueSocialSyncDraft), producing a brand-new pending_approval post on
 *   the same topic/platform/schedule, then cancels the original. Returns the
 *   new post so the inbox can swap it in. On generation failure the original
 *   post is LEFT pending_approval (never cancelled into a void) and a real
 *   error is returned — no fake success, no vanishing post.
 *
 * Auth: requireClient (list) + requireClient (regenerate).
 * adminPreviewSafe-wrapped — list returns empty shape, regenerate returns
 * 200 ok with persisted:false.
 */

import type { Express, Request, Response } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireClient } from "../../../auth";
import { db } from "../../../db";
import {
  socialsyncPosts,
  socialsyncTopics,
  socialsyncActivityLogs,
} from "@shared/schema";
import { storage } from "../../../storage";
import { generatePostFromTopic } from "../../../services/socialSync/contentGenerator";
import { createDraftFromSocialPost } from "../../../services/contentflow/draftService";
import { autoApproveDraft } from "../../../services/contentflow/approvalService";
import { enqueueSocialSyncDraft } from "../../../services/contentflow/wordpressQueue";
import { generateForDraft as generateImageForDraft } from "../../../services/contentflow/imageGenerationService";
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
   *
   * Real, synchronous regeneration. We re-run the same pipeline the
   * orchestrator uses for a fresh weekly post:
   *   1. Load the client's SocialSync profile + the original post's topic
   *      (reset to 'active' so the generator can consume it again).
   *   2. generatePostFromTopic(...) → a new socialsync_post (status 'ready').
   *   3. createDraftFromSocialPost → image gen (FB/IG/GBP) → autoApproveDraft
   *      → enqueueSocialSyncDraft → flip the new post to 'pending_approval'.
   *   4. Only AFTER the replacement is safely pending_approval do we cancel
   *      the original. If anything in 1-3 fails we leave the original
   *      pending_approval untouched and return a real error — the post never
   *      silently vanishes.
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

        // 1. Need a topic to regenerate from. Topic-driven posts only.
        if (!post.topic_id) {
          return res.status(422).json({
            error:
              "This post has no source topic, so it can't be regenerated automatically. Edit it instead.",
          });
        }

        const profile = await storage.getSocialSyncProfile(clientId);
        if (!profile) {
          return res
            .status(422)
            .json({ error: "No SocialSync profile found for this client" });
        }

        const [topic] = await db
          .select()
          .from(socialsyncTopics)
          .where(
            and(
              eq(socialsyncTopics.client_id, clientId),
              eq(socialsyncTopics.id, post.topic_id),
            ),
          )
          .limit(1);
        if (!topic) {
          return res
            .status(422)
            .json({ error: "Source topic no longer exists; cannot regenerate" });
        }

        // Reset the topic to 'active' so the generator will use it (it marks
        // it 'used' again on success).
        await storage.updateSocialSyncTopic(topic.id, { status: "active" } as any);

        // 2. Generate a fresh post on the same platform + schedule.
        //    Signature: generatePostFromTopic(profile, topic, platform, scheduledFor?)
        const genResult = await generatePostFromTopic(
          profile,
          { ...topic, status: "active" } as any,
          post.platform,
          post.scheduled_for ?? undefined,
        );

        if (!genResult.post) {
          // Real failure — original post is untouched, still pending_approval.
          const reason =
            genResult.rejectionReason ?? genResult.error ?? "Generation produced no post";
          await db.insert(socialsyncActivityLogs).values({
            client_id: clientId,
            entity_type: "post",
            entity_id: postId,
            action: "post.customer_regenerate_failed",
            status: "failure",
            details: {
              original_post_id: postId,
              platform: post.platform,
              topic_id: post.topic_id,
              reason,
              requested_via: "portal_inbox",
            },
          });
          log.warn(
            `[portal/socialsync/approvals/regenerate] gen failed post=${postId} reason=${reason}`,
          );
          return res.status(502).json({
            error: `Couldn't regenerate this post: ${reason}. The original is still here — try again or edit it.`,
          });
        }

        const newPost = genResult.post;

        // 3. Run the ContentFlow draft → image → approve → enqueue tail, then
        //    flip the new post to pending_approval (mirrors the orchestrator).
        try {
          const draft = await createDraftFromSocialPost({ post: newPost });

          const platformsWithImage = new Set([
            "facebook",
            "instagram",
            "google_business",
          ]);
          if (platformsWithImage.has(newPost.platform)) {
            // generateForDraft swallows its own failures and returns a marker;
            // text-only fallback is acceptable for FB/GBP, IG self-gates.
            const imageRes = await generateImageForDraft(draft.id);
            if (!imageRes.ok && imageRes.reason !== "skipped_already_has_image") {
              log.warn(
                `[portal/socialsync/approvals/regenerate] image-gen draft=${draft.id} reason=${imageRes.reason}`,
              );
            }
          }

          await autoApproveDraft({
            draftId: draft.id,
            notes: `Customer-regenerated — quality score ${newPost.quality_score ?? 0}`,
          });

          await enqueueSocialSyncDraft(draft.id, {
            scheduled_for: (post.scheduled_for ?? new Date()).toISOString(),
          });

          await storage.updateSocialSyncPost(newPost.id, {
            status: "pending_approval",
          } as any);
        } catch (cfErr: any) {
          // Replacement couldn't be staged. Mark the new post failed (real
          // state, not silent) and LEAVE the original pending_approval.
          await storage
            .updateSocialSyncPost(newPost.id, {
              status: "failed",
              failure_reason: `Regenerate staging failed: ${cfErr?.message || cfErr}`,
            } as any)
            .catch((e) => log.warn(`[portal/socialsync/approvals/regenerate] mark-failed update errored new=${newPost.id}`, { error: String(e) }));
          log.error(
            `[portal/socialsync/approvals/regenerate] staging failed new=${newPost.id}: ${cfErr?.message || cfErr}`,
          );
          return res.status(502).json({
            error:
              "Generated a new post but couldn't schedule it. The original is still here — please try again.",
          });
        }

        // 4. Replacement is safely pending_approval — now retire the original.
        await db
          .update(socialsyncPosts)
          .set({
            status: "cancelled",
            failure_reason: "Replaced by customer regeneration",
            updated_at: new Date(),
          })
          .where(eq(socialsyncPosts.id, postId));

        await db.insert(socialsyncActivityLogs).values({
          client_id: clientId,
          entity_type: "post",
          entity_id: postId,
          action: "post.customer_regenerated",
          status: "success",
          details: {
            original_post_id: postId,
            new_post_id: newPost.id,
            platform: post.platform,
            topic_id: post.topic_id,
            requested_via: "portal_inbox",
          },
        });

        res.json({ ok: true, newPostId: newPost.id });
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
