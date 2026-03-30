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

/* ─── SSE stream reader ─── */
export async function readSSEStream(
  response: Response,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let fullText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

      for (const line of lines) {
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
  surface: "website" | "audit";
  messages: ChatMessage[];
  sessionId: string;
  reportId?: string;
  auditContext?: Record<string, any>;
}

export async function sendChatMessage(params: SendChatParams): Promise<Response> {
  return fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}
