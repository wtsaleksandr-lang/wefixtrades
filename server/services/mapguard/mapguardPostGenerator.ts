/**
 * MapGuard Google Business post content generator.
 *
 * Standalone — does NOT use SocialSync's contentGenerator / ContentFlow
 * brand pipeline. Reuses only the low-level `chat()` LLM helper so this
 * stays operational regardless of ContentFlow's launch readiness.
 *
 * Generates a single GBP-shaped post body (≤1500 chars) from:
 *   - client business_name + trade_type + city (from clients row)
 *   - assigned theme (promotion / tip / service_highlight / etc.)
 *   - quota_period (for seasonal cues)
 *   - last 30 days of MapGuard-published bodies (dedup guard)
 *
 * Outputs `{ content, media_url?, generator_metadata }`. The drainer
 * stores these on the row before calling the GBP publisher.
 */
import { db } from "../../db";
import { and, eq, gte, sql } from "drizzle-orm";
import { mapguardPosts } from "@shared/schemas/mapguardPosts";
import { clients } from "@shared/schemas/adminCrm";
import { chat } from "../aiService";
import { createLogger } from "../../lib/logger";

const log = createLogger("MapGuardPostGenerator");

const PROMPT_VERSION = "mapguard-gbp-v1";
const MODEL_DEFAULT = process.env.MAPGUARD_POST_MODEL || "claude-sonnet-4-6";
const GBP_MAX_CHARS = 1500;

export interface GeneratedPost {
  content: string;
  media_url: string | null;
  generator_metadata: {
    model: string;
    prompt_version: string;
    tokens?: number;
    cost_cents?: number;
  };
}

const THEME_BRIEF: Record<string, string> = {
  promotion: "Promote a service the business offers. Highlight the value proposition without being pushy. Mention call-to-book or call-for-quote.",
  tip: "Share a practical homeowner/customer tip relevant to the trade. Make it educational and useful, not a sales pitch.",
  service_highlight: "Showcase one specific service the business does. Explain what it involves and the typical outcome.",
  seasonal: "Tie content to the current season — what services or issues are common this time of year for this trade.",
  review_response: "Reference a recent customer-feedback pattern (without quoting an actual review). Reinforce the trust signal.",
  company_update: "Share something about the business itself — service area, certifications, response time, or commitment to quality.",
};

/** Look up basic client fields. Returns null if not found. */
async function loadClientContext(clientId: number) {
  const [row] = await db
    .select({
      business_name: clients.business_name,
      trade_type: clients.trade_type,
      website_url: clients.website_url,
      metadata: clients.metadata,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  return row || null;
}

/** Pull last 30 days of MapGuard-published post bodies for dedup signalling. */
async function recentPublishedBodies(clientId: number): Promise<string[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const rows = await db
    .select({ content: mapguardPosts.content })
    .from(mapguardPosts)
    .where(
      and(
        eq(mapguardPosts.client_id, clientId),
        eq(mapguardPosts.status, "published"),
        gte(mapguardPosts.published_at, cutoff),
      ),
    )
    .orderBy(sql`${mapguardPosts.published_at} DESC`)
    .limit(8);

  return rows.map((r) => r.content || "").filter((c) => c.length > 0);
}

interface GenerateInput {
  clientId: number;
  theme: string;
  quotaPeriod: string; // YYYY-MM
  city?: string | null; // override; falls back to client metadata
}

export async function generateMapguardPost(input: GenerateInput): Promise<GeneratedPost> {
  const ctx = await loadClientContext(input.clientId);
  if (!ctx) throw new Error(`Client ${input.clientId} not found`);

  const recentBodies = await recentPublishedBodies(input.clientId);

  const meta = (ctx.metadata as Record<string, any> | null) || {};
  const city = input.city || meta?.city || meta?.service_area || null;

  const themeBrief = THEME_BRIEF[input.theme] || THEME_BRIEF.tip;

  // Month for seasonal cueing
  const [year, month] = input.quotaPeriod.split("-");
  const monthName = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, 1))
    .toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  const dedupBlock = recentBodies.length
    ? `\n\nRECENT POSTS (do not repeat phrasing or topic):\n${recentBodies.map((b, i) => `${i + 1}. ${b.slice(0, 200)}`).join("\n")}`
    : "";

  const system = `You write Google Business Profile posts for trade-services businesses.

Rules:
- Plain conversational tone — like a small-business owner posting themselves.
- Under ${GBP_MAX_CHARS} characters, ideally 400-800.
- One clear call-to-action at the end (call, book, message, or visit).
- No emojis. No hashtags. No "we are excited to announce" filler.
- Never invent specific pricing, certifications, or guarantees. Only use facts present in the brief.
- Write the post body only — no titles, no preamble, no labels.`;

  const user = `BUSINESS:
- Name: ${ctx.business_name}
- Trade: ${ctx.trade_type || "trade services"}
- City/region: ${city || "their service area"}
- Website: ${ctx.website_url || "n/a"}

THEME: ${input.theme}
THEME BRIEF: ${themeBrief}
MONTH: ${monthName} ${year}
${dedupBlock}

Write the Google Business Profile post body now. Output only the post body, no other text.`;

  const t0 = Date.now();
  const raw = await chat({
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 800,
    modelOverride: MODEL_DEFAULT,
  });
  const elapsedMs = Date.now() - t0;

  let body = raw.trim();
  // Strip any leading "Post:" or markdown header the model may emit.
  body = body.replace(/^(post|gbp post|update)[:\-\s]+/i, "");
  body = body.replace(/^["']|["']$/g, "");
  if (body.length > GBP_MAX_CHARS) body = body.slice(0, GBP_MAX_CHARS - 3) + "...";

  if (body.length < 40) {
    throw new Error(`Generator returned too-short body (${body.length} chars)`);
  }

  log.info("Generated MapGuard post", {
    client_id: input.clientId,
    theme: input.theme,
    chars: body.length,
    elapsed_ms: elapsedMs,
  });

  return {
    content: body,
    media_url: null, // image generation deferred — text-only is GBP-compliant
    generator_metadata: {
      model: MODEL_DEFAULT,
      prompt_version: PROMPT_VERSION,
    },
  };
}

/**
 * Generate an AI reply to a customer review. Used by the review
 * responder. Kept here so the LLM-prompting code lives in one place.
 */
export async function generateMapguardReviewReply(input: {
  clientId: number;
  reviewerName: string | null;
  rating: number; // 1-5
  reviewText: string;
}): Promise<{ reply: string; generator_metadata: GeneratedPost["generator_metadata"] }> {
  const ctx = await loadClientContext(input.clientId);
  if (!ctx) throw new Error(`Client ${input.clientId} not found`);

  const stars = Math.max(1, Math.min(5, Math.round(input.rating)));
  const sentiment =
    stars >= 4 ? "positive"
    : stars <= 2 ? "negative"
    : "neutral";

  const system = `You write owner replies to Google customer reviews for trade-services businesses.

Rules:
- Reply as the business owner. Use "we" and "our team".
- 2-4 sentences. Under 600 characters.
- Plain conversational tone. No emojis. No marketing slogans.
- Always thank the reviewer by name when a name is available.
- For positive reviews: brief gratitude + one specific reference to their feedback.
- For negative/neutral reviews: empathetic acknowledgement, NO defensiveness, invite them to contact directly to make it right. Never argue. Never promise refunds or specific compensation.
- Never invent details that aren't in the review.
- Output only the reply text, nothing else.`;

  const user = `BUSINESS: ${ctx.business_name} (${ctx.trade_type || "trade services"})

REVIEW:
- From: ${input.reviewerName || "Anonymous"}
- Rating: ${stars}/5 (${sentiment})
- Text: ${input.reviewText || "(no text)"}

Write the owner reply now.`;

  const raw = await chat({
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 400,
    modelOverride: MODEL_DEFAULT,
  });

  let reply = raw.trim().replace(/^["']|["']$/g, "");
  if (reply.length > 600) reply = reply.slice(0, 597) + "...";
  if (reply.length < 10) throw new Error("Review reply generator returned too-short text");

  return {
    reply,
    generator_metadata: {
      model: MODEL_DEFAULT,
      prompt_version: `${PROMPT_VERSION}-review-reply`,
    },
  };
}
