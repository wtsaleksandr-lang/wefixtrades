/**
 * AI Quote Writer — QuoteQuick portal Free Tool (interactive).
 *
 * POST /api/portal/free-tools/quote-writer
 *   Auth: requireClient (same as the other portal/free-tools routes)
 *   Body: { jobDetails, trade?, customerName?, tone?, lineItems?,
 *           wantDescription?, wantEmail? }
 *   → { description: string, email: string }
 *
 * Cost protection — this REUSES the exact same QuoteQuick AI infrastructure
 * the AI quote assistant + AI Review Responder use:
 *   - getSharedClient()    → the single shared Anthropic client (no new SDK)
 *   - validateConfig()     → key-present guard (503 if unavailable)
 *   - getUserBudgetSnapshot / estimateCallCost / gateDecision  → the budget
 *     gate runs BEFORE the call (403 budget_exceeded on cap/daily/per-call)
 *   - recordSpend()        → real usage written to ai_spend_log + counters
 *     AFTER the call, so this generation counts against the same lifetime /
 *     daily / per-call caps. It never bypasses the cap.
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

const log = createLogger("PortalQuoteWriter");

const TEXT_MODEL: SupportedModel = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 1100;
/** Rough char-to-token estimator (Anthropic ≈ 4 chars/token for English). */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const TONES = ["professional", "friendly", "premium"] as const;
type Tone = (typeof TONES)[number];

const quoteWriterSchema = z
  .object({
    jobDetails: z.string().min(1).max(4000),
    trade: z.string().max(80).optional().default(""),
    customerName: z.string().max(120).optional().default(""),
    lineItems: z.string().max(2000).optional().default(""),
    tone: z.enum(TONES).optional().default("professional"),
    wantDescription: z.coerce.boolean().optional().default(true),
    wantEmail: z.coerce.boolean().optional().default(true),
  })
  .refine((d) => d.wantDescription || d.wantEmail, {
    message: "Choose at least one output (quote description and/or estimate email).",
  });

const TONE_GUIDANCE: Record<Tone, string> = {
  professional:
    "Professional and courteous. Polished, businesslike, clear and confident. No emojis.",
  friendly:
    "Warm and friendly, like a trusted local tradesperson who genuinely cares. Approachable but still credible. A single tasteful emoji is acceptable in the email but not required.",
  premium:
    "Premium and refined. Confident, high-end, reassuring craftsmanship-led language that justifies a quality price without being boastful. No emojis.",
};

/** Build the system prompt from validated, length-capped inputs. */
function buildSystemPrompt(opts: {
  trade: string;
  tone: Tone;
  customerName: string;
  lineItems: string;
  wantDescription: boolean;
  wantEmail: boolean;
}): string {
  const tradeLabel = opts.trade.trim() || "local trades";
  const customer = opts.customerName.trim();

  const wanted: string[] = [];
  if (opts.wantDescription) {
    wanted.push(
      '- "description": a short, polished, customer-facing SCOPE / QUOTE DESCRIPTION (one or two tight paragraphs) that clearly explains the work in plain, persuasive language a homeowner understands. No greeting or sign-off — it reads as the body of a quote.',
    );
  }
  if (opts.wantEmail) {
    wanted.push(
      `- "email": a ready-to-send ESTIMATE EMAIL${
        customer ? ` addressed to ${customer}` : ""
      }. Include a natural greeting, a brief friendly intro, the scope summarised in plain terms, a clear next step (accept / book / ask questions), and a warm sign-off. Use a placeholder like [Your name] for the sender and [Your business] where appropriate rather than inventing names.`,
    );
  }

  const lines = [
    `You help a ${tradeLabel} business write a professional, persuasive but honest quote for a customer.`,
    "From the job details the owner provides, produce clear, customer-ready text.",
    "",
    "Rules:",
    "- Write for the homeowner/customer, in plain British-friendly trade English.",
    "- Be persuasive and reassuring, but never dishonest or hype-y.",
    "- NEVER invent prices, figures, timescales, guarantees, or details that aren't given. If a price is supplied, use it; if not, leave a clear [price] / [timescale] placeholder for the owner to fill in.",
    "- Don't fabricate the business name or the owner's name — use placeholders.",
    "",
    `Tone: ${TONE_GUIDANCE[opts.tone]}`,
    "",
    "Produce exactly these fields:",
    ...wanted,
    "",
    `Respond ONLY as JSON in exactly this shape: { ${[
      opts.wantDescription ? '"description": "<text>"' : null,
      opts.wantEmail ? '"email": "<text>"' : null,
    ]
      .filter(Boolean)
      .join(", ")} }. No prose outside the JSON.${
      opts.wantDescription && opts.wantEmail
        ? ""
        : " Omit the field that was not requested."
    }`,
  ];
  return lines.join("\n");
}

/** Tolerant extraction of the description/email strings from model output. */
function parseOutput(text: string): { description: string; email: string } {
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
  const obj = (raw as { description?: unknown; email?: unknown } | null) ?? null;
  const description = typeof obj?.description === "string" ? obj.description.trim() : "";
  const email = typeof obj?.email === "string" ? obj.email.trim() : "";
  return { description, email };
}

export function registerPortalQuoteWriterRoutes(app: Express): void {
  app.post(
    "/api/portal/free-tools/quote-writer",
    requireClient,
    async (req: Request, res: Response) => {
      const userId = (req.user as Express.User).id;

      /* (1) Validate input. */
      const parsed = quoteWriterSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "invalid_request", details: parsed.error.format() });
      }
      const {
        jobDetails,
        trade,
        customerName,
        lineItems,
        tone,
        wantDescription,
        wantEmail,
      } = parsed.data;

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
        tone,
        customerName,
        lineItems,
        wantDescription,
        wantEmail,
      });
      const userMessage = [
        "Job details / what the job involves:",
        `"""${jobDetails}"""`,
        lineItems.trim()
          ? `\nRough line items provided by the owner:\n"""${lineItems.trim()}"""`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

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
          log.error("recordSpend failed (quote already generated)", {
            error: spendErr?.message,
          });
        }

        const { description, email } = parseOutput(text);
        const haveRequested =
          (!wantDescription || description.length > 0) &&
          (!wantEmail || email.length > 0);
        if (!haveRequested) {
          return res.status(422).json({
            error: "no_output",
            message:
              "The AI couldn't draft your quote from those details. Add a little more context and try again.",
          });
        }

        return res.json({ description, email });
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
