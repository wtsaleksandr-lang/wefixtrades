/**
 * PRICING-MODELS U1 — business-origin geocoding for `address_distance` fields.
 *
 * Two consumers:
 *   1. calculatorRoutes.ts (POST + PATCH save paths) — `applyOriginGeocodeOnSave`
 *      geocodes `calculator_settings.advanced.origin.address` ONCE when the
 *      address changed (or coords are missing) and stores lat/lng back beside
 *      the address. Mirrors the serviceAreaMapRoutes.ts geocode pattern.
 *   2. quoteWidgetDistanceRoutes.ts — lazy fallback when a stored origin has
 *      an address but no coords (e.g. the save-time geocode failed). Uses the
 *      same memoized `geocodeAddress`.
 *
 * SECURITY: the API key is resolved here and NEVER logged, returned, or
 * embedded in error messages. Only variant *names* may be logged.
 */
import { createLogger } from "../lib/logger";

const log = createLogger("OriginGeocode");

const GEOCODE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

/**
 * Resolve the Maps key for distance/geocode calls.
 *
 * Prefers the dedicated `GOOGLE_MAPS_DISTANCE_KEY` (provisioned in Doppler
 * across all configs for the distance feature, so its spend is separable),
 * then falls back to the same variant chain serviceAreaMapRoutes.ts accepts
 * (GOOGLE_MAPS_API_KEY → GOOGLE_API_KEY → VITE_GOOGLE_MAPS_API_KEY).
 * Trims whitespace (Doppler→Replit shells have inserted trailing newlines);
 * returns null on empty so callers get a truthful "configured?" boolean.
 * NEVER logs the value.
 */
export function getDistanceApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [
    env.GOOGLE_MAPS_DISTANCE_KEY,
    env.GOOGLE_MAPS_API_KEY,
    env.GOOGLE_API_KEY,
    env.VITE_GOOGLE_MAPS_API_KEY,
  ];
  for (const raw of candidates) {
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

export interface GeocodeDeps {
  fetchFn?: typeof fetch;
  key?: string | null;
}

/* ── Geocode memo ──────────────────────────────────────────────────────────
 * Origin addresses are few (one per calculator) and effectively immutable
 * between saves, so a tiny in-memory memo avoids re-billing the Geocoding
 * API on every lazy-resolve. Same Redis migration path as rateLimiter.ts:
 * swap the Map for a Redis GET/SET-EX keyed on the normalized address.
 */
const GEOCODE_MEMO_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days
const GEOCODE_MEMO_MAX = 500;
const geocodeMemo = new Map<string, { value: { lat: number; lng: number }; expiresAt: number }>();

/** Test hook — clears the memo so cases don't bleed into each other. */
export function __clearGeocodeMemoForTests(): void {
  geocodeMemo.clear();
}

/**
 * Geocode a free-text address → { lat, lng } or null (mirrors
 * serviceAreaMapRoutes.ts:124-152 — honest logs, no throw, no key in logs).
 */
export async function geocodeAddress(
  fullAddress: string,
  deps: GeocodeDeps = {},
): Promise<{ lat: number; lng: number } | null> {
  const key = deps.key !== undefined ? deps.key : getDistanceApiKey();
  if (!key) {
    log.warn("geocode skipped — no Maps API key configured (GOOGLE_MAPS_DISTANCE_KEY / variants)");
    return null;
  }
  const memoKey = fullAddress.trim().toLowerCase().replace(/\s+/g, " ");
  const memoHit = geocodeMemo.get(memoKey);
  if (memoHit && Date.now() <= memoHit.expiresAt) return memoHit.value;

  const fetchFn = deps.fetchFn ?? fetch;
  const url = `${GEOCODE_ENDPOINT}?address=${encodeURIComponent(fullAddress)}&key=${encodeURIComponent(key)}`;
  try {
    const resp = await fetchFn(url);
    if (!resp.ok) {
      log.warn("geocode HTTP error", { status: resp.status });
      return null;
    }
    const body = (await resp.json()) as {
      status: string;
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
    };
    if (body.status !== "OK" || !body.results?.length) {
      log.info("geocode no result", { status: body.status });
      return null;
    }
    const loc = body.results[0].geometry?.location;
    if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return null;
    if (geocodeMemo.size >= GEOCODE_MEMO_MAX) {
      const oldest = geocodeMemo.keys().next().value;
      if (oldest !== undefined) geocodeMemo.delete(oldest);
    }
    geocodeMemo.set(memoKey, { value: { lat: loc.lat, lng: loc.lng }, expiresAt: Date.now() + GEOCODE_MEMO_TTL_MS });
    return { lat: loc.lat, lng: loc.lng };
  } catch (err: any) {
    log.error("geocode threw", { error: err?.message });
    return null;
  }
}

/**
 * Save-path hook — geocode `advanced.origin.address` ONCE when it changed.
 *
 * Mutates `nextSettings.advanced.origin` in place (the object the save path
 * is about to persist):
 *   - address changed vs `prevSettings` → drop any carried lat/lng (the deep
 *     merge would otherwise keep STALE coords belonging to the old address,
 *     and the client is never trusted as the coord source on a change) and
 *     geocode fresh. Success → store lat/lng; failure → persist the address
 *     WITHOUT coords (the distance endpoint lazily geocodes as a fallback).
 *   - address unchanged + coords present → no-op (no re-billing on every save).
 *   - address unchanged + coords missing → backfill geocode.
 *   - address cleared/blank → strip stale coords.
 *
 * NEVER throws and NEVER blocks the save — geocoding is best-effort and all
 * failures are logged honestly (no-silent-catch compliant).
 */
export async function applyOriginGeocodeOnSave(
  prevSettings: Record<string, any> | null | undefined,
  nextSettings: Record<string, any> | null | undefined,
  deps: GeocodeDeps = {},
): Promise<void> {
  try {
    const origin = nextSettings?.advanced?.origin as
      | { address?: unknown; lat?: unknown; lng?: unknown }
      | undefined;
    if (!origin || typeof origin !== "object") return;

    const address = typeof origin.address === "string" ? origin.address.trim() : "";
    if (!address) {
      // Address cleared — stale coords for "no address" would be a lie.
      delete origin.lat;
      delete origin.lng;
      return;
    }

    const prevAddress =
      typeof prevSettings?.advanced?.origin?.address === "string"
        ? (prevSettings.advanced.origin.address as string).trim()
        : "";
    const addressChanged = address !== prevAddress;
    const hasCoords = typeof origin.lat === "number" && typeof origin.lng === "number";

    if (!addressChanged && hasCoords) return; // settled — nothing to do

    if (addressChanged) {
      // Coords carried through the deep merge (or supplied by the client)
      // belong to the OLD address — drop before re-resolving.
      delete origin.lat;
      delete origin.lng;
    }

    const geo = await geocodeAddress(address, deps);
    if (geo) {
      origin.lat = geo.lat;
      origin.lng = geo.lng;
    } else {
      log.warn("origin geocode unresolved — saving address without coords (endpoint will lazy-resolve)", {
        addressLength: address.length,
      });
    }
  } catch (err: any) {
    // Geocoding must never block a calculator save.
    log.error("applyOriginGeocodeOnSave threw", { error: err?.message });
  }
}
