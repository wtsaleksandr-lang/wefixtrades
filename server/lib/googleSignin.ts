/**
 * "Continue with Google" — OpenID Connect sign-in helper.
 *
 * Separate from server/services/socialSync/googleBusinessService.ts:
 * that handles the `business.manage` scope for MapGuard's GBP
 * publishing. THIS handles plain identity sign-in (`openid email
 * profile`) for the WeFixTrades portal login/signup.
 *
 * Reuses the same Google OAuth client (GOOGLE_BUSINESS_CLIENT_ID /
 * _SECRET) — Google scopes are requested per-authorization, so one
 * client serves both flows. Only the redirect URI differs, so this
 * uses its own GOOGLE_SIGNIN_REDIRECT_URI.
 *
 * Auth-code flow:
 *   1. buildGoogleSigninUrl() → redirect the browser to Google
 *   2. Google redirects back to the callback with ?code=&state=
 *   3. exchangeCodeForProfile(code) → { sub, email, email_verified, name }
 *
 * The profile is read from Google's userinfo endpoint using the
 * access token we just minted — no JWT signature verification needed
 * because the token came directly from Google's HTTPS token endpoint
 * (the TLS channel is the trust anchor for the auth-code flow).
 */
import crypto from "crypto";
import { createLogger } from "./logger";

const log = createLogger("GoogleSignin");

const GOOGLE_OAUTH_AUTH = "https://accounts.google.com/o/oauth2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const SIGNIN_SCOPES = ["openid", "email", "profile"].join(" ");

/* ─── Config ─── */

export function getGoogleSigninConfig() {
  // Reuse the existing Google OAuth client credentials.
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID || null;
  const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET || null;
  // Dedicated redirect URI for the sign-in callback. Falls back to the
  // production URL so a missing env var doesn't break prod.
  const redirectUri =
    process.env.GOOGLE_SIGNIN_REDIRECT_URI ||
    "https://wefixtrades.com/api/auth/google/callback";
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: !!(clientId && clientSecret),
  };
}

export function isGoogleSigninConfigured(): boolean {
  return getGoogleSigninConfig().configured;
}

/* ─── HMAC-signed OAuth state ───
   Mirrors the SocialSync pattern: a CSRF guard that also carries a
   small payload (here, an optional post-login redirect path). */

const STATE_CONTEXT = "wft_google_signin_state";

function getStateSecret(): string {
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
  return crypto.createHmac("sha256", getStateSecret()).update(`${payload}:${STATE_CONTEXT}`).digest();
}

/** Sign a state payload. Format: base64url(payload).base64url(hmac) */
export function signSigninState(payload: string): string {
  return `${b64url(payload)}.${b64url(hmacState(payload))}`;
}

/** Verify a signed state. Returns the raw payload string, or null if tampered. */
export function verifySigninState(signed: string): string | null {
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

/**
 * Build the Google consent URL. `mode` is recorded in the signed state
 * so the callback can tailor messaging (login vs signup) — purely
 * cosmetic; both modes follow the same logic.
 */
export function buildGoogleSigninUrl(mode: "login" | "signup" = "login"): string {
  const config = getGoogleSigninConfig();
  if (!config.clientId) throw new Error("Google sign-in not configured");

  const payload = JSON.stringify({ mode, ts: Date.now() });
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SIGNIN_SCOPES,
    state: signSigninState(payload),
    // Identity sign-in: no refresh token needed, and we want the
    // account chooser so users on multiple Google accounts can pick.
    prompt: "select_account",
  });
  return `${GOOGLE_OAUTH_AUTH}?${params.toString()}`;
}

/* ─── Code → profile ─── */

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string | null;
}

/**
 * Exchange an auth code for the user's Google profile.
 * Throws on any failure (caller maps to a friendly redirect).
 */
export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const config = getGoogleSigninConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Google sign-in not configured");
  }

  // 1. Code → access token
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    throw new Error(
      `Google token exchange failed: ${(err as any)?.error_description || (err as any)?.error || tokenRes.statusText}`,
    );
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) throw new Error("Google token exchange returned no access_token");

  // 2. Access token → userinfo
  const infoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!infoRes.ok) {
    throw new Error(`Google userinfo fetch failed: ${infoRes.status} ${infoRes.statusText}`);
  }
  const info = (await infoRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };

  if (!info.sub || !info.email) {
    throw new Error("Google userinfo missing sub or email");
  }

  log.info("Google sign-in profile resolved", { sub: info.sub, email_verified: !!info.email_verified });

  return {
    sub: info.sub,
    email: info.email.toLowerCase().trim(),
    email_verified: info.email_verified === true,
    name: info.name?.trim() || null,
  };
}
