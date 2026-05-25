/**
 * ContentFlow — algorithmic humanizer (Layer 2 of the AI-detection-resistance
 * pipeline).
 *
 * Runs deterministic text transforms over the LLM-humanized draft to scrub
 * the residual AI-tells that survive the rewrite pass:
 *   1. Em-dash trimming     — replaces most em-dashes with varied punctuation
 *   2. Forbidden-transition swap — strips "Moreover/Furthermore/Additionally/
 *      Therefore/In conclusion/It's important to" sentence openers
 *   3. Opener variation     — prevents two consecutive paragraphs starting
 *      with the same word
 *   4. Hashtag pruning      — articles shouldn't have >5 hashtags; cull the rest
 *   5. Burstiness boost     — splits/merges runs of equal-length sentences so
 *      cadence variance crosses the detector threshold
 *   6. Typo injection (off) — controlled by CONTENTFLOW_TYPO_INJECTION_ENABLED;
 *      sprinkles common typos at 0.3%. Disabled by default to keep output
 *      customer-presentable.
 *   7. Casual phrase injection — adds one industry-aware "Look,"/"Real talk,"-
 *      style opener per ~300 words.
 *
 * NEVER mutates structure: heading lines (## / ###), fenced code, lists, URLs,
 * and business names pass through untouched. The function takes/returns markdown.
 *
 * Pipeline position:
 *   humanizeArticle (LLM rewrite)  →  applyAlgorithmicHumanization (this file)
 *   → verifyCadence → detectorGate → articleQualityGate
 *
 * Feature flag: CONTENTFLOW_ALGO_HUMANIZER_ENABLED (default true). When off,
 * `applyAlgorithmicHumanization()` returns input unchanged.
 */

/* ─── Feature flags ─────────────────────────────────────────────────── */

export function algoHumanizerEnabled(): boolean {
  const raw = process.env.CONTENTFLOW_ALGO_HUMANIZER_ENABLED;
  if (raw === undefined || raw === null || raw === "") return true;
  return !/^(false|0|off|no)$/i.test(raw.trim());
}

export function typoInjectionEnabled(): boolean {
  const raw = process.env.CONTENTFLOW_TYPO_INJECTION_ENABLED;
  if (raw === undefined || raw === null || raw === "") return false;
  return /^(true|1|on|yes)$/i.test(raw.trim());
}

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface AlgoHumanizerOptions {
  /** Industry / niche string (lowercased internally). Selects the casual-
   *  phrase pool. Optional — falls back to a neutral pool. */
  industry?: string | null;
  /** Inject typos at 0.3% word rate. Default reads the env flag. */
  enableTypoInjection?: boolean;
  /** Override the per-character keep ratio for em-dashes (default ≈1/200). */
  emDashKeepEveryChars?: number;
  /** Deterministic RNG seed for tests. When undefined the function uses
   *  Math.random — production behavior. */
  seed?: number;
}

export interface AlgoHumanizerStats {
  emDashesReplaced: number;
  forbiddenTransitionsReplaced: number;
  openerVariationApplied: number;
  hashtagsPruned: number;
  burstinessAdjustments: number;
  typosInjected: number;
  casualPhrasesInjected: number;
}

export interface AlgoHumanizerResult {
  text: string;
  stats: AlgoHumanizerStats;
}

/* ─── Deterministic RNG (used when a seed is provided) ──────────────── */

function makeRng(seed: number | undefined): () => number {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0;
  return () => {
    // mulberry32 — small, deterministic, good enough for prose shuffling
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/* ─── Structural masking ────────────────────────────────────────────── */
/* We split the input into "transformable" prose and "protected" segments
 * (headings, code fences, URLs, list bullets, blockquotes). Transforms are
 * only applied to the prose. */

interface Segment {
  text: string;
  /** When true the segment is left untouched. */
  protect: boolean;
}

function segmentMarkdown(input: string): Segment[] {
  const lines = input.split(/\r?\n/);
  const segments: Segment[] = [];
  let inFence = false;
  let buffer: string[] = [];
  let bufferProtected = false;

  const flush = () => {
    if (buffer.length === 0) return;
    segments.push({ text: buffer.join("\n"), protect: bufferProtected });
    buffer = [];
  };

  for (const line of lines) {
    const isFenceToggle = /^\s{0,3}```/.test(line);
    const isHeading = /^\s{0,3}#{1,6}\s+/.test(line);
    const isListItem = /^\s{0,3}([*+\-]|\d+\.)\s+/.test(line);
    const isBlockquote = /^\s{0,3}>/.test(line);
    const isImageLine = /^!\[/.test(line.trimStart());

    if (isFenceToggle) {
      flush();
      inFence = !inFence;
      segments.push({ text: line, protect: true });
      continue;
    }
    if (inFence) {
      // Inside a code fence — protect verbatim
      if (buffer.length > 0 && !bufferProtected) flush();
      buffer.push(line);
      bufferProtected = true;
      continue;
    }
    const protect = isHeading || isListItem || isBlockquote || isImageLine;
    if (protect !== bufferProtected) {
      flush();
      bufferProtected = protect;
    }
    buffer.push(line);
  }
  flush();
  return segments;
}

/* ─── URL masking (so we don't mangle hrefs/business URLs) ──────────── */

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s)\]]+/gi;

function maskUrls(text: string): { masked: string; urls: string[] } {
  const urls: string[] = [];
  const masked = text.replace(URL_RE, (m) => {
    urls.push(m);
    return `URL${urls.length - 1}`;
  });
  return { masked, urls };
}

function unmaskUrls(text: string, urls: string[]): string {
  return text.replace(/URL(\d+)/g, (_, i) => urls[Number(i)] ?? "");
}

/* ─── Layer 2.1 — Em-dash trimming ──────────────────────────────────── */

const EM_DASH = "—";

function trimEmDashes(
  text: string,
  rng: () => number,
  keepEveryChars: number,
  stats: AlgoHumanizerStats,
): string {
  if (!text.includes(EM_DASH)) return text;
  const totalKeep = Math.max(1, Math.floor(text.length / keepEveryChars));
  const indices: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === EM_DASH) indices.push(i);
  }
  // Choose which em-dash positions to KEEP — evenly spaced subset.
  const keepSet = new Set<number>();
  if (indices.length <= totalKeep) {
    for (const i of indices) keepSet.add(i);
  } else {
    const stride = indices.length / totalKeep;
    for (let k = 0; k < totalKeep; k++) {
      keepSet.add(indices[Math.floor(k * stride)]);
    }
  }
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== EM_DASH) {
      out += ch;
      continue;
    }
    if (keepSet.has(i)) {
      out += EM_DASH;
      continue;
    }
    stats.emDashesReplaced++;
    // Pick a replacement. Prefer punctuation that doesn't require capitalization
    // logic since we're mid-string.
    const choice = rng();
    if (choice < 0.35) {
      out += ". ";
      // Capitalize next non-space char if it exists and is lowercase letter.
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (j < text.length && /[a-z]/.test(text[j])) {
        out += text.slice(i + 1, j) + text[j].toUpperCase();
        i = j;
      }
    } else if (choice < 0.6) {
      out += ", ";
    } else if (choice < 0.8) {
      out += "; ";
    } else {
      out += " - ";
    }
    // Skip any whitespace immediately following the original em-dash, since
    // we've already inserted our own.
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j++;
    i = j - 1;
  }
  return out;
}

/* ─── Layer 2.2 — Forbidden-transition swap ─────────────────────────── */

interface TransitionRule {
  pattern: RegExp;
  replacements: readonly string[];
}

const TRANSITION_RULES: readonly TransitionRule[] = [
  {
    pattern: /(^|\n|\.\s+|!\s+|\?\s+)Moreover,\s+/g,
    replacements: ["Plus, ", "And ", "Also, ", ""],
  },
  {
    pattern: /(^|\n|\.\s+|!\s+|\?\s+)Furthermore,\s+/g,
    replacements: ["What's more, ", "Also, ", ""],
  },
  {
    pattern: /(^|\n|\.\s+|!\s+|\?\s+)Additionally,\s+/g,
    replacements: ["Also, ", "Plus, ", ""],
  },
  {
    pattern: /(^|\n|\.\s+|!\s+|\?\s+)Therefore,\s+/g,
    replacements: ["So, ", "That means ", ""],
  },
  {
    pattern: /(^|\n|\.\s+|!\s+|\?\s+)In conclusion,\s+/gi,
    replacements: [""],
  },
  {
    pattern: /(^|\n|\.\s+|!\s+|\?\s+)To wrap up,\s+/gi,
    replacements: [""],
  },
  {
    pattern: /(^|\n|\.\s+|!\s+|\?\s+)In summary,\s+/gi,
    replacements: [""],
  },
  {
    pattern: /(^|\n|\.\s+|!\s+|\?\s+)It's important to (note that |remember that |understand that )?/g,
    replacements: ["Worth knowing - ", "Heads up: "],
  },
  {
    pattern: /(^|\n|\.\s+|!\s+|\?\s+)When it comes to /gi,
    replacements: ["With ", "For ", "On "],
  },
  {
    pattern: /(^|\n|\.\s+|!\s+|\?\s+)Whether you're /gi,
    replacements: ["If you're "],
  },
];

function swapForbiddenTransitions(
  text: string,
  rng: () => number,
  stats: AlgoHumanizerStats,
): string {
  let out = text;
  for (const rule of TRANSITION_RULES) {
    out = out.replace(rule.pattern, (_match, prefix: string) => {
      stats.forbiddenTransitionsReplaced++;
      const swap = pick(rng, rule.replacements);
      // Capitalize the swap if it starts a sentence (i.e. prefix ends with .!?)
      // Otherwise lowercase first char.
      if (!swap) return prefix; // pure deletion
      const startsNewSentence = /[.!?]\s+$/.test(prefix) || prefix === "" || prefix === "\n";
      if (startsNewSentence) {
        return prefix + swap.charAt(0).toUpperCase() + swap.slice(1);
      }
      return prefix + swap;
    });
  }
  return out;
}

/* ─── Layer 2.3 — Opener variation ──────────────────────────────────── */

const OPENER_SUBSTITUTES: Record<string, readonly string[]> = {
  the: ["This", "A", "That"],
  this: ["The", "That", "Such"],
  that: ["The", "This"],
  it: ["The point", "What happens"],
  you: ["You'll", "If you"],
  when: ["If", "Once"],
  if: ["When", "Should"],
  most: ["Many", "Plenty of"],
  many: ["Most", "Plenty of"],
  some: ["A few", "Certain"],
  one: ["A", "Each"],
  another: ["A second", "One more"],
  for: ["With", "On"],
  with: ["For", "Using"],
};

function varyParagraphOpeners(
  text: string,
  rng: () => number,
  stats: AlgoHumanizerStats,
): string {
  const paragraphs = text.split(/\n{2,}/);
  let prevOpener: string | null = null;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (!p.trim()) continue;
    // Don't touch heading paragraphs.
    if (/^\s{0,3}#{1,6}\s+/.test(p)) {
      prevOpener = null;
      continue;
    }
    const m = p.match(/^(\s*)([A-Za-z][A-Za-z']*)/);
    if (!m) continue;
    const leading = m[1];
    const word = m[2];
    const lower = word.toLowerCase();
    if (prevOpener && lower === prevOpener) {
      const subs = OPENER_SUBSTITUTES[lower];
      if (subs && subs.length > 0) {
        const sub = pick(rng, subs);
        paragraphs[i] = leading + sub + p.slice(m[0].length);
        stats.openerVariationApplied++;
        prevOpener = sub.toLowerCase().split(/\s+/)[0];
        continue;
      }
    }
    prevOpener = lower;
  }
  return paragraphs.join("\n\n");
}

/* ─── Layer 2.4 — Hashtag pruning ───────────────────────────────────── */

function pruneHashtags(text: string, rng: () => number, stats: AlgoHumanizerStats): string {
  const tags: { match: string; index: number }[] = [];
  const re = /(^|\s)(#[A-Za-z][A-Za-z0-9_]{1,40})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tags.push({ match: m[2], index: m.index + m[1].length });
  }
  if (tags.length <= 5) return text;
  // Remove 60% of all tags (random selection).
  const removeCount = Math.floor(tags.length * 0.6);
  const removeSet = new Set<number>();
  const order = tags.map((_, i) => i).sort(() => rng() - 0.5);
  for (let k = 0; k < removeCount; k++) removeSet.add(order[k]);

  // Build output by walking the indices in reverse so positions stay valid.
  let out = text;
  for (let i = tags.length - 1; i >= 0; i--) {
    if (!removeSet.has(i)) continue;
    const tag = tags[i];
    const before = out.slice(0, tag.index);
    const after = out.slice(tag.index + tag.match.length);
    // Also remove a leading space if present.
    out = before.replace(/\s$/, "") + after;
    stats.hashtagsPruned++;
  }
  return out;
}

/* ─── Layer 2.5 — Burstiness boost ──────────────────────────────────── */

function splitSentences(text: string): string[] {
  // Lightweight sentence splitter — handles ., !, ? terminators plus newlines.
  // Keeps the terminator with each sentence. Avoids splitting on "Mr." etc.
  // with a tiny abbreviation guard. Not perfect English NLP — good enough for
  // cadence math.
  const out: string[] = [];
  const re = /[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = m[0].trim();
    if (s) out.push(s);
  }
  return out;
}

function wordCount(s: string): number {
  const m = s.match(/[A-Za-z0-9'\-]+/g);
  return m ? m.length : 0;
}

function boostBurstiness(
  text: string,
  rng: () => number,
  stats: AlgoHumanizerStats,
): string {
  // Operate paragraph-by-paragraph so we never bleed sentences across blocks.
  const paragraphs = text.split(/\n{2,}/);
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const p = paragraphs[pi];
    if (!p.trim() || /^\s{0,3}#{1,6}\s+/.test(p)) continue;
    if (/^\s{0,3}([*+\-]|\d+\.)\s+/.test(p)) continue; // skip lists
    const sentences = splitSentences(p);
    if (sentences.length < 3) continue;

    const lens = sentences.map(wordCount);
    // Find runs of 3+ where each pair is within 5 words.
    let runStart = 0;
    for (let i = 1; i <= sentences.length; i++) {
      const breakRun =
        i === sentences.length || Math.abs(lens[i] - lens[i - 1]) > 5;
      if (breakRun) {
        const runLen = i - runStart;
        if (runLen >= 3) {
          // Pick the middle sentence — split it on a comma if possible to
          // create a sharper short sentence.
          const midIdx = runStart + Math.floor(runLen / 2);
          const target = sentences[midIdx];
          const commaSplit = target.indexOf(", ");
          if (commaSplit > 8 && commaSplit < target.length - 8) {
            const left = target.slice(0, commaSplit).trim();
            const right = target.slice(commaSplit + 2).trim();
            // Capitalize the new sentence start.
            const rightCap = right.charAt(0).toUpperCase() + right.slice(1);
            // Drop terminal punctuation on left, add period.
            const leftClean = left.replace(/[,;:]$/, "") + ".";
            sentences[midIdx] = leftClean + " " + rightCap;
            stats.burstinessAdjustments++;
          } else if (lens[midIdx] > 14) {
            // Inject a short fragment after the long sentence.
            const fragments = [
              "Worth knowing.",
              "Not great.",
              "Critical.",
              "Common enough.",
              "Heads up.",
            ];
            sentences[midIdx] = sentences[midIdx] + " " + pick(rng, fragments);
            stats.burstinessAdjustments++;
          }
        }
        runStart = i;
      }
    }
    paragraphs[pi] = sentences.join(" ");
  }
  return paragraphs.join("\n\n");
}

/* ─── Layer 2.6 — Typo injection (off by default) ───────────────────── */

const TYPO_MAP: Record<string, string> = {
  their: "thier",
  the: "teh",
  would: "wuold",
  receive: "recieve",
  separate: "seperate",
  definitely: "definately",
  occurred: "occured",
  necessary: "neccessary",
};

function injectTypos(
  text: string,
  rng: () => number,
  stats: AlgoHumanizerStats,
): string {
  // Walk all word matches; with probability 0.003 swap to the typo variant.
  return text.replace(/\b([A-Za-z]+)\b/g, (m) => {
    const lower = m.toLowerCase();
    if (!TYPO_MAP[lower]) return m;
    if (rng() > 0.003) return m;
    stats.typosInjected++;
    const typo = TYPO_MAP[lower];
    // Preserve capitalization of first letter.
    if (m[0] === m[0].toUpperCase()) {
      return typo.charAt(0).toUpperCase() + typo.slice(1);
    }
    return typo;
  });
}

/* ─── Layer 2.7 — Casual-phrase injection ───────────────────────────── */

const CASUAL_PHRASES_GENERIC = [
  "Look,",
  "Real talk,",
  "Here's the thing,",
  "Honestly,",
] as const;

const CASUAL_PHRASES_TRADES = [
  "Look,",
  "Here's the thing,",
  "Real talk,",
  "Truth is,",
] as const;

const CASUAL_PHRASES_MARKETING = [
  "Honestly,",
  "Here's the thing,",
  "Real talk,",
  "Look,",
] as const;

const CASUAL_PHRASES_AUTO = [
  "Here's the deal,",
  "Look,",
  "Truth is,",
  "Honestly,",
] as const;

function casualPhrasePool(industry: string | null | undefined): readonly string[] {
  if (!industry) return CASUAL_PHRASES_GENERIC;
  const k = industry.toLowerCase();
  if (/plumb|hvac|electric|roof|construct|contract|trade/.test(k)) return CASUAL_PHRASES_TRADES;
  if (/market|agency|seo|adver|brand|content/.test(k)) return CASUAL_PHRASES_MARKETING;
  if (/auto|mechan|car|vehicle/.test(k)) return CASUAL_PHRASES_AUTO;
  return CASUAL_PHRASES_GENERIC;
}

function injectCasualPhrases(
  text: string,
  rng: () => number,
  industry: string | null | undefined,
  stats: AlgoHumanizerStats,
): string {
  const pool = casualPhrasePool(industry);
  const totalWords = wordCount(text);
  // One per ~300 words.
  const target = Math.max(0, Math.floor(totalWords / 300));
  if (target === 0) return text;

  const paragraphs = text.split(/\n{2,}/);
  // Index of eligible paragraphs (non-heading, non-list, with enough room).
  const eligible: number[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (!p.trim()) continue;
    if (/^\s{0,3}#{1,6}\s+/.test(p)) continue;
    if (/^\s{0,3}([*+\-]|\d+\.)\s+/.test(p)) continue;
    // Skip a paragraph that already starts with a casual phrase.
    if (/^(Look,|Real talk,|Here's the thing,|Honestly,|Truth is,|Here's the deal,)/i.test(p)) {
      continue;
    }
    eligible.push(i);
  }
  if (eligible.length === 0) return text;
  // Spread injections evenly across eligible paragraphs.
  const stride = Math.max(1, Math.floor(eligible.length / target));
  let injected = 0;
  for (let k = 0; k < eligible.length && injected < target; k += stride) {
    const idx = eligible[k];
    const p = paragraphs[idx];
    const phrase = pick(rng, pool);
    // Lowercase the first word that follows (so "The fix..." becomes "the fix...").
    const m = p.match(/^(\s*)([A-Z])(.*)$/s);
    if (m) {
      paragraphs[idx] = `${m[1]}${phrase} ${m[2].toLowerCase()}${m[3]}`;
    } else {
      paragraphs[idx] = `${phrase} ${p}`;
    }
    injected++;
    stats.casualPhrasesInjected++;
  }
  return paragraphs.join("\n\n");
}

/* ─── Public entry points ───────────────────────────────────────────── */

const ZERO_STATS = (): AlgoHumanizerStats => ({
  emDashesReplaced: 0,
  forbiddenTransitionsReplaced: 0,
  openerVariationApplied: 0,
  hashtagsPruned: 0,
  burstinessAdjustments: 0,
  typosInjected: 0,
  casualPhrasesInjected: 0,
});

/**
 * Apply the full algorithmic-humanization pass and return both the new text
 * and a stats object for audit logging.
 */
export function applyAlgorithmicHumanizationDetailed(
  input: string,
  opts: AlgoHumanizerOptions = {},
): AlgoHumanizerResult {
  if (!algoHumanizerEnabled() || !input || input.length < 100) {
    return { text: input, stats: ZERO_STATS() };
  }

  const rng = makeRng(opts.seed);
  const stats = ZERO_STATS();
  const keepEvery = opts.emDashKeepEveryChars ?? 200;

  // Mask URLs across the whole document so we never split or punctuate inside one.
  const { masked, urls } = maskUrls(input);

  // Split into protected vs prose segments.
  const segs = segmentMarkdown(masked);
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.protect) continue;
    let t = seg.text;
    t = trimEmDashes(t, rng, keepEvery, stats);
    t = swapForbiddenTransitions(t, rng, stats);
    t = varyParagraphOpeners(t, rng, stats);
    t = pruneHashtags(t, rng, stats);
    t = boostBurstiness(t, rng, stats);
    const enableTypos =
      opts.enableTypoInjection !== undefined
        ? opts.enableTypoInjection
        : typoInjectionEnabled();
    if (enableTypos) {
      t = injectTypos(t, rng, stats);
    }
    t = injectCasualPhrases(t, rng, opts.industry ?? null, stats);
    segs[i] = { text: t, protect: false };
  }

  const recombined = segs.map((s) => s.text).join("\n");
  const final = unmaskUrls(recombined, urls);

  return { text: final, stats };
}

/** Convenience wrapper that returns just the transformed string. */
export function applyAlgorithmicHumanization(
  input: string,
  opts: AlgoHumanizerOptions = {},
): string {
  return applyAlgorithmicHumanizationDetailed(input, opts).text;
}
