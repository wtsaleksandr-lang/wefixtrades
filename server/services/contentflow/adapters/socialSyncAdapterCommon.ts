/**
 * ContentFlow — shared helpers for SocialSync adapters (Sprint 10).
 *
 * Facebook / Instagram / GBP-Post adapters all share the same flow:
 *   1. Validate draft kind/status + load linked SocialSyncPost row.
 *   2. Check cooldown — if cooling, return cooling_down (queue
 *      treats this specially: keep queued, don't bump attempts).
 *   3. Call platform publisher with timing.
 *   4. On success: persist remote_post_id + posted_at on the draft;
 *      flip socialsync_posts to status='published'; record success
 *      in cooldownManager.
 *   5. On failure: classify (permanent/rate-limit/transient), record
 *      in cooldownManager, fire alert when warranted, return.
 *
 * Metrics: every dispatch logs a single structured line with prefix
 * `[contentflow][metrics][adapter]` carrying success/duration_ms +
 * the failure reason. The queue's runJob wrapper aggregates per-tick
 * counts into job_logs.metadata for retroactive inspection. No
 * separate metrics table.
 */

import { storage } from "../../../storage";
import { checkCooldown, recordSuccess, recordRateLimit, recordFailure, recordPermanentFailure } from "../../socialSync/cooldownManager";
import { sendAlert, buildPublishFailuresAlert, buildRateLimitedAlert, isAlertingConfigured } from "../../socialSync/alertService";
import type {
  PublishAdapter,
  PublishAdapterOptions,
  PublishResult,
  AdapterFailureReason,
  AdapterType,
} from "./types";
import type { ContentDraft, SocialSyncPost } from "@shared/schema";

export type SupportedSocialPlatform = "facebook" | "instagram" | "google_business";
export type SocialAdapterType = "facebook" | "instagram" | "gbp_post";

/** Normalised publish result shape every SocialSync publisher returns. */
export interface NormalisedPublishOutcome {
  success: boolean;
  remote_post_id?: string | null;
  page_id?: string | null;
  published_at?: string | null;
  error?: string;
  error_code?: number | string;
  permanent_failure?: boolean;
  rate_limited?: boolean;
  raw?: Record<string, unknown>;
}

interface DispatchInput {
  draft: ContentDraft;
  platform: SupportedSocialPlatform;
  adapterType: SocialAdapterType;
  /** Calls the existing SocialSync publisher. */
  publish: (clientId: number, post: SocialSyncPost) => Promise<NormalisedPublishOutcome>;
  /** Metadata sub-object key on content_drafts.metadata. */
  metadataKey: "facebook" | "instagram" | "gbp_post";
}

function normaliseReason(outcome: NormalisedPublishOutcome): AdapterFailureReason {
  if (outcome.rate_limited) return "rate_limit";
  if (outcome.permanent_failure) {
    /* Map invalid-token / no-permission to 'auth' so the queue worker
     * dead-letters fast (no point retrying on bad creds). */
    const code = String(outcome.error_code ?? "");
    if (code === "190" || code === "200" || code === "401" || code === "403") return "auth";
    return "validation";
  }
  return "transient";
}

async function persistDraftSuccess(
  draftId: number,
  metadataKey: string,
  outcome: NormalisedPublishOutcome,
): Promise<void> {
  const fresh = await storage.getContentDraftById(draftId);
  if (!fresh) return;
  const meta = (fresh.metadata || {}) as Record<string, any>;
  const existing = (meta[metadataKey] || {}) as Record<string, any>;
  await storage.updateContentDraft(draftId, {
    status: "published",
    target_url: outcome.remote_post_id ? String(outcome.remote_post_id) : fresh.target_url,
    metadata: {
      ...meta,
      [metadataKey]: {
        ...existing,
        remote_post_id: outcome.remote_post_id ?? null,
        page_id: outcome.page_id ?? null,
        posted_at: outcome.published_at ?? new Date().toISOString(),
        error: null,
        last_error: null,
      },
    },
  } as any);
}

async function persistDraftFailure(
  draftId: number,
  metadataKey: string,
  errorMsg: string,
): Promise<void> {
  try {
    const fresh = await storage.getContentDraftById(draftId);
    if (!fresh) return;
    const meta = (fresh.metadata || {}) as Record<string, any>;
    const existing = (meta[metadataKey] || {}) as Record<string, any>;
    await storage.updateContentDraft(draftId, {
      metadata: {
        ...meta,
        [metadataKey]: {
          ...existing,
          error: errorMsg.slice(0, 500),
        },
      },
    } as any);
  } catch (err: any) {
    console.error(`[contentflow][adapter][${metadataKey}] failed to persist failure for draft ${draftId}: ${err?.message || err}`);
  }
}

async function persistOnSocialSyncPost(
  postId: number,
  outcome: NormalisedPublishOutcome,
): Promise<void> {
  try {
    if (outcome.success) {
      await storage.updateSocialSyncPost(postId, {
        status: "published",
        remote_post_id: outcome.remote_post_id ?? null,
        published_at: outcome.published_at ? new Date(outcome.published_at) : new Date(),
        last_error: null,
      } as any);
    } else {
      await storage.updateSocialSyncPost(postId, {
        last_error: outcome.error ?? null,
      } as any);
    }
  } catch (err: any) {
    console.error(`[contentflow][adapter] socialsync_posts ${postId} update failed: ${err?.message || err}`);
  }
}

/**
 * Sprint 10: shared dispatch entry point used by all 3 social adapters.
 * Encapsulates cooldown check, timing, classification, persistence,
 * and alert routing.
 */
export async function dispatchSocialPublish(input: DispatchInput): Promise<PublishResult> {
  const { draft, platform, metadataKey, publish } = input;
  const logPrefix = `[contentflow][adapter][${metadataKey}]`;
  const t0 = Date.now();

  if (draft.kind !== "social_post" && draft.kind !== "carousel_post" && draft.kind !== "google_post") {
    return { ok: false, reason: "wrong_kind", message: `${metadataKey}Adapter only handles social_post/carousel_post/google_post (got '${draft.kind}')`, retryable: false };
  }
  if (draft.status !== "approved") {
    return { ok: false, reason: "not_approved", message: `draft ${draft.id} status is ${draft.status}, not 'approved'`, retryable: false };
  }
  if (!draft.linked_social_post_id) {
    return { ok: false, reason: "validation", message: `draft ${draft.id} missing linked_social_post_id`, retryable: false };
  }

  const meta = (draft.metadata || {}) as Record<string, any>;
  const channelMeta = (meta[metadataKey] || {}) as Record<string, any>;
  /* Defence-in-depth: never re-publish if posted_at is already set. */
  if (channelMeta.posted_at || channelMeta.remote_post_id) {
    return { ok: true, externalId: channelMeta.remote_post_id ?? undefined, raw: { already_posted_at: channelMeta.posted_at } };
  }

  /* Cooldown check — if cooling, return special reason so the queue
   * worker leaves the draft queued without bumping attempts. */
  const cooldown = await checkCooldown(draft.client_id, platform);
  if (cooldown.coolingDown) {
    const msg = `Client ${draft.client_id}/${platform} cooling down (${cooldown.minutesLeft}min left: ${cooldown.reason})`;
    console.log(`${logPrefix} draft=${draft.id} cooling_down — ${cooldown.reason}, ${cooldown.minutesLeft}min`);
    console.log(`[contentflow][metrics][adapter] type=${metadataKey} draft=${draft.id} outcome=cooling_down duration_ms=${Date.now() - t0}`);
    return { ok: false, reason: "cooling_down", message: msg, retryable: true };
  }

  /* Load linked SocialSyncPost. The publishers expect this shape. */
  const post = await storage.getSocialSyncPostById(draft.linked_social_post_id);
  if (!post) {
    await persistDraftFailure(draft.id, metadataKey, `linked SocialSyncPost ${draft.linked_social_post_id} not found`);
    return { ok: false, reason: "validation", message: `linked SocialSyncPost not found`, retryable: false };
  }

  let outcome: NormalisedPublishOutcome;
  try {
    outcome = await publish(draft.client_id, post);
  } catch (err: any) {
    const msg = err?.message || String(err);
    await persistDraftFailure(draft.id, metadataKey, msg);
    console.error(`${logPrefix} draft=${draft.id} threw:`, msg);
    console.log(`[contentflow][metrics][adapter] type=${metadataKey} draft=${draft.id} outcome=throw duration_ms=${Date.now() - t0}`);
    return { ok: false, reason: "transient", message: msg, retryable: true };
  }

  const durationMs = Date.now() - t0;

  if (outcome.success) {
    await persistDraftSuccess(draft.id, metadataKey, outcome);
    await persistOnSocialSyncPost(post.id, outcome);
    await recordSuccess(draft.client_id, platform).catch(() => {});
    console.log(`${logPrefix} draft=${draft.id} client=${draft.client_id} posted ok remote=${outcome.remote_post_id} duration_ms=${durationMs}`);
    console.log(`[contentflow][metrics][adapter] type=${metadataKey} draft=${draft.id} outcome=success duration_ms=${durationMs}`);
    return {
      ok: true,
      externalId: outcome.remote_post_id ?? undefined,
      externalUrl: undefined,
      raw: { page_id: outcome.page_id ?? null, published_at: outcome.published_at ?? null, ...(outcome.raw || {}) },
    };
  }

  /* Failure path. */
  const errorMsg = outcome.error ?? "unknown publisher error";
  await persistDraftFailure(draft.id, metadataKey, errorMsg);
  await persistOnSocialSyncPost(post.id, outcome);

  /* Cooldown bookkeeping + alert routing. */
  if (outcome.rate_limited) {
    await recordRateLimit(draft.client_id, platform).catch(() => {});
    if (isAlertingConfigured()) {
      sendAlert(buildRateLimitedAlert(draft.client_id, platform, errorMsg)).catch(() => {});
    }
  } else if (outcome.permanent_failure) {
    await recordPermanentFailure(draft.client_id, platform, errorMsg).catch(() => {});
    if (isAlertingConfigured()) {
      sendAlert(buildPublishFailuresAlert(draft.client_id, null, platform, 1)).catch(() => {});
    }
  } else {
    await recordFailure(draft.client_id, platform).catch(() => {});
  }

  const reason = normaliseReason(outcome);
  console.error(`${logPrefix} draft=${draft.id} send_failed reason=${reason} code=${outcome.error_code ?? ""} msg=${errorMsg}`);
  console.log(`[contentflow][metrics][adapter] type=${metadataKey} draft=${draft.id} outcome=failure reason=${reason} duration_ms=${durationMs}`);

  const retryable = !outcome.permanent_failure;
  return {
    ok: false,
    reason,
    message: errorMsg,
    retryable,
  };
}

export function makeSocialAdapter(args: {
  type: AdapterType;
  metadataKey: "facebook" | "instagram" | "gbp_post";
  platform: SupportedSocialPlatform;
  publish: (clientId: number, post: SocialSyncPost) => Promise<NormalisedPublishOutcome>;
}): PublishAdapter {
  return {
    type: args.type,
    async publish(draft: ContentDraft, _opts: PublishAdapterOptions = {}): Promise<PublishResult> {
      return dispatchSocialPublish({
        draft,
        platform: args.platform,
        adapterType: args.metadataKey,
        metadataKey: args.metadataKey,
        publish: args.publish,
      });
    },
  };
}
