/**
 * HMAC-signed billing-portal tokens.
 *
 * Self-verifying tokens that authorize creating a fresh Stripe Customer
 * Billing Portal session for a specific Stripe customer ID, bounded by
 * an expiry timestamp. No DB lookup needed for verification.
 *
 * Why a token instead of embedding the portal URL directly:
 *   Stripe portal session URLs expire after a few minutes if unused. If
 *   we baked the portal URL into the dunning email at send time, a
 *   customer who opens the email 6 minutes later would hit a dead link.
 *   This token lets the email link work for its full useful lifespan
 *   (default 30 days), with the actual portal session minted fresh on
 *   each click.
 *
 * Format:  base64url(payload).base64url(hmac_sha256(payload, secret))
 *   payload = `${stripe_customer_id}:${expires_at_unix_seconds}`
 *
 * Falls back through env vars in this order:
 *   BILLING_PORTAL_SECRET → SESSION_SECRET → hardcoded dev fallback
 */

import crypto from "crypto";

const DEV_FALLBACK = "wft-billing-portal-default-key-change-me";
const DEFAULT_TTL_DAYS = 30;

function getSecret(): string {
  return process.env.BILLING_PORTAL_SECRET || process.env.SESSION_SECRET || DEV_FALLBACK;
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
  return crypto.createHmac("sha256", getSecret()).update(`${payload}:billing_portal`).digest();
}

export function buildBillingPortalToken(opts: {
  stripeCustomerId: string;
  ttlSeconds?: number;
}): string {
  const ttl = opts.ttlSeconds ?? DEFAULT_TTL_DAYS * 24 * 60 * 60;
  const expiresAt = Math.floor(Date.now() / 1000) + ttl;
  const payload = `${opts.stripeCustomerId}:${expiresAt}`;
  return `${b64url(payload)}.${b64url(hmac(payload))}`;
}

export function verifyBillingPortalToken(token: string): { stripeCustomerId: string; expiresAt: number } | null {
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
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;

  const colonIdx = payload.lastIndexOf(":");
  if (colonIdx === -1) return null;
  const stripeCustomerId = payload.slice(0, colonIdx);
  const expiresAt = parseInt(payload.slice(colonIdx + 1), 10);
  if (!stripeCustomerId || !Number.isFinite(expiresAt)) return null;

  if (Math.floor(Date.now() / 1000) > expiresAt) return null;
  return { stripeCustomerId, expiresAt };
}

/**
 * Build the full /api/billing/portal/:token URL — what dunning emails
 * embed as their CTA.
 */
export function buildBillingPortalUrl(opts: {
  stripeCustomerId: string;
  baseUrl?: string;
  ttlSeconds?: number;
}): string {
  const base = opts.baseUrl || process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  return `${base.replace(/\/$/, "")}/api/billing/portal/${buildBillingPortalToken(opts)}`;
}
