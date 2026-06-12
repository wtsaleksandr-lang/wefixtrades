/**
 * Wave K — QuoteQuick editor AI assistant endpoint.
 *
 * POST /api/quotequick/ai/chat
 *   Body: { message, image?, history[], shellState }
 *   Auth: anonymous + free (Wave WAI). Logged-in callers keep the DB budget
 *     caps; anonymous callers are bounded by a strict per-IP rate limiter.
 *   Streams: server-sent events (text deltas + tool calls + final budget summary)
 *
 * Model routing:
 *   - text-only       → claude-haiku-4-5-20251001
 *   - includes image  → claude-sonnet-4-6
 *
 * Budget enforcement runs before the call (estimate-based gate) and after the
 * call (real usage written to ai_spend_log + cumulative counters).
 *
 * GET /api/quotequick/ai/budget
 *   Returns the current snapshot for the UI's budget meter.
 */

import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createLogger } from "../lib/logger";
import { chat, getSharedClient, NoAIProviderError, validateConfig } from "../services/aiService";
import {
  estimateCallCost,
  gateDecision,
  getUserBudgetSnapshot,
  recordSpend,
  type SupportedModel,
} from "../services/quotequickAiBudget";
import {
  chatRateLimiter,
  anonWizardAiPerMinLimiter,
  anonWizardAiPerDayLimiter,
} from "../services/rateLimiter";
import { QUOTEQUICK_AI_TOOLS, QUOTEQUICK_SYSTEM_PROMPT } from "../services/quotequickAiTools";
import { CLAUDE_HAIKU, CLAUDE_SONNET } from "../services/aiModels";
import { validateFormula } from "@shared/formulaEngine";
import { getEffectiveTemplates } from "../lib/applyQuoteQuickOverrides";
import { db } from "../db";
import { clients, clientServices, onboardingSubmissions } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { applyOnboardingToAIConfig } from "../services/onboardingMappers";
import { renderOnboardingPatch } from "../services/promptBuilder";

const log = createLogger("QuoteQuickAiChat");

const TEXT_MODEL: SupportedModel = CLAUDE_HAIKU;
const VISION_MODEL: SupportedModel = CLAUDE_SONNET;

const MAX_HISTORY_TURNS = 20;
const MAX_OUTPUT_TOKENS = 1024;
/** Approximation of the cached system prompt token count, used by the estimator. */
const SYSTEM_PROMPT_TOKEN_EST = 3500;
/** Rough char-to-token estimator (Anthropic ≈ 4 chars/token for English). */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const chatRequestSchema = z.object({
  message: z.string().min(1).max(8000),
  image: z.string().max(2_000_000).optional(), // data URL or base64 payload
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(20_000),
  })).max(MAX_HISTORY_TURNS * 2).default([]),
  shellState: z.record(z.any()).default({}),
});

/** Strip the `data:image/<type>;base64,` prefix and return (mediaType, base64). */
function parseImage(input: string): { mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; b64: string } | null {
  const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/i.exec(input.trim());
  if (m) return { mediaType: m[1].toLowerCase() as any, b64: m[2] };
  // Bare base64 — assume PNG.
  if (/^[A-Za-z0-9+/=]+$/.test(input.slice(0, 100))) {
    return { mediaType: "image/png", b64: input };
  }
  return null;
}

/**
 * Pure helper — model selection + user-block assembly for one chat turn.
 *
 * Extracted so the fused text+image behavior is unit-testable without an
 * Express request, an SSE stream, or a live Anthropic client. The route
 * handler calls this and feeds the result straight into the streaming call.
 *
 * Invariants this guarantees (and the test asserts):
 *   - A parseable image present → vision model (Sonnet); else text model (Haiku).
 *   - The text message is ALWAYS the first user block (even in the fused case),
 *     so the model receives the user's written intent alongside the image.
 *   - When an image is present, an image block is appended after the text block.
 *   - `tools` are NOT affected here — the route offers QUOTEQUICK_AI_TOOLS
 *     (incl. replace_template) unconditionally, so the fused case keeps them.
 */
export function buildChatTurn(
  message: string,
  image: string | undefined,
  models: { visionModel: SupportedModel; textModel: SupportedModel } = {
    visionModel: VISION_MODEL,
    textModel: TEXT_MODEL,
  },
): { hasImage: boolean; model: SupportedModel; userBlocks: any[] } {
  const parsedImg = image ? parseImage(image) : null;
  const hasImage = Boolean(parsedImg);
  const model: SupportedModel = hasImage ? models.visionModel : models.textModel;
  const userBlocks: any[] = [{ type: "text", text: message }];
  if (hasImage && parsedImg) {
    userBlocks.push({
      type: "image",
      source: { type: "base64", media_type: parsedImg.mediaType, data: parsedImg.b64 },
    });
  }
  return { hasImage, model, userBlocks };
}

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Wave WAI — the wizard AI assistant is anonymous + free. `req.user` may or may
 * not be present (passport still populates it when a logged-in session exists,
 * but most wizard traffic is anonymous). This helper returns the numeric user
 * id when authed, else `null` — never throws, never dereferences a null user.
 */
function optionalUserId(req: Request): number | null {
  const u = req.user as Express.User | undefined;
  return u?.id ?? null;
}

/**
 * Wave WAI — abuse control for the anonymous wizard AI surface.
 *
 * For an ANONYMOUS caller there is no DB budget row (the budget service is
 * keyed on a numeric user id), so a strict per-IP rate limit is the spend
 * ceiling: a per-minute burst cap AND a per-day cap, both keyed on the
 * caller's IP. LOGGED-IN callers are exempt here — they keep the DB budget
 * caps downstream.
 *
 * Returns null when the request may proceed, or a `{ status, body }` to send
 * (always 429) when the caller is rate-limited.
 *
 * Both the per-minute and per-day buckets are SHARED across the anonymous
 * wizard AI text surfaces (chat + formula-help). That's deliberately stricter
 * than a per-surface bucket: a single IP's total anonymous AI text usage is
 * capped in aggregate, so it can't pump the per-minute/per-day ceiling
 * separately on each endpoint.
 */
async function enforceAnonAiLimits(
  req: Request,
  userId: number | null,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  // Authed users are bounded by their DB budget; skip the anon IP limiters.
  if (userId != null) return null;

  const ip = req.ip || req.socket?.remoteAddress || "unknown";

  // Per-day cap first (the hard ceiling), then the per-minute burst cap.
  const dayOk = await anonWizardAiPerDayLimiter.check(`anon-wizard-ai-day:${ip}`);
  if (!dayOk) {
    return {
      status: 429,
      body: {
        error: "rate_limited",
        scope: "daily",
        message:
          "You've reached today's free AI usage limit. Create a free account or try again tomorrow.",
      },
    };
  }

  const minOk = await anonWizardAiPerMinLimiter.check(`anon-wizard-ai-min:${ip}`);
  if (!minOk) {
    return {
      status: 429,
      body: {
        error: "rate_limited",
        scope: "minute",
        message:
          "You're sending messages too quickly. Please wait a moment and try again.",
      },
    };
  }

  return null;
}

/**
 * W-AZ-3: Load the most recent submitted onboarding for this user's QuoteQuick
 * service and project it through the mapper registry. Returns "" when no patch
 * is available; safe-fails on any DB error so the AI chat is never blocked by
 * a missing onboarding row.
 */
async function loadQuoteQuickOnboardingBlock(userId: number): Promise<string> {
  try {
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.user_id, userId))
      .limit(1);
    if (!client) return "";

    const [sub] = await db
      .select({
        id: onboardingSubmissions.id,
        client_service_id: onboardingSubmissions.client_service_id,
        client_id: onboardingSubmissions.client_id,
        template_id: onboardingSubmissions.template_id,
        access_token: onboardingSubmissions.access_token,
        status: onboardingSubmissions.status,
        responses: onboardingSubmissions.responses,
        sent_at: onboardingSubmissions.sent_at,
        submitted_at: onboardingSubmissions.submitted_at,
        approved_at: onboardingSubmissions.approved_at,
        approved_by: onboardingSubmissions.approved_by,
        actor_type: onboardingSubmissions.actor_type,
        metadata: onboardingSubmissions.metadata,
        created_at: onboardingSubmissions.created_at,
        updated_at: onboardingSubmissions.updated_at,
      })
      .from(onboardingSubmissions)
      .innerJoin(clientServices, eq(onboardingSubmissions.client_service_id, clientServices.id))
      .where(and(
        eq(onboardingSubmissions.client_id, client.id),
        sql`${clientServices.service_id} LIKE 'quotequick%'`,
        eq(onboardingSubmissions.status, "submitted"),
      ))
      .orderBy(desc(onboardingSubmissions.submitted_at))
      .limit(1);
    if (!sub) return "";

    const patch = await applyOnboardingToAIConfig("quotequick", sub as any);
    return renderOnboardingPatch(patch);
  } catch (err) {
    log.warn("QuoteQuick onboarding patch lookup failed", { error: (err as Error).message });
    return "";
  }
}

export function registerQuoteQuickAiChatRoutes(app: Express): void {
  /* ─── Budget snapshot (GET) ──────────────────────────────────────────
   * Wave WAI — anonymous + free. No requireAuth. Anonymous callers have no
   * DB budget row, so we return a benign "anonymous" snapshot (no spend, no
   * caps surfaced) rather than a 401. The client's budget meter then simply
   * shows nothing to enforce for anonymous use; the per-IP rate limiter on
   * the chat endpoint is the real anonymous ceiling. */
  app.get("/api/quotequick/ai/budget", async (req: Request, res: Response) => {
    const userId = optionalUserId(req);
    if (userId == null) {
      // Anonymous — no per-user budget exists. Report an empty, uncapped-
      // looking snapshot. Spend is bounded by the per-IP rate limiter, not
      // by a DB budget row.
      return res.json({
        cumulative_usd: 0,
        today_usd: 0,
        images_used: 0,
        config: null,
        scope: "anonymous",
        tier: null,
      });
    }
    try {
      const snapshot = await getUserBudgetSnapshot(userId);
      res.json({
        cumulative_usd: snapshot.cumulative_usd,
        today_usd: snapshot.today_usd,
        images_used: snapshot.images_used,
        config: snapshot.config,
        scope: snapshot.scope,
        tier: snapshot.tier,
      });
    } catch (err: any) {
      log.error("budget snapshot failed", { error: err?.message });
      res.status(500).json({ error: "budget_snapshot_failed" });
    }
  });

  /* ─── Streaming chat (POST) ──────────────────────────────────────────
   * Wave WAI — anonymous + free, all tiers. No requireAuth, no Business-tier
   * gate. Logged-in callers keep the DB budget caps; anonymous callers are
   * bounded by the per-IP rate limiter (the anonymous spend ceiling).
   *
   * NOTE: the body may carry a base64 image (schema max 2,000,000 chars,
   * ~1.9 MB). The global express.json() parser in server/index.ts has a
   * 100 KB limit and runs first — the raised limit for this path is mounted
   * ahead of it via server/lib/bodyLimits.ts ("/api/quotequick/ai/chat" →
   * 3mb). Do NOT add a route-scoped parser here; it would be dead code. */
  app.post("/api/quotequick/ai/chat", async (req: Request, res: Response) => {
    const userId = optionalUserId(req);

    /* (0) Rate limit — runs before any SSE headers so we can return a clean
     *     JSON 429.
     *       - Authed: ~20 chats/min/user, keyed on userId (DB budget caps
     *         downstream are the real ceiling).
     *       - Anonymous: strict per-IP per-minute + per-day caps (the only
     *         ceiling, since there's no DB budget row). */
    if (userId != null) {
      if (!(await chatRateLimiter.check(`qq-ai-chat:${userId}`))) {
        return res.status(429).json({
          error: "rate_limited",
          message: "You're sending messages too quickly. Please wait a moment and try again.",
        });
      }
    } else {
      const limited = await enforceAnonAiLimits(req, userId);
      if (limited) return res.status(limited.status).json(limited.body);
    }

    /* (1) Validate input. */
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request", details: parsed.error.format() });
    }
    const { message, image, history, shellState } = parsed.data;

    /* (2) Validate the Anthropic key. We don't 500 the whole API just
     *     because the key is missing — give the client a clean code. */
    const cfg = validateConfig();
    if (!cfg.valid) {
      return res.status(503).json({ error: "ai_unavailable", reason: cfg.error });
    }

    /* (3) Decide which model + assemble the user blocks. The text message is
     *     always the first block, so a FUSED text+image turn sends the user's
     *     written intent alongside the screenshot (see buildChatTurn). */
    const { hasImage, model, userBlocks } = buildChatTurn(message, image);

    /* (4) Estimate this call's cost and, for AUTHED callers, gate against the
     *     DB budget. Anonymous callers have no budget row; their ceiling is
     *     the per-IP rate limiter applied in step (0). */
    const historyTokens = history.reduce((acc, h) => acc + approxTokens(h.content), 0);
    const messageTokens = approxTokens(message);
    const estimate = estimateCallCost({
      model,
      systemPromptTokens: SYSTEM_PROMPT_TOKEN_EST,
      historyTokens,
      messageTokens,
      hasImage,
    });

    let decision: ReturnType<typeof gateDecision> | null = null;
    if (userId != null) {
      let snapshot;
      try {
        snapshot = await getUserBudgetSnapshot(userId);
      } catch (err: any) {
        log.error("budget snapshot failed pre-call", { error: err?.message });
        return res.status(503).json({ error: "budget_lookup_failed" });
      }

      decision = gateDecision(snapshot, estimate, hasImage);
      if (!decision.allowed) {
        return res.status(403).json({
          error: "budget_exceeded",
          code: decision.code,
          snapshot: {
            cumulative_usd: snapshot.cumulative_usd,
            today_usd: snapshot.today_usd,
            images_used: snapshot.images_used,
            config: snapshot.config,
            scope: snapshot.scope,
          },
        });
      }
    }

    /* (5) Headers for SSE. */
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    sseWrite(res, "open", { model, estimate_usd: estimate });

    /* (6) Build the Anthropic messages payload. `userBlocks` was assembled in
     *     step (3) by buildChatTurn — text first, image (when present) after. */
    const messages: Anthropic.MessageParam[] = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userBlocks.length === 1 ? message : userBlocks },
    ];

    // Wave W-AI-2 — inject the live merged template catalogue so `apply_template`
    // can reference admin-edited and admin-created templates by id. Pulled
    // server-side via the merge helper (no HTTP loop). Accepts up to 60s
    // staleness per the matching `Cache-Control` on the public endpoint —
    // but here we read straight from the DB on every call (the AI chat is
    // already a per-request flow, so the freshness cost is negligible and
    // we get strictly up-to-date data).
    let templateCatalogue: string;
    try {
      const merged = await getEffectiveTemplates();
      templateCatalogue = merged
        .map((t) => `- ${t.id} (${t.name} · ${t.category})`)
        .join("\n");
    } catch (catalogueErr) {
      log.warn("template catalogue load failed; AI prompt will omit list", {
        err: (catalogueErr as Error).message,
      });
      templateCatalogue = "(unavailable)";
    }

    // W-AZ-3: pull QuoteQuick onboarding answers into the AI prompt context.
    // Anonymous callers have no onboarding row — skip the lookup entirely.
    const onboardingBlock = userId != null ? await loadQuoteQuickOnboardingBlock(userId) : "";

    const systemBlocks = [
      {
        type: "text" as const,
        text:
          `${QUOTEQUICK_SYSTEM_PROMPT}\n\n` +
          `AVAILABLE TEMPLATES (id · name · category):\n${templateCatalogue}\n\n` +
          `CURRENT EDITOR STATE (JSON):\n${JSON.stringify(shellState).slice(0, 6000)}` +
          (onboardingBlock ? `\n${onboardingBlock}` : ""),
        cache_control: { type: "ephemeral" as const },
      },
    ];

    /* (7) Stream from Anthropic. We collect tool-use blocks and emit them
     *     as SSE events as they arrive. */
    const client: Anthropic = getSharedClient();
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = client.messages.stream({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemBlocks as any,
        messages: messages as any,
        tools: QUOTEQUICK_AI_TOOLS as any,
      } as any, {
        // Spec calls for prompt-caching beta header; the SDK no longer
        // requires it for cache_control, but we set it for safety.
        headers: { "anthropic-beta": "prompt-caching-2024-07-31" },
      } as any);

      stream.on("text", (delta: string) => {
        sseWrite(res, "text", { delta });
      });

      stream.on("contentBlock", (block: any) => {
        if (block?.type === "tool_use") {
          sseWrite(res, "tool_use", {
            id: block.id,
            name: block.name,
            input: block.input ?? {},
          });
        }
      });

      stream.on("error", (err: Error) => {
        log.error("stream error", { error: err?.message });
        sseWrite(res, "error", { message: String(err?.message ?? err) });
      });

      const final = await stream.finalMessage();
      const usage = (final as any)?.usage ?? {};
      // Anthropic's usage object splits prompt input into three buckets:
      //   - input_tokens                (fresh, billed at 1× input rate)
      //   - cache_creation_input_tokens (cache writes, 1.25× input rate)
      //   - cache_read_input_tokens     (cache hits, 0.10× input rate)
      // We track all three so the cumulative-cap doesn't undercount real spend.
      const freshInput = usage.input_tokens ?? 0;
      const cacheCreation = usage.cache_creation_input_tokens ?? 0;
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      inputTokens = freshInput + cacheRead + cacheCreation;
      outputTokens = usage.output_tokens ?? 0;

      /* (8) Record actual spend — AUTHED callers only. Anonymous callers have
       *     no DB budget row to debit; their usage is bounded by the per-IP
       *     rate limiter, so we skip recordSpend (it requires a numeric user
       *     id) and report a zeroed snapshot to the client. */
      let cost_usd = 0;
      let after: Awaited<ReturnType<typeof getUserBudgetSnapshot>> | null = null;
      if (userId != null) {
        ({ cost_usd } = await recordSpend({
          userId,
          model,
          inputTokens: freshInput,
          outputTokens,
          imageCount: hasImage ? 1 : 0,
          cacheCreationTokens: cacheCreation,
          cacheReadTokens: cacheRead,
        }));
        after = await getUserBudgetSnapshot(userId);
      }

      sseWrite(res, "done", {
        cost_usd,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        snapshot: after
          ? {
              cumulative_usd: after.cumulative_usd,
              today_usd: after.today_usd,
              images_used: after.images_used,
              config: after.config,
            }
          : { cumulative_usd: 0, today_usd: 0, images_used: 0, config: null },
        warn: decision?.allowed ? decision.warn : false,
      });
      res.end();
    } catch (err: any) {
      log.error("anthropic call failed", { error: err?.message, status: err?.status });
      sseWrite(res, "error", { message: String(err?.message ?? "ai_error"), status: err?.status });
      res.end();
    }
  });

  /* ─── Wave AD-1 — formula help (POST) ───────────────────────────────────
   * Plain-language → ONE formula expression, constrained to the fields and
   * preceding calculations the caller passes in. Lives here (not aiRoutes)
   * so it shares the QuoteQuick auth + the existing Anthropic shared client.
   * Path is `/api/ai/formula-help` per the Wave AD spec (parallels the
   * existing `/api/ai/generate-formula` legacy endpoint but is Anthropic-
   * backed and field-aware via the request payload). */
  const formulaHelpSchema = z.object({
    prompt: z.string().min(2).max(600),
    availableFields: z.array(z.string().min(1).max(120)).max(40).default([]),
    precedingCalcs: z.array(z.string().min(1).max(120)).max(20).default([]),
  });

  app.post("/api/ai/formula-help", async (req: Request, res: Response) => {
    const userId = optionalUserId(req);

    /* (0) Rate limit.
     *       - Authed: ~20 formula-help calls/min/user, keyed on userId.
     *       - Anonymous: strict per-IP per-minute + per-day caps (shared anon
     *         wizard-AI buckets — the only ceiling, no DB budget row). */
    if (userId != null) {
      if (!(await chatRateLimiter.check(`qq-formula-help:${userId}`))) {
        return res.status(429).json({
          error: "rate_limited",
          message: "You're requesting formula help too quickly. Please wait a moment and try again.",
        });
      }
    } else {
      const limited = await enforceAnonAiLimits(req, userId);
      if (limited) return res.status(limited.status).json(limited.body);
    }

    const parsed = formulaHelpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request", details: parsed.error.format() });
    }
    const { prompt, availableFields, precedingCalcs } = parsed.data;

    const cfg = validateConfig();
    if (!cfg.valid) {
      return res.status(503).json({ error: "ai_unavailable", reason: cfg.error });
    }

    const fieldList = availableFields.length
      ? availableFields.map((n) => `- [${n}]`).join("\n")
      : "(no fields defined yet)";
    const calcList = precedingCalcs.length
      ? precedingCalcs.map((n) => `- [${n}]`).join("\n")
      : "(no earlier calculations)";

    const system = `You write ONE pricing-calculator formula expression.

Available fields (reference by exact name in [square brackets]):
${fieldList}

Earlier calculations you may also reference:
${calcList}

Formula syntax:
- reference a field or earlier calculation by its exact name in [square brackets]
- operators: + - * / ^ and parentheses
- functions: SUM, MIN, MAX, ROUND, ROUNDUP, ROUNDDOWN, ABS, IF, AND, OR, NOT, CONTAINS, MROUND (nearest multiple), CEILING (round up to multiple), FLOOR (round down to multiple), RAND (random 0-1), RANDBETWEEN (random integer in range)
- comparisons inside IF: = != < > <= >=

Rules:
- Use ONLY names that appear in the lists above. Never invent a field.
- Return ONE formula expression — no explanation, no prose.
- Respond as JSON: { "formula": "<the formula expression>" }`;

    /* Budget snapshot + pre-call gate — AUTHED callers only. Mirrors
     * /api/quotequick/ai/chat so this Haiku call counts against the same
     * lifetime / daily / per-call caps. Anonymous callers have no budget row;
     * their ceiling is the per-IP rate limiter in step (0). */
    if (userId != null) {
      let snapshot;
      try {
        snapshot = await getUserBudgetSnapshot(userId);
      } catch (err: any) {
        log.error("budget snapshot failed pre-call (formula-help)", { error: err?.message });
        return res.status(503).json({ error: "budget_lookup_failed" });
      }

      const estimate = estimateCallCost({
        model: TEXT_MODEL,
        systemPromptTokens: approxTokens(system),
        historyTokens: 0,
        messageTokens: approxTokens(prompt),
        hasImage: false,
      });
      const decision = gateDecision(snapshot, estimate, false);
      if (!decision.allowed) {
        return res.status(402).json({
          error: "budget_exceeded",
          code: decision.code,
          message: "Your AI budget for this period has been reached. Please try again later.",
          snapshot: {
            cumulative_usd: snapshot.cumulative_usd,
            today_usd: snapshot.today_usd,
            config: snapshot.config,
            scope: snapshot.scope,
          },
        });
      }
    }

    try {
      /* Single non-streaming call via the shared multi-provider engine.
       * chat() AUTOMATICALLY fails over to backup providers (OpenAI → Groq →
       * Together → …) when Anthropic is absent / 401-403 / 5xx-exhausted, so a
       * single-provider outage degrades gracefully instead of hard-failing the
       * caller. We deliberately do NOT pass `opts.surface`: this route uses the
       * QuoteQuick budget system (gateDecision / recordSpend) above, NOT the
       * ai_system_gates surface table — passing a surface would double-gate. */
      const text = (
        await chat({
          system,
          messages: [{ role: "user", content: prompt }],
          maxTokens: 256,
          modelOverride: TEXT_MODEL,
        })
      ).trim();

      /* Record real spend against the same caps — AUTHED callers only
       * (recordSpend requires a numeric user id). Anonymous usage is bounded
       * by the per-IP rate limiter, not the DB budget. chat() returns only a
       * string (no usage object — and a fallback provider's token counts
       * wouldn't match Anthropic's anyway), so we record an ESTIMATE from the
       * input + output character length via approxTokens(). recordSpend failure
       * must never swallow a successful generation — log it (don't silently
       * catch) so the cap counters can be reconciled, then still return the
       * formula. */
      if (userId != null) {
        const inputTokens = approxTokens(system) + approxTokens(prompt);
        const outputTokens = approxTokens(text);
        try {
          await recordSpend({
            userId,
            model: TEXT_MODEL,
            inputTokens,
            outputTokens,
            imageCount: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
          });
        } catch (spendErr: any) {
          log.error("recordSpend failed (formula already generated)", {
            error: spendErr?.message,
          });
        }
      }

      // Tolerate either bare JSON or JSON wrapped in prose.
      let raw: any = null;
      try { raw = JSON.parse(text); } catch {
        const m = /\{[\s\S]*\}/.exec(text);
        // Best-effort fallback: extract the first {...} block. A parse failure
        // here is expected (model returned prose) — leave raw null and fall
        // through to the no_formula branch below.
        if (m) { try { raw = JSON.parse(m[0]); } catch { raw = null; } }
      }
      const formula = typeof raw?.formula === "string" ? raw.formula.trim().slice(0, 600) : "";
      if (!formula) {
        return res.status(422).json({ error: "no_formula", message: "AI couldn't build a formula from that description." });
      }
      const check = validateFormula(formula);
      if (!check.valid) {
        return res.status(422).json({
          error: "invalid_formula",
          message: `AI produced an invalid formula (${check.error || "parse error"}).`,
          formula,
        });
      }
      return res.json({ formula });
    } catch (err: any) {
      /* All providers unavailable (Anthropic absent AND no fallback key) —
       * chat() throws a typed NoAIProviderError. Map it to the same clean 503
       * the key-present guard uses, not an opaque 500. */
      if (err instanceof NoAIProviderError) {
        log.error("no AI provider available (primary + all fallbacks down)", {
          error: err?.message,
        });
        return res.status(503).json({
          error: "ai_unavailable",
          message: "The AI service is temporarily unavailable. Please try again in a moment.",
        });
      }
      log.error("formula-help failed", { error: err?.message, status: err?.status });
      return res.status(500).json({ error: "ai_error", message: String(err?.message ?? "Failed to generate formula") });
    }
  });
}
