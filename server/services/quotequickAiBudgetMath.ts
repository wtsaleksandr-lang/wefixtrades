/**
 * Wave K — Pure budget math helpers for the QuoteQuick AI assistant.
 *
 * Extracted out of quotequickAiBudget.ts so unit tests can import without
 * pulling in the DB module (which throws at import time when
 * DATABASE_URL is unset).
 */

import type { AiBudgetConfigValues, AiBudgetScope } from "@shared/schemas/quotequickAiBudget";

/** Anthropic per-1M-token list prices (USD). */
export const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  // Haiku 4.5 — chat / state mutations.
  "claude-haiku-4-5-20251001": { inputPer1M: 1.0, outputPer1M: 5.0 },
  // Sonnet 4.6 — vision extraction.
  "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0 },
};

const FALLBACK_MODEL = "claude-sonnet-4-6";

export type SupportedModel = keyof typeof MODEL_PRICING;

/** Compute the USD cost of a single AI call from its token usage. */
export function costForUsage(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING[FALLBACK_MODEL];
  const input = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const output = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return Math.round((input + output) * 1_000_000) / 1_000_000;
}

/** Coarse pre-call estimate. Skews high so we under-issue rather than overspend. */
export function estimateCallCost(opts: {
  model: string;
  systemPromptTokens: number;
  historyTokens: number;
  messageTokens: number;
  hasImage: boolean;
}): number {
  const imageTokens = opts.hasImage ? 1500 : 0;
  const estInput = opts.systemPromptTokens + opts.historyTokens + opts.messageTokens + imageTokens;
  const estOutput = 800;
  return costForUsage(opts.model, estInput, estOutput);
}

/** UTC YYYY-MM-DD for the day-bucket. */
export function utcDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/* ─── Pure gate decision ─── */

export interface BudgetSnapshot {
  cumulative_usd: number;
  today_usd: number;
  images_used: number;
  config: AiBudgetConfigValues;
  scope: AiBudgetScope;
  tier: string | null;
}

export type BudgetGateDecision =
  | { allowed: true; snapshot: BudgetSnapshot; estimate_usd: number; warn: boolean }
  | {
    allowed: false;
    code: "cap_exceeded" | "daily_ceiling_exceeded" | "per_call_max_exceeded" | "image_cap_exceeded";
    snapshot: BudgetSnapshot;
    estimate_usd: number;
  };

export function gateDecision(snapshot: BudgetSnapshot, estimateUsd: number, hasImage: boolean): BudgetGateDecision {
  const { config } = snapshot;

  if (estimateUsd > config.per_call_max_usd) {
    return { allowed: false, code: "per_call_max_exceeded", snapshot, estimate_usd: estimateUsd };
  }
  if (snapshot.cumulative_usd + estimateUsd > config.cap_lifetime_usd) {
    return { allowed: false, code: "cap_exceeded", snapshot, estimate_usd: estimateUsd };
  }
  if (snapshot.today_usd + estimateUsd > config.daily_ceiling_usd) {
    return { allowed: false, code: "daily_ceiling_exceeded", snapshot, estimate_usd: estimateUsd };
  }
  if (hasImage && snapshot.images_used + 1 > config.image_lifetime_cap) {
    return { allowed: false, code: "image_cap_exceeded", snapshot, estimate_usd: estimateUsd };
  }

  const warnThreshold = (config.soft_warn_pct / 100) * config.cap_lifetime_usd;
  const warn = snapshot.cumulative_usd + estimateUsd >= warnThreshold;
  return { allowed: true, snapshot, estimate_usd: estimateUsd, warn };
}
