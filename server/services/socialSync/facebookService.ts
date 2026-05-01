/**
 * Facebook OAuth + Page Discovery service for SocialSync.
 *
 * Handles:
 * - Building OAuth authorization URLs
 * - Exchanging auth codes for tokens
 * - Exchanging short-lived tokens for long-lived tokens
 * - Discovering pages the user manages
 * - Validating existing connections
 * - Token encryption/decryption for storage
 *
 * Required env vars:
 *   FACEBOOK_APP_ID       — Facebook App ID from Meta Developer Console
 *   FACEBOOK_APP_SECRET   — Facebook App Secret
 *   FACEBOOK_REDIRECT_URI — e.g. https://yourdomain.com/api/socialsync/oauth/facebook/callback
 *   TOKEN_ENCRYPTION_KEY  — 32-byte key (64 hex chars) for AES-256-GCM token encryption
 */
import { storage } from "../../storage";
import { encryptToken, decryptToken, isEncryptionConfigured } from "./tokenEncryption";
import { createLogger } from "../../lib/logger";

const log = createLogger("FacebookService");

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";
const OAUTH_BASE = "https://www.facebook.com/v21.0/dialog/oauth";

/* ─── Config helpers ─── */

export function getFacebookConfig() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

  return {
    appId: appId || null,
    appSecret: appSecret || null,
    redirectUri: redirectUri || null,
    configured: !!(appId && appSecret && redirectUri),
  };
}

export function validateFacebookConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.FACEBOOK_APP_ID) missing.push("FACEBOOK_APP_ID");
  if (!process.env.FACEBOOK_APP_SECRET) missing.push("FACEBOOK_APP_SECRET");
  if (!process.env.FACEBOOK_REDIRECT_URI) missing.push("FACEBOOK_REDIRECT_URI");
  if (!isEncryptionConfigured()) missing.push("TOKEN_ENCRYPTION_KEY");
  return { valid: missing.length === 0, missing };
}

/* ─── OAuth URL ─── */

const REQUIRED_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_read_user_content",
  // Instagram scopes — requested during the same Meta OAuth flow
  "instagram_basic",
  "instagram_content_publish",
].join(",");

export function buildFacebookOAuthUrl(clientId: number): string {
  const config = getFacebookConfig();
  if (!config.appId || !config.redirectUri) {
    throw new Error("Facebook OAuth not configured: missing FACEBOOK_APP_ID or FACEBOOK_REDIRECT_URI");
  }

  // Encode clientId in state parameter for callback routing
  const state = Buffer.from(JSON.stringify({ clientId, ts: Date.now() })).toString("base64url");

  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    scope: REQUIRED_SCOPES,
    response_type: "code",
    state,
  });

  return `${OAUTH_BASE}?${params.toString()}`;
}

/* ─── Token Exchange ─── */

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const config = getFacebookConfig();
  if (!config.appId || !config.appSecret || !config.redirectUri) {
    throw new Error("Facebook OAuth not configured");
  }

  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  });

  const res = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Facebook token exchange failed: ${(err as any)?.error?.message || res.statusText}`);
  }

  return res.json() as Promise<TokenResponse>;
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<TokenResponse> {
  const config = getFacebookConfig();
  if (!config.appId || !config.appSecret) {
    throw new Error("Facebook OAuth not configured");
  }

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Long-lived token exchange failed: ${(err as any)?.error?.message || res.statusText}`);
  }

  return res.json() as Promise<TokenResponse>;
}

/* ─── User / Page Discovery ─── */

interface FacebookUser {
  id: string;
  name: string;
}

export interface InstagramBusinessAccount {
  id: string;             // Instagram Graph API ID (not the same as IG username)
  name: string | null;
  username: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
}

export interface FacebookPage {
  id: string;
  name: string;
  category: string | null;
  access_token: string; // Page-level access token
  tasks: string[];      // Permissions like MANAGE, CREATE_CONTENT, etc.
  instagram_business_account: InstagramBusinessAccount | null;
}

export async function fetchFacebookUser(accessToken: string): Promise<FacebookUser> {
  const res = await fetch(`${GRAPH_API_BASE}/me?fields=id,name&access_token=${accessToken}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to fetch Facebook user: ${(err as any)?.error?.message || res.statusText}`);
  }
  return res.json() as Promise<FacebookUser>;
}

export async function fetchFacebookPages(userAccessToken: string): Promise<FacebookPage[]> {
  const res = await fetch(`${GRAPH_API_BASE}/me/accounts?fields=id,name,category,access_token,tasks,instagram_business_account{id,name,username,profile_picture_url,followers_count,ig_id}&limit=100&access_token=${userAccessToken}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to fetch Facebook pages: ${(err as any)?.error?.message || res.statusText}`);
  }

  const data = await res.json() as any;
  const pages: FacebookPage[] = (data.data || []).map((p: any) => {
    const igBiz = p.instagram_business_account || null;
    return {
      id: p.id,
      name: p.name,
      category: p.category || null,
      access_token: p.access_token,
      tasks: p.tasks || [],
      instagram_business_account: igBiz ? {
        id: igBiz.id,
        name: igBiz.name || null,
        username: igBiz.username || null,
        profile_picture_url: igBiz.profile_picture_url || null,
        followers_count: igBiz.followers_count ?? null,
      } : null,
    };
  });

  return pages;
}

/* ─── Connection Storage ─── */

export interface FacebookConnectionResult {
  connectionId: number;
  userId: string;
  userName: string;
  pages: FacebookPage[];
}

/**
 * Full OAuth callback handler: exchange code, get long-lived token,
 * discover user + pages, store connection.
 */
export async function handleFacebookCallback(
  clientId: number,
  code: string,
): Promise<FacebookConnectionResult> {
  // 1. Exchange code for short-lived token
  const shortToken = await exchangeCodeForToken(code);

  // 2. Exchange for long-lived token (~60 days)
  let longToken: TokenResponse;
  let tokenExchangeFailed = false;
  let tokenExchangeError: string | null = null;
  try {
    longToken = await exchangeForLongLivedToken(shortToken.access_token);
  } catch (err: any) {
    // Still use the short-lived token so the OAuth flow isn't broken,
    // but log the failure and flag it in connection metadata so the
    // system knows it's running on a 1-hour token.
    log.error("Failed to exchange for long-lived token", { error: err.message, clientId: String(clientId) });
    longToken = shortToken;
    tokenExchangeFailed = true;
    tokenExchangeError = err.message || "Unknown error";
  }

  // 3. Fetch user info
  const user = await fetchFacebookUser(longToken.access_token);

  // 4. Fetch manageable pages
  const pages = await fetchFacebookPages(longToken.access_token);

  // 5. Encrypt and store user-level token
  const encryptedUserToken = encryptToken(longToken.access_token);
  const expiresAt = longToken.expires_in
    ? new Date(Date.now() + longToken.expires_in * 1000)
    : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // Default 60 days

  // 6. Upsert connection record
  const tokenType = tokenExchangeFailed ? "short_lived" : (longToken.expires_in ? "long_lived" : "short_lived");
  const metadata: Record<string, unknown> = {
    user_name: user.name,
    pages_discovered: pages.map(p => ({
      id: p.id, name: p.name, category: p.category,
      instagram_business_account: p.instagram_business_account,
    })),
    connected_at: new Date().toISOString(),
    token_type: tokenType,
  };
  if (tokenExchangeFailed) {
    metadata.token_exchange_failed = true;
    metadata.token_exchange_error = tokenExchangeError;
  }

  const connection = await storage.upsertSocialSyncConnection({
    client_id: clientId,
    platform: "facebook",
    connection_status: "connected",
    external_account_id: user.id,
    external_page_id: null, // Page selected separately
    token_ref: encryptedUserToken,
    token_expires_at: expiresAt,
    last_validated_at: new Date(),
    metadata,
  } as any);

  // 7. Log
  await storage.createSocialSyncLog({
    client_id: clientId,
    entity_type: "connection",
    entity_id: connection.id,
    action: "facebook.connected",
    status: "success",
    details: { user_id: user.id, user_name: user.name, pages_count: pages.length },
  });

  return {
    connectionId: connection.id,
    userId: user.id,
    userName: user.name,
    pages,
  };
}

/**
 * Select a Facebook page as the active publishing target.
 * Stores the page-level access token (encrypted).
 */
export async function selectFacebookPage(
  clientId: number,
  pageId: string,
): Promise<void> {
  // Load connection to get user token
  const connections = await storage.listSocialSyncConnections(clientId);
  const fbConn = connections.find(c => c.platform === "facebook");
  if (!fbConn || !fbConn.token_ref) {
    throw new Error("No Facebook connection found. Connect Facebook first.");
  }
  if (fbConn.connection_status !== "connected") {
    throw new Error(`Facebook connection status is "${fbConn.connection_status}". Reconnect required.`);
  }

  // Decrypt user token to fetch pages with page tokens
  const userToken = decryptToken(fbConn.token_ref);
  const pages = await fetchFacebookPages(userToken);

  const selectedPage = pages.find(p => p.id === pageId);
  if (!selectedPage) {
    throw new Error(`Page ${pageId} not found or not accessible with current permissions.`);
  }

  // Encrypt page-level access token
  const encryptedPageToken = encryptToken(selectedPage.access_token);

  // Update connection with selected page
  await storage.upsertSocialSyncConnection({
    client_id: clientId,
    platform: "facebook",
    connection_status: "connected",
    external_account_id: fbConn.external_account_id,
    external_page_id: pageId,
    token_ref: encryptedPageToken, // Now stores the page token for publishing
    token_expires_at: fbConn.token_expires_at,
    last_validated_at: new Date(),
    metadata: {
      ...(fbConn.metadata as any || {}),
      selected_page: {
        id: selectedPage.id,
        name: selectedPage.name,
        category: selectedPage.category,
        tasks: selectedPage.tasks,
      },
      page_selected_at: new Date().toISOString(),
    },
  } as any);

  await storage.createSocialSyncLog({
    client_id: clientId,
    entity_type: "connection",
    entity_id: fbConn.id,
    action: "facebook.page_selected",
    status: "success",
    details: { page_id: pageId, page_name: selectedPage.name },
  });
}

/**
 * Validate an existing Facebook connection by making a test API call.
 */
export async function validateFacebookConnection(
  clientId: number,
): Promise<{ valid: boolean; error?: string }> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const fbConn = connections.find(c => c.platform === "facebook");

  if (!fbConn || !fbConn.token_ref) {
    return { valid: false, error: "No Facebook connection found" };
  }

  // Check token expiry
  if (fbConn.token_expires_at && new Date(fbConn.token_expires_at) < new Date()) {
    await storage.upsertSocialSyncConnection({
      ...fbConn,
      connection_status: "expired",
    } as any);
    return { valid: false, error: "Token has expired. Reconnect required." };
  }

  try {
    const token = decryptToken(fbConn.token_ref);

    // Test the token with a lightweight API call
    if (fbConn.external_page_id) {
      const res = await fetch(`${GRAPH_API_BASE}/${fbConn.external_page_id}?fields=id,name&access_token=${token}`);
      if (!res.ok) throw new Error(`Page validation failed: ${res.statusText}`);
    } else {
      const res = await fetch(`${GRAPH_API_BASE}/me?fields=id&access_token=${token}`);
      if (!res.ok) throw new Error(`User validation failed: ${res.statusText}`);
    }

    // Update last_validated_at
    await storage.upsertSocialSyncConnection({
      ...fbConn,
      connection_status: "connected",
      last_validated_at: new Date(),
    } as any);

    await storage.createSocialSyncLog({
      client_id: clientId,
      entity_type: "connection",
      entity_id: fbConn.id,
      action: "facebook.validated",
      status: "success",
      details: {},
    });

    return { valid: true };
  } catch (err: any) {
    await storage.upsertSocialSyncConnection({
      ...fbConn,
      connection_status: "error",
      metadata: { ...(fbConn.metadata as any || {}), last_error: err.message, error_at: new Date().toISOString() },
    } as any);

    await storage.createSocialSyncLog({
      client_id: clientId,
      entity_type: "connection",
      entity_id: fbConn.id,
      action: "facebook.validation_failed",
      status: "failure",
      details: { error: err.message },
    });

    return { valid: false, error: err.message };
  }
}

/**
 * Get the decrypted page access token for publishing.
 * Should only be called by internal services (worker), never exposed via API.
 */
export async function getFacebookPageToken(clientId: number): Promise<{ token: string; pageId: string } | null> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const fbConn = connections.find(c => c.platform === "facebook" && c.connection_status === "connected");

  if (!fbConn || !fbConn.token_ref || !fbConn.external_page_id) return null;

  if (fbConn.token_expires_at && new Date(fbConn.token_expires_at) < new Date()) return null;

  try {
    const token = decryptToken(fbConn.token_ref);
    return { token, pageId: fbConn.external_page_id };
  } catch {
    return null;
  }
}
