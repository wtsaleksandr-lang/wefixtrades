/**
 * AI Insights — Claude-driven prioritized-action generator (Wave 7).
 *
 * Given a `CustomerSignals` blob, produces a 1-paragraph plain-English
 * summary + 3-5 prioritized actions. Output is strictly validated via
 * Zod. Single retry on parse failure with a tightened prompt; static
 * fallback if both attempts fail.
 *
 * Model defaults to claude-sonnet-4-6 (good reasoning, cheap). Falls
 * back to claude-haiku-4-5-20251001 on transient errors from the
 * existing chat() retry path.
 */
import { z } from "zod";
import { chat } from "../aiService";
import { AI_SURFACES } from "../aiSurfaces";
import { createLogger } from "../../lib/logger";
import type { CustomerSignals } from "./dataAggregator";

const log = createLogger("AiInsightsGenerator");

/* ─── Result schema (strict; validated post-LLM) ─── */
export const InsightActionSchema = z.object({
  priority: z.number().int().min(1).max(5),
  category: z.enum(["gbp", "rankings", "reviews", "citations", "competitors"]),
  title: z.string().min(3).max(120),
  rationale: z.string().min(10).max(400),
  actionLabel: z.string().min(2).max(60),
  actionUrl: z.string().min(1).max(200),
  estimatedImpact: z.enum(["high", "medium", "low"]),
  estimatedEffort: z.enum(["5 min", "1 hour", "1 day", "ongoing"]),
});
export type InsightAction = z.infer<typeof InsightActionSchema>;

export const AiInsightsResultSchema = z.object({
  summary: z.string().min(20).max(800),
  actions: z.array(InsightActionSchema).min(1).max(8),
});

export type AiInsightsResult = {
  summary: string;
  actions: InsightAction[];
  generatedAt: Date;
  cacheKey: string;
  model: string;
};

/* ─── System prompt ─── */
const SYSTEM_PROMPT = `You are a local-SEO strategist for trades businesses (plumbers, electricians, HVAC, etc.). \
You analyze a JSON blob of signals from the customer's Google Business Profile, citation health, rank trend, and competitors. \
Your job is to return a JSON object with two fields: \
"summary" (1 short paragraph, 2-4 sentences, plain English, no jargon) and \
"actions" (3 to 5 prioritized actions).

Each action must include:
- priority (1=highest, 5=lowest)
- category (one of: "gbp", "rankings", "reviews", "citations", "competitors")
- title (short imperative, e.g. "Add 5 more business photos")
- rationale (1-2 sentences in plain English explaining why this matters)
- actionLabel (button text, e.g. "Upload Photos")
- actionUrl (relative URL inside the customer portal — see list below)
- estimatedImpact ("high" | "medium" | "low")
- estimatedEffort ("5 min" | "1 hour" | "1 day" | "ongoing")

Valid actionUrl values:
- "/portal/mapguard" for GBP, rankings, photo, hours, description fixes
- "/portal/reviews" for review-related actions
- "/portal/citation-tracker" for NAP / citation issues
- "/portal/citation-builder" to add new directory listings
- "/portal/socialsync" for content posting cadence
- "/portal/rankflow" for keyword research / tracking

Hard rules:
- Output STRICT JSON ONLY — no markdown, no preamble, no trailing commentary.
- If a signal is null/missing, do NOT invent data; either skip that action or write a rationale that acknowledges the gap ("not enough scan history yet").
- Never claim specific dollar amounts of lost revenue.
- Never recommend anything that requires the customer to spend on a 3rd party.
- Prefer concrete actions ("Add 3 photos this week") over vague ones ("improve your profile").`;

const RETRY_SUFFIX = `\n\nIMPORTANT: Previous response failed JSON validation. Return ONLY a valid JSON object matching the schema described above. No prose, no markdown fences.`;

/* ─── Static fallback ─── */
function staticFallback(model: string, cacheKey: string): AiInsightsResult {
  return {
    summary: "AI insights are temporarily unavailable. Your dashboard below shows your raw signals — score, rating, review count, and rank trend. Check back later and we'll regenerate your prioritized actions.",
    actions: [{
      priority: 1,
      category: "gbp",
      title: "Review your MapGuard dashboard",
      rationale: "We weren't able to generate fresh AI recommendations right now, but your raw signals are visible in the MapGuard portal.",
      actionLabel: "Open MapGuard",
      actionUrl: "/portal/mapguard",
      estimatedImpact: "medium",
      estimatedEffort: "5 min",
    }],
    generatedAt: new Date(),
    cacheKey,
    model,
  };
}

function buildCacheKey(signals: CustomerSignals): string {
  // Simple deterministic-ish key — customerId + latest review_count + score
  // hash. Used by the cache layer for invalidation/diff but the primary
  // cache key on disk is (client_id, expires_at).
  const parts = [
    signals.customerId,
    String(signals.gbpHealth.rating ?? ""),
    String(signals.gbpHealth.reviewCount ?? ""),
    String(signals.rankTrend.avgPosition ?? ""),
  ];
  return parts.join("|");
}

async function callLLM(signals: CustomerSignals, isRetry: boolean, model: string): Promise<string> {
  const userPayload = JSON.stringify(signals, null, 2);
  const systemText = SYSTEM_PROMPT + (isRetry ? RETRY_SUFFIX : "");
  return chat({
    system: systemText,
    messages: [{ role: "user", content: userPayload }],
    maxTokens: 1000,
    surface: AI_SURFACES.ai_insights,
    modelOverride: model,
  });
}

function tryParseLLM(raw: string): { ok: true; result: z.infer<typeof AiInsightsResultSchema> } | { ok: false; error: string } {
  // Strip markdown fences if the model added them despite the prompt.
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err: any) {
    return { ok: false, error: `JSON.parse failed: ${err?.message ?? String(err)}` };
  }
  const validated = AiInsightsResultSchema.safeParse(parsed);
  if (!validated.success) {
    return { ok: false, error: `Zod validation failed: ${validated.error.message.slice(0, 200)}` };
  }
  return { ok: true, result: validated.data };
}

export async function generateInsights(signals: CustomerSignals): Promise<AiInsightsResult> {
  const PRIMARY_MODEL = "claude-sonnet-4-6";
  const cacheKey = buildCacheKey(signals);

  // Attempt 1 — Sonnet, strict prompt.
  try {
    const raw = await callLLM(signals, false, PRIMARY_MODEL);
    const parsed = tryParseLLM(raw);
    if (parsed.ok) {
      return {
        summary: parsed.result.summary,
        actions: parsed.result.actions,
        generatedAt: new Date(),
        cacheKey,
        model: PRIMARY_MODEL,
      };
    }
    log.warn("ai_insights: first attempt parse failed, retrying with tightened prompt", { error: parsed.error });
  } catch (err: any) {
    log.warn("ai_insights: first attempt threw, retrying", { error: err?.message });
  }

  // Attempt 2 — same model, retry suffix.
  try {
    const raw = await callLLM(signals, true, PRIMARY_MODEL);
    const parsed = tryParseLLM(raw);
    if (parsed.ok) {
      return {
        summary: parsed.result.summary,
        actions: parsed.result.actions,
        generatedAt: new Date(),
        cacheKey,
        model: PRIMARY_MODEL,
      };
    }
    log.error("ai_insights: retry also failed parse — falling back to static", { error: parsed.error });
  } catch (err: any) {
    log.error("ai_insights: retry threw — falling back to static", { error: err?.message });
  }

  return staticFallback(PRIMARY_MODEL, cacheKey);
}
