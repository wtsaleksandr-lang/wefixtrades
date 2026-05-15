/**
 * Generic AI-provider rotator.
 *
 * Tries providers in priority order. Falls through to next on:
 *   - rate-limit (429)
 *   - model-deprecation (404 / 410)
 *   - auth failure (401)
 *   - network error
 *   - circuit-breaker open
 *
 * Records which provider was used for cost attribution + observability.
 *
 * Provider priority is configurable via Doppler env vars:
 *   AI_TEXT_PROVIDERS=anthropic,openai,gemini
 *   AI_IMAGE_PROVIDERS=openai,replicate,ideogram
 *
 * If env is not set, the per-task default below is used.
 */

import { createLogger } from "../../lib/logger";

const log = createLogger("AI:Rotator");

export type ProviderName =
  // text
  | "anthropic"
  | "openai"
  | "gemini"
  // image
  | "openai-image"
  | "replicate"
  | "ideogram"
  // (video/audio rotators added in follow-ups)
  ;

export interface ProviderResult<T> {
  ok: true;
  provider: ProviderName;
  data: T;
  /** ms wall-clock time spent in the successful call */
  duration_ms: number;
}

export interface ProviderFailure {
  provider: ProviderName;
  reason: "rate_limit" | "auth" | "deprecated" | "network" | "circuit_open" | "missing_key" | "other";
  message: string;
  status?: number;
}

export type RotatorOutcome<T> =
  | ProviderResult<T>
  | { ok: false; tried: ProviderFailure[] };

export interface ProviderImpl<TInput, TOutput> {
  name: ProviderName;
  /** Returns null if this provider is not configured (missing key). */
  ready(): boolean;
  /** Throws on failure with a recognisable error shape. */
  invoke(input: TInput): Promise<TOutput>;
}

/* ─── Circuit breaker ───────────────────────────────────────────────── */

interface CircuitState {
  consecutive_failures: number;
  open_until: number | null; // unix ms
}

const CIRCUITS = new Map<ProviderName, CircuitState>();
const CIRCUIT_THRESHOLD = 5; // 5 failures in a row → open
const CIRCUIT_OPEN_MS = 30 * 1000; // open for 30s

function isCircuitOpen(p: ProviderName): boolean {
  const c = CIRCUITS.get(p);
  if (!c || c.open_until == null) return false;
  if (Date.now() >= c.open_until) {
    // half-open: reset counter, allow a try
    CIRCUITS.set(p, { consecutive_failures: 0, open_until: null });
    return false;
  }
  return true;
}

function recordSuccess(p: ProviderName): void {
  CIRCUITS.set(p, { consecutive_failures: 0, open_until: null });
}

function recordFailure(p: ProviderName): void {
  const c = CIRCUITS.get(p) ?? { consecutive_failures: 0, open_until: null };
  c.consecutive_failures++;
  if (c.consecutive_failures >= CIRCUIT_THRESHOLD) {
    c.open_until = Date.now() + CIRCUIT_OPEN_MS;
    log.warn(`Circuit OPEN for ${p}`, { open_for_ms: CIRCUIT_OPEN_MS });
  }
  CIRCUITS.set(p, c);
}

/* ─── Error classification ──────────────────────────────────────────── */

export function classifyError(err: any): ProviderFailure["reason"] {
  const status = err?.status ?? err?.response?.status ?? err?.code;
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403) return "auth";
  if (status === 404 || status === 410) return "deprecated";
  if (err?.code === "ECONNREFUSED" || err?.code === "ETIMEDOUT" || err?.code === "ENOTFOUND") return "network";
  return "other";
}

/* ─── Core rotation runner ──────────────────────────────────────────── */

export async function rotate<TInput, TOutput>(
  input: TInput,
  providers: ProviderImpl<TInput, TOutput>[],
  taskLabel: string,
): Promise<RotatorOutcome<TOutput>> {
  const tried: ProviderFailure[] = [];

  for (const provider of providers) {
    if (!provider.ready()) {
      tried.push({ provider: provider.name, reason: "missing_key", message: `${provider.name} not configured` });
      continue;
    }
    if (isCircuitOpen(provider.name)) {
      tried.push({ provider: provider.name, reason: "circuit_open", message: `${provider.name} circuit-breaker open` });
      continue;
    }

    const t0 = Date.now();
    try {
      const data = await provider.invoke(input);
      recordSuccess(provider.name);
      log.info(`[${taskLabel}] ✓ ${provider.name}`, { duration_ms: Date.now() - t0 });
      return { ok: true, provider: provider.name, data, duration_ms: Date.now() - t0 };
    } catch (err: any) {
      recordFailure(provider.name);
      const reason = classifyError(err);
      const status = err?.status ?? err?.response?.status;
      const message = err?.message ?? String(err);
      tried.push({ provider: provider.name, reason, message: message.slice(0, 300), status });
      log.warn(`[${taskLabel}] ✗ ${provider.name}: ${reason} — ${message.slice(0, 200)}`);

      // Auth failures on this provider don't retry the same call — but DO
      // try the next provider. Rate-limit/network/deprecated all fall
      // through to next provider too.
      continue;
    }
  }

  log.error(`[${taskLabel}] ALL PROVIDERS FAILED`, { tried });
  return { ok: false, tried };
}

/* ─── Provider priority resolution ──────────────────────────────────── */

export function resolveProviderOrder<T extends ProviderImpl<any, any>>(
  envVar: string,
  defaults: T[],
): T[] {
  const env = process.env[envVar];
  if (!env) return defaults;
  const desired = env.split(",").map((s) => s.trim()).filter(Boolean);
  const byName = new Map(defaults.map((p) => [p.name, p]));
  const reordered: T[] = [];
  for (const name of desired) {
    const p = byName.get(name as ProviderName);
    if (p) reordered.push(p);
  }
  // Append any defaults not in the env list (so a partial override
  // doesn't silently drop providers).
  for (const p of defaults) if (!desired.includes(p.name)) reordered.push(p);
  return reordered;
}
