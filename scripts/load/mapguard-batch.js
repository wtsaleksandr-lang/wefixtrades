/**
 * MapGuard batch-scan k6 load test.
 *
 * Drives the existing admin endpoint POST /api/mapguard/scan/batch, which
 * wraps server/services/mapguardMonitor.ts:runMapguardBatchScan(). The
 * MAPGUARD_LOAD_MODE flag on the dev server makes that function:
 *   1. synthesize MAPGUARD_LOAD_CLIENT_COUNT in-memory clients (default 100)
 *   2. skip every DB write (snapshots, tasks, alerts)
 *   3. skip the inter-client 2-second sleep
 *
 * Combined with scripts/load/mock-apis.ts standing in for Serper and
 * Google Places, this exercises the full HTTP -> route -> worker -> fetch
 * loop for 100 clients per iteration without touching real APIs or
 * polluting dev data.
 *
 * The endpoint enforces a process-level mutex (MapguardBatchAlreadyRunning),
 * so this script intentionally stays at vus=1 and iterates sequentially —
 * concurrent batches would just collide on the mutex and tell you nothing.
 *
 * Usage:
 *   k6 run scripts/load/mapguard-batch.js \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e ADMIN_EMAIL=admin@example.com \
 *     -e ADMIN_PASSWORD=changeme \
 *     -e ITERATIONS=10
 *
 * Output: k6's built-in p50/p95/p99 summary for the http_req_duration
 * metric tagged {endpoint:"mapguard_batch"}, plus a custom trend
 * `batch_scan_seconds` for end-to-end batch latency.
 */

import http from "k6/http";
import { check, fail } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000";
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || "";
const ITERATIONS = Number.parseInt(__ENV.ITERATIONS || "10", 10);
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || "300s";

const batchScanSeconds = new Trend("batch_scan_seconds", true);
const clientsScanned = new Trend("clients_scanned");
const clientsErrored = new Trend("clients_errored");

export const options = {
  scenarios: {
    batch_scan: {
      executor: "shared-iterations",
      vus: 1,
      iterations: ITERATIONS,
      maxDuration: "30m",
    },
  },
  thresholds: {
    "http_req_failed{endpoint:mapguard_batch}": ["rate<0.05"],
    // 100 synthetic clients × ~12 keywords × 2 Serper calls + 1 Places
    // call ≈ 2,500 mocked HTTP calls per batch. Generous ceiling so a
    // slow dev box doesn't fail the run; tighten once you have a baseline.
    "http_req_duration{endpoint:mapguard_batch}": ["p(95)<180000"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(50)", "p(95)", "p(99)"],
};

/**
 * setup() — runs once before VUs spin up.
 *
 * Authenticates as admin via the same passport-local route the UI uses
 * and returns the session cookie for VUs to reuse. Aborts the run if
 * login fails so we don't burn 10 iterations against a 401.
 */
export function setup() {
  if (!ADMIN_PASSWORD) {
    fail("ADMIN_PASSWORD env is required (use the dev admin account, not prod)");
  }

  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { "Content-Type": "application/json" } }
  );

  if (loginRes.status !== 200) {
    fail(`Admin login failed: status=${loginRes.status} body=${loginRes.body}`);
  }

  // Extract connect.sid cookie from Set-Cookie header so VUs can replay it.
  const setCookie = loginRes.headers["Set-Cookie"] || "";
  const cookieMatch = /connect\.sid=([^;]+)/.exec(setCookie);
  if (!cookieMatch) {
    fail(`No connect.sid cookie in login response. headers=${JSON.stringify(loginRes.headers)}`);
  }

  return { sessionCookie: `connect.sid=${cookieMatch[1]}` };
}

export default function (data) {
  const start = Date.now();

  const res = http.post(`${BASE_URL}/api/mapguard/scan/batch`, null, {
    headers: {
      Cookie: data.sessionCookie,
      "Content-Type": "application/json",
    },
    timeout: REQUEST_TIMEOUT,
    tags: { endpoint: "mapguard_batch" },
  });

  const elapsedSeconds = (Date.now() - start) / 1000;
  batchScanSeconds.add(elapsedSeconds);

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "body is JSON": (r) => {
      try { JSON.parse(r.body); return true; } catch { return false; }
    },
  });

  if (ok && res.status === 200) {
    try {
      const body = JSON.parse(res.body);
      clientsScanned.add(body.scanned || 0);
      clientsErrored.add(body.errors || 0);
      console.log(
        `[iter] elapsed=${elapsedSeconds.toFixed(1)}s scanned=${body.scanned} errors=${body.errors} tasksCreated=${body.tasksCreated}`
      );
    } catch (err) {
      console.error(`[iter] failed to parse response body: ${err}`);
    }
  } else {
    console.error(`[iter] FAILED status=${res.status} body=${(res.body || "").slice(0, 500)}`);
  }
}

export function teardown(data) {
  // Best-effort logout. Ignore failures — the session expires on its own.
  http.post(`${BASE_URL}/api/auth/logout`, null, {
    headers: { Cookie: data.sessionCookie },
  });
}
