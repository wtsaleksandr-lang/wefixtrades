/**
 * Signed-URL helper for assistant image attachments (mobile Ask tab).
 *
 * Replit Object Storage doesn't expose first-class signed URLs, so we
 * fetch the bytes through an authenticated server route. To prevent a
 * leaked URL from being replayed indefinitely we attach an HMAC-SHA256
 * signature over (userId, assetPath, expiry) so that:
 *
 *   - URLs expire after `DEFAULT_TTL_SEC` (15 minutes)
 *   - Tampering with the path or expiry invalidates the signature
 *   - A user can only generate signatures for their own assetPath
 *     (the upload + thread-load code paths both enforce this before
 *     calling buildSignedImageUrl)
 *
 * The signing key is derived from SESSION_SECRET via HMAC with a domain
 * separation label so it can't be confused with cookie/JWT signers.
 * Asymmetric with the regular auth layer: even an attacker who steals
 * a signed image URL still can't browse arbitrary assets.
 *
 * URL shape:
 *   /api/mobile/ai/image/<assetPath>?exp=<unixSecs>&sig=<hex>
 */

import crypto from "crypto";

const DEFAULT_TTL_SEC = 15 * 60; // 15 min
const HMAC_LABEL = "assistant-image-v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET must be set to sign assistant-image URLs");
  }
  cachedKey = crypto.createHmac("sha256", sessionSecret).update(HMAC_LABEL).digest();
  return cachedKey;
}

function sign(userId: number, assetPath: string, expiry: number): string {
  return crypto
    .createHmac("sha256", getKey())
    .update(`${userId}|${assetPath}|${expiry}`)
    .digest("hex");
}

/**
 * Build a signed, time-limited URL the mobile client can fetch directly.
 * The caller MUST have already verified that `assetPath` belongs to `userId`.
 */
export function buildSignedImageUrl(args: {
  userId: number;
  assetPath: string;
  baseUrl?: string;
  ttlSeconds?: number;
}): string {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SEC;
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  const sig = sign(args.userId, args.assetPath, expiry);
  const base = args.baseUrl ?? "";
  return `${base}/api/mobile/ai/image/${args.assetPath}?exp=${expiry}&sig=${sig}`;
}

/**
 * Verify a signature from a request. Returns true only if:
 *   - sig is a hex string matching the expected HMAC
 *   - expiry has not passed
 *
 * Constant-time comparison via timingSafeEqual to avoid leaking byte-by-byte.
 */
export function verifySignedImageUrl(args: {
  userId: number;
  assetPath: string;
  expiry: number;
  signature: string;
}): boolean {
  if (!Number.isFinite(args.expiry) || args.expiry <= Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = sign(args.userId, args.assetPath, args.expiry);
  if (expected.length !== args.signature.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(args.signature, "hex"),
    );
  } catch {
    return false;
  }
}

export function getDefaultBaseUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.APP_PUBLIC_URL ||
    "https://app.wefixtrades.com"
  );
}
