import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "../lib/logger";
import { aiGateAllowed, recordAiSpend } from "./aiSystemGate";
import { logUsage } from "./usageTracker";
import { estimateCostMicroCents, rateForModel } from "./aiPricing";
import { db } from "../db";
import { aiSystemGates } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getOpenAI } from "../openaiClient";

const log = createLogger("AIService");

/* ─── Configuration ─── */
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 600;
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
/** Reliability fallback: when Anthropic exhausts retries on chat(), make ONE
 *  attempt against OpenAI gpt-4o-mini before propagating. No retry of the
 *  fallback itself — one shot, then throw. */
const OPENAI_FALLBACK_MODEL = "gpt-4o-mini";

/* ─── Circuit Breaker ─── */
const CB_FAILURE_THRESHOLD = 5;
const CB_FAILURE_WINDOW_MS = 2 * 60_000;   // 2 minutes
const CB_OPEN_DURATION_MS = 30_000;         // 30 seconds

type CircuitState = "closed" | "open" | "half_open";

let cbState: CircuitState = "closed";
let cbConsecutiveFailures = 0;
let cbFirstFailureAt = 0;
let cbOpenedAt = 0;

function recordSuccess(): void {
  if (cbState === "half_open") {
    cbState = "closed";
    log.info("Circuit breaker closed");
  }
  cbConsecutiveFailures = 0;
  cbFirstFailureAt = 0;
}

function recordFailure(): void {
  const now = Date.now();

  // If the first failure in the current window is older than 2min, reset
  if (cbFirstFailureAt > 0 && now - cbFirstFailureAt > CB_FAILURE_WINDOW_MS) {
    cbConsecutiveFailures = 0;
    cbFirstFailureAt = 0;
  }

  if (cbConsecutiveFailures === 0) {
    cbFirstFailureAt = now;
  }
  cbConsecutiveFailures++;

  if (cbState === "half_open") {
    // Probe failed — re-open
    cbState = "open";
    cbOpenedAt = now;
    log.warn("Circuit breaker opened", { reason: "half_open_probe_failed" });
    return;
  }

  if (cbState === "closed" && cbConsecutiveFailures >= CB_FAILURE_THRESHOLD) {
    cbState = "open";
    cbOpenedAt = now;
    log.warn("Circuit breaker opened", { consecutiveFailures: cbConsecutiveFailures });
  }
}

function assertCircuitAllowsRequest(): void {
  if (cbState === "closed") return;

  const now = Date.now();
  if (cbState === "open" && now - cbOpenedAt >= CB_OPEN_DURATION_MS) {
    // Transition to half-open: allow one probe request
    cbState = "half_open";
    log.info("Circuit breaker half-open, allowing probe request");
    return;
  }

  if (cbState === "open") {
    throw new Error("AI service temporarily unavailable, please try again shortly");
  }
  // half_open: allow the single probe request through
}

export function getModel(): string {
  return process.env.CLAUDE_MODEL || DEFAULT_MODEL;
}

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey, timeout: TIMEOUT_MS });
  }
  return _client;
}

/**
 * Get the shared Anthropic client instance for advanced use cases
 * (e.g. vision/multimodal) that can't go through chat().
 * Callers MUST call assertCircuitAllowsRequest() before and
 * recordSuccess()/recordFailure() after.
 */
export { assertCircuitAllowsRequest, recordSuccess, recordFailure };
export function getSharedClient(): Anthropic {
  return getClient();
}

/** Check API key is present at startup/first use */
export function validateConfig(): { valid: boolean; error?: string } {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { valid: false, error: "ANTHROPIC_API_KEY is not set" };
  }
  return { valid: true };
}

/* ─── Types ─── */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** Tool definitions to pass to the model (Anthropic tool format) */
  tools?: any[];
  /** Override the default model for this request */
  modelOverride?: string;
  /**
   * W-AX-1: which AI surface this call belongs to. When set, the call is
   * gated by `aiGateAllowed(surface)` and successful spend is recorded to
   * `ai_system_gates.monthly_spent_cents`. Also auto-logs the call to
   * `ai_usage_logs`. Surfaces must come from AI_SURFACES in aiSurfaces.ts.
   * Omitting this parameter preserves legacy behavior (no gate, no log).
   */
  surface?: string;
  /** Optional user_id for ai_usage_logs attribution. */
  userId?: number;
  /** Optional session_id for ai_usage_logs attribution. */
  sessionId?: string;
  /**
   * Optional image blocks to append to the LAST user message (multimodal).
   * Used by the mobile Ask tab to attach photos to a question. The text
   * content stays as-is; we wrap it into a content-array of
   *   [{ type: "text", text }, ...image blocks]
   * matching Anthropic's Messages API multimodal schema.
   */
  userImageBlocks?: Array<{
    mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    /** Raw bytes; will be base64-encoded into a source.data field. */
    data: Buffer;
  }>;
}

/* ─── Helpers ─── */
function mapMessages(messages: ChatMessage[], userImageBlocks?: ChatOptions["userImageBlocks"]) {
  if (!userImageBlocks?.length) {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }
  // Find the LAST user message and wrap it into a multimodal content array.
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") { lastUserIdx = i; break; }
  }
  return messages.map((m, idx) => {
    if (idx === lastUserIdx) {
      const blocks: any[] = [{ type: "text", text: m.content }];
      for (const img of userImageBlocks) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType,
            data: img.data.toString("base64"),
          },
        });
      }
      return { role: m.role, content: blocks };
    }
    return { role: m.role, content: m.content };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ─── Prompt caching helper ─── */
function buildCachedSystem(systemText: string): any {
  return [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } } as any];
}

/* ─── Pre-flight budget estimate (W-AX-3) ───
 *
 * Generalises the QuoteQuick pre-flight pattern (see
 * services/quotequickAiBudget.ts > estimateCallCost) to every surface that
 * passes `opts.surface` into chat(). The existing aiGateAllowed() check is
 * post-hoc: it stops the next call AFTER monthly_spent_cents has already
 * met the cap. That means the call that crosses the cap still runs — and
 * with Sonnet/Opus runs costing 100-1000× a Haiku call, the overshoot can
 * be material.
 *
 * The pre-flight check projects this call's cost from the (system +
 * messages) input token estimate and compares (monthly_spent + projected)
 * against monthly_budget. If it would cross, we gate-deny BEFORE the API
 * call. The post-hoc cap in aiSystemGate stays as a safety net for the
 * case where our estimate undershoots actual usage.
 *
 * Fail-open: any DB / pricing error here ALLOWS the call to proceed. The
 * post-hoc cap will still catch genuine over-budget overruns on the next
 * call. Better to let one call through than break every gated surface
 * because the gates table read failed.
 */

/** Coarse heuristic: 1 token ≈ 4 chars for English-ish prose. Skews
 *  conservative (slightly over-counts) so we under-issue rather than
 *  over-spend. Matches the rule-of-thumb used in quotequickAiBudget. */
function estimateInputTokens(systemText: string, messages: ChatMessage[]): number {
  let chars = systemText.length;
  for (const m of messages) chars += m.content.length;
  // Add a small fixed overhead per message for role markers + structural JSON.
  return Math.ceil(chars / 4) + messages.length * 4;
}

/** Project this call's cost in cents from the input-token estimate and a
 *  default-output budget. Uses the canonical rateForModel() so per-1k
 *  rates stay in sync with the post-hoc accounting. */
function estimateCallCostCents(model: string, inputTokens: number, maxOutputTokens: number): number {
  // Assume the model produces ~30% of its max output as a typical fill —
  // conservative without being absurd. (For maxTokens=600 this gives ~180
  // output tokens of projected cost.)
  const projectedOutputTokens = Math.ceil(maxOutputTokens * 0.30);
  const microCents = estimateCostMicroCents(model, inputTokens, projectedOutputTokens);
  return microCents / 10_000;
}

/** Read one row from ai_system_gates for the surface. Returns null on
 *  miss / error so the caller can fail-open. */
async function readGateBudget(surface: string): Promise<{ spent: number; cap: number | null } | null> {
  try {
    const [row] = await db
      .select({
        monthly_spent_cents: aiSystemGates.monthly_spent_cents,
        monthly_budget_cents: aiSystemGates.monthly_budget_cents,
      })
      .from(aiSystemGates)
      .where(eq(aiSystemGates.surface, surface))
      .limit(1);
    if (!row) return null;
    return {
      spent: row.monthly_spent_cents ?? 0,
      cap: row.monthly_budget_cents ?? null,
    };
  } catch (err: any) {
    log.warn("pre-flight gate read failed — fail-open", { surface, error: err?.message });
    return null;
  }
}

/* ─── Streaming chat (returns Anthropic stream, caller handles events) ─── */
export function streamChat(opts: ChatOptions) {
  assertCircuitAllowsRequest();
  const client = getClient();
  const params: Parameters<typeof client.messages.stream>[0] = {
    model: opts.modelOverride || getModel(),
    max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
    system: opts.system ? buildCachedSystem(opts.system) : (undefined as any),
    messages: mapMessages(opts.messages),
  };
  if (opts.tools?.length) (params as any).tools = opts.tools;
  return client.messages.stream(params);
}

/* ─── Non-streaming chat with retry ─── */
export async function chat(opts: ChatOptions): Promise<string> {
  // W-AX-1: gate before doing any other work. Surface-less callers retain
  // legacy behavior (ungated) so we don't break old call sites that have
  // not yet been migrated.
  if (opts.surface) {
    const gate = await aiGateAllowed(opts.surface);
    if (!gate.allowed) {
      throw new Error(gate.reason || `AI surface "${opts.surface}" is paused.`);
    }
  }

  assertCircuitAllowsRequest();
  const client = getClient();
  let lastError: Error | null = null;
  const model = opts.modelOverride || getModel();
  const tStart = Date.now();

  /* W-AX-3: pre-flight budget projection. Runs only for surface-gated
   * calls. Estimates this call's cost from the input-token heuristic and
   * compares (monthly_spent + projected) against monthly_budget. If we'd
   * cross the cap, deny BEFORE making the API call. The existing post-hoc
   * cap in aiSystemGate stays as the safety net for estimate misses. */
  if (opts.surface) {
    const budget = await readGateBudget(opts.surface);
    if (budget && budget.cap != null) {
      const inputTokens = estimateInputTokens(opts.system, opts.messages);
      const projectedCents = estimateCallCostCents(
        model,
        inputTokens,
        opts.maxTokens || DEFAULT_MAX_TOKENS,
      );
      if (budget.spent + projectedCents > budget.cap) {
        const rate = rateForModel(model);
        log.warn("pre-flight budget gate denied", {
          surface: opts.surface,
          model,
          spent_cents: budget.spent,
          cap_cents: budget.cap,
          projected_cents: Number(projectedCents.toFixed(4)),
          input_tokens_est: inputTokens,
          input_rate_per_1m: rate.input,
        });
        if (opts.surface) {
          logUsage({
            model,
            surface: opts.surface as any,
            provider: "anthropic",
            channel: "chat",
            userId: opts.userId,
            sessionId: opts.sessionId,
            latencyMs: 0,
            success: false,
            errorMessage: "pre_flight_budget_exceeded",
          }).catch(() => {});
        }
        throw new Error(
          `AI surface "${opts.surface}" would exceed its monthly budget on this call ` +
          `(projected $${(projectedCents / 100).toFixed(4)} on top of $${(budget.spent / 100).toFixed(2)} ` +
          `against a $${(budget.cap / 100).toFixed(2)} cap). Try again next month or raise the cap.`
        );
      }
    }
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const params: Parameters<typeof client.messages.create>[0] = {
        model,
        max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
        system: opts.system ? buildCachedSystem(opts.system) : (undefined as any),
        messages: mapMessages(opts.messages, opts.userImageBlocks) as any,
      };
      if (opts.tools?.length) (params as any).tools = opts.tools;
      const response = await client.messages.create(params) as Anthropic.Message;

      const usage = response.usage as any;
      if (usage?.cache_creation_input_tokens || usage?.cache_read_input_tokens) {
        log.debug("Prompt cache stats", {
          cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
          input_tokens: usage.input_tokens ?? 0,
        });
      }

      const block = response.content[0];
      recordSuccess();

      /* W-AX-1: when called with a surface, log to ai_usage_logs and
       * accumulate spend onto ai_system_gates so the gate can cap. */
      if (opts.surface) {
        const inputTokens = usage?.input_tokens ?? 0;
        const outputTokens = usage?.output_tokens ?? 0;
        logUsage({
          model,
          surface: opts.surface as any,
          provider: "anthropic",
          channel: "chat",
          userId: opts.userId,
          sessionId: opts.sessionId,
          inputTokens,
          outputTokens,
          latencyMs: Date.now() - tStart,
          success: true,
        }).catch(() => {});
        const microCents = estimateCostMicroCents(model, inputTokens, outputTokens);
        // micro-cents (× 1,000,000) → cents — divide by 10,000.
        recordAiSpend(opts.surface, microCents / 10_000).catch(() => {});
      }

      return block.type === "text" ? block.text : "";
    } catch (err: any) {
      lastError = err;
      if (err?.status === 401 || err?.status === 400) {
        if (opts.surface) {
          logUsage({
            model,
            surface: opts.surface as any,
            provider: "anthropic",
            channel: "chat",
            userId: opts.userId,
            sessionId: opts.sessionId,
            latencyMs: Date.now() - tStart,
            success: false,
            errorMessage: err?.message?.slice(0, 500),
          }).catch(() => {});
        }
        throw err;
      }
      recordFailure();
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  if (opts.surface) {
    logUsage({
      model,
      surface: opts.surface as any,
      provider: "anthropic",
      channel: "chat",
      userId: opts.userId,
      sessionId: opts.sessionId,
      latencyMs: Date.now() - tStart,
      success: false,
      errorMessage: lastError?.message?.slice(0, 500),
    }).catch(() => {});
  }

  /* Reliability fallback: Anthropic exhausted (5xx after MAX_RETRIES, or
   * other non-401/400 errors). Try ONE call to OpenAI gpt-4o-mini before
   * propagating. No retry of the fallback — one shot, then throw. */
  log.warn("anthropic-exhausted-fallback-openai", { route: "ai-chat" });
  const tFallbackStart = Date.now();
  try {
    const openai = getOpenAI();
    // Map Anthropic ↔ OpenAI: system text → system role; user/assistant turns 1:1.
    const openaiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    if (opts.system) openaiMessages.push({ role: "system", content: opts.system });
    for (const m of opts.messages) {
      openaiMessages.push({ role: m.role, content: m.content });
    }
    const completion = await openai.chat.completions.create({
      model: OPENAI_FALLBACK_MODEL,
      max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
      messages: openaiMessages,
    });
    const text = completion.choices[0]?.message?.content ?? "";

    if (opts.surface) {
      const usage = completion.usage;
      logUsage({
        model: OPENAI_FALLBACK_MODEL,
        surface: opts.surface as any,
        provider: "openai",
        channel: "chat",
        userId: opts.userId,
        sessionId: opts.sessionId,
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - tFallbackStart,
        success: true,
      }).catch(() => {});
    }
    return text;
  } catch (fallbackErr: any) {
    if (opts.surface) {
      logUsage({
        model: OPENAI_FALLBACK_MODEL,
        surface: opts.surface as any,
        provider: "openai",
        channel: "chat",
        userId: opts.userId,
        sessionId: opts.sessionId,
        latencyMs: Date.now() - tFallbackStart,
        success: false,
        errorMessage: fallbackErr?.message?.slice(0, 500),
      }).catch(() => {});
    }
    // Both providers exhausted — propagate the ORIGINAL Anthropic error.
    throw lastError || fallbackErr || new Error("Chat request failed after retries");
  }
}
