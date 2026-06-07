/**
 * AI Review Responder — QuoteQuick portal Free Tool (interactive).
 *
 * POST /api/portal/free-tools/review-reply
 *   Auth: requireClient (same as the other portal/free-tools routes)
 *   Body: { reviewText, rating (1-5), businessName, trade?, tone?, keyPoint? }
 *   → { replies: string[] }  (3 short, varied draft replies)
 *
 * Cost protection — this REUSES the exact same QuoteQuick AI infrastructure
 * the AI quote assistant + formula-help endpoint use:
 *   - getSharedClient()    → the single shared Anthropic client (no new SDK)
 *   - validateConfig()     → key-present guard (503 if unavailable)
 *   - getUserBudgetSnapshot / estimateCallCost / gateDecision  → the budget
 *     gate runs BEFORE the call (403 budget_exceeded on cap/daily/per-call)
 *   - recordSpend()        → real usage written to ai_spend_log + counters
 *     AFTER the call, so this draft generation counts against the same
 *     lifetime / daily / per-call caps. It never bypasses the cap.
 *
 * Model: claude-haiku-4-5 (text-only; the cheapest supported model). No
 * images, so no vision tier.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireClient } from "../auth";
import { createLogger } from "../lib/logger";
import { getSharedClient, validateConfig } from "../services/aiService";
import {
  estimateCallCost,
  gateDecision,
  getUserBudgetSnapshot,
  recordSpend,
  type SupportedModel,
} from "../services/quotequickAiBudget";
import { portalAiToolRateLimiter } from "../services/rateLimiter";

const log = createLogger("PortalReviewReply");

const TEXT_MODEL: SupportedModel = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 700;
/** Rough char-to-token estimator (Anthropic ≈ 4 chars/token for English). */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const TONES = ["professional", "friendly", "apologetic"] as const;
type Tone = (typeof TONES)[number];

const reviewReplySchema = z.object({
  reviewText: z.string().min(1).max(4000),
  rating: z.coerce.number().int().min(1).max(5),
  businessName: z.string().min(1).max(120),
  trade: z.string().max(80).optional().default(""),
  tone: z.enum(TONES).optional().default("professional"),
  keyPoint: z.string().max(300).optional().default(""),
});

const TONE_GUIDANCE: Record<Tone, string> = {
  professional:
    "Professional and courteous. Polished, businesslike, warm but not casual. No emojis.",
  friendly:
    "Warm and friendly, like a local business owner who genuinely cares. A single tasteful emoji is acceptable but not required.",
  apologetic:
    "Apologetic but confident — sincerely acknowledge the concern and take ownership, while staying calm and professional. Do not grovel or admit legal fault. No emojis.",
};

/** Build the system prompt from validated, length-capped inputs. */
function buildSystemPrompt(opts: {
  trade: string;
  rating: number;
  tone: Tone;
  businessName: string;
  keyPoint: string;
}): string {
  const tradeLabel = opts.trade.trim() || "local trades";
  const sentiment =
    opts.rating >= 4
      ? "positive"
      : opts.rating === 3
        ? "mixed"
        : "negative";

  const lines = [
    `You are helping the owner of a ${tradeLabel} business ("${opts.businessName}") write replies to a ${opts.rating}-star (${sentiment}) Google review.`,
    "",
    "Write 3 short, distinct, on-brand reply options the owner can choose between. Each reply should:",
    "- be 2-4 sentences, ready to post as-is",
    "- thank the customer by acknowledging their specific feedback",
    opts.rating <= 3
      ? "- calmly address the concern, take ownership where appropriate, and offer to make it right (invite them to get in touch)"
      : "- reinforce the good experience and warmly invite them back / to refer others",
    "- sign off naturally as the business (do not invent a person's name)",
    "- never fabricate facts, discounts, names, or details that aren't in the review or the owner's note",
    "- vary the wording and structure across the 3 options so they don't read as duplicates",
    "",
    `Tone: ${TONE_GUIDANCE[opts.tone]}`,
  ];
  if (opts.keyPoint.trim()) {
    lines.push(
      "",
      `The owner specifically wants each reply to naturally work in this point: "${opts.keyPoint.trim()}"`,
    );
  }
  lines.push(
    "",
    'Respond ONLY as JSON in exactly this shape: { "replies": ["<reply 1>", "<reply 2>", "<reply 3>"] }. No prose outside the JSON.',
  );
  return lines.join("\n");
}

/** Tolerant extraction of the replies array from the model's text output. */
function parseReplies(text: string): string[] {
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (m) {
      try {
        raw = JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
  }
  const arr = (raw as { replies?: unknown } | null)?.replies;
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function registerPortalReviewReplyRoutes(app: Express): void {
  app.post(
    "/api/portal/free-tools/review-reply",
    requireClient,
    async (req: Request, res: Response) => {
      const userId = (req.user as Express.User).id;

      /* (0) Per-user rate limit — ~10 generations/min/user, keyed on userId
       *     (authed endpoint), IP fallback. */
      const rlKey = `portal-review-reply:${userId ?? req.ip}`;
      if (!(await portalAiToolRateLimiter.check(rlKey))) {
        return res.status(429).json({
          error: "rate_limited",
          message: "You're generating replies too quickly. Please wait a moment and try again.",
        });
      }

      /* (1) Validate input. */
      const parsed = reviewReplySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "invalid_request", details: parsed.error.format() });
      }
      const { reviewText, rating, businessName, trade, tone, keyPoint } =
        parsed.data;

      /* (2) Key-present guard — clean code instead of a 500. */
      const cfg = validateConfig();
      if (!cfg.valid) {
        return res.status(503).json({ error: "ai_unavailable", reason: cfg.error });
      }

      /* (3) Budget snapshot + pre-call gate (reuses the QuoteQuick AI cap). */
      let snapshot;
      try {
        snapshot = await getUserBudgetSnapshot(userId);
      } catch (err: any) {
        log.error("budget snapshot failed pre-call", { error: err?.message });
        return res.status(503).json({ error: "budget_lookup_failed" });
      }

      const systemPrompt = buildSystemPrompt({
        trade,
        rating,
        tone,
        businessName,
        keyPoint,
      });
      const userMessage = `Here is the ${rating}-star review to reply to:\n\n"""${reviewText}"""`;

      const estimate = estimateCallCost({
        model: TEXT_MODEL,
        systemPromptTokens: approxTokens(systemPrompt),
        historyTokens: 0,
        messageTokens: approxTokens(userMessage),
        hasImage: false,
      });
      const decision = gateDecision(snapshot, estimate, false);
      if (!decision.allowed) {
        return res.status(403).json({
          error: "budget_exceeded",
          code: decision.code,
          snapshot: {
            cumulative_usd: snapshot.cumulative_usd,
            today_usd: snapshot.today_usd,
            config: snapshot.config,
            scope: snapshot.scope,
          },
        });
      }

      /* (4) Single non-streaming call via the shared client. */
      try {
        const client = getSharedClient();
        const completion = await client.messages.create({
          model: TEXT_MODEL,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        });

        const text = (completion.content || [])
          .filter((b: any) => b?.type === "text")
          .map((b: any) => b.text)
          .join("")
          .trim();

        /* (5) Record real spend against the same caps. */
        const usage = (completion as any)?.usage ?? {};
        try {
          await recordSpend({
            userId,
            model: TEXT_MODEL,
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            imageCount: 0,
            cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
            cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          });
        } catch (spendErr: any) {
          // Spend logging must never swallow a successful generation, but we
          // still surface it in logs so the cap counters can be reconciled.
          log.error("recordSpend failed (reply already generated)", {
            error: spendErr?.message,
          });
        }

        const replies = parseReplies(text);
        if (replies.length === 0) {
          return res.status(422).json({
            error: "no_replies",
            message: "The AI couldn't draft replies for that review. Please try again.",
          });
        }

        return res.json({ replies });
      } catch (err: any) {
        log.error("anthropic call failed", {
          error: err?.message,
          status: err?.status,
        });
        return res.status(502).json({
          error: "ai_error",
          message: "Couldn't reach the AI service. Please try again in a moment.",
        });
      }
    },
  );
}
