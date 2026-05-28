/**
 * Public deep health-check endpoint — Deploy Safety Wave 2.
 *
 *   GET /api/healthz
 *     → 200 { status: "ok",   checks: {...}, version, boot_time }   when healthy
 *     → 503 { status: "down"|"degraded", checks: {...}, ... }       when not
 *
 * Goal: catch broken deploys at runtime even when migrations are clean.
 * The post-deploy verifier (scripts/post-deploy-verify.mjs) polls this for
 * up to 60 s before declaring a deploy bad.
 *
 * IMPORTANT: this endpoint is PUBLIC (no auth) so external monitoring can
 * hit it. Response MUST NOT leak any secret value (no API keys, no DB URL,
 * no Doppler token). Each check emits booleans + latency + an opaque label.
 *
 * Checks (each runs in parallel, each wrapped in a per-probe timeout so
 * one slow vendor can't stall the whole response):
 *
 *   db          — `SELECT 1` against the connection pool.
 *   db_tables   — count public-schema tables; expect ≥ MIN_TABLE_COUNT.
 *                 Fewer = bootstrapMigrations didn't run, deploy is broken.
 *   doppler     — DOPPLER_TOKEN present + config name resolvable.
 *   stripe      — stripe.products.list({ limit: 1 }), 2 s timeout.
 *   twilio      — fetch account info (cheap, ~50 ms).
 *   google_maps — verify key presence only (don't burn quota).
 *   redis       — only if REDIS_URL is set; skipped otherwise.
 *
 * Result is cached in-process for HEALTHZ_CACHE_TTL_MS (15 s) to prevent
 * abuse and to keep latency low for monitoring that polls every few seconds.
 */

import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { isTwilioConfigured, getTwilioClient } from "../twilioClient";
import {
  getSites as bingGetSites,
  getQuota as bingGetQuota,
  BingApiError,
} from "../lib/seo/bingClient";
import { createLogger } from "../lib/logger";

const log = createLogger("Healthz");

type CheckStatus = "ok" | "degraded" | "down" | "skipped";

/** Probe return value (latency added by the wrapper). */
interface ProbeOutcome {
  ok: boolean;
  status: CheckStatus;
  /** Opaque diagnostic label. MUST NOT contain secret values. */
  detail?: string | null;
  /** Extra non-sensitive metadata (counts, config names, etc.). */
  [extra: string]: unknown;
}

interface CheckResult extends ProbeOutcome {
  latency_ms: number | null;
}

interface HealthzResponse {
  status: "ok" | "degraded" | "down";
  checks: Record<string, CheckResult>;
  version: string;
  boot_time: string;
}

const HEALTHZ_CACHE_TTL_MS = 15_000;
const PROBE_TIMEOUT_MS = 2_000;
const DB_TABLE_MIN = Number(process.env.HEALTHZ_DB_TABLE_MIN ?? 25);

const BOOT_TIME = new Date().toISOString();
const VERSION =
  process.env.GIT_SHA ??
  process.env.REPL_DEPLOYMENT_ID ??
  process.env.SOURCE_VERSION ??
  "unknown";

let cached: { at: number; body: HealthzResponse; http: number } | null = null;

/** Per-probe timeout wrapper. Any thrown / timed-out probe → status=down. */
async function probe(
  name: string,
  fn: () => Promise<ProbeOutcome>,
): Promise<CheckResult> {
  const started = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<ProbeOutcome>((_, reject) =>
        setTimeout(
          () => reject(new Error(`probe ${name} timed out after ${PROBE_TIMEOUT_MS}ms`)),
          PROBE_TIMEOUT_MS,
        ),
      ),
    ]);
    return { ...result, latency_ms: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      status: "down",
      latency_ms: Date.now() - started,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ─── probes ─── */

async function checkDb(): Promise<ProbeOutcome> {
  await db.execute(sql`select 1`);
  return { ok: true, status: "ok" };
}

async function checkDbTables(): Promise<ProbeOutcome> {
  const result: any = await db.execute(
    sql`select count(*)::int as count from information_schema.tables where table_schema = 'public'`,
  );
  // drizzle node-postgres returns { rows: [...] }
  const rows: any[] = Array.isArray(result) ? result : result?.rows ?? [];
  const found = Number(rows[0]?.count ?? 0);
  if (found < DB_TABLE_MIN) {
    return {
      ok: false,
      status: "down",
      detail: `bootstrapMigrations may not have run: ${found} < ${DB_TABLE_MIN}`,
      expected_min: DB_TABLE_MIN,
      found,
    };
  }
  return { ok: true, status: "ok", expected_min: DB_TABLE_MIN, found };
}

async function checkDoppler(): Promise<ProbeOutcome> {
  if (!process.env.DOPPLER_TOKEN) {
    return {
      ok: false,
      status: "degraded",
      detail: "DOPPLER_TOKEN not set — running in Replit-Secrets-only mode",
    };
  }
  // Config name is non-sensitive — opaque label like "prd" / "stg".
  const config = process.env.DOPPLER_CONFIG ?? "dev";
  return { ok: true, status: "ok", config };
}

async function checkStripe(): Promise<ProbeOutcome> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return { ok: false, status: "degraded", detail: "STRIPE_SECRET_KEY not set" };
  }
  const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
  const list = await stripe.products.list({ limit: 1 });
  return { ok: true, status: "ok", mode: list.data[0]?.livemode === false ? "test" : "live" };
}

async function checkTwilio(): Promise<ProbeOutcome> {
  if (!isTwilioConfigured()) {
    return { ok: false, status: "degraded", detail: "Twilio not configured" };
  }
  const client = getTwilioClient();
  const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID!).fetch();
  if (account.status !== "active") {
    return { ok: false, status: "degraded", detail: `account status ${account.status}` };
  }
  return { ok: true, status: "ok" };
}

async function checkGoogleMaps(): Promise<ProbeOutcome> {
  // Key-presence only — geocode calls consume quota we don't want to spend
  // on every monitoring tick.
  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return { ok: false, status: "degraded", detail: "Google Maps key not set" };
  }
  return { ok: true, status: "ok", detail: "key present (probe is non-invasive)" };
}

/**
 * Classify a Bing failure into healthz status. We intentionally narrow what
 * counts as `down` because the Post-Deploy Watchdog (scripts/post-deploy-
 * watchdog.mjs) treats `down` as needing a rollback — and most Bing failures
 * we see in practice are transient (5xx, timeouts, brief quota dips), not
 * "WeFixTrades is broken". Real auth misconfiguration (401/403) is the only
 * case that warrants a rollback signal.
 *
 *   network failure / timeout (status=0) → degraded (bing_api_timeout)
 *   HTTP 5xx                              → degraded (bing_api_5xx)
 *   HTTP 429 (quota)                      → degraded (bing_api_quota)
 *   HTTP 401 / 403 (auth)                 → down     (real config issue)
 *   other 4xx                             → degraded (transient / client-side)
 */
function classifyBingError(err: unknown): ProbeOutcome {
  if (err instanceof BingApiError) {
    // status=0 means the bingClient's fetchWithRetry exhausted its 3 retries
    // without reaching Bing — network-level / timeout.
    if (err.status === 0) {
      return { ok: false, status: "degraded", detail: "bing_api_timeout" };
    }
    if (err.status >= 500) {
      return { ok: false, status: "degraded", detail: "bing_api_5xx" };
    }
    if (err.status === 429) {
      return { ok: false, status: "degraded", detail: "bing_api_quota" };
    }
    if (err.status === 401 || err.status === 403) {
      return { ok: false, status: "down", detail: "bing_api_auth" };
    }
    // Other 4xx — treat as transient client-side issue, not a deploy regression.
    return { ok: false, status: "degraded", detail: `bing_api_http_${err.status}` };
  }
  // Non-BingApiError (unexpected). Don't trigger a rollback for an unknown
  // upstream shape — degrade and surface an opaque label.
  return { ok: false, status: "degraded", detail: "bing_api_unknown" };
}

/** Internal soft-timeout — must fire before the probe() wrapper's 2 s race so
 * that a slow Bing response degrades rather than becoming a generic `down`. */
const BING_SOFT_TIMEOUT_MS = 1_700;

async function checkBing(): Promise<ProbeOutcome> {
  if (!process.env.BING_WEBMASTER_API_KEY) {
    return { ok: false, status: "degraded", detail: "BING_WEBMASTER_API_KEY not set" };
  }
  // Cheap auth probe + quota readout. Both must succeed within the
  // per-probe 2s timeout. Sequential is fine — each call is sub-second.
  //
  // NOTE: classifyBingError narrows what counts as `down`. Only genuine auth
  // failures (401/403) bubble up as `down` — 5xx, network timeouts, and quota
  // hits are `degraded` so the Post-Deploy Watchdog doesn't roll back on
  // transient Bing flakes. See PRs #911 and #892 for prior false rollbacks.
  //
  // We race against an internal soft timeout (1.7 s) shorter than the probe
  // wrapper's 2 s so we catch slow-Bing as a classified `degraded` instead of
  // letting the wrapper convert it to a generic `down`.
  let sites: Awaited<ReturnType<typeof bingGetSites>>;
  try {
    sites = await Promise.race([
      bingGetSites(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new BingApiError("GetUserSites", 0, null, "soft timeout")),
          BING_SOFT_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    return classifyBingError(err);
  }
  if (!Array.isArray(sites) || sites.length === 0) {
    return { ok: false, status: "degraded", detail: "no sites returned" };
  }
  // Optional quota read — if it fails, we still treat the probe as OK since
  // GetUserSites already proved auth works.
  let dailyRemaining: number | null = null;
  try {
    const q = await bingGetQuota();
    dailyRemaining = q.DailyQuota;
  } catch {
    // ignore — quota is informational
  }
  if (dailyRemaining != null && dailyRemaining < 10) {
    return {
      ok: false,
      status: "degraded",
      detail: `daily quota nearly exhausted (${dailyRemaining}/100)`,
      daily_remaining: dailyRemaining,
      sites: sites.length,
    };
  }
  return {
    ok: true,
    status: "ok",
    sites: sites.length,
    ...(dailyRemaining != null ? { daily_remaining: dailyRemaining } : {}),
  };
}

async function checkRedis(): Promise<ProbeOutcome> {
  if (!process.env.REDIS_URL) {
    return { ok: true, status: "skipped", detail: "REDIS_URL not set" };
  }
  // Lightweight TCP-style ping via fetch isn't possible; if Redis is wired in
  // later, swap to an actual `PING`. For now, key-presence is enough to
  // surface a missing config without adding a redis client dependency.
  return { ok: true, status: "ok", detail: "REDIS_URL present" };
}

/* ─── aggregation ─── */

function aggregate(checks: Record<string, CheckResult>): "ok" | "degraded" | "down" {
  let worst: "ok" | "degraded" | "down" = "ok";
  for (const check of Object.values(checks)) {
    if (check.status === "down") return "down";
    if (check.status === "degraded" && worst === "ok") worst = "degraded";
  }
  return worst;
}

async function buildHealthz(): Promise<{ body: HealthzResponse; http: number }> {
  const [dbR, dbTablesR, dopplerR, stripeR, twilioR, mapsR, bingR, redisR] = await Promise.all([
    probe("db", checkDb),
    probe("db_tables", checkDbTables),
    probe("doppler", checkDoppler),
    probe("stripe", checkStripe),
    probe("twilio", checkTwilio),
    probe("google_maps", checkGoogleMaps),
    probe("bing", checkBing),
    probe("redis", checkRedis),
  ]);

  const checks: Record<string, CheckResult> = {
    db: dbR,
    db_tables: dbTablesR,
    doppler: dopplerR,
    stripe: stripeR,
    twilio: twilioR,
    google_maps: mapsR,
    bing: bingR,
    redis: redisR,
  };

  const status = aggregate(checks);
  const http = status === "ok" ? 200 : 503;

  return {
    http,
    body: { status, checks, version: VERSION, boot_time: BOOT_TIME },
  };
}

/** Exported for the boot-time self-test. Bypasses the cache. */
export async function runHealthzCheck(): Promise<{ body: HealthzResponse; http: number }> {
  return buildHealthz();
}

export function registerHealthzRoute(app: Express): void {
  app.get("/api/healthz", async (_req: Request, res: Response) => {
    try {
      const now = Date.now();
      if (cached && now - cached.at < HEALTHZ_CACHE_TTL_MS) {
        res.status(cached.http).json(cached.body);
        return;
      }
      const result = await buildHealthz();
      cached = { at: now, body: result.body, http: result.http };
      res.status(result.http).json(result.body);
    } catch (err) {
      log.error("healthz handler failed", { error: String(err) });
      res.status(503).json({
        status: "down",
        checks: {},
        version: VERSION,
        boot_time: BOOT_TIME,
        detail: "healthz handler crashed",
      });
    }
  });
}
