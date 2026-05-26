/**
 * ContentFlow — multi-provider humanization orchestrator.
 *
 * Rotates the humanization rewrite pass across a pool of FREE-TIER LLM
 * providers (Together AI, Groq, Mistral, Cohere, DeepSeek-via-OpenRouter,
 * Hugging Face) before falling back to the existing PAID Claude/OpenAI
 * implementation in `humanizeRewrite.ts`. Goal: drive marginal humanization
 * cost toward zero by exhausting daily free-tier quotas first.
 *
 * High-level flow per call:
 *   1. Sort enabled providers by (quota remaining DESC, qualityScore DESC).
 *   2. Try the top provider. 429 / 5xx / timeout → circuit-break for 15 min,
 *      move on.
 *   3. On a successful call, query ZeroGPT (cached) for ground-truth AI-
 *      likelihood and update the provider's qualityScore via a rolling
 *      EMA (α = 0.1).
 *   4. If every free provider fails or is exhausted, fall back to the
 *      existing PAID `humanizeArticle()` (Claude Haiku ↔ gpt-4o-mini).
 *
 * Feature flag: `CONTENTFLOW_HUMANIZATION_ORCHESTRATOR_ENABLED` (default
 * true). When false, callers should bypass this module entirely and use
 * `humanizeArticle()` directly — the wire site in `articleService.ts`
 * honors the flag.
 *
 * Doppler env vars (any missing → provider auto-disabled):
 *   TOGETHER_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, COHERE_API_KEY,
 *   OPENROUTER_API_KEY, HUGGINGFACE_API_KEY
 *
 * State: usage counters and circuit-breaker timestamps are kept in an
 * in-process Map. They are reset at midnight UTC. Multi-instance
 * deployments may briefly over-spend a provider's daily quota; the cost
 * impact is negligible since free tier overage just returns 429 → the
 * circuit-breaker fires and we move on.
 *
 * Audit: every call (success or failure) writes one row with action
 * `contentflow.humanization.provider_call`.
 */

import { createLogger } from "../../lib/logger";
import { writeAudit } from "../../lib/auditLog";
import { checkDetectorScore } from "./qualityGate/detectorGate";
import {
  buildHumanizePrompt,
  humanizeArticle,
  type HumanizeContext as PaidHumanizeContext,
  type HumanizeResult as PaidHumanizeResult,
} from "./qualityGate/humanizeRewrite";

const log = createLogger("ContentFlow:HumanizationOrchestrator");

/* ─── Public types ──────────────────────────────────────────────────── */

export type HumanizationProviderId =
  | "together"
  | "groq"
  | "mistral"
  | "cohere"
  | "deepseek"
  | "huggingface"
  | "openai"
  | "anthropic";

export interface HumanizationProvider {
  id: HumanizationProviderId;
  name: string;
  freeTierDailyLimit: number;
  freeTierMonthlyLimit?: number;
  /** Cost per call in USD. 0 for free tier. */
  costPerCall: number;
  /** 0-100. Higher = better humanization (lower ZeroGPT AI score). Updated
   *  via rolling EMA after every successful call. Seeded at 50 (neutral). */
  qualityScore: number;
  enabled: boolean;
  envVarRequired: string;
}

export interface HumanizeContext extends PaidHumanizeContext {}

export interface OrchestratorResult {
  humanized: string;
  providerUsed: string;
  aiScoreAfter?: number;
  fellBackToPaid: boolean;
}

/* ─── Feature flag ──────────────────────────────────────────────────── */

export function orchestratorEnabled(): boolean {
  const raw = process.env.CONTENTFLOW_HUMANIZATION_ORCHESTRATOR_ENABLED;
  if (raw === undefined || raw === null || raw === "") return true;
  return !/^(false|0|off|no)$/i.test(raw.trim());
}

/* ─── Provider registry ─────────────────────────────────────────────── */

/** Default per-provider daily free-tier capacities. Conservative estimates
 *  pulled from each vendor's published free-tier docs as of 2026-05.
 *  These are starting points — real quota is enforced by the provider's
 *  429 response which trips the circuit-breaker anyway. */
const PROVIDER_REGISTRY: HumanizationProvider[] = [
  {
    id: "together",
    name: "Together AI (Llama 3.1 70B)",
    freeTierDailyLimit: 60 * 24, // ~60 rpm, 24h
    costPerCall: 0,
    qualityScore: 50,
    enabled: true,
    envVarRequired: "TOGETHER_API_KEY",
  },
  {
    id: "groq",
    name: "Groq (Llama 3.3 70B)",
    freeTierDailyLimit: 14_400, // 30 rpm × 60 × 8 active hrs is a safe floor
    costPerCall: 0,
    qualityScore: 50,
    enabled: true,
    envVarRequired: "GROQ_API_KEY",
  },
  {
    id: "mistral",
    name: "Mistral (mistral-large)",
    freeTierDailyLimit: 500,
    costPerCall: 0,
    qualityScore: 50,
    enabled: true,
    envVarRequired: "MISTRAL_API_KEY",
  },
  {
    id: "cohere",
    name: "Cohere (Command R+)",
    freeTierDailyLimit: 1_000, // trial-key daily cap
    freeTierMonthlyLimit: 1_000,
    costPerCall: 0,
    qualityScore: 50,
    enabled: true,
    envVarRequired: "COHERE_API_KEY",
  },
  {
    id: "deepseek",
    name: "DeepSeek Chat (via OpenRouter)",
    freeTierDailyLimit: 200,
    costPerCall: 0,
    qualityScore: 50,
    enabled: true,
    envVarRequired: "OPENROUTER_API_KEY",
  },
  {
    id: "huggingface",
    name: "Hugging Face Inference (Llama 3.1 8B)",
    freeTierDailyLimit: 1_000,
    costPerCall: 0,
    qualityScore: 50,
    enabled: true,
    envVarRequired: "HUGGINGFACE_API_KEY",
  },
];

/** Snapshot of the registry, exported for tests and admin dashboards. */
export function getProviderRegistry(): HumanizationProvider[] {
  return PROVIDER_REGISTRY.map((p) => ({ ...p }));
}

/* ─── State: usage + circuit-breaker ────────────────────────────────── */

/** Daily usage counter — keyed `<providerId>:<UTC-yyyy-mm-dd>`. */
const usageCounters: Map<string, number> = new Map();
/** Circuit-breaker — provider id → epoch ms when the breaker re-closes. */
const circuitBreaker: Map<HumanizationProviderId, number> = new Map();

const CIRCUIT_BREAK_MS = 15 * 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const EMA_ALPHA = 0.1;
/** Min text length before we route to the orchestrator at all. Anything
 *  shorter than this falls through to the paid path's own short-input
 *  guard, but we mirror the threshold here to skip the bookkeeping. */
const MIN_INPUT_CHARS = 200;

function utcDateKey(now = new Date()): string {
  // YYYY-MM-DD in UTC.
  return now.toISOString().slice(0, 10);
}

function usageKey(id: HumanizationProviderId, date = utcDateKey()): string {
  return `${id}:${date}`;
}

function getUsage(id: HumanizationProviderId): number {
  return usageCounters.get(usageKey(id)) ?? 0;
}

function incrementUsage(id: HumanizationProviderId): void {
  const key = usageKey(id);
  usageCounters.set(key, (usageCounters.get(key) ?? 0) + 1);
}

function quotaRemaining(p: HumanizationProvider): number {
  return Math.max(0, p.freeTierDailyLimit - getUsage(p.id));
}

function isCircuitOpen(id: HumanizationProviderId): boolean {
  const until = circuitBreaker.get(id);
  if (!until) return false;
  if (Date.now() >= until) {
    circuitBreaker.delete(id);
    return false;
  }
  return true;
}

function tripCircuit(id: HumanizationProviderId): void {
  circuitBreaker.set(id, Date.now() + CIRCUIT_BREAK_MS);
}

function envKeyPresent(envVar: string): boolean {
  const v = process.env[envVar];
  return typeof v === "string" && v.trim().length > 0;
}

/** Update provider quality via rolling EMA. Higher score = better
 *  humanization. We translate aiScore → quality as `100 - aiScore`. */
function updateQualityScore(id: HumanizationProviderId, aiScore: number): void {
  if (aiScore < 0) return; // detector failed / bypassed — don't poison the EMA
  const p = PROVIDER_REGISTRY.find((x) => x.id === id);
  if (!p) return;
  const sample = Math.max(0, Math.min(100, 100 - aiScore));
  p.qualityScore = p.qualityScore * (1 - EMA_ALPHA) + sample * EMA_ALPHA;
}

/* ─── Provider selection ────────────────────────────────────────────── */

interface CandidateProvider {
  provider: HumanizationProvider;
  remaining: number;
}

function eligibleCandidates(): CandidateProvider[] {
  return PROVIDER_REGISTRY
    .filter((p) => p.enabled)
    .filter((p) => envKeyPresent(p.envVarRequired))
    .filter((p) => !isCircuitOpen(p.id))
    .map((p) => ({ provider: p, remaining: quotaRemaining(p) }))
    .filter((c) => c.remaining > 0)
    // Sort: more quota remaining first, then higher quality.
    .sort((a, b) => {
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      return b.provider.qualityScore - a.provider.qualityScore;
    });
}

/* ─── Provider implementations ──────────────────────────────────────── */

interface ProviderCallOpts {
  system: string;
  user: string;
  maxTokens: number;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAiCompatible(
  url: string,
  apiKey: string,
  model: string,
  opts: ProviderCallOpts,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err: any = new Error(`${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const json: any = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

async function callTogether(opts: ProviderCallOpts): Promise<string> {
  return callOpenAiCompatible(
    "https://api.together.xyz/v1/chat/completions",
    process.env.TOGETHER_API_KEY!,
    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    opts,
  );
}

async function callGroq(opts: ProviderCallOpts): Promise<string> {
  return callOpenAiCompatible(
    "https://api.groq.com/openai/v1/chat/completions",
    process.env.GROQ_API_KEY!,
    "llama-3.3-70b-versatile",
    opts,
  );
}

async function callMistral(opts: ProviderCallOpts): Promise<string> {
  return callOpenAiCompatible(
    "https://api.mistral.ai/v1/chat/completions",
    process.env.MISTRAL_API_KEY!,
    "mistral-large-latest",
    opts,
  );
}

async function callCohere(opts: ProviderCallOpts): Promise<string> {
  const res = await fetchWithTimeout("https://api.cohere.ai/v1/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.COHERE_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "command-r-plus",
      preamble: opts.system,
      message: opts.user,
      max_tokens: opts.maxTokens,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err: any = new Error(`${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const json: any = await res.json();
  // Cohere v1 chat returns `text` at the top level.
  return typeof json.text === "string" ? json.text : "";
}

async function callDeepseek(opts: ProviderCallOpts): Promise<string> {
  return callOpenAiCompatible(
    "https://openrouter.ai/api/v1/chat/completions",
    process.env.OPENROUTER_API_KEY!,
    "deepseek/deepseek-chat",
    opts,
    {
      // OpenRouter requires/recommends a referer + title for free-tier
      // routing and credit attribution.
      "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://wefixtrades.com",
      "X-Title": "WeFixTrades ContentFlow Humanizer",
    },
  );
}

async function callHuggingface(opts: ProviderCallOpts): Promise<string> {
  const model = "meta-llama/Meta-Llama-3.1-8B-Instruct";
  const url = `https://api-inference.huggingface.co/models/${model}`;
  // HF Inference accepts a single `inputs` prompt — we concatenate system
  // and user into a chat-style prompt with Llama-3 special tokens.
  const prompt =
    `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${opts.system}<|eot_id|>` +
    `<|start_header_id|>user<|end_header_id|>\n\n${opts.user}<|eot_id|>` +
    `<|start_header_id|>assistant<|end_header_id|>\n\n`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: opts.maxTokens,
        return_full_text: false,
        temperature: 0.9,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err: any = new Error(`${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const json: any = await res.json();
  if (Array.isArray(json) && json[0]?.generated_text) return json[0].generated_text;
  if (typeof json?.generated_text === "string") return json.generated_text;
  return "";
}

function dispatchProviderCall(
  id: HumanizationProviderId,
  opts: ProviderCallOpts,
): Promise<string> {
  switch (id) {
    case "together": return callTogether(opts);
    case "groq": return callGroq(opts);
    case "mistral": return callMistral(opts);
    case "cohere": return callCohere(opts);
    case "deepseek": return callDeepseek(opts);
    case "huggingface": return callHuggingface(opts);
    default:
      throw new Error(`dispatchProviderCall: not a free-tier provider id "${id}"`);
  }
}

/* ─── Validation of provider output ─────────────────────────────────── */

const MIN_LENGTH_RATIO = 0.75;
const MAX_OUTPUT_TOKENS = 2000;

function stripCodeFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return text;
  return t.replace(/^```(?:\w+)?\s*/i, "").replace(/```\s*$/, "");
}

/** Lightweight acceptance check — full integrity (heading count, on-topic
 *  word) is enforced by the downstream quality gate, but truncation is a
 *  fast local check that lets us fail-over to the next provider quickly. */
function looksTruncated(rewritten: string, originalLength: number): boolean {
  return rewritten.trim().length < originalLength * MIN_LENGTH_RATIO;
}

/* ─── Audit helper ──────────────────────────────────────────────────── */

function auditCall(
  ctx: HumanizeContext,
  providerId: string,
  responseTimeMs: number,
  aiScoreAfter: number | undefined,
  fellBackToPaid: boolean,
  dailyQuotaRemaining: number,
  outcome: "success" | "error" | "truncated" | "bypass",
  errorMessage?: string,
): void {
  writeAudit({
    actorType: "system",
    action: "contentflow.humanization.provider_call",
    entityType: "content_draft",
    entityId: ctx.clientId != null ? String(ctx.clientId) : "unknown",
    metadata: {
      provider_id: providerId,
      response_time_ms: responseTimeMs,
      ai_score_after: aiScoreAfter ?? null,
      fell_back_to_paid: fellBackToPaid,
      daily_quota_remaining: dailyQuotaRemaining,
      outcome,
      client_id: ctx.clientId,
      error: errorMessage ? errorMessage.slice(0, 200) : undefined,
    },
  });
}

/* ─── Paid fallback ─────────────────────────────────────────────────── */

async function fallbackToPaid(
  draft: string,
  ctx: HumanizeContext,
  startedAt: number,
): Promise<OrchestratorResult> {
  const res: PaidHumanizeResult = await humanizeArticle(draft, ctx);
  const elapsed = Date.now() - startedAt;
  auditCall(
    ctx,
    `paid:${res.provider_used}`,
    elapsed,
    undefined,
    true,
    -1, // n/a for paid
    res.fell_back_to_original ? "error" : "success",
    res.fallback_reason,
  );
  return {
    humanized: res.humanized,
    providerUsed: `paid:${res.provider_used}`,
    fellBackToPaid: true,
  };
}

/* ─── Public entry point ────────────────────────────────────────────── */

/**
 * Humanize the draft via the multi-provider orchestrator. Tries each
 * eligible free-tier provider in priority order; on a successful, non-
 * truncated response returns immediately. Falls back to the paid
 * Claude/OpenAI implementation if every free provider fails or is
 * exhausted.
 *
 * Never throws. On unrecoverable error the caller receives the ORIGINAL
 * draft and `fellBackToPaid: true` with `providerUsed: "paid:..."` or
 * `providerUsed: "none"` if even the paid path failed.
 */
export async function humanizeViaOrchestrator(
  draft: string,
  ctx: HumanizeContext,
): Promise<OrchestratorResult> {
  const startedAt = Date.now();

  // Feature flag short-circuit: behave exactly like the paid path.
  if (!orchestratorEnabled()) {
    return fallbackToPaid(draft, ctx, startedAt);
  }

  // Short / empty input — skip the rotation and let the paid path's own
  // guard return the original unchanged.
  if (!draft || draft.trim().length < MIN_INPUT_CHARS) {
    return fallbackToPaid(draft, ctx, startedAt);
  }

  const { system, user } = buildHumanizePrompt(draft, ctx);
  const callOpts: ProviderCallOpts = { system, user, maxTokens: MAX_OUTPUT_TOKENS };
  const originalLength = draft.length;

  const candidates = eligibleCandidates();
  if (candidates.length === 0) {
    log.info(
      "[orchestrator] no eligible free-tier providers (keys missing / quota exhausted / all circuit-broken) — falling back to paid",
    );
    return fallbackToPaid(draft, ctx, startedAt);
  }

  for (const { provider, remaining } of candidates) {
    const providerStartedAt = Date.now();
    let rewritten: string;
    try {
      rewritten = await dispatchProviderCall(provider.id, callOpts);
      incrementUsage(provider.id);
    } catch (err: any) {
      const elapsed = Date.now() - providerStartedAt;
      const status = err?.status as number | undefined;
      const message = err?.message || String(err);
      const transient = !status || status === 429 || status >= 500 || /abort|timeout/i.test(message);
      if (transient) tripCircuit(provider.id);
      log.warn(
        `[orchestrator] ${provider.id} failed (${status ?? "no-status"}: ${message.slice(0, 120)}) — ${transient ? "circuit-broken" : "skipped"}`,
      );
      auditCall(
        ctx,
        provider.id,
        elapsed,
        undefined,
        false,
        quotaRemaining(provider),
        "error",
        message,
      );
      continue;
    }

    const cleaned = stripCodeFence(rewritten).trim();
    if (!cleaned || looksTruncated(cleaned, originalLength)) {
      const elapsed = Date.now() - providerStartedAt;
      log.warn(
        `[orchestrator] ${provider.id} produced truncated/empty output (${cleaned.length}/${originalLength}) — trying next`,
      );
      auditCall(
        ctx,
        provider.id,
        elapsed,
        undefined,
        false,
        quotaRemaining(provider),
        "truncated",
      );
      continue;
    }

    // Successful call — score it and update the rolling EMA. Detector
    // failures soft-pass (aiScore = -1) and we skip the EMA update.
    const detector = await checkDetectorScore(cleaned).catch(() => null);
    const aiScore = detector?.aiScore ?? -1;
    updateQualityScore(provider.id, aiScore);
    const elapsed = Date.now() - providerStartedAt;
    log.info(
      `[orchestrator] ✓ ${provider.id} accepted (${originalLength}→${cleaned.length} chars, ai_score=${aiScore}, remaining=${remaining - 1})`,
    );
    auditCall(
      ctx,
      provider.id,
      elapsed,
      aiScore >= 0 ? aiScore : undefined,
      false,
      quotaRemaining(provider),
      "success",
    );
    return {
      humanized: cleaned,
      providerUsed: provider.id,
      aiScoreAfter: aiScore >= 0 ? aiScore : undefined,
      fellBackToPaid: false,
    };
  }

  // Every free-tier candidate exhausted without producing a usable
  // rewrite. Fall back to the paid implementation.
  log.info(
    `[orchestrator] all ${candidates.length} free providers failed for client ${ctx.clientId} — falling back to paid`,
  );
  return fallbackToPaid(draft, ctx, startedAt);
}

/* ─── Generic prompt runner (Wave 21) ───────────────────────────────── */

export interface GenericPromptResult {
  /** Trimmed text returned by the first successful free-tier provider, or
   *  empty string if every provider failed. Callers MUST treat empty as
   *  "no rewrite happened". */
  text: string;
  providerUsed: string;
  fellBackToPaid: boolean;
  /** True if every free-tier provider failed AND no paid fallback was
   *  attempted (the generic runner DOES NOT call paid by default — caller
   *  decides). */
  noProviderSucceeded: boolean;
}

/**
 * Run an arbitrary system/user prompt through the free-tier provider
 * rotation. Used by SerpAwareGenerator's auto-optimizer (Wave 21) for a
 * targeted SEO rewrite pass — the humanization-specific prompt that
 * `humanizeViaOrchestrator` bakes in is not appropriate there.
 *
 * Behavior:
 *   - Iterates eligible free-tier providers in priority order.
 *   - On 429 / 5xx / timeout, trips the same circuit-breaker that
 *     `humanizeViaOrchestrator` uses, then moves on.
 *   - Truncation is NOT enforced here (the caller may legitimately want a
 *     shorter output, e.g. a heading rewrite). The caller validates.
 *   - Does NOT fall back to the paid path. If every free provider fails
 *     the caller receives `noProviderSucceeded=true` and can decide.
 *
 * Audit: writes one row per attempt with action
 * `contentflow.serpaware.provider_call` so spend tracking can attribute.
 */
export async function runPromptViaOrchestrator(input: {
  system: string;
  user: string;
  maxTokens?: number;
  clientId?: number | null;
  /** Free-form label written to audit. e.g. "serpaware.autoOptimize". */
  purpose?: string;
}): Promise<GenericPromptResult> {
  const callOpts: ProviderCallOpts = {
    system: input.system,
    user: input.user,
    maxTokens: input.maxTokens ?? MAX_OUTPUT_TOKENS,
  };

  if (!orchestratorEnabled()) {
    return {
      text: "",
      providerUsed: "none",
      fellBackToPaid: false,
      noProviderSucceeded: true,
    };
  }

  const candidates = eligibleCandidates();
  if (candidates.length === 0) {
    return {
      text: "",
      providerUsed: "none",
      fellBackToPaid: false,
      noProviderSucceeded: true,
    };
  }

  for (const { provider } of candidates) {
    const startedAt = Date.now();
    let raw: string;
    try {
      raw = await dispatchProviderCall(provider.id, callOpts);
      incrementUsage(provider.id);
    } catch (err: any) {
      const elapsed = Date.now() - startedAt;
      const status = err?.status as number | undefined;
      const message = err?.message || String(err);
      const transient =
        !status || status === 429 || status >= 500 || /abort|timeout/i.test(message);
      if (transient) tripCircuit(provider.id);
      writeAudit({
        actorType: "system",
        action: "contentflow.serpaware.provider_call",
        entityType: "content_draft",
        entityId: input.clientId != null ? String(input.clientId) : "unknown",
        metadata: {
          provider_id: provider.id,
          purpose: input.purpose ?? "generic",
          response_time_ms: elapsed,
          outcome: "error",
          error: message.slice(0, 200),
          status: status ?? null,
        },
      });
      continue;
    }

    const cleaned = stripCodeFence(raw).trim();
    const elapsed = Date.now() - startedAt;
    writeAudit({
      actorType: "system",
      action: "contentflow.serpaware.provider_call",
      entityType: "content_draft",
      entityId: input.clientId != null ? String(input.clientId) : "unknown",
      metadata: {
        provider_id: provider.id,
        purpose: input.purpose ?? "generic",
        response_time_ms: elapsed,
        outcome: cleaned ? "success" : "empty",
        output_length: cleaned.length,
      },
    });

    if (cleaned.length > 0) {
      return {
        text: cleaned,
        providerUsed: provider.id,
        fellBackToPaid: false,
        noProviderSucceeded: false,
      };
    }
    // Empty output — try next provider.
  }

  return {
    text: "",
    providerUsed: "none",
    fellBackToPaid: false,
    noProviderSucceeded: true,
  };
}

/* ─── Test / admin helpers ──────────────────────────────────────────── */

/** Reset in-process state. Exposed for tests only. */
export function __resetOrchestratorState(): void {
  usageCounters.clear();
  circuitBreaker.clear();
  for (const p of PROVIDER_REGISTRY) p.qualityScore = 50;
}
