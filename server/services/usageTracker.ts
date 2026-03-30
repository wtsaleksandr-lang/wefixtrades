/**
 * AI usage tracking — logs model usage, tokens, latency, and estimated cost
 * for operational monitoring and cost control.
 *
 * Token counts come from the Anthropic response `usage` field.
 * Cost estimates use published Haiku pricing as of 2025:
 *   Input:  $0.25 / 1M tokens
 *   Output: $1.25 / 1M tokens
 * Stored as micro-cents (× 1,000,000) in an integer column for precision.
 */

import { db } from "../db";
import { aiUsageLogs } from "@shared/schema";
import type { ChatSurface } from "./promptBuilder";

/* ─── Cost rates (micro-dollars per token, i.e. USD × 1,000,000) ─── */
const COST_PER_INPUT_TOKEN = 0.25;   // $0.25 per 1M input tokens
const COST_PER_OUTPUT_TOKEN = 1.25;  // $1.25 per 1M output tokens

function estimateCostMicroCents(inputTokens: number, outputTokens: number): number {
  const costUsd = (inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN) / 1_000_000;
  return Math.round(costUsd * 1_000_000); // micro-cents
}

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
}

export async function logUsage(params: UsageLogParams): Promise<void> {
  try {
    const estimatedCost = (params.inputTokens && params.outputTokens)
      ? estimateCostMicroCents(params.inputTokens, params.outputTokens)
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
    });
  } catch (err) {
    // Never let logging failures break the chat flow
    console.error("[usage] Failed to log AI usage:", err);
  }
}
