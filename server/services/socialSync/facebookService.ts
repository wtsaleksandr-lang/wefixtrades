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
import { fetchWithRetry } from "../../lib/httpRetry";
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
  // Lets the customer edit their Page's basic metadata (name, about, category)
  // from the WeFixTrades portal. Read/update routes live in
  // server/routes/portal/socialsync.ts → /facebook-page/:pageId/metadata.
  "pages_manage_metadata",
  // Tech Provider tier scope — lets WeFixTrades read the customer's
  // Business Manager assets (owned pages, ad-account counts, verification
  // status) so the portal can surface a "Business Assets" view and capture
  // an explicit Tech Provider attestation. Read-only; backed by
  // fetchFacebookBusinesses() and the /api/portal/socialsync/businesses +
  // /api/portal/socialsync/tech-provider-attestation routes.
  "business_management",
  // Lets WeFixTrades subscribe a customer's connected Page to Messenger
  // webhooks and send replies on behalf of the Page. Foundation for the
  // "AI auto-reply to Page DMs" feature — this PR ships the inbound
  // webhook receiver + a manually-triggered reply endpoint. AI-driven
  // replies + an inbox UI ship in follow-up PRs. Backed by
  // subscribePageToMessagingWebhooks() and sendFacebookMessengerReply().
  "pages_messaging",
  // Lets the customer route their WhatsApp Business number through
  // WeFixTrades via Meta's WhatsApp Cloud API. Foundation for the
  // "AI auto-reply to WhatsApp" feature — this PR ships the inbound
  // webhook receiver + a portal-facing send endpoint. AI-driven replies,
  // template messages, and media support land in follow-up PRs. Backed by
  // server/services/whatsappCloudService.ts and
  // server/routes/metaWhatsappWebhookRoutes.ts. Coexists with the
  // existing Twilio WhatsApp path (TWILIO_WHATSAPP_NUMBER) — customers
  // pick which provider their number is connected to.
  "whatsapp_business_messaging",
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

  const res = await fetchWithRetry(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`);
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

  const res = await fetchWithRetry(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`);
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
  const res = await fetchWithRetry(`${GRAPH_API_BASE}/me?fields=id,name&access_token=${accessToken}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to fetch Facebook user: ${(err as any)?.error?.message || res.statusText}`);
  }
  return res.json() as Promise<FacebookUser>;
}

export async function fetchFacebookPages(userAccessToken: string): Promise<FacebookPage[]> {
  const res = await fetchWithRetry(`${GRAPH_API_BASE}/me/accounts?fields=id,name,category,access_token,tasks,instagram_business_account{id,name,username,profile_picture_url,followers_count,ig_id}&limit=100&access_token=${userAccessToken}`);
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
      const res = await fetchWithRetry(`${GRAPH_API_BASE}/${fbConn.external_page_id}?fields=id,name&access_token=${token}`);
      if (!res.ok) throw new Error(`Page validation failed: ${res.statusText}`);
    } else {
      const res = await fetchWithRetry(`${GRAPH_API_BASE}/me?fields=id&access_token=${token}`);
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

/* ─── Page Metadata (pages_manage_metadata scope) ─── */

export interface FacebookPageMetadata {
  id: string;
  name: string | null;
  about: string | null;
  category: string | null;
  category_list: { id: string; name: string }[];
}

export interface UpdateFacebookPageMetadataInput {
  name?: string;
  about?: string;
  category?: string; // Page category name; Meta resolves it server-side.
}

/**
 * Verify that the given Facebook pageId is the one this client is connected
 * to. Returns the decrypted page-level access token on success, or null if
 * the client has no connection to that page or the token is unusable.
 *
 * Centralised here so the portal route handler stays a thin wrapper.
 */
async function getConnectedPageToken(
  clientId: number,
  pageId: string,
): Promise<{ token: string; connectionId: number } | null> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const fbConn = connections.find(
    (c) => c.platform === "facebook" && c.external_page_id === pageId,
  );
  if (!fbConn || !fbConn.token_ref) return null;
  if (fbConn.connection_status !== "connected") return null;
  if (fbConn.token_expires_at && new Date(fbConn.token_expires_at) < new Date()) return null;
  try {
    return { token: decryptToken(fbConn.token_ref), connectionId: fbConn.id };
  } catch {
    return null;
  }
}

/**
 * Fetch the editable Page metadata fields. Read-only; uses the
 * page-level access token already stored from the OAuth flow.
 * Throws on Meta API failure with the upstream error message.
 */
export async function fetchFacebookPageMetadata(
  clientId: number,
  pageId: string,
): Promise<FacebookPageMetadata> {
  const conn = await getConnectedPageToken(clientId, pageId);
  if (!conn) {
    throw new Error("Page not connected to this account, or token expired. Reconnect required.");
  }

  const fields = "id,name,about,category,category_list";
  const url = `${GRAPH_API_BASE}/${encodeURIComponent(pageId)}?fields=${fields}&access_token=${conn.token}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to fetch page metadata: ${(err as any)?.error?.message || res.statusText}`);
  }
  const data = (await res.json()) as any;
  return {
    id: String(data.id),
    name: data.name ?? null,
    about: data.about ?? null,
    category: data.category ?? null,
    category_list: Array.isArray(data.category_list)
      ? data.category_list.map((c: any) => ({ id: String(c.id), name: String(c.name) }))
      : [],
  };
}

/**
 * Update editable Page metadata fields via a POST to /{page-id}.
 * Returns the freshly-fetched metadata so callers can echo it back.
 *
 * NOTE: `name` updates require the Page owner to have name-change rights
 * enabled in Meta; failures from Meta surface as the thrown error message
 * for the UI to display verbatim.
 */
export async function updateFacebookPageMetadata(
  clientId: number,
  pageId: string,
  input: UpdateFacebookPageMetadataInput,
): Promise<FacebookPageMetadata> {
  const conn = await getConnectedPageToken(clientId, pageId);
  if (!conn) {
    throw new Error("Page not connected to this account, or token expired. Reconnect required.");
  }

  const params = new URLSearchParams();
  if (typeof input.name === "string") params.set("name", input.name);
  if (typeof input.about === "string") params.set("about", input.about);
  if (typeof input.category === "string") params.set("category", input.category);
  if ([...params.keys()].length === 0) {
    // Nothing to update — return current state without hitting Meta.
    return fetchFacebookPageMetadata(clientId, pageId);
  }
  params.set("access_token", conn.token);

  const res = await fetchWithRetry(`${GRAPH_API_BASE}/${encodeURIComponent(pageId)}`, {
    method: "POST",
    body: params,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to update page metadata: ${(err as any)?.error?.message || res.statusText}`);
  }

  return fetchFacebookPageMetadata(clientId, pageId);
}

/* ─── Business Manager (business_management scope) ─── */

export interface FacebookBusinessSummary {
  id: string;
  name: string;
  verification_status: string | null;
  primary_page: { id: string; name: string | null } | null;
  owned_ad_account_count: number;
  owned_page_count: number;
}

/**
 * Decrypt the user-level Facebook access token for the given client.
 * Returns null if no usable connection is present (no token, expired,
 * or not in `connected` status).
 *
 * Kept private to this module — business endpoints use a user-level
 * token (not page-level), so we must read it directly from the connection
 * row rather than via getFacebookPageToken().
 */
async function getConnectedUserToken(
  clientId: number,
): Promise<{ token: string; connectionId: number } | null> {
  const connections = await storage.listSocialSyncConnections(clientId);
  // Prefer the connection that still holds the user-level token (the
  // initial OAuth row). If the customer has already selected a page, the
  // current token_ref may be a page token — but it was rotated in place
  // and we no longer have the user token stored. Meta accepts the page
  // token for some /me/businesses calls when the user is also a business
  // admin, but to keep behaviour predictable we use whichever token is
  // most recently stored on the facebook connection.
  const fbConn = connections.find((c) => c.platform === "facebook");
  if (!fbConn || !fbConn.token_ref) return null;
  if (fbConn.connection_status !== "connected") return null;
  if (fbConn.token_expires_at && new Date(fbConn.token_expires_at) < new Date()) return null;
  try {
    return { token: decryptToken(fbConn.token_ref), connectionId: fbConn.id };
  } catch {
    return null;
  }
}

/**
 * Fetch the list of Business Manager accounts this customer admins.
 * Uses /me/businesses with summary-mode counts so we can render owned
 * page / ad-account totals without a second round-trip per business.
 *
 * Read-only. The customer's Tech Provider attestation (see
 * /api/portal/socialsync/tech-provider-attestation) is what gates any
 * future write paths — this read is safe to surface as soon as the
 * business_management scope has been granted.
 */
export async function fetchFacebookBusinesses(
  clientId: number,
): Promise<FacebookBusinessSummary[]> {
  const conn = await getConnectedUserToken(clientId);
  if (!conn) {
    throw new Error("No connected Facebook account, or token expired. Reconnect required.");
  }

  const fields = [
    "id",
    "name",
    "verification_status",
    "primary_page{id,name}",
    "owned_ad_accounts.summary(true).limit(0)",
    "owned_pages.summary(true).limit(0)",
  ].join(",");
  const url = `${GRAPH_API_BASE}/me/businesses?fields=${fields}&limit=50&access_token=${conn.token}`;

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to fetch Business Manager accounts: ${(err as any)?.error?.message || res.statusText}`);
  }

  const data = (await res.json()) as any;
  const rows: FacebookBusinessSummary[] = (data.data || []).map((b: any) => ({
    id: String(b.id),
    name: String(b.name ?? ""),
    verification_status: b.verification_status ?? null,
    primary_page: b.primary_page
      ? { id: String(b.primary_page.id), name: b.primary_page.name ?? null }
      : null,
    owned_ad_account_count:
      Number(b.owned_ad_accounts?.summary?.total_count ?? 0) || 0,
    owned_page_count:
      Number(b.owned_pages?.summary?.total_count ?? 0) || 0,
  }));

  return rows;
}

/* ─── Messenger (pages_messaging scope) ─── */

/**
 * Fields we subscribe to on the Page's webhook. Kept small on purpose —
 * `messages` covers inbound DMs and `messaging_postbacks` covers
 * button / quick-reply postback events. Wider event types
 * (`message_deliveries`, `message_reads`, etc.) can be added in a
 * follow-up PR once we have an inbox UI to reflect them.
 */
export const MESSENGER_SUBSCRIBED_FIELDS = ["messages", "messaging_postbacks"];

export interface SubscribePageToMessagingResult {
  page_id: string;
  subscribed_fields: string[];
  meta_response: unknown;
}

/**
 * Subscribe a customer's connected Facebook Page to Messenger webhooks
 * via POST /{page-id}/subscribed_apps. The Page-level access token is
 * required (not the user token) — Meta scopes the subscription to the
 * Page that the token belongs to.
 *
 * Idempotent on Meta's side: re-subscribing with the same fields is a
 * no-op, so callers can safely retry. Failures surface the upstream
 * error message verbatim for the portal UI to display.
 */
export async function subscribePageToMessagingWebhooks(
  clientId: number,
  pageId: string,
): Promise<SubscribePageToMessagingResult> {
  const conn = await getConnectedPageToken(clientId, pageId);
  if (!conn) {
    throw new Error("Page not connected to this account, or token expired. Reconnect required.");
  }

  const params = new URLSearchParams();
  params.set("subscribed_fields", MESSENGER_SUBSCRIBED_FIELDS.join(","));
  params.set("access_token", conn.token);

  const res = await fetchWithRetry(
    `${GRAPH_API_BASE}/${encodeURIComponent(pageId)}/subscribed_apps`,
    { method: "POST", body: params },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to subscribe Page to Messenger webhooks: ${(err as any)?.error?.message || res.statusText}`,
    );
  }
  const metaResponse = await res.json().catch(() => ({}));
  return {
    page_id: pageId,
    subscribed_fields: MESSENGER_SUBSCRIBED_FIELDS,
    meta_response: metaResponse,
  };
}

export interface SendMessengerReplyResult {
  recipient_id: string | null;
  message_id: string | null;
  meta_response: unknown;
}

/**
 * Send a text reply to a Messenger user (identified by their Page-scoped
 * PSID) on behalf of the customer's connected Facebook Page.
 *
 * Calls POST /me/messages with the Page-level access token. Meta returns
 * `{ recipient_id, message_id }` on success. We surface both back to the
 * caller along with the raw response so the portal UI can log the
 * acknowledged message id.
 *
 * The caller is responsible for enforcing Meta's 24-hour "standard
 * messaging" window — this helper does not attach a message tag, so
 * outbound replies must be in response to an inbound message within
 * the last 24h.
 */
export async function sendFacebookMessengerReply(
  clientId: number,
  pageId: string,
  recipientPsid: string,
  message: string,
): Promise<SendMessengerReplyResult> {
  const conn = await getConnectedPageToken(clientId, pageId);
  if (!conn) {
    throw new Error("Page not connected to this account, or token expired. Reconnect required.");
  }

  const body = {
    recipient: { id: recipientPsid },
    message: { text: message },
    messaging_type: "RESPONSE" as const,
  };

  const url = `${GRAPH_API_BASE}/me/messages?access_token=${encodeURIComponent(conn.token)}`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Failed to send Messenger reply: ${(err as any)?.error?.message || res.statusText}`,
    );
  }
  const data = (await res.json().catch(() => ({}))) as any;
  return {
    recipient_id: typeof data.recipient_id === "string" ? data.recipient_id : null,
    message_id: typeof data.message_id === "string" ? data.message_id : null,
    meta_response: data,
  };
}

/**
 * Return the Meta app secret used to sign incoming webhook requests.
 * Both FACEBOOK_APP_SECRET (SocialSync OAuth flow) and
 * FACEBOOK_OAUTH_CLIENT_SECRET (social-login OAuth flow) refer to the
 * same Meta App, but historically two env names coexist. We accept
 * either so deployments aren't blocked by which name is populated.
 */
export function getMetaAppSecret(): string | null {
  return (
    process.env.FACEBOOK_APP_SECRET ||
    process.env.FACEBOOK_OAUTH_CLIENT_SECRET ||
    null
  );
}

/**
 * Verify the X-Hub-Signature-256 header on an inbound Meta webhook
 * delivery. Meta signs the raw request body with HMAC-SHA256 using the
 * app secret and sends the hex digest in the header as `sha256=...`.
 *
 * Returns true if the signature matches, false otherwise. Uses a
 * constant-time comparison to avoid leaking byte-by-byte timing
 * information.
 */
export function verifyMetaWebhookSignature(
  rawBody: Buffer | string,
  headerSignature: string | null | undefined,
): boolean {
  if (!headerSignature || typeof headerSignature !== "string") return false;
  const appSecret = getMetaAppSecret();
  if (!appSecret) return false;

  const expectedPrefix = "sha256=";
  if (!headerSignature.startsWith(expectedPrefix)) return false;
  const providedHex = headerSignature.slice(expectedPrefix.length);

  // Lazy require to keep crypto out of the module-load path for tests
  // that stub fetch but not crypto.
  const { createHmac, timingSafeEqual } = require("crypto") as typeof import("crypto");
  const bodyBuf =
    typeof rawBody === "string" ? Buffer.from(rawBody, "utf-8") : rawBody;
  const expectedHex = createHmac("sha256", appSecret).update(bodyBuf).digest("hex");

  // Lengths must match to use timingSafeEqual; if they don't, signature
  // is invalid regardless.
  if (providedHex.length !== expectedHex.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(providedHex, "hex"),
      Buffer.from(expectedHex, "hex"),
    );
  } catch {
    return false;
  }
}
