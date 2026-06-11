/**
 * Tests for the Serper-based rank provider + source selection (Lane H).
 *
 * Excluded from `tsc --noEmit` (tsconfig.json `exclude` covers
 * `**\/*.test.ts`). Runnable standalone via:
 *
 *   npx tsx server/services/rankflow/serpRankProvider.test.ts
 *
 * Follows the serpOrchestrator.test.ts pattern: node's built-in
 * `assert/strict` + a global `fetch` mock — no test runner dep, no live
 * Serper calls ever.
 *
 * Coverage:
 *   1.  Domain found at position N (organic) + url_found + provenance.
 *   2.  Domain not in top 100 → position null, NOT skipped (real signal).
 *   3.  Local-pack position matched by business name.
 *   4.  Transient API error → one retry, then graceful skip (no throw).
 *   5.  Transient API error → retry succeeds → result recorded.
 *   6.  429 → abort remaining keywords (skipped, no extra calls).
 *   7.  Budget guard: maxQueries caps Serper calls; overflow skipped.
 *   8.  Missing SERPER_API_KEY → all skipped, zero fetch calls.
 *   9.  selectRankSources matrix (key present/absent × GSC connected/not).
 *   10. checkKeywordRanks integration: Serper primary end-to-end;
 *       no-source path returns skipped results (worker stores nothing).
 */

import assert from "node:assert/strict";

// db.ts throws at import if DATABASE_URL is unset — set a dummy URL so
// the Pool can construct. The pool is lazy; no real connection is made.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

const {
  checkKeywordRanksViaSerp,
  serpRankAvailable,
  findOrganicPosition,
  findLocalPackPosition,
  deriveCountry,
  normalizeDomain,
} = await import("./serpRankProvider");
const { checkKeywordRanks, selectRankSources } = await import("./rankTracker");
const { __resetQuotaTrackerState } = await import("../../lib/serpQuotaTracker");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ✗ ${name}`);
      console.error(err);
      failed++;
    });
}

interface MockResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

type FetchCall = { url: string; body: any };
let fetchCalls: FetchCall[] = [];
let fetchResponder: (url: string, call: FetchCall) => MockResponse | Promise<MockResponse>;

const realFetch = globalThis.fetch;
(globalThis as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  const call: FetchCall = {
    url,
    body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
  };
  fetchCalls.push(call);
  return fetchResponder(url, call);
};

function mockJson(body: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function organicPage(targetAt: number | null, total = 100) {
  const organic = [];
  for (let i = 1; i <= total; i++) {
    organic.push({
      position: i,
      title: `Result ${i}`,
      link: i === targetAt ? "https://www.acmeplumbing.com/services" : `https://competitor${i}.example/page`,
    });
  }
  return organic;
}

function resetState() {
  fetchCalls = [];
  __resetQuotaTrackerState();
  delete process.env.SERPER_API_KEY;
  delete process.env.GOOGLE_SEARCH_CONSOLE_ENABLED;
  delete process.env.ENABLE_RANK_SCRAPING;
}

const KW = [{ id: 1, keyword: "plumber toronto" }];

async function run() {
  console.log("SerpRankProvider tests:");

  await test("finds the domain at its organic position with provenance", async () => {
    resetState();
    process.env.SERPER_API_KEY = "test-key";
    fetchResponder = () => mockJson({ organic: organicPage(7) });
    const results = await checkKeywordRanksViaSerp(KW, "https://www.acmeplumbing.com", "Toronto, Ontario, Canada", {
      maxQueries: 10,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].position, 7);
    assert.equal(results[0].url_found, "https://www.acmeplumbing.com/services");
    assert.equal(results[0].source, "serp_api");
    assert.equal(results[0].skipped, false);
    assert.equal(results[0].keyword_id, 1);
    // geo params present: gl from location, location passthrough, num=100
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].body.gl, "ca");
    assert.equal(fetchCalls[0].body.location, "Toronto, Ontario, Canada");
    assert.equal(fetchCalls[0].body.num, 100);
  });

  await test("not in top 100 → position null but NOT skipped (real signal)", async () => {
    resetState();
    process.env.SERPER_API_KEY = "test-key";
    fetchResponder = () => mockJson({ organic: organicPage(null) });
    const results = await checkKeywordRanksViaSerp(KW, "acmeplumbing.com", undefined, { maxQueries: 10 });
    assert.equal(results[0].position, null);
    assert.equal(results[0].url_found, null);
    assert.equal(results[0].skipped, false, "a clean 'not found' is storable data, not a skip");
  });

  await test("local-pack position matched by business name", async () => {
    resetState();
    process.env.SERPER_API_KEY = "test-key";
    fetchResponder = () =>
      mockJson({
        organic: organicPage(3),
        places: [
          { title: "Rival Plumbing Inc", rating: 4.2 },
          { title: "ACME Plumbing", rating: 4.9 },
          { title: "Third Plumbing Co", rating: 4.0 },
        ],
      });
    const results = await checkKeywordRanksViaSerp(KW, "acmeplumbing.com", "Toronto", {
      maxQueries: 10,
      businessName: "Acme Plumbing",
    });
    assert.equal(results[0].position, 3);
    assert.equal(results[0].local_pack_position, 2);
  });

  await test("transient API error → one retry then graceful skip", async () => {
    resetState();
    process.env.SERPER_API_KEY = "test-key";
    fetchResponder = () => mockJson({ error: "boom" }, 500);
    const results = await checkKeywordRanksViaSerp(KW, "acmeplumbing.com", undefined, { maxQueries: 10 });
    assert.equal(fetchCalls.length, 2, "should retry exactly once");
    assert.equal(results[0].skipped, true, "failed check must be skipped, not stored as null rank");
    assert.equal(results[0].position, null);
  });

  await test("transient API error → retry succeeds → result recorded", async () => {
    resetState();
    process.env.SERPER_API_KEY = "test-key";
    let calls = 0;
    fetchResponder = () => {
      calls++;
      if (calls === 1) return mockJson({ error: "flaky" }, 503);
      return mockJson({ organic: organicPage(12) });
    };
    const results = await checkKeywordRanksViaSerp(KW, "acmeplumbing.com", undefined, { maxQueries: 10 });
    assert.equal(fetchCalls.length, 2);
    assert.equal(results[0].skipped, false);
    assert.equal(results[0].position, 12);
  });

  await test("429 aborts the remaining keywords in the run", async () => {
    resetState();
    process.env.SERPER_API_KEY = "test-key";
    fetchResponder = () => mockJson({ error: "quota" }, 429);
    const threeKw = [
      { id: 1, keyword: "kw one" },
      { id: 2, keyword: "kw two" },
      { id: 3, keyword: "kw three" },
    ];
    const results = await checkKeywordRanksViaSerp(threeKw, "acmeplumbing.com", undefined, { maxQueries: 10 });
    assert.equal(fetchCalls.length, 1, "no retry and no further keywords after 429");
    assert.equal(results.length, 3);
    assert.ok(results.every((r) => r.skipped), "all keywords skipped after 429");
  });

  await test("budget guard: maxQueries caps Serper calls, overflow skipped", async () => {
    resetState();
    process.env.SERPER_API_KEY = "test-key";
    fetchResponder = () => mockJson({ organic: organicPage(1) });
    const fiveKw = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, keyword: `kw ${i + 1}` }));
    const results = await checkKeywordRanksViaSerp(fiveKw, "acmeplumbing.com", undefined, { maxQueries: 2 });
    assert.equal(fetchCalls.length, 2, "must never exceed the per-run budget");
    assert.equal(results.length, 5);
    assert.equal(results.filter((r) => !r.skipped).length, 2);
    assert.equal(results.filter((r) => r.skipped).length, 3);
  });

  await test("missing SERPER_API_KEY → all skipped, zero API calls, no throw", async () => {
    resetState();
    fetchResponder = () => mockJson({}, 500);
    assert.equal(serpRankAvailable(), false);
    const results = await checkKeywordRanksViaSerp(KW, "acmeplumbing.com", undefined, { maxQueries: 10 });
    assert.equal(fetchCalls.length, 0);
    assert.ok(results.every((r) => r.skipped));
  });

  await test("selectRankSources matrix (key × GSC connection)", () => {
    // Serper key present + GSC connected → Serper primary, GSC enrichment
    assert.deepEqual(
      selectRankSources({ serperKeyPresent: true, gscEnabled: true, gscConnected: true }),
      { primary: "serp_api", enrichment: "search_console" },
    );
    // Serper key present, no GSC → Serper primary, no enrichment
    assert.deepEqual(
      selectRankSources({ serperKeyPresent: true, gscEnabled: true, gscConnected: false }),
      { primary: "serp_api", enrichment: null },
    );
    assert.deepEqual(
      selectRankSources({ serperKeyPresent: true, gscEnabled: false, gscConnected: true }),
      { primary: "serp_api", enrichment: null },
    );
    // No Serper key, GSC connected → GSC primary (legacy fallback)
    assert.deepEqual(
      selectRankSources({ serperKeyPresent: false, gscEnabled: true, gscConnected: true }),
      { primary: "search_console", enrichment: null },
    );
    // Nothing but scraping flag → scrape
    assert.deepEqual(
      selectRankSources({ serperKeyPresent: false, gscEnabled: false, gscConnected: false, scrapingEnabled: true }),
      { primary: "scrape", enrichment: null },
    );
    // Nothing at all → none
    assert.deepEqual(
      selectRankSources({ serperKeyPresent: false, gscEnabled: false, gscConnected: false }),
      { primary: "none", enrichment: null },
    );
  });

  await test("checkKeywordRanks integration: Serper is primary when key present", async () => {
    resetState();
    process.env.SERPER_API_KEY = "test-key";
    // GSC disabled — pure Serper path, no clientId needed.
    fetchResponder = () => mockJson({ organic: organicPage(5) });
    const results = await checkKeywordRanks(KW, "acmeplumbing.com", "Toronto", 0, undefined, {
      maxSerpQueries: 10,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].source, "serp_api");
    assert.equal(results[0].position, 5);
    assert.equal(results[0].skipped, false);
    assert.equal(fetchCalls.length, 1, "only the Serper call — no GSC, no scraping");
  });

  await test("checkKeywordRanks: no source at all → skipped results, nothing stored", async () => {
    resetState();
    // No SERPER_API_KEY, GSC disabled, scraping disabled.
    fetchResponder = () => mockJson({}, 500);
    const results = await checkKeywordRanks(KW, "acmeplumbing.com", undefined, 0, undefined);
    assert.equal(results.length, 1);
    assert.equal(results[0].skipped, true, "no-source results must be skipped so the worker stores nothing");
    assert.equal(fetchCalls.length, 0);
  });

  await test("helpers: normalizeDomain / deriveCountry / matching", () => {
    assert.equal(normalizeDomain("https://www.Acme.com/path?q=1"), "acme.com");
    assert.equal(deriveCountry("Toronto, ON"), "ca");
    assert.equal(deriveCountry("Dallas, TX"), "us");
    assert.equal(deriveCountry(undefined), "us");
    // Subdomain of the target counts as the target.
    const res = {
      organic: [{ position: 1, title: "t", link: "https://blog.acme.com/post" }],
      provider: "serper",
      cached: false,
      queryTime: 0,
    };
    assert.equal(findOrganicPosition(res as any, "acme.com").position, 1);
    // But a different domain that merely CONTAINS the target must not match.
    const res2 = {
      organic: [{ position: 1, title: "t", link: "https://notacme.com/post" }],
      provider: "serper",
      cached: false,
      queryTime: 0,
    };
    assert.equal(findOrganicPosition(res2 as any, "acme.com").position, null);
    assert.equal(findLocalPackPosition(res as any, "Anything"), null);
  });

  // Restore real fetch.
  (globalThis as any).fetch = realFetch;

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
