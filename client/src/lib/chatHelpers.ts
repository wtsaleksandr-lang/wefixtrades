/**
 * Shared chat utilities for all chat widget surfaces.
 * Provides session persistence, message storage, and SSE streaming.
 */

export type ChatMessage = { role: "user" | "assistant"; content: string };

/* ─── Session ID management ─── */
const SESSION_KEY = "wft_chat_session";
const MESSAGES_KEY = "wft_chat_messages";
const OPEN_KEY = "wft_chat_open";

export function getSessionId(): string {
  let id: string | null = null;
  try { id = localStorage.getItem(SESSION_KEY); } catch { /* noop */ }
  if (!id) {
    try { id = sessionStorage.getItem(SESSION_KEY); } catch { /* noop */ }
  }
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try { localStorage.setItem(SESSION_KEY, id); } catch { /* noop */ }
    try { sessionStorage.setItem(SESSION_KEY, id); } catch { /* noop */ }
  }
  return id;
}

/* ─── Message persistence (survives page navigation) ─── */
export function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* noop */ }
  return [];
}

export function saveMessages(messages: ChatMessage[]): void {
  try {
    // Keep last 40 messages to avoid bloating localStorage
    const trimmed = messages.slice(-40);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(trimmed));
  } catch { /* noop */ }
}

/* ─── Open state persistence (survives page navigation) ─── */
export function loadOpenState(): boolean {
  try { return localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
}

export function saveOpenState(open: boolean): void {
  try { localStorage.setItem(OPEN_KEY, open ? "1" : "0"); } catch { /* noop */ }
}

/* ─── Tool call event type (emitted by server when model calls a tool) ─── */
export interface ToolCallEvent {
  call_id: string;
  tool_name: string;
  display: {
    task_title: string;
    current_status: string;
    proposed_status: string;
    reason?: string;
  };
}

/* ─── SSE stream reader ─── */
/**
 * Reads a `text/event-stream` response and dispatches parsed events:
 *  - `{ text }`      — appended; `onChunk` receives the full text so far.
 *  - `{ tool_call }` — forwarded to `onToolCall` when provided.
 *  - `{ meta }`      — forwarded to `onMeta` when provided. The portal route
 *                      uses this to deliver post-stream results (the cleaned
 *                      reply, escalation draft, action proposals, etc.).
 *  - `{ error }`     — throws.
 *  - `[DONE]`        — ends the stream.
 *
 * Partial `data:` lines split across network reads are buffered until their
 * terminating newline arrives, so large events (e.g. the portal `meta`
 * payload) parse reliably instead of being silently dropped.
 */
export async function readSSEStream(
  response: Response,
  onChunk: (text: string) => void,
  onToolCall?: (event: ToolCallEvent) => void,
  onMeta?: (meta: any) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Drain every complete line; keep any trailing partial line buffered
      // for the next read.
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6);
        if (data === "[DONE]") return fullText;
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.text) {
            fullText += parsed.text;
            onChunk(fullText);
          }
          if (parsed.tool_call && onToolCall) {
            onToolCall(parsed.tool_call as ToolCallEvent);
          }
          if (parsed.meta && onMeta) {
            onMeta(parsed.meta);
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }

  return fullText;
}

/* ─── Send chat message to unified API ─── */
export interface SendChatParams {
  surface: "website" | "audit" | "admin" | "portal";
  messages: ChatMessage[];
  sessionId: string;
  reportId?: string;
  auditContext?: Record<string, any>;
  pageContext?: Record<string, any>;
  /** Portal page hint (e.g., "overview", "billing", "onboarding") */
  page?: string;
  /** Portal onboarding ID (for onboarding page context) */
  onboardingId?: number;
  /** Portal unsaved form responses (for onboarding context) */
  currentResponses?: Record<string, any>;
}

export async function sendChatMessage(params: SendChatParams): Promise<Response> {
  return fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: params.surface === "portal" ? "include" : "same-origin",
    body: JSON.stringify(params),
  });
}

/* ─── Portal-namespaced localStorage helpers ─── */
const PORTAL_MESSAGES_KEY = "wft_portal_chat_messages";
const PORTAL_OPEN_KEY = "wft_portal_chat_open";

export function loadPortalMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(PORTAL_MESSAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* noop */ }
  return [];
}

export function savePortalMessages(messages: ChatMessage[]): void {
  try {
    const trimmed = messages.slice(-40);
    localStorage.setItem(PORTAL_MESSAGES_KEY, JSON.stringify(trimmed));
  } catch { /* noop */ }
}

export function loadPortalOpenState(): boolean {
  try { return localStorage.getItem(PORTAL_OPEN_KEY) === "1"; } catch { return false; }
}

export function savePortalOpenState(open: boolean): void {
  try { localStorage.setItem(PORTAL_OPEN_KEY, open ? "1" : "0"); } catch { /* noop */ }
}
