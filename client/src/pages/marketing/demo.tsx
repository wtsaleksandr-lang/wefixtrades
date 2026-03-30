import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useVapiCall } from "@/hooks/useVapiCall";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import WorkflowDemo from "@/components/marketing/WorkflowDemo";
import VoiceVisualizer, { HeroSoundBars } from "@/components/marketing/VoiceVisualizer";
import { Send, Bot, User, Zap, Phone, Calendar, Star, Check, Mic, MicOff, PhoneCall, PhoneOff, Shield, CheckCircle, AlertCircle, MessageSquare, ArrowRight, Loader2 } from "lucide-react";
import { mkt, colors, shadows } from "@/theme/tokens";


const DEMO_TABS = [
  { id: "quote", label: "Quote Widget", icon: Zap },
  { id: "chat", label: "Assistant Chat", icon: Phone },
  { id: "voice", label: "Voice Assistant", icon: Mic },
  { id: "booking", label: "Booking", icon: Calendar },
  { id: "review", label: "Review Request", icon: Star },
];

const TRADES = [
  { label: "Plumbing", testid: "trade-chip-plumbing" },
  { label: "Electrical", testid: "trade-chip-electrical" },
  { label: "HVAC", testid: "trade-chip-hvac" },
  { label: "Roofing", testid: "trade-chip-roofing" },
  { label: "Painting", testid: "trade-chip-painting" },
  { label: "Landscaping", testid: "trade-chip-landscaping" },
  { label: "Cleaning", testid: "trade-chip-cleaning" },
  { label: "Flooring", testid: "trade-chip-flooring" },
];

function getInitialMessage(trade: string): string {
  const messages: Record<string, string> = {
    Plumbing: "Hi! I need a quote for a plumbing job.",
    Electrical: "Hi! I need a quote for an electrical job.",
    HVAC: "Hi! I need a quote for an HVAC installation or repair.",
    Roofing: "Hi! I need a quote for a roofing job.",
    Painting: "Hi! I need a quote for a painting job.",
    Landscaping: "Hi! I need a quote for landscaping work.",
    Cleaning: "Hi! I need a quote for a cleaning service.",
    Flooring: "Hi! I need a quote for a flooring project.",
  };
  return messages[trade] || `Hi! I need a quote for a ${trade.toLowerCase()} job.`;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

function QuoteWidgetDemo() {
  const [sqft, setSqft] = useState(200);
  const [service, setService] = useState("bathroom");
  const rates: Record<string, { min: number; max: number }> = {
    bathroom: { min: 8, max: 12 },
    kitchen: { min: 10, max: 15 },
    plumbing: { min: 6, max: 9 },
    painting: { min: 4, max: 7 },
  };
  const r = rates[service] || rates.bathroom;
  const minEst = Math.round(sqft * r.min);
  const maxEst = Math.round(sqft * r.max);

  return (
    <div data-testid="quote-widget-demo" style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 20, padding: 28, boxShadow: shadows.card }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
        Live Quote Calculator
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: mkt.text, display: "block", marginBottom: 8 }}>Service type</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[{ id: "bathroom", label: "Bathroom Reno" }, { id: "kitchen", label: "Kitchen Remodel" }, { id: "plumbing", label: "Plumbing" }, { id: "painting", label: "Painting" }].map(s => (
            <button
              key={s.id}
              data-testid={`demo-service-${s.id}`}
              onClick={() => setService(s.id)}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: service === s.id ? `2px solid ${mkt.accent}` : `1px solid ${mkt.border}`,
                background: service === s.id ? mkt.accentTint : mkt.bg,
                color: service === s.id ? mkt.accent : mkt.textMuted,
              }}
            >{s.label}</button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: mkt.text, display: "block", marginBottom: 8 }}>Area (sq ft): {sqft}</label>
        <input
          data-testid="demo-sqft-slider"
          type="range" min={50} max={500} value={sqft}
          onChange={e => setSqft(Number(e.target.value))}
          style={{ width: "100%", accentColor: mkt.accent }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: mkt.textMuted }}>
          <span>50 sq ft</span><span>500 sq ft</span>
        </div>
      </div>
      <div style={{ background: mkt.accentTint, borderRadius: 14, padding: "20px 24px", border: `1px solid ${mkt.accentTint}` }}>
        <div style={{ fontSize: 11, color: mkt.textMuted, marginBottom: 6 }}>Estimated Cost</div>
        <div data-testid="demo-estimate" style={{ fontSize: 28, fontWeight: 800, color: mkt.text, letterSpacing: "-0.02em" }}>
          ${minEst.toLocaleString()} – ${maxEst.toLocaleString()}
        </div>
        <div style={{ fontSize: 12, color: mkt.textMuted, marginTop: 4 }}>Based on {sqft} sq ft</div>
      </div>
    </div>
  );
}

function BookingDemo() {
  const [selectedDay, setSelectedDay] = useState(3);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const days = [
    { d: 15, name: "Mon", avail: true },
    { d: 16, name: "Tue", avail: false },
    { d: 17, name: "Wed", avail: true },
    { d: 18, name: "Thu", avail: true },
    { d: 19, name: "Fri", avail: false },
    { d: 20, name: "Sat", avail: true },
    { d: 21, name: "Sun", avail: false },
  ];
  const slots = ["9:00 AM", "11:00 AM", "1:00 PM", "3:00 PM"];

  return (
    <div data-testid="booking-demo" style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 20, padding: 28, boxShadow: shadows.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Book a Slot</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: mkt.text }}>March 2026</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, background: mkt.accentTint, color: mkt.accent, padding: "4px 12px", borderRadius: 20 }}>Live Preview</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 24 }}>
        {days.map(({ d, name, avail }, i) => (
          <button
            key={d}
            data-testid={`booking-day-${d}`}
            onClick={() => avail && setSelectedDay(i)}
            disabled={!avail}
            style={{
              textAlign: "center", padding: "10px 0", borderRadius: 10, border: "none", cursor: avail ? "pointer" : "default",
              fontSize: 12, fontWeight: selectedDay === i ? 700 : 500,
              background: selectedDay === i ? mkt.accent : avail ? mkt.surface : "transparent",
              color: selectedDay === i ? "#FFFFFF" : avail ? mkt.text : mkt.border,
              opacity: avail ? 1 : 0.4,
            }}
          >
            <div style={{ fontSize: 10, marginBottom: 2 }}>{name}</div>
            {d}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {slots.map((t, i) => (
          <button
            key={t}
            data-testid={`booking-slot-${i}`}
            onClick={() => setSelectedSlot(i)}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 16px", borderRadius: 10, border: "none", cursor: "pointer",
              background: selectedSlot === i ? mkt.accent : mkt.surface,
              color: selectedSlot === i ? "#FFFFFF" : mkt.text,
              fontSize: 14, fontWeight: 600,
            }}
          >
            <span>{t}</span>
            {selectedSlot === i && <span style={{ fontSize: 11, opacity: 0.8 }}>Selected ✓</span>}
          </button>
        ))}
      </div>
      <div style={{ background: mkt.accentTint, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: mkt.accentHover }}>Deposit required</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: mkt.accentHover }}>$150 ✓</span>
      </div>
    </div>
  );
}

function ReviewRequestDemo() {
  const [sent, setSent] = useState(false);
  return (
    <div data-testid="review-demo" style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 20, padding: 28, boxShadow: shadows.card }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
        Automated Review Request
      </div>
      <div style={{ background: mkt.surface, borderRadius: 14, padding: 20, border: `1px solid ${mkt.borderLight}`, marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: mkt.textMuted, marginBottom: 12 }}>Preview: SMS to customer after job completion</div>
        <div style={{
          background: mkt.bg, borderRadius: 14, padding: "14px 18px", border: `1px solid ${mkt.border}`,
          fontSize: 14, color: mkt.textMuted, lineHeight: 1.6,
        }}>
          Hi Jake! Thanks for choosing Metro Plumbing. We hope you're happy with our work. Could you take 30 seconds to leave us a review? It really helps! ⭐
          <br /><br />
          <span style={{ color: mkt.accent, fontWeight: 600 }}>→ Leave a review</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {["Sent 24h after job completion", "Includes direct link to Google Reviews", "Follow-up if no response in 3 days"].map(item => (
          <div key={item} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Check size={16} color={mkt.accent} strokeWidth={2} />
            <span style={{ fontSize: 14, color: mkt.textMuted }}>{item}</span>
          </div>
        ))}
      </div>
      <button
        data-testid="demo-send-review"
        onClick={() => setSent(true)}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
          background: sent ? mkt.accentTint : mkt.accent, color: sent ? mkt.accent : "#FFFFFF",
          fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}
      >
        {sent ? "✓ Review request sent!" : "Simulate sending review request"}
      </button>
    </div>
  );
}

function ChatDemo({ selectedTrade, onTradeSelect }: { selectedTrade: string; onTradeSelect: (t: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialMsg = getInitialMessage(selectedTrade);
    setMessages([{ role: "user", content: initialMsg }]);
    setInitialized(false);
  }, [selectedTrade]);

  useEffect(() => {
    if (messages.length > 0 && !initialized) {
      setInitialized(true);
      sendMutation.mutate([{ role: "user", content: messages[0].content }]);
    }
  }, [messages, initialized]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (msgs: Message[]) => {
      const res = await apiRequest("POST", "/api/ai/demo-chat", {
        messages: msgs,
        trade_category: selectedTrade,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const reply = data?.reply || data?.message || "Thanks for your inquiry! I can help you get a quick estimate.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    },
    onError: () => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Thanks for reaching out about your ${selectedTrade.toLowerCase()} job! Could you describe the work you need done?`,
      }]);
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
    <div data-testid="chat-demo-panel">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {TRADES.map(({ label, testid }) => (
          <button
            key={label}
            data-testid={testid}
            onClick={() => onTradeSelect(label)}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: selectedTrade === label ? `2px solid ${mkt.accent}` : `1px solid ${mkt.border}`,
              background: selectedTrade === label ? mkt.accentTint : mkt.bg,
              color: selectedTrade === label ? mkt.accent : mkt.textMuted,
            }}
          >{label}</button>
        ))}
      </div>
      <div style={{
        border: `1px solid ${mkt.border}`, borderRadius: 16, overflow: "hidden",
        display: "flex", flexDirection: "column", height: 400, boxShadow: shadows.card,
      }}>
        <div style={{ background: "#0B1F3A", padding: "12px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bot size={16} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>24/7 Assistant</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{selectedTrade} specialist</div>
          </div>
          <div style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10, background: "#F9FAFB" }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 8, alignItems: "flex-end" }}>
              {msg.role === "assistant" && (
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Bot size={12} color="#FFFFFF" />
                </div>
              )}
              <div style={{
                maxWidth: "75%", padding: "10px 14px",
                borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: msg.role === "user" ? mkt.accent : "#FFFFFF",
                color: msg.role === "user" ? "#FFFFFF" : mkt.textMuted,
                fontSize: 13, lineHeight: 1.55, boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}>{msg.content}</div>
              {msg.role === "user" && (
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <User size={12} color="#6B7280" />
                </div>
              )}
            </div>
          ))}
          {sendMutation.isPending && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bot size={12} color="#FFFFFF" />
              </div>
              <div style={{ padding: "10px 16px", borderRadius: "14px 14px 14px 4px", background: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#9CA3AF", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div style={{ borderTop: `1px solid ${mkt.border}`, padding: "10px 14px", background: mkt.bg, display: "flex", gap: 8 }}>
          <input
            data-testid="demo-chat-input"
            type="text" value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for an estimate..."
            style={{ flex: 1, border: `1.5px solid ${mkt.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: mkt.textMuted, background: mkt.bg, outline: "none", fontFamily: "inherit" }}
          />
          <button
            data-testid="demo-chat-send"
            onClick={handleSend}
            disabled={sendMutation.isPending || !inputValue.trim()}
            style={{
              padding: "8px 14px", borderRadius: 8,
              background: inputValue.trim() ? mkt.accent : "#D1D5DB",
              color: "#FFFFFF", border: "none",
              cursor: inputValue.trim() ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600,
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function VoiceDemo() {
  const vapi = useVapiCall();

  // Derive visual states
  const isInCall = vapi.status === "active";
  const isConnecting = vapi.status === "connecting" || vapi.status === "loading";
  const isEnded = vapi.status === "ended";
  const isError = vapi.status === "error";
  const isIdle = vapi.status === "idle";
  const canStart = vapi.isAvailable && (isIdle || isEnded || isError);

  // Orb glow intensity based on volume
  const glowIntensity = isInCall ? 0.15 + vapi.volumeLevel * 0.45 : 0;

  // Determine status label
  let statusLabel: string = "";
  let statusColor: string = mkt.textMuted;
  let statusDot: string = mkt.textFaint;
  if (isConnecting) { statusLabel = "Connecting..."; statusColor = mkt.orange; statusDot = mkt.orange; }
  else if (isInCall && vapi.isSpeaking) { statusLabel = "Listening..."; statusColor = "#34D399"; statusDot = "#34D399"; }
  else if (isInCall && vapi.isAssistantSpeaking) { statusLabel = "Assistant speaking"; statusColor = mkt.accent; statusDot = mkt.accent; }
  else if (isInCall) { statusLabel = "Call active"; statusColor = "#34D399"; statusDot = "#34D399"; }
  else if (isEnded) { statusLabel = "Call ended"; statusColor = mkt.textMuted; statusDot = mkt.textFaint; }
  else if (isError) { statusLabel = "Connection issue"; statusColor = "#EF4444"; statusDot = "#EF4444"; }
  else if (vapi.isAvailable) { statusLabel = "Voice assistant ready"; statusColor = "#34D399"; statusDot = "#34D399"; }
  else { statusLabel = "Voice demo coming soon"; statusColor = mkt.textMuted; statusDot = mkt.textFaint; }

  const handleMicClick = () => {
    if (isInCall || isConnecting) {
      vapi.stop();
    } else if (canStart) {
      vapi.start();
    }
  };

  return (
    <div data-testid="voice-demo-panel">
      {/* ── Central voice interaction area ── */}
      <div style={{
        background: `radial-gradient(ellipse 70% 50% at 50% 40%, rgba(102,232,250,${isInCall ? "0.1" : "0.06"}) 0%, ${mkt.bg} 70%)`,
        border: `1px solid ${mkt.border}`, borderRadius: 24,
        padding: "48px 32px 40px", textAlign: "center",
        position: "relative", overflow: "hidden",
        transition: "background 0.5s ease",
      }}>
        {/* Mic button / orb */}
        <div style={{ marginBottom: 24 }}>
          <button
            data-testid="voice-demo-start"
            onClick={handleMicClick}
            disabled={!canStart && !isInCall && !isConnecting}
            aria-label={isInCall ? "End voice call" : "Start voice demo"}
            style={{
              width: 96, height: 96, borderRadius: "50%", margin: "0 auto",
              border: "none", cursor: canStart || isInCall || isConnecting ? "pointer" : "default",
              background: isInCall
                ? `radial-gradient(circle, #EF4444 0%, #DC2626 100%)`
                : isConnecting
                  ? `radial-gradient(circle, ${mkt.accent} 0%, ${mkt.accentDark} 100%)`
                  : canStart
                    ? `radial-gradient(circle, ${mkt.accent} 0%, ${mkt.accentDark} 100%)`
                    : `radial-gradient(circle, ${mkt.surface} 0%, ${mkt.surfaceAlt} 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: isInCall
                ? `0 0 ${30 + glowIntensity * 60}px rgba(239,68,68,${glowIntensity}), 0 0 80px rgba(239,68,68,0.1)`
                : canStart || isConnecting
                  ? `0 0 40px rgba(102,232,250,0.3), 0 0 80px rgba(102,232,250,0.1)`
                  : "none",
              transition: "box-shadow 0.15s ease, background 0.3s ease",
            }}
          >
            {isConnecting ? (
              <Loader2 size={32} color={mkt.buttonText} strokeWidth={1.5} style={{ animation: "spin 1s linear infinite" }} />
            ) : isInCall ? (
              <PhoneOff size={32} color="#FFFFFF" strokeWidth={1.5} />
            ) : (
              <Mic size={32} color={canStart ? mkt.buttonText : mkt.textMuted} strokeWidth={1.5} />
            )}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>

        {/* Sound bars — react to call state */}
        <VoiceVisualizer
          barCount={50}
          height={64}
          active={isInCall || isConnecting}
          variant="hero"
          style={{ marginBottom: 28 }}
        />

        {/* Status label */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: statusColor }}>
            {isConnecting ? (
              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusDot, flexShrink: 0 }} />
            )}
            {statusLabel}
          </span>
        </div>

        {/* Title & description — context-sensitive */}
        <h3 style={{ fontSize: 24, fontWeight: 700, color: mkt.text, letterSpacing: "-0.02em", marginBottom: 10 }}>
          {isInCall ? "You're talking to the AI" : "AI Phone Receptionist"}
        </h3>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, maxWidth: 440, margin: "0 auto 28px" }}>
          {isInCall
            ? "Speak naturally — ask about services, get a quote, or schedule a consultation. Tap the button to end the call."
            : isEnded
              ? "Call complete. Start another demo anytime, or try the chat assistant."
              : isError
                ? vapi.errorMessage || "Something went wrong. Please try again."
                : "Never miss a call again. Your AI answers the phone 24/7, qualifies leads, gives quotes, and books jobs — all using the same brain as your website assistant."
          }
        </p>

        {/* CTA area — only when not in a call */}
        {!isInCall && !isConnecting && (
          <div>
            {canStart ? (
              <button
                onClick={() => vapi.start()}
                style={{
                  padding: "14px 36px", borderRadius: 50, border: "none",
                  background: mkt.accent, color: mkt.buttonText,
                  fontSize: 16, fontWeight: 700, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 10,
                  boxShadow: "0 0 30px rgba(102,232,250,0.25)",
                }}
              >
                <Phone size={18} /> {isEnded || isError ? "Try Again" : "Start Voice Demo"}
              </button>
            ) : !vapi.isAvailable ? (
              <Link
                href="/contact"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "14px 32px", borderRadius: 50,
                  border: `1px solid ${mkt.border}`,
                  background: "transparent", color: mkt.text,
                  fontSize: 15, fontWeight: 600, textDecoration: "none",
                }}
              >
                Get notified when it's live <ArrowRight size={16} />
              </Link>
            ) : null}
          </div>
        )}

        {/* In-call end button (secondary, below orb) */}
        {isInCall && (
          <button
            onClick={() => vapi.stop()}
            style={{
              padding: "10px 24px", borderRadius: 50,
              border: `1px solid rgba(239,68,68,0.3)`,
              background: "rgba(239,68,68,0.1)", color: "#EF4444",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}
          >
            <PhoneOff size={14} /> End Call
          </button>
        )}
      </div>

      {/* ── Feature cards ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12,
        marginTop: 20,
      }}>
        {[
          { icon: Phone, title: "Answers every call", desc: "Even at 2am on a Saturday" },
          { icon: Bot, title: "One AI brain", desc: "Same knowledge as your website chat" },
          { icon: Calendar, title: "Books jobs", desc: "Schedules directly into your calendar" },
          { icon: Shield, title: "Qualifies leads", desc: "Asks the right questions first" },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} style={{
            background: mkt.surface, borderRadius: 16, padding: "18px 20px",
            border: `1px solid ${mkt.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: mkt.accentTint, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={14} color={mkt.accent} strokeWidth={2} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: mkt.text }}>{title}</span>
            </div>
            <span style={{ fontSize: 13, color: mkt.textMuted, lineHeight: 1.5 }}>{desc}</span>
          </div>
        ))}
      </div>

      {/* ── How it works strip ── */}
      <div style={{
        display: "flex", gap: 0, marginTop: 20, borderRadius: 16, overflow: "hidden",
        border: `1px solid ${mkt.border}`,
      }}>
        {[
          { n: "1", text: "Customer calls" },
          { n: "2", text: "AI picks up instantly" },
          { n: "3", text: "Qualifies & books" },
          { n: "4", text: "You get the summary" },
        ].map(({ n, text }, i) => (
          <div key={n} style={{
            flex: 1, padding: "14px 12px", textAlign: "center",
            background: mkt.surface,
            borderRight: i < 3 ? `1px solid ${mkt.border}` : "none",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: mkt.accentTint, color: mkt.accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, margin: "0 auto 6px",
            }}>{n}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: mkt.textMuted }}>{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState("quote");
  const [selectedTrade, setSelectedTrade] = useState("Plumbing");

  useEffect(() => {
    document.title = "AI Demo — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <div data-testid="demo-page">
        {/* ═══ HERO — dark, voice-first, Vapi-inspired ═══ */}
        <section style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 20%, rgba(102,232,250,0.08) 0%, ${mkt.bg} 70%)`,
          padding: "100px 28px 0", textAlign: "center", position: "relative", overflow: "hidden",
        }}>
          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative", zIndex: 1 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: mkt.accentTint, color: mkt.accent,
              padding: "6px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 28,
              border: `1px solid rgba(102,232,250,0.15)`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", animation: "pulse 2s ease-in-out infinite" }} />
              Live Demo
            </div>
            <h1 data-testid="demo-headline" style={{
              fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 700, color: mkt.text,
              letterSpacing: "-0.03em", marginBottom: 18, lineHeight: 1.05,
            }}>
              Your AI employee,<br />ready to work
            </h1>
            <p style={{ fontSize: 18, color: mkt.textMuted, lineHeight: 1.65, maxWidth: 520, margin: "0 auto 36px" }}>
              Voice calls, website chat, instant quotes, and automated follow-ups — try every tool your trades business gets with WeFixTrades.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 48 }}>
              <button
                onClick={() => setActiveTab("voice")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  padding: "15px 32px", borderRadius: 14, border: "none",
                  background: mkt.accent, color: mkt.buttonText,
                  fontSize: 16, fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 0 30px rgba(102,232,250,0.25)",
                }}
              >
                <Mic size={18} /> Try Voice Demo
              </button>
              <button
                onClick={() => setActiveTab("chat")}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  padding: "15px 32px", borderRadius: 14,
                  border: `1px solid ${mkt.border}`,
                  background: "transparent", color: mkt.textMuted,
                  fontSize: 16, fontWeight: 600, cursor: "pointer",
                }}
              >
                <MessageSquare size={18} /> Chat Demo
              </button>
            </div>
          </div>
          {/* Sound bars hero band */}
          <HeroSoundBars active height={90} style={{ opacity: 0.9 }} />
          <div style={{
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, rgba(102,232,250,0.2) 50%, transparent 100%)`,
          }} />
        </section>

        {/* ═══ TAB BAR + DEMO CONTENT ═══ */}
        <section style={{ background: mkt.bg, padding: "48px 28px 80px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            {/* Section label */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: mkt.accent,
                letterSpacing: "0.1em", textTransform: "uppercase",
              }}>
                Try each tool
              </span>
            </div>

            {/* Tab bar — pill style */}
            <div style={{
              display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap",
              marginBottom: 36, padding: "6px",
              background: mkt.surface, borderRadius: 16, border: `1px solid ${mkt.border}`,
              maxWidth: 600, margin: "0 auto 36px",
            }}>
              {DEMO_TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    data-testid={`demo-tab-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "9px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600,
                      cursor: "pointer", transition: "all 0.2s ease",
                      border: "none",
                      background: isActive ? mkt.accentTint : "transparent",
                      color: isActive ? mkt.accent : mkt.textFaint,
                    }}
                  >
                    <Icon size={14} strokeWidth={isActive ? 2 : 1.5} />
                    <span style={{ display: "inline" }}>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {activeTab === "quote" && <QuoteWidgetDemo />}
            {activeTab === "chat" && <ChatDemo selectedTrade={selectedTrade} onTradeSelect={setSelectedTrade} />}
            {activeTab === "voice" && <VoiceDemo />}
            {activeTab === "booking" && <BookingDemo />}
            {activeTab === "review" && <ReviewRequestDemo />}
          </div>
        </section>

        {/* ═══ WORKFLOW SECTION ═══ */}
        <section style={{
          background: mkt.surface, padding: "80px 28px",
          borderTop: `1px solid ${mkt.border}`,
        }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: mkt.accent,
                letterSpacing: "0.1em", textTransform: "uppercase",
                display: "block", marginBottom: 14,
              }}>
                Full Automation
              </span>
              <h2 style={{ fontSize: "clamp(26px, 3vw, 40px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 12 }}>
                See the full workflow
              </h2>
              <p style={{ fontSize: 16, color: mkt.textMuted, lineHeight: 1.65 }}>
                From first visit to 5-star review — every step runs automatically.
              </p>
            </div>
            <WorkflowDemo expanded />
          </div>
        </section>

        {/* ═══ BOTTOM CTA ═══ */}
        <section style={{
          background: mkt.bg, padding: "80px 28px", textAlign: "center",
          position: "relative", overflow: "hidden",
        }}>
          {/* Subtle background bars */}
          <div style={{ position: "absolute", inset: 0, opacity: 0.15, pointerEvents: "none" }}>
            <HeroSoundBars active height={200} />
          </div>
          <div style={{ maxWidth: 600, margin: "0 auto", position: "relative", zIndex: 1 }}>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.03em", marginBottom: 16, lineHeight: 1.1 }}>
              Ready to build yours?
            </h2>
            <p style={{ fontSize: 17, color: mkt.textMuted, lineHeight: 1.65, marginBottom: 36 }}>
              Set up your quote calculator and AI assistant in under 10 minutes. No code needed.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/Wizard"
                data-testid="button-build-yours"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "16px 36px", borderRadius: 14,
                  background: mkt.accent, color: mkt.buttonText,
                  fontSize: 16, fontWeight: 700, textDecoration: "none",
                  boxShadow: "0 0 30px rgba(102,232,250,0.2)",
                }}
              >
                Start Free <ArrowRight size={16} />
              </Link>
              <Link
                href="/free-audit"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "16px 32px", borderRadius: 14,
                  border: `1px solid ${mkt.border}`,
                  background: "transparent", color: mkt.textMuted,
                  fontSize: 16, fontWeight: 600, textDecoration: "none",
                }}
              >
                Get a free audit
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
