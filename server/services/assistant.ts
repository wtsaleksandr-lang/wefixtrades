/**
 * Shared assistant core — the "brain" that is decoupled from any transport
 * (HTTP/SSE, REST, Vapi voice, WebSocket, etc).
 *
 * All chat surfaces (audit widget, site widget, dashboard, admin, Vapi)
 * call through here. The caller is responsible for transport (streaming SSE,
 * returning JSON, piping to Vapi, etc).
 */

import { streamChat, chat, validateConfig, getModel, type ChatMessage, type ChatOptions } from "./aiService";
import { buildSystemPrompt, type ChatSurface, type AuditContext, type MemoryContext, type PageContext } from "./promptBuilder";
import { getMemory, saveMemory, extractMemorySignals } from "./chatMemory";
import { logUsage } from "./usageTracker";
import { evaluateAndArchive } from "./conversationArchiver";

/* ─── Types ─── */
export interface AssistantRequest {
  /** Which surface is making the request */
  surface: ChatSurface;
  /** The conversation messages (user + assistant turns) */
  messages: ChatMessage[];
  /** Session ID for memory persistence */
  sessionId: string;
  /** Optional authenticated user ID */
  userId?: number;
  /** Audit-specific context (only for surface="audit") */
  auditContext?: AuditContext;
  /** Admin page context (only for surface="admin") */
  pageContext?: PageContext;
  /** Report ID to load context from DB */
  reportId?: string;
  /** Override max tokens for this request */
  maxTokens?: number;
}

export interface AssistantStreamResult {
  /** The Anthropic stream object — caller iterates events */
  stream: ReturnType<typeof streamChat>;
  /** Call after streaming is done to persist memory and log usage */
  onComplete: (fullReply: string) => Promise<void>;
}

export interface AssistantSyncResult {
  reply: string;
}

/* ─── Health check ─── */
export function isReady(): { ready: boolean; error?: string } {
  const config = validateConfig();
  return { ready: config.valid, error: config.error };
}

/* ─── Build context (shared between stream and sync) ─── */
async function buildContext(req: AssistantRequest): Promise<{
  systemPrompt: string;
  chatMessages: ChatMessage[];
  memoryContext?: MemoryContext;
}> {
  const stored = await getMemory(req.sessionId).catch(() => null);
  const memoryContext = stored?.memory;

  const systemPrompt = buildSystemPrompt(
    req.surface,
    req.auditContext,
    memoryContext,
    req.pageContext,
  );

  const chatMessages = req.messages.slice(-20);

  return { systemPrompt, chatMessages, memoryContext };
}

/* ─── Create memory save callback ─── */
function createOnComplete(req: AssistantRequest, chatMessages: ChatMessage[]) {
  return async (fullReply: string) => {
    const allMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "assistant" as const, content: fullReply },
    ];
    const signals = extractMemorySignals(allMessages);
    await saveMemory(req.sessionId, allMessages, {
      reportId: req.reportId,
      userId: req.userId,
      surface: req.surface,
      ...signals,
    }).catch((err) => console.error("[assistant] Memory save error:", err));

    // Archive for admin visibility (async, non-blocking)
    evaluateAndArchive({
      sessionId: req.sessionId,
      userId: req.userId,
      surface: req.surface,
      reportId: req.reportId,
      messages: allMessages,
    }).catch(() => {});
  };
}

/* ─── Streaming response (for SSE, Vapi streaming, etc) ─── */
export async function assistantStream(req: AssistantRequest): Promise<AssistantStreamResult> {
  const { systemPrompt, chatMessages } = await buildContext(req);
  const startMs = Date.now();

  const stream = streamChat({
    system: systemPrompt,
    messages: chatMessages,
    maxTokens: req.maxTokens,
  });

  const onComplete = async (fullReply: string) => {
    const latencyMs = Date.now() - startMs;

    // Persist memory
    await createOnComplete(req, chatMessages)(fullReply);

    // Log usage (stream finalMessage has token counts)
    try {
      const finalMessage = await stream.finalMessage();
      logUsage({
        model: getModel(),
        surface: req.surface,
        sessionId: req.sessionId,
        userId: req.userId,
        reportId: req.reportId,
        inputTokens: finalMessage.usage?.input_tokens,
        outputTokens: finalMessage.usage?.output_tokens,
        latencyMs,
        success: true,
      });
    } catch {
      // If finalMessage fails, log what we can
      logUsage({
        model: getModel(),
        surface: req.surface,
        sessionId: req.sessionId,
        userId: req.userId,
        reportId: req.reportId,
        latencyMs,
        success: true,
      });
    }
  };

  return { stream, onComplete };
}

/* ─── Synchronous response (for REST, Vapi sync, webhooks, etc) ─── */
export async function assistantSync(req: AssistantRequest): Promise<AssistantSyncResult> {
  const { systemPrompt, chatMessages } = await buildContext(req);
  const startMs = Date.now();

  try {
    const reply = await chat({
      system: systemPrompt,
      messages: chatMessages,
      maxTokens: req.maxTokens,
    });
    const latencyMs = Date.now() - startMs;

    // Persist memory
    await createOnComplete(req, chatMessages)(reply);

    // Log usage (non-streaming doesn't expose tokens easily, log latency)
    logUsage({
      model: getModel(),
      surface: req.surface,
      sessionId: req.sessionId,
      userId: req.userId,
      reportId: req.reportId,
      latencyMs,
      success: true,
    });

    return { reply };
  } catch (err: any) {
    const latencyMs = Date.now() - startMs;
    logUsage({
      model: getModel(),
      surface: req.surface,
      sessionId: req.sessionId,
      userId: req.userId,
      reportId: req.reportId,
      latencyMs,
      success: false,
      errorMessage: err?.message?.slice(0, 200),
    });
    throw err;
  }
}
