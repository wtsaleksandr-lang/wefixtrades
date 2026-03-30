import type { Express, Request, Response } from "express";
import { streamChat, type ChatMessage } from "../services/aiService";
import { buildSystemPrompt, type ChatMode, type AuditContext } from "../services/promptBuilder";
import { getMemory, saveMemory, extractMemorySignals } from "../services/chatMemory";
import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";

/* ─── Simple in-memory rate limiter ─── */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30; // requests per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

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

// Periodic cleanup of stale entries
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

/* ─── Input validation ─── */
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

/* ─── Load audit report context from DB ─── */
async function loadAuditContext(reportId: string): Promise<AuditContext | null> {
  try {
    const rows = await db.select().from(auditReports).where(eq(auditReports.id, reportId)).limit(1);
    if (!rows.length) return null;

    const report = rows[0];
    const data = report.audit_data as any;
    if (!data) return null;

    // Extract structured context from audit data
    const ctx: AuditContext = {
      businessName: report.business_name,
      trade: data.trade || data.business?.trade || "",
      city: data.city || data.business?.city || "",
    };

    // Score and grade
    if (typeof data.overallScore === "number") ctx.score = data.overallScore;
    if (data.grade) ctx.grade = data.grade;

    // Revenue loss
    if (data.estimatedRevenueLoss) ctx.estimatedRevenueLoss = data.estimatedRevenueLoss;

    // Issues / action plan
    if (Array.isArray(data.actionPlan)) {
      ctx.actionPlan = data.actionPlan;
      ctx.topIssues = data.actionPlan.map((a: any) => ({
        title: a.title,
        estimatedImpact: a.estimatedImpact,
        priority: a.priority,
      }));
    }

    // Detected issue IDs for service matching
    if (Array.isArray(data.detectedIssues)) {
      ctx.detectedIssueIds = data.detectedIssues;
    } else if (Array.isArray(data.actionPlan)) {
      // Derive from action plan titles
      ctx.detectedIssueIds = data.actionPlan
        .map((a: any) => a.issueId || a.id)
        .filter(Boolean);
    }

    return ctx;
  } catch (err) {
    console.error("[chat] Failed to load audit context:", err);
    return null;
  }
}

/* ─── Register routes ─── */
export function registerChatRoutes(app: Express): void {
  /**
   * POST /api/chat
   * Unified chat endpoint for both audit report chat and general website chat.
   *
   * Body:
   *   mode: "audit" | "general"
   *   messages: ChatMessage[]
   *   sessionId: string
   *   reportId?: string (for audit mode)
   *   auditContext?: AuditContext (client-side fallback if no reportId)
   */
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      // Rate limiting
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({ error: "Too many requests. Please wait a moment." });
      }

      // Validate API key
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "Chat is temporarily unavailable." });
      }

      const { mode, messages, sessionId, reportId, auditContext: clientAuditCtx } = req.body || {};

      // Validate mode
      const chatMode: ChatMode = mode === "audit" ? "audit" : "general";

      // Validate messages
      if (!validateMessages(messages)) {
        return res.status(400).json({ error: "Invalid messages format." });
      }

      // Validate sessionId
      const sid = typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 100
        ? sessionId
        : `anon-${clientIp}-${Date.now()}`;

      // Load memory
      const storedMemory = await getMemory(sid).catch(() => null);

      // Build audit context
      let auditCtx: AuditContext | undefined;
      if (chatMode === "audit") {
        if (reportId && typeof reportId === "string") {
          auditCtx = await loadAuditContext(reportId) || undefined;
        }
        // Fall back to client-provided context
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

      // Build system prompt
      const systemPrompt = buildSystemPrompt(
        chatMode,
        auditCtx,
        storedMemory?.memory
      );

      // Use stored history + new messages for context continuity
      // The client sends the full visible conversation; we trust it but cap it
      const chatMessages = messages.slice(-20) as ChatMessage[];

      // Stream response via SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const stream = streamChat({
        system: systemPrompt,
        messages: chatMessages,
      });

      let fullReply = "";

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          fullReply += event.delta.text;
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();

      // Save memory in the background (don't block response)
      const allMessages: ChatMessage[] = [
        ...chatMessages,
        { role: "assistant" as const, content: fullReply },
      ];
      const signals = extractMemorySignals(allMessages);
      saveMemory(sid, allMessages, {
        reportId: reportId || storedMemory?.memory?.reportId,
        ...signals,
      }).catch((err) => console.error("[chat] Memory save error:", err));

    } catch (err: any) {
      console.error("[chat] Error:", err?.message);
      if (!res.headersSent) {
        return res.status(500).json({ error: "Something went wrong. Please try again." });
      }
      res.end();
    }
  });
}
