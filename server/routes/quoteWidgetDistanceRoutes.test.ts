/**
 * PRICING-MODELS U1 — distance endpoint regression gate.
 *
 * Drives the PURE dependency-injected core of
 * server/routes/quoteWidgetDistanceRoutes.ts (no express wiring, no DB,
 * mocked fetch — every dependency of processDistanceRequest is injected):
 *
 *   1. Success path maps the Distance Matrix response correctly —
 *      meters→miles/km, seconds→minutes, formattedAddress from
 *      destination_addresses[0]; the upstream URL carries the server-side
 *      origin + mode=driving and the response body never echoes the key.
 *   2. Cache — an identical origin|destination pair makes exactly ONE
 *      upstream call (second request returns cached:true); cache hits do
 *      NOT consume the per-calculator daily budget; LRU-ish eviction holds
 *      the entry cap.
 *   3. No API key → soft-fail {ok:false, reason:'unavailable'}, zero
 *      upstream calls, never a throw/500.
 *   4. Per-IP over-limit and per-calculator daily over-limit → quota
 *      soft-fail (widget falls back to manual entry).
 *   5. Authz + config soft-fails — unknown calculator / wrong field_id →
 *      404 not_found; missing origin → no_origin; ZERO_RESULTS →
 *      unresolved; OVER_QUERY_LIMIT → quota.
 *   6. Origin-geocode-on-save hook (applyOriginGeocodeOnSave) — geocodes
 *      ONCE when the address changed, drops stale coords on failure, no-ops
 *      when settled, never throws on a fetch explosion.
 *   7. DELIBERATE-FAILURE FIXTURE — a regressed mapper that returns km in
 *      the miles slot fails the success-path assertion red, proving this
 *      gate catches that regression class rather than merely running.
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Runnable standalone:
 *
 *   npx tsx server/routes/quoteWidgetDistanceRoutes.test.ts
 *
 * Wired into CI as `npm run check:quote-widget-distance`.
 */
import assert from "node:assert/strict";

/* Module-load prerequisite: server/db.ts throws without a DATABASE_URL.
 * Never used for real IO here — every dep is injected. */
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

const {
  processDistanceRequest,
  mapDistanceMatrixResponse,
  distanceRequestBody,
  distanceCacheKey,
  normalizeDestination,
  DistanceCache,
} = await import("./quoteWidgetDistanceRoutes");
const { RateLimiter, MemoryRateLimitStore } = await import("../services/rateLimiter");
const { applyOriginGeocodeOnSave, __clearGeocodeMemoForTests } = await import(
  "../services/originGeocode"
);

type DistanceDeps = import("./quoteWidgetDistanceRoutes").DistanceDeps;
type DistanceRequestInput = import("./quoteWidgetDistanceRoutes").DistanceRequestInput;
type DistanceMatrixJson = import("./quoteWidgetDistanceRoutes").DistanceMatrixJson;

let passed = 0;
let failed = 0;
async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

/* ═══ Fixtures ════════════════════════════════════════════════════════ */

const TEST_KEY = "test-maps-key-never-logged";

function dmOk(
  meters = 19956, // 12.4 mi
  seconds = 1530, // 25.5 min → rounds to 26
  formatted = "123 Main St, Springfield, IL 62701, USA",
): DistanceMatrixJson {
  return {
    status: "OK",
    destination_addresses: [formatted],
    rows: [
      {
        elements: [
          { status: "OK", distance: { value: meters }, duration: { value: seconds } },
        ],
      },
    ],
  };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const CALC_ID = 7;
const FIELD_ID = "fld-distance-1";

// `null` → calculator WITHOUT a configured origin (an explicit `undefined`
// argument would trigger the default parameter, not the absent-origin case).
function makeCalculator(origin: Record<string, unknown> | null = {
  address: "1 Depot Rd, Springfield IL",
  lat: 40.0,
  lng: -75.0,
}) {
  return {
    id: CALC_ID,
    calculator_settings: {
      advanced: {
        origin,
        fields: [
          { id: "fld-name", type: "text" },
          { id: FIELD_ID, type: "address_distance" },
        ],
      },
    },
  };
}

function makeDeps(overrides: Partial<DistanceDeps> = {}): {
  deps: DistanceDeps;
  fetchCalls: string[];
} {
  const fetchCalls: string[] = [];
  const deps: DistanceDeps = {
    loadCalculator: async (id) => (id === CALC_ID ? makeCalculator() : undefined),
    fetchFn: (async (url: any) => {
      fetchCalls.push(String(url));
      return jsonResponse(dmOk());
    }) as typeof fetch,
    getKey: () => TEST_KEY,
    geocodeOrigin: async () => null,
    perMinLimiter: { check: async () => true },
    perDayLimiter: { check: async () => true },
    cache: new DistanceCache(),
    ...overrides,
  };
  return { deps, fetchCalls };
}

function makeInput(overrides: Partial<DistanceRequestInput> = {}): DistanceRequestInput {
  return {
    calculatorId: CALC_ID,
    fieldId: FIELD_ID,
    address: "123 Main St, Springfield",
    ip: "203.0.113.9",
    ...overrides,
  };
}

/* ═══ 1. Success-path mapping ═════════════════════════════════════════ */

await check("success path maps the Distance Matrix response correctly", async () => {
  const { deps, fetchCalls } = makeDeps();
  const { status, body } = await processDistanceRequest(deps, makeInput());
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  if (!body.ok) throw new Error("unreachable");
  assert.equal(body.distanceMiles, 12.4); // 19956 m / 1609.344 = 12.399… → 12.4
  assert.equal(body.distanceKm, 20.0); // 19956 m / 1000 = 19.956 → 20.0
  assert.equal(body.durationMin, 26); // 1530 s / 60 = 25.5 → 26
  assert.equal(body.formattedAddress, "123 Main St, Springfield, IL 62701, USA");
  assert.equal(body.cached, false);
  assert.equal(fetchCalls.length, 1);
  // The upstream call carries the SERVER-side origin + driving mode.
  assert.ok(fetchCalls[0].includes(encodeURIComponent("40,-75")), "origin coords in URL");
  assert.ok(fetchCalls[0].includes("mode=driving"), "driving mode in URL");
  // The key never leaks into the response body.
  assert.ok(!JSON.stringify(body).includes(TEST_KEY), "key must not appear in response");
});

await check("Places coords (lat/lng) are used as the destination when supplied", async () => {
  const { deps, fetchCalls } = makeDeps();
  const { body } = await processDistanceRequest(
    deps,
    makeInput({ lat: 41.12345, lng: -74.54321 }),
  );
  assert.equal(body.ok, true);
  assert.ok(
    fetchCalls[0].includes(encodeURIComponent("41.12345,-74.54321")),
    "destination uses the precise Places coords",
  );
});

/* ═══ 2. Cache ════════════════════════════════════════════════════════ */

await check("cache hit on an identical pair = exactly 1 upstream call", async () => {
  const { deps, fetchCalls } = makeDeps();
  const first = await processDistanceRequest(deps, makeInput());
  const second = await processDistanceRequest(deps, makeInput());
  assert.equal(first.body.ok, true);
  assert.equal(second.body.ok, true);
  if (!first.body.ok || !second.body.ok) throw new Error("unreachable");
  assert.equal(first.body.cached, false);
  assert.equal(second.body.cached, true);
  assert.equal(second.body.distanceMiles, first.body.distanceMiles);
  assert.equal(fetchCalls.length, 1, "second request must not hit upstream");
});

await check("case/whitespace variants of the same destination share a cache entry", async () => {
  assert.equal(
    normalizeDestination("  123 Main St,  Springfield. "),
    normalizeDestination("123 MAIN st, springfield"),
  );
  const origin = { lat: 40, lng: -75 };
  assert.equal(
    distanceCacheKey(origin, { address: " 123 Main St " }),
    distanceCacheKey(origin, { address: "123 main st" }),
  );
});

await check("cache hits do NOT consume the per-calculator daily budget", async () => {
  // Daily limiter with capacity 1: the first (uncached) call consumes it;
  // the repeat is served from cache BEFORE the limiter and still succeeds.
  const dayLimiter = new RateLimiter(new MemoryRateLimitStore(), 1, 60_000);
  const { deps, fetchCalls } = makeDeps({ perDayLimiter: dayLimiter });
  const first = await processDistanceRequest(deps, makeInput());
  const second = await processDistanceRequest(deps, makeInput());
  assert.equal(first.body.ok, true);
  assert.equal(second.body.ok, true);
  assert.equal(fetchCalls.length, 1);
});

await check("LRU-ish eviction holds the entry cap", () => {
  const cache = new DistanceCache(2);
  const v = { distanceMiles: 1, distanceKm: 1.6, durationMin: 2, formattedAddress: "x" };
  cache.set("a", v);
  cache.set("b", v);
  cache.get("a"); // refresh recency — "b" becomes the eviction candidate
  cache.set("c", v);
  assert.equal(cache.size, 2);
  assert.ok(cache.get("a"), "recently-used entry survives");
  assert.equal(cache.get("b"), null, "least-recently-used entry evicted");
});

await check("expired cache entries miss (TTL honored)", () => {
  const cache = new DistanceCache(10, 1000);
  const v = { distanceMiles: 1, distanceKm: 1.6, durationMin: 2, formattedAddress: "x" };
  const t0 = Date.now();
  cache.set("k", v, t0);
  assert.ok(cache.get("k", t0 + 999), "fresh entry hits");
  assert.equal(cache.get("k", t0 + 1001), null, "expired entry misses");
});

/* ═══ 3. No key → soft-fail, never a 500 ══════════════════════════════ */

await check("no API key → {ok:false, reason:'unavailable'}, zero upstream calls", async () => {
  const { deps, fetchCalls } = makeDeps({ getKey: () => null });
  const { status, body } = await processDistanceRequest(deps, makeInput());
  assert.equal(status, 200, "soft-fail is a 200, never a 500");
  assert.deepEqual(body, { ok: false, reason: "unavailable" });
  assert.equal(fetchCalls.length, 0);
});

/* ═══ 4. Rate limits → quota soft-fail ════════════════════════════════ */

await check("per-IP over-limit → {ok:false, reason:'quota'} soft-fail", async () => {
  const minLimiter = new RateLimiter(new MemoryRateLimitStore(), 2, 60_000);
  const { deps, fetchCalls } = makeDeps({ perMinLimiter: minLimiter });
  // Distinct addresses so the cache can't mask the limiter.
  const r1 = await processDistanceRequest(deps, makeInput({ address: "10 Oak Ave" }));
  const r2 = await processDistanceRequest(deps, makeInput({ address: "20 Elm Ave" }));
  const r3 = await processDistanceRequest(deps, makeInput({ address: "30 Pine Ave" }));
  assert.equal(r1.body.ok, true);
  assert.equal(r2.body.ok, true);
  assert.equal(r3.status, 200);
  assert.deepEqual(r3.body, { ok: false, reason: "quota" });
  assert.equal(fetchCalls.length, 2, "over-cap request never reaches upstream");
});

await check("per-IP limiter keys on the IP (another IP still passes)", async () => {
  const minLimiter = new RateLimiter(new MemoryRateLimitStore(), 1, 60_000);
  const { deps } = makeDeps({ perMinLimiter: minLimiter });
  const a1 = await processDistanceRequest(deps, makeInput({ ip: "198.51.100.1", address: "1 A St" }));
  const a2 = await processDistanceRequest(deps, makeInput({ ip: "198.51.100.1", address: "2 A St" }));
  const b1 = await processDistanceRequest(deps, makeInput({ ip: "198.51.100.2", address: "3 A St" }));
  assert.equal(a1.body.ok, true);
  assert.deepEqual(a2.body, { ok: false, reason: "quota" });
  assert.equal(b1.body.ok, true);
});

await check("per-calculator daily over-limit → quota soft-fail", async () => {
  const dayLimiter = new RateLimiter(new MemoryRateLimitStore(), 1, 60_000);
  const { deps, fetchCalls } = makeDeps({ perDayLimiter: dayLimiter });
  const r1 = await processDistanceRequest(deps, makeInput({ address: "10 Oak Ave" }));
  const r2 = await processDistanceRequest(deps, makeInput({ address: "20 Elm Ave" }));
  assert.equal(r1.body.ok, true);
  assert.deepEqual(r2.body, { ok: false, reason: "quota" });
  assert.equal(fetchCalls.length, 1);
});

/* ═══ 5. Authz + config + upstream soft-fails ═════════════════════════ */

await check("unknown calculator → 404 not_found", async () => {
  const { deps } = makeDeps();
  const { status, body } = await processDistanceRequest(deps, makeInput({ calculatorId: 999 }));
  assert.equal(status, 404);
  assert.deepEqual(body, { ok: false, reason: "not_found" });
});

await check("field_id that is not an address_distance field → 404 not_found", async () => {
  const { deps } = makeDeps();
  // fld-name exists but is type 'text' — must not be usable as a distance proxy.
  const { status, body } = await processDistanceRequest(deps, makeInput({ fieldId: "fld-name" }));
  assert.equal(status, 404);
  assert.deepEqual(body, { ok: false, reason: "not_found" });
});

await check("no origin configured → {ok:false, reason:'no_origin'}", async () => {
  const { deps, fetchCalls } = makeDeps({
    loadCalculator: async () => makeCalculator(null),
  });
  const { status, body } = await processDistanceRequest(deps, makeInput());
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: false, reason: "no_origin" });
  assert.equal(fetchCalls.length, 0);
});

await check("origin without coords lazy-geocodes; geocode failure → unavailable", async () => {
  let geocodeCalls = 0;
  const noCoordsCalc = makeCalculator({ address: "1 Depot Rd, Springfield IL" });
  const { deps } = makeDeps({
    loadCalculator: async () => noCoordsCalc,
    geocodeOrigin: async () => {
      geocodeCalls++;
      return null;
    },
  });
  const fail = await processDistanceRequest(deps, makeInput());
  assert.deepEqual(fail.body, { ok: false, reason: "unavailable" });
  assert.equal(geocodeCalls, 1);

  // Lazy geocode success → request proceeds with the resolved anchor.
  const { deps: deps2, fetchCalls } = makeDeps({
    loadCalculator: async () => noCoordsCalc,
    geocodeOrigin: async () => ({ lat: 40, lng: -75 }),
  });
  const okRes = await processDistanceRequest(deps2, makeInput());
  assert.equal(okRes.body.ok, true);
  assert.equal(fetchCalls.length, 1);
});

await check("destination ZERO_RESULTS → {ok:false, reason:'unresolved'}", async () => {
  const { deps } = makeDeps({
    fetchFn: (async () =>
      jsonResponse({
        status: "OK",
        destination_addresses: [""],
        rows: [{ elements: [{ status: "ZERO_RESULTS" }] }],
      })) as typeof fetch,
  });
  const { body } = await processDistanceRequest(deps, makeInput());
  assert.deepEqual(body, { ok: false, reason: "unresolved" });
});

await check("upstream OVER_QUERY_LIMIT → quota; REQUEST_DENIED → unavailable; fetch throw → unavailable", async () => {
  const over = makeDeps({
    fetchFn: (async () => jsonResponse({ status: "OVER_QUERY_LIMIT" })) as typeof fetch,
  });
  assert.deepEqual((await processDistanceRequest(over.deps, makeInput())).body, {
    ok: false,
    reason: "quota",
  });
  const denied = makeDeps({
    fetchFn: (async () => jsonResponse({ status: "REQUEST_DENIED" })) as typeof fetch,
  });
  assert.deepEqual((await processDistanceRequest(denied.deps, makeInput())).body, {
    ok: false,
    reason: "unavailable",
  });
  const boom = makeDeps({
    fetchFn: (async () => {
      throw new Error("network down");
    }) as typeof fetch,
  });
  const r = await processDistanceRequest(boom.deps, makeInput());
  assert.equal(r.status, 200, "fetch throw is a soft-fail, never a 500");
  assert.deepEqual(r.body, { ok: false, reason: "unavailable" });
});

await check("body schema: 200-char address cap + required fields", () => {
  assert.equal(
    distanceRequestBody.safeParse({
      calculator_id: 1,
      field_id: "f",
      address: "x".repeat(201),
    }).success,
    false,
    "201-char address rejected",
  );
  assert.equal(
    distanceRequestBody.safeParse({ calculator_id: 1, address: "1 Main St" }).success,
    false,
    "missing field_id rejected",
  );
  assert.equal(
    distanceRequestBody.safeParse({
      calculator_id: 1,
      field_id: "f",
      address: "1 Main St",
      lat: 40.1,
      lng: -75.2,
    }).success,
    true,
  );
});

/* ═══ 6. Origin-geocode-on-save hook ══════════════════════════════════ */

function geoOkFetch(lat: number, lng: number, calls: string[]) {
  return (async (url: any) => {
    calls.push(String(url));
    return jsonResponse({
      status: "OK",
      results: [{ geometry: { location: { lat, lng } } }],
    });
  }) as typeof fetch;
}

await check("on-save hook geocodes ONCE when the address changed (stale coords replaced)", async () => {
  __clearGeocodeMemoForTests();
  const calls: string[] = [];
  const prev = { advanced: { origin: { address: "Old Rd 1", lat: 1, lng: 2 } } };
  // Deep merge carried the OLD coords beside the NEW address — the trap.
  const next = { advanced: { origin: { address: "New Blvd 99", lat: 1, lng: 2 } } };
  await applyOriginGeocodeOnSave(prev, next, { key: TEST_KEY, fetchFn: geoOkFetch(40.5, -75.5, calls) });
  assert.equal(calls.length, 1, "exactly one geocode call");
  assert.equal(next.advanced.origin.lat, 40.5);
  assert.equal(next.advanced.origin.lng, -75.5);
  assert.ok(!JSON.stringify(next).includes(TEST_KEY), "key never written into settings");
});

await check("on-save hook no-ops when the address is unchanged and coords exist", async () => {
  __clearGeocodeMemoForTests();
  const calls: string[] = [];
  const settled = { advanced: { origin: { address: "Same Rd 1", lat: 40, lng: -75 } } };
  await applyOriginGeocodeOnSave(settled, structuredClone(settled), {
    key: TEST_KEY,
    fetchFn: geoOkFetch(0, 0, calls),
  });
  assert.equal(calls.length, 0, "no geocode call on a settled origin");
});

await check("on-save hook backfills coords when missing (address unchanged)", async () => {
  __clearGeocodeMemoForTests();
  const calls: string[] = [];
  const prev = { advanced: { origin: { address: "Same Rd 1" } } };
  const next: any = { advanced: { origin: { address: "Same Rd 1" } } };
  await applyOriginGeocodeOnSave(prev, next, { key: TEST_KEY, fetchFn: geoOkFetch(41, -76, calls) });
  assert.equal(calls.length, 1);
  assert.equal(next.advanced.origin.lat, 41);
  assert.equal(next.advanced.origin.lng, -76);
});

await check("on-save hook drops stale coords when the changed address fails to geocode", async () => {
  __clearGeocodeMemoForTests();
  const next: any = { advanced: { origin: { address: "Unmappable Pl 7", lat: 1, lng: 2 } } };
  await applyOriginGeocodeOnSave(
    { advanced: { origin: { address: "Old Rd 1", lat: 1, lng: 2 } } },
    next,
    { key: TEST_KEY, fetchFn: (async () => jsonResponse({ status: "ZERO_RESULTS", results: [] })) as typeof fetch },
  );
  assert.equal(next.advanced.origin.lat, undefined, "stale lat dropped");
  assert.equal(next.advanced.origin.lng, undefined, "stale lng dropped");
  assert.equal(next.advanced.origin.address, "Unmappable Pl 7", "address preserved");
});

await check("on-save hook strips coords when the address is cleared, and never throws", async () => {
  __clearGeocodeMemoForTests();
  const cleared: any = { advanced: { origin: { address: "  ", lat: 1, lng: 2 } } };
  await applyOriginGeocodeOnSave(null, cleared, { key: TEST_KEY });
  assert.equal(cleared.advanced.origin.lat, undefined);
  assert.equal(cleared.advanced.origin.lng, undefined);

  // Exploding fetch must never propagate into the save path.
  const next: any = { advanced: { origin: { address: "Boom St 1" } } };
  await applyOriginGeocodeOnSave(null, next, {
    key: TEST_KEY,
    fetchFn: (async () => {
      throw new Error("kaboom");
    }) as typeof fetch,
  });
  assert.equal(next.advanced.origin.address, "Boom St 1", "save object intact after geocode throw");
});

/* ═══ 7. DELIBERATE-FAILURE FIXTURE ═══════════════════════════════════
 * A regressed mapper that puts kilometers in the miles slot must turn the
 * success-path assertion red — proving the gate CATCHES this regression
 * class instead of merely running. (Repo deliberate-failure precedent:
 * contentflowVideo.routes.test.ts case 4.)
 */

await check("DELIBERATE-FAILURE fixture — km-in-miles regression turns the gate red", async () => {
  const regressedMapper = (body: DistanceMatrixJson) => {
    const mapped = mapDistanceMatrixResponse(body);
    if (mapped.kind !== "ok") return mapped;
    // The regression under test: miles slot fed from the km math.
    return { ...mapped, distanceMiles: mapped.distanceKm };
  };
  const mapped = regressedMapper(dmOk());
  if (mapped.kind !== "ok") throw new Error("fixture must map OK");
  let caught: unknown = null;
  try {
    assert.equal(mapped.distanceMiles, 12.4); // the REAL gate assertion
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, "gate assertion must fail red against the regressed mapper");
});

/* ═══ Verdict ═════════════════════════════════════════════════════════ */

console.log(`\nquote-widget-distance gate: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
