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

    const systemBlocks = [
      {
        type: "text" as const,
        text: `${QUOTEQUICK_SYSTEM_PROMPT}\n\nCURRENT EDITOR STATE (JSON):\n${JSON.stringify(shellState).slice(0, 6000)}`,
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
}
