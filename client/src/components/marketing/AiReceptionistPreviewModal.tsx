import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { X, Phone, MessageCircle, Send, PhoneOff, Loader2 } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useVapiCall } from "@/hooks/useVapiCall";
import type { AiReceptionist } from "@/data/aiReceptionists";

/**
 * Call / Chat preview modal for an AI receptionist template.
 *
 * - Chat tab: real per-trade demo via POST /api/tradeline-demo/niche-chat
 *   ({ slug, messages }) — IP rate-limited server-side.
 * - Voice tab: real live web call via useVapiCall with a per-trade system
 *   override. Availability is gated by /api/vapi/web-config.
 *
 * Both genders are offered in production; the live demo uses the default voice.
 */

type Mode = "voice" | "chat";
interface Msg { role: "user" | "assistant"; content: string }

export interface PreviewModalProps {
  data: AiReceptionist;
  initialMode: Mode;
  onClose: () => void;
}

export default function AiReceptionistPreviewModal({ data, initialMode, onClose }: PreviewModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const voiceOverride = useMemo(() => ({
    model: {
      messages: [{
        role: "system",
        content:
          `You are the AI demo receptionist for a ${data.label} business, on the WeFixTrades marketing site. ` +
          `Greet the caller warmly, answer ${data.label.toLowerCase()} questions, and offer to book a job or give a rough estimate. ` +
          `This is a demo — don't actually book anything. Keep replies to 1-2 short sentences. ` +
          `Never claim to be human; you're an AI demo of a ${data.label.toLowerCase()} receptionist.`,
      }],
    },
  }), [data.label]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${data.label} AI receptionist preview`}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(8,10,12,0.72)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440, maxHeight: "88vh",
          background: mkt.sectionLight, border: `1px solid ${mkt.onDarkBorder}`,
          borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${mkt.onDarkBorder}` }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: "#0D3CFC", flexShrink: 0,
            overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}>
            <img src={data.illustration} alt="" style={{ height: 46, width: "auto" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: mkt.onDark, lineHeight: 1.2 }}>{data.label} AI Receptionist</div>
            <div style={{ fontSize: 12, color: mkt.onDarkMuted }}>Live demo · male &amp; female voices</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={iconBtn}>
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, padding: "10px 16px 0" }}>
          <TabBtn active={mode === "voice"} onClick={() => setMode("voice")} icon={<Phone size={16} />} label="Call" />
          <TabBtn active={mode === "chat"} onClick={() => setMode("chat")} icon={<MessageCircle size={16} />} label="Chat" />
        </div>

        {mode === "voice"
          ? <VoiceTab override={voiceOverride} />
          : <ChatTab slug={data.id} label={data.label} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "9px 12px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700,
      fontFamily: "inherit",
      color: active ? mkt.onDark : mkt.onDarkMuted,
      background: active ? "rgba(13,60,252,0.10)" : "transparent",
      border: `1px solid ${active ? "rgba(13,60,252,0.35)" : mkt.onDarkBorder}`,
    }}>
      {icon} {label}
    </button>
  );
}

/* ── Voice ── */
function VoiceTab({ override }: { override: unknown }) {
  const call = useVapiCall({ assistantOverrides: override });
  const live = call.status === "active" || call.status === "connecting" || call.status === "loading";

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, minHeight: 280 }}>
      {!call.isAvailable && call.status === "idle" ? (
        <p style={{ color: mkt.onDarkMuted, fontSize: 14, textAlign: "center", marginTop: 30 }}>
          The live voice demo isn't available right now — try the <strong>Chat</strong> tab to talk to this receptionist.
        </p>
      ) : (
        <>
          <div style={{
            width: 84, height: 84, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            background: call.status === "active" ? "rgba(13,60,252,0.14)" : "rgba(255,255,255,0.04)",
            border: `2px solid ${call.isAssistantSpeaking ? "#0D3CFC" : mkt.onDarkBorder}`,
            transition: "border-color 200ms ease, background 200ms ease", marginTop: 18,
          }}>
            <Phone size={32} strokeWidth={1.8} style={{ color: call.status === "active" ? "#0D3CFC" : mkt.onDarkMuted }} />
          </div>
          <div style={{ fontSize: 13, color: mkt.onDarkMuted, minHeight: 18 }}>
            {call.status === "idle" && "Tap to start a live voice demo"}
            {call.status === "loading" && "Preparing…"}
            {call.status === "connecting" && "Connecting…"}
            {call.status === "active" && (call.isAssistantSpeaking ? "Receptionist is speaking…" : "Listening… speak now")}
            {call.status === "ended" && "Call ended"}
            {call.status === "error" && (call.errorMessage || "Voice demo unavailable")}
          </div>

          {/* Live transcript */}
          {call.transcript.length > 0 && (
            <div style={{ width: "100%", maxHeight: 120, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              {call.transcript.slice(-4).map((t, i) => (
                <div key={i} style={{ color: t.role === "assistant" ? mkt.onDark : mkt.onDarkMuted }}>
                  <strong>{t.role === "assistant" ? "AI" : "You"}:</strong> {t.text}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: "auto" }}>
            {live ? (
              <button type="button" onClick={() => call.stop()} style={{ ...pillBtn, background: "rgba(220,38,38,0.12)", color: "#F87171", border: "1px solid rgba(220,38,38,0.4)" }}>
                <PhoneOff size={16} /> End call
              </button>
            ) : (
              <button type="button" onClick={() => call.start()} style={{ ...pillBtn, background: "#0D3CFC", color: "rgba(255,255,255,1)", border: "none" }}>
                <Phone size={16} /> Start voice demo
              </button>
            )}
          </div>
          <p style={{ fontSize: 11, color: mkt.textFaint, textAlign: "center", margin: 0 }}>
            Uses your microphone. This is a demo — nothing is actually booked.
          </p>
        </>
      )}
    </div>
  );
}

/* ── Chat ── */
function ChatTab({ slug, label }: { slug: string; label: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: `Hi, thanks for calling ${label} — how can I help with your job today?` },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/tradeline-demo/niche-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, messages: next.filter((m) => m.role === "user" || m.role === "assistant") }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Something went wrong.");
      }
      const j = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: j.reply || "…" }]);
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 320, maxHeight: "60vh" }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "82%", padding: "9px 13px", borderRadius: 14, fontSize: 14, lineHeight: 1.45,
            background: m.role === "user" ? "#0D3CFC" : "rgba(255,255,255,0.05)",
            color: m.role === "user" ? "rgba(255,255,255,1)" : mkt.onDark,
            border: m.role === "user" ? "none" : `1px solid ${mkt.onDarkBorder}`,
          }}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div style={{ alignSelf: "flex-start", color: mkt.onDarkMuted, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" /> typing…
          </div>
        )}
        {error && <div style={{ color: "#F87171", fontSize: 13 }}>{error}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${mkt.onDarkBorder}` }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Type a message…"
          aria-label="Message"
          style={{
            flex: 1, border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 10, padding: "10px 12px",
            background: "rgba(255,255,255,0.03)", color: mkt.onDark, fontSize: 14, outline: "none", fontFamily: "inherit",
          }}
        />
        <button type="button" onClick={send} disabled={busy || !input.trim()} aria-label="Send" style={{
          ...pillBtn, padding: "10px 14px", background: "#0D3CFC", color: "rgba(255,255,255,1)", border: "none",
          opacity: busy || !input.trim() ? 0.5 : 1,
        }}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

const iconBtn: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
  borderRadius: 8, border: "none", background: "transparent", color: mkt.onDarkMuted, cursor: "pointer",
};
const pillBtn: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
  fontSize: 14, fontWeight: 700, padding: "11px 20px", borderRadius: 999, fontFamily: "inherit",
};
