import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useVapiCall } from "@/hooks/useVapiCall";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import ReviewsSection from "@/components/home/ReviewsSection";
import VoiceVisualizer, { HeroSoundBars } from "@/components/marketing/VoiceVisualizer";
import { Send, Bot, User, Mic, PhoneOff, Phone, MessageSquare, ArrowRight, Loader2, ChevronDown, Check } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { TRADELINE, formatPrice } from "@/config/pricing";
import { SERVICES, type Service } from "@shared/services";
import { parseRecommendations } from "@/lib/recommendations";
import { RecommendationCard } from "@/components/RecommendationCard";
import CheckoutModal from "@/components/CheckoutModal";

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */

interface Message {
  role: "user" | "assistant";
  content: string;
}

/* ═══════════════════════════════════════════════════════════════════
   CHAT PANEL — embedded in the central demo container
   ═══════════════════════════════════════════════════════════════════ */

function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm the 24/7 TradeLine assistant. Ask me about services, get a quick estimate, or find out how we help trades businesses grow. What can I help you with?" },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [checkoutService, setCheckoutService] = useState<Service | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (msgs: Message[]) => {
      const res = await apiRequest("POST", "/api/chat/sync", {
        surface: "website",
        messages: msgs,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const reply = data?.reply || "Thanks for your inquiry! I can help you with that.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    },
    onError: () => {
      setMessages((prev) => [...prev, { role: "assistant", content: "I'm here to help! Could you tell me a bit more about what you need?" }]);
    },
  });

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || sendMutation.isPending) return;
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInputValue("");
    sendMutation.mutate(newMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Messages area */}
      <div ref={scrollContainerRef} style={{
        flex: 1, overflowY: "auto", padding: "20px 18px", display: "flex",
        flexDirection: "column", gap: 12,
      }}>
        {messages.map((msg, idx) => {
          if (msg.role === "user") {
            return (
              <div key={idx} style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "flex-end" }}>
                <div style={{
                  maxWidth: "78%", padding: "11px 15px",
                  borderRadius: "16px 16px 4px 16px",
                  background: mkt.accent, color: mkt.buttonText,
                  fontSize: 14, lineHeight: 1.55,
                }}>{msg.content}</div>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: mkt.sectionLighter, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <User size={13} color={mkt.onDarkMuted} />
                </div>
              </div>
            );
          }
          // Assistant — strip the recommendation block and render product cards.
          const { cleanText, serviceIds } = parseRecommendations(msg.content);
          const recs = serviceIds
            .map((id) => SERVICES.find((s) => s.id === id))
            .filter((s): s is Service => !!s);
          return (
            <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(cleanText.trim() || recs.length === 0) && (
                <div style={{ display: "flex", justifyContent: "flex-start", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Bot size={13} color={mkt.buttonText} />
                  </div>
                  <div style={{
                    maxWidth: "78%", padding: "11px 15px",
                    borderRadius: "16px 16px 16px 4px",
                    background: mkt.surface, color: mkt.text,
                    fontSize: 14, lineHeight: 1.55,
                    border: `1px solid ${mkt.onDarkBorder}`,
                  }}>{cleanText}</div>
                </div>
              )}
              {recs.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 36, maxWidth: 380 }}>
                  {recs.map((s) => (
                    <RecommendationCard key={s.id} service={s} onAddToPackage={setCheckoutService} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {sendMutation.isPending && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bot size={13} color={mkt.buttonText} />
            </div>
            <div style={{ padding: "12px 18px", borderRadius: "16px 16px 16px 4px", background: mkt.sectionLight, border: `1px solid ${mkt.onDarkBorder}`, display: "flex", gap: 5, alignItems: "center" }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: mkt.onDarkFaint, animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {/* Input bar */}
      <div style={{ borderTop: `1px solid ${mkt.onDarkBorder}`, padding: "12px 16px", display: "flex", gap: 8 }}>
        <input
          data-testid="demo-chat-input"
          type="text" value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything — services, pricing, estimates..."
          style={{
            flex: 1, border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 10, padding: "10px 14px",
            fontSize: 14, color: mkt.onDark, background: mkt.bg, outline: "none", fontFamily: "inherit",
          }}
        />
        <button
          data-testid="demo-chat-send"
          onClick={handleSend}
          disabled={sendMutation.isPending || !inputValue.trim()}
          style={{
            padding: "10px 16px", borderRadius: 10,
            background: inputValue.trim() ? mkt.accent : mkt.surfaceAlt,
            color: inputValue.trim() ? mkt.buttonText : mkt.onDarkFaint,
            border: "none", cursor: inputValue.trim() ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600,
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
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

/* ═══════════════════════════════════════════════════════════════════
   VOICE PANEL — embedded in the central demo container
   ═══════════════════════════════════════════════════════════════════ */

function VoicePanel() {
  const vapi = useVapiCall();
  const [micHover, setMicHover] = useState(false);
  const [checkoutService, setCheckoutService] = useState<Service | null>(null);
  const isInCall = vapi.status === "active";
  const isConnecting = vapi.status === "connecting" || vapi.status === "loading";
  const isEnded = vapi.status === "ended";
  const isError = vapi.status === "error";
  const isIdle = vapi.status === "idle";
  const canStart = vapi.isAvailable && (isIdle || isEnded || isError);
  const glowIntensity = isInCall ? 0.15 + vapi.volumeLevel * 0.45 : 0;
  const hasTranscript = vapi.transcript.length > 0;
  const hasRecs = vapi.recommendedServiceIds.length > 0;
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [vapi.transcript.length, vapi.recommendedServiceIds.length]);

  let statusLabel: string = "";
  let statusColor: string = mkt.onDarkMuted;
  if (isConnecting) { statusLabel = "Connecting..."; statusColor = mkt.orange; }
  else if (isInCall && vapi.isSpeaking) { statusLabel = "Listening..."; statusColor = "#34D399"; }
  else if (isInCall && vapi.isAssistantSpeaking) { statusLabel = "Speaking"; statusColor = mkt.accent; }
  else if (isInCall) { statusLabel = "Call active"; statusColor = "#34D399"; }
  else if (isEnded) { statusLabel = "Call ended"; statusColor = mkt.onDarkMuted; }
  else if (isError) { statusLabel = "Connection issue"; statusColor = "#EF4444"; }
  else if (vapi.isAvailable) { statusLabel = "Ready"; statusColor = "#34D399"; }
  else { statusLabel = "Coming soon"; statusColor = mkt.onDarkMuted; }

  const handleClick = () => {
    if (isInCall || isConnecting) vapi.stop();
    else if (canStart) vapi.start();
  };

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: (hasTranscript || hasRecs) ? "flex-start" : "center", height: "100%", padding: "32px 24px", textAlign: "center" }}>
      {/* Mic orb */}
      <button
        data-testid="voice-demo-start"
        onClick={handleClick}
        disabled={!canStart && !isInCall && !isConnecting}
        aria-label={isInCall ? "End voice call" : "Start voice demo"}
        onMouseEnter={() => setMicHover(true)}
        onMouseLeave={() => setMicHover(false)}
        style={{
          width: 80, height: 80, borderRadius: "50%", border: "none",
          cursor: canStart || isInCall || isConnecting ? "pointer" : "default",
          background: isInCall
            ? `radial-gradient(circle, #EF4444 0%, #DC2626 100%)`
            : micHover && canStart
              ? `radial-gradient(circle, #FFFFFF 0%, ${mkt.accent} 100%)`
              : canStart || isConnecting
                ? `radial-gradient(circle, ${mkt.accent} 0%, ${mkt.accentDark} 100%)`
                : `radial-gradient(circle, ${mkt.surface} 0%, ${mkt.surfaceAlt} 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          /* In-call red glow stays as a signal-of-state affordance;
           * idle/hover blue glows are removed per brand direction.
           * Hover affordance is a white outline. */
          boxShadow: isInCall
            ? `0 0 ${30 + glowIntensity * 60}px rgba(239,68,68,${glowIntensity})`
            : "none",
          outline: micHover && canStart ? "2px solid #FFFFFF" : "none",
          outlineOffset: "-2px",
          transition: "box-shadow 0.2s ease, background 0.2s ease, outline 0.15s ease",
          marginBottom: 16,
          animation: canStart && isIdle && !micHover ? "micPulse 2s ease-in-out infinite" : undefined,
        }}
      >
        {isConnecting ? (
          <Loader2 size={28} color={mkt.buttonText} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
        ) : isInCall ? (
          <PhoneOff size={28} color="#FFFFFF" strokeWidth={1.5} />
        ) : (
          <Mic size={28} color={micHover && canStart ? mkt.accent : canStart ? mkt.buttonText : mkt.onDarkMuted} strokeWidth={1.5} style={{ transition: "color 0.2s ease" }} />
        )}
      </button>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        /* Pulse via scale alone; colored glow removed per brand direction. */
        @keyframes micPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
      `}</style>

      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {isConnecting ? (
          <Loader2 size={12} color={statusColor} style={{ animation: "spin 1s linear infinite" }} />
        ) : (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor }} />
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>{statusLabel}</span>
      </div>

      {/* Context text */}
      <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.55, maxWidth: 340, margin: 0 }}>
        {isInCall
          ? "Speak naturally — ask about services or request an estimate."
          : isError
            ? vapi.errorMessage || "Something went wrong. Please try again."
            : isEnded
              ? "Call complete. Try again or switch to chat."
              : "Tap the mic to start a live voice conversation with the assistant."
        }
      </p>

      {/* End call button when active */}
      {isInCall && (
        <button
          onClick={() => vapi.stop()}
          style={{
            marginTop: 16, padding: "8px 20px", borderRadius: 50,
            border: "1px solid rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.1)", color: "#EF4444",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          <PhoneOff size={13} /> End Call
        </button>
      )}

      {/* Live transcript + recommendation cards pushed by the voice assistant */}
      {(hasTranscript || hasRecs) && (
        <div style={{
          marginTop: 20, width: "100%", maxWidth: 440,
          flex: 1, minHeight: 0, overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 8, textAlign: "left",
        }}>
          {vapi.transcript.map((line, i) => (
            <div
              key={i}
              style={{
                alignSelf: line.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                padding: "8px 12px", borderRadius: 12,
                background: line.role === "user" ? mkt.accent : mkt.surface,
                color: line.role === "user" ? "#FFFFFF" : mkt.text,
                border: line.role === "user" ? "none" : `1px solid ${mkt.onDarkBorder}`,
                fontSize: 13, lineHeight: 1.5,
              }}
            >
              {line.text}
            </div>
          ))}
          {hasRecs && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              {vapi.recommendedServiceIds
                .map((id) => SERVICES.find((s) => s.id === id))
                .filter((s): s is Service => !!s)
                .map((s) => (
                  <RecommendationCard key={s.id} service={s} onAddToPackage={setCheckoutService} />
                ))}
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>
      )}
    </div>
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

/* ═══════════════════════════════════════════════════════════════════
   FAQ ACCORDION
   ═══════════════════════════════════════════════════════════════════ */

const DEMO_FAQ = [
  { q: "What does the assistant actually do?", a: "It answers phone calls and website chats 24/7, gives instant estimates based on your real pricing, captures lead details, books jobs, and sends automated follow-ups and review requests — all configured to your business." },
  { q: "Is it the same system for chat and voice?", a: "Yes. One assistant handles both channels using the same knowledge about your services, pricing, and availability. Customers get a consistent experience whether they call or message." },
  { q: "How long does setup take?", a: "Most trades businesses are up and running in under 15 minutes. You configure your services, pricing formulas, and business hours — the system learns your business from there." },
  { q: "Is it tailored to my specific trade?", a: "Absolutely. The system adapts to your trade type, service area, pricing structure, and business rules. It's not a generic chatbot — it speaks your language and understands your work." },
  { q: "Can I still review leads and override things?", a: "Yes. You see every conversation, lead, and booking in your dashboard. You control follow-up timing, messaging, and can jump in manually at any point." },
  { q: "What if a customer needs to reach a real person?", a: "The assistant can transfer urgent calls to your mobile immediately, with full conversation context included so you never start cold." },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 14, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 22px", background: open ? mkt.surface : mkt.bg, border: "none",
          cursor: "pointer", gap: 16, textAlign: "left", transition: "background 0.2s ease",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: mkt.onDark, lineHeight: 1.4 }}>{q}</span>
        <ChevronDown size={18} color={mkt.onDarkMuted} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s ease", flexShrink: 0 }} />
      </button>
      <div style={{ maxHeight: open ? 300 : 0, overflow: "hidden", transition: "max-height 0.25s ease" }}>
        <div style={{ padding: "0 22px 18px", fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6 }}>{a}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PRICING SECTION — TradeLine tiers (from shared/pricing.ts)
   ═══════════════════════════════════════════════════════════════════ */

const PLANS = TRADELINE.tiers.map(t => ({
  name: `TradeLine ${t.name}`,
  price: formatPrice(t.price),
  period: "/mo",
  desc: t.features.slice(0, 2).join(". ") + ".",
  features: t.features,
  highlighted: t.highlighted,
  badge: t.badge,
}));

function PricingCards() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, maxWidth: 680, margin: "0 auto" }}>
      {PLANS.map((plan) => (
        <div
          key={plan.name}
          style={{
            background: mkt.sectionLight, borderRadius: 20, padding: "32px 28px",
            border: `1px solid ${plan.highlighted ? mkt.accent : mkt.border}`,
            boxShadow: plan.highlighted ? `0 0 40px rgba(13,60,252,0.1)` : "none",
            position: "relative",
          }}
        >
          {plan.badge && (
            <div style={{
              position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
              background: mkt.accent, color: mkt.buttonText, padding: "4px 14px",
              borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
            }}>{plan.badge}</div>
          )}
          <div style={{ fontSize: 18, fontWeight: 700, color: mkt.onDark, marginBottom: 4 }}>{plan.name}</div>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: mkt.onDark, letterSpacing: "-0.03em" }}>{plan.price}</span>
            <span style={{ fontSize: 14, color: mkt.onDarkMuted }}>{plan.period}</span>
          </div>
          <p style={{ fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.5, marginBottom: 20 }}>{plan.desc}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {plan.features.map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Check size={14} color={mkt.accent} strokeWidth={2.5} />
                <span style={{ fontSize: 13, color: mkt.text }}>{f}</span>
              </div>
            ))}
          </div>
          <Link
            href="/wizard"
            style={{
              display: "block", textAlign: "center", padding: "12px 0", borderRadius: 12,
              background: plan.highlighted ? mkt.accent : "transparent",
              color: plan.highlighted ? mkt.buttonText : mkt.accent,
              border: plan.highlighted ? "none" : `1px solid ${mkt.accent}`,
              fontSize: 14, fontWeight: 700, textDecoration: "none",
            }}
          >
            Get Started
          </Link>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN DEMO PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function DemoPage() {
  const [mode, setMode] = useState<"chat" | "voice">("chat");

  useEffect(() => {
    document.title = "Try the Demo — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <div data-testid="demo-page">

        {/* ═══ HERO — minimal, animation retained ═══ */}
        <section style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 20%, rgba(13,60,252,0.08) 0%, ${mkt.bg} 70%)`,
          padding: "80px 28px 0", textAlign: "center", position: "relative",
        }}>
          <div style={{ maxWidth: 600, margin: "0 auto", position: "relative", zIndex: 1 }}>
            <h1 data-testid="demo-headline" style={{
              fontSize: "clamp(30px, 4.5vw, 48px)", fontWeight: 700, color: mkt.onDark,
              letterSpacing: "-0.03em", marginBottom: 12, lineHeight: 1.1,
            }}>
              Try it yourself
            </h1>
            <p style={{ fontSize: 16, color: mkt.onDarkMuted, lineHeight: 1.6, maxWidth: 460, margin: "0 auto 32px" }}>
              Chat or call the 24/7 TradeLine assistant. Ask about services, get an estimate, or see how it handles a real conversation.
            </p>
          </div>
          {/* Sound bars — kept as-is */}
          <HeroSoundBars active height={90} style={{ opacity: 0.9 }} />
        </section>

        {/* ═══ CENTRAL DEMO CONTAINER ═══ */}
        <section style={{ background: mkt.bg, padding: "40px 20px 80px" }}>
          <div style={{
            maxWidth: 820, margin: "0 auto",
            background: mkt.bg,
            border: `1px solid ${mkt.onDarkBorder}`,
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: `0 0 60px rgba(13,60,252,0.06), 0 2px 20px rgba(0,0,0,0.3)`,
          }}>
            {/* ── Mode toggle header ── */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px",
              borderBottom: `1px solid ${mkt.onDarkBorder}`,
              background: mkt.accent,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22C55E" }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#FFFFFF" }}>24/7 TradeLine</span>
              </div>
              <div style={{
                display: "flex", gap: 2, padding: 3,
                background: "rgba(255,255,255,0.15)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)",
              }}>
                <button
                  onClick={() => setMode("chat")}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontSize: 12, fontWeight: 600,
                    background: mode === "chat" ? "#FFFFFF" : "transparent",
                    color: mode === "chat" ? mkt.accent : "rgba(255,255,255,0.85)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <MessageSquare size={12} /> Chat
                </button>
                <button
                  onClick={() => setMode("voice")}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontSize: 12, fontWeight: 600,
                    background: mode === "voice" ? "#FFFFFF" : "transparent",
                    color: mode === "voice" ? mkt.accent : "rgba(255,255,255,0.85)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <Phone size={12} /> Voice
                </button>
              </div>
            </div>

            {/* ── Demo content ── */}
            <div style={{ height: 600 }}>
              {mode === "chat" ? <ChatPanel /> : <VoicePanel />}
            </div>
          </div>

          {/* Subtle helper text */}
          <p style={{ textAlign: "center", fontSize: 12, color: mkt.onDarkFaint, marginTop: 16 }}>
            This is a live demo connected to the real assistant. No account needed.
          </p>
        </section>

        {/* ═══ REVIEWS ═══ */}
        <section style={{ background: mkt.sectionLight, padding: "80px 28px", borderTop: `1px solid ${mkt.onDarkBorder}` }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <ReviewsSection />
          </div>
        </section>

        {/* ═══ PRICING ═══ */}
        <section style={{ background: mkt.bg, padding: "80px 28px", borderTop: `1px solid ${mkt.onDarkBorder}` }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 12 }}>
                Pricing
              </span>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em", marginBottom: 10 }}>
                Simple, transparent plans
              </h2>
              <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.6 }}>
                Start with chat. Add voice when you're ready. No contracts.
              </p>
            </div>
            <PricingCards />
          </div>
        </section>

        {/* ═══ FAQ ═══ */}
        <section style={{ background: mkt.sectionLight, padding: "80px 28px", borderTop: `1px solid ${mkt.onDarkBorder}` }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 12 }}>
                FAQ
              </span>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em" }}>
                Common questions
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {DEMO_FAQ.map((faq) => <FAQItem key={faq.q} {...faq} />)}
            </div>
          </div>
        </section>

        {/* ═══ MINIMAL BOTTOM CTA ═══ */}
        <section style={{ background: mkt.bg, padding: "64px 28px", textAlign: "center", borderTop: `1px solid ${mkt.onDarkBorder}` }}>
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.02em", marginBottom: 12 }}>
              Ready to set up yours?
            </h2>
            <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.6, marginBottom: 28 }}>
              Get your 24/7 assistant running in under 15 minutes.
            </p>
            <Link
              href="/wizard"
              data-testid="button-build-yours"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "14px 32px", borderRadius: 10,
                background: mkt.ctaBg, color: mkt.ctaText,
                fontSize: 15, fontWeight: 500, textDecoration: "none",
              }}
            >
              Start Free <ArrowRight size={16} />
            </Link>
          </div>
        </section>

      </div>
    </MarketingLayout>
  );
}
