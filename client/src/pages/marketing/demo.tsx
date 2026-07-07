import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useVapiCall } from "@/hooks/useVapiCall";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { HeroSoundBars } from "@/components/marketing/VoiceVisualizer";
import { Send, Bot, User, Mic, PhoneOff, Phone, MessageSquare, ArrowRight, Loader2 } from "lucide-react";
import { mkt } from "@/theme/tokens";
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
  // In-character greeting (T-sweep 2026-06-11 P2): the demo plays the
  // visitor's own AI receptionist, so it greets the way it would greet a
  // real homeowner — and the page header above already sets the scene.
  // Keep this consistent with TRADELINE_DEMO_PROMPT (shared/prompts/) and
  // the /products/tradeline launcher greeting.
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! Thanks for reaching out — I'm here to help. Need a quick estimate, want to book a visit, or have a question about a job? Tell me what's going on." },
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
      // surface: "tradeline_demo" routes to the server-side roleplay prompt
      // (shared/prompts/tradelineDemoPrompt.ts) where the AI plays the
      // visitor's own AI receptionist and gives realistic quotes — NOT the
      // WeFixTrades platform sales bot. The "website" surface here was the
      // T-sweep P2 bug: the chat greeted as a receptionist but then answered
      // as the platform and declined the homeowner role-play.
      const res = await apiRequest("POST", "/api/chat/sync", {
        surface: "tradeline_demo",
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

  const sendText = (raw: string) => {
    const text = raw.trim();
    if (!text || sendMutation.isPending) return;
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInputValue("");
    sendMutation.mutate(newMessages);
  };

  const handleSend = () => sendText(inputValue);

  // Tappable starter prompts shown under the greeting (only before the
  // visitor has said anything) so the widget reads as an intentional,
  // ready-to-use sandbox instead of a hollow box. Each chip sends straight
  // into the live /api/chat/sync flow.
  const STARTER_PROMPTS = [
    "Do you offer emergency service?",
    "How much for a drain unclog?",
    "Can you book me in?",
  ];
  const showStarters = messages.length === 1 && !sendMutation.isPending;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Messages area */}
      <div ref={scrollContainerRef} style={{
        flex: 1, overflowY: "auto", padding: "20px 30px", display: "flex",
        flexDirection: "column", gap: 12,
        // Soft top/bottom edge fade — the transcript dissolves into the
        // frame instead of sitting inside a hard box.
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%)",
        maskImage: "linear-gradient(to bottom, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%)",
      }}>
        {messages.map((msg, idx) => {
          if (msg.role === "user") {
            return (
              <div key={idx} style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "flex-end" }}>
                <div style={{
                  maxWidth: "78%", padding: "11px 15px",
                  borderRadius: "16px 16px 4px 16px",
                  background: mkt.accent, color: mkt.onDark,
                  fontSize: 14, lineHeight: 1.55,
                }}>{msg.content}</div>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: mkt.sectionLighter, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <User size={12} color={mkt.onDarkMuted} />
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
                    <Bot size={12} color={mkt.buttonText} />
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
        {showStarters && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 8,
            paddingLeft: 36, marginTop: 2,
          }}>
            {STARTER_PROMPTS.map((p) => (
              <button
                key={p}
                data-testid="demo-starter-chip"
                onClick={() => sendText(p)}
                style={{
                  padding: "8px 14px", borderRadius: 999,
                  background: mkt.surface, color: mkt.text,
                  border: `1px solid ${mkt.onDarkBorder}`,
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                  fontFamily: "inherit", lineHeight: 1.3,
                  transition: "border-color 0.15s ease, background 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = mkt.accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = mkt.onDarkBorder; }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {sendMutation.isPending && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bot size={12} color={mkt.buttonText} />
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
      <div className="demo-fog-input" style={{
        // Faded divider — the line dissolves toward both ends instead of a
        // hard full-width rule.
        borderTop: "1px solid transparent",
        borderImageSource: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
        borderImageSlice: 1,
        // Inset (see .demo-fog-input) so the input + send button clear the
        // container's bottom/side fog fade and stay fully opaque + usable.
        display: "flex", gap: 8,
      }}>
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
          aria-label="Send message"
          style={{
            padding: "10px 16px", borderRadius: 10,
            background: inputValue.trim() ? mkt.accent : mkt.surfaceAlt,
            color: inputValue.trim() ? mkt.buttonText : mkt.onDarkFaint,
            border: "none", cursor: inputValue.trim() ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600,
          }}
        >
          <Send size={16} aria-hidden="true" />
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
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the auto-scroll CONTAINED to the transcript's own scroll box.
    // `scrollIntoView()` here would bubble to the nearest scrollable
    // ancestor — the document — yanking the whole page down to the reviews
    // section every time a transcript chunk arrives. Scrolling the container
    // directly never moves the page.
    const el = transcriptScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
          <Loader2 size={24} color={mkt.buttonText} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
        ) : isInCall ? (
          <PhoneOff size={24} color="#FFFFFF" strokeWidth={1.5} />
        ) : (
          <Mic size={24} color={micHover && canStart ? mkt.accent : canStart ? mkt.buttonText : mkt.onDarkMuted} strokeWidth={1.5} style={{ transition: "color 0.2s ease" }} />
        )}
      </button>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        /* Pulse via scale alone; colored glow removed per brand direction. */
        @keyframes micPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes spin { to { transform: none } }
          @keyframes micPulse { 0%, 100% { transform: none } 50% { transform: none } }
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
          <PhoneOff size={12} /> End Call
        </button>
      )}

      {/* Live transcript + recommendation cards pushed by the voice assistant */}
      {(hasTranscript || hasRecs) && (
        <div ref={transcriptScrollRef} style={{
          marginTop: 20, width: "100%", maxWidth: 440,
          flex: 1, minHeight: 0, overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 8, textAlign: "left",
          // Soft edge fade so the transcript reads as un-boxed (matches the
          // faded widget frame) — content dissolves at the top/bottom rather
          // than hitting a hard line.
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)",
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
   MAIN DEMO PAGE
   ═══════════════════════════════════════════════════════════════════ */

export default function DemoPage() {
  const [mode, setMode] = useState<"chat" | "voice">("chat");

  // Title + meta tags handled by <PageMeta> below.

  return (
    <MarketingLayout hideSiteChat>
      <PageMeta
        title="Try the demo — see WeFixTrades answer a live customer"
        description="Talk or chat with our AI receptionist in your browser. Watch it qualify a lead, generate an instant quote, and book the job — exactly how it would for your trade business."
        canonical="/demo"
        keywords={["ai receptionist demo", "trades ai demo", "instant quote demo"]}
      />
      <div data-theme="light" data-testid="demo-page">
        <style>{`
          /* True four-side fog fade — the widget's rendered content dissolves
             smoothly to transparent into the dark page background at every
             edge (left, right, top, bottom), like a chat sidebar's items
             fading out. Two crossed linear gradients intersected: the centre
             is fully opaque, all four edges fade over ~44px. No hard border,
             no ring — the mask alpha (#000 = keep, transparent = fade) is the
             sole edge treatment. */
          .demo-fog-fade {
            -webkit-mask-image:
              linear-gradient(to right,  transparent 0, #000 44px, #000 calc(100% - 44px), transparent 100%),
              linear-gradient(to bottom, transparent 0, #000 44px, #000 calc(100% - 44px), transparent 100%);
                    mask-image:
              linear-gradient(to right,  transparent 0, #000 44px, #000 calc(100% - 44px), transparent 100%),
              linear-gradient(to bottom, transparent 0, #000 44px, #000 calc(100% - 44px), transparent 100%);
            -webkit-mask-composite: source-in;
                    mask-composite: intersect;
          }
          /* Header + input insets keep the interactive controls past the fog
             fade so they stay fully opaque and usable. */
          .demo-fog-header { padding: 26px 46px 16px; }
          .demo-fog-input  { padding: 12px 46px 42px; }
          /* On narrow screens tighten the horizontal fog + insets so the
             header label and toggle don't collide (44px each side would eat
             too much of a 375px widget). Vertical fog stays generous. */
          @media (max-width: 560px) {
            .demo-fog-fade {
              -webkit-mask-image:
                linear-gradient(to right,  transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%),
                linear-gradient(to bottom, transparent 0, #000 40px, #000 calc(100% - 40px), transparent 100%);
                      mask-image:
                linear-gradient(to right,  transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%),
                linear-gradient(to bottom, transparent 0, #000 40px, #000 calc(100% - 40px), transparent 100%);
            }
            .demo-fog-header { padding: 24px 28px 14px; }
            .demo-fog-input  { padding: 12px 24px 38px; }
          }
        `}</style>

        {/* ═══ HERO — minimal, animation retained ═══ */}
        <section style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 20%, rgba(13,60,252,0.08) 0%, ${mkt.bg} 70%)`,
          padding: "48px 28px 0", textAlign: "center", position: "relative",
        }}>
          <div style={{ maxWidth: 600, margin: "0 auto", position: "relative", zIndex: 1 }}>
            <h1 data-testid="demo-headline" style={{
              fontSize: "clamp(30px, 4.5vw, 48px)", fontWeight: 700, color: mkt.onDark,
              letterSpacing: "-0.03em", marginBottom: 12, lineHeight: 1.1,
            }}>
              Try it yourself
            </h1>
            <p style={{ fontSize: 16, color: mkt.onDarkMuted, lineHeight: 1.6, maxWidth: 460, margin: "0 auto 32px" }}>
              Chat or call the TradeLine assistant. Ask about services, get an estimate, or see how it handles a real conversation.
            </p>
          </div>
          {/* Sound bars — kept as-is */}
          <HeroSoundBars active height={90} style={{ opacity: 0.9 }} />
        </section>

        {/* ═══ CENTRAL DEMO CONTAINER ═══ */}
        {/* Lifted up: reduced top padding (40 → 12) so the widget sits higher,
            closer under the hero waveform. */}
        <section style={{ background: mkt.bg, padding: "12px 20px 80px" }}>
          <div className="demo-fog-fade" style={{
            position: "relative",
            maxWidth: 820, margin: "0 auto",
            background: mkt.bg,
            borderRadius: 24,
            overflow: "hidden",
            // No box-shadow: a drop shadow paints a rounded-rect silhouette
            // outside the box that the mask can't fade, reintroducing a hard
            // edge. The fog mask is the sole edge treatment.
          }}>
            {/* ── Mode toggle header ── */}
            <div className="demo-fog-header" style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              // Inset (see .demo-fog-header) keeps the header text + toggle past
              // the container's fog fade and fully opaque, while the blue header
              // bg still bleeds to the edges and dissolves into the background.
              // Faded divider so the header meets the body without a hard rule.
              borderBottom: "1px solid transparent",
              borderImageSource: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)",
              borderImageSlice: 1,
              background: mkt.accent,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22C55E" }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#FFFFFF" }}>TradeLine</span>
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
            {/* Trimmed 600 → 500: with the greeting + starter chips this
                reads as a full, intentional panel rather than a hollow box,
                while still leaving room for a live transcript to grow. */}
            <div style={{ height: 500 }}>
              {mode === "chat" ? <ChatPanel /> : <VoicePanel />}
            </div>
          </div>

          {/* Subtle helper text */}
          <p style={{ textAlign: "center", fontSize: 12, color: mkt.onDarkFaint, marginTop: 16 }}>
            This is a live demo connected to the real assistant. No account needed.
          </p>
        </section>

        {/* ═══ HANDOFF — the demo's only next-step block ═══ */}
        {/* Sales content (reviews / pricing / FAQ) lives on /products/tradeline.
            This page is a pure sandbox, so it hands off in two directions:
            build now (primary) or go read the full pitch (secondary). */}
        <section style={{ background: mkt.bg, padding: "8px 28px 80px", textAlign: "center" }}>
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.02em", marginBottom: 12 }}>
              Ready to set up yours?
            </h2>
            <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.6, marginBottom: 28 }}>
              Get your own 24/7 assistant running in under 15 minutes.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
              <Link
                href="/wizard"
                data-testid="button-build-yours"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "14px 32px", borderRadius: 10,
                  background: mkt.ctaBg, color: mkt.ctaText,
                  fontSize: 15, fontWeight: 600, textDecoration: "none",
                }}
              >
                Set yours up <ArrowRight size={16} />
              </Link>
              <Link
                href="/products/tradeline"
                data-testid="button-see-features"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "14px 32px", borderRadius: 10,
                  background: "transparent", color: mkt.onDark,
                  border: `1px solid ${mkt.onDarkBorder}`,
                  fontSize: 15, fontWeight: 600, textDecoration: "none",
                }}
              >
                See features &amp; pricing <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

      </div>
    </MarketingLayout>
  );
}
