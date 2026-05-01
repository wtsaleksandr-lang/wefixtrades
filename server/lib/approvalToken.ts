/**
 * Magic-link approval tokens.
 *
 * HMAC-signed tokens that authorize one-click design approval from
 * email, without requiring the client to log in. Each token encodes:
 *   - taskId: the fulfillment task to act on
 *   - clientId: the client performing the action
 *   - action: "approve" or "revision"
 *   - exp: expiry timestamp (24h from generation)
 *
 * Format: base64url(payload).base64url(hmac_sha256(payload, secret))
 *   payload = JSON.stringify({ taskId, clientId, action, exp })
 *
 * Uses SESSION_SECRET as the signing key (same trust boundary as
 * session cookies).
 */

import crypto from "crypto";

const DEV_FALLBACK = "wft-approval-default-key-change-me";
const TOKEN_TTL_HOURS = 24;

function getSecret(): string {
  return process.env.SESSION_SECRET || DEV_FALLBACK;
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
  return crypto.createHmac("sha256", getSecret()).update(`${payload}:approval_token`).digest();
}

export interface ApprovalTokenPayload {
  taskId: number;
  clientId: number;
  action: "approve" | "revision";
  exp: number; // unix seconds
}

export function generateApprovalToken(
  taskId: number,
  clientId: number,
  action: "approve" | "revision",
): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_HOURS * 60 * 60;
  const payload = JSON.stringify({ taskId, clientId, action, exp });
  return `${b64url(payload)}.${b64url(hmac(payload))}`;
}

export function verifyApprovalToken(token: string): ApprovalTokenPayload | null {
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

  let parsed: ApprovalTokenPayload;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!parsed.taskId || !parsed.clientId || !parsed.action || !parsed.exp) return null;
  if (parsed.action !== "approve" && parsed.action !== "revision") return null;

  // Check expiry
  if (Math.floor(Date.now() / 1000) > parsed.exp) return null;

  return parsed;
}

/**
 * Build the full approval URL for embedding in emails.
 */
export function buildApprovalUrl(
  taskId: number,
  clientId: number,
  action: "approve" | "revision",
): string {
  const base = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const token = generateApprovalToken(taskId, clientId, action);
  return `${base.replace(/\/$/, "")}/api/approval/${token}`;
}
