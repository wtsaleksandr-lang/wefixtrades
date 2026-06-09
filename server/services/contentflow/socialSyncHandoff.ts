/**
 * ContentFlow → SocialSync handoff.
 *
 * The portal ContentFlow generator writes a `content_drafts` row with
 * surface='contentflow_portal' for every generation (image / article /
 * multi). Until now those rows dead-ended: the customer could view/download
 * them but had no way to push a generated asset into SocialSync's scheduling
 * + publishing pipeline.
 *
 * This service bridges that gap. Given a `content_drafts` id (already
 * tenant-checked by the caller), it creates a matching `socialsync_posts`
 * row via `storage.createSocialSyncPost` and wires the two-way back-reference
 * the platform relies on for status-sync:
 *
 *   socialsync_posts.content_draft_id   → content_drafts.id   (reverse link)
 *   content_drafts.linked_social_post_id → socialsync_posts.id (forward link)
 *
 * The forward link is enforced UNIQUE at the DB level
 * (`content_drafts_linked_social_uidx`), so this is idempotent: a draft that
 * already points at a SocialSync post returns that post instead of creating
 * a duplicate.
 *
 * Mapping rules (ContentFlow portal draft → SocialSync post):
 *   - platform        ← caller-chosen target (facebook|instagram|
 *                        google_business|linkedin); defaults to 'facebook'.
 *   - post_text       ← the article/caption body when present, else the
 *                        rendered prompt, else the draft title. Never empty
 *                        (post_text is NOT NULL).
 *   - caption         ← draft.excerpt or title.
 *   - media_plan      ← the generated image URL (data URI or https from R2)
 *                        when the draft carries one, shaped as
 *                        { type:'image', url, prompt }.
 *   - status          ← 'draft' (the customer still approves/schedules in
 *                        SocialSync; we never auto-publish here).
 *   - scheduled_for   ← optional caller-supplied ISO datetime.
 *
 * This module deliberately does NOT touch the SocialSync route files — it
 * only calls the public `storage.createSocialSyncPost` helper and performs a
 * single targeted Drizzle update for the reverse back-ref (mirroring the
 * existing `draftService.createDraftFromSocialPost` pattern, which the
 * typed update helper can't express because it omits content_draft_id).
 */

import crypto from "crypto";
import { eq } from "drizzle-orm";
import { storage } from "../../storage";
import { db } from "../../db";
import { socialsyncPosts } from "@shared/schema";
import type { ContentDraft, SocialSyncPost } from "@shared/schema";
import { createLogger } from "../../lib/logger";

const log = createLogger("ContentflowSocialSyncHandoff");

const VALID_PLATFORMS = new Set(["facebook", "instagram", "google_business", "linkedin"]);

export interface ScheduleToSocialSyncInput {
  /** The already-tenant-checked ContentFlow portal draft. */
  draft: ContentDraft;
  /** Target social platform. Defaults to 'facebook' when omitted/invalid. */
  platform?: string;
  /** Optional ISO-8601 datetime the customer wants the post scheduled for. */
  scheduledFor?: string | null;
}

export interface ScheduleToSocialSyncResult {
  post: SocialSyncPost;
  /** true when an existing linked post was returned instead of a new one. */
  reused: boolean;
}

/** Pull the best image URL the draft carries (data URI or https). */
function extractImageUrl(draft: ContentDraft): string | null {
  const meta = (draft.metadata as Record<string, any> | null) ?? null;
  if (!meta) return null;
  const mp = meta.media_plan && typeof meta.media_plan === "object" ? meta.media_plan : null;
  const url = mp?.image_url ?? mp?.url ?? null;
  return typeof url === "string" && url.length > 0 ? url : null;
}

/** Pull the rendered prompt the draft was generated from (for media_plan.prompt). */
function extractRenderedPrompt(draft: ContentDraft): string | null {
  const meta = (draft.metadata as Record<string, any> | null) ?? null;
  const p = meta?.rendered_prompt;
  return typeof p === "string" && p.length > 0 ? p : null;
}

/**
 * Create (or return the existing) SocialSync post for a ContentFlow portal
 * draft. The caller MUST have verified draft.client_id === sessionClientId
 * before calling — this service trusts the supplied draft's client_id and
 * writes the post under it.
 */
export async function scheduleDraftToSocialSync(
  input: ScheduleToSocialSyncInput,
): Promise<ScheduleToSocialSyncResult> {
  const { draft } = input;

  /* Idempotency: one SocialSync post per draft. The forward link is UNIQUE,
   * so if the draft already points at a post, return it. */
  if (draft.linked_social_post_id) {
    const existing = await storage.getSocialSyncPostById(draft.linked_social_post_id);
    if (existing) return { post: existing, reused: true };
  }

  const platform =
    input.platform && VALID_PLATFORMS.has(input.platform) ? input.platform : "facebook";

  /* post_text is NOT NULL — pick the richest non-empty source. */
  const body = (draft.body ?? "").trim();
  const rendered = extractRenderedPrompt(draft);
  const title = (draft.title ?? "").trim();
  const excerpt = (draft.excerpt ?? "").trim();
  const postText = body || rendered || title || "Generated with ContentFlow";

  const caption = excerpt || title || null;
  const imageUrl = extractImageUrl(draft);
  const mediaPlan = imageUrl
    ? { type: "image", url: imageUrl, prompt: rendered ?? undefined }
    : null;

  const duplicateHash = crypto
    .createHash("sha256")
    .update(postText.trim().toLowerCase())
    .digest("hex");

  let scheduledFor: Date | null = null;
  if (input.scheduledFor) {
    const d = new Date(input.scheduledFor);
    if (!Number.isNaN(d.getTime())) scheduledFor = d;
  }

  const post = await storage.createSocialSyncPost({
    client_id: draft.client_id,
    topic_id: null,
    platform,
    post_text: postText,
    caption,
    hashtags: null,
    media_plan: mediaPlan,
    status: "draft",
    duplicate_hash: duplicateHash,
    scheduled_for: scheduledFor,
    created_by_system: false,
    content_draft_id: draft.id,
  } as any);

  /* Wire the forward link on the draft so SocialSync status-sync can find
   * its way back, and the unique index keeps this 1:1. */
  await storage.updateContentDraft(draft.id, {
    linked_social_post_id: post.id,
    target_platform: platform,
  } as any);

  /* Activity-log on the SocialSync side so the handoff is visible in the
   * SocialSync audit trail (mirrors socialSyncRoutes create-from-topic). */
  try {
    await storage.createSocialSyncLog({
      client_id: draft.client_id,
      entity_type: "post",
      entity_id: post.id,
      action: "post.created",
      status: "success",
      details: { source: "contentflow_portal_handoff", content_draft_id: draft.id, platform },
    });
  } catch (err: any) {
    /* Non-fatal: the post + links are already persisted. Surface, don't swallow. */
    log.warn("[handoff] activity-log write failed (post already created)", {
      draft_id: draft.id,
      post_id: post.id,
      err: err?.message,
    });
  }

  return { post, reused: false };
}
