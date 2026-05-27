import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Send, X, MessageCircle } from "lucide-react";
import {
  getMarketingChatSessionId,
  loadMessages, saveMessages, loadOpenState, saveOpenState,
  type ChatMessage,
} from "@/lib/chatHelpers";
import { SERVICES, type Service } from "@shared/services";
import { parseRecommendations } from "@/lib/recommendations";
import { RecommendationCard } from "@/components/RecommendationCard";
import CheckoutModal from "@/components/CheckoutModal";
import CopilotCards from "@/components/shared/CopilotCards";
import CopilotPromptCard from "@/components/shared/CopilotPromptCard";
import type { CopilotCard, CopilotPromptRequest } from "@shared/copilotProtocol";

/* Wave 12A: assistant messages on this surface can carry guided-tour
 * extras emitted by the new /api/marketing/chat endpoint. cards = product
 * recommendation tiles; prompt = AI-generated buttons for the next turn. */
type MarketingChatMessage = ChatMessage & { cards?: CopilotCard[]; prompt?: CopilotPromptRequest };

const GREETING: MarketingChatMessage = {
  role: "assistant",
  content: "Hey! I'm here to help you grow your trade business online. What brings you here today?",
  prompt: {
    prompt: "Pick the one that sounds most like you:",
    options: [
      { label: "More bookings", value: "I want more bookings" },
      { label: "Higher Google ranking", value: "I want to rank higher on Google" },
      { label: "Better reviews", value: "I want more 5-star reviews" },
      { label: "Save time on content", value: "I want to save time on social/content" },
      { label: "Just exploring", value: "Just exploring for now" },
    ],
    allow_custom: true,
  },
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
  const [messages, setMessages] = useState<MarketingChatMessage[]>(() => {
    const saved = loadMessages();
    return saved.length > 0 ? saved : [GREETING];
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showDot, setShowDot] = useState(() => loadMessages().length <= 1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  /* Wave 12A: uuid-formed session id for /api/marketing/chat. Persists in
   * localStorage so a returning visitor's conversation continues server-side
   * (the row keeps growing in marketing_chat_sessions). */
  const sessionId = useRef(getMarketingChatSessionId());
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

  /* Wave 12A: switched from /api/chat (legacy, streaming, generic) to the
   * new /api/marketing/chat endpoint. Non-streaming JSON makes it easy to
   * deliver the structured CARDS + PROMPT alongside the reply. The legacy
   * recommendation parser (parseRecommendations / SERVICES) still runs as
   * a fallback so the widget keeps showing product tiles even if the new
   * endpoint is down or returns no CARDS for a given turn. */
  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;
    setInput("");

    if (!open) {
      setOpen(true);
      setShowDot(false);
    }

    // capturePageSnapshot is currently unused on this path because the new
    // endpoint focuses on guided qualification rather than page-aware Q&A.
    // Keeping the helper available — referenced as void below to satisfy
    // TS no-unused-locals if it ever drifts to no caller.
    void capturePageSnapshot;

    const newMessages: MarketingChatMessage[] = [
      ...messages,
      { role: "user", content: text.trim() },
    ];
    setMessages(newMessages);
    setStreaming(true);

    try {
      const res = await fetch("/api/marketing/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId.current,
          // Server keeps a server-side transcript; sending the recent
          // client-side history makes the AI's context match what the user
          // sees in the panel even after a refresh.
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          landing_path: location,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              err.error ||
              "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
          },
        ]);
        setStreaming(false);
        return;
      }
      const data = (await res.json()) as {
        reply: string;
        cards?: CopilotCard[];
        prompt_request?: CopilotPromptRequest;
      };
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || " ",
          cards: data.cards && data.cards.length > 0 ? data.cards : undefined,
          prompt: data.prompt_request,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    }
    setStreaming(false);
  }

  async function handleSend() {
    await sendMessage(input);
  }

  return (
    <div data-theme="light" style={{ display: "contents" }}>
      {/* Floating chat button */}
      {!open && (
        <button
          onClick={openChat}
          // Wave 47 — when the unread badge renders, its visible "1" must
          // appear inside the accessible name (axe-core
          // `label-content-name-mismatch`). The icon is decorative.
          aria-label={showDot ? "Open chat, 1 unread message" : "Open chat"}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9998,
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "linear-gradient(135deg, #0d3cfc 0%, #0b34d6 100%)",
            color: "#FFFFFF",
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
          <MessageCircle size={24} color="#fff" aria-hidden="true" />
          {showDot && (
            <span aria-hidden="true" style={{
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
              <X size={20} />
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
              // Assistant \u2014 strip any legacy recommendation block (kept as
              // a fallback for turns where the new endpoint didn't emit
              // structured CARDS), then render the cleaned text + cards +
              // prompt-card the new endpoint may have returned.
              const { cleanText, serviceIds } = parseRecommendations(msg.content);
              const recs = serviceIds
                .map((id) => SERVICES.find((s) => s.id === id))
                .filter((s): s is Service => !!s);
              const cards = msg.cards;
              const prompt = msg.prompt;
              const isLastMessage = i === messages.length - 1;
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
                  {(cleanText.trim() || (recs.length === 0 && !cards && !prompt)) && (
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
                  {/* Wave 12A: structured product / next-step cards. */}
                  {cards && cards.length > 0 && (
                    <CopilotCards
                      cards={cards}
                      variant="widget"
                      onSelect={(card) => {
                        if (card.href && card.href.startsWith("https://")) {
                          window.open(card.href, "_blank", "noopener");
                          return;
                        }
                        if (card.href && card.href.startsWith("/")) {
                          window.location.assign(card.href);
                        }
                      }}
                    />
                  )}
                  {/* Legacy: parseRecommendations fallback for any older
                      response format. New endpoint returns structured
                      CARDS via the block above instead. */}
                  {recs.map((s) => (
                    <RecommendationCard key={s.id} service={s} onAddToPackage={setCheckoutService} />
                  ))}
                  {/* Wave 12A: AI-generated quick-reply buttons. Only render
                      on the LAST assistant message \u2014 older prompts have
                      already been answered. */}
                  {prompt && isLastMessage && (
                    <CopilotPromptCard
                      request={prompt}
                      disabled={streaming}
                      onRespond={(v) => sendMessage(v)}
                    />
                  )}
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
    </div>
  );
}
