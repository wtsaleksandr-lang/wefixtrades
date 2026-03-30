/**
 * Shared chat utilities for all chat widget surfaces.
 * Eliminates duplication between AuditChatWidget and SiteChatWidget.
 */

export type ChatMessage = { role: "user" | "assistant"; content: string };

/* ─── Session ID management ─── */
const SESSION_KEY = "wft_chat_session";

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
          if (parsed.text) {
            fullText += parsed.text;
            onChunk(fullText);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
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
