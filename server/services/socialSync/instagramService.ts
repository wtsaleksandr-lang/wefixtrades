/**
 * Instagram integration service for SocialSync.
 *
 * Instagram publishing uses the Instagram Graph API, which requires:
 * 1. A Meta/Facebook user auth (same OAuth as Facebook — handled in facebookService)
 * 2. A Facebook Page linked to an Instagram Business/Professional account
 * 3. The page-level access token (which grants Instagram API access)
 *
 * This service handles:
 * - Discovering Instagram business accounts linked to Facebook pages
 * - Selecting an Instagram account as publishing target
 * - Validating Instagram connections
 * - Providing token access for the publishing worker
 */
import { storage } from "../../storage";
import { decryptToken, encryptToken } from "./tokenEncryption";
import { fetchFacebookPages, type FacebookPage, type InstagramBusinessAccount } from "./facebookService";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

/* ─── Discovery ─── */

export interface DiscoveredInstagramAccount extends InstagramBusinessAccount {
  facebook_page_id: string;
  facebook_page_name: string;
}

/**
 * Discover all Instagram business/professional accounts available to this client.
 * Requires an active Facebook connection (the Meta OAuth covers both).
 */
export async function discoverInstagramAccounts(
  clientId: number,
): Promise<{ accounts: DiscoveredInstagramAccount[]; error?: string }> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const fbConn = connections.find(c => c.platform === "facebook");

  if (!fbConn || !fbConn.token_ref) {
    return { accounts: [], error: "No Meta/Facebook connection found. Connect Facebook first — Instagram uses the same auth." };
  }

  if (fbConn.connection_status !== "connected") {
    return { accounts: [], error: `Facebook connection status is "${fbConn.connection_status}". Reconnect required.` };
  }

  // Use stored metadata first (faster, no API call)
  const metadata = (fbConn.metadata as any) || {};
  const discoveredPages: any[] = metadata.pages_discovered || [];

  const accounts: DiscoveredInstagramAccount[] = [];
  for (const page of discoveredPages) {
    if (page.instagram_business_account) {
      accounts.push({
        ...page.instagram_business_account,
        facebook_page_id: page.id,
        facebook_page_name: page.name,
      });
    }
  }

  return { accounts };
}

/**
 * Fresh discovery — re-fetches from the Graph API to get latest data.
 */
export async function refreshInstagramDiscovery(
  clientId: number,
): Promise<{ accounts: DiscoveredInstagramAccount[]; error?: string }> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const fbConn = connections.find(c => c.platform === "facebook");

  if (!fbConn || !fbConn.token_ref) {
    return { accounts: [], error: "No Meta/Facebook connection found." };
  }

  if (fbConn.connection_status !== "connected") {
    return { accounts: [], error: `Connection status is "${fbConn.connection_status}".` };
  }

  try {
    // Decrypt the user-level token (or page token — we need user token for /me/accounts)
    // If a page was already selected, the token_ref holds the page token.
    // We need the original user token stored during initial connection.
    // Strategy: re-fetch pages using the current token. If it's a page token,
    // the /me/accounts call won't work. We handle this gracefully by using stored metadata.
    const token = decryptToken(fbConn.token_ref);

    let pages: FacebookPage[];
    try {
      pages = await fetchFacebookPages(token);
    } catch {
      // Token might be a page token (after page selection), fall back to stored metadata
      return discoverInstagramAccounts(clientId);
    }

    // Update stored metadata with fresh discovery
    const updatedMetadata = {
      ...(fbConn.metadata as any || {}),
      pages_discovered: pages.map(p => ({
        id: p.id, name: p.name, category: p.category,
        instagram_business_account: p.instagram_business_account,
      })),
      ig_discovery_refreshed_at: new Date().toISOString(),
    };

    await storage.upsertSocialSyncConnection({
      client_id: clientId,
      platform: "facebook",
      connection_status: fbConn.connection_status,
      external_account_id: fbConn.external_account_id,
      external_page_id: fbConn.external_page_id,
      token_ref: fbConn.token_ref,
      token_expires_at: fbConn.token_expires_at,
      last_validated_at: fbConn.last_validated_at,
      metadata: updatedMetadata,
    } as any);

    const accounts: DiscoveredInstagramAccount[] = [];
    for (const page of pages) {
      if (page.instagram_business_account) {
        accounts.push({
          ...page.instagram_business_account,
          facebook_page_id: page.id,
          facebook_page_name: page.name,
        });
      }
    }

    return { accounts };
  } catch (err: any) {
    return { accounts: [], error: `Discovery failed: ${err.message}` };
  }
}

/* ─── Selection ─── */

/**
 * Select an Instagram business account as the publishing target.
 * Stores a separate "instagram" connection row that references the
 * parent Facebook page and its page token.
 */
export async function selectInstagramAccount(
  clientId: number,
  instagramAccountId: string,
): Promise<void> {
  // Find the Instagram account in discovered data
  const { accounts, error } = await discoverInstagramAccounts(clientId);
  if (error) throw new Error(error);

  const selected = accounts.find(a => a.id === instagramAccountId);
  if (!selected) {
    throw new Error(`Instagram account ${instagramAccountId} not found. Ensure it is a business/professional account linked to a Facebook page.`);
  }

  // We need the page token from the associated Facebook page
  const connections = await storage.listSocialSyncConnections(clientId);
  const fbConn = connections.find(c => c.platform === "facebook");
  if (!fbConn || !fbConn.token_ref) {
    throw new Error("Facebook connection required for Instagram publishing.");
  }

  // Get the page-level token for the parent Facebook page
  let pageToken: string;
  try {
    const userOrPageToken = decryptToken(fbConn.token_ref);
    // Try fetching pages to get the specific page token
    const pages = await fetchFacebookPages(userOrPageToken);
    const parentPage = pages.find(p => p.id === selected.facebook_page_id);
    if (!parentPage) {
      throw new Error(`Parent Facebook page ${selected.facebook_page_id} no longer accessible.`);
    }
    pageToken = parentPage.access_token;
  } catch (fetchErr: any) {
    // If we can't re-fetch, and the FB connection already has this page selected,
    // reuse the existing page token
    if (fbConn.external_page_id === selected.facebook_page_id) {
      pageToken = decryptToken(fbConn.token_ref);
    } else {
      throw new Error(`Cannot obtain page token for Instagram: ${fetchErr.message}`);
    }
  }

  const encryptedToken = encryptToken(pageToken);

  // Upsert Instagram connection
  await storage.upsertSocialSyncConnection({
    client_id: clientId,
    platform: "instagram",
    connection_status: "connected",
    external_account_id: instagramAccountId,
    external_page_id: selected.facebook_page_id, // The parent FB page
    token_ref: encryptedToken,
    token_expires_at: fbConn.token_expires_at, // Inherits from FB token
    last_validated_at: new Date(),
    metadata: {
      username: selected.username,
      name: selected.name,
      profile_picture_url: selected.profile_picture_url,
      followers_count: selected.followers_count,
      facebook_page_id: selected.facebook_page_id,
      facebook_page_name: selected.facebook_page_name,
      selected_at: new Date().toISOString(),
    },
  } as any);

  await storage.createSocialSyncLog({
    client_id: clientId,
    entity_type: "connection",
    entity_id: null as any,
    action: "instagram.account_selected",
    status: "success",
    details: {
      instagram_id: instagramAccountId,
      username: selected.username,
      facebook_page_id: selected.facebook_page_id,
    },
  });
}

/* ─── Validation ─── */

/**
 * Validate the Instagram connection by checking the account exists and is accessible.
 */
export async function validateInstagramConnection(
  clientId: number,
): Promise<{ valid: boolean; error?: string }> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const igConn = connections.find(c => c.platform === "instagram");

  if (!igConn || !igConn.token_ref || !igConn.external_account_id) {
    return { valid: false, error: "No Instagram connection found" };
  }

  if (igConn.token_expires_at && new Date(igConn.token_expires_at) < new Date()) {
    await storage.upsertSocialSyncConnection({
      ...igConn,
      connection_status: "expired",
    } as any);
    return { valid: false, error: "Token has expired. Reconnect Meta/Facebook to refresh." };
  }

  try {
    const token = decryptToken(igConn.token_ref);

    // Validate by fetching the IG account info via Graph API
    const res = await fetch(
      `${GRAPH_API_BASE}/${igConn.external_account_id}?fields=id,username,name,profile_picture_url,followers_count&access_token=${token}`
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Instagram validation failed: ${(err as any)?.error?.message || res.statusText}`);
    }

    const igData = await res.json() as any;

    // Update connection with fresh metadata
    await storage.upsertSocialSyncConnection({
      ...igConn,
      connection_status: "connected",
      last_validated_at: new Date(),
      metadata: {
        ...(igConn.metadata as any || {}),
        username: igData.username || (igConn.metadata as any)?.username,
        name: igData.name || (igConn.metadata as any)?.name,
        followers_count: igData.followers_count ?? (igConn.metadata as any)?.followers_count,
        profile_picture_url: igData.profile_picture_url || (igConn.metadata as any)?.profile_picture_url,
      },
    } as any);

    await storage.createSocialSyncLog({
      client_id: clientId,
      entity_type: "connection",
      entity_id: igConn.id,
      action: "instagram.validated",
      status: "success",
      details: { username: igData.username },
    });

    return { valid: true };
  } catch (err: any) {
    await storage.upsertSocialSyncConnection({
      ...igConn,
      connection_status: "error",
      metadata: {
        ...(igConn.metadata as any || {}),
        last_error: err.message,
        error_at: new Date().toISOString(),
      },
    } as any);

    await storage.createSocialSyncLog({
      client_id: clientId,
      entity_type: "connection",
      entity_id: igConn.id,
      action: "instagram.validation_failed",
      status: "failure",
      details: { error: err.message },
    });

    return { valid: false, error: err.message };
  }
}

/**
 * Get the decrypted token and account ID for Instagram publishing.
 * Internal use only — never expose via API.
 */
export async function getInstagramPublishCredentials(
  clientId: number,
): Promise<{ token: string; igAccountId: string; fbPageId: string } | null> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const igConn = connections.find(c => c.platform === "instagram" && c.connection_status === "connected");

  if (!igConn || !igConn.token_ref || !igConn.external_account_id || !igConn.external_page_id) return null;
  if (igConn.token_expires_at && new Date(igConn.token_expires_at) < new Date()) return null;

  try {
    const token = decryptToken(igConn.token_ref);
    return { token, igAccountId: igConn.external_account_id, fbPageId: igConn.external_page_id };
  } catch {
    return null;
  }
}
