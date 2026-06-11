/**
 * Public deep health-check endpoint — Deploy Safety Wave 2.
 *
 *   GET /api/healthz
 *     → 200 { status: "ok",   checks: {...}, version, built_at, boot_time }
 *     → 503 { status: "down"|"degraded", checks: {...}, ... }       when not
 *
 * `version` is the short git sha stamped into dist/build-info.json by
 * script/build.ts ("dev" when running unbundled); `built_at` is the build
 * timestamp. Together with boot_time they prove WHICH build a Replit publish
 * actually put live — see scripts/staging-gate/wait-for-staging.mjs.
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
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { isTwilioConfigured, getTwilioClient } from "../twilioClient";
import {
  getSites as bingGetSites,
  getQuota as bingGetQuota,
  BingApiError,
} from "../lib/seo/bingClient";
import { createLogger } from "../lib/logger";
// res2: AI-provider health. getPrimaryCircuitState() exposes whether the
// Anthropic primary is currently failing over to the backup chain;
// readyFallbackProviders() lists which OpenAI-compatible backups have keys.
// Both are read-only and owned by the sibling AI services (do not edit there).
import { getPrimaryCircuitState } from "../services/aiService";
import { readyFallbackProviders } from "../services/llmFallbackChain";
// Build-identity stamp written by script/build.ts at build time
// (dist/build-info.json). Lazy + cached + never-throws — see buildInfo.ts.
import { getBuildInfo } from "../lib/buildInfo";

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
  /** Short git sha of the deployed build ("dev" when unstamped). */
  version: string;
  /** ISO timestamp the deployed bundle was built ("null" when unstamped).
   *  version + built_at + boot_time together prove WHICH build a publish
   *  actually shipped — closes the `version: "unknown"` blind spot that
   *  made publish verification guesswork. */
  built_at: string | null;
  boot_time: string;
}

const HEALTHZ_CACHE_TTL_MS = 15_000;
const PROBE_TIMEOUT_MS = 2_000;
const DB_TABLE_MIN = Number(process.env.HEALTHZ_DB_TABLE_MIN ?? 25);

const BOOT_TIME = new Date().toISOString();

/**
 * Deployed-build identity. Primary source is the build-time stamp
 * (dist/build-info.json, written by script/build.ts) — build truth beats
 * runtime env. Env vars remain as fallbacks for environments that surface a
 * sha without the stamp (start-prod GIT_SHA wiring, see
 * scripts/staging-gate/wait-for-staging.mjs). Final fallback is "dev"
 * (local tsx, no bundle) — never "unknown".
 *
 * Resolved lazily per response (getBuildInfo caches the fs read for the
 * process lifetime) and guaranteed not to throw.
 */
function resolveVersionInfo(): { version: string; built_at: string | null } {
  const stamp = getBuildInfo();
  if (stamp.version !== "dev") {
    return { version: stamp.version, built_at: stamp.built_at };
  }
  const envSha =
    process.env.GIT_SHA ??
    process.env.REPL_DEPLOYMENT_ID ??
    process.env.SOURCE_VERSION;
  return { version: envSha ?? "dev", built_at: stamp.built_at };
}

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
  // Diagnostics (non-sensitive): the config the RUNNING DOPPLER_TOKEN is scoped
  // to (parsed from the `dp.st.<config>.<id>` service-token format — the token
  // VALUE is never read out), and whether a prd-only secret actually landed in
  // the process. Together these say definitively whether prod booted on prd.
  const tokenMatch = (process.env.DOPPLER_TOKEN ?? "").match(/^dp\.st\.([^.]+)\./);
  const token_config = tokenMatch ? tokenMatch[1] : "unknown";
  const imap_enabled = process.env.INBOUND_IMAP_ENABLED === "true";
  return { ok: true, status: "ok", config, token_config, imap_enabled };
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

/* ─── AI providers (res2) ───
 *
 * Business-continuity visibility for the LLM stack. Reports per-provider
 *   { provider, key_present, live_ping_ok }
 * plus `failover_active` (Anthropic primary circuit OPEN/half-open).
 *
 * Liveness: ONE cheapest authenticated call per provider that HAS a key —
 * `models.list()` (Anthropic + every OpenAI-compatible backup). models.list
 * is an authenticated GET that consumes NO generation tokens and is the
 * cheapest way to prove the key authenticates. Each call is bounded by a
 * short timeout (AI_PING_TIMEOUT_MS, ≤5s).
 *
 * Caching: the result is cached for AI_PROBE_CACHE_TTL_MS (60s) in a DEDICATED
 * cache (separate from the 15s healthz cache) so live pings never burn rate
 * limits even if the outer healthz cache is bypassed or expires faster.
 *
 * Status: AI is a FEATURE, not boot-critical. This probe NEVER returns `down`:
 *   - no key on ANY provider, or every live ping fails → `degraded`
 *   - at least one provider key present AND ping ok     → `ok`
 * The overall healthz status therefore degrades (not 503s) on AI loss.
 */
const AI_PROBE_CACHE_TTL_MS = 60_000;
const AI_PING_TIMEOUT_MS = Math.min(
  Number(process.env.AI_HEALTHZ_PING_TIMEOUT_MS ?? 5_000),
  5_000,
);

interface AiProviderStatus {
  provider: string;
  key_present: boolean;
  live_ping_ok: boolean | null; // null = not pinged (no key)
  detail?: string;
}

/** Env-var resolvers mirror server/services/llmFallbackChain.ts so the live
 *  ping uses the same key/baseURL the runtime cascade would. Kept local (not
 *  imported) because the chain's provider table is private to that module and
 *  this probe must not edit it. */
function aiPingTargets(): Array<{
  provider: string;
  apiKey: string | undefined;
  baseURL?: string;
  kind: "anthropic" | "openai";
}> {
  return [
    { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY, kind: "anthropic" },
    {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      kind: "openai",
    },
    { provider: "groq", apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1", kind: "openai" },
    { provider: "together", apiKey: process.env.TOGETHER_API_KEY, baseURL: "https://api.together.xyz/v1", kind: "openai" },
    { provider: "mistral", apiKey: process.env.MISTRAL_API_KEY, baseURL: "https://api.mistral.ai/v1", kind: "openai" },
    { provider: "deepseek", apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com/v1", kind: "openai" },
    {
      provider: "xai",
      apiKey: process.env.XAI_API_KEY ?? process.env.GROK_API_KEY,
      baseURL: "https://api.x.ai/v1",
      kind: "openai",
    },
  ];
}

/** One cheapest authenticated call, bounded by AI_PING_TIMEOUT_MS. */
async function pingProvider(t: {
  provider: string;
  apiKey: string;
  baseURL?: string;
  kind: "anthropic" | "openai";
}): Promise<{ ok: boolean; detail?: string }> {
  const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`ai ping ${t.provider} timed out`)), AI_PING_TIMEOUT_MS),
      ),
    ]);
  try {
    if (t.kind === "anthropic") {
      const client = new Anthropic({ apiKey: t.apiKey, timeout: AI_PING_TIMEOUT_MS });
      // models.list() is an authenticated GET — no generation tokens spent.
      await withTimeout(client.models.list({ limit: 1 }) as unknown as Promise<unknown>);
      return { ok: true };
    }
    const client = new OpenAI({ apiKey: t.apiKey, baseURL: t.baseURL, timeout: AI_PING_TIMEOUT_MS });
    await withTimeout(client.models.list() as unknown as Promise<unknown>);
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message.slice(0, 160) : String(err) };
  }
}

let aiCached: { at: number; providers: AiProviderStatus[] } | null = null;

async function buildAiProviderStatuses(): Promise<AiProviderStatus[]> {
  const now = Date.now();
  if (aiCached && now - aiCached.at < AI_PROBE_CACHE_TTL_MS) {
    return aiCached.providers;
  }
  const targets = aiPingTargets();
  const results = await Promise.all(
    targets.map(async (t): Promise<AiProviderStatus> => {
      const key_present = !!t.apiKey?.trim();
      if (!key_present) {
        return { provider: t.provider, key_present: false, live_ping_ok: null };
      }
      const ping = await pingProvider({ provider: t.provider, apiKey: t.apiKey!, baseURL: t.baseURL, kind: t.kind });
      return {
        provider: t.provider,
        key_present: true,
        live_ping_ok: ping.ok,
        ...(ping.detail ? { detail: ping.detail } : {}),
      };
    }),
  );
  aiCached = { at: now, providers: results };
  return results;
}

/**
 * AI check — feature-level, never `down`. `degraded` when no provider key is
 * present OR no present provider authenticates; `ok` when at least one
 * provider key authenticates. Includes per-provider detail + failover state.
 */
async function checkAi(): Promise<ProbeOutcome> {
  const providers = await buildAiProviderStatuses();
  const circuit = getPrimaryCircuitState();
  const failover_active = circuit !== "closed";

  const anyKeyPresent = providers.some((p) => p.key_present);
  const anyLiveOk = providers.some((p) => p.live_ping_ok === true);

  // readyFallbackProviders() is the chain's own view of which backups have
  // keys — surface it for cross-checking against the per-provider list.
  let fallback_ready: string[] = [];
  try {
    fallback_ready = readyFallbackProviders();
  } catch {
    fallback_ready = [];
  }

  if (!anyKeyPresent) {
    return {
      ok: false,
      status: "degraded",
      detail: "no AI provider key configured — all AI features disabled",
      providers,
      failover_active,
      circuit_state: circuit,
      fallback_ready,
    };
  }
  if (!anyLiveOk) {
    return {
      ok: false,
      status: "degraded",
      detail: "AI key(s) present but no provider authenticated on live ping",
      providers,
      failover_active,
      circuit_state: circuit,
      fallback_ready,
    };
  }
  return {
    ok: true,
    status: failover_active ? "degraded" : "ok",
    ...(failover_active ? { detail: "primary circuit not closed — failing over to backups" } : {}),
    providers,
    failover_active,
    circuit_state: circuit,
    fallback_ready,
  };
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

/** AI-specific probe wrapper. The standard probe() races a 2s timeout and
 *  converts any timeout/throw into `down` — wrong for AI, whose live pings may
 *  take up to AI_PING_TIMEOUT_MS (5s) and which must NEVER 503 the deploy.
 *  This wrapper bounds the whole AI check just above the per-ping budget and
 *  degrades (never downs) on timeout/throw. */
async function aiProbe(): Promise<CheckResult> {
  const started = Date.now();
  try {
    const result = await Promise.race([
      checkAi(),
      new Promise<ProbeOutcome>((_, reject) =>
        setTimeout(
          () => reject(new Error("ai check timed out")),
          AI_PING_TIMEOUT_MS + 1_000,
        ),
      ),
    ]);
    return { ...result, latency_ms: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      status: "degraded",
      latency_ms: Date.now() - started,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function buildHealthz(): Promise<{ body: HealthzResponse; http: number }> {
  const [dbR, dbTablesR, dopplerR, stripeR, twilioR, mapsR, bingR, redisR, aiR] = await Promise.all([
    probe("db", checkDb),
    probe("db_tables", checkDbTables),
    probe("doppler", checkDoppler),
    probe("stripe", checkStripe),
    probe("twilio", checkTwilio),
    probe("google_maps", checkGoogleMaps),
    probe("bing", checkBing),
    probe("redis", checkRedis),
    aiProbe(),
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
    ai: aiR,
  };

  const status = aggregate(checks);
  const http = status === "ok" ? 200 : 503;
  const { version, built_at } = resolveVersionInfo();

  return {
    http,
    body: { status, checks, version, built_at, boot_time: BOOT_TIME },
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
      // resolveVersionInfo() is guaranteed non-throwing (buildInfo.ts
      // contract), so the crash path still reports build identity.
      const { version, built_at } = resolveVersionInfo();
      res.status(503).json({
        status: "down",
        checks: {},
        version,
        built_at,
        boot_time: BOOT_TIME,
        detail: "healthz handler crashed",
      });
    }
  });
}
