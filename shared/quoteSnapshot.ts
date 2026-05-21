/**
 * Quote Snapshot — slug + token helpers (Wave R3).
 *
 * Shared between server (route generates the slug at /api/q/create) and
 * any client-side preview / link-building that needs the same format.
 *
 * snapshot_slug = 8-char base36 string (e.g. "k3p1xq8z"). 36^8 ≈ 2.8e12
 * combinations — collision risk at WeFixTrades scale is effectively zero,
 * but the server still retries up to 5 times if it picks a value that
 * happens to collide with an existing row.
 *
 * owner_edit_token = 32-char hex string (16 random bytes). Returned ONLY
 * to the creating client and stored in their localStorage as
 * `owner_edit_token_<slug>`. The public /api/q/:slug GET response NEVER
 * includes this value — see quoteSnapshotRoutes.ts for the field-strip.
 */

const SLUG_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export const SNAPSHOT_SLUG_LENGTH = 8;
export const OWNER_EDIT_TOKEN_BYTES = 16;
/** Default snapshot lifetime (60 days). Configurable per-call if needed. */
export const SNAPSHOT_DEFAULT_TTL_DAYS = 60;
/** Localstorage key prefix the client uses to remember owner-edit tokens. */
export const OWNER_EDIT_TOKEN_KEY_PREFIX = "owner_edit_token_";

/**
 * Generate one fresh 8-char base36 snapshot slug. The caller is responsible
 * for checking the database for collisions and retrying.
 *
 * Works in both Node (uses crypto.randomBytes via globalThis.crypto) and
 * the browser (uses window.crypto.getRandomValues). Falls back to
 * Math.random only if neither is present, which should not happen in
 * production runtimes.
 */
export function generateSnapshotSlug(length: number = SNAPSHOT_SLUG_LENGTH): string {
  const bytes = new Uint8Array(length);
  const cryptoApi =
    (typeof globalThis !== "undefined" && (globalThis as any).crypto) || undefined;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

/**
 * Validate that a string is shaped like a snapshot slug. Used by the
 * server route to reject obvious garbage before hitting the DB and by
 * the client viewer to avoid issuing a GET for "/q/undefined" etc.
 */
export function isValidSnapshotSlug(s: unknown): s is string {
  return typeof s === "string"
    && s.length === SNAPSHOT_SLUG_LENGTH
    && /^[0-9a-z]+$/.test(s);
}

/** Compute the expiry timestamp `ttlDays` from now (default 60d). */
export function computeSnapshotExpiry(
  ttlDays: number = SNAPSHOT_DEFAULT_TTL_DAYS,
  now: Date = new Date(),
): Date {
  const out = new Date(now);
  out.setUTCDate(out.getUTCDate() + ttlDays);
  return out;
}

/**
 * Build the public-facing URL for a snapshot. The server returns this in
 * the create response; we centralise the path-shape here so we can change
 * it (e.g. shorten to /s/) in one place if needed.
 */
export function buildSnapshotPath(slug: string): string {
  return `/q/${slug}`;
}
