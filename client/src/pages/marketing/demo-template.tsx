import { useState, useEffect, useRef } from "react";
import { Link, useRoute } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { ArrowRight, Bot, User, Send, Calendar, ChevronLeft, Check, Zap, X } from "lucide-react";
import { TEMPLATES, calculateEstimate, getTemplate } from "@/config/templateConfig";
import type { TemplateConfig } from "@/config/templateConfig";
import { mkt, colors, shadows } from "@/theme/tokens";
import { buildWizardHrefForMarketingTemplate } from "@/lib/marketingTemplateMap";


/* ─── Slider input ────────────────────────────────── */
function SliderInput({ input, value, onChange }: { input: TemplateConfig["inputs"][0]; value: number; onChange: (v: number) => void }) {
  const pct = ((value - (input.min ?? 0)) / ((input.max ?? 100) - (input.min ?? 0))) * 100;
  // CONTRAST-2 — demo-template renders inside the marketing dark hero.
  return (
    <div data-theme="dark" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: mkt.onDarkMuted }}>{input.label}</label>
        <span style={{ fontSize: 14, fontWeight: 800, color: mkt.accent }}>{value} <span style={{ fontSize: 12, fontWeight: 400, color: mkt.onDarkMuted }}>{input.unit}</span></span>
      </div>
      <input
        type="range"
        min={input.min ?? 0} max={input.max ?? 100} step={input.step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: mkt.accent, cursor: "pointer" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: mkt.onDarkMuted, marginTop: 3 }}>
        <span>{input.min} {input.unit}</span>
        <span>{input.max} {input.unit}</span>
      </div>
    </div>
  );
}

/* ─── Mini booking calendar ───────────────────────── */
function BookingPanel({ onClose }: { onClose: () => void }) {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const slots = ["8:00 AM", "10:00 AM", "1:00 PM", "3:00 PM"];
  const availableDays = new Set([3, 5, 7, 9, 11, 14, 16, 18, 21, 23, 25, 28]);
  const monthName = today.toLocaleString("default", { month: "long" });

  return (
    <div style={{ background: mkt.bg, border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 16, padding: 24, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Book a Time</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: mkt.text }}>{monthName} {today.getFullYear()}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: mkt.onDarkMuted, padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 20 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: mkt.onDarkMuted, paddingBottom: 6 }}>{d}</div>
        ))}
        {Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
        {days.map((day) => {
          const avail = availableDays.has(day) && day > today.getDate();
          const selected = selectedDay === day;
          return (
            <button
              key={day}
              onClick={() => avail && setSelectedDay(day)}
              style={{
                textAlign: "center", fontSize: 12, fontWeight: 600,
                padding: "6px 0", borderRadius: 8,
                border: "none", cursor: avail ? "pointer" : "default",
                background: selected ? mkt.accent : avail ? mkt.accentTint : "transparent",
                color: selected ? "#FFFFFF" : avail ? mkt.accent : mkt.onDarkMuted,
                opacity: avail ? 1 : 0.35,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Time slots */}
      {selectedDay && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Available times</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
            {slots.map((slot) => (
              <button
                key={slot}
                onClick={() => setSelectedSlot(slot)}
                style={{
                  padding: "9px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: selectedSlot === slot ? mkt.accent : mkt.surface,
                  color: selectedSlot === slot ? "#FFFFFF" : mkt.onDarkMuted,
                  border: `1.5px solid ${selectedSlot === slot ? mkt.accent : mkt.border}`,
                  transition: "all 0.15s ease",
                }}
              >
                {slot}
              </button>
            ))}
          </div>
        </>
      )}

      {selectedDay && selectedSlot ? (
        <div>
          <div style={{ background: "rgba(13,60,252,0.10)", border: `1px solid #A7F3D0`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: mkt.accent, fontWeight: 600 }}>
            <Check size={14} style={{ marginRight: 6, display: "inline" }} />
            {monthName} {selectedDay} at {selectedSlot} — Deposit: $200
          </div>
          <button
            data-testid="booking-confirm-btn"
            style={{ width: "100%", padding: "12px 0", borderRadius: 10, background: mkt.accent, color: "#FFFFFF", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}
          >
            Confirm Booking (Demo) →
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: mkt.onDarkMuted, textAlign: "center" }}>
          {selectedDay ? "Select a time above" : "Select an available date"}
        </p>
      )}
    </div>
  );
}

/* ─── AI chat panel ───────────────────────────────── */
interface Message { role: "user" | "assistant"; content: string; }

function AiPanel({ trade, onClose }: { trade: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [initialized, setInitialized] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const sendMutation = useMutation({
    mutationFn: async (msgs: Message[]) => {
      const res = await apiRequest("POST", "/api/ai/demo-chat", { messages: msgs, trade_category: trade });
      return res.json();
    },
    onSuccess: (data) => {
      const reply = data?.reply || data?.message || `Happy to help with your ${trade.toLowerCase()} quote! Could you tell me more about the scope?`;
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    },
    onError: () => {
      setMessages((prev) => [...prev, { role: "assistant", content: `Happy to help with your ${trade.toLowerCase()} quote! Could you tell me more about the project?` }]);
    },
  });

  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      const init: Message[] = [{ role: "user", content: `Hi! I need a quote for a ${trade.toLowerCase()} job.` }];
      setMessages(init);
      sendMutation.mutate(init);
    }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    sendMutation.mutate(next);
  };

  return (
    <div style={{ background: mkt.bg, border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", height: 380 }}>
      {/* Header */}
      <div style={{ background: mkt.dark, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Bot size={16} color="#FFFFFF" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>AI Employee — Demo</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{trade} specialist</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E" }} />
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", padding: 2 }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 10, background: "#F9FAFB" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", gap: 6 }}>
            {msg.role === "assistant" && (
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "flex-end" }}>
                <Bot size={12} color="#FFFFFF" />
              </div>
            )}
            <div style={{ maxWidth: "78%", padding: "9px 12px", borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: msg.role === "user" ? mkt.accent : "#FFFFFF", color: msg.role === "user" ? "#FFFFFF" : mkt.onDarkMuted, fontSize: 13, lineHeight: 1.55, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              {msg.content}
            </div>
            {msg.role === "user" && (
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "flex-end" }}>
                <User size={12} color="#64748B" />
              </div>
            )}
          </div>
        ))}
        {sendMutation.isPending && (
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: mkt.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bot size={12} color="#FFFFFF" />
            </div>
            <div style={{ padding: "9px 14px", borderRadius: "14px 14px 14px 4px", background: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", gap: 4 }}>
              {[0,1,2].map((i) => (
                <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#9CA3AF", animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: `1px solid ${mkt.onDarkBorder}`, padding: "10px 12px", background: mkt.bg, display: "flex", gap: 8 }}>
        <input
          data-testid="demo-template-chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Ask about this service..."
          style={{ flex: 1, border: `1.5px solid ${mkt.onDarkBorder}`, borderRadius: 8, padding: "7px 11px", fontSize: 13, color: mkt.onDarkMuted, outline: "none", fontFamily: "inherit" }}
        />
        <button
          data-testid="demo-template-chat-send"
          onClick={send}
          disabled={sendMutation.isPending || !input.trim()}
          style={{ padding: "7px 12px", borderRadius: 8, background: input.trim() ? mkt.accent : "#D1D5DB", color: "#FFFFFF", border: "none", cursor: "pointer" }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

/* ─── Main demo page ────────────────────────────── */
export default function DemoTemplatePage() {
  const [, params] = useRoute("/demo/:templateId");
  const templateId = params?.templateId ?? "";
  const template = getTemplate(templateId);

  // Redirect to first template if not found
  const effectiveTemplate = template ?? TEMPLATES[0];

  const [values, setValues] = useState<Record<string, number | string>>(() => {
    const init: Record<string, number | string> = {};
    effectiveTemplate.inputs.forEach((inp) => { init[inp.id] = inp.defaultValue; });
    return init;
  });

  const [showBooking, setShowBooking] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");

  // Reset when template changes
  useEffect(() => {
    const init: Record<string, number | string> = {};
    effectiveTemplate.inputs.forEach((inp) => { init[inp.id] = inp.defaultValue; });
    setValues(init);
    setSubmitted(false);
    setShowBooking(false);
    setShowAi(false);
  }, [templateId]);

  useEffect(() => {
    document.title = `${effectiveTemplate.name} Demo — QuoteQuick Pro`;
  }, [effectiveTemplate.name]);

  const { min, max } = calculateEstimate(effectiveTemplate, values);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (leadEmail.trim()) setSubmitted(true);
  };

  return (
    <MarketingLayout>
      <div data-testid={`demo-template-${effectiveTemplate.id}`} style={{ overflowX: "hidden" }}>

        {/* Top bar */}
        <div style={{ background: mkt.dark, padding: "14px 28px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Link href="/templates" style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            <ChevronLeft size={14} /> Templates
          </Link>
          <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)" }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF" }}>{effectiveTemplate.emoji} {effectiveTemplate.name}</div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>Demo mode — no account needed</span>
          </div>
        </div>

        {/* Template switcher strip */}
        <div style={{ background: mkt.sectionLight, borderBottom: `1px solid ${mkt.onDarkBorder}`, padding: "10px 28px", overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 8, width: "max-content" }}>
            {TEMPLATES.map((t) => (
              <Link
                key={t.id}
                href={`/demo/${t.id}`}
                data-testid={`switcher-${t.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 14px", borderRadius: 20, textDecoration: "none", fontSize: 12, fontWeight: 600,
                  background: t.id === effectiveTemplate.id ? mkt.accent : "transparent",
                  color: t.id === effectiveTemplate.id ? "#FFFFFF" : mkt.onDarkMuted,
                  border: `1.5px solid ${t.id === effectiveTemplate.id ? mkt.accent : mkt.border}`,
                  whiteSpace: "nowrap" as const,
                }}
              >
                {t.emoji} {t.shortName}
              </Link>
            ))}
          </div>
        </div>

        {/* Main demo layout */}
        <div style={{ background: mkt.bg, padding: "40px 28px 80px" }}>
          <div className="demo-grid" style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 440px", gap: 36, alignItems: "start" }}>

            {/* LEFT: Calculator form */}
            <div>
              <div style={{ background: mkt.bg, border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
                {/* Calculator header */}
                <div style={{ background: effectiveTemplate.previewGradient, padding: "24px 28px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    Get an Instant Estimate
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: mkt.onDark, margin: 0 }}>
                    {effectiveTemplate.emoji} {effectiveTemplate.name}
                  </h2>
                  <p style={{ fontSize: 13, color: mkt.onDarkMuted, margin: "6px 0 0", lineHeight: 1.55 }}>
                    Adjust the inputs below to get your personalised estimate instantly.
                  </p>
                </div>

                <div style={{ padding: "28px 28px" }}>
                  {/* Inputs */}
                  {effectiveTemplate.inputs.map((input) => {
                    if (input.type === "slider") {
                      return (
                        <SliderInput
                          key={input.id}
                          input={input}
                          value={Number(values[input.id])}
                          onChange={(v) => setValues((prev) => ({ ...prev, [input.id]: v }))}
                        />
                      );
                    }
                    if (input.type === "select") {
                      return (
                        <div key={input.id} style={{ marginBottom: 20 }}>
                          <label style={{ fontSize: 13, fontWeight: 600, color: mkt.onDarkMuted, display: "block", marginBottom: 8 }}>{input.label}</label>
                          <select
                            value={String(values[input.id])}
                            onChange={(e) => setValues((prev) => ({ ...prev, [input.id]: e.target.value }))}
                            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${mkt.onDarkBorder}`, fontSize: 14, color: mkt.onDarkMuted, background: mkt.bg, outline: "none", fontFamily: "inherit", cursor: "pointer" }}
                          >
                            {input.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    return null;
                  })}

                  {/* Live estimate result */}
                  <div style={{ background: "rgba(13,60,252,0.10)", border: `1px solid #A7F3D0`, borderRadius: 14, padding: "20px 24px", marginTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <Zap size={16} color={mkt.accent} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>Your Estimate</span>
                    </div>
                    <div style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, color: mkt.onDark, lineHeight: 1, marginBottom: 4 }}>
                      {effectiveTemplate.currency}{min.toLocaleString()} – {effectiveTemplate.currency}{max.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 13, color: mkt.onDarkMuted }}>{effectiveTemplate.resultUnit} · estimate updates live</div>
                  </div>

                  {/* Lead capture or confirmation */}
                  {!submitted ? (
                    <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
                      <div style={{ display: "flex", gap: 10 }}>
                        <input
                          type="email"
                          required
                          placeholder="Enter your email for the full quote"
                          value={leadEmail}
                          onChange={(e) => setLeadEmail(e.target.value)}
                          data-testid="demo-lead-email"
                          style={{ flex: 1, padding: "11px 14px", borderRadius: 8, border: `1.5px solid ${mkt.onDarkBorder}`, fontSize: 14, color: mkt.onDarkMuted, outline: "none", fontFamily: "inherit" }}
                        />
                        <button
                          type="submit"
                          data-testid="demo-get-quote-btn"
                          style={{ padding: "11px 20px", borderRadius: 8, background: mkt.accent, color: "#FFFFFF", fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer", whiteSpace: "nowrap" as const }}
                        >
                          Get Quote
                        </button>
                      </div>
                      <p style={{ fontSize: 11, color: mkt.onDarkMuted, marginTop: 8 }}>Demo only — no real email sent. Free to try.</p>
                    </form>
                  ) : (
                    <div style={{ marginTop: 18, background: "#DCFCE7", border: "1px solid #86EFAC", borderRadius: 10, padding: "14px 18px", fontSize: 14, color: "#166534", fontWeight: 600 }}>
                      <Check size={16} style={{ marginRight: 6, display: "inline" }} />
                      Quote emailed! (demo) — In a real calculator, leads appear in your dashboard instantly.
                    </div>
                  )}

                  {/* Action toggles */}
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    {effectiveTemplate.hasBooking && (
                      <button
                        data-testid="toggle-booking"
                        onClick={() => { setShowBooking((b) => !b); setShowAi(false); }}
                        style={{
                          flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                          background: showBooking ? mkt.accent : "transparent",
                          color: showBooking ? "#FFFFFF" : mkt.accent,
                          border: `1.5px solid ${mkt.accent}`,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        <Calendar size={14} /> {showBooking ? "Hide" : "Book a time"}
                      </button>
                    )}
                    <button
                      data-testid="toggle-ai"
                      onClick={() => { setShowAi((a) => !a); setShowBooking(false); }}
                      style={{
                        flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                        background: showAi ? mkt.dark : "transparent",
                        color: showAi ? "#FFFFFF" : mkt.onDarkMuted,
                        border: `1.5px solid ${mkt.onDarkBorder}`,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}
                    >
                      <Bot size={14} /> {showAi ? "Hide AI" : "Ask AI"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Booking panel */}
              {showBooking && effectiveTemplate.hasBooking && (
                <div style={{ marginTop: 20 }}>
                  <BookingPanel onClose={() => setShowBooking(false)} />
                </div>
              )}

              {/* AI panel (mobile — appears below form) */}
              {showAi && (
                <div className="ai-mobile" style={{ display: "none", marginTop: 20 }}>
                  <AiPanel trade={effectiveTemplate.bestFor[0].split(" ")[0]} onClose={() => setShowAi(false)} />
                </div>
              )}
            </div>

            {/* RIGHT: AI panel (desktop) + info */}
            <div data-testid="demo-sidebar">
              {/* AI panel desktop */}
              {showAi ? (
                <AiPanel trade={effectiveTemplate.bestFor[0].split(" ")[0]} onClose={() => setShowAi(false)} />
              ) : (
                <div style={{ background: mkt.sectionLight, border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 16, padding: "24px", marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                    About this template
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    {effectiveTemplate.bestFor.map((b) => (
                      <span key={b} style={{ fontSize: 12, fontWeight: 600, color: mkt.onDarkMuted, background: mkt.bg, border: `1px solid ${mkt.onDarkBorder}`, padding: "3px 10px", borderRadius: 20 }}>{b}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { icon: "⚡", label: "Estimate engine", val: `${effectiveTemplate.formula.replace("_", " ")} formula` },
                      { icon: "📋", label: "Inputs", val: effectiveTemplate.inputsSummary },
                      { icon: "📅", label: "Booking", val: effectiveTemplate.hasBooking ? "Enabled" : "Estimate only" },
                      { icon: "🤖", label: "AI Employee", val: "14-day trial included" },
                    ].map(({ icon, label, val }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: mkt.onDarkMuted }}>{icon} {label}</span>
                        <span style={{ fontWeight: 600, color: mkt.onDarkMuted }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => { setShowAi(true); setShowBooking(false); }}
                    style={{ width: "100%", marginTop: 18, padding: "11px 0", borderRadius: 10, background: mkt.dark, color: "#FFFFFF", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    <Bot size={14} /> Try AI Employee
                  </button>
                </div>
              )}

              {/* CTA box */}
              <div style={{ background: `linear-gradient(135deg, ${mkt.accent}, #0b34d6)`, borderRadius: 16, padding: "24px", color: "#FFFFFF" }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, lineHeight: 1.3 }}>
                  Build this calculator for your business
                </div>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.6, marginBottom: 18 }}>
                  Live in under 10 minutes. No credit card required. Includes 14-day AI trial.
                </p>
                <Link
                  href={buildWizardHrefForMarketingTemplate(effectiveTemplate.id)}
                  data-testid="demo-build-cta"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 0", borderRadius: 10, background: "#FFFFFF", color: mkt.accent, fontWeight: 800, fontSize: 14, textDecoration: "none" }}
                >
                  Start Free <ArrowRight size={14} />
                </Link>
                <Link
                  href="/templates"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}
                >
                  ← Browse other templates
                </Link>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @media(max-width:900px){
            .demo-grid{grid-template-columns:1fr!important;}
            [data-testid="demo-sidebar"]{display:none;}
            .ai-mobile{display:block!important;}
          }
        `}</style>
      </div>
    </MarketingLayout>
  );
}
