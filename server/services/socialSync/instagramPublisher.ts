/**
 * Instagram post publishing service for SocialSync.
 *
 * Publishes image posts to a client's selected Instagram business account
 * via the Instagram Graph API (Content Publishing flow).
 *
 * Instagram publishing flow:
 *   1. POST /{ig-account-id}/media — create a media container
 *      Required: image_url (publicly accessible), caption
 *   2. POST /{ig-account-id}/media_publish — publish the container
 *      Required: creation_id from step 1
 *
 * IMPORTANT: Instagram does NOT support text-only posts via the Graph API.
 * A publicly accessible image URL is required for every publish.
 *
 * This service uses the page-level access token stored in the Instagram
 * connection record (same token that grants Instagram API access via
 * the linked Facebook page).
 */
import { getInstagramPublishCredentials } from "./instagramService";
import { ensureMediaReady } from "./mediaService";
import type { SocialSyncPost } from "@shared/schema";

/* Sprint 10: dev-test override (mirrors facebookPublisher pattern). */
const GRAPH_API_BASE_DEFAULT = "https://graph.facebook.com/v21.0";
function getGraphApiBase(): string {
  if (process.env.NODE_ENV !== "production" && process.env.IG_GRAPH_API_BASE_OVERRIDE) {
    return process.env.IG_GRAPH_API_BASE_OVERRIDE;
  }
  return GRAPH_API_BASE_DEFAULT;
}

/* ─── Content constraints ─── */

const IG_MAX_CAPTION_LENGTH = 2200;
const IG_MAX_HASHTAGS = 30;

/* ─── Error classification ─── */

const PERMANENT_ERROR_CODES = new Set([
  190,       // Invalid/expired access token
  10,        // Application does not have permission
  100,       // Invalid parameter
  36003,     // Media URL invalid or not reachable
  36000,     // Image too small / not meeting requirements
  2207026,   // Cannot create container (various reasons)
  368,       // Content blocked by policy
  9007,      // The post was deleted
]);

const PERMANENT_ERROR_SUBCODE = new Set([
  2207024,   // Media URL not reachable
]);

/** Rate limit codes — retryable with backoff. */
const RATE_LIMIT_CODES = new Set([
  4,         // Application request limit
  17,        // User request limit
  32,        // Page request limit
]);

const RATE_LIMIT_SUBCODES = new Set([
  2207050,   // Content publishing rate limit (daily)
]);

export function isRateLimitError(errorCode?: number, errorSubcode?: number): boolean {
  if (errorCode && RATE_LIMIT_CODES.has(errorCode)) return true;
  if (errorSubcode && RATE_LIMIT_SUBCODES.has(errorSubcode)) return true;
  return false;
}

function classifyError(errorCode?: number, errorSubcode?: number): boolean {
  // Rate limits are transient, not permanent
  if (isRateLimitError(errorCode, errorSubcode)) return false;
  if (errorCode && PERMANENT_ERROR_CODES.has(errorCode)) return true;
  if (errorSubcode && PERMANENT_ERROR_SUBCODE.has(errorSubcode)) return true;
  return false;
}

/* ─── Types ─── */

export interface InstagramPublishResult {
  success: boolean;
  platform: "instagram";
  remote_post_id: string | null;
  container_id: string | null;
  ig_account_id: string;
  published_at: string | null;
  error?: string;
  error_code?: number;
  error_subcode?: number;
  permanent_failure?: boolean;
  raw_response_summary?: Record<string, any>;
}

/* ─── Validation ─── */

function extractImageUrl(post: SocialSyncPost): string | null {
  const mediaPlan = post.media_plan as Record<string, any> | null;
  if (!mediaPlan) return null;

  // Check for explicit public image URL
  const url = mediaPlan.image_url || mediaPlan.public_image_url || mediaPlan.url || null;
  if (!url || typeof url !== "string") return null;

  // Basic URL validation
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function buildInstagramCaption(post: SocialSyncPost): string {
  let caption = post.caption || post.post_text;

  // Trim to Instagram limit
  if (caption.length > IG_MAX_CAPTION_LENGTH) {
    caption = caption.slice(0, IG_MAX_CAPTION_LENGTH - 3) + "...";
  }

  // Append hashtags
  const hashtags = post.hashtags as string[] | null;
  if (hashtags && hashtags.length > 0) {
    const limited = hashtags.slice(0, IG_MAX_HASHTAGS);
    const hashtagStr = limited.map(h => `#${h.replace(/^#/, "")}`).join(" ");
    const combined = `${caption}\n\n${hashtagStr}`;
    // Re-check total length
    if (combined.length <= IG_MAX_CAPTION_LENGTH) {
      caption = combined;
    }
  }

  return caption;
}

/* ─── Graph API helpers ─── */

async function createMediaContainer(
  igAccountId: string,
  token: string,
  imageUrl: string,
  caption: string,
): Promise<{ id: string } | { error: any }> {
  const url = new URL(`${getGraphApiBase()}/${igAccountId}/media`);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
    }),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    return { error: data.error || { message: res.statusText } };
  }

  return { id: data.id };
}

async function publishMediaContainer(
  igAccountId: string,
  token: string,
  containerId: string,
): Promise<{ id: string } | { error: any }> {
  const url = new URL(`${getGraphApiBase()}/${igAccountId}/media_publish`);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: containerId,
    }),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    return { error: data.error || { message: res.statusText } };
  }

  return { id: data.id };
}

/* ─── Publish ─── */

/**
 * Publish an image post to a client's selected Instagram business account.
 *
 * Requires: A connected Instagram account AND a publicly accessible image URL
 * in post.media_plan.image_url (or .public_image_url or .url).
 *
 * Instagram does not support text-only posts via the Graph API.
 */
export async function publishToInstagram(
  clientId: number,
  post: SocialSyncPost,
): Promise<InstagramPublishResult> {
  const emptyResult = (error: string, permanent: boolean): InstagramPublishResult => ({
    success: false,
    platform: "instagram",
    remote_post_id: null,
    container_id: null,
    ig_account_id: "",
    published_at: null,
    error,
    permanent_failure: permanent,
  });

  // 1. Get credentials
  const credentials = await getInstagramPublishCredentials(clientId);
  if (!credentials) {
    return emptyResult(
      "No active Instagram connection found. Account may be disconnected, token may be expired, or no IG account selected.",
      true,
    );
  }

  const { token, igAccountId } = credentials;

  // 2. Resolve image URL — try existing URL first, then generate if possible
  let imageUrl = extractImageUrl(post);
  if (!imageUrl) {
    const mediaResult = await ensureMediaReady(post);
    imageUrl = mediaResult.imageUrl;
    if (!imageUrl) {
      return emptyResult(
        mediaResult.error || "Instagram publishing requires a public image URL. Text-only posts are not supported by Instagram's API.",
        true,
      );
    }
    // Re-read the post to get updated media_plan
    const updatedPost = await (await import("../../storage")).storage.getSocialSyncPostById(post.id);
    if (updatedPost) {
      post = updatedPost;
    }
  }

  // 3. Build caption
  const caption = buildInstagramCaption(post);

  // 4. Create media container
  try {
    const containerResult = await createMediaContainer(igAccountId, token, imageUrl, caption);

    if ("error" in containerResult) {
      const err = containerResult.error;
      const errorCode = err?.code;
      const errorSubcode = err?.error_subcode;
      const permanent = classifyError(errorCode, errorSubcode);

      return {
        success: false,
        platform: "instagram",
        remote_post_id: null,
        container_id: null,
        ig_account_id: igAccountId,
        published_at: null,
        error: err?.message || "Failed to create media container",
        error_code: errorCode,
        error_subcode: errorSubcode,
        permanent_failure: permanent,
        raw_response_summary: {
          error_type: err?.type,
          error_code: errorCode,
          error_subcode: errorSubcode,
          fbtrace_id: err?.fbtrace_id,
        },
      };
    }

    const containerId = containerResult.id;

    // 5. Publish the container
    const publishResult = await publishMediaContainer(igAccountId, token, containerId);

    if ("error" in publishResult) {
      const err = publishResult.error;
      const errorCode = err?.code;
      const errorSubcode = err?.error_subcode;
      const permanent = classifyError(errorCode, errorSubcode);

      return {
        success: false,
        platform: "instagram",
        remote_post_id: null,
        container_id: containerId,
        ig_account_id: igAccountId,
        published_at: null,
        error: err?.message || "Failed to publish media container",
        error_code: errorCode,
        error_subcode: errorSubcode,
        permanent_failure: permanent,
        raw_response_summary: {
          container_id: containerId,
          error_type: err?.type,
          error_code: errorCode,
          error_subcode: errorSubcode,
          fbtrace_id: err?.fbtrace_id,
        },
      };
    }

    // 6. Success
    const remotePostId = publishResult.id;

    return {
      success: true,
      platform: "instagram",
      remote_post_id: remotePostId,
      container_id: containerId,
      ig_account_id: igAccountId,
      published_at: new Date().toISOString(),
      raw_response_summary: {
        container_id: containerId,
        media_id: remotePostId,
      },
    };
  } catch (err: any) {
    // Network / unexpected errors — transient
    return {
      success: false,
      platform: "instagram",
      remote_post_id: null,
      container_id: null,
      ig_account_id: igAccountId,
      published_at: null,
      error: `Network error: ${err.message}`,
      permanent_failure: false,
    };
  }
}
