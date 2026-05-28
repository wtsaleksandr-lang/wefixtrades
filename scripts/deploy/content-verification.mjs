#!/usr/bin/env node
/**
 * Wave 93 — content verification probes for the Post-Deploy Watchdog.
 *
 * Runs AFTER /api/healthz settles (rollback-monitor.mjs) and verifies that
 * critical SEO + compliance routes actually shipped real content — not the
 * empty SPA shell. The prerender silent-skip regression that motivated
 * Wave 88 ran undetected for weeks because /api/healthz was green the
 * whole time: the API was up, but the static HTML files external no-JS
 * scrapers depend on (TCR vetting bot, search crawlers, link previews)
 * had reverted to ~3 KB shells.
 *
 * For each CRITICAL_ROUTES entry we assert:
 *   1. HTTP 200
 *   2. Response body length >= minBytes (defends against unhydrated shell)
 *   3. Body contains every case-insensitive token in mustContain
 *
 * Any failure exits non-zero and writes a `verdict=fail` block to
 * GITHUB_OUTPUT so the workflow can branch on it. The watchdog DOES NOT
 * auto-revert on content failures (deliberate — these are typically the
 * prerender flake, not a code regression that needs a `main` rollback).
 * Instead the workflow files a "content-verification-failed" issue.
 *
 * Exit codes:
 *   0 — every route passed
 *   1 — at least one route failed
 *   2 — script misconfiguration (don't open an issue)
 *
 * Env:
 *   DEPLOY_URL              base URL (default https://wefixtrades.com)
 *   CONTENT_REQ_TIMEOUT_MS  per-route fetch timeout (default 15000 — prerendered
 *                           pages are ~50-200 KB)
 *   GITHUB_OUTPUT           Actions step outputs (set automatically in CI)
 *   LAST_REPORT_PATH        where to write the JSON report
 *                           (default ./content-verification-report.json)
 */

import { appendFileSync, writeFileSync } from "node:fs";

const BASE = (process.env.DEPLOY_URL || "https://wefixtrades.com").replace(/\/$/, "");
const REQ_TIMEOUT_MS = Number(process.env.CONTENT_REQ_TIMEOUT_MS ?? 15_000);
const LAST_REPORT_PATH = process.env.LAST_REPORT_PATH || "./content-verification-report.json";

/**
 * Critical SEO + compliance routes. Kept in sync with
 * `tests/build-output-smoke.test.ts` (Wave 93) and `scripts/seo/prerender-routes.mjs`.
 *
 * minBytes calibration:
 *   - Empty SPA shell after Vite client build is ~3-4 KB.
 *   - Prerendered pages with real content are 12+ KB (consent disclosure
 *     is ~15 KB; pricing/about are ~25 KB; home is ~80 KB).
 *   - 5000 catches the silent-skip regression while leaving headroom for
 *     template tweaks. /sms-consent-disclosure has a stricter floor
 *     because it directly affects A2P 10DLC vetting.
 *
 * mustContain rules:
 *   - Use semantically meaningful tokens that are visible in the rendered
 *     <body>, not <head> meta. The empty shell DOES have a sensible title.
 *   - Case-insensitive substring match — keep tokens robust to copy edits.
 */
const CRITICAL_ROUTES = [
  {
    path: "/",
    minBytes: 8_000,
    mustContain: ["WeFixTrades"],
  },
  {
    path: "/sms-consent-disclosure",
    minBytes: 6_000,
    mustContain: ["STOP", "consent", "opt-in"],
  },
  {
    path: "/privacy",
    minBytes: 5_000,
    mustContain: ["Privacy"],
  },
  {
    path: "/terms",
    minBytes: 5_000,
    mustContain: ["Terms"],
  },
  {
    path: "/products/quickquotepro",
    minBytes: 5_000,
    // QuoteQuick is the brand name for the QuickQuotePro product page.
    mustContain: ["QuoteQuick"],
  },
  {
    path: "/products/tradeline",
    minBytes: 5_000,
    mustContain: ["TradeLine"],
  },
  {
    path: "/pricing",
    minBytes: 5_000,
    mustContain: ["$"],
  },
  {
    path: "/about",
    minBytes: 5_000,
    mustContain: ["About"],
  },
];

function log(line) {
  console.log(`[content-verify] ${line}`);
}

function writeGithubOutput(kv) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  let buf = "";
  for (const [k, v] of Object.entries(kv)) {
    buf += `${k}=${String(v).replace(/\n/g, " ").trim()}\n`;
  }
  appendFileSync(out, buf);
}

/** Fetch with hard timeout. Returns { ok, status, body, error }. */
async function fetchRoute(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Pretend to be a no-JS crawler — this is the exact code path the
      // TCR vetting bot and Bing's crawler take. We want to see the
      // prerendered HTML, not whatever the SPA hydrates to.
      headers: {
        "User-Agent": "wfx-post-deploy-watchdog/1.0 (+content-verification)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, error: null };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: "",
      error: err?.name === "AbortError" ? `timeout after ${REQ_TIMEOUT_MS}ms` : String(err?.message ?? err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function checkRoute(route, fetchResult) {
  const problems = [];

  if (fetchResult.error) {
    problems.push(`fetch failed: ${fetchResult.error}`);
    return { route: route.path, ok: false, problems, status: 0, bytes: 0 };
  }
  if (fetchResult.status !== 200) {
    problems.push(`status ${fetchResult.status} (expected 200)`);
  }

  const bytes = Buffer.byteLength(fetchResult.body, "utf8");
  if (bytes < route.minBytes) {
    problems.push(
      `body is ${bytes}B, below ${route.minBytes}B minimum — likely unhydrated SPA shell`,
    );
  }

  const haystack = fetchResult.body.toLowerCase();
  for (const token of route.mustContain) {
    if (!haystack.includes(token.toLowerCase())) {
      problems.push(`missing required token "${token}"`);
    }
  }

  return {
    route: route.path,
    ok: problems.length === 0,
    problems,
    status: fetchResult.status,
    bytes,
  };
}

async function main() {
  log(`base URL: ${BASE}`);
  log(`checking ${CRITICAL_ROUTES.length} critical routes...`);

  const results = [];
  for (const route of CRITICAL_ROUTES) {
    const url = `${BASE}${route.path}`;
    log(`GET ${url}`);
    const fetched = await fetchRoute(url);
    const result = checkRoute(route, fetched);
    if (result.ok) {
      log(`  OK   ${result.route}  (${result.bytes}B)`);
    } else {
      log(`  FAIL ${result.route}  (${result.bytes}B, status ${result.status})`);
      for (const p of result.problems) log(`    - ${p}`);
    }
    results.push(result);
  }

  const failed = results.filter((r) => !r.ok);
  const report = {
    generated_at: new Date().toISOString(),
    base_url: BASE,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
  };

  try {
    writeFileSync(LAST_REPORT_PATH, JSON.stringify(report, null, 2));
    log(`wrote report to ${LAST_REPORT_PATH}`);
  } catch (err) {
    log(`WARN could not write report: ${err?.message ?? err}`);
  }

  if (failed.length === 0) {
    log(`PASS — all ${results.length} routes verified.`);
    writeGithubOutput({
      content_verdict: "pass",
      content_reason: `all ${results.length} critical routes returned real content`,
      content_failed_route: "",
      content_failed_assertion: "",
    });
    process.exit(0);
  }

  const first = failed[0];
  const reason =
    failed.length === 1
      ? `${first.route}: ${first.problems[0]}`
      : `${failed.length} of ${results.length} routes failed (first: ${first.route})`;

  log(`FAIL — ${failed.length} of ${results.length} routes failed verification.`);
  writeGithubOutput({
    content_verdict: "fail",
    content_reason: reason,
    content_failed_route: first.route,
    content_failed_assertion: first.problems[0] ?? "unknown",
  });
  process.exit(1);
}

main().catch((err) => {
  console.error(`[content-verify] FATAL: ${err?.stack ?? err}`);
  // exit 2 so the workflow knows not to open an issue — this is a bug
  // in the script itself, not a real content regression.
  process.exit(2);
});
