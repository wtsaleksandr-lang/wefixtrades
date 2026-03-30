import { useEffect, useRef, useState } from "react";
import { Send, X, MessageCircle } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

function getSessionId(): string {
  const KEY = "wft_chat_session";
  let id = sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try { localStorage.setItem(KEY, id); } catch { /* noop */ }
    try { sessionStorage.setItem(KEY, id); } catch { /* noop */ }
  }
  return id;
}

export default function SiteChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showDot, setShowDot] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(getSessionId());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  function openChat() {
    setOpen(true);
    setShowDot(false);
    if (messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: "Hey! I'm here if you have any questions about growing your trades business online. What can I help you with?",
      }]);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "general",
          messages: newMessages,
          sessionId: sessionId.current,
        }),
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

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
          for (const line of lines) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                assistantText += parsed.text;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: "assistant", content: assistantText };
                  return copy;
                });
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Please try again." }]);
    }
    setStreaming(false);
  }

  return (
    <>
      {/* Floating chat button */}
      {!open && (
        <button
          onClick={openChat}
          aria-label="Open chat"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9998,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #00D4C8 0%, #00B4AA 100%)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 20px rgba(0, 212, 200, 0.35)",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1.08)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 28px rgba(0, 212, 200, 0.45)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0, 212, 200, 0.35)";
          }}
        >
          <MessageCircle size={24} color="#fff" />
          {showDot && (
            <span style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#FF6B35",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #fff",
            }}>1</span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          width: 360,
          maxWidth: "calc(100vw - 32px)",
          height: 500,
          maxHeight: "calc(100vh - 48px)",
          borderRadius: 16,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          boxShadow: "0 8px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}>
          {/* Header */}
          <div style={{
            background: "linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>We're here to help</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: "#22C55E", display: "inline-block",
                }} />
                Available 24/7 — Usually replies instantly
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
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
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: "#F9FAFB",
          }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  maxWidth: "82%",
                  alignSelf: msg.role === "assistant" ? "flex-start" : "flex-end",
                  padding: "10px 14px",
                  borderRadius: msg.role === "assistant" ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  ...(msg.role === "assistant"
                    ? { background: "#fff", color: "#1A1A2E", border: "1px solid #E5E7EB" }
                    : { background: "linear-gradient(135deg, #00D4C8, #00B4AA)", color: "#fff" }),
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.content || "\u00A0"}
              </div>
            ))}
            {streaming && messages[messages.length - 1]?.content === "" && (
              <div style={{ display: "flex", gap: 4, padding: "8px 14px", alignSelf: "flex-start" }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: "#00D4C8",
                    animation: `siteChatDotBounce 1.4s ease-in-out ${i * 0.2}s infinite both`,
                  }} />
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
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Ask us anything..."
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
              onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "#00D4C8"; }}
              onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; }}
            />
            <button
              onClick={sendMessage}
              disabled={streaming}
              aria-label="Send message"
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #00D4C8, #00B4AA)",
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

      {/* Keyframe animation for typing dots */}
      <style>{`
        @keyframes siteChatDotBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @media (max-width: 480px) {
          /* Full-screen on small mobile */
          div[style*="zIndex: 9999"] {
            bottom: 0 !important;
            right: 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            height: 100vh !important;
            max-height: 100vh !important;
            border-radius: 0 !important;
          }
        }
      `}</style>
    </>
  );
}
