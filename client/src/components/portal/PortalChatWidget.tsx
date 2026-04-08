import { useEffect, useRef, useState } from "react";
import { Send, X, MessageCircle, Sparkles } from "lucide-react";
import {
  readSSEStream, sendChatMessage,
  loadPortalMessages, savePortalMessages,
  loadPortalOpenState, savePortalOpenState,
  type ChatMessage,
} from "@/lib/chatHelpers";
import { usePortalPageContext } from "@/hooks/usePortalPageContext";
import { useAuth } from "@/hooks/useAuth";

/* ─── Types ─── */
interface StructuredResponse {
  message: string;
  suggestions?: string[];
  next_step?: string;
  ui_intent?: { type: string; payload?: any };
}

/* ─── Constants ─── */
const GREETING: ChatMessage = {
  role: "assistant",
  content: "Hey! I'm your portal assistant. Ask me about your services, billing, setup — anything.",
};

/** Try to parse a structured JSON response, fall back to plain text */
function parseResponse(text: string): StructuredResponse {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.message === "string") return parsed;
    } catch { /* not JSON — treat as plain text */ }
  }
  return { message: text };
}

export default function PortalChatWidget() {
  const { user } = useAuth();
  const { label, page, onboardingId, suggestions: defaultSuggestions } = usePortalPageContext();

  const [open, setOpen] = useState(() => loadPortalOpenState());
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadPortalMessages();
    return saved.length > 0 ? saved : [GREETING];
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeSuggestions, setActiveSuggestions] = useState<string[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Session ID is user-scoped (matches server-side portal_{userId})
  const sessionId = useRef(`portal_${user?.id ?? "anon"}`);

  // Persist messages and open state
  useEffect(() => { savePortalMessages(messages); }, [messages]);
  useEffect(() => { savePortalOpenState(open); }, [open]);

  // Scroll to bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages, streaming]);

  // Trap scroll inside chat panel
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      const { scrollTop, scrollHeight, clientHeight } = el!;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) e.preventDefault();
      e.stopPropagation();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]);

  // Show default suggestions when chat opens and last message is from assistant
  useEffect(() => {
    if (open && !streaming && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === "assistant" && last.content) {
        const parsed = parseResponse(last.content);
        setActiveSuggestions(parsed.suggestions ?? defaultSuggestions);
      }
    }
  }, [open, page]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || streaming) return;
    setInput("");
    setActiveSuggestions([]);

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setStreaming(true);

    try {
      const res = await sendChatMessage({
        surface: "portal",
        messages: newMessages,
        sessionId: sessionId.current,
        page,
        onboardingId,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, {
          role: "assistant",
          content: err.error || "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        }]);
        setStreaming(false);
        return;
      }

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);
      const fullText = await readSSEStream(res, (accumulated) => {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: accumulated };
          return copy;
        });
      });

      // Parse structured response for suggestions
      const parsed = parseResponse(fullText);
      if (parsed.suggestions?.length) {
        setActiveSuggestions(parsed.suggestions);
      } else {
        setActiveSuggestions(defaultSuggestions.slice(0, 2));
      }
    } catch {
      setMessages(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant" && !last.content) {
          copy[copy.length - 1] = { role: "assistant", content: "Something went wrong. Please try again." };
        } else {
          copy.push({ role: "assistant", content: "Something went wrong. Please try again." });
        }
        return copy;
      });
    }
    setStreaming(false);
  }

  return (
    <>
      {/* FAB button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open portal assistant"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 50,
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #2D6A4F 0%, #1B4332 100%)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px rgba(45, 106, 79, 0.35)",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1.08)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(45, 106, 79, 0.45)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(45, 106, 79, 0.35)";
          }}
        >
          <Sparkles size={22} color="#fff" />
        </button>
      )}

      {/* Backdrop (mobile only — handled via CSS) */}
      {open && (
        <div
          className="wft-portal-chat-backdrop"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 49,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        />
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="wft-portal-chat-panel"
          onWheel={e => e.stopPropagation()}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 50,
            width: 370,
            maxWidth: "calc(100vw - 32px)",
            height: 520,
            maxHeight: "calc(100vh - 48px)",
            borderRadius: 16,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            boxShadow: "0 8px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}>
            <Sparkles size={18} color="rgba(255,255,255,0.7)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                Portal Assistant — {label}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
                Always available
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                transition: "color 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            style={{
              flex: 1,
              overflowY: "auto",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
              padding: "14px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "#F9FAFB",
            }}
          >
            {messages.map((msg, i) => {
              const isAssistant = msg.role === "assistant";
              return (
                <div key={i} style={{ alignSelf: isAssistant ? "flex-start" : "flex-end", maxWidth: "84%" }}>
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: isAssistant ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
                      fontSize: 13,
                      lineHeight: 1.55,
                      ...(isAssistant
                        ? { background: "#fff", color: "#1A1A2E", border: "1px solid #E5E7EB" }
                        : { background: "linear-gradient(135deg, #2D6A4F, #1B4332)", color: "#fff" }),
                      wordBreak: "break-word" as const,
                      whiteSpace: "pre-wrap" as const,
                    }}
                  >
                    {msg.content || "\u00A0"}
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {streaming && messages[messages.length - 1]?.content === "" && (
              <div style={{ display: "flex", gap: 4, padding: "8px 14px", alignSelf: "flex-start" }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: "#2D6A4F",
                    animation: `wftPortalDotBounce 1.4s ease-in-out ${i * 0.2}s infinite both`,
                  }} />
                ))}
              </div>
            )}

            {/* Suggestion pills */}
            {!streaming && activeSuggestions.length > 0 && (
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                paddingTop: 4,
                alignSelf: "flex-start",
                maxWidth: "90%",
              }}>
                {activeSuggestions.slice(0, 3).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 20,
                      border: "1px solid #D1D5DB",
                      background: "#fff",
                      color: "#2D6A4F",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      lineHeight: 1.3,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = "#F0F7F4";
                      (e.currentTarget as HTMLElement).style.borderColor = "#2D6A4F";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = "#fff";
                      (e.currentTarget as HTMLElement).style.borderColor = "#D1D5DB";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderTop: "1px solid #E5E7EB",
            background: "#fff",
            flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask anything..."
              disabled={streaming}
              style={{
                flex: 1,
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 13,
                outline: "none",
                fontFamily: "inherit",
                background: streaming ? "#F9FAFB" : "#fff",
                transition: "border-color 0.15s",
              }}
              onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "#2D6A4F"; }}
              onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; }}
            />
            <button
              onClick={() => handleSend()}
              disabled={streaming}
              aria-label="Send message"
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #2D6A4F, #1B4332)",
                color: "#fff",
                cursor: streaming ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: streaming ? 0.6 : 1,
                transition: "opacity 0.15s",
                flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes wftPortalDotBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @media (max-width: 768px) {
          .wft-portal-chat-panel {
            bottom: 0 !important;
            right: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: calc(100vh - 56px) !important;
            max-height: calc(100vh - 56px) !important;
            border-radius: 16px 16px 0 0 !important;
          }
          .wft-portal-chat-backdrop {
            display: block;
          }
        }
        @media (min-width: 769px) {
          .wft-portal-chat-backdrop {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
