/**
 * AI review response drafting service.
 * Uses Claude (via aiService) to generate owner responses to public reviews.
 *
 * Reuses:
 * - aiService.chat() for Claude API calls (singleton client, retry logic)
 * - usageTracker.logUsage() for cost/usage tracking
 *
 * Prompt strategy:
 * - Adapts tone based on rating (positive/negative/neutral)
 * - Concise, human-sounding, local-service-business friendly
 * - No emoji, no corporate speak, no keyword stuffing
 * - Negative reviews: calm, recovery-oriented, no legal admissions
 */

import { chat, getModel } from "./aiService";
import { logUsage } from "./usageTracker";
import { storage } from "../storage";
import type { MonitoredReview, Client } from "@shared/schema";

/** Max characters for a generated draft. */
const MAX_DRAFT_LENGTH = 800;

/** Max tokens for AI generation. */
const MAX_TOKENS = 400;

type ReviewTone = "positive" | "negative" | "neutral";

function classifyTone(rating: number): ReviewTone {
  if (rating >= 4) return "positive";
  if (rating <= 2) return "negative";
  return "neutral";
}

function buildSystemPrompt(tone: ReviewTone): string {
  const base = `You are a review response writer for local trades and service businesses (plumbers, electricians, roofers, HVAC, etc).

Your job is to draft a short, genuine owner response to a public Google review.

HARD RULES:
- Write in first person as the business owner
- Maximum 3-4 sentences
- Sound like a real person, not a corporation or a bot
- No emoji
- No exclamation marks overload (one max)
- No keyword stuffing or SEO language
- No generic phrases like "We value your feedback" or "Your satisfaction is our priority"
- No hallucinated details about the job — only reference what the reviewer mentioned
- Do not repeat the reviewer's name more than once
- Use the business name naturally if it fits, but don't force it`;

  if (tone === "positive") {
    return `${base}

POSITIVE REVIEW GUIDELINES:
- Express genuine gratitude (not over-the-top)
- Briefly acknowledge what went well if they mentioned specifics
- Keep it warm and local
- End naturally — no hard sell or call-to-action`;
  }

  if (tone === "negative") {
    return `${base}

NEGATIVE REVIEW GUIDELINES:
- Stay calm and professional
- Do NOT apologize excessively or grovel
- Do NOT admit fault, liability, or specific blame
- Do NOT argue with the customer or question their account
- Do NOT promise refunds or specific remedies
- Acknowledge their frustration briefly
- Invite them to contact you directly to resolve the issue
- Keep it short — long defensive responses look worse
- Use phrasing like "We'd like to make this right" or "Please reach out so we can look into this"`;
  }

  // neutral
  return `${base}

NEUTRAL/MIXED REVIEW GUIDELINES:
- Thank them for the feedback
- Acknowledge the positive aspects they mentioned
- If they mentioned a concern, note you appreciate the input
- Keep it balanced and brief
- Do not be defensive about the neutral rating`;
}

function buildUserMessage(opts: {
  businessName: string;
  tradeType: string | null;
  reviewerName: string;
  rating: number;
  reviewText: string | null;
  tone: ReviewTone;
}): string {
  const parts = [
    `Business: ${opts.businessName}`,
    opts.tradeType ? `Trade: ${opts.tradeType}` : null,
    `Rating: ${opts.rating}/5 stars`,
    `Reviewer: ${opts.reviewerName}`,
    `Review: ${opts.reviewText || "(No text provided)"}`,
    "",
    `Write a ${opts.tone} review response. Keep it under 4 sentences.`,
  ];
  return parts.filter(Boolean).join("\n");
}

export interface DraftResult {
  draft: string;
  tone: ReviewTone;
  model: string;
  generated: boolean;
  error?: string;
}

/**
 * Generate an AI draft response for a monitored review.
 * @param toneOverride — if provided, overrides the auto-classified tone
 */
export async function generateReviewDraft(
  review: MonitoredReview,
  client: Client | null,
  toneOverride?: ReviewTone,
): Promise<DraftResult> {
  const tone = toneOverride || classifyTone(review.rating);
  const model = getModel();
  const businessName = client?.business_name || "our team";
  const tradeType = client?.trade_type || null;

  const systemPrompt = buildSystemPrompt(tone);
  const userMessage = buildUserMessage({
    businessName,
    tradeType,
    reviewerName: review.reviewer_name,
    rating: review.rating,
    reviewText: review.review_text,
    tone,
  });

  const startMs = Date.now();
  let draft: string;

  try {
    const raw = await chat({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: MAX_TOKENS,
    });

    // Clean up: trim whitespace, strip quotes if AI wrapped the response
    draft = raw.trim();
    if (draft.startsWith('"') && draft.endsWith('"')) {
      draft = draft.slice(1, -1);
    }

    // Enforce length limit
    if (draft.length > MAX_DRAFT_LENGTH) {
      // Try to cut at last sentence boundary
      const truncated = draft.slice(0, MAX_DRAFT_LENGTH);
      const lastPeriod = truncated.lastIndexOf(".");
      draft = lastPeriod > MAX_DRAFT_LENGTH * 0.5
        ? truncated.slice(0, lastPeriod + 1)
        : truncated + "…";
    }

    // Safety: reject blank output
    if (!draft || draft.length < 10) {
      draft = "";
      throw new Error("AI returned blank or trivially short response");
    }

    const latencyMs = Date.now() - startMs;

    // Log usage (fire-and-forget)
    logUsage({
      model,
      surface: "admin",
      provider: "anthropic",
      channel: "review_draft",
      success: true,
      latencyMs,
      metadata: {
        review_id: review.id,
        client_id: review.client_id,
        rating: review.rating,
        tone,
      },
    }).catch(() => {});

    return { draft, tone, model, generated: true };
  } catch (err: any) {
    const latencyMs = Date.now() - startMs;

    // Log failure
    logUsage({
      model,
      surface: "admin",
      provider: "anthropic",
      channel: "review_draft",
      success: false,
      errorMessage: err.message,
      latencyMs,
      metadata: {
        review_id: review.id,
        tone,
      },
    }).catch(() => {});

    // Fallback: provide a safe generic response
    const fallback = tone === "positive"
      ? `Thank you for taking the time to leave a review, ${review.reviewer_name}. We really appreciate it.`
      : tone === "negative"
        ? `Thank you for your feedback, ${review.reviewer_name}. We'd like to make this right — please contact us directly so we can look into this.`
        : `Thank you for your feedback, ${review.reviewer_name}. We appreciate you sharing your experience.`;

    return {
      draft: fallback,
      tone,
      model,
      generated: false,
      error: err.message,
    };
  }
}
