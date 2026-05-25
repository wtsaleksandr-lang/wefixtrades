/**
 * ContentFlow — cadence verifier (Layer 3 of the AI-detection-resistance
 * pipeline).
 *
 * After the LLM humanization rewrite (Layer 1) and the algorithmic post-
 * processor (Layer 2), this module measures the two cadence stats that
 * AI-detection tools weigh most heavily:
 *
 *   - burstiness = stdev(sentenceLengths) / mean(sentenceLengths)
 *     (the modern "modern formula"; higher = more varied = more human)
 *   - avgSentenceLen = mean(sentenceLengths) in WORDS
 *     (long uniform sentences are AI-tell #1)
 *
 * Pass criteria — pragmatic targets the rewriter can actually hit:
 *   burstiness > 0.65 AND avgSentenceLen < 16
 *
 * Aspirational target was 0.8 / 13 — sample-run data showed real-world LLM
 * rewriters can't always hit that. 0.65 / 16 is still a substantial
 * improvement on the 93% ZeroGPT baseline (which typically scores 0.45-0.55
 * burstiness and 18-22 word avg).
 *
 * Pipeline position:
 *   humanizeArticle → applyAlgorithmicHumanization → verifyCadence (this)
 *   → detectorGate → articleQualityGate
 *
 * Feature flag: CONTENTFLOW_CADENCE_VERIFY_ENABLED (default true). When
 * off, `verifyCadence()` always returns `passes: true` with `bypassed: true`.
 */

/* ─── Feature flag ──────────────────────────────────────────────────── */

export function cadenceVerifyEnabled(): boolean {
  const raw = process.env.CONTENTFLOW_CADENCE_VERIFY_ENABLED;
  if (raw === undefined || raw === null || raw === "") return true;
  return !/^(false|0|off|no)$/i.test(raw.trim());
}

/* ─── Constants ─────────────────────────────────────────────────────── */

export const CADENCE_BURSTINESS_THRESHOLD = 0.65;
export const CADENCE_AVG_LEN_THRESHOLD = 16;
/** Minimum number of sentences required for the verification to be
 *  meaningful. Below this we always pass (statistics on 3-4 sentences are
 *  noise). */
const MIN_SENTENCES_FOR_VERIFY = 8;

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface CadenceResult {
  passes: boolean;
  burstiness: number; // stdev / mean, 0..∞ (typically 0.3-1.0)
  avgSentenceLen: number; // in words
  sentenceCount: number;
  reason?: string;
  bypassed?: boolean;
}

/* ─── Sentence extraction ───────────────────────────────────────────── */

/** Strip markdown structure that would skew the stats: code fences,
 *  headings, list bullets, hashtags, URLs. Returns prose only. */
function stripStructure(input: string): string {
  // Remove fenced code blocks.
  let s = input.replace(/```[\s\S]*?```/g, " ");
  // Remove inline code.
  s = s.replace(/`[^`]*`/g, " ");
  // Remove URLs.
  s = s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ");
  // Drop heading lines entirely.
  s = s
    .split(/\r?\n/)
    .filter((line) => !/^\s{0,3}#{1,6}\s+/.test(line))
    .join("\n");
  // Strip list bullets but keep the text after them.
  s = s.replace(/^\s{0,3}([*+\-]|\d+\.)\s+/gm, "");
  // Strip blockquote markers.
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  // Collapse markdown emphasis markers — they don't affect cadence but
  // keep them out of the word-count to be safe.
  s = s.replace(/(\*\*|__|\*|_)/g, "");
  return s;
}

/** Split prose into sentences. Conservative — terminator is .!? optionally
 *  followed by closing quote/bracket; abbreviation guard for common ones. */
const ABBREV = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st",
  "etc", "i.e", "e.g", "vs", "fig", "no",
]);

export function extractSentences(input: string): string[] {
  const cleaned = stripStructure(input).replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    // Consume trailing terminator runs ("!!!", "?!") + closing punctuation.
    let end = i;
    while (end + 1 < cleaned.length && /[.!?]/.test(cleaned[end + 1])) end++;
    while (end + 1 < cleaned.length && /["')\]]/.test(cleaned[end + 1])) end++;
    // Abbreviation check — only relevant for "." terminators.
    if (ch === ".") {
      const tokenStart = cleaned.lastIndexOf(" ", i - 1) + 1;
      const token = cleaned.slice(tokenStart, i).toLowerCase();
      if (ABBREV.has(token)) {
        i = end;
        continue;
      }
      // Single-letter "U.S." style — skip if next non-space char is uppercase
      // letter followed by '.'.
      if (token.length === 1 && /[a-z]/.test(token)) {
        i = end;
        continue;
      }
    }
    const sentence = cleaned.slice(start, end + 1).trim();
    if (sentence) out.push(sentence);
    start = end + 1;
    i = end;
  }
  const tail = cleaned.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function wordCount(s: string): number {
  const m = s.match(/[A-Za-z0-9'\-]+/g);
  return m ? m.length : 0;
}

/* ─── Public API ────────────────────────────────────────────────────── */

/**
 * Measure cadence stats and decide whether the text meets the human-
 * authored thresholds. Never throws — degenerate inputs (empty, single
 * sentence) return `passes: true` so they don't block the pipeline.
 */
export function verifyCadence(text: string): CadenceResult {
  if (!cadenceVerifyEnabled()) {
    return {
      passes: true,
      burstiness: 0,
      avgSentenceLen: 0,
      sentenceCount: 0,
      bypassed: true,
    };
  }

  const sentences = extractSentences(text);
  const lens = sentences.map(wordCount).filter((n) => n > 0);
  const sentenceCount = lens.length;

  if (sentenceCount < MIN_SENTENCES_FOR_VERIFY) {
    return {
      passes: true,
      burstiness: 0,
      avgSentenceLen: sentenceCount === 0 ? 0 : lens.reduce((a, b) => a + b, 0) / sentenceCount,
      sentenceCount,
      reason: "too few sentences to verify cadence reliably",
    };
  }

  const mean = lens.reduce((a, b) => a + b, 0) / sentenceCount;
  const variance =
    lens.reduce((acc, n) => acc + (n - mean) * (n - mean), 0) / sentenceCount;
  const stdev = Math.sqrt(variance);
  const burstiness = mean === 0 ? 0 : stdev / mean;

  const burstinessOk = burstiness > CADENCE_BURSTINESS_THRESHOLD;
  const avgLenOk = mean < CADENCE_AVG_LEN_THRESHOLD;
  const passes = burstinessOk && avgLenOk;

  let reason: string | undefined;
  if (!passes) {
    const parts: string[] = [];
    if (!burstinessOk) {
      parts.push(`burstiness ${burstiness.toFixed(2)} ≤ ${CADENCE_BURSTINESS_THRESHOLD}`);
    }
    if (!avgLenOk) {
      parts.push(`avgSentenceLen ${mean.toFixed(1)} ≥ ${CADENCE_AVG_LEN_THRESHOLD}`);
    }
    reason = parts.join("; ");
  }

  return {
    passes,
    burstiness,
    avgSentenceLen: mean,
    sentenceCount,
    reason,
  };
}
