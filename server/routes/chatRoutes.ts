import type { Express, Request, Response } from "express";
import { assistantStream, isReady, type AssistantRequest } from "../services/assistant";
import type { ChatSurface, AuditContext } from "../services/promptBuilder";
import type { ChatMessage } from "../services/aiService";
import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";

/* ─── Rate limiter (in-memory, per-IP) ─── */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Clean stale rate-limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

/* ─── Validation ─── */
const VALID_SURFACES: ChatSurface[] = ["website", "audit", "dashboard", "admin", "vapi"];

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

/* ─── Write SSE stream to response ─── */
async function writeStream(res: Response, req: AssistantRequest): Promise<void> {
  const { stream, onComplete } = await assistantStream(req);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let fullReply = "";

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullReply += event.delta.text;
      res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
    }
  }

  res.write("data: [DONE]\n\n");
  res.end();

  // Save memory in background
  onComplete(fullReply).catch(() => {});
}

/* ─── Register routes ─── */
export function registerChatRoutes(app: Express): void {
  /**
   * POST /api/chat
   * Unified chat endpoint for all surfaces.
   *
   * Body:
   *   surface: "website" | "audit" | "dashboard" | "admin" | "vapi"
   *   messages: ChatMessage[]
   *   sessionId: string
   *   reportId?: string
   *   auditContext?: AuditContext (client-side fallback)
   *   userId?: number (set by auth middleware in future)
   */
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const clientIp = getClientIp(req);
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ error: "Too many requests. Please wait a moment." });
      }

      const readiness = isReady();
      if (!readiness.ready) {
        return res.status(503).json({ error: "Chat is temporarily unavailable." });
      }

      const { surface: rawSurface, mode, messages, sessionId, reportId, auditContext: clientAuditCtx, userId } = req.body || {};

      // Support both "surface" and legacy "mode" field
      const surfaceStr = rawSurface || mode || "website";
      const surface: ChatSurface = VALID_SURFACES.includes(surfaceStr) ? surfaceStr : "website";

      if (!validateMessages(messages)) {
        return res.status(400).json({ error: "Invalid messages format." });
      }

      const sid = typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 100
        ? sessionId
        : `anon-${clientIp}-${Date.now()}`;

      // Build audit context if applicable
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

      const assistantReq: AssistantRequest = {
        surface,
        messages: messages.slice(-20),
        sessionId: sid,
        userId: typeof userId === "number" ? userId : undefined,
        auditContext: auditCtx,
        reportId: typeof reportId === "string" ? reportId : undefined,
      };

      await writeStream(res, assistantReq);
    } catch (err: any) {
      console.error("[chat] Error:", err?.message);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Something went wrong. Please try again." });
      }
      res.end();
    }
  });
}
