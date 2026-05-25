/**
 * Multi-provider SERP orchestrator (Wave 6.5).
 *
 * Rotates SERP requests across a chain of FREE-TIER providers (Google
 * CSE, Serper, Brave, ScaleSerp, SerpStack) before falling through to
 * the pay-as-you-go DataForSEO provider. Goal: drive marginal SERP cost
 * toward zero by exhausting daily/monthly free-tier quotas first.
 *
 * Mirrors the proven 4-orchestrator pattern shipped in PRs #786 (image),
 * #787 (humanization), #788 (email), #807 (video).
 *
 * Per-engine priority chains (see `PROVIDER_ORDER`):
 *
 *   google_web        : googleCse → serper → brave → scaleserp → serpstack → dataforseo
 *   google_maps       : serper → scaleserp → dataforseo
 *   bing_equivalent   : brave → dataforseo  (Bing v7 was deprecated Aug 2025)
 *
 * Combined free capacity ≈ 5,500+ queries/month at $0.
 *
 * For each request the orchestrator iterates providers in priority order,
 * skips any that are misconfigured (env vars missing) or quota-exhausted,
 * times each call out at 5s, and falls through on any failure. If every
 * provider fails the call throws `SerpOrchestratorAllProvidersFailed`.
 *
 * Caching: in-memory LRU keyed by JSON.stringify(req), 1-hour TTL, 500
 * entries cap. Repeat queries inside the window return `cached: true`
 * without hitting any provider.
 *
 * Doppler env vars (any missing → provider auto-skipped):
 *   GOOGLE_CUSTOMSEARCH_API_KEY + GOOGLE_CUSTOMSEARCH_CX
 *   SERPER_API_KEY
 *   BRAVE_SEARCH_API_KEY
 *   SCALESERP_API_KEY
 *   SERPSTACK_API_KEY
 *   DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD
 */

import { createLogger } from "./logger";
import {
  ensureHydrated,
  quotaRemaining,
  recordError,
  recordSuccess,
  getSnapshot,
  type QuotaSnapshot,
} from "./serpQuotaTracker";
import {
  ProviderUnavailableError,
  QuotaExhaustedError,
  SerpOrchestratorAllProvidersFailed,
  type SerpEngine,
  type SerpProviderCall,
} from "./serpProviders/types";
import * as googleCse from "./serpProviders/googleCse";
import * as serper from "./serpProviders/serper";
import * as brave from "./serpProviders/brave";
import * as scaleserp from "./serpProviders/scaleserp";
import * as serpstack from "./serpProviders/serpstack";
import * as dataforseo from "./serpProviders/dataforseo";

const log = createLogger("SerpOrchestrator");

/* ─── Public types ──────────────────────────────────────────────────── */

export type SerpRequest = {
  query: string;
  location?: string;
  country?: string;
  language?: string;
  engine?: SerpEngine;
  num?: number;
  /** Optional latitude / longitude for geo-located queries (Local Rank
   *  Grid, MapGuard). Only Serper currently uses these directly; the
   *  other providers ignore them and fall back to `location` text. */
  latitude?: number;
  longitude?: number;
};

export type SerpOrganicResult = {
  position: number;
  title: string;
  link: string;
  snippet?: string;
  displayedLink?: string;
};

export type SerpLocalPackResult = {
  position: number;
  title: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
  placeId?: string;
};

export type SerpAdResult = {
  title: string;
  displayedLink?: string;
  link?: string;
};

export type SerpResult = {
  organic: SerpOrganicResult[];
  localPack?: SerpLocalPackResult[];
  /** Sponsored / paid ads (only populated by providers that expose them —
   *  currently Serper). Other providers leave this undefined / empty. */
  ads?: SerpAdResult[];
  totalResults?: number;
  provider: string;
  cached: boolean;
  queryTime: number;
};

/* ─── Provider registry ─────────────────────────────────────────────── */

interface ProviderModule {
  ID: string;
  MONTHLY_LIMIT: number;
  SUPPORTED_ENGINES: Set<string>;
  call: SerpProviderCall;
}

const PROVIDERS: Record<string, ProviderModule> = {
  googleCse,
  serper,
  brave,
  scaleserp,
  serpstack,
  dataforseo,
};

const PROVIDER_ORDER: Record<SerpEngine, string[]> = {
  google_web: ["googleCse", "serper", "brave", "scaleserp", "serpstack", "dataforseo"],
  google_maps: ["serper", "scaleserp", "dataforseo"],
  bing_equivalent: ["brave", "dataforseo"],
};

const REQUEST_TIMEOUT_MS = 5_000;

/* ─── Cache ─────────────────────────────────────────────────────────── */

interface CacheEntry {
  expiresAt: number;
  value: SerpResult;
}

const CACHE_TTL_MS = 60 * 60 * 1000;        // 1h
const CACHE_MAX_ENTRIES = 500;
const cache: Map<string, CacheEntry> = new Map();

function cacheGet(key: string): SerpResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // LRU refresh: move to end of insertion order.
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: SerpResult): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

function cacheKey(req: SerpRequest): string {
  // Normalize so trivially-equivalent requests share a cache slot.
  const normalized = {
    query: req.query.trim().toLowerCase(),
    location: req.location?.trim().toLowerCase() ?? null,
    country: req.country?.toLowerCase() ?? null,
    language: req.language?.toLowerCase() ?? null,
    engine: req.engine ?? "google_web",
    num: req.num ?? 10,
    // Round lat/lng to 4 decimals (~11m precision) so trivially-equal
    // grid points share a cache slot.
    latitude: typeof req.latitude === "number" ? Math.round(req.latitude * 1e4) / 1e4 : null,
    longitude: typeof req.longitude === "number" ? Math.round(req.longitude * 1e4) / 1e4 : null,
  };
  return JSON.stringify(normalized);
}

/* ─── Diagnostics ───────────────────────────────────────────────────── */

export interface ProviderDiagnostic {
  name: string;
  available: boolean;            // env vars present
  supportedEngines: SerpEngine[];
  monthlyCount: number;
  monthlyLimit: number;
  remaining: number;             // Infinity for pay-as-you-go
  lastUsedAt?: string;
  lastError?: string;
}

function envPresentForProvider(providerId: string): boolean {
  switch (providerId) {
    case "googleCse":
      return !!process.env.GOOGLE_CUSTOMSEARCH_API_KEY && !!process.env.GOOGLE_CUSTOMSEARCH_CX;
    case "serper":
      return !!process.env.SERPER_API_KEY;
    case "brave":
      return !!process.env.BRAVE_SEARCH_API_KEY;
    case "scaleserp":
      return !!process.env.SCALESERP_API_KEY;
    case "serpstack":
      return !!process.env.SERPSTACK_API_KEY;
    case "dataforseo":
      return !!process.env.DATAFORSEO_LOGIN && !!process.env.DATAFORSEO_PASSWORD;
    default:
      return false;
  }
}

export async function getProviderDiagnostics(): Promise<ProviderDiagnostic[]> {
  await ensureHydrated();
  const snapshot: Map<string, QuotaSnapshot> = new Map(
    getSnapshot().map((s) => [s.id, s]),
  );
  return Object.values(PROVIDERS).map((p) => {
    const snap = snapshot.get(p.ID);
    const remaining = quotaRemaining(p.ID, p.MONTHLY_LIMIT);
    return {
      name: p.ID,
      available: envPresentForProvider(p.ID),
      supportedEngines: Array.from(p.SUPPORTED_ENGINES) as SerpEngine[],
      monthlyCount: snap?.monthlyCount ?? 0,
      monthlyLimit: p.MONTHLY_LIMIT,
      remaining: Number.isFinite(remaining) ? remaining : Number.MAX_SAFE_INTEGER,
      lastUsedAt: snap?.lastUsedAt,
      lastError: snap?.lastError,
    };
  });
}

/* ─── Logging ───────────────────────────────────────────────────────── */

function logCall(
  provider: string,
  engine: SerpEngine,
  query: string,
  latencyMs: number,
  cached: boolean,
  resultCount: number,
): void {
  // Truncate query at 50 chars to keep log lines short and avoid logging
  // anything that looks like a stuffed PII payload.
  const q = query.length > 50 ? `${query.slice(0, 50)}…` : query;
  log.info("[serp] call", {
    provider,
    engine,
    query: q,
    latency_ms: latencyMs,
    cached,
    result_count: resultCount,
  });
}

/* ─── Public entry point ────────────────────────────────────────────── */

/**
 * Perform a SERP search via the multi-provider orchestrator. Tries each
 * eligible provider in priority order (free tiers first), returns the
 * first successful normalized `SerpResult`. Throws
 * `SerpOrchestratorAllProvidersFailed` only when every provider in the
 * chain is unavailable, quota-exhausted, or errored.
 *
 * Never throws on bad config alone — a misconfigured provider is silently
 * skipped (logged once at debug). The function only throws when there is
 * no provider left to try.
 */
export async function searchSerp(req: SerpRequest): Promise<SerpResult> {
  if (!req || typeof req.query !== "string" || req.query.trim().length === 0) {
    throw new Error("searchSerp: query is required");
  }
  await ensureHydrated();

  const engine: SerpEngine = req.engine ?? "google_web";
  const key = cacheKey(req);
  const cached = cacheGet(key);
  if (cached) {
    logCall(cached.provider, engine, req.query, 0, true, cached.organic.length + (cached.localPack?.length ?? 0));
    return { ...cached, cached: true, queryTime: 0 };
  }

  const order = PROVIDER_ORDER[engine] ?? PROVIDER_ORDER.google_web;
  const errors: Array<{ provider: string; error: string }> = [];

  for (const providerId of order) {
    const mod = PROVIDERS[providerId];
    if (!mod) continue;

    // Engine compatibility check.
    if (!mod.SUPPORTED_ENGINES.has(engine)) continue;

    // Env vars / configuration check — silent skip (debug log).
    if (!envPresentForProvider(providerId)) {
      log.debug(`[serp] ${providerId} skipped: env not configured`);
      continue;
    }

    // Quota check (Infinity for pay-as-you-go).
    const remaining = quotaRemaining(providerId, mod.MONTHLY_LIMIT);
    if (remaining <= 0) {
      log.debug(`[serp] ${providerId} skipped: monthly quota exhausted`);
      errors.push({ provider: providerId, error: "quota exhausted" });
      continue;
    }

    const started = Date.now();
    try {
      const result = await mod.call(req, REQUEST_TIMEOUT_MS);
      recordSuccess(providerId, mod.MONTHLY_LIMIT);
      cacheSet(key, result);
      const resultCount = result.organic.length + (result.localPack?.length ?? 0);
      logCall(providerId, engine, req.query, Date.now() - started, false, resultCount);
      return result;
    } catch (err: any) {
      const message = err?.message || String(err);
      const status = err?.status as number | undefined;
      if (err instanceof ProviderUnavailableError) {
        log.debug(`[serp] ${providerId} unavailable: ${message}`);
        errors.push({ provider: providerId, error: message });
        continue;
      }
      if (err instanceof QuotaExhaustedError) {
        log.warn(`[serp] ${providerId} quota exhausted at provider`);
        errors.push({ provider: providerId, error: "quota exhausted at provider" });
        recordError(providerId, mod.MONTHLY_LIMIT, "quota exhausted");
        continue;
      }
      // 429 from provider → treat as quota exhaustion for this cycle.
      if (status === 429) {
        log.warn(`[serp] ${providerId} returned 429 — falling through`);
        recordError(providerId, mod.MONTHLY_LIMIT, `429: ${message}`);
        errors.push({ provider: providerId, error: `429: ${message}` });
        continue;
      }
      // Network / 4xx / 5xx — log and fall through.
      log.warn(`[serp] ${providerId} failed (${status ?? "no-status"}: ${message.slice(0, 120)})`);
      recordError(providerId, mod.MONTHLY_LIMIT, message);
      errors.push({ provider: providerId, error: message.slice(0, 120) });
      continue;
    }
  }

  throw new SerpOrchestratorAllProvidersFailed(engine, errors);
}

/* ─── Re-exports for consumers / tests ──────────────────────────────── */

export { SerpOrchestratorAllProvidersFailed, ProviderUnavailableError, QuotaExhaustedError } from "./serpProviders/types";
export type { SerpEngine } from "./serpProviders/types";

/** Test-only: clear the in-memory cache. */
export function __resetSerpCache(): void {
  cache.clear();
}
