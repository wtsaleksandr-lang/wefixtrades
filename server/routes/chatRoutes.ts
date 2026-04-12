import type { Express, Request, Response } from "express";
import { assistantStream, assistantSync, isReady, type AssistantRequest } from "../services/assistant";
import type { ChatSurface, AuditContext, PortalContext } from "../services/promptBuilder";
import { assemblePortalContext } from "../services/portalAssistantContext";
import type { ChatMessage } from "../services/aiService";
import { chatRateLimiter } from "../services/rateLimiter";
import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";

/* ─── Validation ─── */
const VALID_SURFACES: ChatSurface[] = ["website", "audit", "dashboard", "admin", "vapi", "portal"];

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
    console.error("[chat] Failed to load audit context:", err);
    return null;
  }
}

/* ─── Parse request body into AssistantRequest ─── */
async function parseAssistantRequest(req: Request): Promise<
  { ok: true; assistantReq: AssistantRequest } |
  { ok: false; status: number; error: string }
> {
  const { surface: rawSurface, mode, messages, sessionId, reportId, auditContext: clientAuditCtx, pageContext: clientPageCtx, userId } = req.body || {};

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
      console.error("[chat] Portal context assembly error:", err);
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
      pageContext: surface === "admin" && clientPageCtx ? clientPageCtx : undefined,
      portalContext: portalCtx,
      reportId: typeof reportId === "string" ? reportId : undefined,
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

    res.write("data: [DONE]\n\n");
    res.end();

    onComplete(fullReply).catch(() => {});
  } catch (err: any) {
    console.error("[chat] Stream error:", err?.message);
    if (headersSent) {
      // SSE is already open — send error as an SSE event so the client sees it
      res.write(`data: ${JSON.stringify({ error: "Something went wrong. Please try again." })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      throw err; // Let the route handler send a JSON error
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
        return res.status(429).json({ error: "Too many requests. Please wait a moment." });
      }

      const readiness = isReady();
      if (!readiness.ready) {
        return res.status(503).json({ error: "Chat is temporarily unavailable." });
      }

      const parsed = await parseAssistantRequest(req);
      if (!parsed.ok) {
        return res.status(parsed.status).json({ error: parsed.error });
      }

      await writeStream(res, parsed.assistantReq);
    } catch (err: any) {
      console.error("[chat] Error:", err?.status || "", err?.message, err?.error?.message || "");
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
        return res.status(429).json({ error: "Too many requests. Please wait a moment." });
      }

      const readiness = isReady();
      if (!readiness.ready) {
        return res.status(503).json({ error: "Chat is temporarily unavailable." });
      }

      const parsed = await parseAssistantRequest(req);
      if (!parsed.ok) {
        return res.status(parsed.status).json({ error: parsed.error });
      }

      const result = await assistantSync(parsed.assistantReq);
      return res.json({ reply: result.reply });
    } catch (err: any) {
      console.error("[chat/sync] Error:", err?.message);
      return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });
}
