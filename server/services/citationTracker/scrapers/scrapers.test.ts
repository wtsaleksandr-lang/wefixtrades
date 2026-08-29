/**
 * Citation Tracker scrapers — smoke tests.
 *
 * Mirrors the pattern in server/lib/serpOrchestrator.test.ts: built-in
 * node:assert + a global fetch mock so no new test-framework dep is
 * added. tsconfig excludes `**\/*.test.ts` from `tsc`, so this file
 * only runs when invoked explicitly:
 *
 *   npx tsx server/services/citationTracker/scrapers/scrapers.test.ts
 *
 * Fixtures are hand-cut from the live page structure observed during the
 * 2026-08-29 directory probe.
 *
 * The emphasis throughout is the distinction the whole product rests on:
 * "we checked and it is not there" versus "we could not check". Most of
 * the cases below assert that a degraded response produces `error`, not a
 * clean `{ found: false }`.
 */
import assert from "node:assert/strict";

interface MockResponse {
  ok: boolean;
  status: number;
  url?: string;
  headers: { get: (k: string) => string | null };
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}

type Responder = (url: string, init?: RequestInit) => MockResponse | Promise<MockResponse>;
let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
let responder: Responder = () => mockHtml("", 500);

const realFetch = globalThis.fetch;
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (
  input: RequestInfo | URL,
  init?: RequestInit,
) => {
  const url = typeof input === "string" ? input : input.toString();
  fetchCalls.push({ url, init });
  return responder(url, init);
}) as typeof fetch;

/** A body large enough to clear the bot-wall size heuristic. */
function pad(body: string): string {
  return body + "<!--" + "x".repeat(21_000) + "-->";
}

function mockHtml(body: string, status = 200, finalUrl?: string): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: finalUrl,
    headers: { get: () => "text/html" },
    text: async () => body,
    json: async () => ({}),
  };
}

function mockJson(payload: unknown, status = 200): MockResponse {
  const text = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    url: undefined,
    headers: { get: () => "application/json" },
    text: async () => text,
    json: async () => payload,
  };
}

function resetState() {
  fetchCalls = [];
  responder = () => mockHtml("", 500);
}

const { scrapeBbb } = await import("./bbb");
const { scrapeBuildzoom } = await import("./buildzoom");
const { scrapeGoogleBusinessProfile, placeIdFromListingUrl } = await import("./googleBusinessProfile");
const { scrapeYellowPagesCa } = await import("./yellowPagesCa");
const { scrapeN49 } = await import("./n49");
const { scrapeOpenStreetMap } = await import("./openStreetMap");
const { detectBotWall } = await import("./httpClient");

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log("  ✓ " + name);
    passed++;
  } catch (err) {
    console.error("  ✗ " + name);
    console.error(err);
    failed++;
  }
}

/* ─────────────────────── fixtures ──────────────────────────────────── */

const BBB_HTML = pad(`
<html><body>
  <a href="/us/tx/dallas/profile/plumber/mr-rooter-plumbing-of-dallas-0875-21001938">Mr. Rooter Plumbing of Dallas</a>
  <a href="/us/tx/waco/profile/plumber/mr-rooter-plumbing-of-waco-0825-1000209441">Mr. Rooter Plumbing of Waco</a>
  <a href="/us/tx/austin/profile/plumber/some-other-plumber-12345">Some Other Plumber</a>
</body></html>`);

const BBB_CA_HTML = pad(`
<html><body>
  <a href="/ca/on/etobicoke/profile/plumber/mr-rooter-plumbing-of-etobicoke-on-0107-1301173">Mr. Rooter Plumbing of Etobicoke</a>
</body></html>`);

const BZ_SEARCH_HTML = pad(`
<html><body>
  <a href="/contractor/mr-rooter-seattle-wa">MR. Rooter</a>
  <a href="/contractor/some-roofing-co">Some Roofing Co</a>
</body></html>`);

const BZ_PROFILE_HTML = pad(`
<html><head>
<script type="application/ld+json">
[{"@context":"https://schema.org","@type":"Plumber","name":"MR. Rooter","telephone":"(425) 226-0603","address":{"@type":"PostalAddress","streetAddress":"123 Main St","addressLocality":"Seattle","addressRegion":"WA","postalCode":"98101"}}]
</script>
</head><body></body></html>`);

const YPCA_HTML = pad(`
<html><body>
  <a href="/bus/Ontario/Toronto/Mr-Rooter-Plumbing/7155831.html?what=x">Mr. Rooter Plumbing</a>
  <a href="/bus/Ontario/Toronto/Mr-Rooter-Plumbing/7155831.html#ypgReviewsHeader"></a>
  <a href="/bus/Ontario/Ottawa/Mr-Rooter-Plumbing-of-Ottawa/5892681.html">Mr. Rooter Ottawa</a>
  <a href="/bus/Ontario/Toronto/Drain-King-Plumbers/101902936.html">Drain King</a>
</body></html>`);

const N49_HTML = pad(`
<html><body>
  <a href="/biz/895891/mr-rooter-plumbing-of-toronto-on-on-toronto-27-glenmount-park-road/">Mr Rooter</a>
  <a href="/biz/924224/mr-rooter-plumbing-of-ottawa-on-ottawa-3900-russell-road/">Mr Rooter Ottawa</a>
</body></html>`);

/** The Imperva page Houzz actually served: 200 OK, small, no anchors. */
const CHALLENGE_HTML = `<!DOCTYPE html><html><head><title>Client Challenge</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'"></head>
<body><script>window._Incapsula_Resource="x";</script></body></html>`;

async function run() {
  console.log("Citation Tracker scrapers smoke tests:");

  /* ─────────────── bot-wall detection ──────────────────────────────── */

  await test("detectBotWall flags an Imperva challenge page", async () => {
    assert.equal(detectBotWall(CHALLENGE_HTML), "imperva");
  });

  await test("detectBotWall flags a Cloudflare interstitial", async () => {
    assert.equal(
      detectBotWall(`<html><head><title>Just a moment...</title></head><body></body></html>`),
      "cloudflare",
    );
  });

  await test("detectBotWall does NOT flag a real results page mentioning recaptcha", async () => {
    // BBB ships NEXT_PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY inside its 275KB
    // results page. Treating that as a block would discard good data.
    assert.equal(detectBotWall(BBB_HTML + `"NEXT_PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY":"abc"`), null);
  });

  await test("a challenge page is a CHECK FAILURE, never a clean miss", async () => {
    resetState();
    responder = () => mockHtml(CHALLENGE_HTML, 200);
    const result = await scrapeBbb(
      { business_name: "Mr. Rooter Plumbing", address: "100 Main, Waco, TX" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, false);
    assert.equal(
      result.error,
      "rate_limited",
      "a 200-with-challenge-body must surface as an error — reporting it as a clean miss is how Houzz told every subscriber they were delisted",
    );
  });

  /* ─────────────── BBB ─────────────────────────────────────────────── */

  await test("BBB returns found:true with city-disambiguated profile URL", async () => {
    resetState();
    responder = () => mockHtml(BBB_HTML);
    const result = await scrapeBbb(
      { business_name: "Mr. Rooter Plumbing", address: "100 Main, Waco, TX" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.ok(result.listing_url?.includes("/waco/"), "URL should include waco");
    assert.ok(!result.listing_url?.includes("/dallas/"), "must not pick Dallas listing");
  });

  await test("BBB scopes the search to Canada for a Canadian address", async () => {
    resetState();
    responder = () => mockHtml(BBB_CA_HTML);
    const result = await scrapeBbb(
      { business_name: "Mr. Rooter Plumbing", address: "12 Bloor St, Etobicoke, ON" },
      { politeDelayMs: 0 },
    );
    assert.ok(
      fetchCalls[0].url.includes("find_country=CAN"),
      "a Canadian address must set find_country=CAN, or BBB answers with US results and the listing looks missing",
    );
    assert.equal(result.found, true);
    assert.ok(result.listing_url?.includes("/ca/on/"));
  });

  await test("BBB returns error on rate-limit (403)", async () => {
    resetState();
    responder = () => mockHtml("blocked", 403);
    const result = await scrapeBbb(
      { business_name: "Mr. Rooter", address: "Waco, TX" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, false);
    assert.equal(result.error, "rate_limited");
  });

  /* ─────────────── BuildZoom ───────────────────────────────────────── */

  await test("BuildZoom fetches profile JSON-LD and returns full NAP", async () => {
    resetState();
    responder = (url) => {
      if (url.includes("/search")) return mockHtml(BZ_SEARCH_HTML);
      if (url.includes("/contractor/")) return mockHtml(BZ_PROFILE_HTML);
      return mockHtml("", 404);
    };
    const result = await scrapeBuildzoom(
      { business_name: "Mr. Rooter", address: "Seattle, WA" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.equal(result.nap?.phone, "(425) 226-0603");
    assert.ok(result.nap?.address?.includes("Seattle"));
  });

  /* ─────────────── Google Business Profile ─────────────────────────── */

  await test("GBP discovery matches on name + city and stores the place id", async () => {
    resetState();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    responder = () =>
      mockJson({
        places: [
          {
            id: "ChIJoRTtBWKtQYgRfB6h5zJV9mw",
            displayName: { text: "Mr. Rooter Plumbing" },
            formattedAddress: "2125 Montana Ave, Waco, TX 76701, USA",
            businessStatus: "OPERATIONAL",
          },
        ],
      });
    const result = await scrapeGoogleBusinessProfile(
      { business_name: "Mr. Rooter Plumbing", address: "100 Main, Waco, TX" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.ok(result.listing_url?.includes("place_id:ChIJoRTtBWKtQYgRfB6h5zJV9mw"));
    assert.equal(placeIdFromListingUrl(result.listing_url), "ChIJoRTtBWKtQYgRfB6h5zJV9mw");
  });

  await test("GBP rejects a fuzzy near-match rather than adopting a stranger's listing", async () => {
    // Verified live: Places answers "Zzqqx Nonexistent Plumbing Co,
    // Cincinnati OH" with the real, unrelated "Zins Plumbing".
    resetState();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    responder = () =>
      mockJson({
        places: [
          {
            id: "ChIJVVVVVVmxQYgRu_ChKcssDeo",
            displayName: { text: "Zins Plumbing" },
            formattedAddress: "3827 Spring Grove Ave, Cincinnati, OH 45223, USA",
            businessStatus: "OPERATIONAL",
          },
        ],
      });
    const result = await scrapeGoogleBusinessProfile(
      { business_name: "Zzqqx Nonexistent Plumbing Co", address: "1 Main, Cincinnati, OH" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, false);
    assert.equal(result.error, undefined, "a clean search with no real match is a confirmed absence");
  });

  await test("GBP prefers an OPERATIONAL listing over a closed duplicate", async () => {
    resetState();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    responder = () =>
      mockJson({
        places: [
          { id: "old", displayName: { text: "Mr. Rooter Plumbing" }, formattedAddress: "9 Old Rd, Waco, TX", businessStatus: "CLOSED_PERMANENTLY" },
          { id: "new", displayName: { text: "Mr. Rooter Plumbing" }, formattedAddress: "1 New Rd, Waco, TX", businessStatus: "OPERATIONAL" },
        ],
      });
    const result = await scrapeGoogleBusinessProfile(
      { business_name: "Mr. Rooter Plumbing", address: "1 New Rd, Waco, TX" },
      { politeDelayMs: 0 },
    );
    assert.ok(result.listing_url?.includes("place_id:new"));
  });

  await test("GBP recheck uses Place Details on the known id with an Essentials mask", async () => {
    resetState();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    responder = () => mockJson({ id: "abc123xyz9", formattedAddress: "1 New Rd, Waco, TX 76701, USA" });
    const result = await scrapeGoogleBusinessProfile(
      {
        business_name: "Mr. Rooter Plumbing",
        address: "1 New Rd, Waco, TX",
        known_listing_url: "https://www.google.com/maps/place/?q=place_id:abc123xyz9",
      },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.equal(fetchCalls.length, 1);
    assert.ok(
      fetchCalls[0].url.includes("/v1/places/abc123xyz9"),
      "recheck must hit Place Details, not Text Search",
    );
    const mask = (fetchCalls[0].init?.headers as Record<string, string>)["X-Goog-FieldMask"];
    assert.ok(!mask.includes("displayName"), "recheck mask must stay on the free Essentials tier");
    assert.equal(result.nap?.name, undefined, "no name is claimed when none was fetched");
  });

  await test("GBP recheck 404 falls back to discovery, and reports absent only if that also misses", async () => {
    resetState();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    responder = (url) =>
      url.includes(":searchText") ? mockJson({ places: [] }) : mockJson({ error: "not found" }, 404);
    const result = await scrapeGoogleBusinessProfile(
      {
        business_name: "Mr. Rooter Plumbing",
        address: "1 Main, Waco, TX",
        known_listing_url: "https://maps.google.com/?q=place_id:abc123xyz9",
      },
      { politeDelayMs: 0 },
    );
    assert.equal(fetchCalls.length, 2, "a dead place id must trigger a re-discovery search");
    assert.equal(result.found, false);
    assert.equal(result.error, undefined);
  });

  await test("GBP re-discovers a listing that was deleted and re-created under a new id", async () => {
    // Google issues a fresh place id when a profile is re-created, so
    // re-checking only the old id would keep a fixed listing flagged as
    // removed forever.
    resetState();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    responder = (url) =>
      url.includes(":searchText")
        ? mockJson({
            places: [
              {
                id: "brandNewId1",
                displayName: { text: "Mr. Rooter Plumbing" },
                formattedAddress: "1 Main St, Waco, TX 76701, USA",
                businessStatus: "OPERATIONAL",
              },
            ],
          })
        : mockJson({ error: "not found" }, 404);
    const result = await scrapeGoogleBusinessProfile(
      {
        business_name: "Mr. Rooter Plumbing",
        address: "1 Main, Waco, TX",
        known_listing_url: "https://maps.google.com/?q=place_id:deadOldId9",
      },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.ok(result.listing_url?.includes("place_id:brandNewId1"));
  });

  await test("GBP quota exhaustion is a check failure, not a removal", async () => {
    resetState();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    responder = () => mockJson({ error: "quota" }, 429);
    const result = await scrapeGoogleBusinessProfile(
      { business_name: "X", known_listing_url: "https://maps.google.com/?q=place_id:abc123xyz9" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, false);
    assert.equal(result.error, "rate_limited");
  });

  await test("GBP with no API key reports not_configured, never absence", async () => {
    resetState();
    delete process.env.GOOGLE_MAPS_API_KEY;
    const result = await scrapeGoogleBusinessProfile({ business_name: "X" }, { politeDelayMs: 0 });
    assert.equal(result.found, false);
    assert.equal(result.error, "not_configured");
    assert.equal(fetchCalls.length, 0, "must not call the API without a key");
  });

  /* ─────────────── YellowPages.ca ──────────────────────────────────── */

  await test("YellowPages.ca matches on slug + city segment", async () => {
    resetState();
    responder = () => mockHtml(YPCA_HTML);
    const result = await scrapeYellowPagesCa(
      { business_name: "Mr. Rooter Plumbing", address: "10 King St, Toronto, ON" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.ok(result.listing_url?.includes("/Toronto/"));
    assert.ok(!result.listing_url?.includes("/Ottawa/"), "must not match the Ottawa branch");
  });

  await test("YellowPages.ca reports a missing listing when nobody matches", async () => {
    resetState();
    responder = () => mockHtml(YPCA_HTML);
    const result = await scrapeYellowPagesCa(
      { business_name: "Completely Different Roofing", address: "10 King St, Toronto, ON" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, false);
    assert.equal(result.error, undefined, "a parsed results page with no match is real evidence");
  });

  await test("YellowPages.ca treats a page with no listing anchors as a check failure", async () => {
    resetState();
    responder = () => mockHtml(pad("<html><body><a href='/about'>About</a></body></html>"));
    const result = await scrapeYellowPagesCa(
      { business_name: "Mr. Rooter Plumbing", address: "Toronto, ON" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, false);
    assert.equal(result.error, "parse_error", "markup we don't recognise means we did not check");
  });

  /* ─────────────── n49 ─────────────────────────────────────────────── */

  await test("n49 matches a business in the slug", async () => {
    resetState();
    responder = () => mockHtml(N49_HTML);
    const result = await scrapeN49(
      { business_name: "Mr Rooter Plumbing", address: "10 King St, Toronto, ON" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.ok(result.listing_url?.includes("/biz/895891/"));
  });

  await test("n49 fallback redirect is a check failure, not an absence", async () => {
    // n49 silently 302s an unparseable query to a default city index full
    // of valid-looking /biz/ anchors for unrelated businesses.
    resetState();
    responder = () =>
      mockHtml(N49_HTML, 200, "https://www.n49.com/search/none/314/hamilton-ontario/");
    const result = await scrapeN49(
      { business_name: "Mr Rooter Plumbing", address: "Toronto, ON" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, false);
    assert.equal(
      result.error,
      "parse_error",
      "landing on a default index means the search never ran — reporting 'not found' would be a fabricated result",
    );
  });

  /* ─────────────── OpenStreetMap ───────────────────────────────────── */

  await test("OSM reports not_configured while disabled, and makes no request", async () => {
    resetState();
    delete process.env.CITETRACK_NOMINATIM_URL;
    delete process.env.CITETRACK_OSM_USE_PUBLIC_INSTANCE;
    const result = await scrapeOpenStreetMap({ business_name: "X" }, { politeDelayMs: 0 });
    assert.equal(result.found, false);
    assert.equal(result.error, "not_configured");
    assert.equal(fetchCalls.length, 0);
  });

  await test("OSM parses a Nominatim hit when configured", async () => {
    resetState();
    process.env.CITETRACK_NOMINATIM_URL = "https://nominatim.example.test";
    responder = () =>
      mockJson([
        {
          osm_type: "way",
          osm_id: 195261714,
          name: "Roto-Rooter",
          display_name: "Roto-Rooter, Montana Avenue, Cincinnati, Ohio, 45223, United States",
          extratags: { phone: "+1-513-631-0595" },
        },
      ]);
    const result = await scrapeOpenStreetMap(
      { business_name: "Roto-Rooter", address: "2125 Montana Ave, Cincinnati, OH" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.equal(result.listing_url, "https://www.openstreetmap.org/way/195261714");
    delete process.env.CITETRACK_NOMINATIM_URL;
  });

  await test("OSM treats a non-array body as a check failure", async () => {
    resetState();
    process.env.CITETRACK_NOMINATIM_URL = "https://nominatim.example.test";
    responder = () => mockJson({ error: "rate limited" });
    const result = await scrapeOpenStreetMap(
      { business_name: "Roto-Rooter", address: "Cincinnati, OH" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, false);
    assert.equal(result.error, "parse_error");
    delete process.env.CITETRACK_NOMINATIM_URL;
  });

  /* ─────────────── universal contract ──────────────────────────────── */

  await test("every scraper maps an aborted fetch to a timeout error, never a miss", async () => {
    resetState();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    process.env.CITETRACK_NOMINATIM_URL = "https://nominatim.example.test";
    responder = () => {
      const err = new Error("aborted") as Error & { name: string };
      err.name = "AbortError";
      throw err;
    };
    const inputs = { business_name: "Foo Plumbing", address: "1 Bar St, Waco, TX" };
    const all = [
      scrapeBbb,
      scrapeBuildzoom,
      scrapeGoogleBusinessProfile,
      scrapeYellowPagesCa,
      scrapeN49,
      scrapeOpenStreetMap,
    ];
    for (const fn of all) {
      const result = await fn(inputs, { politeDelayMs: 0 });
      assert.equal(result.found, false, fn.name + " should return found:false on abort");
      assert.equal(result.error, "timeout", fn.name + " should map abort to timeout");
    }
    delete process.env.CITETRACK_NOMINATIM_URL;
  });

  console.log("\nResults: " + passed + " passed, " + failed + " failed");
  if (failed > 0) process.exit(1);
}

run()
  .then(() => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = realFetch;
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
