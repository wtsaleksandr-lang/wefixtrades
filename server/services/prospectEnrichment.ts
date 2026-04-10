/**
 * Prospect Enrichment Service — V1
 *
 * Two-phase approach:
 *  1. Heuristic enrichment — runs synchronously at import time, no API calls
 *  2. AI enrichment — called separately (async job or on-demand), uses Claude
 *
 * V1 ships with full heuristic scoring and a working AI layer that can be
 * enabled by setting ANTHROPIC_API_KEY.  Neither blocks import.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface EnrichmentInput {
  businessName: string;
  websiteUrl?: string | null;
  websiteDomain?: string | null;
  tradeCategory?: string | null;
  googleRating?: string | null;
  googleReviewCount?: number | null;
  city?: string | null;
  state?: string | null;
  ownerName?: string | null;
}

export interface HeuristicResult {
  has_website: boolean;
  website_quality_score: number;    // 0–100 rough estimate without fetching the page
  has_quote_tool: boolean;          // heuristic: always false until AI confirms
  likely_owner_operator: boolean;
  employee_count_estimate: "solo" | "small" | "medium" | null;
  social_presence_score: number;    // 0–100
}

export interface AiResult {
  quality_score: number;            // 0–100
  ai_personalization_line: string;
  ai_notes: string;
}

/* ─── Heuristic enrichment ─── */
// No network calls — runs at import time for every row
export function runHeuristics(input: EnrichmentInput): HeuristicResult {
  const hasWebsite = !!(input.websiteUrl || input.websiteDomain);

  // Website quality heuristic — penalise missing info, reward populated fields
  let websiteScore = 0;
  if (hasWebsite) {
    websiteScore += 40;
    const domain = (input.websiteDomain || input.websiteUrl || "").toLowerCase();
    // Simple domain quality signals
    if (!domain.includes("facebook") && !domain.includes("yelp")) websiteScore += 20;
    if (domain.includes(".com") || domain.includes(".net")) websiteScore += 10;
    // Presence of rating suggests legit business
    if (input.googleRating && parseFloat(input.googleRating) >= 4.0) websiteScore += 15;
    if (input.googleReviewCount && input.googleReviewCount >= 10) websiteScore += 15;
  }

  // Likely owner-operator: no chain keywords in name, small review count
  const name = (input.businessName || "").toLowerCase();
  const chainKeywords = ["franchise", "national", "corp", "corporation", "group", "holdings", "llc services", "inc services"];
  const likelyOwnerOp =
    !chainKeywords.some((kw) => name.includes(kw)) &&
    (!input.googleReviewCount || input.googleReviewCount < 500);

  // Employee estimate from review volume
  let employeeEstimate: HeuristicResult["employee_count_estimate"] = null;
  if (input.googleReviewCount !== null && input.googleReviewCount !== undefined) {
    if (input.googleReviewCount < 30) employeeEstimate = "solo";
    else if (input.googleReviewCount < 200) employeeEstimate = "small";
    else employeeEstimate = "medium";
  }

  // Social presence score: crude proxy from review count
  let socialScore = 0;
  if (input.googleReviewCount) {
    socialScore = Math.min(100, Math.round(input.googleReviewCount / 5));
  }

  return {
    has_website: hasWebsite,
    website_quality_score: Math.min(100, websiteScore),
    has_quote_tool: false,          // requires page scrape — deferred
    likely_owner_operator: likelyOwnerOp,
    employee_count_estimate: employeeEstimate,
    social_presence_score: socialScore,
  };
}

/* ─── AI enrichment ─── */
// Requires ANTHROPIC_API_KEY. Returns null gracefully if not configured.
export async function runAiEnrichment(
  input: EnrichmentInput
): Promise<AiResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[ProspectEnrichment] ANTHROPIC_API_KEY not set — skipping AI enrichment");
    return null;
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

  const prompt = `You are a B2B sales analyst for QuoteQuick, a SaaS tool that gives trade contractors (plumbers, electricians, HVAC, roofers, etc.) an instant online quoting system.

Analyze this prospect and return a JSON object with exactly these fields:
- quality_score (integer 0-100): how good a fit is this business for QuoteQuick? Consider: trade contractor, owner-operated, has a website but likely no quote tool, active reviews.
- ai_personalization_line (string, max 2 sentences): a warm, specific opening line for a cold email. Reference something specific about their business. Do NOT be generic.
- ai_notes (string, max 3 sentences): brief analyst notes on fit, opportunity, and any concerns.

Prospect data:
- Business: ${input.businessName}
- Trade: ${input.tradeCategory || "unknown"}
- Location: ${[input.city, input.state].filter(Boolean).join(", ") || "unknown"}
- Website: ${input.websiteUrl || input.websiteDomain || "none"}
- Google Rating: ${input.googleRating || "unknown"} (${input.googleReviewCount ?? "?"} reviews)
- Owner name: ${input.ownerName || "unknown"}

Return ONLY valid JSON. No markdown, no explanation.`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const parsed = JSON.parse(text) as Partial<AiResult>;

    return {
      quality_score: Math.min(100, Math.max(0, Number(parsed.quality_score) || 50)),
      ai_personalization_line: parsed.ai_personalization_line || "",
      ai_notes: parsed.ai_notes || "",
    };
  } catch (err: any) {
    console.error("[ProspectEnrichment] AI enrichment failed:", err.message);
    return null;
  }
}

/* ─── Combined score helper ─── */
// Produces a simple overall quality score when AI hasn't run yet
export function computeBaseScore(h: HeuristicResult): number {
  let score = 30; // baseline
  if (h.has_website) score += 20;
  if (h.website_quality_score > 50) score += 10;
  if (h.likely_owner_operator) score += 20;
  if (h.social_presence_score > 30) score += 10;
  if (h.employee_count_estimate === "solo" || h.employee_count_estimate === "small") score += 10;
  return Math.min(100, score);
}
