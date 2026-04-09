import { useEffect, useRef, useState } from "react";
import { Send, X, Sparkles } from "lucide-react";
import {
  readSSEStream, sendChatMessage,
  loadPortalMessages, savePortalMessages,
  loadPortalOpenState, savePortalOpenState,
  type ChatMessage,
} from "@/lib/chatHelpers";
import { usePortalPageContext } from "@/hooks/usePortalPageContext";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingResponses } from "@/context/OnboardingContext";

/* ─── Constants ─── */
const GREETING: ChatMessage = {
  role: "assistant",
  content: "Hey! I'm your portal assistant. Ask me about your services, billing, setup — anything.",
};

export default function PortalChatWidget() {
  const { user } = useAuth();
  const { label, page, onboardingId, suggestions: defaultSuggestions } = usePortalPageContext();
  const { responses: onboardingResponses } = useOnboardingResponses();

  const [open, setOpen] = useState(() => loadPortalOpenState());
  const [visible, setVisible] = useState(() => loadPortalOpenState());
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadPortalMessages();
    return saved.length > 0 ? saved : [GREETING];
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeSuggestions, setActiveSuggestions] = useState<string[]>([]);
  const [threadHydrated, setThreadHydrated] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sessionId = useRef(`portal_${user?.id ?? "anon"}`);

  // Two-phase open: `visible` mounts with closed styles, then `open` triggers transition
  function handleOpen() {
    setVisible(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  }
  function handleClose() {
    setOpen(false);
    // Wait for transition to finish before hiding
    setTimeout(() => setVisible(false), 250);
  }

  // Hydrate from server thread when page changes
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const res = await fetch(
          `/api/portal/thread/messages?page=${encodeURIComponent(page)}`,
          { credentials: "include" },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.messages && data.messages.length > 0) {
          const threadMsgs: ChatMessage[] = data.messages.map((m: any) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
          setMessages([GREETING, ...threadMsgs]);
        } else {
          setMessages([GREETING]);
        }
      } catch {
        // Network error — keep current messages
      } finally {
        if (!cancelled) setThreadHydrated(true);
      }
    }
    hydrate();
    return () => { cancelled = true; };
  }, [page]);

  // Persist
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
  }, [visible]);

  // Show default suggestions when chat opens or page changes
  useEffect(() => {
    if (open && !streaming && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === "assistant" && last.content) {
        setActiveSuggestions(defaultSuggestions);
      }
    }
  }, [open, page]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 260);
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
        currentResponses: onboardingId && Object.keys(onboardingResponses).length > 0
          ? onboardingResponses
          : undefined,
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
      await readSSEStream(res, (accumulated) => {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: accumulated };
          return copy;
        });
      });

      setActiveSuggestions(defaultSuggestions.slice(0, 2));
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
      {/* FAB button — visible when panel is closed */}
      <button
        onClick={handleOpen}
        aria-label="Open portal assistant"
        className="wft-chat-fab"
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
          transition: "transform 0.25s ease, box-shadow 0.25s ease, opacity 0.2s ease",
          opacity: visible ? 0 : 1,
          pointerEvents: visible ? "none" : "auto",
          transform: visible ? "scale(0.8)" : "scale(1)",
        }}
        onMouseEnter={e => {
          if (!visible) {
            (e.currentTarget as HTMLElement).style.transform = "scale(1.08)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(45, 106, 79, 0.45)";
          }
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.transform = visible ? "scale(0.8)" : "scale(1)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(45, 106, 79, 0.35)";
        }}
      >
        <Sparkles size={22} color="#fff" />
      </button>

      {/* Backdrop — mobile only, with blur */}
      {visible && (
        <div
          className="wft-chat-backdrop"
          onClick={handleClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 49,
            background: open ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0)",
            backdropFilter: open ? "blur(6px)" : "blur(0px)",
            WebkitBackdropFilter: open ? "blur(6px)" : "blur(0px)",
            transition: "background 0.25s ease, backdrop-filter 0.25s ease, -webkit-backdrop-filter 0.25s ease",
          }}
        />
      )}

      {/* Chat panel — always in DOM when visible, animated via open class */}
      {visible && (
        <div
          className={`wft-chat-panel ${open ? "wft-chat-panel--open" : ""}`}
          onWheel={e => e.stopPropagation()}
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
              onClick={handleClose}
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
                    animation: `wftDotBounce 1.4s ease-in-out ${i * 0.2}s infinite both`,
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
        @keyframes wftDotBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }

        /* ─── Desktop panel ─── */
        .wft-chat-panel {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 50;
          width: min(380px, 32vw);
          height: 75vh;
          max-height: 640px;
          min-height: 360px;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          background: #fff;
          box-shadow: 0 8px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08);
          font-family: Inter, system-ui, sans-serif;
          /* Closed state — slide down + fade */
          opacity: 0;
          transform: translateY(16px) scale(0.97);
          transition: opacity 0.25s ease, transform 0.25s ease;
          pointer-events: none;
        }
        .wft-chat-panel--open {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }

        /* ─── Desktop: no backdrop ─── */
        @media (min-width: 769px) {
          .wft-chat-backdrop {
            display: none !important;
          }
        }

        /* ─── Mobile: full-screen bottom sheet ─── */
        @media (max-width: 768px) {
          .wft-chat-panel {
            bottom: 0;
            right: 0;
            left: 0;
            width: 100%;
            height: 100vh;
            height: 100dvh;
            max-height: 100vh;
            max-height: 100dvh;
            min-height: unset;
            border-radius: 0;
            /* Mobile closed: slide up from bottom */
            transform: translateY(100%);
            opacity: 1;
          }
          .wft-chat-panel--open {
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
