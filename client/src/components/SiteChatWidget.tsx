import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import {
  Send, X, MessageCircle, Phone, Star, Share2, Calculator, MapPin, ArrowRight,
  Home, Search, BookOpen, ChevronRight, Layers, Sparkles, Tag, FileText, Mail,
} from "lucide-react";
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

/* Phase 1 (Crisp-style shell): the widget now has a Home screen, the AI
 * Messages chat, a Help/articles browser, and Search — switched via the
 * bottom tab bar. Articles/Search are starter shells; Phase 2 wires them to
 * a real knowledge base + search index. The Messages tab is the existing
 * AI concierge chat, unchanged in behaviour. */
type Screen = "home" | "messages" | "help" | "search";

const GREETING: MarketingChatMessage = {
  role: "assistant",
  content: "Hey! I'm here to help you grow your trade business. Tap what you need — or just ask me anything.",
};

/* Welcome-screen quick actions — premium, high-intent shortcuts phrased the
 * way a tradesperson would say it. Tapping one sends it as the first message,
 * which routes the conversation straight to the matching product. Kept to 5
 * (best-practice 3–5). */
const QUICK_ACTIONS: { icon: typeof Phone; label: string; value: string }[] = [
  { icon: Phone, label: "Answer my calls & texts when I'm busy", value: "I want something to answer my calls and messages when I'm on the job." },
  { icon: Star, label: "Get me more 5-star reviews", value: "I want to get more 5-star Google reviews from my customers, automatically." },
  { icon: Calculator, label: "Set up an instant quote tool", value: "I want an instant quote tool on my website so customers can price a job themselves." },
  { icon: Share2, label: "Handle my social media posts", value: "I want you to handle my social media posts for me." },
  { icon: MapPin, label: "Get me found on Google locally", value: "I want to rank higher on Google and get found by local customers." },
];

/* Help/articles entry points. Phase 1 links to the canonical hub pages;
 * Phase 2 replaces this with a searchable knowledge base (docs + blog + FAQ). */
const HELP_LINKS: { icon: typeof Phone; title: string; sub: string; href: string }[] = [
  { icon: Layers, title: "All products", sub: "The 12 tools, explained", href: "/products" },
  { icon: Sparkles, title: "Free tools", sub: "19 free tools, no signup", href: "/free-tools" },
  { icon: Tag, title: "Pricing & plans", sub: "Bundles and what's included", href: "/pricing" },
  { icon: FileText, title: "Docs & guides", sub: "Setup and how-tos", href: "/docs" },
  { icon: Star, title: "Case studies", sub: "Results from real trades", href: "/case-studies" },
  { icon: Mail, title: "Contact us", sub: "Talk to a human", href: "/contact" },
];

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

const BRAND_GRAD = "linear-gradient(135deg, #0d3cfc 0%, #0b34d6 100%)";

export default function SiteChatWidget() {
  const [open, setOpen] = useState(() => loadOpenState());
  const [screen, setScreen] = useState<Screen>("home");
  const [messages, setMessages] = useState<MarketingChatMessage[]>(() => {
    const saved = loadMessages();
    return saved.length > 0 ? saved : [GREETING];
  });
  const [input, setInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showDot, setShowDot] = useState(() => loadMessages().length <= 1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  /* Wave 12A: uuid-formed session id for /api/marketing/chat. Persists in
   * localStorage so a returning visitor's conversation continues server-side
   * (the row keeps growing in marketing_chat_sessions). */
  const sessionId = useRef(getMarketingChatSessionId());
  const [checkoutService, setCheckoutService] = useState<Service | null>(null);
  const [location, navigate] = useLocation();

  const hasConversation = messages.length > 1;

  // Persist messages and open state
  useEffect(() => { saveMessages(messages); }, [messages]);
  useEffect(() => { saveOpenState(open); }, [open]);

  // Scroll to bottom within the chat container (not the page)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container && screen === "messages") {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages, streaming, screen]);

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
  }, [open, screen]);

  function openChat() {
    setOpen(true);
    setShowDot(false);
  }

  /* Wave 12A: the new /api/marketing/chat endpoint. Non-streaming JSON makes
   * it easy to deliver the structured CARDS + PROMPT alongside the reply. The
   * legacy recommendation parser still runs as a fallback. */
  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;
    setInput("");
    setScreen("messages");

    if (!open) {
      setOpen(true);
      setShowDot(false);
    }

    void capturePageSnapshot;

    const newMessages: MarketingChatMessage[] = [
      ...messages,
      { role: "user", content: text.trim() },
    ];
    setMessages(newMessages);
    setStreaming(true);
    const startedAt = Date.now();

    try {
      const res = await fetch("/api/marketing/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId.current,
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
      // Brief, realistic "typing" pause so the dots are visible even when the
      // model answers fast — capped so it never feels slow.
      const elapsed = Date.now() - startedAt;
      if (elapsed < 700) await new Promise((r) => setTimeout(r, 700 - elapsed));
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

  function goToHelpLink(href: string) {
    navigate(href);
    setOpen(false);
  }

  const TABS: { key: Screen; icon: typeof Home; label: string }[] = [
    { key: "home", icon: Home, label: "Home" },
    { key: "messages", icon: MessageCircle, label: "Messages" },
    { key: "help", icon: BookOpen, label: "Help" },
    { key: "search", icon: Search, label: "Search" },
  ];

  return (
    <div data-theme="light" style={{ display: "contents" }}>
      {/* Floating chat button */}
      {!open && (
        <button
          onClick={openChat}
          aria-label={showDot ? "Open chat, 1 unread message" : "Open chat"}
          className="wft-chat-bubble"
          style={{
            position: "fixed",
            right: 24,
            zIndex: 9998,
            width: 56,
            height: 56,
            borderRadius: 14,
            background: BRAND_GRAD,
            color: "#FFFFFF",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
            transition: "transform 0.2s ease",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.06)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
        >
          <MessageCircle size={24} color="#fff" aria-hidden="true" />
          {showDot && (
            <span aria-hidden="true" style={{
              position: "absolute", top: -2, right: -2, width: 18, height: 18,
              borderRadius: "50%", background: "#FF6B35", color: "#fff",
              fontSize: 10, fontWeight: 800, display: "flex",
              alignItems: "center", justifyContent: "center", border: "2px solid #fff",
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
            position: "fixed", inset: 0, zIndex: 9998,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          }}
        />
      )}

      {open && (
        <div className="wft-site-chat-panel" onWheel={e => e.stopPropagation()} style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 400, maxWidth: "calc(100vw - 16px)",
          height: 720, maxHeight: "92vh",
          borderRadius: 16, overflow: "hidden",
          display: "flex", flexDirection: "column",
          background: "#fff",
          boxShadow: "0 8px 40px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}>
          {/* Header */}
          <div style={{
            background: BRAND_GRAD, padding: "14px 16px",
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            {/* Brand checkmark mark — white border + white checkmark on the
                blue header (the WeFixTrades open-checkbox logo). */}
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: "rgba(255,255,255,0.14)",
              border: "1.5px solid rgba(255,255,255,0.9)",
              display: "grid", placeItems: "center",
            }}>
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none" aria-hidden="true">
                <path d="M12 7 H4 V20 H17 V12.5" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 13 11.5 16.5 21 5" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>WeFixTrades</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.6)",
                cursor: "pointer", padding: 4, borderRadius: 6, display: "flex",
                alignItems: "center", transition: "color 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body — one screen at a time */}
          <div
            ref={messagesContainerRef}
            style={{
              flex: 1, overflowY: "auto", overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
              background: screen === "messages" ? "#F9FAFB" : "#fff",
            }}
          >
            {/* ── HOME ── */}
            {screen === "home" && (
              <div style={{ padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
                    <span style={{
                      display: "inline-flex", width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                      background: "rgba(13,60,252,0.10)", color: "#0d3cfc",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <MessageCircle size={20} strokeWidth={2} />
                    </span>
                    <div style={{ fontSize: 21, fontWeight: 800, color: "#1A1A2E", lineHeight: 1.2 }}>
                      Hi there!
                    </div>
                  </div>
                  <div style={{ fontSize: 13.5, color: "#5b6472", lineHeight: 1.6 }}>
                    Ask me anything about growing your trade business with our free and paid tools.
                    I'll guide you through it — and can even open the right page for you.
                    I'm not your average chat widget.
                  </div>
                </div>

                {hasConversation && (
                  <button
                    type="button"
                    onClick={() => setScreen("messages")}
                    className="wft-home-tile"
                    style={tileStyle}
                  >
                    <span style={tileIconWrap}><MessageCircle size={16} strokeWidth={2} /></span>
                    <span style={{ flex: 1, textAlign: "left" }}>
                      <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, color: "#1A1A2E" }}>Continue your conversation</span>
                      <span style={{ display: "block", fontSize: 12, color: "#6b7280" }}>Pick up where you left off</span>
                    </span>
                    <ChevronRight size={16} color="#0d3cfc" style={{ flexShrink: 0, opacity: 0.6 }} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setScreen("messages")}
                  className="wft-home-tile"
                  style={tileStyle}
                >
                  <span style={tileIconWrap}><Send size={16} strokeWidth={2} /></span>
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, color: "#1A1A2E" }}>Send us a message</span>
                    <span style={{ display: "block", fontSize: 12, color: "#6b7280" }}>Our AI replies instantly, 24/7</span>
                  </span>
                  <ChevronRight size={16} color="#0d3cfc" style={{ flexShrink: 0, opacity: 0.6 }} />
                </button>

                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af", marginTop: 2 }}>
                  Popular
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {QUICK_ACTIONS.slice(0, 4).map((qa) => {
                    const Icon = qa.icon;
                    return (
                      <button
                        key={qa.label}
                        type="button"
                        onClick={() => sendMessage(qa.value)}
                        className="wft-chat-quick-action"
                        style={quickActionStyle}
                      >
                        <span style={quickActionIcon}><Icon size={16} strokeWidth={2} /></span>
                        <span style={{ flex: 1 }}>{qa.label}</span>
                        <ArrowRight size={14} color="#0d3cfc" style={{ flexShrink: 0, opacity: 0.55 }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── MESSAGES (AI chat) ── */}
            {screen === "messages" && (
              <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                {messages.map((msg, i) => {
                  if (msg.role === "user") {
                    return (
                      <div key={i} style={{
                        maxWidth: "82%", alignSelf: "flex-end", padding: "10px 14px",
                        borderRadius: "14px 14px 4px 14px", fontSize: 13, lineHeight: 1.5,
                        background: BRAND_GRAD, color: "#fff",
                        wordBreak: "break-word", whiteSpace: "pre-wrap",
                      }}>
                        {msg.content || " "}
                      </div>
                    );
                  }
                  const { cleanText, serviceIds } = parseRecommendations(msg.content);
                  const recs = serviceIds.map((id) => SERVICES.find((s) => s.id === id)).filter((s): s is Service => !!s);
                  const cards = msg.cards;
                  const prompt = msg.prompt;
                  const isLastMessage = i === messages.length - 1;
                  return (
                    <div key={i} style={{ maxWidth: "92%", alignSelf: "flex-start", display: "flex", flexDirection: "column", gap: 8 }}>
                      {(cleanText.trim() || (recs.length === 0 && !cards && !prompt)) && (
                        <div style={{
                          padding: "10px 14px", borderRadius: "14px 14px 14px 4px",
                          fontSize: 13, lineHeight: 1.5, background: "#fff", color: "#1A1A2E",
                          border: "1px solid #E5E7EB", wordBreak: "break-word", whiteSpace: "pre-wrap",
                        }}>
                          {cleanText || " "}
                        </div>
                      )}
                      {cards && cards.length > 0 && (
                        <CopilotCards
                          cards={cards}
                          variant="widget"
                          onSelect={(card) => {
                            if (card.href && card.href.startsWith("https://")) { window.open(card.href, "_blank", "noopener"); return; }
                            if (card.href && card.href.startsWith("/")) { window.location.assign(card.href); }
                          }}
                        />
                      )}
                      {recs.map((s) => (
                        <RecommendationCard key={s.id} service={s} onAddToPackage={setCheckoutService} />
                      ))}
                      {prompt && isLastMessage && (
                        <CopilotPromptCard request={prompt} disabled={streaming} onRespond={(v) => sendMessage(v)} />
                      )}
                    </div>
                  );
                })}
                {streaming && (
                  <div style={{ display: "flex", gap: 4, padding: "8px 14px", alignSelf: "flex-start" }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{
                        width: 6, height: 6, borderRadius: "50%", background: "#0d3cfc",
                        animation: `wftDotBounce 1.4s ease-in-out ${i * 0.2}s infinite both`,
                      }} />
                    ))}
                  </div>
                )}
                {messages.length === 1 && !streaming && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
                    {QUICK_ACTIONS.map((qa) => {
                      const Icon = qa.icon;
                      return (
                        <button key={qa.label} type="button" onClick={() => sendMessage(qa.value)} className="wft-chat-quick-action" style={quickActionStyle}>
                          <span style={quickActionIcon}><Icon size={16} strokeWidth={2} /></span>
                          <span style={{ flex: 1 }}>{qa.label}</span>
                          <ArrowRight size={14} color="#0d3cfc" style={{ flexShrink: 0, opacity: 0.55 }} />
                        </button>
                      );
                    })}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* ── HELP (articles starter) ── */}
            {screen === "help" && (
              <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 13, color: "#5b6472", lineHeight: 1.5, marginBottom: 4 }}>
                  Browse guides and resources, or{" "}
                  <button type="button" onClick={() => setScreen("messages")} style={linkBtnStyle}>ask the concierge</button>.
                </div>
                {HELP_LINKS.map((h) => {
                  const Icon = h.icon;
                  return (
                    <button key={h.href} type="button" onClick={() => goToHelpLink(h.href)} className="wft-home-tile" style={tileStyle}>
                      <span style={tileIconWrap}><Icon size={16} strokeWidth={2} /></span>
                      <span style={{ flex: 1, textAlign: "left" }}>
                        <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, color: "#1A1A2E" }}>{h.title}</span>
                        <span style={{ display: "block", fontSize: 12, color: "#6b7280" }}>{h.sub}</span>
                      </span>
                      <ChevronRight size={16} color="#0d3cfc" style={{ flexShrink: 0, opacity: 0.6 }} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── SEARCH ── */}
            {screen === "search" && (
              <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ position: "relative" }}>
                  <Search size={16} color="#9ca3af" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && searchInput.trim()) { sendMessage(searchInput.trim()); setSearchInput(""); } }}
                    placeholder="Search products, tools, or ask…"
                    aria-label="Search"
                    style={{
                      width: "100%", border: "1px solid #E5E7EB", borderRadius: 10,
                      padding: "11px 12px 11px 36px", fontSize: 13, outline: "none", fontFamily: "inherit", color: "#1A1A2E",
                    }}
                    onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "#0d3cfc"; }}
                    onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; }}
                  />
                </div>
                <div style={{ fontSize: 12.5, color: "#6b7280", lineHeight: 1.5 }}>
                  Type a question and press Enter — the concierge will answer and point you to the right tool.
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af" }}>
                  Try
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["How do I get more reviews?", "What does TradeLine cost?", "Rank higher on Google"].map((s) => (
                    <button key={s} type="button" onClick={() => sendMessage(s)} style={chipStyle}>{s}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chat input — only on the Messages screen */}
          {screen === "messages" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
              borderTop: "1px solid #E5E7EB", background: "#fff", flexShrink: 0,
            }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Ask us anything..."
                disabled={streaming}
                style={{
                  flex: 1, border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 14px",
                  fontSize: 13, outline: "none", fontFamily: "inherit", color: "#1A1A2E",
                  background: streaming ? "#F9FAFB" : "#fff", transition: "border-color 0.15s",
                }}
                onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "#0d3cfc"; }}
                onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"; }}
              />
              <button
                onClick={handleSend}
                disabled={streaming}
                aria-label="Send message"
                style={{
                  width: 38, height: 38, borderRadius: 10, border: "none", background: BRAND_GRAD,
                  color: "#fff", cursor: streaming ? "default" : "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center", opacity: streaming ? 0.6 : 1,
                  transition: "opacity 0.15s", flexShrink: 0,
                }}
              >
                <Send size={16} />
              </button>
            </div>
          )}

          {/* Bottom tab bar */}
          <div style={{
            display: "flex", borderTop: "1px solid #E5E7EB", background: "#fff", flexShrink: 0,
          }}>
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = screen === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setScreen(t.key)}
                  aria-label={t.label}
                  aria-current={active ? "page" : undefined}
                  className="wft-chat-tab"
                  style={{
                    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 3, margin: 4, padding: "7px 4px 6px", border: "none", background: "none",
                    borderRadius: 10, cursor: "pointer", color: active ? "#0d3cfc" : "#9ca3af",
                    fontFamily: "inherit", transition: "color 0.15s, box-shadow 0.15s, background 0.15s",
                  }}
                >
                  <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                  <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500 }}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes wftDotBounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .wft-chat-quick-action:hover {
          background: rgba(13,60,252,0.10) !important;
          border-color: rgba(13,60,252,0.30) !important;
        }
        .wft-home-tile:hover {
          background: rgba(13,60,252,0.06) !important;
          border-color: rgba(13,60,252,0.30) !important;
        }
        .wft-chat-tab:hover {
          color: #0d3cfc;
          background: rgba(13,60,252,0.06);
          box-shadow: inset 0 0 0 1.5px rgba(13,60,252,0.45);
        }
        .wft-chat-bubble { bottom: 24px; }
        @media (max-width: 480px) {
          .wft-chat-bubble {
            bottom: calc(24px + var(--mkt-sticky-bar-h, 0px) + 8px);
            transition: bottom 320ms cubic-bezier(0.4, 0, 0.6, 1);
          }
        }
        @media (max-width: 480px) {
          .wft-site-chat-panel {
            bottom: calc(8px + env(safe-area-inset-bottom, 0px)) !important;
            right: 8px !important;
            left: 8px !important;
            top: 72px !important;
            width: auto !important;
            max-width: calc(100vw - 16px) !important;
            height: auto !important;
            max-height: none !important;
            border-radius: 16px !important;
          }
          .wft-site-chat-backdrop { display: block; }
        }
        @media (min-width: 481px) {
          .wft-site-chat-backdrop { display: none; }
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

/* ── shared inline-style atoms ── */
const tileStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 11, width: "100%",
  padding: "12px 13px", borderRadius: 12, border: "1px solid #E5E7EB",
  background: "#fff", cursor: "pointer", fontFamily: "inherit",
  transition: "background 0.15s, border-color 0.15s",
};
const tileIconWrap: CSSProperties = {
  display: "flex", width: 32, height: 32, borderRadius: 9, flexShrink: 0,
  background: "rgba(13,60,252,0.10)", color: "#0d3cfc",
  alignItems: "center", justifyContent: "center",
};
const quickActionStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
  padding: "11px 13px", borderRadius: 12, border: "1px solid rgba(13,60,252,0.14)",
  background: "rgba(13,60,252,0.05)", color: "#1A1A2E", fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s, border-color 0.15s",
};
const quickActionIcon: CSSProperties = {
  display: "flex", width: 28, height: 28, borderRadius: 8, flexShrink: 0,
  background: "rgba(13,60,252,0.10)", color: "#0d3cfc",
  alignItems: "center", justifyContent: "center",
};
const chipStyle: CSSProperties = {
  padding: "7px 11px", borderRadius: 999, border: "1px solid rgba(13,60,252,0.18)",
  background: "rgba(13,60,252,0.05)", color: "#0d3cfc", fontSize: 12, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};
const linkBtnStyle: CSSProperties = {
  background: "none", border: "none", padding: 0, color: "#0d3cfc",
  fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit",
};
