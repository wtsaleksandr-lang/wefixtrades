/**
 * Wave 93 — admin Deployment Health endpoint.
 *
 * One-click "is anything broken right now" view for prod. Backend fetches
 * every critical SEO + compliance route via the public hostname and
 * reports HTTP status, body bytes, and per-route keyword presence — the
 * same assertions the post-deploy content-verification probe runs in CI.
 *
 * Caches the result for 5 minutes by default so admin polling doesn't
 * thrash the prod server. The page exposes a "Re-run check" button that
 * sends `?force=1` to bypass the cache.
 *
 * GET /api/admin/deployment-health           — cached read
 * GET /api/admin/deployment-health?force=1   — bypass cache, re-probe
 *
 *   → {
 *       generated_at: ISO string,
 *       cached: boolean,
 *       cache_age_s: number,
 *       base_url: string,
 *       total: number, passed: number, failed: number,
 *       results: Array<{
 *         route, ok, status, bytes, problems[],
 *         min_bytes, must_contain[], present_tokens[]
 *       }>
 *     }
 *
 * Kept in sync with `scripts/deploy/content-verification.mjs`,
 * `tests/build-output-smoke.test.ts`, and
 * `server/static.ts:CRITICAL_PRERENDERED_ROUTES`.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";

const log = createLogger("DeploymentHealth");

interface CriticalRoute {
  path: string;
  minBytes: number;
  mustContain: string[];
}

const CRITICAL_ROUTES: CriticalRoute[] = [
  { path: "/", minBytes: 8_000, mustContain: ["WeFixTrades"] },
  { path: "/sms-consent-disclosure", minBytes: 6_000, mustContain: ["STOP", "consent", "opt-in"] },
  { path: "/privacy", minBytes: 5_000, mustContain: ["Privacy"] },
  { path: "/terms", minBytes: 5_000, mustContain: ["Terms"] },
  { path: "/products/quickquotepro", minBytes: 5_000, mustContain: ["QuoteQuick"] },
  { path: "/products/tradeline", minBytes: 5_000, mustContain: ["TradeLine"] },
  { path: "/pricing", minBytes: 5_000, mustContain: ["$"] },
  { path: "/about", minBytes: 5_000, mustContain: ["About"] },
];

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQ_TIMEOUT_MS = 15_000;

interface RouteResult {
  route: string;
  ok: boolean;
  status: number;
  bytes: number;
  min_bytes: number;
  must_contain: string[];
  present_tokens: string[];
  problems: string[];
  last_checked: string;
}

interface HealthReport {
  generated_at: string;
  cached: boolean;
  cache_age_s: number;
  base_url: string;
  total: number;
  passed: number;
  failed: number;
  results: RouteResult[];
}

interface CacheEntry {
  generated_at: number;
  base_url: string;
  results: RouteResult[];
}

let cache: CacheEntry | null = null;

/**
 * Resolve the public base URL the probes should hit. In prod we want
 * the canonical hostname so we see what real crawlers see. In dev /
 * staging we fall back to `req` (X-Forwarded-Host -> host header) so
 * the dashboard works in any environment.
 */
function resolveBaseUrl(req: Request): string {
  if (process.env.DEPLOYMENT_HEALTH_BASE_URL) {
    return process.env.DEPLOYMENT_HEALTH_BASE_URL.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    return "https://wefixtrades.com";
  }
  // Derive from the incoming request so dev/preview hosts work.
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "localhost:5000";
  return `${proto}://${host}`.replace(/\/$/, "");
}

async function probeRoute(baseUrl: string, route: CriticalRoute): Promise<RouteResult> {
  const url = `${baseUrl}${route.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  const last_checked = new Date().toISOString();
  const problems: string[] = [];
  let status = 0;
  let bytes = 0;
  let presentTokens: string[] = [];

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Match the watchdog / no-JS crawler User-Agent so we see the
        // same prerendered content path real bots see.
        "User-Agent": "wfx-admin-deployment-health/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    status = res.status;
    const body = await res.text();
    bytes = Buffer.byteLength(body, "utf8");

    if (status !== 200) {
      problems.push(`status ${status} (expected 200)`);
    }
    if (bytes < route.minBytes) {
      problems.push(
        `body is ${bytes}B, below ${route.minBytes}B minimum — likely unhydrated SPA shell`,
      );
    }
    const haystack = body.toLowerCase();
    for (const token of route.mustContain) {
      if (haystack.includes(token.toLowerCase())) {
        presentTokens.push(token);
      } else {
        problems.push(`missing required token "${token}"`);
      }
    }
  } catch (err: any) {
    const msg =
      err?.name === "AbortError" ? `timeout after ${REQ_TIMEOUT_MS}ms` : String(err?.message ?? err);
    problems.push(`fetch failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  return {
    route: route.path,
    ok: problems.length === 0,
    status,
    bytes,
    min_bytes: route.minBytes,
    must_contain: route.mustContain,
    present_tokens: presentTokens,
    problems,
    last_checked,
  };
}

async function runAllProbes(baseUrl: string): Promise<RouteResult[]> {
  // Probes run in parallel — total wall time is dominated by the slowest
  // single fetch, bounded by REQ_TIMEOUT_MS.
  return Promise.all(CRITICAL_ROUTES.map((r) => probeRoute(baseUrl, r)));
}

export function registerDeploymentHealthRoutes(app: Express): void {
  app.get(
    "/api/admin/deployment-health",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const force = req.query.force === "1" || req.query.force === "true";
        const baseUrl = resolveBaseUrl(req);
        const now = Date.now();

        if (!force && cache && cache.base_url === baseUrl && now - cache.generated_at < CACHE_TTL_MS) {
          const report: HealthReport = {
            generated_at: new Date(cache.generated_at).toISOString(),
            cached: true,
            cache_age_s: Math.floor((now - cache.generated_at) / 1000),
            base_url: cache.base_url,
            total: cache.results.length,
            passed: cache.results.filter((r) => r.ok).length,
            failed: cache.results.filter((r) => !r.ok).length,
            results: cache.results,
          };
          return res.json(report);
        }

        const results = await runAllProbes(baseUrl);
        cache = { generated_at: now, base_url: baseUrl, results };

        const report: HealthReport = {
          generated_at: new Date(now).toISOString(),
          cached: false,
          cache_age_s: 0,
          base_url: baseUrl,
          total: results.length,
          passed: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          results,
        };
        res.json(report);
      } catch (err) {
        log.error("deployment-health failed", { error: String(err) });
        res.status(500).json({ error: "Failed to gather deployment health" });
      }
    },
  );
}
