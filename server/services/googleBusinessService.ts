/**
 * Google Business Profile service — OAuth connection + review reply posting.
 *
 * Uses googleapis for OAuth2 token management and My Business API for replies.
 *
 * OAuth flow:
 *   1. Admin/client clicks "Connect Google" → GET /api/admin/crm/google/connect?clientId=X
 *   2. Redirects to Google OAuth consent screen
 *   3. Google redirects back to /api/admin/crm/google/callback?code=...&state=...
 *   4. We exchange code for tokens, store encrypted in clients.google_credentials
 *
 * Reply posting:
 *   1. Load client's stored credentials
 *   2. Create OAuth2Client with tokens (auto-refreshes)
 *   3. Call accounts.locations.reviews.updateReply via REST
 */

import { google } from "googleapis";
import { storage } from "../storage";
import { encryptGoogleCredentials, decryptGoogleCredentials } from "../lib/tokenEncryption";
import { createLogger } from "../lib/logger";

const log = createLogger("GoogleBusiness");

const SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

function getClientConfig() {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_BUSINESS_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleOAuthConfigured(): boolean {
  const { clientId, clientSecret, redirectUri } = getClientConfig();
  return !!(clientId && clientSecret && redirectUri);
}

function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = getClientConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth not configured (GOOGLE_BUSINESS_CLIENT_ID, GOOGLE_BUSINESS_CLIENT_SECRET, GOOGLE_BUSINESS_REDIRECT_URI)");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate the Google OAuth consent URL.
 * @param state Opaque state string (JSON with clientId + returnUrl)
 */
export function getGoogleAuthUrl(state: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

/**
 * Exchange authorization code for tokens and store them on the client.
 */
export async function handleGoogleCallback(code: string, clientId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token && !tokens.access_token) {
      return { ok: false, error: "No tokens returned from Google" };
    }

    // Encrypt tokens before storing
    const plainCreds = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      scope: tokens.scope,
      connected_at: new Date().toISOString(),
    };
    const encryptedCreds = encryptGoogleCredentials(plainCreds as Record<string, unknown>);
    if (encryptedCreds === null) {
      return { ok: false, error: "Cannot store credentials — encryption key not configured" };
    }

    await storage.updateClient(clientId, {
      google_credentials: encryptedCreds,
    } as any);

    return { ok: true };
  } catch (err: any) {
    log.error("OAuth callback error", { error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * Get an authenticated OAuth2 client for a specific business client.
 * Automatically refreshes expired tokens.
 */
async function getAuthenticatedClient(clientId: number): Promise<{
  oauth2Client: InstanceType<typeof google.auth.OAuth2>;
  error?: string;
} | null> {
  const client = await storage.getClientById(clientId);
  if (!client?.google_credentials) {
    return null;
  }

  // Decrypt tokens (handles both encrypted and legacy plaintext)
  const rawCreds = client.google_credentials as Record<string, unknown>;
  const creds = decryptGoogleCredentials(rawCreds) as any;
  if (!creds.refresh_token && !creds.access_token) {
    return null;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: creds.access_token,
    refresh_token: creds.refresh_token,
    expiry_date: creds.expiry_date,
    token_type: creds.token_type,
  });

  // Attach refresh handler to persist new tokens (re-encrypt on save)
  oauth2Client.on("tokens", async (tokens) => {
    try {
      const updatedPlain = { ...creds, ...tokens, refreshed_at: new Date().toISOString() };
      const encrypted = encryptGoogleCredentials(updatedPlain);
      if (encrypted) {
        await storage.updateClient(clientId, { google_credentials: encrypted } as any);
      }
    } catch (e: any) {
      log.error("Token refresh save error", { error: e.message });
    }
  });

  return { oauth2Client };
}

/**
 * Post a reply to a Google review.
 *
 * @param clientId WeFixTrades client ID
 * @param googleReviewName The Google API review resource name (accounts/.../locations/.../reviews/...)
 * @param replyText The response text to post
 */
export async function postGoogleReviewReply(
  clientId: number,
  googleReviewName: string,
  replyText: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!replyText || replyText.trim().length < 5) {
    return { ok: false, error: "Reply text too short" };
  }
  if (replyText.length > 4096) {
    return { ok: false, error: "Reply text too long (max 4096 characters)" };
  }

  const auth = await getAuthenticatedClient(clientId);
  if (!auth) {
    return { ok: false, error: "Google account not connected. Please connect your Google Business Profile first." };
  }

  try {
    // Google My Business API — update review reply
    // Resource: accounts/{accountId}/locations/{locationId}/reviews/{reviewId}
    // The googleReviewName should be the full resource path
    const replyName = `${googleReviewName}/reply`;

    const res = await auth.oauth2Client.request({
      url: `https://mybusiness.googleapis.com/v4/${replyName}`,
      method: "PUT",
      data: {
        comment: replyText.trim(),
      },
    });

    if (res.status >= 200 && res.status < 300) {
      return { ok: true };
    } else {
      return { ok: false, error: `Google API returned ${res.status}` };
    }
  } catch (err: any) {
    const status = err?.response?.status;
    const message = err?.response?.data?.error?.message || err.message;

    if (status === 401 || status === 403) {
      return { ok: false, error: "Google authorization expired or insufficient permissions. Please reconnect your Google account." };
    }
    if (status === 404) {
      return { ok: false, error: "Review not found on Google. It may have been deleted." };
    }

    log.error("[GoogleBusiness] Post reply error:", message);
    return { ok: false, error: message };
  }
}

/**
 * Check if a client has valid Google credentials stored.
 */
export async function hasGoogleConnection(clientId: number): Promise<boolean> {
  const client = await storage.getClientById(clientId);
  if (!client?.google_credentials) return false;
  const creds = decryptGoogleCredentials(client.google_credentials as Record<string, unknown>) as any;
  return !!(creds?.refresh_token || creds?.access_token);
}
