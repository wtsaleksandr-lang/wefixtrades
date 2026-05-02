/**
 * ContentFlow — Pinterest publisher.
 *
 * Creates pins via the Pinterest API v5. Auth via OAuth2 Bearer token
 * stored in socialsync_connections where platform = "pinterest".
 *
 * Pinterest API endpoint:
 *   POST https://api.pinterest.com/v5/pins
 *   Auth: OAuth2 Bearer token
 *
 * Perfect for before/after trade photos. A pin requires an image,
 * title, and description; the link field drives traffic back to the
 * client's article.
 */

import { storage } from "../../storage";
import { decryptToken } from "../socialSync/tokenEncryption";
import { createLogger } from "../../lib/logger";

const log = createLogger("PinterestPublisher");

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";
const FETCH_TIMEOUT_MS = 15_000;

export interface PinterestPublishResult {
  success: boolean;
  remote_post_id?: string | null;
  pin_url?: string | null;
  error?: string;
  error_code?: number;
  permanent_failure?: boolean;
  rate_limited?: boolean;
}

/**
 * Retrieve Pinterest credentials from socialsync_connections.
 */
async function getPinterestCredentials(
  clientId: number,
): Promise<{ token: string; boardId: string | null } | null> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const conn = connections.find(
    (c) => c.platform === "pinterest" && c.connection_status === "connected",
  );
  if (!conn || !conn.token_ref) return null;
  if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) return null;

  try {
    const token = decryptToken(conn.token_ref);
    /* external_page_id stores the target Pinterest board ID.
     * If not set, we'll try to use the user's first board. */
    const boardId = conn.external_page_id || null;
    return { token, boardId };
  } catch {
    return null;
  }
}

/**
 * Create a pin on Pinterest.
 *
 * @param clientId - Client whose Pinterest connection to use
 * @param imageUrl - Image URL for the pin (required by Pinterest)
 * @param title - Pin title
 * @param description - Pin description (SEO optimized)
 * @param link - Link URL for the pin (drives to article)
 */
export async function publishToPinterest(
  clientId: number,
  imageUrl: string,
  title: string,
  description: string,
  link?: string | null,
): Promise<PinterestPublishResult> {
  const creds = await getPinterestCredentials(clientId);
  if (!creds) {
    return {
      success: false,
      error: "No Pinterest connection found or token expired",
      permanent_failure: true,
    };
  }

  /* Pinterest v5 API pin creation payload. */
  const payload: Record<string, any> = {
    title: title.slice(0, 100),
    description: description.slice(0, 500),
    media_source: {
      source_type: "image_url",
      url: imageUrl,
    },
  };

  if (link) {
    payload.link = link;
  }

  if (creds.boardId) {
    payload.board_id = creds.boardId;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const resp = await fetch(`${PINTEREST_API_BASE}/pins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (resp.ok || resp.status === 201) {
      const body = await resp.json().catch(() => ({})) as any;
      const pinId = body?.id || null;
      const pinUrl = pinId ? `https://www.pinterest.com/pin/${pinId}/` : null;
      log.info(`Pinterest pin created for client=${clientId}`, { pinId });
      return {
        success: true,
        remote_post_id: pinId,
        pin_url: pinUrl,
      };
    }

    const errorBody = await resp.text().catch(() => "");
    const isRateLimit = resp.status === 429;
    const isPermanent = resp.status === 401 || resp.status === 403;

    log.warn(`Pinterest API ${resp.status} for client=${clientId}: ${errorBody.slice(0, 300)}`);

    return {
      success: false,
      error: `Pinterest API ${resp.status}: ${errorBody.slice(0, 200)}`,
      error_code: resp.status,
      permanent_failure: isPermanent,
      rate_limited: isRateLimit,
    };
  } catch (err: any) {
    log.error(`Pinterest publish failed for client=${clientId}: ${err?.message || err}`);
    return {
      success: false,
      error: err?.message || String(err),
      permanent_failure: false,
    };
  }
}
