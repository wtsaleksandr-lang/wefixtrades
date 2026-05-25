/**
 * ContentFlow — cross-provider humanization rewrite pass.
 *
 * CF+SS audit P1-1: defeat self-similarity in LLM output by routing the
 * draft through the OPPOSITE provider for a final pass. Claude tends to
 * write with one set of cadences, GPT-4o-mini with another; if a Claude
 * draft is rewritten by gpt-4o-mini (or vice versa), the resulting prose
 * mixes two distributions and is materially harder for AI-detection tools
 * to fingerprint.
 *
 * Pipeline position (see articleService.ts):
 *   generateArticleBody → humanizeArticle → runArticleQualityGate
 *
 * The rewrite is "best-effort": on any failure (model error, truncation,
 * dropped heading) we return the ORIGINAL draft unchanged. The downstream
 * quality gate will catch real quality problems regardless.
 *
 * Feature flag: CONTENTFLOW_HUMANIZE_REWRITE_ENABLED (default true). Set
 * to "false" in Doppler to disable the pass without a code change if cost
 * or latency becomes an issue.
 *
 * Cost: roughly DOUBLES per-article AI spend (one extra LLM call). On
 * Claude Haiku 4.5 → gpt-4o-mini that's ~$0.003-$0.005/article extra; at
 * 100 customers × 30 articles/mo = ~$15/mo total. Acceptable tradeoff for
 * detection-resistance.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createLogger } from "../../../lib/logger";

const log = createLogger("ContentFlow:HumanizeRewrite");

/* ─── Types ─────────────────────────────────────────────────────────── */

export type HumanizeProvider = "openai" | "anthropic";

export interface HumanizeContext {
  clientId: number;
  brandVoice?: string;
  industry?: string;
  targetWordCount?: number;
  /** Provider that generated the ORIGINAL draft. Default "anthropic" per
   *  audit (Claude Haiku is the ContentFlow rotator default). The humanizer
   *  routes to the OPPOSITE provider. */
  sourceProvider?: HumanizeProvider;
  /** Brief / draft title — used by the integrity check to verify the
   *  rewrite didn't drift off-topic. If provided, the longest content
   *  word from the title must appear somewhere in the rewrite. */
  briefTitle?: string;
  /** When true, use the EXTRA-aggressive prompt variant. Triggered by the
   *  Layer-4 detector gate when the first pass still scores ≥ 60% AI.
   *  Pushes burstiness harder, mandates more fragments, and requires at
   *  least one question per heading. */
  extraAggressive?: boolean;
}

export interface HumanizeResult {
  humanized: string;
  provider_used: HumanizeProvider;
  original_length: number;
  final_length: number;
  /** True when the rewrite was rejected (truncation / dropped heading /
   *  provider error) and we fell back to the original draft. */
  fell_back_to_original: boolean;
  /** Short tag explaining the fallback if any. */
  fallback_reason?: string;
}

/* ─── Constants ─────────────────────────────────────────────────────── */

/** Default kept at 75% — the aggressive prompt (PR #783) allows ±15-20%
 *  word count drift, so 80% was triggering false fallbacks on legitimate
 *  rewrites. Anything shorter than this fraction of the original is still
 *  treated as a truncated rewrite. */
const MIN_LENGTH_RATIO = 0.75;

/** Max output tokens — humanized rewrite shouldn't grow much beyond the
 *  original. 2000 covers ~700-word articles (the upper bound from the
 *  generator's SYSTEM_PROMPT). */
const MAX_OUTPUT_TOKENS = 2000;

/* ─── Feature flag ──────────────────────────────────────────────────── */

export function humanizeEnabled(): boolean {
  const raw = process.env.CONTENTFLOW_HUMANIZE_REWRITE_ENABLED;
  if (raw === undefined || raw === null || raw === "") return true;
  return !/^(false|0|off|no)$/i.test(raw.trim());
}

/** Feature flag for the AGGRESSIVE prompt rewrite (the new prompt that
 *  targets ZeroGPT < 40%). When disabled we fall back to the original
 *  prompt — the cross-provider routing still happens but with the gentler
 *  pre-PR-781 instruction. */
export function aggressiveHumanizeEnabled(): boolean {
  const raw = process.env.CONTENTFLOW_AGGRESSIVE_HUMANIZE_ENABLED;
  if (raw === undefined || raw === null || raw === "") return true;
  return !/^(false|0|off|no)$/i.test(raw.trim());
}

/* ─── Provider selection ────────────────────────────────────────────── */

/** Return the OPPOSITE provider from the one that generated the original
 *  draft. Default source is anthropic (Claude Haiku, the rotator default
 *  per the audit). */
export function pickOppositeProvider(source: HumanizeProvider | undefined): HumanizeProvider {
  const src: HumanizeProvider = source ?? "anthropic";
  return src === "anthropic" ? "openai" : "anthropic";
}

/* ─── Heading extraction (used for the integrity check) ─────────────── */

/** Extract markdown headings (## or ###) from the body. We require every
 *  original heading to survive the rewrite — the rewriter occasionally
 *  drops one and that breaks the article's intended SEO structure. */
export function extractHeadings(body: string): string[] {
  const out: string[] = [];
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s{0,3}(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (m) out.push(m[2].trim());
  }
  return out;
}

function normalizeHeading(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Returns the FIRST original heading missing from the rewritten body,
 *  or null if every heading survived. Comparison is case- and
 *  punctuation-insensitive so cosmetic edits ("FAQ:" → "FAQ") still pass.
 *  Retained for backwards compatibility and tests; the live integrity
 *  check now uses {@link checkRewriteIntegrity} which is count-based. */
export function findDroppedHeading(originalBody: string, rewritten: string): string | null {
  const original = extractHeadings(originalBody);
  if (original.length === 0) return null;
  const rewrittenLower = rewritten.toLowerCase();
  // Also collect rewritten headings as normalized strings for substring fallback.
  const rewrittenHeadings = extractHeadings(rewritten).map(normalizeHeading);
  for (const h of original) {
    const norm = normalizeHeading(h);
    if (!norm) continue;
    // Heading is preserved if either it appears in the rewritten body
    // (any context) OR a rewritten heading normalizes to the same string.
    if (rewrittenLower.includes(h.toLowerCase())) continue;
    if (rewrittenHeadings.includes(norm)) continue;
    return h;
  }
  return null;
}

/** Extract the longest "content" word from the brief title — used to
 *  verify the rewrite stayed on-topic. We skip common stopwords and
 *  short words because they appear in most articles regardless of topic. */
const TITLE_STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "you", "from", "this", "that", "what",
  "when", "where", "why", "how", "are", "was", "were", "have", "has", "had",
  "will", "can", "could", "should", "would", "about", "into", "their", "they",
  "them", "our", "his", "her", "its", "any", "all", "but", "not", "one", "two",
  "three", "out", "off", "now", "new", "old", "best", "top", "guide", "tips",
  "ways", "things", "stuff", "more", "less", "than", "then", "some", "most",
  "much", "many", "few", "every",
]);

export function extractCriticalTitleWord(title: string | undefined): string | null {
  if (!title) return null;
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !TITLE_STOPWORDS.has(w));
  if (words.length === 0) return null;
  // Longest content word — most specific signal of the article's topic.
  return words.reduce((a, b) => (b.length > a.length ? b : a));
}

export interface IntegrityFailure {
  reason: "heading_count_mismatch" | "off_topic";
  detail: string;
}

/** Loosened integrity check — only fail if heading COUNT differs OR a
 *  critical word from the brief title is entirely missing from the
 *  rewrite. Cosmetic heading rephrasing ("## What To Do First" →
 *  "## First Steps") no longer triggers a fallback. */
export function checkRewriteIntegrity(
  originalBody: string,
  rewritten: string,
  briefTitle: string | undefined,
): IntegrityFailure | null {
  const originalHeadings = extractHeadings(originalBody);
  const rewrittenHeadings = extractHeadings(rewritten);
  if (originalHeadings.length !== rewrittenHeadings.length) {
    return {
      reason: "heading_count_mismatch",
      detail: `original=${originalHeadings.length} rewritten=${rewrittenHeadings.length}`,
    };
  }
  const critical = extractCriticalTitleWord(briefTitle);
  if (critical && !rewritten.toLowerCase().includes(critical)) {
    return {
      reason: "off_topic",
      detail: `brief title word "${critical}" missing from rewrite`,
    };
  }
  return null;
}

/* ─── Prompt construction ───────────────────────────────────────────── */

function industryToneHint(industry: string | undefined): string | null {
  if (!industry) return null;
  const k = industry.toLowerCase();
  if (/plumb|hvac|electric|roof|construct|contract/.test(k)) {
    return "Direct, practical, no-nonsense. Tradespeople respect plain talk over marketing fluff.";
  }
  if (/market|agency|seo|adver|brand|content/.test(k)) {
    return "Confident, slightly playful, knowing. Comfortable with industry shorthand without being smug.";
  }
  if (/law|legal|attorn|account|financ/.test(k)) {
    return "Measured and precise. Conversational but never casual about facts.";
  }
  if (/med|health|dental|clinic|therap/.test(k)) {
    return "Warm, reassuring, plain-spoken. Avoid clinical jargon when a simpler word works.";
  }
  if (/auto|mechan|car|vehicle/.test(k)) {
    return "Straightforward and a little dry. Use shop-floor language where natural.";
  }
  return `Match the natural voice of someone who actually works in ${industry}, not a generic copywriter writing about it.`;
}

/** Industry-aware shop-floor vocabulary hint — fed into the aggressive
 *  prompt so the rewriter pulls in colloquialisms that match the niche. */
function industryColloquialisms(industry: string | undefined): string {
  if (!industry) return "the job, the customer, the work";
  const k = industry.toLowerCase();
  if (/plumb/.test(k)) return "the call, the job, the homeowner, the line, the leak, snake the drain";
  if (/electric/.test(k)) return "the panel, the run, the homeowner, code, the breaker, hot/neutral";
  if (/roof/.test(k)) return "the tear-off, the deck, shingles, flashing, the homeowner, the layer";
  if (/hvac|heat|cool|air/.test(k)) return "the unit, the call, refrigerant, the homeowner, ductwork, the system";
  if (/construct|contract|general/.test(k)) return "the build, the job, the crew, the site, the homeowner";
  if (/market|agency|seo|adver|brand|content/.test(k)) return "the ad, the funnel, the brief, the campaign, the client";
  if (/auto|mechan|car|vehicle/.test(k)) {
    // Auto industry historically over-leans into fragments (validation
    // 2026-05-25 showed burstiness 0.52 vs target 0.65). Pair the
    // shop-floor vocab with an explicit short+long structural example
    // so the rewriter doesn't collapse into all-fragments shop-talk.
    return [
      "under the hood, the bay, the customer, the lift, the part.",
      "Structural example — use BOTH lengths in the SAME section: a short shop-floor call like \"The compression check came back fine.\" AND a long diagnostic like \"When you've got an intermittent misfire that only shows up on cold starts and goes away once the engine reaches operating temperature, the diagnostic path narrows fast — usually it's a temperature-dependent component aging out.\"",
    ].join(" ");
  }
  if (/law|legal|attorn/.test(k)) return "the matter, the client, the filing, the hearing";
  if (/med|health|dental|clinic/.test(k)) return "the visit, the patient, the chart, the follow-up";
  return "the job, the customer, the work";
}

/** Few-shot anchor — a tiny BAD/GOOD pair so the model knows what cadence
 *  we actually want. Generic enough to apply across niches. */
const AGGRESSIVE_FEWSHOT = [
  "EXAMPLE — bad (AI-detectable):",
  "When it comes to choosing a plumber, it's important to remember that quality matters significantly. Moreover, you should always ensure that the plumber you select has the necessary credentials and experience. Furthermore, asking for references from previous clients is essential to making an informed decision.",
  "",
  "EXAMPLE — good (human-cadence rewrite of the SAME content):",
  "Picking a plumber is harder than it looks. Most people just grab the first name on Google. Big mistake. Here's what actually matters: credentials, real references, and someone who'll answer the phone at 9pm when the basement floods. Ask for two past customers you can call. If they hesitate? Move on.",
].join("\n");

/** AGGRESSIVE prompt — replaces the gentler pre-PR-781 instruction. Built
 *  for ZeroGPT < 40%. The pragmatic cadence target is burstiness > 0.65,
 *  avgSentenceLen < 16 words. Layer 2 (algorithmic) + Layer 3 (cadence
 *  verify) will retry if the LLM doesn't comply. */
function buildAggressiveSystemPrompt(ctx: HumanizeContext): string {
  const colloquialisms = industryColloquialisms(ctx.industry);
  const lines = [
    "You are rewriting an AI-generated article to read as if a real small-business owner wrote it. Your job is to defeat AI content detectors while preserving every fact, every heading, and the customer's intent.",
    "",
    "CRITICAL CADENCE RULES — these are non-negotiable:",
    "1. BURSTINESS IS NON-NEGOTIABLE. The article MUST contain BOTH: (a) at least 3 sentences of 3-6 words AND (b) at least 3 sentences of 25-35 words. Spread them across paragraphs. Never write 3 consecutive sentences within 5 words of each other. A burstiness score < 0.65 means you failed.",
    "2. AVG SENTENCE LENGTH — target 11-13 words across the article. Long sentences are AI-tell #1.",
    "3. SENTENCE FRAGMENTS — use them. \"Critical.\" \"Not great.\" \"Worth knowing.\" Real people write fragments.",
    "4. ONE-WORD PARAGRAPHS — occasionally use a single sentence as its own paragraph for emphasis.",
    "5. CONTRACTIONS — use them everywhere (\"don't\", \"can't\", \"won't\", \"you're\", \"it's\"). AI writes \"do not\".",
    "6. PARENTHETICALS — break flow with commas, dashes-but-sparingly, or asides like \"(more on this below)\".",
    "7. QUESTIONS — pose 2-4 questions across the article. Real writing has questions.",
    `8. INDUSTRY COLLOQUIALISMS — use shop-floor language. For this niche: ${colloquialisms}.`,
    "",
    "CRITICAL HEADING RULE: Reproduce every ## and ### heading EXACTLY character-for-character. The body under each heading can be fully rewritten.",
    "",
    "FORBIDDEN PATTERNS (these are AI-tells, never produce):",
    "- \"Moreover\", \"Furthermore\", \"Additionally\" — use \"Plus\", \"And\", \"Also\" instead, or no transition word",
    "- \"In conclusion\", \"To wrap up\", \"In summary\" — just end naturally",
    "- Excessive em-dashes — at most one per 150 words",
    "- Triple-colon lists where every entry starts the same way",
    "- Generic openers like \"When it comes to...\" or \"Have you ever wondered...\"",
    "- \"Whether you're...\" constructions",
    "- \"It's important to remember that...\"",
    "- The phrase \"let's dive in\" or \"deep dive\"",
    "",
    "PRESERVED INVARIANTS:",
    "- All factual claims unchanged",
    "- All headings exact",
    "- All URLs/business names unchanged",
    "- Word count ±15%",
    "",
    `Topic: ${ctx.briefTitle ?? "(see article body)"}`,
    "",
    AGGRESSIVE_FEWSHOT,
    "",
    "Output only the rewritten article in markdown. No preamble, no explanation, no code fence.",
  ];
  return lines.join("\n");
}

/** EXTRA-AGGRESSIVE variant — triggered after the Layer-4 detector gate
 *  scores ≥ 60% on the first pass. Pushes burstiness HARDER, mandates more
 *  fragments, and requires at least one question per heading. */
function buildExtraAggressiveSystemPrompt(ctx: HumanizeContext): string {
  const colloquialisms = industryColloquialisms(ctx.industry);
  const lines = [
    "SECOND-PASS REWRITE. Your previous output was still flagged by an AI detector. This pass is significantly more aggressive. The article below has already been humanized once — push every cadence rule HARDER.",
    "",
    "MANDATORY RULES (stronger than the first pass):",
    "1. BURSTINESS HARDER — at least 30% of sentences must be ≤ 8 words. At least 10% must be ≥ 25 words. Never two consecutive sentences within 4 words of each other.",
    "2. AVG SENTENCE LENGTH — target 10-12 words. If your prior draft averaged higher, cut it.",
    "3. FRAGMENTS MANDATORY — at least 4 sentence fragments per 500 words. \"Critical.\" \"Doesn't work.\" \"Every time.\" Real writing uses them.",
    "4. ONE-WORD PARAGRAPHS — at least one in the article. Drop it for emphasis.",
    "5. CONTRACTIONS EVERYWHERE — every \"do not\" → \"don't\", every \"will not\" → \"won't\", every \"it is\" → \"it's\". No exceptions.",
    "6. QUESTIONS — at least one question per ## heading section. Open with a question if it fits.",
    `7. INDUSTRY COLLOQUIALISMS — pack them in. For this niche: ${colloquialisms}. Use multiple.`,
    "8. ASIDES — at least two parenthetical asides like \"(seriously)\" or \"(more on that)\" or \"(every time)\".",
    "9. PERSONALITY MARKERS — a casual phrase opener somewhere: \"Look,\" / \"Real talk,\" / \"Honestly,\" / \"Here's the thing,\".",
    "",
    "CRITICAL HEADING RULE: Reproduce every ## and ### heading EXACTLY character-for-character.",
    "",
    "FORBIDDEN (zero tolerance this pass):",
    "- \"Moreover\", \"Furthermore\", \"Additionally\", \"Therefore\", \"In conclusion\"",
    "- Em-dashes (at most one in the entire article)",
    "- \"When it comes to\", \"Whether you're\", \"It's important to\"",
    "- Three sentences in a row of similar length",
    "- Any sentence longer than 35 words",
    "",
    "PRESERVED INVARIANTS:",
    "- All factual claims unchanged",
    "- All headings exact",
    "- All URLs/business names unchanged",
    "- Word count ±20% (slightly looser to allow restructuring)",
    "",
    `Topic: ${ctx.briefTitle ?? "(see article body)"}`,
    "",
    "Output only the rewritten article in markdown. No preamble, no explanation, no code fence.",
  ];
  return lines.join("\n");
}

/** Original (PR #780/#781) prompt — kept as fallback when
 *  CONTENTFLOW_AGGRESSIVE_HUMANIZE_ENABLED=false. */
function buildLegacySystemPrompt(): string {
  return [
    "You are an editor rewriting an AI-generated article so it reads like a real person wrote it.",
    "Your goal is to defeat AI-detection patterns — uniform paragraph length, predictable transitions, formulaic structure — WITHOUT changing what the article says.",
    "",
    "Hard rules:",
    "- PRESERVE every factual claim, statistic, location, business name, URL, and contact detail exactly as written.",
    "- CRITICAL: Reproduce every ## and ### heading EXACTLY as written. Do not rephrase, shorten, or expand them. The body under each heading can be freely rewritten, but heading text must match character-for-character.",
    "- PRESERVE the target word count within ±10%.",
    "- Do NOT add new facts, claims, testimonials, prices, guarantees, or specific stats.",
    "- Do NOT introduce calls-to-action or marketing flourish that wasn't in the original.",
    "",
    "Rewrite style:",
    "- Mix paragraph lengths. Short 1-2 sentence paragraphs alongside longer ones. Vary cadence.",
    "- Replace formal transitions (Moreover, Furthermore, Additionally, In conclusion, Therefore) with conversational ones that fit the industry. Sometimes just start the next thought with no transition word at all.",
    "- Inject occasional minor imperfections that mark human writing: a colloquial phrase, a brief aside, a sentence fragment for emphasis. Use these sparingly — one or two per article, not on every paragraph.",
    "- Vary sentence openers. Don't start three consecutive sentences with the same kind of word.",
    "",
    "Output only the rewritten article in markdown. No preamble, no explanation, no code fence.",
  ].join("\n");
}

export function buildHumanizePrompt(
  draftText: string,
  ctx: HumanizeContext,
): { system: string; user: string } {
  const targetWords = ctx.targetWordCount ?? 600;
  const tone = industryToneHint(ctx.industry);

  const system = ctx.extraAggressive
    ? buildExtraAggressiveSystemPrompt(ctx)
    : aggressiveHumanizeEnabled()
      ? buildAggressiveSystemPrompt(ctx)
      : buildLegacySystemPrompt();

  const userLines: string[] = [];
  userLines.push(`Rewrite the article below to roughly ${targetWords} words (±${ctx.extraAggressive ? 20 : 15}%).`);
  if (tone) userLines.push(`Industry tone: ${tone}`);
  if (ctx.brandVoice) {
    userLines.push(`Brand voice hint (shape the tone, do NOT invent claims from this): ${ctx.brandVoice.slice(0, 400)}`);
  }
  userLines.push("");
  userLines.push("ORIGINAL ARTICLE:");
  userLines.push('"""');
  userLines.push(draftText);
  userLines.push('"""');
  userLines.push("");
  userLines.push(ctx.extraAggressive
    ? "Rewrite with the harder rules. Markdown only."
    : "Rewrite. Markdown only.");

  return { system, user: userLines.join("\n") };
}

/* ─── Provider calls ────────────────────────────────────────────────── */

async function callOpenAi(system: string, user: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!key) {
    const err: any = new Error("OPENAI_API_KEY not configured");
    err.status = 401;
    throw err;
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    const err: any = new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const json: any = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const err: any = new Error("ANTHROPIC_API_KEY not configured");
    err.status = 401;
    throw err;
  }
  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b: any) => b.type === "text") as any;
  return block?.text ?? "";
}

/* ─── Public entry point ────────────────────────────────────────────── */

/**
 * Run the cross-provider humanization rewrite pass on an article draft.
 *
 * Never throws. On any failure — disabled flag, provider error, output
 * truncation, dropped heading — returns the ORIGINAL draft unchanged with
 * `fell_back_to_original: true` and a short `fallback_reason` tag.
 *
 * Always reports the `provider_used` even on fallback so callers can log
 * which provider was attempted.
 */
export async function humanizeArticle(
  draftText: string,
  ctx: HumanizeContext,
): Promise<HumanizeResult> {
  const originalLength = draftText.length;
  const targetProvider = pickOppositeProvider(ctx.sourceProvider);

  const baseResult: HumanizeResult = {
    humanized: draftText,
    provider_used: targetProvider,
    original_length: originalLength,
    final_length: originalLength,
    fell_back_to_original: false,
  };

  // Feature flag: skip entirely when disabled.
  if (!humanizeEnabled()) {
    return { ...baseResult, fell_back_to_original: true, fallback_reason: "flag_disabled" };
  }

  // Empty / too-short input — nothing meaningful to rewrite.
  if (!draftText || draftText.trim().length < 200) {
    return { ...baseResult, fell_back_to_original: true, fallback_reason: "input_too_short" };
  }

  const { system, user } = buildHumanizePrompt(draftText, ctx);

  let rewritten: string;
  try {
    rewritten = targetProvider === "openai"
      ? await callOpenAi(system, user)
      : await callAnthropic(system, user);
  } catch (err: any) {
    log.warn(`[humanize] provider ${targetProvider} failed for client ${ctx.clientId}: ${(err?.message || String(err)).slice(0, 200)}`);
    return { ...baseResult, fell_back_to_original: true, fallback_reason: `provider_error_${targetProvider}` };
  }

  const cleaned = stripCodeFenceWrapper(rewritten).trim();

  // Truncation guard — accept only when at least MIN_LENGTH_RATIO of the
  // original survived. Below that, the rewriter probably cut the article off.
  if (cleaned.length < originalLength * MIN_LENGTH_RATIO) {
    log.warn(
      `[humanize] rewrite too short (${cleaned.length}/${originalLength}) for client ${ctx.clientId} — falling back to original`,
    );
    return { ...baseResult, fell_back_to_original: true, fallback_reason: "rewrite_truncated" };
  }

  // Heading-count + on-topic integrity guard. Loosened from the original
  // exact-heading-match check: gpt-4o-mini frequently renames headings
  // ("## What To Do First" → "## First Steps") even though the body is
  // fine. We now only fail when the heading COUNT changes (rewriter
  // dropped or invented a section) OR when a critical word from the
  // brief title is missing entirely (rewrite drifted off-topic).
  const integrity = checkRewriteIntegrity(draftText, cleaned, ctx.briefTitle);
  if (integrity) {
    log.warn(
      `[humanize] rewrite integrity failed (${integrity.reason}: ${integrity.detail}) for client ${ctx.clientId} — falling back to original`,
    );
    return { ...baseResult, fell_back_to_original: true, fallback_reason: integrity.reason };
  }

  log.info(
    `[humanize] ✓ ${targetProvider} rewrite accepted for client ${ctx.clientId} (${originalLength}→${cleaned.length} chars)`,
  );
  return {
    humanized: cleaned,
    provider_used: targetProvider,
    original_length: originalLength,
    final_length: cleaned.length,
    fell_back_to_original: false,
  };
}

/** Strip a leading/trailing ```...``` fence if the model added one despite
 *  the system instruction. */
function stripCodeFenceWrapper(text: string): string {
  const t = text.trim();
  if (!t.startsWith("```")) return text;
  return t.replace(/^```(?:\w+)?\s*/i, "").replace(/```\s*$/, "");
}
