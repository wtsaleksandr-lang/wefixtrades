/**
 * Smoke tests for the multi-provider SERP orchestrator (Wave 6.5).
 *
 * Excluded from `tsc --noEmit` (tsconfig.json `exclude` covers
 * `**\/*.test.ts`). Runnable standalone via:
 *
 *   npx tsx server/lib/serpOrchestrator.test.ts
 *
 * Uses node's built-in `assert/strict` and a `fetch` mock so no test
 * runner dep is added. The quota tracker's DB hydrate fails gracefully
 * (logs + continues with empty state) when no DATABASE_URL is set, which
 * is exactly the standalone-test path.
 *
 * Coverage:
 *   1. Google CSE success path (top of priority chain).
 *   2. Fall-through when CSE returns 429 → Serper picks up.
 *   3. Fall-through when CSE + Serper unavailable → Brave picks up.
 *   4. Cache hit avoids any fetch call.
 *   5. All providers unavailable → SerpOrchestratorAllProvidersFailed.
 */

import assert from "node:assert/strict";

// db.ts throws at import if DATABASE_URL is unset — set a dummy URL so
// the Pool can construct. The pool is lazy; no real connection is made.
// The quota tracker's hydrate() swallows the subsequent query failure
// and falls back to empty in-memory state, which is exactly what we want.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test_unused";
}

const {
  searchSerp,
  SerpOrchestratorAllProvidersFailed,
  __resetSerpCache,
} = await import("./serpOrchestrator");
const { __resetQuotaTrackerState } = await import("./serpQuotaTracker");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void>): Promise<void> {
  return fn()
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

type FetchCall = { url: string; init?: RequestInit };
let fetchCalls: FetchCall[] = [];
let fetchResponder: (url: string, init?: RequestInit) => MockResponse | Promise<MockResponse>;

const realFetch = globalThis.fetch;
(globalThis as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  fetchCalls.push({ url, init });
  return fetchResponder(url, init);
};

function mockJson(body: unknown, status = 200): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function resetEnv() {
  delete process.env.GOOGLE_CUSTOMSEARCH_API_KEY;
  delete process.env.GOOGLE_CUSTOMSEARCH_CX;
  delete process.env.SERPER_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.SCALESERP_API_KEY;
  delete process.env.SERPSTACK_API_KEY;
  delete process.env.DATAFORSEO_LOGIN;
  delete process.env.DATAFORSEO_PASSWORD;
}

function resetState() {
  fetchCalls = [];
  __resetSerpCache();
  __resetQuotaTrackerState();
}

async function run() {
  console.log("SerpOrchestrator smoke tests:");

  await test("Google CSE handles the call when it's first in the chain", async () => {
    resetEnv();
    resetState();
    process.env.GOOGLE_CUSTOMSEARCH_API_KEY = "cse-key";
    process.env.GOOGLE_CUSTOMSEARCH_CX = "cx-id";
    fetchResponder = () =>
      mockJson({
        items: [
          { title: "Result 1", link: "https://example.com/a", snippet: "snip" },
        ],
        searchInformation: { totalResults: "1" },
      });
    const result = await searchSerp({ query: "plumber chicago", country: "us" });
    assert.equal(result.provider, "googleCse");
    assert.equal(result.organic.length, 1);
    assert.equal(result.organic[0].title, "Result 1");
    assert.equal(result.cached, false);
    assert.equal(fetchCalls.length, 1);
  });

  await test("Falls through CSE 429 to Serper", async () => {
    resetEnv();
    resetState();
    process.env.GOOGLE_CUSTOMSEARCH_API_KEY = "cse-key";
    process.env.GOOGLE_CUSTOMSEARCH_CX = "cx-id";
    process.env.SERPER_API_KEY = "serper-key";
    fetchResponder = (url) => {
      if (url.includes("customsearch.googleapis.com")) {
        return mockJson({ error: { code: 429, message: "Rate limit" } }, 429);
      }
      if (url.includes("google.serper.dev/search")) {
        return mockJson({
          organic: [{ position: 1, title: "Serper Hit", link: "https://s.example/a", snippet: "x" }],
        });
      }
      return mockJson({}, 500);
    };
    const result = await searchSerp({ query: "electrician dallas", country: "us" });
    assert.equal(result.provider, "serper");
    assert.equal(result.organic.length, 1);
    assert.equal(result.organic[0].title, "Serper Hit");
    assert.equal(fetchCalls.length, 2, "should call CSE then Serper");
  });

  await test("Falls through to Brave when CSE + Serper unavailable", async () => {
    resetEnv();
    resetState();
    process.env.BRAVE_SEARCH_API_KEY = "brave-key";
    fetchResponder = (url) => {
      if (url.includes("api.search.brave.com")) {
        return mockJson({
          web: { total: 42, results: [{ title: "Brave Hit", url: "https://b.example/a", description: "d" }] },
        });
      }
      return mockJson({}, 500);
    };
    const result = await searchSerp({ query: "roofing miami", country: "us" });
    assert.equal(result.provider, "brave");
    assert.equal(result.organic.length, 1);
    assert.equal(result.organic[0].title, "Brave Hit");
    assert.equal(result.totalResults, 42);
  });

  await test("Cache hit avoids the fetch call entirely", async () => {
    resetEnv();
    resetState();
    process.env.GOOGLE_CUSTOMSEARCH_API_KEY = "cse-key";
    process.env.GOOGLE_CUSTOMSEARCH_CX = "cx-id";
    fetchResponder = () =>
      mockJson({
        items: [{ title: "Cached", link: "https://c.example/a" }],
      });
    const req = { query: "hvac austin", country: "us" };
    const first = await searchSerp(req);
    assert.equal(first.cached, false);
    assert.equal(fetchCalls.length, 1);
    fetchCalls = [];
    const second = await searchSerp(req);
    assert.equal(second.cached, true);
    assert.equal(second.organic.length, 1);
    assert.equal(fetchCalls.length, 0, "cached call should not hit fetch");
  });

  await test("All providers unavailable throws SerpOrchestratorAllProvidersFailed", async () => {
    resetEnv();
    resetState();
    // No env vars set — every provider should ProviderUnavailable.
    fetchResponder = () => mockJson({}, 500);
    let thrown: unknown = null;
    try {
      await searchSerp({ query: "no providers", country: "us" });
    } catch (err) {
      thrown = err;
    }
    assert.ok(
      thrown instanceof SerpOrchestratorAllProvidersFailed,
      "should throw SerpOrchestratorAllProvidersFailed when nothing is configured",
    );
    assert.equal(fetchCalls.length, 0, "should not have made any HTTP call");
  });

  // Restore real fetch.
  (globalThis as any).fetch = realFetch;

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
