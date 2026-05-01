/**
 * ContentFlow — CMS router (Sprint 8: multi-CMS).
 *
 * Central dispatcher that routes blog post publishing to the correct
 * CMS adapter based on the client's configured platform. Resolves
 * credentials from multiple sources:
 *
 *   1. rankflow_profiles.credentials.{platform}
 *   2. client_service.metadata.{platform}_credentials
 *
 * The router is used by:
 *   - wordpressQueue (drainWordpressQueue) for queued article publishes
 *   - webcareContentAutomation for monthly content changes
 *   - Any future direct-publish endpoints
 *
 * Supported platforms: wordpress, wix, shopify, squarespace, custom.
 * Unknown platforms return { success: false, error: "unsupported" }.
 */

import { storage } from "../../storage";
import { createLogger } from "../../lib/logger";
import { decryptToken, isEncryptionConfigured } from "../socialSync/tokenEncryption";
import { publishDraftToWordpress } from "./wordpressPublisher";
import { renderArticleHtml } from "./articleHtml";
import { wixPublisher } from "./wixPublisher";
import { shopifyPublisher } from "./shopifyPublisher";
import { squarespacePublisher } from "./squarespacePublisher";
import type { CmsCredentials, CmsPublishResult, CmsPostPayload } from "./cmsAdapter";

const log = createLogger("CmsRouter");

/* ─── Platform detection ──────────────────────────────────────────── */

export type CmsPlatform = "wordpress" | "wix" | "shopify" | "squarespace" | "custom";

const KNOWN_PLATFORMS = new Set<CmsPlatform>(["wordpress", "wix", "shopify", "squarespace", "custom"]);

function normalizePlatform(raw: string | null | undefined): CmsPlatform | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (KNOWN_PLATFORMS.has(lower as CmsPlatform)) return lower as CmsPlatform;
  // Common aliases
  if (lower === "wp" || lower === "wordpress.com" || lower === "wordpress.org") return "wordpress";
  if (lower === "wix.com") return "wix";
  if (lower === "shopify.com") return "shopify";
  if (lower === "squarespace.com") return "squarespace";
  return null;
}

/* ─── Credential resolution ───────────────────────────────────────── */

interface CredentialSources {
  rankflowProfile: Record<string, any> | null;
  clientServiceMeta: Record<string, any> | null;
}

async function resolveCredentialSources(
  clientId: number,
  clientServiceId?: number | null,
): Promise<CredentialSources> {
  let rankflowProfile: Record<string, any> | null = null;
  let clientServiceMeta: Record<string, any> | null = null;

  try {
    const profile = await storage.getRankFlowProfile(clientId) as any;
    if (profile?.credentials) {
      rankflowProfile = profile.credentials;
    }
  } catch { /* ignore — profile may not exist */ }

  if (clientServiceId) {
    try {
      const cs = await storage.getClientServiceById(clientServiceId);
      if (cs?.metadata) {
        clientServiceMeta = cs.metadata as Record<string, any>;
      }
    } catch { /* ignore */ }
  }

  return { rankflowProfile, clientServiceMeta };
}

function resolveWixCredentials(sources: CredentialSources): CmsCredentials | null {
  // Check client_service.metadata.wix_credentials first
  const csCreds = sources.clientServiceMeta?.wix_credentials;
  if (csCreds?.wix_api_key && csCreds?.wix_site_id) {
    if (!isEncryptionConfigured()) return null;
    try {
      return {
        platform: "wix",
        wix_api_key: decryptToken(csCreds.wix_api_key),
        wix_site_id: csCreds.wix_site_id,
      };
    } catch { /* fall through to rankflow profile */ }
  }

  // Check rankflow_profiles.credentials.wix
  const rfCreds = sources.rankflowProfile?.wix;
  if (rfCreds?.wix_api_key && rfCreds?.wix_site_id) {
    if (!isEncryptionConfigured()) return null;
    try {
      return {
        platform: "wix",
        wix_api_key: decryptToken(rfCreds.wix_api_key),
        wix_site_id: rfCreds.wix_site_id,
      };
    } catch { /* credential resolution failed */ }
  }

  return null;
}

function resolveShopifyCredentials(sources: CredentialSources): CmsCredentials | null {
  const csCreds = sources.clientServiceMeta?.shopify_credentials;
  if (csCreds?.shopify_store && csCreds?.shopify_access_token && csCreds?.shopify_blog_id) {
    if (!isEncryptionConfigured()) return null;
    try {
      return {
        platform: "shopify",
        shopify_store: csCreds.shopify_store,
        shopify_access_token: decryptToken(csCreds.shopify_access_token),
        shopify_blog_id: csCreds.shopify_blog_id,
      };
    } catch { /* fall through */ }
  }

  const rfCreds = sources.rankflowProfile?.shopify;
  if (rfCreds?.shopify_store && rfCreds?.shopify_access_token && rfCreds?.shopify_blog_id) {
    if (!isEncryptionConfigured()) return null;
    try {
      return {
        platform: "shopify",
        shopify_store: rfCreds.shopify_store,
        shopify_access_token: decryptToken(rfCreds.shopify_access_token),
        shopify_blog_id: rfCreds.shopify_blog_id,
      };
    } catch { /* credential resolution failed */ }
  }

  return null;
}

function resolveSquarespaceCredentials(
  sources: CredentialSources,
  clientId: number,
): CmsCredentials | null {
  // Squarespace uses email-based delivery — just need client email
  const csCreds = sources.clientServiceMeta?.squarespace_credentials;
  const clientEmail = csCreds?.client_email || null;

  return {
    platform: "squarespace",
    squarespace_api_key: csCreds?.squarespace_api_key || null,
    client_email: clientEmail,
    client_id: clientId,
  };
}

/* ─── Platform detection from profile ─────────────────────────────── */

export async function detectClientPlatform(
  clientId: number,
  clientServiceId?: number | null,
): Promise<CmsPlatform | null> {
  // 1. Check rankflow_profiles.cms_type
  try {
    const profile = await storage.getRankFlowProfile(clientId) as any;
    if (profile?.cms_type) {
      const p = normalizePlatform(profile.cms_type);
      if (p) return p;
    }
  } catch { /* ignore */ }

  // 2. Check client_service.metadata.config.cms_platform
  if (clientServiceId) {
    try {
      const cs = await storage.getClientServiceById(clientServiceId);
      const meta = (cs?.metadata || {}) as Record<string, any>;
      const configPlatform = meta?.config?.cms_platform || meta?.cms_platform;
      if (configPlatform) {
        const p = normalizePlatform(configPlatform);
        if (p) return p;
      }
      // Infer from presence of platform-specific credentials
      if (meta?.wordpress_credentials) return "wordpress";
      if (meta?.wix_credentials) return "wix";
      if (meta?.shopify_credentials) return "shopify";
      if (meta?.squarespace_credentials) return "squarespace";
    } catch { /* ignore */ }
  }

  // 3. Default: check if WP credentials exist anywhere (backwards compat)
  try {
    const profile = await storage.getRankFlowProfile(clientId) as any;
    if (profile?.credentials?.wordpress) return "wordpress";
  } catch { /* ignore */ }

  return null;
}

/* ─── Main router ─────────────────────────────────────────────────── */

/**
 * Publish a blog post to the client's CMS platform.
 *
 * Resolves the platform and credentials automatically, then dispatches
 * to the correct adapter. Returns a unified result regardless of CMS.
 */
export async function publishToCms(
  clientId: number,
  post: CmsPostPayload,
  opts?: { clientServiceId?: number | null; draftId?: number },
): Promise<CmsPublishResult> {
  const platform = await detectClientPlatform(clientId, opts?.clientServiceId);

  if (!platform) {
    log.warn("No CMS platform detected for client", { clientId: String(clientId) });
    return {
      success: false,
      error: `No CMS platform configured for client ${clientId}. Set cms_type on the RankFlow profile or cms_platform in the client service metadata.`,
    };
  }

  log.info("Routing CMS publish", { clientId: String(clientId), platform });

  // WordPress uses the existing publisher which handles its own credential resolution
  if (platform === "wordpress") {
    return publishViaWordpress(clientId, post, opts);
  }

  // Other platforms: resolve credentials then dispatch
  const sources = await resolveCredentialSources(clientId, opts?.clientServiceId);

  switch (platform) {
    case "wix": {
      const creds = resolveWixCredentials(sources);
      if (!creds) {
        return { success: false, error: `Wix credentials not found or could not be decrypted for client ${clientId}` };
      }
      return wixPublisher.publishPost(creds, post);
    }
    case "shopify": {
      const creds = resolveShopifyCredentials(sources);
      if (!creds) {
        return { success: false, error: `Shopify credentials not found or could not be decrypted for client ${clientId}` };
      }
      return shopifyPublisher.publishPost(creds, post);
    }
    case "squarespace": {
      const creds = resolveSquarespaceCredentials(sources, clientId);
      if (!creds) return { success: false, error: "Squarespace credentials not found" };
      return squarespacePublisher.publishPost(creds, post);
    }
    case "custom": {
      return {
        success: false,
        error: `Custom CMS platform for client ${clientId} — manual publishing required.`,
      };
    }
    default: {
      return { success: false, error: `Unsupported CMS platform: ${platform}` };
    }
  }
}

/**
 * WordPress publishing path. If a draftId is provided, use the existing
 * full-featured publisher (which handles credentials, encryption,
 * HTTPS checks, etc.). Otherwise build a minimal direct-publish flow.
 */
async function publishViaWordpress(
  clientId: number,
  post: CmsPostPayload,
  opts?: { draftId?: number },
): Promise<CmsPublishResult> {
  if (opts?.draftId) {
    // Use the existing full-featured WordPress publisher
    const result = await publishDraftToWordpress(opts.draftId, {
      status: post.status === "publish" ? "publish" : "draft",
    });

    if (result.ok) {
      return {
        success: true,
        postId: String(result.post_id),
        postUrl: result.post_url,
      };
    }
    return {
      success: false,
      error: result.message,
    };
  }

  // No draft ID — can't use the existing publisher which requires a draft
  return {
    success: false,
    error: "WordPress publishing requires a content draft ID. Use the publish queue workflow.",
  };
}
