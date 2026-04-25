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
