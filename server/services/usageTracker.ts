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
import { eq } from "drizzle-orm";
import { aiUsageLogs, clients } from "@shared/schema";
import type { ChatSurface } from "./promptBuilder";
import { createLogger } from "../lib/logger";
import { estimateCostMicroCents } from "./aiPricing";
import { estimateCostCentsFromTable } from "./aiModelPricingTable";
import { incrementVariableCost } from "./clientVariableCosts";

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

    // W-BA-2 (Phase 3b §5): increment the per-client variable-cost cache so
    // the admin "Cost & Profit" view + the budget router both see fresh
    // spend on the next request. Best-effort; never block chat on it.
    if (
      params.success &&
      params.userId &&
      params.inputTokens != null &&
      params.outputTokens != null
    ) {
      await recordAiCostForUser({
        userId: params.userId,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
      });
    }
  } catch (err) {
    // Never let logging failures break the chat flow
    log.error("[usage] Failed to log AI usage:", { error: String(err) });
  }
}

/**
 * Phase 3b §5 — resolve a userId → clientId and increment
 * `client_variable_costs.ai_cost_cents_*`. Silent on failure.
 */
async function recordAiCostForUser(opts: {
  userId: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  try {
    const cents = await estimateCostCentsFromTable(opts.model, opts.inputTokens, opts.outputTokens);
    if (cents <= 0) return;
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.user_id, opts.userId))
      .limit(1);
    if (!client?.id) return;
    await incrementVariableCost({ clientId: client.id, kind: "ai", cents });
  } catch (err) {
    log.warn("recordAiCostForUser failed (non-fatal)", {
      userId: opts.userId,
      error: String(err),
    });
  }
}
