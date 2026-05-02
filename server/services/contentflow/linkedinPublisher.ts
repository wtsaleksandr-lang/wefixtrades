/**
 * ContentFlow — LinkedIn publisher.
 *
 * Publishes text posts (with optional image link) to LinkedIn via the
 * LinkedIn API v2 (UGC Posts). Auth via OAuth2 Bearer token stored in
 * socialsync_connections where platform = "linkedin".
 *
 * LinkedIn API endpoint:
 *   POST https://api.linkedin.com/v2/ugcPosts
 *   Auth: OAuth2 Bearer token
 *
 * The publisher creates a SHARE lifecycle status with text content.
 * When an image URL is provided (from media_plan), it's included as
 * a linked article thumbnail rather than a native image upload (which
 * would require the LinkedIn image upload flow).
 */

import { storage } from "../../storage";
import { decryptToken } from "../socialSync/tokenEncryption";
import { createLogger } from "../../lib/logger";

const log = createLogger("LinkedInPublisher");

const LINKEDIN_API_BASE = "https://api.linkedin.com/v2";
const FETCH_TIMEOUT_MS = 15_000;

export interface LinkedInPublishResult {
  success: boolean;
  remote_post_id?: string | null;
  error?: string;
  error_code?: number;
  permanent_failure?: boolean;
  rate_limited?: boolean;
}

/**
 * Retrieve LinkedIn credentials from socialsync_connections.
 * Returns the OAuth2 token and LinkedIn organization/person URN.
 */
async function getLinkedInCredentials(
  clientId: number,
): Promise<{ token: string; authorUrn: string } | null> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const conn = connections.find(
    (c) => c.platform === "linkedin" && c.connection_status === "connected",
  );
  if (!conn || !conn.token_ref) return null;
  if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) return null;

  try {
    const token = decryptToken(conn.token_ref);
    /* external_account_id stores the LinkedIn URN (person or organization).
     * Falls back to external_page_id if present. */
    const authorUrn = conn.external_account_id || conn.external_page_id || null;
    if (!authorUrn) return null;
    return { token, authorUrn };
  } catch {
    return null;
  }
}

/**
 * Publish a text post to LinkedIn.
 *
 * @param clientId - Client whose LinkedIn connection to use
 * @param text - Post text content
 * @param imageUrl - Optional image URL to include as article thumbnail
 */
export async function publishToLinkedIn(
  clientId: number,
  text: string,
  imageUrl?: string | null,
): Promise<LinkedInPublishResult> {
  const creds = await getLinkedInCredentials(clientId);
  if (!creds) {
    return {
      success: false,
      error: "No LinkedIn connection found or token expired",
      permanent_failure: true,
    };
  }

  /* Build UGC post payload per LinkedIn API v2 spec. */
  const media: any[] = [];
  if (imageUrl) {
    media.push({
      status: "READY",
      originalUrl: imageUrl,
      description: { text: text.slice(0, 200) },
    });
  }

  const payload: Record<string, any> = {
    author: creds.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: imageUrl ? "ARTICLE" : "NONE",
        ...(media.length > 0 ? { media } : {}),
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const resp = await fetch(`${LINKEDIN_API_BASE}/ugcPosts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (resp.ok || resp.status === 201) {
      const body = await resp.json().catch(() => ({})) as any;
      const postId = body?.id || resp.headers.get("x-restli-id") || null;
      log.info(`LinkedIn post created for client=${clientId}`, { postId });
      return {
        success: true,
        remote_post_id: postId,
      };
    }

    const errorBody = await resp.text().catch(() => "");
    const isRateLimit = resp.status === 429;
    const isPermanent = resp.status === 401 || resp.status === 403;

    log.warn(`LinkedIn API ${resp.status} for client=${clientId}: ${errorBody.slice(0, 300)}`);

    return {
      success: false,
      error: `LinkedIn API ${resp.status}: ${errorBody.slice(0, 200)}`,
      error_code: resp.status,
      permanent_failure: isPermanent,
      rate_limited: isRateLimit,
    };
  } catch (err: any) {
    log.error(`LinkedIn publish failed for client=${clientId}: ${err?.message || err}`);
    return {
      success: false,
      error: err?.message || String(err),
      permanent_failure: false,
    };
  }
}
