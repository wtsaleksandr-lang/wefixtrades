/**
 * Facebook post publishing service for SocialSync.
 *
 * Publishes text posts to a client's selected Facebook page
 * via the Graph API. Uses the encrypted page-level access token
 * stored during the OAuth + page selection flow (Phase 3A).
 *
 * Facebook Graph API endpoint:
 *   POST /{page-id}/feed
 *   Fields: message (text), link (optional)
 *   Auth: Page access token with pages_manage_posts permission
 */
import { getFacebookPageToken } from "./facebookService";
import type { SocialSyncPost } from "@shared/schema";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

/* ─── Content constraints ─── */

const FB_MAX_MESSAGE_LENGTH = 63206; // Facebook's practical limit for page posts
const FB_MIN_MESSAGE_LENGTH = 1;

/* ─── Error classification ─── */

/** Errors that should NOT be retried — the request is fundamentally broken. */
const PERMANENT_ERROR_CODES = new Set([
  190,  // Invalid/expired access token
  200,  // Permissions error
  10,   // Application does not have permission
  100,  // Invalid parameter
  368,  // Content blocked by policy
  506,  // Duplicate post
]);

function isPermanentError(errorCode: number | undefined): boolean {
  if (!errorCode) return false;
  return PERMANENT_ERROR_CODES.has(errorCode);
}

/* ─── Types ─── */

export interface PublishResult {
  success: boolean;
  platform: "facebook";
  remote_post_id: string | null;
  page_id: string;
  published_at: string | null;
  error?: string;
  error_code?: number;
  permanent_failure?: boolean;
  raw_response_summary?: Record<string, any>;
}

/* ─── Validation ─── */

function validatePostContent(post: SocialSyncPost): { valid: boolean; error?: string } {
  if (!post.post_text || post.post_text.trim().length < FB_MIN_MESSAGE_LENGTH) {
    return { valid: false, error: "Post text is empty" };
  }
  if (post.post_text.length > FB_MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Post text exceeds ${FB_MAX_MESSAGE_LENGTH} character limit (${post.post_text.length})` };
  }
  return { valid: true };
}

/* ─── Build post message ─── */

function buildFacebookMessage(post: SocialSyncPost): string {
  let message = post.post_text;

  // Append hashtags if present
  const hashtags = post.hashtags as string[] | null;
  if (hashtags && hashtags.length > 0) {
    const hashtagStr = hashtags.map(h => `#${h.replace(/^#/, "")}`).join(" ");
    message = `${message}\n\n${hashtagStr}`;
  }

  return message;
}

/* ─── Publish ─── */

/**
 * Publish a text post to a client's selected Facebook page.
 *
 * Returns a normalized PublishResult. On success, includes the remote post ID.
 * On failure, classifies the error as permanent or transient for retry logic.
 */
export async function publishToFacebook(
  clientId: number,
  post: SocialSyncPost,
): Promise<PublishResult> {
  // 1. Validate content
  const contentCheck = validatePostContent(post);
  if (!contentCheck.valid) {
    return {
      success: false,
      platform: "facebook",
      remote_post_id: null,
      page_id: "",
      published_at: null,
      error: contentCheck.error,
      permanent_failure: true,
    };
  }

  // 2. Get page credentials
  const credentials = await getFacebookPageToken(clientId);
  if (!credentials) {
    return {
      success: false,
      platform: "facebook",
      remote_post_id: null,
      page_id: "",
      published_at: null,
      error: "No active Facebook page connection found. Page may be disconnected, token may be expired, or no page selected.",
      permanent_failure: true,
    };
  }

  const { token, pageId } = credentials;

  // 3. Build the message
  const message = buildFacebookMessage(post);

  // 4. Publish via Graph API
  try {
    const url = new URL(`${GRAPH_API_BASE}/${pageId}/feed`);
    url.searchParams.set("access_token", token);

    const publishRes = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const responseData = await publishRes.json() as any;

    if (!publishRes.ok) {
      const errorCode = responseData?.error?.code;
      const errorMessage = responseData?.error?.message || publishRes.statusText;
      const permanent = isPermanentError(errorCode);

      return {
        success: false,
        platform: "facebook",
        remote_post_id: null,
        page_id: pageId,
        published_at: null,
        error: errorMessage,
        error_code: errorCode,
        permanent_failure: permanent,
        raw_response_summary: {
          status: publishRes.status,
          error_type: responseData?.error?.type,
          error_code: errorCode,
          fbtrace_id: responseData?.error?.fbtrace_id,
        },
      };
    }

    // Success — Facebook returns { id: "page_id_post_id" }
    const remotePostId = responseData.id || null;
    const publishedAt = new Date().toISOString();

    return {
      success: true,
      platform: "facebook",
      remote_post_id: remotePostId,
      page_id: pageId,
      published_at: publishedAt,
      raw_response_summary: {
        id: remotePostId,
        status: publishRes.status,
      },
    };
  } catch (err: any) {
    // Network errors are transient — should be retried
    return {
      success: false,
      platform: "facebook",
      remote_post_id: null,
      page_id: pageId,
      published_at: null,
      error: `Network error: ${err.message}`,
      permanent_failure: false,
    };
  }
}
