/**
 * ContentFlow text-generation adapter over the AI provider rotator.
 *
 * Replaces the direct aiService.chat() calls in the ContentFlow generation
 * stages (article body, repurposer derivations, video script) so that a
 * Claude failure / rate-limit transparently falls through to OpenAI — and
 * to Gemini once a key is provisioned — instead of failing the whole
 * generation. See server/services/ai/rotator.ts for the fallback chain.
 *
 * The contract matches the single-turn shape those call sites used: a
 * system + user prompt in, the model's text out, and a throw on total
 * failure so the existing try/catch error handling is preserved unchanged.
 *
 * Default tier is "standard" → claude-haiku-4-5, the exact model
 * ContentFlow used before the rotator (aiService DEFAULT_MODEL), so this
 * is a behaviour-preserving swap, not a model change.
 */

import { generateText } from "../ai/textRotator";
import { createLogger } from "../../lib/logger";

const log = createLogger("ContentFlow:AIText");

export interface ContentflowTextInput {
  system: string;
  user: string;
  maxTokens?: number;
  /** Rotator model tier. Defaults to "standard" (Claude Haiku 4.5). */
  tier?: "premium" | "standard" | "fast";
}

/**
 * Generate text via the provider rotator. Returns the model output string.
 * Throws if every provider in the fallback chain failed.
 */
export async function generateContentflowText(input: ContentflowTextInput): Promise<string> {
  const outcome = await generateText({
    system: input.system,
    user: input.user,
    max_tokens: input.maxTokens ?? 2000,
    tier: input.tier ?? "standard",
  });

  if (!outcome.ok) {
    const summary = outcome.tried.map((t) => `${t.provider}:${t.reason}`).join(", ");
    log.error("all text providers failed", { tried: outcome.tried });
    throw new Error(`AI text generation failed — all providers exhausted (${summary})`);
  }

  log.info(`text generated via ${outcome.provider}`, { duration_ms: outcome.duration_ms });
  return outcome.data.text;
}
