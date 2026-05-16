import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { assistantStream, assistantSync, isReady, type AssistantRequest } from "../services/assistant";
import type { ChatSurface, AuditContext, PortalContext } from "../services/promptBuilder";
import { TRADELINE_DEMO_PROMPT } from "@shared/prompts/tradelineDemoPrompt";
import { assemblePortalContext } from "../services/portalAssistantContext";
import type { ChatMessage } from "../services/aiService";
import { chatRateLimiter } from "../services/rateLimiter";
import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";
import { shouldInjectTools, ADMIN_TOOLS } from "../services/adminTools";
import { storePendingAction, getCopilotAction } from "../services/copilotActionRegistry";
import { createLogger } from "../lib/logger";

const log = createLogger("Chat");

/* ─── Validation ─── */
const VALID_SURFACES: ChatSurface[] = ["website", "audit", "dashboard", "admin", "vapi", "portal", "tradeline_demo"];

function validateMessages(messages: any): messages is ChatMessage[] {
  return (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= 50 &&
    messages.every(
      (m: any) =>
        m &&
        typeof m.content === "string" &&
        m.content.length <= 2000 &&
        (m.role === "user" || m.role === "assistant")
    )
  );
}

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

/* ─── Load audit context from DB ─── */
async function loadAuditContext(reportId: string): Promise<AuditContext | null> {
  try {
    const rows = await db.select().from(auditReports).where(eq(auditReports.id, reportId)).limit(1);
    if (!rows.length) return null;

    const report = rows[0];
    const data = report.audit_data as any;
    if (!data) return null;

    const ctx: AuditContext = {
      businessName: report.business_name,
      trade: data.trade || data.business?.trade || "",
      city: data.city || data.business?.city || "",
    };

    if (typeof data.overallScore === "number") ctx.score = data.overallScore;
    if (typeof data.scores?.overall === "number") ctx.score = data.scores.overall;
    if (data.grade || data.scores?.grade) ctx.grade = data.grade || data.scores.grade;
    if (data.estimatedRevenueLoss) ctx.estimatedRevenueLoss = data.estimatedRevenueLoss;

    const plan = data.narrative?.actionPlan || data.actionPlan;
    if (Array.isArray(plan)) {
      ctx.actionPlan = plan;
      ctx.topIssues = plan.map((a: any) => ({
        title: a.title,
        estimatedImpact: a.estimatedImpact,
        priority: a.priority,
      }));
    }

    if (Array.isArray(data.detectedIssues)) {
      ctx.detectedIssueIds = data.detectedIssues;
    } else if (Array.isArray(plan)) {
      ctx.detectedIssueIds = plan.map((a: any) => a.issueId || a.id).filter(Boolean);
    }

    return ctx;
  } catch (err) {
    log.error("[chat] Failed to load audit context:", { error: String(err) });
    return null;
  }
}

/* ─── Parse request body into AssistantRequest ─── */
async function parseAssistantRequest(req: Request): Promise<
  { ok: true; assistantReq: AssistantRequest } |
  { ok: false; status: number; error: string }
> {
  const { surface: rawSurface, mode, messages, sessionId, reportId, auditContext: clientAuditCtx, pageContext: clientPageCtx, pageContentSnapshot: clientPageSnap, userId } = req.body || {};

  const surfaceStr = rawSurface || mode || "website";
  const surface: ChatSurface = VALID_SURFACES.includes(surfaceStr) ? surfaceStr : "website";

  if (!validateMessages(messages)) {
    return { ok: false, status: 400, error: "Invalid messages format." };
  }

  const clientIp = getClientIp(req);
  const sid = typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 100
    ? sessionId
    : `anon-${clientIp}-${Date.now()}`;

  let auditCtx: AuditContext | undefined;
  if (surface === "audit") {
    if (reportId && typeof reportId === "string") {
      auditCtx = await loadAuditContext(reportId) || undefined;
    }
    if (!auditCtx && clientAuditCtx) {
      auditCtx = {
        businessName: clientAuditCtx.businessName,
        trade: clientAuditCtx.trade,
        city: clientAuditCtx.city,
        score: clientAuditCtx.score,
        grade: clientAuditCtx.grade,
        topIssues: clientAuditCtx.topIssues,
        estimatedRevenueLoss: clientAuditCtx.estimatedRevenueLoss,
        actionPlan: clientAuditCtx.actionPlan,
        detectedIssueIds: clientAuditCtx.detectedIssueIds,
      };
    }
  }

  // Portal surface: assemble context from DB using authenticated user
  let portalCtx: PortalContext | undefined;
  let resolvedUserId: number | undefined = typeof userId === "number" ? userId : undefined;
  if (surface === "portal") {
    const sessionUserId = (req as any).user?.id;
    if (!sessionUserId) {
      return { ok: false, status: 401, error: "Authentication required for portal surface." };
    }
    resolvedUserId = sessionUserId;

    const { page, onboardingId, currentResponses } = req.body || {};
    portalCtx = await assemblePortalContext(
      sessionUserId,
      typeof page === "string" ? page : undefined,
      typeof onboardingId === "number" ? onboardingId : undefined,
      currentResponses ? { currentResponses } : undefined,
    ).catch((err) => {
      log.error("[chat] Portal context assembly error:", err);
      return undefined;
    });
  }

  return {
    ok: true,
    assistantReq: {
      surface,
      messages: messages.slice(-20),
      sessionId: surface === "portal" ? `portal_${resolvedUserId}` : sid,
      userId: resolvedUserId,
      auditContext: auditCtx,
      pageContext: surface === "admin" && clientPageCtx
        ? {
            ...clientPageCtx,
            // Q26: untyped DOM snapshot — supplements the structured context for pages
            // that don't expose all data through the typed pageContext.
            pageContentSnapshot: typeof clientPageSnap === "string" ? clientPageSnap.slice(0, 2000) : undefined,
          }
        : undefined,
      portalContext: portalCtx,
      reportId: typeof reportId === "string" ? reportId : undefined,
      // Admin surface needs more tokens for task summaries and operational detail
      maxTokens: surface === "admin" ? 1000 : undefined,
    },
  };
}

/* ─── Write SSE stream to response ─── */
async function writeStream(res: Response, req: AssistantRequest): Promise<void> {
  let headersSent = false;

  try {
    const { stream, onComplete } = await assistantStream(req);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    headersSent = true;

    let fullReply = "";

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullReply += event.delta.text;
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    // Check whether the model decided to call a tool
    try {
      const finalMsg = await stream.finalMessage();
      if (finalMsg.stop_reason === "tool_use" && req.tools?.length && req.userId) {
        const toolUseBlock = finalMsg.content.find((b: any) => b.type === "tool_use") as any;
        if (toolUseBlock) {
          const toolInput = toolUseBlock.input as Record<string, unknown>;
          const def = getCopilotAction("admin", toolUseBlock.name);

          if (def?.riskTier === "auto") {
            // Autonomous tier — execute immediately, no confirm card. The
            // executor re-validates args + audit-logs; the narrative is
            // streamed back as reply text and folded into fullReply so it
            // persists with the conversation.
            let narrative: string;
            try {
              const result = await def.execute(
                {
                  call_id: crypto.randomUUID(),
                  surface: "admin",
                  action_name: toolUseBlock.name,
                  args: toolInput,
                  user_id: req.userId,
                  session_id: req.sessionId,
                  expires: Date.now() + 5 * 60 * 1000,
                },
                req.userId,
              );
              narrative = result.narrative;
            } catch (err: any) {
              log.error("[chat] auto action failed:", err?.message);
              narrative = "I wasn't able to complete that action just now.";
            }
            const chunk = (fullReply ? "\n\n" : "") + narrative;
            fullReply += chunk;
            res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
          } else {
            const callId = crypto.randomUUID();

            // Build the confirmation-card display from the action's own
            // summarize() hook; fall back to a generic args view. This keeps
            // writeStream action-agnostic — each action shapes its own card.
            const summary = def?.summarize?.(toolInput, req.pageContext);
            const display = summary
              ? { title: summary.title, lines: summary.lines }
              : {
                  title: String(toolUseBlock.name).replace(/_/g, " "),
                  lines: Object.entries(toolInput).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`),
                };

            // Store action server-side — client only gets the call_id
            storePendingAction({
              call_id: callId,
              surface: "admin",
              action_name: toolUseBlock.name,
              args: toolInput,
              user_id: req.userId,
              session_id: req.sessionId,
              expires: Date.now() + 5 * 60 * 1000,
              metadata: summary?.metadata,
            });

            res.write(`data: ${JSON.stringify({ tool_call: { call_id: callId, tool_name: toolUseBlock.name, display } })}\n\n`);
          }
        }
      }
    } catch {
      // If finalMessage fails, skip tool_call event — proceed to [DONE]
    }

    res.write("data: [DONE]\n\n");
    res.end();

    onComplete(fullReply).catch(() => {});
  } catch (err: any) {
    log.error("[chat] Stream error:", err?.message);
    if (headersSent) {
      res.write(`data: ${JSON.stringify({ error: "Something went wrong. Please try again." })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      throw err;
    }
  }
}

/* ─── Register routes ─── */
export function registerChatRoutes(app: Express): void {

  /**
   * POST /api/chat
   * Streaming chat endpoint (SSE) for all surfaces.
   */
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const clientIp = getClientIp(req);
      if (!(await chatRateLimiter.check(clientIp))) {
        return res.status(429).json({ error: "Too many requests, please try again shortly" });
      }

      const readiness = isReady();
      if (!readiness.ready) {
        return res.status(503).json({ error: "Chat is temporarily unavailable." });
      }

      const parsed = await parseAssistantRequest(req);
      if (!parsed.ok) {
        return res.status(parsed.status).json({ error: parsed.error });
      }

      // Admin surface is internal-only — require authenticated admin session
      if (parsed.assistantReq.surface === "admin") {
        if (!req.isAuthenticated?.() || (req.user as Express.User | undefined)?.role !== "admin") {
          return res.status(401).json({ error: "Admin access required" });
        }
        // Bind userId from authenticated session (not client-supplied) for admin
        parsed.assistantReq.userId = (req.user as Express.User).id;

        // Inject tools + Sonnet when all four criteria are met
        if (shouldInjectTools(parsed.assistantReq.pageContext)) {
          parsed.assistantReq.tools = ADMIN_TOOLS;
          parsed.assistantReq.model = "claude-sonnet-4-6";
        }
      }

      await writeStream(res, parsed.assistantReq);
    } catch (err: any) {
      log.error("Error", { status: String(err?.status || ""), error: err?.message, detail: String(err?.error?.message || "") });
      if (!res.headersSent) {
        return res.status(500).json({ error: "Something went wrong. Please try again." });
      }
      res.end();
    }
  });

  /**
   * POST /api/chat/sync
   * Non-streaming chat endpoint for Vapi webhooks, REST integrations,
   * and any consumer that needs a simple JSON response.
   *
   * Returns: { reply: string }
   */
  app.post("/api/chat/sync", async (req: Request, res: Response) => {
    try {
      const clientIp = getClientIp(req);
      if (!(await chatRateLimiter.check(clientIp))) {
        return res.status(429).json({ error: "Too many requests, please try again shortly" });
      }

      const readiness = isReady();
      if (!readiness.ready) {
        return res.status(503).json({ error: "Chat is temporarily unavailable." });
      }

      const parsed = await parseAssistantRequest(req);
      if (!parsed.ok) {
        return res.status(parsed.status).json({ error: parsed.error });
      }

      // Admin surface is internal-only — require authenticated admin session
      if (parsed.assistantReq.surface === "admin") {
        if (!req.isAuthenticated?.() || (req.user as Express.User | undefined)?.role !== "admin") {
          return res.status(401).json({ error: "Admin access required" });
        }
        parsed.assistantReq.userId = (req.user as Express.User).id;
      }

      const result = await assistantSync(parsed.assistantReq);
      return res.json({ reply: result.reply });
    } catch (err: any) {
      log.error("[chat/sync] Error:", err?.message);
      return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });

  /**
   * GET /api/tradeline-demo/prompt
   *
   * Returns the TradeLine demo system prompt as plain text. The
   * /products/tradeline launcher fetches this once and pushes it into
   * Vapi at voice-call start via assistantOverrides.model.messages, so
   * voice and chat surfaces stay in lockstep with one source of truth.
   * Cached aggressively because the prompt is a constant.
   */
  app.get("/api/tradeline-demo/prompt", (_req: Request, res: Response) => {
    res.set("Cache-Control", "public, max-age=300");
    res.type("text/plain").send(TRADELINE_DEMO_PROMPT);
  });

  /**
   * GET /api/tradeline-demo/niche/:slug?voice=professional-female
   *
   * Returns niche-specific demo prompt + first message + voice config for
   * the marketing "Meet your AI agents" cards. Wraps the selected
   * TradeLine niche template into a public-facing demo persona (no real
   * client data — speaks as a generic example business).
   */
  app.get("/api/tradeline-demo/niche/:slug", async (req: Request, res: Response) => {
    try {
      const { selectTemplate } = await import("../services/tradelineTemplates");
      const { getVoicePreset } = await import("@shared/tradelineVoices");

      const slug = String(req.params.slug || "").toLowerCase();
      const voicePresetId = String(req.query.voice || "professional-female");

      const template = selectTemplate(slug);
      const voice = getVoicePreset(voicePresetId);

      const sampleBusinessName = `${template.name} Pros`;
      const sampleArea = "the Greater Toronto Area";
      const services = template.fallbackServices.slice(0, 6);

      const systemPrompt = [
        `You are the AI demo receptionist for ${sampleBusinessName}, a ${template.name.toLowerCase()} business serving ${sampleArea}. This is a public marketing demo on the WeFixTrades product page — the caller is evaluating the AI, not booking a real job.`,
        ``,
        template.systemPromptBase,
        ``,
        `TONE: ${template.defaultTone === "professional" ? "Professional and courteous." : template.defaultTone === "friendly" ? "Friendly and warm." : "Casual and natural."}`,
        ``,
        `SAMPLE SERVICES WE OFFER:`,
        ...services.map((s) => `- ${s}`),
        ``,
        `CALL FLOW: ${template.callFlowNotes}`,
        ``,
        `BOOKING: ${template.bookingBehavior}`,
        ``,
        `ESCALATION: ${template.escalationRules}`,
        ``,
        `WHEN UNSURE: ${template.fallbackBehavior}`,
        ``,
        `IMPORTANT — DEMO RULES:`,
        `- This is a marketing demo. Don't actually book anything; if pressed, say "this is a demo of our AI — to book real ${template.name.toLowerCase()} work, head to wefixtrades.com".`,
        `- Keep voice responses to 1-3 short sentences. Use natural spoken language and contractions.`,
        `- Never claim to be a human. If asked, say you're an AI demo of a ${template.name.toLowerCase()} receptionist.`,
        `- If the caller wants to test escalation, follow the ESCALATION rule literally — pretend you would escalate.`,
      ].join("\n");

      const firstMessage = `Hi, thanks for calling ${sampleBusinessName} — I'm the AI demo. What can I help you with?`;

      res.set("Cache-Control", "public, max-age=120");
      return res.json({
        slug: template.id,
        name: template.name,
        defaultTone: template.defaultTone,
        systemPrompt,
        firstMessage,
        voiceConfig: { provider: voice.provider, voiceId: voice.voiceId, label: voice.label, description: voice.description },
      });
    } catch (err) {
      log.error("[tradeline-demo/niche] error", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load niche demo" });
    }
  });

  /**
   * POST /api/tradeline-demo/niche-chat
   *
   * Public chat endpoint for the per-niche marketing demo cards. Looks up
   * the niche template server-side, builds the demo system prompt, and
   * sends to the assistant pipeline with a systemOverride. Rate-limited
   * the same way as /api/chat/sync.
   */
  app.post("/api/tradeline-demo/niche-chat", async (req: Request, res: Response) => {
    try {
      const clientIp = getClientIp(req);
      if (!(await chatRateLimiter.check(clientIp))) {
        return res.status(429).json({ error: "Too many requests, please try again shortly" });
      }
      const readiness = isReady();
      if (!readiness.ready) {
        return res.status(503).json({ error: "Chat is temporarily unavailable." });
      }

      const slug = String(req.body?.slug || "").toLowerCase();
      const messages = req.body?.messages;
      if (!slug || !validateMessages(messages)) {
        return res.status(400).json({ error: "slug and messages are required" });
      }

      const { selectTemplate } = await import("../services/tradelineTemplates");
      const template = selectTemplate(slug);

      const sampleBusinessName = `${template.name} Pros`;
      const services = template.fallbackServices.slice(0, 6);
      const systemPrompt = [
        `You are the AI demo receptionist for ${sampleBusinessName}, a ${template.name.toLowerCase()} business. This is a public marketing demo on the WeFixTrades product page.`,
        template.systemPromptBase,
        `TONE: ${template.defaultTone === "professional" ? "Professional and courteous." : template.defaultTone === "friendly" ? "Friendly and warm." : "Casual and natural."}`,
        `SAMPLE SERVICES: ${services.join(", ")}.`,
        `CALL FLOW: ${template.callFlowNotes}`,
        `BOOKING: ${template.bookingBehavior}`,
        `ESCALATION: ${template.escalationRules}`,
        `WHEN UNSURE: ${template.fallbackBehavior}`,
        `IMPORTANT: This is a demo — don't actually book anything. Keep responses to 1-3 short sentences. Never claim to be human; you're an AI demo of a ${template.name.toLowerCase()} receptionist.`,
      ].join("\n\n");

      const result = await assistantSync({
        surface: "tradeline_demo",
        messages,
        sessionId: `niche-demo-${slug}-${crypto.randomUUID()}`,
        systemOverride: systemPrompt,
        maxTokens: 400,
      });
      return res.json({ reply: result.reply });
    } catch (err: any) {
      log.error("[tradeline-demo/niche-chat] error", { err: err?.message });
      return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });
}
