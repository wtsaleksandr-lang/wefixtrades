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

/** Default kept at 80% per spec — anything shorter than this fraction of
 *  the original is treated as a truncated rewrite. */
const MIN_LENGTH_RATIO = 0.8;

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
 *  punctuation-insensitive so cosmetic edits ("FAQ:" → "FAQ") still pass. */
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

export function buildHumanizePrompt(
  draftText: string,
  ctx: HumanizeContext,
): { system: string; user: string } {
  const targetWords = ctx.targetWordCount ?? 600;
  const tone = industryToneHint(ctx.industry);

  const system = [
    "You are an editor rewriting an AI-generated article so it reads like a real person wrote it.",
    "Your goal is to defeat AI-detection patterns — uniform paragraph length, predictable transitions, formulaic structure — WITHOUT changing what the article says.",
    "",
    "Hard rules:",
    "- PRESERVE every factual claim, statistic, location, business name, URL, and contact detail exactly as written.",
    "- PRESERVE every ## or ### heading (you may lightly rephrase a heading, but do not drop one or merge two into one).",
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

  const userLines: string[] = [];
  userLines.push(`Rewrite the article below to roughly ${targetWords} words (±10%).`);
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
  userLines.push("Rewrite. Markdown only.");

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

  // Heading integrity guard — every ## / ### heading must survive.
  const dropped = findDroppedHeading(draftText, cleaned);
  if (dropped) {
    log.warn(
      `[humanize] rewrite dropped heading "${dropped.slice(0, 60)}" for client ${ctx.clientId} — falling back to original`,
    );
    return { ...baseResult, fell_back_to_original: true, fallback_reason: "dropped_heading" };
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
