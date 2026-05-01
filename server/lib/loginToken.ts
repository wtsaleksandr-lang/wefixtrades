/**
 * HMAC-signed one-time login tokens for post-checkout auto-login.
 *
 * Format: base64url(payload).base64url(hmac_sha256(payload, secret))
 * payload = userId:expiresAt:nonce
 *
 * Also includes an in-memory map from Stripe session IDs to login tokens,
 * so the checkout success page can exchange a session_id for a login.
 */

import { randomBytes, createHmac, timingSafeEqual } from "crypto";

const LOGIN_TOKEN_TTL = 24 * 60 * 60; // 24 hours in seconds

function getSecret(): string {
  return process.env.SESSION_SECRET || "wft-login-token-dev-fallback";
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf-8") : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function hmac(payload: string): Buffer {
  return createHmac("sha256", getSecret()).update(`${payload}:login_token`).digest();
}

/** Build a one-time login token for a user. */
export function buildLoginToken(userId: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + LOGIN_TOKEN_TTL;
  const nonce = randomBytes(8).toString("hex");
  const payload = `${userId}:${expiresAt}:${nonce}`;
  return `${b64url(payload)}.${b64url(hmac(payload))}`;
}

/** Verify a login token. Returns the user ID or null. */
export function verifyLoginToken(token: string): { userId: number; expiresAt: number } | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  let payload: string;
  let providedSig: Buffer;
  try {
    payload = b64urlDecode(parts[0]).toString("utf-8");
    providedSig = b64urlDecode(parts[1]);
  } catch {
    return null;
  }

  const expectedSig = hmac(payload);
  if (providedSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(providedSig, expectedSig)) return null;

  const segments = payload.split(":");
  if (segments.length < 3) return null;
  const userId = parseInt(segments[0], 10);
  const expiresAt = parseInt(segments[1], 10);
  if (!Number.isFinite(userId) || !Number.isFinite(expiresAt)) return null;
  if (Math.floor(Date.now() / 1000) > expiresAt) return null;

  return { userId, expiresAt };
}

/* ─── Checkout session -> login token map ─── */

const checkoutLoginTokens = new Map<string, { token: string; createdAt: number }>();
const TOKEN_MAP_MAX_AGE_MS = 25 * 60 * 60 * 1000; // 25h

/** Store a login token for a Stripe checkout session ID. */
export function storeCheckoutLoginToken(sessionId: string, token: string) {
  const now = Date.now();
  // Evict stale entries
  for (const [key, val] of checkoutLoginTokens) {
    if (now - val.createdAt > TOKEN_MAP_MAX_AGE_MS) checkoutLoginTokens.delete(key);
  }
  checkoutLoginTokens.set(sessionId, { token, createdAt: now });
}

/** Retrieve (and consume) the login token for a Stripe checkout session. One-time use. */
export function getCheckoutLoginToken(sessionId: string): string | null {
  const entry = checkoutLoginTokens.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TOKEN_MAP_MAX_AGE_MS) {
    checkoutLoginTokens.delete(sessionId);
    return null;
  }
  // One-time use: delete after retrieval
  checkoutLoginTokens.delete(sessionId);
  return entry.token;
}
