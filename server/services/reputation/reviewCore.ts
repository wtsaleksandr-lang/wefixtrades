/**
 * Review classification and reply generation — shared core.
 *
 * Platform-agnostic review processing used by both SocialSync
 * and ReputationShield. No platform-specific API calls in this file.
 */
import { chat } from "../aiService";
import type { Review } from "@shared/schema";

/* ═══ Classification ═══ */

export type Sentiment = "positive" | "neutral" | "negative" | "urgent";

export interface ReviewClassification {
  sentiment: Sentiment;
  needs_reply: boolean;
  eligible_for_auto_reply: boolean;
  requires_human_attention: boolean;
  escalation: boolean;
}

const ESCALATION_KEYWORDS = [
  "lawsuit", "attorney", "lawyer", "health department", "bbb",
  "report", "scam", "fraud", "injured", "damage", "dangerous",
  "news", "media", "worst experience", "never use",
];

/**
 * Classify a review by star rating and content. Platform-agnostic.
 */
export function classifyReview(stars: number, text: string | undefined, hasOwnerReply: boolean): ReviewClassification {
  const lower = (text || "").toLowerCase();
  const hasEscalation = ESCALATION_KEYWORDS.some(k => lower.includes(k));

  if (stars >= 4) {
    return {
      sentiment: "positive",
      needs_reply: !hasOwnerReply,
      eligible_for_auto_reply: !hasOwnerReply,
      requires_human_attention: false,
      escalation: false,
    };
  }

  if (stars === 3) {
    return {
      sentiment: "neutral",
      needs_reply: !hasOwnerReply,
      eligible_for_auto_reply: false,
      requires_human_attention: !hasOwnerReply,
      escalation: hasEscalation,
    };
  }

  return {
    sentiment: hasEscalation ? "urgent" : "negative",
    needs_reply: !hasOwnerReply,
    eligible_for_auto_reply: false,
    requires_human_attention: true,
    escalation: hasEscalation,
  };
}

/* ═══ Auto-Reply Policy ═══ */

/**
 * Determine if a review should be auto-replied to.
 * Policy:
 *   4-5 stars: auto-reply
 *   3 stars: draft only
 *   1-2 stars: draft only, requires human
 *   Escalated: never auto-reply
 */
export function shouldAutoReply(review: Review): boolean {
  if (review.has_existing_owner_reply) return false;
  if (review.escalation_flag) return false;
  if ((review.star_rating || 0) >= 4) return true;
  return false;
}

/* ═══ Reply Generation ═══ */

export interface ReplyContext {
  niche?: string;
  location?: string;
  tone?: string;
  businessName?: string;
}

/**
 * Generate a review reply using AI. Platform-agnostic.
 */
export async function generateReply(review: Review, context: ReplyContext = {}): Promise<string> {
  const niche = context.niche || "home services";
  const location = context.location || "local area";
  const tone = context.tone || "professional";
  const businessContext = `a ${niche} business in ${location}`;

  const systemPrompt = `You are writing a review reply on behalf of ${businessContext}.
Tone: ${tone}, genuine, grateful, brief.

Rules:
- Sound like a real business owner, not a corporate support bot
- Keep it 1-3 sentences max
- Never use "We appreciate your feedback" or "Thank you for your valuable feedback" verbatim
- For positive reviews: warm thanks, mention something specific if possible
- For neutral reviews: appreciative, acknowledge concern, offer to help
- For negative reviews: calm, empathetic, non-defensive, invite offline resolution
- Never make promises about compensation or legal matters
- Never argue or blame the customer
- No emojis in negative review replies

Respond with the reply text only. No quotes, no labels, no explanation.`;

  const reviewSummary = review.review_text
    ? `"${review.review_text.slice(0, 300)}"`
    : "(no text, just a star rating)";

  const response = await chat({
    system: systemPrompt,
    messages: [{
      role: "user",
      content: `Write a reply to this ${review.star_rating}-star review from ${review.reviewer_name || "a customer"}:\n\n${reviewSummary}`,
    }],
    maxTokens: 300,
    surface: "reputation",
  });

  return response.trim();
}
