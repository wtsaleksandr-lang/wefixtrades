/**
 * Google Business Profile OAuth + Location Discovery service for SocialSync.
 *
 * Uses raw Google OAuth2 REST APIs (no SDK dependency).
 *
 * Google Business Profile publishing flow:
 *   1. OAuth2 to get user consent for business.manage scope
 *   2. Discover accounts via Business Profile API
 *   3. Discover locations per account
 *   4. Select a location as the publishing target
 *   5. Publish local posts via the API
 *
 * Required env vars:
 *   GOOGLE_BUSINESS_CLIENT_ID     — Google Cloud OAuth client ID
 *   GOOGLE_BUSINESS_CLIENT_SECRET — Google Cloud OAuth client secret
 *   GOOGLE_BUSINESS_REDIRECT_URI  — OAuth callback URL
 *   TOKEN_ENCRYPTION_KEY          — for encrypting tokens at rest
 *
 * Google Cloud setup required:
 *   - Enable "Google My Business API" (or "Business Profile API")
 *   - Create OAuth 2.0 Client ID (Web application)
 *   - Add redirect URI
 */
import crypto from "crypto";
import { storage } from "../../storage";
import { encryptToken, decryptToken } from "./tokenEncryption";
import { fetchWithRetry } from "../../lib/httpRetry";
import { createLogger } from "../../lib/logger";

const log = createLogger("SocialSyncGBP");

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GBP_API_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const GBP_ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";

/* ─── Config ─── */

export function getGoogleBusinessConfig() {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_BUSINESS_REDIRECT_URI;
  return {
    clientId: clientId || null,
    clientSecret: clientSecret || null,
    redirectUri: redirectUri || null,
    configured: !!(clientId && clientSecret && redirectUri),
  };
}

export function validateGoogleBusinessConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.GOOGLE_BUSINESS_CLIENT_ID) missing.push("GOOGLE_BUSINESS_CLIENT_ID");
  if (!process.env.GOOGLE_BUSINESS_CLIENT_SECRET) missing.push("GOOGLE_BUSINESS_CLIENT_SECRET");
  if (!process.env.GOOGLE_BUSINESS_REDIRECT_URI) missing.push("GOOGLE_BUSINESS_REDIRECT_URI");
  return { valid: missing.length === 0, missing };
}

/* ─── HMAC-signed OAuth state ─── */

const SS_STATE_CONTEXT = "socialsync_google_oauth_state";

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || "wft-oauth-default-key-change-me";
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf-8") : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function hmacState(payload: string): Buffer {
  return crypto.createHmac("sha256", getSessionSecret()).update(`${payload}:${SS_STATE_CONTEXT}`).digest();
}

/** Sign an OAuth state payload with HMAC-SHA256. Format: base64url(payload).base64url(hmac) */
export function signSocialSyncOAuthState(payload: string): string {
  return `${b64url(payload)}.${b64url(hmacState(payload))}`;
}

/** Verify an HMAC-signed OAuth state. Returns the raw payload string or null if invalid. */
export function verifySocialSyncOAuthState(signed: string): string | null {
  if (!signed || typeof signed !== "string") return null;
  const parts = signed.split(".");
  if (parts.length !== 2) return null;

  let payload: string;
  let providedSig: Buffer;
  try {
    payload = b64urlDecode(parts[0]).toString("utf-8");
    providedSig = b64urlDecode(parts[1]);
  } catch {
    return null;
  }

  const expectedSig = hmacState(payload);
  if (providedSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;

  return payload;
}

/* ─── OAuth URL ─── */

const SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
].join(" ");

export function buildGoogleOAuthUrl(
  clientId: number,
  options?: { source?: "admin" | "portal-mapguard" },
): string {
  const config = getGoogleBusinessConfig();
  if (!config.clientId || !config.redirectUri) {
    throw new Error("Google Business OAuth not configured");
  }

  // `source` is embedded in the signed state so the callback can decide
  // where to redirect the browser after success (admin CRM vs portal).
  const payload = JSON.stringify({
    clientId,
    ts: Date.now(),
    source: options?.source || "admin",
  });
  const signedState = signSocialSyncOAuthState(payload);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",   // Request refresh token
    prompt: "consent",        // Force consent to ensure refresh token
    state: signedState,
  });

  return `${GOOGLE_OAUTH_BASE}/auth?${params.toString()}`;
}

/* ─── Token Exchange ─── */

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const config = getGoogleBusinessConfig();
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error("Google Business OAuth not configured");
  }

  const res = await fetchWithRetry(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google token exchange failed: ${(err as any)?.error_description || (err as any)?.error || res.statusText}`);
  }

  return res.json() as Promise<GoogleTokenResponse>;
}

/**
 * Refresh an expired access token using the stored refresh token.
 * Google OAuth supports silent refresh (unlike Meta).
 */
export async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const config = getGoogleBusinessConfig();
  if (!config.clientId || !config.clientSecret) throw new Error("Google Business OAuth not configured");

  const res = await fetchWithRetry(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google token refresh failed: ${(err as any)?.error_description || (err as any)?.error || res.statusText}`);
  }

  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

/* ─── Account & Location Discovery ─── */

export interface GoogleBusinessAccount {
  name: string;     // accounts/{accountId}
  accountName: string;
  type: string;
}

export interface GoogleBusinessLocation {
  name: string;          // locations/{locationId}
  title: string;         // Display name
  storefrontAddress?: { locality?: string; administrativeArea?: string };
  websiteUri?: string;
}

async function fetchWithAuth(url: string, token: string, method = "GET", body?: any): Promise<any> {
  const res = await fetchWithRetry(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = (data as any)?.error?.message || res.statusText;
    const errCode = (data as any)?.error?.code || res.status;
    throw Object.assign(new Error(errMsg), { code: errCode, status: res.status });
  }
  return data;
}

async function fetchAccounts(accessToken: string): Promise<GoogleBusinessAccount[]> {
  const data = await fetchWithAuth(GBP_ACCOUNTS_URL, accessToken);
  return (data.accounts || []).map((a: any) => ({
    name: a.name,
    accountName: a.accountName || a.name,
    type: a.type || "PERSONAL",
  }));
}

async function fetchLocations(accessToken: string, accountName: string): Promise<GoogleBusinessLocation[]> {
  const url = `${GBP_API_BASE}/${accountName}/locations?readMask=name,title,storefrontAddress,websiteUri&pageSize=100`;
  const data = await fetchWithAuth(url, accessToken);
  return (data.locations || []).map((l: any) => ({
    name: l.name,
    title: l.title || "Unnamed Location",
    storefrontAddress: l.storefrontAddress,
    websiteUri: l.websiteUri,
  }));
}

/* ─── Connection Handling ─── */

export interface GoogleConnectionResult {
  connectionId: number;
  accounts: GoogleBusinessAccount[];
  locations: GoogleBusinessLocation[];
}

export async function handleGoogleCallback(
  clientId: number,
  code: string,
): Promise<GoogleConnectionResult> {
  const tokens = await exchangeCodeForTokens(code);

  // Store both access and refresh tokens (encrypted separately)
  const encryptedAccess = encryptToken(tokens.access_token);
  const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Discover accounts
  const accounts = await fetchAccounts(tokens.access_token);

  // Discover locations for all accounts
  const allLocations: GoogleBusinessLocation[] = [];
  for (const account of accounts) {
    try {
      const locs = await fetchLocations(tokens.access_token, account.name);
      allLocations.push(...locs);
    } catch { /* Some accounts may not have locations */ }
  }

  const connection = await storage.upsertSocialSyncConnection({
    client_id: clientId,
    platform: "google_business",
    connection_status: "connected",
    external_account_id: accounts[0]?.name || null,
    external_page_id: null,
    token_ref: encryptedAccess,
    token_expires_at: expiresAt,
    last_validated_at: new Date(),
    metadata: {
      refresh_token_ref: encryptedRefresh,
      accounts: accounts.map(a => ({ name: a.name, accountName: a.accountName, type: a.type })),
      locations: allLocations.map(l => ({
        name: l.name,
        title: l.title,
        address: l.storefrontAddress ? `${l.storefrontAddress.locality || ""}, ${l.storefrontAddress.administrativeArea || ""}`.trim() : null,
      })),
      connected_at: new Date().toISOString(),
      has_refresh_token: !!tokens.refresh_token,
    },
  } as any);

  await storage.createSocialSyncLog({
    client_id: clientId,
    entity_type: "connection",
    entity_id: connection.id,
    action: "google_business.connected",
    status: "success",
    details: { accounts: accounts.length, locations: allLocations.length },
  });

  return { connectionId: connection.id, accounts, locations: allLocations };
}

/**
 * Select a Google Business location as the publishing target.
 */
export async function selectGoogleLocation(clientId: number, locationName: string): Promise<void> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const conn = connections.find(c => c.platform === "google_business");
  if (!conn || conn.connection_status !== "connected") {
    throw new Error("No active Google Business connection. Connect first.");
  }

  const metadata = (conn.metadata as any) || {};
  const locations: any[] = metadata.locations || [];
  const selected = locations.find((l: any) => l.name === locationName);
  if (!selected) {
    throw new Error(`Location "${locationName}" not found in discovered locations.`);
  }

  await storage.upsertSocialSyncConnection({
    ...conn,
    external_page_id: locationName,
    metadata: {
      ...metadata,
      selected_location: selected,
      location_selected_at: new Date().toISOString(),
    },
  } as any);

  await storage.createSocialSyncLog({
    client_id: clientId,
    entity_type: "connection",
    entity_id: conn.id,
    action: "google_business.location_selected",
    status: "success",
    details: { location: locationName, title: selected.title },
  });
}

/**
 * Get a valid access token, refreshing if expired.
 */
export async function getGoogleAccessToken(clientId: number): Promise<{ token: string; locationName: string } | null> {
  const connections = await storage.listSocialSyncConnections(clientId);
  const conn = connections.find(c => c.platform === "google_business" && c.connection_status === "connected");
  if (!conn || !conn.token_ref || !conn.external_page_id) return null;

  const metadata = (conn.metadata as any) || {};
  let accessToken = decryptToken(conn.token_ref);

  // Check if token is expired or about to expire (5 min buffer)
  if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
    if (!metadata.refresh_token_ref) return null;

    try {
      const refreshToken = decryptToken(metadata.refresh_token_ref);
      const refreshed = await refreshGoogleToken(refreshToken);
      accessToken = refreshed.access_token;

      // Update stored access token and expiry
      await storage.upsertSocialSyncConnection({
        ...conn,
        token_ref: encryptToken(accessToken),
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000),
        last_validated_at: new Date(),
      } as any);
    } catch (err: any) {
      await storage.upsertSocialSyncConnection({
        ...conn,
        connection_status: "expired",
        metadata: { ...metadata, last_error: `Refresh failed: ${err.message}`, error_at: new Date().toISOString() },
      } as any);
      return null;
    }
  }

  return { token: accessToken, locationName: conn.external_page_id };
}

/**
 * Revoke Google OAuth tokens for a SocialSync connection before disconnecting.
 * Calls Google's revoke endpoint; fails safely (logs warning on error).
 */
export async function revokeSocialSyncGoogleTokens(clientId: number): Promise<boolean> {
  try {
    const connections = await storage.listSocialSyncConnections(clientId);
    const conn = connections.find(c => c.platform === "google_business");
    if (!conn?.token_ref) return false;

    const accessToken = decryptToken(conn.token_ref);
    if (!accessToken) return false;

    const res = await fetchWithRetry(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    if (res.ok) {
      log.info("SocialSync Google token revoked successfully", { clientId: String(clientId) });
      return true;
    } else {
      const body = await res.text().catch(() => "");
      log.warn("SocialSync Google token revocation returned non-OK", {
        clientId: String(clientId),
        status: String(res.status),
        body,
      });
      return false;
    }
  } catch (err: any) {
    log.warn("SocialSync Google token revocation failed (will still clear credentials)", {
      clientId: String(clientId),
      error: err.message,
    });
    return false;
  }
}

/**
 * Validate Google Business connection.
 */
export async function validateGoogleConnection(clientId: number): Promise<{ valid: boolean; error?: string }> {
  const credentials = await getGoogleAccessToken(clientId);
  if (!credentials) return { valid: false, error: "No active Google Business connection or token refresh failed" };

  try {
    await fetchWithAuth(`${GBP_API_BASE}/${credentials.locationName}?readMask=name,title`, credentials.token);

    const connections = await storage.listSocialSyncConnections(clientId);
    const conn = connections.find(c => c.platform === "google_business");
    if (conn) {
      await storage.upsertSocialSyncConnection({ ...conn, connection_status: "connected", last_validated_at: new Date() } as any);
    }

    return { valid: true };
  } catch (err: any) {
    const connections = await storage.listSocialSyncConnections(clientId);
    const conn = connections.find(c => c.platform === "google_business");
    if (conn) {
      await storage.upsertSocialSyncConnection({
        ...conn,
        connection_status: "error",
        metadata: { ...(conn.metadata as any || {}), last_error: err.message, error_at: new Date().toISOString() },
      } as any);
    }
    return { valid: false, error: err.message };
  }
}
