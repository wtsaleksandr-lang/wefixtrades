/**
 * Shared assistant core — the "brain" that is decoupled from any transport
 * (HTTP/SSE, REST, Vapi voice, WebSocket, etc).
 *
 * All chat surfaces (audit widget, site widget, dashboard, admin, Vapi)
 * call through here. The caller is responsible for transport (streaming SSE,
 * returning JSON, piping to Vapi, etc).
 */

import { streamChat, chat, validateConfig, type ChatMessage, type ChatOptions } from "./aiService";
import { buildSystemPrompt, type ChatSurface, type AuditContext, type MemoryContext } from "./promptBuilder";
import { getMemory, saveMemory, extractMemorySignals } from "./chatMemory";

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
  /** Report ID to load context from DB */
  reportId?: string;
  /** Override max tokens for this request */
  maxTokens?: number;
}

export interface AssistantStreamResult {
  /** The Anthropic stream object — caller iterates events */
  stream: ReturnType<typeof streamChat>;
  /** Call after streaming is done to persist memory */
  onComplete: (fullReply: string) => Promise<void>;
}

export interface AssistantSyncResult {
  reply: string;
}

/* ─── Health check ─── */
export function isReady(): { ready: boolean; error?: string } {
  return validateConfig();
}

/* ─── Build context (shared between stream and sync) ─── */
async function buildContext(req: AssistantRequest): Promise<{
  systemPrompt: string;
  chatMessages: ChatMessage[];
  memoryContext?: MemoryContext;
}> {
  // Load stored memory
  const stored = await getMemory(req.sessionId).catch(() => null);
  const memoryContext = stored?.memory;

  // Build system prompt from surface + context + memory
  const systemPrompt = buildSystemPrompt(
    req.surface,
    req.auditContext,
    memoryContext,
  );

  // Cap messages to prevent token overflow (keep recent turns)
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
  };
}

/* ─── Streaming response (for SSE, Vapi streaming, etc) ─── */
export async function assistantStream(req: AssistantRequest): Promise<AssistantStreamResult> {
  const { systemPrompt, chatMessages } = await buildContext(req);

  const stream = streamChat({
    system: systemPrompt,
    messages: chatMessages,
    maxTokens: req.maxTokens,
  });

  return {
    stream,
    onComplete: createOnComplete(req, chatMessages),
  };
}

/* ─── Synchronous response (for REST, Vapi sync, webhooks, etc) ─── */
export async function assistantSync(req: AssistantRequest): Promise<AssistantSyncResult> {
  const { systemPrompt, chatMessages } = await buildContext(req);

  const reply = await chat({
    system: systemPrompt,
    messages: chatMessages,
    maxTokens: req.maxTokens,
  });

  // Persist memory
  await createOnComplete(req, chatMessages)(reply);

  return { reply };
}
