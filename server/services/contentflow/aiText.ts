/**
 * ContentFlow text-generation adapter over the AI provider rotator.
 *
 * Replaces the direct aiService.chat() calls in the ContentFlow generation
 * stages (article body, repurposer derivations, video script) so that a
 * Claude failure / rate-limit transparently falls through to OpenAI — and
 * to Gemini once a key is provisioned — instead of failing the whole
 * generation. See server/services/ai/rotator.ts for the fallback chain.
 *
 * The model tier defaults to the admin-configured ContentFlow setting
 * (Standard = Claude Haiku, Premium = Claude Sonnet). Each call also
 * returns an estimated cost so callers can record it for the spend cap.
 *
 * Returns the model text + cost; throws on total failure so the existing
 * try/catch error handling at the call sites is preserved unchanged.
 */

import { generateText } from "../ai/textRotator";
import { checkContentflowGate, getContentflowTextTier } from "./contentflowGate";
import { createLogger } from "../../lib/logger";

const log = createLogger("ContentFlow:AIText");

export interface ContentflowTextInput {
  system: string;
  user: string;
  maxTokens?: number;
  /** Rotator model tier. When omitted, the admin-configured tier is used. */
  tier?: "premium" | "standard" | "fast";
}

export interface ContentflowTextResult {
  text: string;
  /** Estimated cost of this call in micro-USD (USD × 1,000,000). */
  costMicroUsd: number;
  /** Provider that actually served the request. */
  provider: string;
}

/* Approximate prices in micro-USD per token, keyed by `${provider}:${tier}`.
 * Numerically equal to the public USD-per-million-tokens rate. These feed
 * the monthly spend cap — a safety limit, so approximate is fine. */
const PRICE_MICRO_PER_TOKEN: Record<string, { in: number; out: number }> = {
  "anthropic:standard": { in: 0.8, out: 4 },
  "anthropic:premium": { in: 3, out: 15 },
  "anthropic:fast": { in: 0.8, out: 4 },
  "openai:standard": { in: 2, out: 8 },
  "openai:premium": { in: 2.5, out: 10 },
  "openai:fast": { in: 0.15, out: 0.6 },
  "gemini:standard": { in: 1.25, out: 5 },
  "gemini:premium": { in: 1.25, out: 5 },
  "gemini:fast": { in: 0.3, out: 1.2 },
};

function estimateCostMicroUsd(
  provider: string,
  tier: string,
  data: { text: string; usage?: { input_tokens?: number; output_tokens?: number } },
  input: ContentflowTextInput,
): number {
  const price = PRICE_MICRO_PER_TOKEN[`${provider}:${tier}`] ?? PRICE_MICRO_PER_TOKEN["anthropic:standard"];
  let inTok = data.usage?.input_tokens;
  let outTok = data.usage?.output_tokens;
  // Fall back to a chars/4 estimate when a provider omits usage stats.
  if (inTok == null) inTok = Math.ceil(((input.system?.length ?? 0) + input.user.length) / 4);
  if (outTok == null) outTok = Math.ceil((data.text?.length ?? 0) / 4);
  return Math.round(inTok * price.in + outTok * price.out);
}

/**
 * Generate text via the provider rotator. Returns the model output plus an
 * estimated cost. Throws if every provider in the fallback chain failed.
 */
export async function generateContentflowText(input: ContentflowTextInput): Promise<ContentflowTextResult> {
  // Product-level gate: kill switch + monthly spend cap.
  const gate = await checkContentflowGate();
  if (!gate.allowed) {
    throw new Error(gate.reason || "ContentFlow generation is currently paused");
  }
  const tier = input.tier ?? (await getContentflowTextTier());
  const outcome = await generateText({
    system: input.system,
    user: input.user,
    max_tokens: input.maxTokens ?? 2000,
    tier,
  });

  if (!outcome.ok) {
    const summary = outcome.tried.map((t) => `${t.provider}:${t.reason}`).join(", ");
    log.error("all text providers failed", { tried: outcome.tried });
    throw new Error(`AI text generation failed — all providers exhausted (${summary})`);
  }

  const costMicroUsd = estimateCostMicroUsd(outcome.provider, tier, outcome.data, input);
  log.info(`text generated via ${outcome.provider}`, { duration_ms: outcome.duration_ms, tier, costMicroUsd });
  return { text: outcome.data.text, costMicroUsd, provider: outcome.provider };
}
