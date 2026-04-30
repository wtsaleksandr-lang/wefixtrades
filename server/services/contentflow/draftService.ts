/**
 * ContentFlow — draft service.
 *
 * Creates `content_drafts` rows for content produced by surface services
 * (SocialSync, RankFlow). Keeps the kernel decoupled from surface tables —
 * the caller supplies a pre-persisted surface artefact and this service
 * records the unified draft plus the back-reference column.
 *
 * Sprint 1 exposes only the SocialSync path.
 */
import { storage } from "../../storage";
import { db } from "../../db";
import { socialsyncPosts } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { SocialSyncPost, ContentDraft } from "@shared/schema";
import { extractFromSocialPost } from "./qualityAdapter";
import { buildCalendarMetadata, type CalendarChannel } from "./calendarMetadata";
import type { ContentDraftStatus } from "./types";

export interface CreateSocialDraftInput {
  post: SocialSyncPost;
  initialStatus?: ContentDraftStatus;   // defaults to 'draft'
  requiresAdminReview?: boolean;        // defaults to false (Sprint 1: preserve silence-as-consent)
  requiresClientReview?: boolean;       // defaults to false
  createdBy?: "system" | "human";        // defaults to 'system'
}

/**
 * Create a content_drafts row for an existing SocialSync post and wire the
 * back-reference on socialsync_posts. Idempotent: if a draft already exists
 * for this post, the existing draft is returned and no duplicate is written.
 */
export async function createDraftFromSocialPost(
  input: CreateSocialDraftInput,
): Promise<ContentDraft> {
  const { post } = input;

  // Idempotency: one draft per social post (unique index at DB level).
  const existing = await storage.getContentDraftBySocialPostId(post.id);
  if (existing) return existing;

  const quality = extractFromSocialPost(post);
  const hashtags = (post.hashtags as string[] | null) ?? [];
  const mediaPlan = (post.media_plan as unknown) ?? null;

  /* Sprint 15: populate Sprint-14 calendar metadata so SocialSync drafts
   * land in the unified calendar view. Channel maps from post.platform. */
  const cfChannel: CalendarChannel | null =
    post.platform === "facebook" ? "facebook"
    : post.platform === "instagram" ? "instagram"
    : post.platform === "google_business" ? "google_business"
    : null;

  const draft = await storage.createContentDraft({
    client_id: post.client_id,
    client_service_id: null,                // Sprint 1 — not resolved yet
    kind: "social_post",
    surface: "socialsync",
    title: post.caption ?? null,
    body: post.post_text,
    excerpt: post.caption ?? null,
    target_platform: post.platform,
    target_url: null,
    metadata: {
      hashtags,
      media_plan: mediaPlan,
      duplicate_hash: post.duplicate_hash ?? null,
      topic_id: post.topic_id ?? null,
      scheduled_for: post.scheduled_for ?? null,
      ...(cfChannel
        ? {
            calendar: buildCalendarMetadata({
              channel: cfChannel,
              scheduled_for: post.scheduled_for ? post.scheduled_for.toISOString() : null,
              auto_generated: true,
              repurposed: false,
            }),
          }
        : {}),
    },
    quality_score: quality.score,
    quality_notes: { verdict: quality.verdict ?? null },
    status: input.initialStatus ?? "draft",
    auto_approved: false,
    requires_admin_review: input.requiresAdminReview ?? false,
    requires_client_review: input.requiresClientReview ?? false,
    admin_approved_at: null,
    admin_approved_by: null,
    client_approved_at: null,
    rejected_at: null,
    rejection_reason: null,
    linked_social_post_id: post.id,
    linked_task_id: null,
    generation_cost_micro_usd: null,        // Sprint 1 — filled by future cost tracker wiring
    created_by: input.createdBy ?? "system",
  });

  // Back-fill the surface's content_draft_id. Done via a targeted update
  // (not storage.updateSocialSyncPost) because that helper omits this
  // column from its insert schema; a direct Drizzle update avoids touching
  // existing typed update paths.
  await db.update(socialsyncPosts)
    .set({ content_draft_id: draft.id, updated_at: new Date() } as any)
    .where(eq(socialsyncPosts.id, post.id));

  return draft;
}

/* ─── Sprint 9: review-reply drafts ─────────────────────────────────── */

export interface CreateReviewReplyDraftInput {
  /** WeFixTrades client (clients.id). */
  clientId: number;
  /** DB id of the linked reviews row. */
  reviewId: number;
  /** Google API review id (last segment of the resource name). */
  externalReviewId: string;
  /** Star rating snapshot — drives quality + audit trail context. */
  starRating: number | null;
  /** AI-generated reply text. Stored verbatim in draft.body. */
  replyText: string;
  /** "auto" → draft is being created on the auto-approve path; "admin"/"client" reserved. */
  source?: "auto" | "admin" | "client";
}

/**
 * Sprint 9: create a content_drafts row of kind='review_reply' for a
 * review whose AI reply has just been generated. Caller decides whether
 * to autoApprove() + enqueue immediately based on the per-client policy.
 *
 * Idempotency: one draft per (clientId, externalReviewId). If one
 * exists, the existing row is returned without overwriting body.
 */
export async function createReviewReplyDraft(
  input: CreateReviewReplyDraftInput,
): Promise<ContentDraft> {
  const existing = await storage.getReviewReplyDraft(input.clientId, input.externalReviewId);
  if (existing) return existing;

  const draft = await storage.createContentDraft({
    client_id: input.clientId,
    client_service_id: null,
    kind: "review_reply",
    surface: "reputationshield",
    title: `Reply to ${input.starRating ?? "?"}-star review`,
    body: input.replyText,
    excerpt: null,
    target_platform: "google_business",
    target_url: null,
    metadata: {
      gbp: {
        review_id: input.reviewId,
        external_review_id: input.externalReviewId,
        source: input.source ?? "auto",
        star_rating: input.starRating,
        queue_status: null,
      },
    },
    quality_score: null,
    quality_notes: null,
    status: "draft",
    auto_approved: false,
    requires_admin_review: false,
    requires_client_review: false,
    admin_approved_at: null,
    admin_approved_by: null,
    client_approved_at: null,
    rejected_at: null,
    rejection_reason: null,
    linked_social_post_id: null,
    linked_task_id: null,
    generation_cost_micro_usd: null,
    created_by: "system",
  } as any);

  return draft;
}
