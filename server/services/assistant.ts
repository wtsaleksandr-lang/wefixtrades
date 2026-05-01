/**
 * Shared assistant core — the "brain" that is decoupled from any transport
 * (HTTP/SSE, REST, Vapi voice, WebSocket, etc).
 *
 * All chat surfaces (audit widget, site widget, dashboard, admin, Vapi)
 * call through here. The caller is responsible for transport (streaming SSE,
 * returning JSON, piping to Vapi, etc).
 */

import { streamChat, chat, validateConfig, getModel, type ChatMessage, type ChatOptions } from "./aiService";
import { buildSystemPrompt, type ChatSurface, type AuditContext, type MemoryContext, type PageContext, type PortalContext } from "./promptBuilder";
import { getMemory, getMemoryByUserId, saveMemory, extractMemorySignals } from "./chatMemory";
import { getOrCreateThread, loadThreadMessages, appendTurn, appendMessage, derivePageContext } from "./threadService";
import { logUsage } from "./usageTracker";
import { evaluateAndArchive } from "./conversationArchiver";
import { createLogger } from "../lib/logger";

const log = createLogger("Assistant");

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
  /** Portal page context (only for surface="portal") */
  portalContext?: PortalContext;
  /** Report ID to load context from DB */
  reportId?: string;
  /** Override max tokens for this request */
  maxTokens?: number;
  /** Tool definitions to inject (admin surface only, when shouldInjectTools passes) */
  tools?: any[];
  /** Model override — used to switch to Sonnet for tool-enabled admin sessions */
  model?: string;
  /** Override the entire system prompt (used by TradeLine per-client prompting) */
  systemOverride?: string;
  /** Resolved thread ID (set internally by buildContext for portal) */
  _threadId?: number;
  /** True when buildContext detected the user message is already in the thread */
  _isDuplicateTurn?: boolean;
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
  // Portal surface with authenticated user: use thread-based persistence
  if (req.surface === "portal" && req.userId) {
    try {
      const pageCtx = derivePageContext(req.portalContext?.page);
      const { id: threadId } = await getOrCreateThread(req.userId, "portal", pageCtx);
      req._threadId = threadId;

      // Load thread history from DB — this is the source of truth
      const threadMessages = await loadThreadMessages(threadId);

      // The client sends the full conversation including the new user message.
      // Thread history is authoritative for past turns; the client's latest
      // user message is the new one we haven't persisted yet.
      const clientMessages = req.messages;
      const lastClientMsg = clientMessages[clientMessages.length - 1];
      const isNewUserTurn = lastClientMsg?.role === "user";

      // Dedup guard: if the thread already ends with the same user message
      // (e.g. retry after partial failure), don't append it again.
      const lastThreadMsg = threadMessages[threadMessages.length - 1];
      const isDuplicate = isNewUserTurn
        && lastThreadMsg?.role === "user"
        && lastThreadMsg.content === lastClientMsg.content;

      // Merge: thread history + new user message (if not duplicate)
      req._isDuplicateTurn = isDuplicate;
      const merged = isNewUserTurn && !isDuplicate
        ? [...threadMessages, lastClientMsg]
        : threadMessages.length > 0 ? threadMessages : clientMessages;

      // Load chatMemory for memory context (personality signals) as fallback
      const stored = await getMemory(req.sessionId).catch(() => null)
        || await getMemoryByUserId(req.userId).catch(() => null);

      const systemPrompt = buildSystemPrompt(
        req.surface,
        req.auditContext,
        stored?.memory,
        req.pageContext,
        undefined,
        req.portalContext,
      );

      return { systemPrompt, chatMessages: merged.slice(-20), memoryContext: stored?.memory };
    } catch (err) {
      log.error("[assistant] Thread load failed, falling back to chatMemory:", { error: String(err) });
      // Fall through to chatMemory path below
    }
  }

  // Non-portal surfaces or thread fallback: use chatMemory
  const stored = await getMemory(req.sessionId).catch(() => null)
    || (req.surface === "portal" && req.userId
        ? await getMemoryByUserId(req.userId).catch(() => null)
        : null);
  const memoryContext = stored?.memory;

  const systemPrompt = req.systemOverride ?? buildSystemPrompt(
    req.surface,
    req.auditContext,
    memoryContext,
    req.pageContext,
    undefined,
    req.portalContext,
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

    // Thread persistence (portal): save user message + assistant reply
    if (req._threadId) {
      if (req._isDuplicateTurn) {
        // User message already in thread (retry) — only append the assistant reply
        await appendMessage(req._threadId, "assistant", fullReply)
          .catch((err) => log.error("[assistant] Thread append error:", err));
      } else {
        const lastUserMsg = chatMessages[chatMessages.length - 1];
        if (lastUserMsg?.role === "user") {
          await appendTurn(req._threadId, lastUserMsg.content, fullReply)
            .catch((err) => log.error("[assistant] Thread append error:", err));
        }
      }
    }

    // chatMemory: still save for memory signals extraction (all surfaces)
    const signals = extractMemorySignals(allMessages);
    await saveMemory(req.sessionId, allMessages, {
      reportId: req.reportId,
      userId: req.userId,
      surface: req.surface,
      ...signals,
    }).catch((err) => log.error("[assistant] Memory save error:", err));

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
    tools: req.tools,
    modelOverride: req.model,
  });

  const onComplete = async (fullReply: string) => {
    const latencyMs = Date.now() - startMs;

    // Persist memory
    await createOnComplete(req, chatMessages)(fullReply);

    // Log usage (stream finalMessage has token counts)
    try {
      const finalMessage = await stream.finalMessage();
      const hadToolCall = finalMessage.stop_reason === "tool_use";
      logUsage({
        model: req.model || getModel(),
        surface: req.surface,
        sessionId: req.sessionId,
        userId: req.userId,
        reportId: req.reportId,
        inputTokens: finalMessage.usage?.input_tokens,
        outputTokens: finalMessage.usage?.output_tokens,
        latencyMs,
        success: true,
        metadata: hadToolCall ? { had_tool_call: true } : undefined,
      });
    } catch {
      logUsage({
        model: req.model || getModel(),
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
