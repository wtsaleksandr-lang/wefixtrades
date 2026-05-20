import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Send, X, MessageCircle } from "lucide-react";
import {
  getSessionId, readSSEStream, sendChatMessage,
  loadMessages, saveMessages, loadOpenState, saveOpenState,
  type ChatMessage,
} from "@/lib/chatHelpers";
import { SERVICES, type Service } from "@shared/services";
import { parseRecommendations } from "@/lib/recommendations";
import { RecommendationCard } from "@/components/RecommendationCard";
import CheckoutModal from "@/components/CheckoutModal";

const GREETING: ChatMessage = {
  role: "assistant",
  content: "Hey! I'm here if you have any questions about growing your trades business online. What can I help you with?",
};

/**
 * Capture a live text snapshot of the page the visitor is on, so the
 * assistant can answer about what they're looking at — and stay current
 * with the site without any sync step. Prefers <main> to skip nav /
 * footer / the chat widget itself.
 */
function capturePageSnapshot(): string {
  if (typeof document === "undefined") return "";
  const root = document.querySelector("main") ?? document.body;
  const text = (root as HTMLElement).innerText || "";
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
}

export default function SiteChatWidget() {
  const [open, setOpen] = useState(() => loadOpenState());
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadMessages();
    return saved.length > 0 ? saved : [GREETING];
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showDot, setShowDot] = useState(() => loadMessages().length <= 1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(getSessionId());
  const [checkoutService, setCheckoutService] = useState<Service | null>(null);
  const [location] = useLocation();

  // Persist messages and open state
  useEffect(() => { saveMessages(messages); }, [messages]);
  useEffect(() => { saveOpenState(open); }, [open]);

  // Scroll to bottom within the chat container (not the page)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages, streaming]);

  // Native wheel event listener with passive: false so preventDefault works
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      const { scrollTop, scrollHeight, clientHeight } = el!;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) {
        e.preventDefault();
      }
      e.stopPropagation();
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open]);

  function openChat() {
    setOpen(true);
    setShowDot(false);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    if (!open) {
      setOpen(true);
      setShowDot(false);
    }

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setStreaming(true);

    try {
      const res = await sendChatMessage({
        surface: "website",
        messages: newMessages,
        sessionId: sessionId.current,
        // Live page context — the assistant can answer about the page the
        // visitor is on, always current with whatever is published.
        pageContext: { route: location, page: location },
        pageContentSnapshot: capturePageSnapshot(),
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
      await readSSEStream(res, (fullText) => {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: fullText };
          return copy;
        });
      });
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
            borderRadius: 14,
            background: "linear-gradient(135deg, #0d3cfc 0%, #0b34d6 100%)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
            transition: "transform 0.2s ease",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1.06)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1)";
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

      {/* Backdrop overlay (mobile) */}
      {open && (
        <div
          className="wft-site-chat-backdrop"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9998,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        />
      )}

      {/* Chat panel.
       * Wave L C1 — explicit max-width/max-height clamps so the panel header
       * always fits inside the viewport on 360px and 390px-wide phones. */}
      {open && (
        <div className="wft-site-chat-panel" onWheel={e => e.stopPropagation()} style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          width: 360,
          maxWidth: "calc(100vw - 16px)",
          height: 500,
          maxHeight: "90vh",
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
            background: "linear-gradient(135deg, #0d3cfc 0%, #0b34d6 100%)",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>We're here to help</div>
              {/* Wave L C2 — removed "Usually replies instantly". An AI
               * assistant always does, so the line read as off-brand
               * marketing speak rather than a useful signal. */}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: "#22C55E", display: "inline-block",
                }} />
                Available 24/7
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
          <div
            ref={messagesContainerRef}
            style={{
              flex: 1,
              overflowY: "auto",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
              padding: "16px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              background: "#F9FAFB",
            }}
          >
            {messages.map((msg, i) => {
              if (msg.role === "user") {
                return (
                  <div
                    key={i}
                    style={{
                      maxWidth: "82%",
                      alignSelf: "flex-end",
                      padding: "10px 14px",
                      borderRadius: "14px 14px 4px 14px",
                      fontSize: 13,
                      lineHeight: 1.5,
                      background: "linear-gradient(135deg, #0d3cfc, #0b34d6)",
                      color: "#fff",
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {msg.content || "\u00A0"}
                  </div>
                );
              }
              // Assistant \u2014 strip any recommendation block, render product
              // cards for the services it named.
              const { cleanText, serviceIds } = parseRecommendations(msg.content);
              const recs = serviceIds
                .map((id) => SERVICES.find((s) => s.id === id))
                .filter((s): s is Service => !!s);
              return (
                <div
                  key={i}
                  style={{
                    maxWidth: "92%",
                    alignSelf: "flex-start",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {(cleanText.trim() || recs.length === 0) && (
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "14px 14px 14px 4px",
                        fontSize: 13,
                        lineHeight: 1.5,
                        background: "#fff",
                        color: "#1A1A2E",
                        border: "1px solid #E5E7EB",
                        wordBreak: "break-word",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {cleanText || "\u00A0"}
                    </div>
                  )}
                  {recs.map((s) => (
                    <RecommendationCard key={s.id} service={s} onAddToPackage={setCheckoutService} />
                  ))}
                </div>
              );
            })}
            {streaming && messages[messages.length - 1]?.content === "" && (
              <div style={{ display: "flex", gap: 4, padding: "8px 14px", alignSelf: "flex-start" }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: "50%", background: "#0d3cfc",
                    animation: `wftDotBounce 1.4s ease-in-out ${i * 0.2}s infinite both`,
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
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
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
              onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "#0d3cfc"; }}
              onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; }}
            />
            <button
              onClick={handleSend}
              disabled={streaming}
              aria-label="Send message"
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                border: "none",
                background: "linear-gradient(135deg, #0d3cfc, #0b34d6)",
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
        @media (max-width: 480px) {
          /* Wave L C1 — tighter clamps so the panel header stays fully
           * visible on small phones (360 / 390px). 8px symmetric margin
           * leaves room for the safe-area inset on iOS notch devices. */
          .wft-site-chat-panel {
            bottom: 8px !important;
            right: 8px !important;
            left: 8px !important;
            top: auto !important;
            width: auto !important;
            max-width: calc(100vw - 16px) !important;
            height: 90vh !important;
            max-height: 90vh !important;
            border-radius: 16px !important;
          }
          .wft-site-chat-backdrop {
            display: block;
          }
        }
        @media (min-width: 481px) {
          .wft-site-chat-backdrop {
            display: none;
          }
        }
      `}</style>

      <CheckoutModal
        open={!!checkoutService}
        onClose={() => setCheckoutService(null)}
        title={checkoutService?.name ?? ""}
        items={
          checkoutService
            ? [{
                serviceId: checkoutService.id,
                label: checkoutService.name,
                price: checkoutService.price,
                billingPeriod: checkoutService.billingPeriod,
              }]
            : []
        }
        yearly={false}
      />
    </>
  );
}
