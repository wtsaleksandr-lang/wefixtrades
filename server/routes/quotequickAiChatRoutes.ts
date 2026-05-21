/**
 * Wave K — QuoteQuick editor AI assistant endpoint.
 *
 * POST /api/quotequick/ai/chat
 *   Body: { message, image?, history[], shellState }
 *   Auth: requireAuth
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
import { requireAuth } from "../auth";
import { createLogger } from "../lib/logger";
import { getSharedClient, validateConfig } from "../services/aiService";
import {
  estimateCallCost,
  gateDecision,
  getUserBudgetSnapshot,
  recordSpend,
  type SupportedModel,
} from "../services/quotequickAiBudget";
import { QUOTEQUICK_AI_TOOLS, QUOTEQUICK_SYSTEM_PROMPT } from "../services/quotequickAiTools";
import { validateFormula } from "@shared/formulaEngine";
import { getEffectiveTemplates } from "../lib/applyQuoteQuickOverrides";

const log = createLogger("QuoteQuickAiChat");

const TEXT_MODEL: SupportedModel = "claude-haiku-4-5-20251001";
const VISION_MODEL: SupportedModel = "claude-sonnet-4-6";

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

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function registerQuoteQuickAiChatRoutes(app: Express): void {
  /* ─── Budget snapshot (GET) ────────────────────────────────────────── */
  app.get("/api/quotequick/ai/budget", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as Express.User).id;
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

  /* ─── Streaming chat (POST) ────────────────────────────────────────── */
  app.post("/api/quotequick/ai/chat", requireAuth, async (req: Request, res: Response) => {
    const userId = (req.user as Express.User).id;

    /* (1) Validate input. */
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_request", details: parsed.error.format() });
    }
    const { message, image, history, shellState } = parsed.data;

    /* Wave Q-Hotfix — plan-tier gate. The AI quote assistant is a Business
     * tier ($79/mo) feature per the Wave Q pricing page. Free and Pro
     * tiers get a 402 + a structured upgrade hint instead of a generic
     * budget error. We resolve the tier off the user's most-recent
     * QuoteQuick calculator (same heuristic as the budget service). */
    try {
      const { resolveUserPlanTier } = await import("../services/quotequickAiBudget");
      const planTier = await resolveUserPlanTier(userId);
      const allowed = planTier === "business";
      if (!allowed) {
        return res.status(402).json({
          error: "business_tier_required",
          current_tier: planTier,
          upgrade_url: "/pricing/quotequick",
          message: "The AI quote assistant is a Business plan feature. Upgrade to unlock it.",
        });
      }
    } catch (err: any) {
      log.warn("plan_tier resolution failed; falling back to budget-only gate", { error: err?.message });
    }

    /* (2) Validate the Anthropic key. We don't 500 the whole API just
     *     because the key is missing — give the client a clean code. */
    const cfg = validateConfig();
    if (!cfg.valid) {
      return res.status(503).json({ error: "ai_unavailable", reason: cfg.error });
    }

    /* (3) Decide which model based on whether an image is attached. */
    const hasImage = Boolean(image && parseImage(image));
    const model: SupportedModel = hasImage ? VISION_MODEL : TEXT_MODEL;

    /* (4) Estimate this call's cost and gate against the budget. */
    let snapshot;
    try {
      snapshot = await getUserBudgetSnapshot(userId);
    } catch (err: any) {
      log.error("budget snapshot failed pre-call", { error: err?.message });
      return res.status(503).json({ error: "budget_lookup_failed" });
    }

    const historyTokens = history.reduce((acc, h) => acc + approxTokens(h.content), 0);
    const messageTokens = approxTokens(message);
    const estimate = estimateCallCost({
      model,
      systemPromptTokens: SYSTEM_PROMPT_TOKEN_EST,
      historyTokens,
      messageTokens,
      hasImage,
    });
    const decision = gateDecision(snapshot, estimate, hasImage);
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

    /* (5) Headers for SSE. */
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    sseWrite(res, "open", { model, estimate_usd: estimate });

    /* (6) Build the Anthropic messages payload. */
    const userBlocks: any[] = [{ type: "text", text: message }];
    if (hasImage) {
      const parsedImg = parseImage(image!);
      if (parsedImg) {
        userBlocks.push({
          type: "image",
          source: { type: "base64", media_type: parsedImg.mediaType, data: parsedImg.b64 },
        });
      }
    }

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

    const systemBlocks = [
      {
        type: "text" as const,
        text:
          `${QUOTEQUICK_SYSTEM_PROMPT}\n\n` +
          `AVAILABLE TEMPLATES (id · name · category):\n${templateCatalogue}\n\n` +
          `CURRENT EDITOR STATE (JSON):\n${JSON.stringify(shellState).slice(0, 6000)}`,
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

      /* (8) Record actual spend. */
      const { cost_usd } = await recordSpend({
        userId,
        model,
        inputTokens: freshInput,
        outputTokens,
        imageCount: hasImage ? 1 : 0,
        cacheCreationTokens: cacheCreation,
        cacheReadTokens: cacheRead,
      });

      const after = await getUserBudgetSnapshot(userId);
      sseWrite(res, "done", {
        cost_usd,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        snapshot: {
          cumulative_usd: after.cumulative_usd,
          today_usd: after.today_usd,
          images_used: after.images_used,
          config: after.config,
        },
        warn: decision.allowed ? decision.warn : false,
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

  app.post("/api/ai/formula-help", requireAuth, async (req: Request, res: Response) => {
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
- functions: SUM, MIN, MAX, ROUND, ROUNDUP, ROUNDDOWN, ABS, IF, AND, OR, NOT, CONTAINS
- comparisons inside IF: = != < > <= >=

Rules:
- Use ONLY names that appear in the lists above. Never invent a field.
- Return ONE formula expression — no explanation, no prose.
- Respond as JSON: { "formula": "<the formula expression>" }`;

    try {
      const client = getSharedClient();
      const completion = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      // Pull the first text block.
      const text = (completion.content || [])
        .filter((b: any) => b?.type === "text")
        .map((b: any) => b.text)
        .join("")
        .trim();
      // Tolerate either bare JSON or JSON wrapped in prose.
      let raw: any = null;
      try { raw = JSON.parse(text); } catch {
        const m = /\{[\s\S]*\}/.exec(text);
        if (m) { try { raw = JSON.parse(m[0]); } catch {} }
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
      log.error("formula-help failed", { error: err?.message, status: err?.status });
      return res.status(500).json({ error: "ai_error", message: String(err?.message ?? "Failed to generate formula") });
    }
  });
}
