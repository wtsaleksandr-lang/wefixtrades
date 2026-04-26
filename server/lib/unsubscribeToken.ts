/**
 * HMAC-signed unsubscribe tokens.
 *
 * The token is a self-verifying string that encodes the recipient email +
 * an HMAC signature. No DB lookup needed to validate the token — we
 * recompute the HMAC and constant-time compare. The DB is only touched
 * when actually recording the unsubscribe.
 *
 * Format:  base64url(email) + "." + base64url(hmac_sha256(email + ":" + secret))
 *
 * Falls back through env vars in this order:
 *   UNSUBSCRIBE_SECRET → SESSION_SECRET → hardcoded dev fallback
 *
 * The dev fallback is intentional: if both env vars are missing, the
 * worst case is someone could mass-unsubscribe people maliciously —
 * annoying but not catastrophic, and tokens still work locally.
 */

import crypto from "crypto";

const DEV_FALLBACK = "wft-unsubscribe-default-key-change-me";

function getSecret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET || DEV_FALLBACK;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf-8") : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function hmac(email: string): Buffer {
  return crypto.createHmac("sha256", getSecret()).update(`${email.toLowerCase()}:unsubscribe`).digest();
}

/**
 * Generate a signed unsubscribe token for a recipient email.
 */
export function buildUnsubscribeToken(email: string): string {
  const emailPart = b64url(email.toLowerCase());
  const sigPart = b64url(hmac(email));
  return `${emailPart}.${sigPart}`;
}

/**
 * Verify a token and extract the email it was signed for.
 * Returns null if the token is malformed or signature doesn't match.
 */
export function verifyUnsubscribeToken(token: string): { email: string } | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  let email: string;
  let providedSig: Buffer;
  try {
    email = b64urlDecode(parts[0]).toString("utf-8");
    providedSig = b64urlDecode(parts[1]);
  } catch {
    return null;
  }

  const expectedSig = hmac(email);
  if (providedSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;

  return { email };
}

/**
 * Build the full one-click unsubscribe URL for the email footer.
 */
export function buildUnsubscribeUrl(email: string, baseUrl?: string): string {
  const base = baseUrl || process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  return `${base.replace(/\/$/, "")}/api/unsubscribe/${buildUnsubscribeToken(email)}`;
}
