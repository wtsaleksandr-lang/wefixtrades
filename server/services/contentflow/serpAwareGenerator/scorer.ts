/**
 * SerpAwareGenerator — Content scorer (Wave 21).
 *
 * Pure-JS scoring of a generated article against a SerpBrief. Fast (<50ms
 * for a typical article), deterministic (same input → same score, no LLM
 * calls), and bounded 0-100 across four sub-scores:
 *
 *   - wordCount        : how close the article is to brief.avgWordCount
 *   - keywordCoverage  : % of must-include terms hit at recommended frequency
 *   - headingStructure : how many common heading patterns the article echoes
 *   - readability      : Flesch Reading Ease bucketed into a 0-100 score
 *
 * Overall is a weighted sum (50/25/15/10). Tuned so a competent draft
 * lands ~70-85 and a brief-aware optimized rewrite lands 80-95.
 */

import type { SerpBrief, SerpBriefTerm } from "./briefBuilder";

export type ContentScoreBreakdown = {
  wordCount: number;
  keywordCoverage: number;
  headingStructure: number;
  readability: number;
};

export type ContentScore = {
  overall: number;
  breakdown: ContentScoreBreakdown;
  missingTerms: Array<{
    term: string;
    recommendedCount: number;
    currentCount: number;
  }>;
  missingHeadings: string[];
};

const WEIGHTS = {
  wordCount: 0.5,        // most-important: serps reward right length
  keywordCoverage: 0.25,
  headingStructure: 0.15,
  readability: 0.1,
};

/**
 * Score an article body (markdown or plain text) against a SerpBrief.
 * Pure: no I/O. Same inputs → same outputs.
 */
export function scoreContent(article: string, brief: SerpBrief): ContentScore {
  const text = (article || "").trim();
  if (!text) {
    return {
      overall: 0,
      breakdown: { wordCount: 0, keywordCoverage: 0, headingStructure: 0, readability: 0 },
      missingTerms: brief.nlpTerms.map((t) => ({
        term: t.term,
        recommendedCount: t.recommendedCount,
        currentCount: 0,
      })),
      missingHeadings: brief.commonHeadingPatterns.slice(),
    };
  }

  const wordCount = countWords(text);
  const wordCountScore = scoreWordCount(wordCount, brief.avgWordCount);

  const { keywordCoverageScore, missingTerms } = scoreKeywordCoverage(
    text,
    brief.nlpTerms,
  );

  const articleHeadings = extractMarkdownHeadings(text);
  const { headingStructureScore, missingHeadings } = scoreHeadingStructure(
    articleHeadings,
    brief.commonHeadingPatterns,
  );

  const readabilityScore = scoreReadability(text);

  const overall = Math.round(
    wordCountScore * WEIGHTS.wordCount +
      keywordCoverageScore * WEIGHTS.keywordCoverage +
      headingStructureScore * WEIGHTS.headingStructure +
      readabilityScore * WEIGHTS.readability,
  );

  return {
    overall: clamp(overall, 0, 100),
    breakdown: {
      wordCount: wordCountScore,
      keywordCoverage: keywordCoverageScore,
      headingStructure: headingStructureScore,
      readability: readabilityScore,
    },
    missingTerms,
    missingHeadings,
  };
}

/* ─── Sub-scorers ───────────────────────────────────────────────────── */

function scoreWordCount(actual: number, target: number): number {
  if (!target || target <= 0) {
    // No competitor signal — give a flat pass if we have any content.
    return actual > 200 ? 80 : 40;
  }
  if (actual <= 0) return 0;
  const ratio = actual / target;
  // 100 within ±15%, falling off linearly to 0 at 0× or 2.5×.
  if (ratio >= 0.85 && ratio <= 1.15) return 100;
  if (ratio < 0.85) {
    // 0 → 0, 0.85 → 100
    return clamp(Math.round((ratio / 0.85) * 100), 0, 100);
  }
  // 1.15 → 100, 2.5 → 0 (over-long is penalized)
  const overShoot = (ratio - 1.15) / (2.5 - 1.15);
  return clamp(Math.round(100 - overShoot * 100), 0, 100);
}

function scoreKeywordCoverage(
  text: string,
  terms: SerpBriefTerm[],
): {
  keywordCoverageScore: number;
  missingTerms: ContentScore["missingTerms"];
} {
  if (terms.length === 0) {
    return { keywordCoverageScore: 100, missingTerms: [] };
  }
  const lower = text.toLowerCase();
  let hitWeight = 0;
  let totalWeight = 0;
  const missing: ContentScore["missingTerms"] = [];

  for (const t of terms) {
    const occurrences = countOccurrences(lower, t.term.toLowerCase());
    const need = Math.max(1, t.recommendedCount);
    const ratio = Math.min(1, occurrences / need);

    // Weight by document-frequency: high-DF terms matter more.
    const weight = 0.5 + t.frequency; // 1.0..1.5 range typically
    hitWeight += ratio * weight;
    totalWeight += weight;

    if (occurrences < need) {
      missing.push({
        term: t.term,
        recommendedCount: need,
        currentCount: occurrences,
      });
    }
  }

  const score =
    totalWeight === 0 ? 100 : Math.round((hitWeight / totalWeight) * 100);

  // Cap missingTerms list at 20 — anything beyond is noise.
  return {
    keywordCoverageScore: clamp(score, 0, 100),
    missingTerms: missing.slice(0, 20),
  };
}

function scoreHeadingStructure(
  articleHeadings: string[],
  competitorPatterns: string[],
): { headingStructureScore: number; missingHeadings: string[] } {
  if (competitorPatterns.length === 0) {
    return { headingStructureScore: 100, missingHeadings: [] };
  }
  const norm = articleHeadings.map(normalize);
  let hits = 0;
  const missing: string[] = [];

  for (const pattern of competitorPatterns) {
    const patternNorm = normalize(pattern);
    const matched = norm.some(
      (h) => h.includes(patternNorm) || patternNorm.includes(h),
    );
    if (matched) hits++;
    else missing.push(pattern);
  }

  const score = Math.round((hits / competitorPatterns.length) * 100);
  return {
    headingStructureScore: clamp(score, 0, 100),
    missingHeadings: missing.slice(0, 10),
  };
}

/**
 * Flesch Reading Ease, bucketed into a 0-100 web-content score.
 * - 60-80 (plain English) → 100
 * - 50-60 or 80-90        → 85
 * - 30-50 or 90-100       → 70
 * - <30 (very hard)       → 40
 * - >100                  → 70 (childlike but OK for some topics)
 */
function scoreReadability(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.match(/[A-Za-z]+/g) ?? [];
  if (sentences.length === 0 || words.length === 0) return 50;

  let syllables = 0;
  for (const w of words) syllables += estimateSyllables(w);

  const wps = words.length / sentences.length;
  const spw = syllables / words.length;
  const flesch = 206.835 - 1.015 * wps - 84.6 * spw;

  if (flesch >= 60 && flesch <= 80) return 100;
  if ((flesch >= 50 && flesch < 60) || (flesch > 80 && flesch <= 90)) return 85;
  if ((flesch >= 30 && flesch < 50) || (flesch > 90 && flesch <= 100)) return 70;
  if (flesch > 100) return 70;
  return 40;
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function countWords(text: string): number {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  // Whole-phrase match with word boundaries. Escape regex metachars.
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${esc}\\b`, "g");
  const matches = haystack.match(re);
  return matches ? matches.length : 0;
}

function extractMarkdownHeadings(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cheap syllable estimator. Deterministic, no external dep.
 * Counts vowel groups; silent-e drop; minimum 1.
 */
function estimateSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;

  let stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  stripped = stripped.replace(/^y/, "");
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}
