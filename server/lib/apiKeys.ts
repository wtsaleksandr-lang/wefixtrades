/**
 * API key generation, hashing, and lookup utilities (Wave AJ-2).
 *
 * Keys look like:
 *   wfx_live_<40 url-safe chars>   (production)
 *   wfx_test_<40 url-safe chars>   (non-production)
 *
 * Storage rules:
 *   - The PLAINTEXT key is shown to the user EXACTLY ONCE at creation
 *     (or rotation). It is never written to disk and never re-derivable.
 *   - We store the SHA-256 hex of the plaintext as `api_keys.hash`. All
 *     authentication lookups go through the hash (constant-time wrt the
 *     stored value because the hash space is uniform).
 *   - The first 12 chars (e.g. "wfx_live_ab") are persisted as `prefix`
 *     for human-friendly UI rendering. Showing the prefix in the UI does
 *     NOT leak the secret — there are >10^60 keys sharing each prefix.
 *
 * Why crypto.randomBytes + base64url(no-padding) instead of nanoid/cuid:
 *   - No new dependency. The project already uses crypto throughout.
 *   - 32 bytes of randomness encoded in url-safe alphanumerics is ~190
 *     bits of entropy, well above the ~128 bits typical for API keys.
 */

import crypto from "crypto";

const KEY_PREFIX =
  process.env.NODE_ENV === "production" ? "wfx_live_" : "wfx_test_";

/** First N chars stored as `prefix` for UI rendering. */
export const PREFIX_DISPLAY_LENGTH = 12;

export interface GeneratedApiKey {
  /** The plaintext key. Show ONCE, then drop. */
  full: string;
  /** First 12 chars — safe to persist + display. */
  prefix: string;
  /** SHA-256 hex of `full`. 64 chars. Persisted in api_keys.hash. */
  hash: string;
  /** "live" | "test" — derived from current NODE_ENV. */
  environment: "live" | "test";
}

/** Generate a fresh API key. Caller persists prefix + hash, returns full once. */
export function generateApiKey(): GeneratedApiKey {
  // 32 bytes → ~43 url-safe chars (base64url). Strip any leftover - or _
  // so the user-visible portion is purely [A-Za-z0-9]. After stripping we
  // re-pad with extra entropy if we somehow under-shot 40 chars.
  let random = crypto.randomBytes(32).toString("base64url").replace(/[-_]/g, "");
  while (random.length < 40) {
    random += crypto.randomBytes(8).toString("base64url").replace(/[-_]/g, "");
  }
  const body = random.slice(0, 40);
  const full = `${KEY_PREFIX}${body}`;
  const prefix = full.slice(0, PREFIX_DISPLAY_LENGTH);
  const hash = sha256Hex(full);
  const environment: "live" | "test" =
    process.env.NODE_ENV === "production" ? "live" : "test";
  return { full, prefix, hash, environment };
}

/** SHA-256 hex of an arbitrary string. Used for storing + comparing keys. */
export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Validate the OUTER shape of a candidate key string. Cheap reject for
 * obvious garbage before we hit the DB. Does NOT prove the key is real —
 * only the hash lookup does that.
 */
export function isPlausibleApiKey(value: string | undefined | null): value is string {
  if (!value) return false;
  if (!value.startsWith("wfx_live_") && !value.startsWith("wfx_test_")) {
    return false;
  }
  // wfx_live_ / wfx_test_ are 9 chars + 40-char body = 49 total. Allow a
  // little wiggle (38–60) for forward-compat.
  if (value.length < 38 || value.length > 60) return false;
  return /^wfx_(live|test)_[A-Za-z0-9]+$/.test(value);
}

/**
 * Generate a cuid-like compact id (24 chars, [a-z0-9]). Used for
 * api_keys.id and api_subscriptions.id PKs since we declared them text.
 * Deterministically sortable by creation time (prefixed with base36 ts).
 */
export function generateCuid(): string {
  const ts = Date.now().toString(36); // ~8 chars
  const rand = crypto.randomBytes(8).toString("hex"); // 16 chars
  return `c${ts}${rand}`.slice(0, 24);
}
