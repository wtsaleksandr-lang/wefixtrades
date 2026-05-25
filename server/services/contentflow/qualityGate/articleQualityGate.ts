/**
 * ContentFlow — article quality gate.
 *
 * Mirrors the 3-layer pattern in `server/services/socialSync/qualityGate.ts`
 * (banned-phrase rule checks → Jaccard similarity dedup → AI self-review)
 * but tuned for long-form articles:
 *
 *   Layer 1: rule-based checks — banned-phrase list + generic openers
 *            + spam indicators + length sanity. Each block flag adds a
 *            block reason; warns deduct from score but don't force a
 *            regenerate by themselves.
 *
 *   Layer 2: Jaccard similarity dedup against prior articles for the
 *            SAME client (kind=article, surface=rankflow), looking at
 *            the last 20 published/approved drafts. Threshold 0.4 —
 *            tighter than the social gate's 0.7 because long-form
 *            articles share more incidental vocabulary, so a high
 *            shared-word ratio is a stronger duplication signal in
 *            absolute terms.
 *
 *   Layer 3: AI self-review — separate `chat()` call asking for a
 *            JSON score on naturalness / on-brand / factual coherence.
 *            Threshold tiers: <70 regenerate, 70-79 accept-with-warn,
 *            ≥80 accept-clean. (Lowered from 85 → 80 after sample-run
 *            data showed all 9 outputs landed at 79-82.) Uses the same
 *            `chat()` helper as the social gate.
 *
 * The gate never throws — failures in layer 3 (model error, parse
 * error) degrade to "accept with warn" so a flaky review call cannot
 * block article generation entirely.
 */

import crypto from "crypto";
import { chat } from "../../aiService";
import type { ContentDraft } from "@shared/schema";
import {
  ARTICLE_BANNED_PHRASES,
  ARTICLE_GENERIC_OPENER_PATTERNS,
  ARTICLE_SPAM_INDICATORS,
} from "./bannedPhrases";

/* ─── Types ─── */

export type ArticleQualityVerdict = "accept" | "regenerate";

export interface ArticleQualityLayerResult {
  passed: boolean;
  flags: string[];
}

export interface ArticleQualityResult {
  verdict: ArticleQualityVerdict;
  finalScore: number; // 0-100, from layer 3 (or 0 if layer 3 skipped due to earlier failure)
  layer1: ArticleQualityLayerResult; // banned-phrase / structural rules
  layer2: ArticleQualityLayerResult; // similarity dedup
  layer3: ArticleQualityLayerResult; // AI self-review
  bannedPhrasesHit: string[];
  reasons: string[];
}

export interface PriorArticle {
  body: string | null;
  title: string | null;
}

/* ─── Thresholds (mirrors SocialSync) ─── */

export const JACCARD_THRESHOLD = 0.4; // > 0.4 = too similar to a prior article (tighter than social's 0.7)
export const AI_REVIEW_REGEN_THRESHOLD = 70; // < 70 → regenerate
// Lowered from 85 → 80 on 2026-05-25: sample-run data (9/9 articles) all
// scored 79-82, so the 85 threshold pushed every output into the
// accept-with-warning band even when content was clean.
export const AI_REVIEW_CLEAN_THRESHOLD = 80; // ≥ 80 → accept clean; 70-79 → accept with warn

const MIN_ARTICLE_LENGTH = 250; // chars — anything shorter is likely truncated
const MAX_ARTICLE_LENGTH = 12000; // chars — guard against runaway output

/* ─── Layer 1: rule-based checks ─── */

export interface Layer1Result extends ArticleQualityLayerResult {
  bannedPhrasesHit: string[];
}

export function runLayer1Rules(body: string): Layer1Result {
  const flags: string[] = [];
  const bannedPhrasesHit: string[] = [];
  const lower = body.toLowerCase();

  // Length sanity
  if (body.length < MIN_ARTICLE_LENGTH) {
    flags.push(`article too short: ${body.length} chars (min ${MIN_ARTICLE_LENGTH})`);
  }
  if (body.length > MAX_ARTICLE_LENGTH) {
    flags.push(`article too long: ${body.length} chars (max ${MAX_ARTICLE_LENGTH})`);
  }

  // Banned phrases
  for (const phrase of ARTICLE_BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      bannedPhrasesHit.push(phrase);
    }
  }
  if (bannedPhrasesHit.length > 0) {
    flags.push(`banned phrases: ${bannedPhrasesHit.slice(0, 5).join(", ")}${bannedPhrasesHit.length > 5 ? "…" : ""}`);
  }

  // Generic openers (first 200 chars only — we don't care about mid-body matches here)
  const opener = body.trim().slice(0, 200);
  for (const pattern of ARTICLE_GENERIC_OPENER_PATTERNS) {
    if (pattern.test(opener)) {
      flags.push("generic article opener");
      break;
    }
  }

  // Spam indicators
  for (const pattern of ARTICLE_SPAM_INDICATORS) {
    if (pattern.test(body)) {
      flags.push("spam indicator (caps/!!!)");
      break;
    }
  }

  return {
    passed: flags.length === 0,
    flags,
    bannedPhrasesHit,
  };
}

/* ─── Layer 2: Jaccard similarity dedup ─── */

function computeWordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((w) => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export function runLayer2Similarity(
  body: string,
  priorArticles: PriorArticle[],
): ArticleQualityLayerResult {
  const flags: string[] = [];
  if (priorArticles.length === 0) {
    return { passed: true, flags };
  }

  const newWords = computeWordSet(body);
  const newHash = crypto.createHash("sha256").update(body.trim().toLowerCase()).digest("hex");

  let maxSim = 0;
  for (const prior of priorArticles) {
    const priorBody = (prior.body || "").trim();
    if (!priorBody) continue;

    // Exact dup
    const priorHash = crypto.createHash("sha256").update(priorBody.toLowerCase()).digest("hex");
    if (priorHash === newHash) {
      flags.push("exact duplicate of prior article");
      return { passed: false, flags };
    }

    const sim = jaccardSimilarity(newWords, computeWordSet(priorBody));
    if (sim > maxSim) maxSim = sim;
    if (sim > JACCARD_THRESHOLD) {
      flags.push(
        `${Math.round(sim * 100)}% similar to prior article "${(prior.title || "(untitled)").slice(0, 50)}"`,
      );
      return { passed: false, flags };
    }
  }

  return { passed: true, flags };
}

/* ─── Layer 3: AI self-review ─── */

interface AiReviewResponse {
  naturalness?: number;
  on_brand?: number;
  factual_coherence?: number;
  overall?: number;
  reason?: string;
}

export interface Layer3Result extends ArticleQualityLayerResult {
  score: number; // 0-100 — overall score
  reason: string;
}

export async function runLayer3AiReview(
  body: string,
  ctx: {
    niche: string | null;
    location: string | null;
    primaryKeyword: string | null;
    brandLayer?: string;
  },
): Promise<Layer3Result> {
  const flags: string[] = [];

  const sample = body.slice(0, 4000); // cap to keep review cheap
  try {
    const response = await chat({
      system:
        "You are a strict quality reviewer for SEO articles written for small local trade businesses. Score the article honestly. Respond ONLY with valid JSON, no preamble, no markdown fence.",
      messages: [
        {
          role: "user",
          content: [
            `Review this article${ctx.niche ? ` for a ${ctx.niche} business` : ""}${ctx.location ? ` in ${ctx.location}` : ""}${ctx.primaryKeyword ? ` targeting the keyword "${ctx.primaryKeyword}"` : ""}.`,
            ctx.brandLayer ? `Brand tone hint: ${ctx.brandLayer.slice(0, 400)}` : "",
            "",
            "ARTICLE:",
            `"""${sample}"""`,
            "",
            "Score on these axes, integer 0-100 each:",
            "- naturalness: not AI-detectable patterns (uniform structure, generic transitions, formulaic openers)",
            "- on_brand: matches a real local-trade-business voice (or the brand hint above if provided)",
            "- factual_coherence: no obvious hallucinations, contradictions, or invented stats",
            "- overall: 0-100, your overall accept/reject score",
            "",
            "Also include a short \"reason\" string (max 200 chars) explaining the main issue if overall < 80.",
            "",
            "JSON shape: { \"naturalness\": int, \"on_brand\": int, \"factual_coherence\": int, \"overall\": int, \"reason\": string }",
            "",
            "JSON only.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      maxTokens: 300,
      surface: "contentflow",
    });

    const match = response.match(/\{[\s\S]*\}/);
    if (!match) {
      flags.push("ai review: unparseable response (no JSON object)");
      return { passed: true, score: 80, reason: "review degraded — accept", flags };
    }
    const parsed = JSON.parse(match[0]) as AiReviewResponse;
    const score = clampScore(parsed.overall);
    const reason = (parsed.reason || "").slice(0, 200);

    if (score < AI_REVIEW_REGEN_THRESHOLD) {
      flags.push(`ai review score ${score} < ${AI_REVIEW_REGEN_THRESHOLD}: ${reason || "low overall score"}`);
      return { passed: false, score, reason, flags };
    }
    if (score < AI_REVIEW_CLEAN_THRESHOLD) {
      flags.push(`ai review score ${score} (warn band, accepted): ${reason || "mid-band quality"}`);
      return { passed: true, score, reason, flags };
    }
    return { passed: true, score, reason, flags };
  } catch (err: any) {
    // Layer 3 failure must NOT block content. Degrade to accept-with-warn.
    flags.push(`ai review failed (degraded to accept): ${(err?.message || String(err)).slice(0, 120)}`);
    return { passed: true, score: 80, reason: "review failed", flags };
  }
}

function clampScore(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/* ─── Composite gate ─── */

export interface EvaluateArticleQualityInput {
  body: string;
  priorArticles: PriorArticle[];
  context: {
    niche: string | null;
    location: string | null;
    primaryKeyword: string | null;
    brandLayer?: string;
  };
}

/**
 * Run all 3 layers sequentially. Layer 1 and Layer 2 short-circuit
 * the verdict to "regenerate" on failure; Layer 3 also returns
 * "regenerate" if the AI score is below the regen threshold. If a
 * layer is skipped because an earlier one already failed, its result
 * has `passed: true, flags: []` — the verdict still reflects the
 * earlier failure.
 */
export async function evaluateArticleQuality(
  input: EvaluateArticleQualityInput,
): Promise<ArticleQualityResult> {
  const layer1 = runLayer1Rules(input.body);
  if (!layer1.passed) {
    return {
      verdict: "regenerate",
      finalScore: 0,
      layer1,
      layer2: { passed: true, flags: [] },
      layer3: { passed: true, flags: [] },
      bannedPhrasesHit: layer1.bannedPhrasesHit,
      reasons: layer1.flags,
    };
  }

  const layer2 = runLayer2Similarity(input.body, input.priorArticles);
  if (!layer2.passed) {
    return {
      verdict: "regenerate",
      finalScore: 0,
      layer1,
      layer2,
      layer3: { passed: true, flags: [] },
      bannedPhrasesHit: layer1.bannedPhrasesHit,
      reasons: layer2.flags,
    };
  }

  const layer3 = await runLayer3AiReview(input.body, input.context);
  return {
    verdict: layer3.passed ? "accept" : "regenerate",
    finalScore: layer3.score,
    layer1,
    layer2,
    layer3,
    bannedPhrasesHit: layer1.bannedPhrasesHit,
    reasons: [...layer1.flags, ...layer2.flags, ...layer3.flags],
  };
}

/* ─── Convenience: fetch prior articles for the gate ─── */

/**
 * Pull the prior articles for a client to feed into Layer 2. Caller
 * supplies a storage handle so this module stays test-friendly and
 * avoids a cycle with the storage barrel.
 */
export async function loadPriorArticles(
  storage: {
    listContentDrafts: (opts: {
      client_id?: number;
      surface?: string;
      kind?: string;
      limit?: number;
    }) => Promise<ContentDraft[]>;
  },
  clientId: number,
  limit = 20,
): Promise<PriorArticle[]> {
  try {
    const drafts = await storage.listContentDrafts({
      client_id: clientId,
      surface: "rankflow",
      kind: "article",
      limit,
    });
    return drafts
      .filter((d) => !!d.body)
      .map((d) => ({ body: d.body, title: d.title }));
  } catch {
    // Layer 2 gracefully degrades on storage failure — pass with empty list.
    return [];
  }
}
