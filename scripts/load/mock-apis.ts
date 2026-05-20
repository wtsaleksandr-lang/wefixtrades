/**
 * Mock APIs for MapGuard load testing.
 *
 * Stubs the two external services the MapGuard scan path depends on:
 *   - Serper (POST /search and POST /maps)
 *   - Google Places (GET /:placeId)
 *
 * Returns deterministic payloads so the scoring code in
 * server/services/mapguardMonitor.ts has realistic shapes to consume
 * without any network egress. Latency is simulated with a small,
 * fixed sleep so the load profile reflects "fast healthy upstream"
 * rather than instant in-process resolution.
 *
 * Run:  npx tsx scripts/load/mock-apis.ts
 *       (binds to MAPGUARD_MOCK_PORT or 4545)
 *
 * Pair with these env vars on the dev server:
 *   SERPER_BASE_URL=http://127.0.0.1:4545
 *   PLACES_BASE_URL=http://127.0.0.1:4545/places
 *   SERPER_API_KEY=loadtest
 *   GOOGLE_MAPS_API_KEY=loadtest
 *   MAPGUARD_LOAD_MODE=1
 *   MAPGUARD_LOAD_CLIENT_COUNT=100
 */

import http from "node:http";

const PORT = Number.parseInt(process.env.MAPGUARD_MOCK_PORT || "4545", 10);
const UPSTREAM_LATENCY_MS = Number.parseInt(process.env.MAPGUARD_MOCK_LATENCY_MS || "25", 10);
const ERROR_RATE = Number.parseFloat(process.env.MAPGUARD_MOCK_ERROR_RATE || "0");

let totalRequests = 0;
let totalErrors = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shouldError(): boolean {
  return ERROR_RATE > 0 && Math.random() < ERROR_RATE;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function serperSearchPayload(query: string): unknown {
  return {
    organic: [
      { title: "Top Rated Tradesperson Sydney", link: "https://example.com/a", snippet: "Top tier service for " + query },
      { title: "ABC Plumbing", link: "https://abcplumbing.example.com", snippet: "Reliable plumbing." },
      { title: "BestPlumber Co", link: "https://bestplumber.example.com", snippet: "24/7 emergency." },
      { title: "Premier Trades", link: "https://premiertrades.example.com", snippet: "Local pros." },
      { title: "City Trade Services", link: "https://citytrade.example.com", snippet: "Fast quotes." },
      { title: "Fix It Now", link: "https://fixitnow.example.com", snippet: "Same-day." },
      { title: "Quick Repairs", link: "https://quickrepairs.example.com", snippet: "Affordable." },
      { title: "Trusted Trades", link: "https://trustedtrades.example.com", snippet: "Family run." },
      { title: "MyHome Services", link: "https://myhome.example.com", snippet: "All trades." },
      { title: "GoToTrades", link: "https://gototrades.example.com", snippet: "Verified pros." },
    ],
    peopleAlsoAsk: [],
    relatedSearches: [],
  };
}

function serperMapsPayload(query: string): unknown {
  return {
    places: [
      { title: "Top Rated Tradesperson Sydney", rating: 4.8, ratingCount: 312 },
      { title: "ABC Plumbing", rating: 4.6, ratingCount: 220 },
      { title: "BestPlumber Co", rating: 4.5, ratingCount: 180 },
      { title: "Premier Trades", rating: 4.3, ratingCount: 95 },
      { title: "City Trade Services", rating: 4.2, ratingCount: 67 },
    ],
  };
}

function placesPayload(placeId: string): unknown {
  return {
    displayName: { text: `Mock Business ${placeId.slice(-4)}` },
    rating: 4.6,
    userRatingCount: 158,
    photos: Array.from({ length: 14 }, (_, i) => ({ name: `photo_${i}` })),
    websiteUri: "https://mockbusiness.example.com",
    regularOpeningHours: { weekdayDescriptions: ["Mon-Fri 9:00 AM - 5:00 PM"] },
    editorialSummary: { text: "Trusted local trades business." },
  };
}

const server = http.createServer(async (req, res) => {
  totalRequests++;

  if (UPSTREAM_LATENCY_MS > 0) await sleep(UPSTREAM_LATENCY_MS);

  if (shouldError()) {
    totalErrors++;
    return jsonResponse(res, 500, { error: "Simulated upstream error" });
  }

  const method = req.method || "GET";
  const url = req.url || "/";

  // Serper: POST /search and POST /maps
  if (method === "POST" && (url === "/search" || url === "/maps")) {
    const body = await readBody(req);
    let query = "loadtest";
    try {
      const parsed = JSON.parse(body || "{}");
      query = String(parsed.q || query);
    } catch { /* ignore malformed body */ }
    const payload = url === "/search" ? serperSearchPayload(query) : serperMapsPayload(query);
    return jsonResponse(res, 200, payload);
  }

  // Google Places v1: GET /places/:placeId
  if (method === "GET" && url.startsWith("/places/")) {
    const placeId = url.split("?")[0]!.replace("/places/", "");
    return jsonResponse(res, 200, placesPayload(placeId));
  }

  // Health probe for k6 setup()
  if (method === "GET" && url === "/__health") {
    return jsonResponse(res, 200, {
      ok: true,
      total_requests: totalRequests,
      total_errors: totalErrors,
      upstream_latency_ms: UPSTREAM_LATENCY_MS,
    });
  }

  jsonResponse(res, 404, { error: "Not found", method, url });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-apis] listening on http://127.0.0.1:${PORT}`);
  console.log(`[mock-apis] upstream latency: ${UPSTREAM_LATENCY_MS}ms, error rate: ${ERROR_RATE}`);
  console.log("[mock-apis] routes: POST /search, POST /maps, GET /places/:id, GET /__health");
});

const shutdown = (signal: string) => {
  console.log(`[mock-apis] received ${signal}; total_requests=${totalRequests} total_errors=${totalErrors}`);
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
