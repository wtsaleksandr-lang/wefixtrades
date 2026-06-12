/**
 * PRICING-MODELS U1 — public distance-resolve endpoint for `address_distance`
 * widget fields.
 *
 *   POST /api/quote-widget/distance
 *   body: { calculator_id, field_id, address, lat?, lng? }
 *
 * The customer types (or Places-picks) their address in the embedded widget;
 * the server resolves the DRIVING distance from the business's configured
 * anchor (`calculator_settings.advanced.origin` — geocoded once on save by
 * applyOriginGeocodeOnSave; the client NEVER supplies the origin) via the
 * Google Distance Matrix API.
 *
 * Response contract (the widget treats ANY `ok:false` as "fall back to the
 * manual distance input" — soft-fail by design, never a 500):
 *   200 { ok:true, distanceMiles, distanceKm, durationMin, formattedAddress, cached }
 *   200 { ok:false, reason:'no_origin' }    — owner hasn't configured an origin
 *   200 { ok:false, reason:'quota' }        — IP/min cap, per-calculator/day cap,
 *                                             or upstream OVER_QUERY_LIMIT
 *   200 { ok:false, reason:'unavailable' }  — no API key / upstream denied or
 *                                             errored / origin not geocodable
 *   200 { ok:false, reason:'unresolved' }   — destination address didn't resolve
 *                                             or no driving route exists
 *   400 { ok:false, reason:'bad_request' }  — body failed validation
 *   404 { ok:false, reason:'not_found' }    — unknown calculator, or it has no
 *                                             address_distance field with this
 *                                             field_id (cheap authz)
 *
 * SECURITY: the Maps key is resolved server-side (GOOGLE_MAPS_DISTANCE_KEY →
 * getMapsApiKey variants) and NEVER appears in logs, responses, or errors.
 *
 * The pure core (`processDistanceRequest`) takes every dependency injected so
 * the regression gate (quoteWidgetDistanceRoutes.test.ts, CI:
 * check:quote-widget-distance) drives it DB-free with a mocked fetch.
 */
import type { Express, Request } from "express";
import { z } from "zod";
import { createHash } from "crypto";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";
import { getDistanceApiKey, geocodeAddress } from "../services/originGeocode";
import {
  distanceResolvePerMinLimiter,
  distanceResolvePerCalcPerDayLimiter,
} from "../services/rateLimiter";

const log = createLogger("QuoteWidgetDistance");

const DISTANCE_MATRIX_ENDPOINT = "https://maps.googleapis.com/maps/api/distancematrix/json";
const METERS_PER_MILE = 1609.344;

/* ─── Request body ─── */

export const distanceRequestBody = z.object({
  calculator_id: z.number().int().positive(),
  field_id: z.string().min(1).max(120),
  // ~200-char cap: real postal addresses fit comfortably; anything longer is
  // garbage or abuse and would bloat cache keys + upstream URLs.
  address: z.string().trim().min(1).max(200),
  // Optional precise coords from a Places autocomplete selection — used as
  // the DESTINATION only (the origin is always read server-side).
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
});

/* ─── Distance cache ──────────────────────────────────────────────────────
 * In-memory Map keyed sha256(originLatLng|normalizedDestination) with a
 * 30-day TTL and a ~5k-entry LRU-ish cap (Map insertion order = recency;
 * hits re-insert, eviction pops the oldest key). Uncached Distance Matrix
 * elements cost ~½¢ each, so a warm cache is the primary spend control.
 *
 * Redis migration path (same shape as rateLimiter.ts):
 *   1. Install ioredis: npm i ioredis
 *   2. Replace this Map with GET/SET-EX on key `qq:dist:<sha256>` (the value
 *      is already a small JSON-serializable record).
 *   3. Drop the maxEntries/LRU logic — Redis TTL + maxmemory-policy
 *      allkeys-lru handle expiry/eviction.
 *   4. The DistanceCache interface (get/set) stays the same; only the
 *      backing store changes.
 */
export interface CachedDistance {
  distanceMiles: number;
  distanceKm: number;
  durationMin: number;
  formattedAddress: string;
}

const DISTANCE_CACHE_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days
const DISTANCE_CACHE_MAX_ENTRIES = 5000;

export class DistanceCache {
  private map = new Map<string, { value: CachedDistance; expiresAt: number }>();

  constructor(
    private maxEntries = DISTANCE_CACHE_MAX_ENTRIES,
    private ttlMs = DISTANCE_CACHE_TTL_MS,
  ) {}

  get(key: string, now = Date.now()): CachedDistance | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (now > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    // LRU-ish: re-insert so this key moves to the back of the eviction queue.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: CachedDistance, now = Date.now()): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: now + this.ttlMs });
  }

  get size(): number {
    return this.map.size;
  }
}

/** Normalize a free-text destination for cache keying — case/whitespace
 *  variants of the same address must hit the same entry. */
export function normalizeDestination(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,]+$/, "");
}

/** sha256(originLatLng|normalizedDestination). Coords round to 5 decimals
 *  (~1 m) so float noise can't fragment the cache. */
export function distanceCacheKey(
  origin: { lat: number; lng: number },
  dest: { address: string; lat?: number; lng?: number },
): string {
  const destKey =
    typeof dest.lat === "number" && typeof dest.lng === "number"
      ? `${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}`
      : normalizeDestination(dest.address);
  return createHash("sha256")
    .update(`${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${destKey}`)
    .digest("hex");
}

/* ─── Distance Matrix response mapping ─── */

export interface DistanceMatrixJson {
  status: string;
  destination_addresses?: string[];
  rows?: Array<{
    elements?: Array<{
      status: string;
      distance?: { value: number };
      duration?: { value: number };
    }>;
  }>;
}

export type MappedDistance =
  | ({ kind: "ok" } & CachedDistance)
  | { kind: "quota" }
  | { kind: "unresolved" }
  | { kind: "unavailable" };

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Map a raw Distance Matrix JSON body to the endpoint's result shape.
 * Top-level OVER_QUERY_LIMIT/OVER_DAILY_LIMIT → quota; element
 * NOT_FOUND/ZERO_RESULTS (address didn't resolve / no driving route) →
 * unresolved; anything else non-OK → unavailable. distance.value is always
 * meters and duration.value always seconds regardless of the units param.
 */
export function mapDistanceMatrixResponse(body: DistanceMatrixJson): MappedDistance {
  if (body.status !== "OK") {
    if (body.status === "OVER_QUERY_LIMIT" || body.status === "OVER_DAILY_LIMIT") {
      log.warn("distance matrix over quota", { status: body.status });
      return { kind: "quota" };
    }
    // REQUEST_DENIED / INVALID_REQUEST / UNKNOWN_ERROR — config or upstream
    // trouble, not the customer's address. Status only; never the key.
    log.warn("distance matrix non-OK status", { status: body.status });
    return { kind: "unavailable" };
  }
  const element = body.rows?.[0]?.elements?.[0];
  if (!element) {
    log.warn("distance matrix OK but empty rows/elements");
    return { kind: "unavailable" };
  }
  if (element.status !== "OK") {
    if (
      element.status === "NOT_FOUND" ||
      element.status === "ZERO_RESULTS" ||
      element.status === "MAX_ROUTE_LENGTH_EXCEEDED"
    ) {
      return { kind: "unresolved" };
    }
    log.warn("distance matrix element non-OK status", { status: element.status });
    return { kind: "unavailable" };
  }
  const meters = element.distance?.value;
  const seconds = element.duration?.value;
  if (typeof meters !== "number" || typeof seconds !== "number") {
    log.warn("distance matrix element missing distance/duration values");
    return { kind: "unavailable" };
  }
  return {
    kind: "ok",
    distanceMiles: round1(meters / METERS_PER_MILE),
    distanceKm: round1(meters / 1000),
    durationMin: Math.round(seconds / 60),
    formattedAddress: body.destination_addresses?.[0] ?? "",
  };
}

/* ─── Pure core (dependency-injected for the DB-free regression gate) ─── */

export type DistanceFailReason =
  | "bad_request"
  | "not_found"
  | "no_origin"
  | "quota"
  | "unavailable"
  | "unresolved";

export type DistanceResponseBody =
  | ({ ok: true; cached: boolean } & CachedDistance)
  | { ok: false; reason: DistanceFailReason };

export interface DistanceRequestInput {
  calculatorId: number;
  fieldId: string;
  address: string;
  lat?: number;
  lng?: number;
  ip: string;
}

export interface DistanceDeps {
  loadCalculator: (
    id: number,
  ) => Promise<{ id: number; calculator_settings: unknown } | undefined>;
  fetchFn: typeof fetch;
  /** Resolve the Maps key. null → soft-fail 'unavailable'. */
  getKey: () => string | null;
  /** Lazy origin geocode for stored origins missing coords. */
  geocodeOrigin: (address: string) => Promise<{ lat: number; lng: number } | null>;
  perMinLimiter: { check(key: string): Promise<boolean> };
  perDayLimiter: { check(key: string): Promise<boolean> };
  cache: DistanceCache;
}

export async function processDistanceRequest(
  deps: DistanceDeps,
  input: DistanceRequestInput,
): Promise<{ status: number; body: DistanceResponseBody }> {
  // 1. Per-IP burst cap — cheapest check first, also covers cache-hit floods.
  if (!(await deps.perMinLimiter.check(`qq-distance:ip:${input.ip}`))) {
    return { status: 200, body: { ok: false, reason: "quota" } };
  }

  // 2. Load the calculator + cheap authz: it must actually HAVE an
  //    address_distance field with this field_id, so random calculator ids
  //    can't be used to proxy distance lookups through our key.
  const calculator = await deps.loadCalculator(input.calculatorId);
  if (!calculator) return { status: 404, body: { ok: false, reason: "not_found" } };

  const advanced = (calculator.calculator_settings as any)?.advanced;
  const fields: Array<{ id?: unknown; type?: unknown }> = Array.isArray(advanced?.fields)
    ? advanced.fields
    : [];
  const fieldOk = fields.some((f) => f?.id === input.fieldId && f?.type === "address_distance");
  if (!fieldOk) return { status: 404, body: { ok: false, reason: "not_found" } };

  // 3. Origin — read server-side ONLY (never from the request body).
  const origin = advanced?.origin as
    | { address?: unknown; lat?: unknown; lng?: unknown }
    | undefined;
  const originAddress = typeof origin?.address === "string" ? origin.address.trim() : "";
  if (!originAddress) return { status: 200, body: { ok: false, reason: "no_origin" } };

  let originCoords: { lat: number; lng: number };
  if (typeof origin?.lat === "number" && typeof origin?.lng === "number") {
    originCoords = { lat: origin.lat, lng: origin.lng };
  } else {
    // Save-time geocode failed/never ran — lazy fallback (memoized upstream).
    const geo = await deps.geocodeOrigin(originAddress);
    if (!geo) return { status: 200, body: { ok: false, reason: "unavailable" } };
    originCoords = geo;
  }

  // 4. Cache — a warm pair costs nothing upstream, so it neither needs the
  //    key nor counts against the per-calculator daily budget.
  const cacheKey = distanceCacheKey(originCoords, {
    address: input.address,
    lat: input.lat,
    lng: input.lng,
  });
  const cached = deps.cache.get(cacheKey);
  if (cached) return { status: 200, body: { ok: true, cached: true, ...cached } };

  // 5. Per-calculator daily budget — bounds Maps spend per widget owner.
  if (!(await deps.perDayLimiter.check(`qq-distance:calc:${input.calculatorId}`))) {
    return { status: 200, body: { ok: false, reason: "quota" } };
  }

  // 6. Key — missing config is a soft-fail, never a 500.
  const key = deps.getKey();
  if (!key) {
    log.warn("distance resolve skipped — no Maps API key configured", {
      calculator_id: input.calculatorId,
    });
    return { status: 200, body: { ok: false, reason: "unavailable" } };
  }

  // 7. Distance Matrix (driving). The destination is the Places coords when
  //    provided (most precise), else the raw address — Distance Matrix
  //    resolves address strings itself, so no separate destination geocode
  //    call is needed (halves per-quote spend vs geocode-then-matrix).
  const destinationParam =
    typeof input.lat === "number" && typeof input.lng === "number"
      ? `${input.lat},${input.lng}`
      : input.address;
  const url =
    `${DISTANCE_MATRIX_ENDPOINT}?origins=${encodeURIComponent(`${originCoords.lat},${originCoords.lng}`)}` +
    `&destinations=${encodeURIComponent(destinationParam)}` +
    `&mode=driving&units=imperial&key=${encodeURIComponent(key)}`;

  let mapped: MappedDistance;
  try {
    const resp = await deps.fetchFn(url);
    if (!resp.ok) {
      log.warn("distance matrix HTTP error", { status: resp.status });
      return { status: 200, body: { ok: false, reason: "unavailable" } };
    }
    mapped = mapDistanceMatrixResponse((await resp.json()) as DistanceMatrixJson);
  } catch (err: any) {
    log.error("distance matrix fetch threw", { error: err?.message });
    return { status: 200, body: { ok: false, reason: "unavailable" } };
  }

  if (mapped.kind !== "ok") {
    const reason: DistanceFailReason =
      mapped.kind === "quota" ? "quota" : mapped.kind === "unresolved" ? "unresolved" : "unavailable";
    return { status: 200, body: { ok: false, reason } };
  }

  const { kind: _kind, ...value } = mapped;
  deps.cache.set(cacheKey, value);
  return { status: 200, body: { ok: true, cached: false, ...value } };
}

/* ─── Express wiring ─── */

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown"
  );
}

/** Module-level singletons shared by every request (single-server, same
 *  lifetime as the rate-limiter store). */
const distanceCache = new DistanceCache();

export function registerQuoteWidgetDistanceRoutes(app: Express): void {
  app.post("/api/quote-widget/distance", async (req, res) => {
    try {
      const parsed = distanceRequestBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          reason: "bad_request",
          details: parsed.error.flatten(),
        });
      }
      const { status, body } = await processDistanceRequest(
        {
          loadCalculator: (id) => storage.getCalculatorById(id),
          fetchFn: fetch,
          getKey: getDistanceApiKey,
          geocodeOrigin: (address) => geocodeAddress(address),
          perMinLimiter: distanceResolvePerMinLimiter,
          perDayLimiter: distanceResolvePerCalcPerDayLimiter,
          cache: distanceCache,
        },
        {
          calculatorId: parsed.data.calculator_id,
          fieldId: parsed.data.field_id,
          address: parsed.data.address,
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          ip: getClientIp(req),
        },
      );
      return res.status(status).json(body);
    } catch (error: any) {
      // Unexpected throw: log honestly server-side, but the widget contract
      // stays soft-fail (manual-entry fallback) — never a 500 page for the
      // embedded customer.
      log.error("distance endpoint threw", { error: error?.message });
      return res.status(200).json({ ok: false, reason: "unavailable" });
    }
  });
}
