/**
 * Shared assistant core — the "brain" that is decoupled from any transport
 * (HTTP/SSE, REST, Vapi voice, WebSocket, etc).
 *
 * All chat surfaces (audit widget, site widget, dashboard, admin, Vapi)
 * call through here. The caller is responsible for transport (streaming SSE,
 * returning JSON, piping to Vapi, etc).
 */

import { streamChat, chat, validateConfig, getModel, type ChatMessage, type ChatOptions } from "./aiService";
import { AI_SURFACES, type AiSurface } from "./aiSurfaces";
import { buildSystemPrompt, type ChatSurface, type AuditContext, type MemoryContext, type PageContext, type PortalContext } from "./promptBuilder";
import { getMemory, getMemoryByUserId, saveMemory, extractMemorySignals } from "./chatMemory";
import { getOrCreateThread, loadThreadMessages, appendTurn, appendMessage, derivePageContext } from "./threadService";
import { logUsage } from "./usageTracker";
import { evaluateAndArchive } from "./conversationArchiver";
import { runAgentLoop, type AgentLoopResult, type ToolExecutor, type AgentLoopStep } from "./aiAgentLoop";
import type { ActionSurface } from "./copilotActionRegistry";
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
  /**
   * Optional image attachments for the LAST user message (multimodal).
   * Used by the mobile Ask tab. Each item must have the raw image bytes
   * (read from object storage by the caller) plus its mediaType. The
   * `assetId`/`mimeType`/`sizeBytes` triple is persisted as JSON on the
   * user `assistant_messages` row so the thread can be re-rendered with
   * thumbnails later.
   */
  userAttachments?: Array<{
    assetId: string;
    mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    sizeBytes: number;
    data: Buffer;
  }>;
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

/**
 * Map the assistant's `ChatSurface` (transport-flavored: website/audit/
 * portal/tradeline_demo/vapi/dashboard/admin) onto an AiSurface from
 * aiSurfaces.ts so chat() can gate + record spend on the system-wide
 * registry. Without this, assistantSync bypasses ai_system_gates.
 */
function chatSurfaceToAiSurface(surface: ChatSurface): AiSurface {
  switch (surface) {
    case "audit":          return AI_SURFACES.wft_audit;
    case "vapi":           return AI_SURFACES.tradeline_voice;
    case "tradeline_demo": return AI_SURFACES.tradeline_voice;
    case "admin":          return AI_SURFACES.business_operator;
    case "portal":         return AI_SURFACES.business_operator;
    case "dashboard":      return AI_SURFACES.business_operator;
    case "website":        return AI_SURFACES.business_operator;
    default:               return AI_SURFACES.business_operator;
  }
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

    // Thread persistence (portal): save user message + assistant reply.
    // Multimodal: if the user turn carried image attachments, strip the
    // raw bytes and persist only the {assetId, mimeType, sizeBytes}
    // references on the user row.
    if (req._threadId) {
      const attachmentRefs = req.userAttachments?.length
        ? req.userAttachments.map((a) => ({
            assetId: a.assetId,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
          }))
        : undefined;

      if (req._isDuplicateTurn) {
        // User message already in thread (retry) — only append the assistant reply
        await appendMessage(req._threadId, "assistant", fullReply)
          .catch((err) => log.error("[assistant] Thread append error:", err));
      } else {
        const lastUserMsg = chatMessages[chatMessages.length - 1];
        if (lastUserMsg?.role === "user") {
          await appendTurn(req._threadId, lastUserMsg.content, fullReply, attachmentRefs)
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
      // audit/ai 2026-05-24: wire surface so chat() runs aiGateAllowed,
      // writes ai_usage_logs, and bumps ai_system_gates.monthly_spent_cents.
      // ChatSurface (transport label) → AiSurface (system gate registry).
      surface: chatSurfaceToAiSurface(req.surface),
      userId: req.userId,
      sessionId: req.sessionId,
      userImageBlocks: req.userAttachments?.length
        ? req.userAttachments.map((a) => ({ mediaType: a.mimeType, data: a.data }))
        : undefined,
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

/* ─── Agent loop entry (W-BA-0) ─── */

/**
 * Multi-step agent loop wrapper. Reuses buildContext so prompts + thread
 * history land the same way the single-call path does, then hands off to
 * runAgentLoop. Caller supplies `toolExecutors` (for auto-tier tools) +
 * which action-registry surface to consult.
 *
 * The loop short-circuits on `low`/`draft` actions and returns a `pending`
 * payload — the caller wires that into the existing storePendingAction()
 * confirm-card flow, so the rest of the system is untouched.
 *
 * `onStep` is the SSE hook — every loop step (tool_use, tool_result, text,
 * stop) fires it so the caller can stream it to the browser.
 */
export interface AssistantAgentLoopOptions {
  toolExecutors: Record<string, ToolExecutor>;
  actionSurface: ActionSurface;
  onStep?: (step: AgentLoopStep) => void;
  maxSteps?: number;
  costCapCents?: number;
  /** Opt in to a text-only degraded reply if the first model call fails (a
   *  provider outage). Safe only for interactive copilots — tools are dropped
   *  in degraded mode. See AgentLoopInput.allowTextOnlyFallback. */
  allowTextOnlyFallback?: boolean;
}

export async function assistantAgentLoop(
  req: AssistantRequest,
  opts: AssistantAgentLoopOptions,
): Promise<AgentLoopResult> {
  const { systemPrompt, chatMessages } = await buildContext(req);

  const result = await runAgentLoop({
    systemPrompt,
    conversationHistory: chatMessages,
    tools: (req.tools || []) as any,
    toolExecutors: opts.toolExecutors,
    surface: req.surface,
    actionSurface: opts.actionSurface,
    userId: req.userId,
    sessionId: req.sessionId,
    modelOverride: req.model,
    maxTokensPerStep: req.maxTokens,
    onStep: opts.onStep,
    maxSteps: opts.maxSteps,
    costCapCents: opts.costCapCents,
    allowTextOnlyFallback: opts.allowTextOnlyFallback,
  });

  // Persist memory + archive when the loop produced a final text. Pending /
  // gate / error outcomes skip persistence — the existing single-call confirm
  // flow handles those (and persists on confirm).
  if (result.status === "text" && result.reply) {
    await createOnComplete(req, chatMessages)(result.reply).catch((err) =>
      log.error("[assistant] agent-loop onComplete error:", { error: String(err) }),
    );
  }

  return result;
}
