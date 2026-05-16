/**
 * AI model pricing — the single source of truth for token → USD cost.
 *
 * Replaces the previous flat-Haiku estimate, which under-counted every
 * Sonnet/Opus call (Sonnet ≈ 12× Haiku input, Opus ≈ 60×). Per-model rates
 * mean ai_usage_logs.estimated_cost_usd reflects what calls actually cost.
 *
 * Rates are USD per 1M tokens — verify against current Anthropic pricing
 * and update MODEL_RATES when they change.
 */

export interface TokenRate {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

/* Matched by substring against the lowercased model id (e.g. a model id of
 * "claude-sonnet-4-6" matches "sonnet"). Order matters — first match wins. */
const MODEL_RATES: { match: string; rate: TokenRate }[] = [
  { match: "opus", rate: { input: 15, output: 75 } },
  { match: "sonnet", rate: { input: 3, output: 15 } },
  { match: "haiku", rate: { input: 0.8, output: 4 } },
];

/* Unknown models fall back to Sonnet rates — conservative, so an
 * unrecognised model is never silently under-counted. */
const DEFAULT_RATE: TokenRate = { input: 3, output: 15 };

/** Resolve the token rate for a model id. */
export function rateForModel(model: string): TokenRate {
  const m = (model || "").toLowerCase();
  for (const { match, rate } of MODEL_RATES) {
    if (m.includes(match)) return rate;
  }
  return DEFAULT_RATE;
}

/**
 * Estimate the cost of one AI call in micro-cents (USD × 1,000,000) — the
 * unit stored in ai_usage_logs.estimated_cost_usd.
 */
export function estimateCostMicroCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = rateForModel(model);
  const costUsd = (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
  return Math.round(costUsd * 1_000_000);
}
