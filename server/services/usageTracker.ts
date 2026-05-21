/**
 * AI usage tracking — logs model usage, tokens, latency, and estimated cost
 * for operational monitoring and cost control.
 *
 * Token counts come from the Anthropic response `usage` field. Cost is
 * estimated per-model via aiPricing (so Sonnet/Opus calls are no longer
 * priced as Haiku) — stored as micro-cents (USD × 1,000,000) in an integer
 * column for precision.
 */

import { db } from "../db";
import { aiUsageLogs } from "@shared/schema";
import type { ChatSurface } from "./promptBuilder";
import { createLogger } from "../lib/logger";
import { estimateCostMicroCents } from "./aiPricing";

const log = createLogger("UsageTracker");

/* ─── Public API ─── */

export interface UsageLogParams {
  model: string;
  surface: ChatSurface;
  sessionId?: string;
  userId?: number;
  reportId?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  success: boolean;
  errorMessage?: string;
  /** Provider identifier (e.g. "anthropic", "vapi", "openai") */
  provider?: string;
  /** Channel/sub-surface (e.g. "chat", "voice", "voice_demo") */
  channel?: string;
  /** Extensible metadata for provider-specific fields (call_id, webhook_event, transcript_ref, etc.) */
  metadata?: Record<string, any>;
  /** W-BA-0 — UUID linking every Anthropic call inside one agent-loop run. */
  loopRunId?: string;
  /** W-BA-0 — 0-based ordinal of the call within its loop run. */
  stepIndex?: number;
}

export async function logUsage(params: UsageLogParams): Promise<void> {
  try {
    const estimatedCost = (params.inputTokens && params.outputTokens)
      ? estimateCostMicroCents(params.model, params.inputTokens, params.outputTokens)
      : null;

    await db.insert(aiUsageLogs).values({
      model: params.model,
      surface: params.surface,
      provider: params.provider || null,
      channel: params.channel || null,
      session_id: params.sessionId || null,
      user_id: params.userId || null,
      report_id: params.reportId || null,
      input_tokens: params.inputTokens ?? null,
      output_tokens: params.outputTokens ?? null,
      latency_ms: params.latencyMs ?? null,
      estimated_cost_usd: estimatedCost,
      success: params.success,
      error_message: params.errorMessage || null,
      metadata: params.metadata || null,
      loop_run_id: params.loopRunId || null,
      step_index: params.stepIndex ?? null,
    });
  } catch (err) {
    // Never let logging failures break the chat flow
    log.error("[usage] Failed to log AI usage:", { error: String(err) });
  }
}
