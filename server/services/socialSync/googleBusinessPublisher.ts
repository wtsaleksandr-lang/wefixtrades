/**
 * Google Business Profile post publishing for SocialSync.
 *
 * Publishes "UPDATE" type local posts to a client's selected GBP location.
 *
 * Google Business Profile API:
 *   POST https://mybusiness.googleapis.com/v4/{locationName}/localPosts
 *   Body: { summary, topicType: "STANDARD", languageCode }
 *
 * Supported format: Text-only standard update post.
 * Images, offers, events, and products are deferred.
 */
import { getGoogleAccessToken } from "./googleBusinessService";
import type { SocialSyncPost } from "@shared/schema";

// v4 API for local posts (v1 Business Information API doesn't support posting)
const GBP_POST_API_DEFAULT = "https://mybusiness.googleapis.com/v4";
/* Sprint 10: dev-test override. */
function getGbpPostApi(): string {
  if (process.env.NODE_ENV !== "production" && process.env.GBP_POST_API_BASE_OVERRIDE) {
    return process.env.GBP_POST_API_BASE_OVERRIDE;
  }
  return GBP_POST_API_DEFAULT;
}

/* ─── Content Constraints ─── */

const GBP_MAX_SUMMARY_LENGTH = 1500;
const GBP_MIN_SUMMARY_LENGTH = 1;

/* ─── Error Classification ─── */

const PERMANENT_STATUS_CODES = new Set([400, 401, 403, 404]);
const RATE_LIMIT_STATUS = 429;

/* ─── Types ─── */

export interface GooglePublishResult {
  success: boolean;
  platform: "google_business";
  remote_post_id: string | null;
  location_name: string;
  published_at: string | null;
  error?: string;
  error_code?: number;
  permanent_failure?: boolean;
  rate_limited?: boolean;
  raw_response_summary?: Record<string, any>;
}

/* ─── Publish ─── */

export async function publishToGoogleBusiness(
  clientId: number,
  post: SocialSyncPost,
): Promise<GooglePublishResult> {
  const emptyResult = (error: string, permanent: boolean): GooglePublishResult => ({
    success: false,
    platform: "google_business",
    remote_post_id: null,
    location_name: "",
    published_at: null,
    error,
    permanent_failure: permanent,
  });

  // 1. Validate content
  if (!post.post_text || post.post_text.trim().length < GBP_MIN_SUMMARY_LENGTH) {
    return emptyResult("Post text is empty", true);
  }

  // 2. Get credentials
  const credentials = await getGoogleAccessToken(clientId);
  if (!credentials) {
    return emptyResult("No active Google Business connection. Location may be unselected, token may be expired.", true);
  }

  const { token, locationName } = credentials;

  // 3. Build post payload
  let summary = post.post_text;
  if (summary.length > GBP_MAX_SUMMARY_LENGTH) {
    summary = summary.slice(0, GBP_MAX_SUMMARY_LENGTH - 3) + "...";
  }

  /* Sprint 12: attach image when available. The GBP localPosts API
   * accepts a `media` array with `{ mediaFormat, sourceUrl }` items.
   * We use Sprint 11's image_url stamped on post.media_plan by the
   * orchestrator's image-gen step. Image is OPTIONAL — when absent,
   * the post publishes text-only (preserves Sprint 11 hard req). */
  const mediaPlan = post.media_plan as Record<string, any> | null;
  const imageUrl =
    mediaPlan?.image_url || mediaPlan?.public_image_url || null;

  const payload: Record<string, any> = {
    summary,
    topicType: "STANDARD",
    languageCode: "en",
  };
  if (typeof imageUrl === "string" && imageUrl.length > 0) {
    payload.media = [
      { mediaFormat: "PHOTO", sourceUrl: imageUrl },
    ];
  }

  // 4. Publish
  try {
    const url = `${getGbpPostApi()}/${locationName}/localPosts`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({})) as any;

    if (!res.ok) {
      const errMsg = data?.error?.message || res.statusText;
      const errCode = data?.error?.code || res.status;
      const isRateLimit = res.status === RATE_LIMIT_STATUS;
      const isPermanent = !isRateLimit && PERMANENT_STATUS_CODES.has(res.status);

      return {
        success: false,
        platform: "google_business",
        remote_post_id: null,
        location_name: locationName,
        published_at: null,
        error: errMsg,
        error_code: errCode,
        permanent_failure: isPermanent,
        rate_limited: isRateLimit,
        raw_response_summary: {
          status: res.status,
          error_code: errCode,
          error_message: errMsg,
        },
      };
    }

    // Success — Google returns the created localPost resource
    const remotePostId = data.name || null; // e.g. "accounts/.../locations/.../localPosts/..."

    return {
      success: true,
      platform: "google_business",
      remote_post_id: remotePostId,
      location_name: locationName,
      published_at: new Date().toISOString(),
      raw_response_summary: {
        name: remotePostId,
        status: res.status,
        topicType: data.topicType,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      platform: "google_business",
      remote_post_id: null,
      location_name: locationName,
      published_at: null,
      error: `Network error: ${err.message}`,
      permanent_failure: false,
    };
  }
}
