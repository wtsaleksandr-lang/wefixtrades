/**
 * Meta `signed_request` parsing + verification.
 *
 * Used by the Data Deletion Request callback (POST /api/meta/data-deletion).
 * Meta POSTs a `signed_request` form parameter shaped like:
 *
 *   <base64url(signature)>.<base64url(json payload)>
 *
 * where `signature` is the raw HMAC-SHA256 of the *encoded* payload string,
 * keyed with the Meta app secret. The decoded payload for a data-deletion
 * request carries:
 *
 *   { algorithm: "HMAC-SHA256", user_id: "<app-scoped id>", issued_at: <unix>, expires?: <unix> }
 *
 * Spec: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 *
 * This module is intentionally pure (no storage / db imports) so the
 * deliberate-failure test fixture (`metaSignedRequest.test.ts`) can run it
 * standalone via tsx.
 */
import { createHmac, timingSafeEqual } from "crypto";

export interface MetaSignedRequestPayload {
  algorithm?: string;
  user_id?: string;
  issued_at?: number;
  expires?: number;
  [key: string]: unknown;
}

function base64UrlDecode(input: string): Buffer | null {
  // Strict base64url alphabet check — reject anything else outright rather
  // than letting Buffer silently skip invalid characters.
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(input)) return null;
  try {
    return Buffer.from(input, "base64url");
  } catch {
    // Defensive: Buffer.from with a validated alphabet shouldn't throw, but
    // a malformed length still must not crash the webhook handler.
    return null;
  }
}

/**
 * Parse and verify a Meta `signed_request`.
 *
 * Returns the decoded payload when (and only when) the HMAC-SHA256
 * signature verifies against `appSecret`. Returns `null` for any
 * malformed input, unsupported algorithm, or signature mismatch —
 * callers treat `null` as "reject the request".
 */
export function parseSignedRequest(
  signedRequest: string | null | undefined,
  appSecret: string | null | undefined,
): MetaSignedRequestPayload | null {
  if (!signedRequest || typeof signedRequest !== "string") return null;
  if (!appSecret) return null;

  const dotIndex = signedRequest.indexOf(".");
  if (dotIndex <= 0 || dotIndex === signedRequest.length - 1) return null;
  const encodedSignature = signedRequest.slice(0, dotIndex);
  const encodedPayload = signedRequest.slice(dotIndex + 1);
  // A second "." would mean a malformed token (we expect exactly two parts).
  if (encodedPayload.includes(".")) return null;

  const providedSignature = base64UrlDecode(encodedSignature);
  const payloadBuf = base64UrlDecode(encodedPayload);
  if (!providedSignature || !payloadBuf) return null;

  // Signature = raw HMAC-SHA256 over the *encoded* payload string.
  const expectedSignature = createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest();

  if (providedSignature.length !== expectedSignature.length) return null;
  try {
    if (!timingSafeEqual(providedSignature, expectedSignature)) return null;
  } catch {
    // timingSafeEqual throws on length mismatch — already guarded above,
    // but never let a crypto edge case escape the verifier.
    return null;
  }

  let payload: MetaSignedRequestPayload;
  try {
    payload = JSON.parse(payloadBuf.toString("utf-8"));
  } catch {
    // Signature verified but payload isn't JSON — treat as invalid.
    return null;
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  // Meta always sends HMAC-SHA256; reject anything else so a future
  // algorithm change fails closed instead of being silently accepted.
  const algorithm = String(payload.algorithm || "").toUpperCase();
  if (algorithm !== "HMAC-SHA256") return null;

  return payload;
}

/**
 * Helper for tests/fixtures: build a signed_request the same way Meta does.
 * Exported so the deliberate-failure fixture can construct both a valid
 * token and a tampered one without duplicating the encoding rules.
 */
export function buildSignedRequest(
  payload: MetaSignedRequestPayload,
  appSecret: string,
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const signature = createHmac("sha256", appSecret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}
