/**
 * Citation Tracker scrapers — smoke tests (Wave 41).
 *
 * Mirrors the pattern in server/lib/serpOrchestrator.test.ts: built-in
 * node:assert + a global fetch mock so no new test-framework dep is
 * added. tsconfig excludes `**\/*.test.ts` from `tsc`, so this file
 * only runs when invoked explicitly:
 *
 *   npx tsx server/services/citationTracker/scrapers/scrapers.test.ts
 *
 * Each scraper is tested against a hand-crafted minimal HTML fixture
 * that matches the live page structure observed during the Wave 41
 * probe. The fixtures are intentionally narrow — just enough markup to
 * exercise the parser branches we care about.
 */
import assert from "node:assert/strict";

interface MockResponse {
  ok: boolean;
  status: number;
  url?: string;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}

type Responder = (url: string) => MockResponse | Promise<MockResponse>;
let fetchCalls: string[] = [];
let responder: Responder = () => mockHtml("", 500);

const realFetch = globalThis.fetch;
(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (
  input: RequestInfo | URL,
) => {
  const url = typeof input === "string" ? input : input.toString();
  fetchCalls.push(url);
  return responder(url);
}) as typeof fetch;

function mockHtml(body: string, status = 200, finalUrl?: string): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: finalUrl,
    text: async () => body,
    json: async () => ({}),
  };
}

function resetState() {
  fetchCalls = [];
  responder = () => mockHtml("", 500);
}

const { scrapeBbb } = await import("./bbb");
const { scrapeBuildzoom } = await import("./buildzoom");
const { scrapeYellowbook } = await import("./yellowbook");
const { scrapeTupalo } = await import("./tupalo");
const { scrapeHouzz } = await import("./houzz");

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

/* ─────────────────────── BBB ───────────────────────────────────────── */

const BBB_HTML = `
<html><body>
  <div class="results">
    <a href="/us/tx/dallas/profile/plumber/mr-rooter-plumbing-of-dallas-0875-21001938">Mr. Rooter Plumbing of Dallas</a>
    <a href="/us/tx/waco/profile/plumber/mr-rooter-plumbing-of-waco-0825-1000209441">Mr. Rooter Plumbing of Waco</a>
    <a href="/us/tx/austin/profile/plumber/some-other-plumber-12345">Some Other Plumber</a>
  </div>
</body></html>`;

/* ──────────────────── BuildZoom (search + profile) ─────────────────── */

const BZ_SEARCH_HTML = `
<html><body>
  <a href="/contractor/mr-rooter-seattle-wa">MR. Rooter</a>
  <a href="/contractor/some-roofing-co">Some Roofing Co</a>
</body></html>`;

const BZ_PROFILE_HTML = `
<html><head>
<script type="application/ld+json">
[{"@context":"https://schema.org","@type":"Plumber","name":"MR. Rooter","telephone":"(425) 226-0603","address":{"@type":"PostalAddress","streetAddress":"123 Main St","addressLocality":"Seattle","addressRegion":"WA","postalCode":"98101"}}]
</script>
</head><body></body></html>`;

/* ─────────────────────── Yellowbook ─────────────────────────────────── */

const YB_HTML = `
<html><body>
  <article>
    <a href="/profile/mr-rooter-plumbing_1234567890.html">Mr. Rooter Plumbing</a>
    <span>Phone: (254) 555-1212</span>
  </article>
  <article>
    <a href="/profile/some-other-biz_0987654321.html">Some Other Biz</a>
  </article>
</body></html>`;

/* ─────────────────────── Tupalo ─────────────────────────────────────── */

const TUPALO_HTML = `
<html><body>
  <ul>
    <li><a href="/en/waco-tx/mr-rooter-plumbing">Mr. Rooter Plumbing</a></li>
    <li><a href="/en/login">Sign in</a></li>
  </ul>
</body></html>`;

/* ─────────────────────── Houzz ──────────────────────────────────────── */

const HOUZZ_HTML = `
<html><body>
  <a href="/professionals/plumbing-contractors/mr-rooter-plumbing-of-waco-pfvwus-pf~123456">Mr. Rooter Plumbing of Waco</a>
  <a href="/professionals/plumbing-contractors/joes-plumbing-pfvwus-pf~654321">Joe's Plumbing</a>
</body></html>`;

async function run() {
  console.log("Citation Tracker scrapers smoke tests:");

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
    assert.equal(fetchCalls.length, 1);
  });

  await test("BBB returns found:false on rate-limit (403)", async () => {
    resetState();
    responder = () => mockHtml("blocked", 403);
    const result = await scrapeBbb(
      { business_name: "Mr. Rooter", address: "Waco, TX" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, false);
    assert.equal(result.error, "rate_limited");
  });

  await test("BuildZoom fetches profile JSON-LD and returns full NAP", async () => {
    resetState();
    responder = (url) => {
      if (url.includes("/search/")) return mockHtml(BZ_SEARCH_HTML);
      if (url.includes("/contractor/")) return mockHtml(BZ_PROFILE_HTML);
      return mockHtml("", 404);
    };
    const result = await scrapeBuildzoom(
      { business_name: "Mr. Rooter", address: "Seattle, WA" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.ok(result.listing_url?.includes("/contractor/"));
    assert.equal(result.nap?.phone, "(425) 226-0603");
    assert.ok(result.nap?.address?.includes("Seattle"));
    assert.equal(fetchCalls.length, 2, "should fetch search + profile");
  });

  await test("BuildZoom returns name-only NAP when profile fetch fails", async () => {
    resetState();
    responder = (url) => {
      if (url.includes("/search/")) return mockHtml(BZ_SEARCH_HTML);
      return mockHtml("blocked", 403);
    };
    const result = await scrapeBuildzoom(
      { business_name: "Mr. Rooter", address: "Seattle, WA" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.equal(result.nap?.name, "MR. Rooter");
    assert.equal(result.nap?.phone, undefined);
  });

  await test("Yellowbook extracts phone from adjacent card text", async () => {
    resetState();
    responder = () => mockHtml(YB_HTML);
    const result = await scrapeYellowbook(
      { business_name: "Mr. Rooter Plumbing", address: "Waco, TX" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.ok(result.listing_url?.includes("/profile/"));
    assert.equal(result.nap?.phone, "(254) 555-1212");
  });

  await test("Tupalo matches a 3-segment business URL", async () => {
    resetState();
    responder = () => mockHtml(TUPALO_HTML);
    const result = await scrapeTupalo(
      { business_name: "Mr. Rooter Plumbing", address: "Waco, TX" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.equal(result.listing_url, "https://tupalo.com/en/waco-tx/mr-rooter-plumbing");
  });

  await test("Tupalo ignores 2-segment nav anchors", async () => {
    resetState();
    responder = () =>
      mockHtml(`<html><body><a href="/en/login">Login</a></body></html>`);
    const result = await scrapeTupalo(
      { business_name: "Mr. Rooter", address: "Waco, TX" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, false);
  });

  await test("Houzz matches business in category page", async () => {
    resetState();
    responder = () => mockHtml(HOUZZ_HTML);
    const result = await scrapeHouzz(
      { business_name: "Mr. Rooter Plumbing", address: "Waco, TX" },
      { politeDelayMs: 0 },
    );
    assert.equal(result.found, true);
    assert.ok(result.listing_url?.includes("/professionals/"));
    assert.ok(result.nap?.name?.includes("Mr. Rooter"));
  });

  await test("All scrapers return found:false on timeout (never throw)", async () => {
    resetState();
    responder = () => {
      // Simulate AbortError from fetch.
      const err = new Error("aborted") as Error & { name: string };
      err.name = "AbortError";
      throw err;
    };
    const inputs = { business_name: "Foo", address: "Bar, TX" };
    for (const fn of [scrapeBbb, scrapeBuildzoom, scrapeYellowbook, scrapeTupalo, scrapeHouzz]) {
      const result = await fn(inputs, { politeDelayMs: 0 });
      assert.equal(result.found, false, fn.name + " should return found:false on abort");
      assert.equal(result.error, "timeout", fn.name + " should map abort to timeout");
    }
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
