/**
 * Per-prospect personalization tokens.
 *
 * Generates the four AI fields on `prospect_enrichment` that the
 * sequence template substitutes per-recipient at send time:
 *   - ai_first_line          a 1-sentence hook tied to the prospect's specifics
 *   - ai_reason_to_target    why this offer fits this specific business
 *   - ai_offer_angle         which framing of the offer resonates here
 *   - ai_cta_variant         CTA text suited to this prospect's likely state
 *
 * Cheap: single Haiku call per prospect (~$0.001 each). 1k prospects ≈ $1.
 *
 * The existing `prospectEnrichment.ts` service has heuristic enrichment.
 * This module is a tighter, conversion-focused upgrade specifically
 * for cold-email tokens. It does NOT replace the broader enrichment —
 * it complements it by writing into the same row.
 */

import { chat } from "../aiService";
import { createLogger } from "../../lib/logger";
import type { Prospect } from "@shared/schema";

const log = createLogger("ProspectPersonalizer");
const MODEL_CHEAP = "claude-haiku-4-5-20251001";

export interface PersonalizationTokens {
  ai_first_line: string;
  ai_reason_to_target: string;
  ai_offer_angle: string;
  ai_cta_variant: string;
}

export interface PersonalizeContext {
  /** ICP / offer / pain context from the sequence template. */
  icp: string;
  painPoint: string;
  offer: string;
  /** Optional: feed the chosen offer angles from the sequence brief
   *  so the personalizer can pick the angle that best fits this prospect. */
  candidateAngles?: string[];
}

function systemPrompt(): string {
  return `You generate cold-email personalization tokens for one specific business.

Your output gets merged into a templated email body, so it must read naturally inline. Each field has a strict purpose:

  ai_first_line:
    A single sentence that mentions something concrete about THIS business — their city, their trade specialty, their Google rating, their review volume, an obvious gap on their website. Must feel hand-typed, not formulaic. Avoid "I noticed", "I came across", "I was looking at". Aim for 12-25 words. End with a period.

  ai_reason_to_target:
    One sentence answering "why would this specific business benefit from the offer?" — tied to a recipient signal, not generic. 12-20 words. Example: "Owner-operator with 28 reviews and no website-bookings tool — fits the demo profile exactly."

  ai_offer_angle:
    One short phrase (3-8 words) selecting which framing of the offer to lead with for this business. Example: "instant-quote tool for after-hours leads".

  ai_cta_variant:
    One specific CTA text, tied to the offer angle. 6-12 words. Example: "want a 30-second loom showing it on your site?"

Hard rules:
  - Plain text only. No quotes around the strings. No markdown.
  - No em-dashes. Use commas or two short sentences.
  - Don't lie. If you don't know something about the business, don't invent it. Use what you have.
  - If the prospect data is too thin to write something specific, fall back to a city + trade-category line that still feels native. Never write "I hope this finds you well" or other AI-cliché phrases.

Return ONLY valid JSON:
{
  "ai_first_line": "...",
  "ai_reason_to_target": "...",
  "ai_offer_angle": "...",
  "ai_cta_variant": "..."
}`;
}

function userPrompt(prospect: Prospect, ctx: PersonalizeContext): string {
  // Squeeze every signal we have into the prompt — the model decides
  // which to use. No need to pre-filter.
  const lines = [
    `Business: ${prospect.business_name}`,
    prospect.trade_category ? `Trade: ${prospect.trade_category}` : null,
    prospect.city ? `City: ${prospect.city}${prospect.state ? ", " + prospect.state : ""}` : null,
    prospect.website_url ? `Website: ${prospect.website_url}` : null,
    prospect.google_rating ? `Google rating: ${prospect.google_rating}` : null,
    prospect.google_review_count
      ? `Google reviews: ${prospect.google_review_count}`
      : null,
    prospect.contact_name ? `Contact: ${prospect.contact_name}` : null,
    prospect.owner_name ? `Owner: ${prospect.owner_name}` : null,
  ].filter(Boolean);

  const angles = ctx.candidateAngles?.length
    ? `\nCandidate offer angles to choose from:\n${ctx.candidateAngles.map((a) => `  - ${a}`).join("\n")}`
    : "";

  return `Prospect data:
${lines.join("\n")}

Campaign context:
ICP: ${ctx.icp}
Pain we solve: ${ctx.painPoint}
Offer: ${ctx.offer}${angles}

Generate the four tokens now. JSON only.`;
}

function parseTokens(raw: string): PersonalizationTokens {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace !== -1 && lastBrace < cleaned.length - 1) {
    cleaned = cleaned.slice(0, lastBrace + 1);
  }
  const parsed = JSON.parse(cleaned);
  // Light validation — fields must be strings, non-empty.
  for (const key of [
    "ai_first_line",
    "ai_reason_to_target",
    "ai_offer_angle",
    "ai_cta_variant",
  ] as const) {
    if (typeof parsed[key] !== "string" || !parsed[key].trim()) {
      throw new Error(`personalizer missing or invalid field: ${key}`);
    }
  }
  return parsed as PersonalizationTokens;
}

export async function personalizeForProspect(
  prospect: Prospect,
  ctx: PersonalizeContext
): Promise<PersonalizationTokens> {
  const raw = await chat({
    system: systemPrompt(),
    messages: [{ role: "user", content: userPrompt(prospect, ctx) }],
    maxTokens: 600,
    modelOverride: MODEL_CHEAP,
  });
  try {
    const tokens = parseTokens(raw);
    log.debug("personalized", { prospect_id: prospect.id });
    return tokens;
  } catch (err: any) {
    log.error("personalizer parse failed", {
      prospect_id: prospect.id,
      error: err.message,
      raw_preview: raw.slice(0, 200),
    });
    throw err;
  }
}
