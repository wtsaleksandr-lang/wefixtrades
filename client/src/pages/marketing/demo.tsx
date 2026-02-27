import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import WorkflowDemo from "@/components/marketing/WorkflowDemo";
import { Send, Bot, User, Zap, Phone, Calendar, Star, Check } from "lucide-react";

const C = {
  green: "#33956A",
  greenDark: "#2B7D58",
  heading: "#111111",
  body: "#444444",
  muted: "#6B6B6B",
  border: "#E5E5E3",
  borderLight: "#F0F0EE",
  bg: "#FFFFFF",
  surface: "#F7F7F6",
  warmGray: "#F2F2F0",
  warmGrayAlt: "#EAEAE8",
  sageTint: "#EFF5F2",
  sageAccent: "#D1E8DF",
};

const SHADOW = {
  card: "0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.04)",
};

const DEMO_TABS = [
  { id: "quote", label: "Quote Widget", icon: Zap },
  { id: "chat", label: "Assistant Chat", icon: Phone },
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
    <div data-testid="quote-widget-demo" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, boxShadow: SHADOW.card }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
        Live Quote Calculator
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: C.heading, display: "block", marginBottom: 8 }}>Service type</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[{ id: "bathroom", label: "Bathroom Reno" }, { id: "kitchen", label: "Kitchen Remodel" }, { id: "plumbing", label: "Plumbing" }, { id: "painting", label: "Painting" }].map(s => (
            <button
              key={s.id}
              data-testid={`demo-service-${s.id}`}
              onClick={() => setService(s.id)}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: service === s.id ? `2px solid ${C.green}` : `1px solid ${C.border}`,
                background: service === s.id ? C.sageTint : C.bg,
                color: service === s.id ? C.green : C.body,
              }}
            >{s.label}</button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: C.heading, display: "block", marginBottom: 8 }}>Area (sq ft): {sqft}</label>
        <input
          data-testid="demo-sqft-slider"
          type="range" min={50} max={500} value={sqft}
          onChange={e => setSqft(Number(e.target.value))}
          style={{ width: "100%", accentColor: C.green }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted }}>
          <span>50 sq ft</span><span>500 sq ft</span>
        </div>
      </div>
      <div style={{ background: C.sageTint, borderRadius: 14, padding: "20px 24px", border: `1px solid ${C.sageAccent}` }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Estimated Cost</div>
        <div data-testid="demo-estimate" style={{ fontSize: 28, fontWeight: 800, color: C.heading, letterSpacing: "-0.02em" }}>
          ${minEst.toLocaleString()} – ${maxEst.toLocaleString()}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Based on {sqft} sq ft</div>
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
    <div data-testid="booking-demo" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, boxShadow: SHADOW.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Book a Slot</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.heading }}>March 2026</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, background: C.sageTint, color: C.green, padding: "4px 12px", borderRadius: 20 }}>Live Preview</div>
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
              background: selectedDay === i ? C.green : avail ? C.warmGrayAlt : "transparent",
              color: selectedDay === i ? "#FFFFFF" : avail ? C.heading : C.border,
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
              background: selectedSlot === i ? C.green : C.surface,
              color: selectedSlot === i ? "#FFFFFF" : C.heading,
              fontSize: 14, fontWeight: 600,
            }}
          >
            <span>{t}</span>
            {selectedSlot === i && <span style={{ fontSize: 11, opacity: 0.8 }}>Selected ✓</span>}
          </button>
        ))}
      </div>
      <div style={{ background: C.sageTint, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.greenDark }}>Deposit required</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.greenDark }}>$150 ✓</span>
      </div>
    </div>
  );
}

function ReviewRequestDemo() {
  const [sent, setSent] = useState(false);
  return (
    <div data-testid="review-demo" style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: 28, boxShadow: SHADOW.card }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}>
        Automated Review Request
      </div>
      <div style={{ background: C.surface, borderRadius: 14, padding: 20, border: `1px solid ${C.borderLight}`, marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Preview: SMS to customer after job completion</div>
        <div style={{
          background: C.bg, borderRadius: 14, padding: "14px 18px", border: `1px solid ${C.border}`,
          fontSize: 14, color: C.body, lineHeight: 1.6,
        }}>
          Hi Jake! Thanks for choosing Metro Plumbing. We hope you're happy with our work. Could you take 30 seconds to leave us a review? It really helps! ⭐
          <br /><br />
          <span style={{ color: C.green, fontWeight: 600 }}>→ Leave a review</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {["Sent 24h after job completion", "Includes direct link to Google Reviews", "Follow-up if no response in 3 days"].map(item => (
          <div key={item} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Check size={16} color={C.green} strokeWidth={2} />
            <span style={{ fontSize: 14, color: C.body }}>{item}</span>
          </div>
        ))}
      </div>
      <button
        data-testid="demo-send-review"
        onClick={() => setSent(true)}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
          background: sent ? C.sageTint : C.green, color: sent ? C.green : "#FFFFFF",
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
              border: selectedTrade === label ? `2px solid ${C.green}` : `1px solid ${C.border}`,
              background: selectedTrade === label ? C.sageTint : C.bg,
              color: selectedTrade === label ? C.green : C.body,
            }}
          >{label}</button>
        ))}
      </div>
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden",
        display: "flex", flexDirection: "column", height: 400, boxShadow: SHADOW.card,
      }}>
        <div style={{ background: "#0B1F3A", padding: "12px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Bot size={12} color="#FFFFFF" />
                </div>
              )}
              <div style={{
                maxWidth: "75%", padding: "10px 14px",
                borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: msg.role === "user" ? C.green : "#FFFFFF",
                color: msg.role === "user" ? "#FFFFFF" : C.body,
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
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px", background: C.bg, display: "flex", gap: 8 }}>
          <input
            data-testid="demo-chat-input"
            type="text" value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for an estimate..."
            style={{ flex: 1, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: C.body, background: C.bg, outline: "none", fontFamily: "inherit" }}
          />
          <button
            data-testid="demo-chat-send"
            onClick={handleSend}
            disabled={sendMutation.isPending || !inputValue.trim()}
            style={{
              padding: "8px 14px", borderRadius: 8,
              background: inputValue.trim() ? C.green : "#D1D5DB",
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

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState("quote");
  const [selectedTrade, setSelectedTrade] = useState("Plumbing");

  useEffect(() => {
    document.title = "Try the Demo — QuickQuotePro";
  }, []);

  return (
    <MarketingLayout>
      <div data-testid="demo-page">
        <section style={{ background: C.warmGray, padding: "80px 28px 48px", textAlign: "center" }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{
              display: "inline-block", background: C.sageTint, color: C.green,
              padding: "4px 14px", borderRadius: 9999, fontSize: 12, fontWeight: 600,
              letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 24,
              border: `1px solid ${C.sageAccent}`,
            }}>
              Live Demo
            </div>
            <h1 data-testid="demo-headline" style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 700, color: C.heading, letterSpacing: "-0.03em", marginBottom: 14, lineHeight: 1.1 }}>
              See it in action
            </h1>
            <p style={{ fontSize: 17, color: "rgba(17,17,17,0.72)", lineHeight: 1.65 }}>
              Try a live quote widget, assistant chat, booking, and review request. No login required.
            </p>
          </div>
        </section>

        <section style={{ background: C.warmGray, padding: "0 28px 80px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 40 }}>
              {DEMO_TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    data-testid={`demo-tab-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 20px", borderRadius: 9999, fontSize: 14, fontWeight: 600,
                      cursor: "pointer", transition: "all 0.2s ease",
                      border: isActive ? `2px solid ${C.green}` : `1px solid ${C.border}`,
                      background: isActive ? C.sageTint : C.bg,
                      color: isActive ? C.green : C.muted,
                    }}
                  >
                    <Icon size={16} strokeWidth={1.5} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeTab === "quote" && <QuoteWidgetDemo />}
            {activeTab === "chat" && <ChatDemo selectedTrade={selectedTrade} onTradeSelect={setSelectedTrade} />}
            {activeTab === "booking" && <BookingDemo />}
            {activeTab === "review" && <ReviewRequestDemo />}
          </div>
        </section>

        <section style={{ background: C.warmGrayAlt, padding: "80px 28px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: C.heading, letterSpacing: "-0.025em", marginBottom: 12 }}>
                See the full workflow
              </h2>
              <p style={{ fontSize: 16, color: "rgba(17,17,17,0.72)", lineHeight: 1.65 }}>
                From first visit to 5-star review — every step runs automatically.
              </p>
            </div>
            <WorkflowDemo expanded />
          </div>
        </section>

        <section style={{ background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenDark} 100%)`, padding: "80px 28px", textAlign: "center" }}>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.025em", marginBottom: 16, lineHeight: 1.1 }}>
              Ready to build your own?
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.72)", lineHeight: 1.65, marginBottom: 36 }}>
              Set up your quote calculator and 24/7 assistant in under 10 minutes.
            </p>
            <Link
              href="/Wizard"
              data-testid="button-build-yours"
              style={{
                display: "inline-block", padding: "15px 36px", borderRadius: 9999,
                background: "#FFFFFF", color: C.green, fontSize: 16, fontWeight: 700, textDecoration: "none",
              }}
            >
              Try Free
            </Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
