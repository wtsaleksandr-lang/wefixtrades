/**
 * Facebook reply posting via Graph API.
 *
 * Status: scaffolded. Facebook **Page recommendations** (the modern
 * "reviews" surface) are read-only via Graph; owner replies are posted
 * as comments to the recommendation thread. We already fetch
 * recommendations through Outscraper (see reviewMonitorWorker); this
 * client adds the missing reply-post capability.
 *
 * Activation:
 *   1. Configure a Facebook App with `pages_manage_engagement` +
 *      `pages_read_engagement` scopes and complete Meta business
 *      verification.
 *   2. Customer authorizes via the existing OAuth flow
 *      (server/services/socialSync handles Pages OAuth already).
 *   3. Page access token is stored encrypted in
 *      socialsync_platform_connections.token_ref.
 *
 * Note: each ReputationShield client can configure a Facebook Page
 * connection via the same SocialSync OAuth that ContentFlow uses.
 *
 * Reference: https://developers.facebook.com/docs/graph-api/reference/v18.0/object/comments
 */

import { createLogger } from "../../lib/logger";
import { storage } from "../../storage";

const log = createLogger("facebook-reply");

const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";

export function isConfigured(): boolean {
  // Whether the platform credentials exist app-wide.
  return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

async function getPageAccessToken(clientId: number): Promise<string | null> {
  // Reuses the same SocialSync connection table as ContentFlow.
  const conns = await storage.listSocialSyncConnections(clientId);
  const fb = conns.find((c: any) => c.platform === "facebook" && c.connection_status === "connected");
  if (!fb?.token_ref) return null;
  try {
    const { decryptToken } = await import("../socialSync/tokenEncryption");
    return decryptToken(fb.token_ref);
  } catch {
    return null;
  }
}

/**
 * Post a comment as the Page on a recommendation/post thread.
 * `recommendationId` is the Graph object ID of the recommendation
 * (stored in monitored_reviews.external_review_id for FB).
 */
export async function postFacebookReply(input: {
  clientId: number;
  recommendationId: string;
  replyText: string;
}): Promise<{ ok: boolean; error?: string; commentId?: string }> {
  if (!isConfigured()) {
    return { ok: false, error: "Facebook not configured (FACEBOOK_APP_ID/SECRET missing)" };
  }

  const pageToken = await getPageAccessToken(input.clientId);
  if (!pageToken) {
    return { ok: false, error: "No Facebook Page token for this client" };
  }

  const url = `${GRAPH_API_BASE}/${input.recommendationId}/comments`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      message: input.replyText,
      access_token: pageToken,
    }).toString(),
  });

  const data: any = await resp.json().catch(() => ({}));
  if (resp.ok && data?.id) {
    return { ok: true, commentId: data.id };
  }

  const errorMsg = data?.error?.message || `HTTP ${resp.status}`;
  log.warn(`Facebook reply failed for client ${input.clientId}: ${errorMsg}`);
  return { ok: false, error: errorMsg };
}
