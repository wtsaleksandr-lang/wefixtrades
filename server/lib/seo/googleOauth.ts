/**
 * Google OAuth 2.0 helpers — authorize URL + code exchange + refresh.
 *
 * Uses the existing `googleapis` dep (already in tree). One web-app
 * OAuth client serves all Google scopes (GSC, GA4 admin/read, GBP).
 * Credentials live in Doppler: GOOGLE_OAUTH_CLIENT_ID,
 * GOOGLE_OAUTH_CLIENT_SECRET.
 *
 * Redirect URI: https://wefixtrades.com/api/admin/integrations/google/callback
 * (override via GOOGLE_OAUTH_REDIRECT_URI for local dev).
 *
 * `access_type=offline` + `prompt=consent` ensures we always receive a
 * refresh_token, even on subsequent reconnects. State is a CSRF nonce
 * signed-ish via the existing session — for v1 we sign with a random
 * value stored in the session.
 */

import { google } from "googleapis";
import { createLogger } from "../logger";
import { upsertToken, getToken, isExpiringSoon, type Provider } from "./oauthTokenStore";

const log = createLogger("GoogleOAuth");

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/business.manage",
  "openid",
  "email",
  "profile",
] as const;

const DEFAULT_REDIRECT_URI = "https://wefixtrades.com/api/admin/integrations/google/callback";

function getRedirectUri(): string {
  return process.env.GOOGLE_OAUTH_REDIRECT_URI ?? DEFAULT_REDIRECT_URI;
}

export function isGoogleOauthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function makeOauthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in Doppler");
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

export function buildAuthorizeUrl(state: string): string {
  const oauth2Client = makeOauthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [...GOOGLE_SCOPES],
    state,
  });
}

export interface GoogleTokenSet {
  access_token: string;
  refresh_token?: string | null;
  expiry_date?: number | null; // ms epoch
  scope?: string | null;
  id_token?: string | null;
  account_email?: string | null;
}

export async function exchangeCode(code: string): Promise<GoogleTokenSet> {
  const oauth2Client = makeOauthClient();
  const { tokens } = await oauth2Client.getToken(code);

  let email: string | null = null;
  if (tokens.id_token) {
    try {
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
      });
      email = ticket.getPayload()?.email ?? null;
    } catch (err) {
      log.warn("Failed to verify id_token for email lookup", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!tokens.access_token) {
    throw new Error("Google did not return an access_token");
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    scope: tokens.scope,
    id_token: tokens.id_token,
    account_email: email,
  };
}

/**
 * Refresh the stored Google token. Returns the fresh access_token, or
 * null if there is no stored token / no refresh_token / refresh failed.
 */
export async function refreshGoogleToken(provider: Provider = "google"): Promise<string | null> {
  const stored = await getToken(provider);
  if (!stored || !stored.refresh_token) return null;

  const oauth2Client = makeOauthClient();
  oauth2Client.setCredentials({ refresh_token: stored.refresh_token });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    if (!credentials.access_token) return null;
    await upsertToken({
      provider,
      account_email: stored.account_email,
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token ?? stored.refresh_token,
      expires_at: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      scopes: stored.scopes,
    });
    return credentials.access_token;
  } catch (err) {
    log.error("Failed to refresh Google token", {
      err: err instanceof Error ? err.message : String(err),
      provider,
    });
    return null;
  }
}

/**
 * Returns a fresh access token for the provider, refreshing if needed.
 * Throws if no token is connected or refresh fails.
 */
export async function getFreshAccessToken(provider: Provider = "google"): Promise<string> {
  const stored = await getToken(provider);
  if (!stored) throw new Error(`No ${provider} token connected`);

  if (isExpiringSoon(stored)) {
    const refreshed = await refreshGoogleToken(provider);
    if (!refreshed) throw new Error(`Failed to refresh ${provider} token`);
    return refreshed;
  }
  return stored.access_token;
}

export async function persistInitialTokens(tokens: GoogleTokenSet): Promise<void> {
  await upsertToken({
    provider: "google",
    account_email: tokens.account_email ?? null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scopes: tokens.scope ? tokens.scope.split(" ") : [...GOOGLE_SCOPES],
  });
}
