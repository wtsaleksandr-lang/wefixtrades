/**
 * SerpAwareGenerator — Auto-optimizer (Wave 21).
 *
 * When `scoreContent()` flags an article below the target threshold, this
 * module runs a SINGLE targeted rewrite pass via the humanization
 * orchestrator's free-tier provider rotation, then re-scores the result.
 *
 * Cost guards:
 *   - Max 1 iteration per article. Never loops.
 *   - Free-tier providers ONLY (Groq / Together / Mistral / ...). Skips paid
 *     Anthropic / OpenAI; if every free provider fails we return the
 *     original article unchanged.
 *   - Short-circuits when overall >= targetScore (no LLM call).
 *
 * Determinism: scoring is deterministic, but the rewrite is not (LLM). The
 * function returns the new score so callers know the impact.
 */

import { runPromptViaOrchestrator } from "../humanizationOrchestrator";
import { scoreContent, type ContentScore } from "./scorer";
import type { SerpBrief } from "./briefBuilder";
import { createLogger } from "../../../lib/logger";

const log = createLogger("ContentFlow:SerpAwareGenerator:AutoOptimizer");

const DEFAULT_TARGET_SCORE = 75;
const REWRITE_MAX_TOKENS = 2400;

export type AutoOptimizeResult = {
  optimized: string;
  newScore: ContentScore;
  /** True if a rewrite actually ran (LLM call made). */
  rewriteApplied: boolean;
  /** Which free-tier provider was used, "none" if everything failed. */
  providerUsed: string;
};

export async function autoOptimize(input: {
  article: string;
  brief: SerpBrief;
  score: ContentScore;
  targetScore?: number;
  clientId?: number | null;
}): Promise<AutoOptimizeResult> {
  const target = input.targetScore ?? DEFAULT_TARGET_SCORE;

  // Cost guard #1: skip the rewrite if we're already above target.
  if (input.score.overall >= target) {
    return {
      optimized: input.article,
      newScore: input.score,
      rewriteApplied: false,
      providerUsed: "none",
    };
  }

  // Build the targeted rewrite prompt.
  const { system, user } = buildRewritePrompt({
    article: input.article,
    brief: input.brief,
    score: input.score,
    target,
  });

  // Cost guard #2: free-tier providers only. No paid fallback.
  const rewrite = await runPromptViaOrchestrator({
    system,
    user,
    maxTokens: REWRITE_MAX_TOKENS,
    clientId: input.clientId ?? null,
    purpose: "serpaware.autoOptimize",
  });

  if (rewrite.noProviderSucceeded || !rewrite.text) {
    log.info(
      `auto-optimize: no free provider succeeded — keeping original (score=${input.score.overall}, target=${target})`,
    );
    return {
      optimized: input.article,
      newScore: input.score,
      rewriteApplied: false,
      providerUsed: rewrite.providerUsed,
    };
  }

  // Strip the {"body_md": "..."} envelope if the model returned it; fall
  // back to the raw text otherwise.
  const rewritten = parseRewriteOutput(rewrite.text) ?? rewrite.text;

  // Guard against the model returning a useless or truncated rewrite.
  if (rewritten.length < input.article.length * 0.5) {
    log.warn(
      `auto-optimize: rewrite looked truncated (${rewritten.length} vs ${input.article.length}) — keeping original`,
    );
    return {
      optimized: input.article,
      newScore: input.score,
      rewriteApplied: false,
      providerUsed: rewrite.providerUsed,
    };
  }

  const newScore = scoreContent(rewritten, input.brief);

  // If the rewrite somehow made things worse, drop it.
  if (newScore.overall < input.score.overall) {
    log.info(
      `auto-optimize: rewrite scored lower (${newScore.overall} < ${input.score.overall}) — keeping original`,
    );
    return {
      optimized: input.article,
      newScore: input.score,
      rewriteApplied: false,
      providerUsed: rewrite.providerUsed,
    };
  }

  log.info(
    `auto-optimize: rewrite via ${rewrite.providerUsed} ${input.score.overall} -> ${newScore.overall} (target=${target})`,
  );

  return {
    optimized: rewritten,
    newScore,
    rewriteApplied: true,
    providerUsed: rewrite.providerUsed,
  };
}

/* ─── Prompt construction ───────────────────────────────────────────── */

function buildRewritePrompt(input: {
  article: string;
  brief: SerpBrief;
  score: ContentScore;
  target: number;
}): { system: string; user: string } {
  const { article, brief, score, target } = input;

  const missingTermsList = score.missingTerms
    .slice(0, 12)
    .map(
      (t) =>
        `- "${t.term}" — currently ${t.currentCount}x, need ~${t.recommendedCount}x`,
    )
    .join("\n");

  const missingHeadingsList = score.missingHeadings
    .slice(0, 8)
    .map((h) => `- ${h}`)
    .join("\n");

  const system = [
    "You are an SEO copy editor. Your job is to take an existing article",
    "and weave in missing keywords and section topics SO IT BETTER MATCHES",
    "what's already ranking. You MUST preserve the author's voice, tone,",
    "structure, and factual claims. Do NOT add filler, padding, or generic",
    "fluff. Do NOT bloat the word count beyond the brief's target.",
    "",
    "Output JSON only, in this exact shape:",
    `{"body_md": "<the full rewritten article as markdown>"}`,
    "",
    "Output nothing else. No commentary. No code fences.",
  ].join("\n");

  const userLines: string[] = [];
  userLines.push(`Target keyword: ${brief.targetKeyword}`);
  if (brief.location) userLines.push(`Service area: ${brief.location}`);
  userLines.push(`Target word count: ${brief.avgWordCount || 800} (±15%)`);
  userLines.push(`Current SEO score: ${score.overall}/100 (target ${target})`);
  userLines.push("");

  if (missingTermsList) {
    userLines.push("Terms that competitors use but your draft is missing or under-using:");
    userLines.push(missingTermsList);
    userLines.push("");
    userLines.push(
      "Weave each term in NATURALLY at roughly the recommended frequency. Do not stuff. Do not list. Use them inside real sentences.",
    );
    userLines.push("");
  }

  if (missingHeadingsList) {
    userLines.push("Section topics competitors cover that your draft does not:");
    userLines.push(missingHeadingsList);
    userLines.push("");
    userLines.push(
      "Add a brief section (1-3 paragraphs) for each missing topic if it genuinely belongs in this article. Skip any that don't fit the angle.",
    );
    userLines.push("");
  }

  if (brief.topQuestions.length > 0) {
    userLines.push("Common questions in this SERP:");
    brief.topQuestions.slice(0, 5).forEach((q) => userLines.push(`- ${q}`));
    userLines.push("");
    userLines.push(
      "If any of these match the article's angle, consider answering them inline.",
    );
    userLines.push("");
  }

  userLines.push("--- BEGIN ORIGINAL ARTICLE ---");
  userLines.push(article);
  userLines.push("--- END ORIGINAL ARTICLE ---");
  userLines.push("");
  userLines.push(
    'Rewrite the article. Output JSON only: {"body_md": "..."}',
  );

  return { system, user: userLines.join("\n") };
}

/** Exposed for tests — strips JSON envelope so callers can validate the
 *  inner markdown. The orchestrator itself does this in autoOptimize. */
export function parseRewriteOutput(raw: string): string | null {
  const text = (raw || "").trim();
  if (!text) return null;

  // Handle code-fenced JSON or raw markdown.
  let cleaned = text;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json|markdown)?\s*/i, "").replace(/```\s*$/, "");
  }

  // Best-effort JSON parse.
  if (cleaned.startsWith("{")) {
    try {
      const obj = JSON.parse(cleaned);
      if (obj && typeof obj.body_md === "string" && obj.body_md.trim()) {
        return obj.body_md;
      }
    } catch {
      // Fall through — treat as raw markdown.
    }
  }

  return cleaned || null;
}
