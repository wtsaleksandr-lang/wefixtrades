/**
 * TradeLineDemoLauncher — sticky chat-input bar at the page bottom that
 * unfolds into a Chat / Voice tabbed demo panel on click.
 *
 * Closed:  full-width input bar (≤640px) anchored bottom-center.
 *          Looks like a chat input with a placeholder + voice + send icons.
 * Open:    panel grows upward (~640px tall) with [Chat | Voice] tabs.
 *          Does NOT cover the page — the upper part of the page stays
 *          visible. Backdrop is a soft blur, not opaque.
 *
 *   Chat  → POST /api/chat/sync (same backend as /demo's ChatPanel)
 *   Voice → useVapiCall() (same Vapi web session demo /demo uses)
 *
 * Persists open/closed state in sessionStorage so it survives navigation
 * within a single browsing session but doesn't follow you back tomorrow.
 */

import { useEffect, useRef, useState } from "react";
import {
  Bot, User, Mic, MicOff, Phone, PhoneOff, Send, X, Loader2, MessageSquare,
} from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useVapiCall } from "@/hooks/useVapiCall";

type Tab = "chat" | "voice";
type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "wft_tradeline_demo_open";

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi! Thanks for reaching out — I'm here to help. What's going on, or what do you need a hand with?",
};

export default function TradeLineDemoLauncher() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");

  // Restore open state once on mount
  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") setOpen(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch { /* ignore */ }
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={`tldl ${open ? "tldl-open" : ""}`} role="region" aria-label="Try the TradeLine demo">
      <style>{LAUNCHER_CSS}</style>

      {/* Collapsible panel — header + body. Bar lives outside this so it
          stays visible at its natural height even when collapsed. */}
      <div className="tldl-panel" aria-hidden={!open}>
        <div className="tldl-header">
          <div className="tldl-tabs">
            <button
              type="button"
              className={`tldl-tab ${tab === "chat" ? "active" : ""}`}
              onClick={() => setTab("chat")}
              data-testid="tldl-tab-chat"
            >
              <MessageSquare size={13} /> Chat
            </button>
            <button
              type="button"
              className={`tldl-tab ${tab === "voice" ? "active" : ""}`}
              onClick={() => setTab("voice")}
              data-testid="tldl-tab-voice"
            >
              <Phone size={13} /> Voice
            </button>
          </div>
          <button
            type="button"
            className="tldl-close"
            onClick={() => setOpen(false)}
            aria-label="Close demo"
            data-testid="tldl-close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="tldl-body">
          {tab === "chat" ? <ChatBody open={open} /> : <VoiceBody />}
        </div>
      </div>

      {/* Sticky bar — always visible. Click anywhere to expand. */}
      <div
        className="tldl-bar"
        role="button"
        tabIndex={0}
        onClick={() => { if (!open) setOpen(true); }}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !open) { e.preventDefault(); setOpen(true); } }}
        aria-label={open ? "Demo bar — currently open" : "Open the TradeLine demo"}
        data-testid="tldl-bar"
      >
        <span className="tldl-bar-bot" aria-hidden>
          <Bot size={16} />
        </span>
        <span className="tldl-bar-text">
          {open
            ? (tab === "chat"
                ? "Type below — talking to the live TradeLine AI"
                : "Tap the mic in the panel to start a voice call")
            : "Try the live TradeLine demo — chat or call"}
        </span>
        <span
          className="tldl-bar-icon"
          role="button"
          tabIndex={0}
          aria-label="Open voice demo"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
            setTab("voice");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault(); e.stopPropagation();
              setOpen(true); setTab("voice");
            }
          }}
        >
          <Mic size={15} />
        </span>
        <span
          className="tldl-bar-icon tldl-bar-icon-send"
          role="button"
          tabIndex={0}
          aria-label="Open chat demo"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
            setTab("chat");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault(); e.stopPropagation();
              setOpen(true); setTab("chat");
            }
          }}
        >
          <Send size={15} />
        </span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   CHAT BODY — POST /api/chat/sync
   ────────────────────────────────────────────────────────────────── */

function ChatBody({ open }: { open: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const res = await fetch("/api/chat/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // surface: "tradeline_demo" routes to a server-side roleplay
        // prompt where the AI plays the customer's TradeLine dispatcher
        // and gives realistic quotes — NOT the WeFixTrades sales bot.
        body: JSON.stringify({ surface: "tradeline_demo", messages: next }),
      });
      const data = await res.json().catch(() => ({}));
      const reply: string = data?.reply || "Thanks — I'll get back to you with details on that shortly.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "I'm having trouble connecting. Try again in a moment." }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="tldl-chat">
      <div ref={scrollRef} className="tldl-chat-scroll">
        {messages.map((m, i) => (
          <div key={i} className={`tldl-msg tldl-msg-${m.role}`}>
            {m.role === "assistant" && (
              <span className="tldl-msg-avatar tldl-msg-avatar-bot"><Bot size={12} /></span>
            )}
            <div className="tldl-msg-bubble">{m.content}</div>
            {m.role === "user" && (
              <span className="tldl-msg-avatar tldl-msg-avatar-user"><User size={12} /></span>
            )}
          </div>
        ))}
        {pending && (
          <div className="tldl-msg tldl-msg-assistant">
            <span className="tldl-msg-avatar tldl-msg-avatar-bot"><Bot size={12} /></span>
            <div className="tldl-msg-bubble tldl-msg-typing">
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>
      <div className="tldl-chat-input">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Ask about pricing, services, request a quote…"
          data-testid="tldl-chat-input"
        />
        <button
          type="button"
          onClick={send}
          disabled={!input.trim() || pending}
          aria-label="Send"
          data-testid="tldl-chat-send"
        >
          {pending ? <Loader2 size={14} className="tldl-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   VOICE BODY — useVapiCall
   ────────────────────────────────────────────────────────────────── */

function VoiceBody() {
  const vapi = useVapiCall();
  const isInCall = vapi.status === "active";
  const isConnecting = vapi.status === "connecting" || vapi.status === "loading";
  const isEnded = vapi.status === "ended";
  const isError = vapi.status === "error";
  const isIdle = vapi.status === "idle";
  const canStart = vapi.isAvailable && (isIdle || isEnded || isError);
  const glow = isInCall ? 0.15 + vapi.volumeLevel * 0.55 : 0;

  let label = "";
  let labelColor: string = mkt.onDarkMuted;
  if (isConnecting) { label = "Connecting…"; labelColor = "#facc15"; }
  else if (isInCall && vapi.isSpeaking) { label = "Listening…"; labelColor = "#34D399"; }
  else if (isInCall && vapi.isAssistantSpeaking) { label = "Speaking"; labelColor = mkt.accent; }
  else if (isInCall) { label = "Call active"; labelColor = "#34D399"; }
  else if (isEnded) { label = "Call ended"; labelColor = mkt.onDarkMuted; }
  else if (isError) { label = vapi.errorMessage || "Connection issue"; labelColor = "#EF4444"; }
  else if (vapi.isAvailable) { label = "Ready — tap the mic"; labelColor = "#34D399"; }
  else { label = "Voice demo coming online…"; labelColor = mkt.onDarkMuted; }

  const onClick = () => {
    if (isInCall || isConnecting) vapi.stop();
    else if (canStart) vapi.start();
  };

  return (
    <div className="tldl-voice">
      <button
        type="button"
        className={`tldl-voice-orb ${isInCall ? "in-call" : ""} ${canStart ? "ready" : ""}`}
        onClick={onClick}
        disabled={!canStart && !isInCall && !isConnecting}
        aria-label={isInCall ? "End call" : "Start voice demo"}
        data-testid="tldl-voice-orb"
        style={{
          boxShadow: isInCall
            ? `0 0 ${28 + glow * 90}px rgba(239,68,68,${glow})`
            : canStart
              ? "0 0 38px rgba(102,232,250,0.28)"
              : "none",
        }}
      >
        {isConnecting
          ? <Loader2 size={26} className="tldl-spin" />
          : isInCall
            ? <PhoneOff size={26} />
            : <Mic size={26} />}
      </button>

      <div className="tldl-voice-status">
        <span className="tldl-voice-pulse" style={{ background: labelColor }} />
        <span style={{ color: labelColor }}>{label}</span>
      </div>

      <p className="tldl-voice-help">
        {isInCall
          ? "Speak naturally — ask about pricing, describe a job, or request a quote."
          : "This is a real voice call to our AI dispatcher. No phone number required."}
      </p>

      {isInCall && (
        <button
          type="button"
          className="tldl-voice-end"
          onClick={() => vapi.stop()}
        >
          <PhoneOff size={13} /> End call
        </button>
      )}
      {!isInCall && !canStart && !isConnecting && !isError && (
        <span className="tldl-voice-mute"><MicOff size={12} /> Mic permission required for voice demo</span>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Scoped CSS — all classes prefixed `.tldl-*`
   ──────────────────────────────────────────────────────────────── */

const LAUNCHER_CSS = `
.tldl {
  --tldl-accent: ${mkt.accent};
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  width: min(680px, calc(100% - 24px));
  z-index: 60;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: rgba(20, 24, 27, 0.94);
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 20px 60px rgba(0,0,0,0.55);
  overflow: hidden;
  transition: border-color 260ms ease, box-shadow 260ms ease;
  font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
}
.tldl-open {
  border-color: rgba(102,232,250,0.32);
  box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(102,232,250,0.10);
}

/* Collapsible panel (header + body) — bar stays outside this */
.tldl-panel {
  display: flex; flex-direction: column; min-height: 0;
  max-height: 0;
  overflow: hidden;
  transition: max-height 380ms cubic-bezier(0.22,1,0.36,1);
}
.tldl-open .tldl-panel {
  max-height: 580px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

/* Header */
.tldl-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms ease 80ms;
  flex-shrink: 0;
}
.tldl-open .tldl-header { opacity: 1; pointer-events: auto; }
.tldl-tabs { display: inline-flex; gap: 4px; padding: 3px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); }
.tldl-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 9px; border: 0;
  background: transparent; color: rgba(255,255,255,0.62);
  font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
  transition: background 180ms ease, color 180ms ease;
}
.tldl-tab.active { background: rgba(255,255,255,0.10); color: #fff; }
.tldl-tab:hover { color: #fff; }
.tldl-close {
  width: 30px; height: 30px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.78); cursor: pointer;
  transition: background 180ms ease;
}
.tldl-close:hover { background: rgba(255,255,255,0.06); }

/* Body */
.tldl-body {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  opacity: 0; pointer-events: none;
  transition: opacity 220ms ease 100ms;
}
.tldl-open .tldl-body { opacity: 1; pointer-events: auto; }

/* Sticky bar — always visible. Sits below .tldl-panel in DOM, so it
   never gets clipped when the panel collapses to height 0. */
.tldl-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 12px 11px 14px;
  background: transparent;
  width: 100%;
  cursor: pointer;
  color: rgba(255,255,255,0.92);
  flex-shrink: 0;
  outline: none;
  user-select: none;
}
.tldl-bar:focus-visible { box-shadow: inset 0 0 0 2px rgba(102,232,250,0.45); }
.tldl-bar-bot {
  width: 32px; height: 32px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(102,232,250,0.14);
  border: 1px solid rgba(102,232,250,0.32);
  color: var(--tldl-accent);
  flex-shrink: 0;
}
.tldl-bar-text {
  flex: 1; min-width: 0;
  font-size: 13.5px; color: rgba(255,255,255,0.72);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tldl-bar-icon {
  width: 32px; height: 32px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.10);
  color: rgba(255,255,255,0.85);
  flex-shrink: 0;
  transition: background 180ms ease, color 180ms ease, border-color 180ms ease;
}
.tldl-bar-icon:hover { background: rgba(255,255,255,0.10); color: #fff; }
.tldl-bar-icon-send {
  background: var(--tldl-accent);
  border-color: var(--tldl-accent);
  color: #00131a;
}
.tldl-bar-icon-send:hover { background: #fff; border-color: #fff; }

/* ─── CHAT ─── */
.tldl-chat {
  display: flex; flex-direction: column; height: 100%;
  min-height: 0;
}
.tldl-chat-scroll {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 16px 14px; display: flex; flex-direction: column; gap: 10px;
}
.tldl-chat-scroll::-webkit-scrollbar { width: 6px; }
.tldl-chat-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
.tldl-msg { display: flex; align-items: flex-end; gap: 6px; }
.tldl-msg-user { justify-content: flex-end; }
.tldl-msg-assistant { justify-content: flex-start; }
.tldl-msg-avatar {
  width: 24px; height: 24px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.tldl-msg-avatar-bot { background: var(--tldl-accent); color: #00131a; }
.tldl-msg-avatar-user { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.78); border: 1px solid rgba(255,255,255,0.10); }
.tldl-msg-bubble {
  max-width: 78%;
  padding: 9px 13px;
  font-size: 13.5px; line-height: 1.45;
  border-radius: 14px;
}
.tldl-msg-user .tldl-msg-bubble {
  background: var(--tldl-accent); color: #00131a;
  border-radius: 14px 14px 4px 14px;
}
.tldl-msg-assistant .tldl-msg-bubble {
  background: rgba(255,255,255,0.04); color: #fff;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 14px 14px 14px 4px;
}
.tldl-msg-typing { display: inline-flex; gap: 4px; align-items: center; padding: 11px 14px; }
.tldl-msg-typing span {
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(255,255,255,0.65);
  animation: tldlBounce 1.2s ease-in-out infinite;
}
.tldl-msg-typing span:nth-child(2) { animation-delay: 0.15s; }
.tldl-msg-typing span:nth-child(3) { animation-delay: 0.30s; }
@keyframes tldlBounce {
  0%,60%,100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-3px); opacity: 1; }
}

.tldl-chat-input {
  flex-shrink: 0;
  display: flex; gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.tldl-chat-input input {
  flex: 1; min-width: 0;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 10px;
  padding: 10px 12px;
  color: #fff; font-size: 13.5px;
  font-family: inherit;
  outline: none;
  transition: border-color 180ms ease;
}
.tldl-chat-input input:focus { border-color: rgba(102,232,250,0.50); }
.tldl-chat-input button {
  width: 38px; height: 38px; border-radius: 10px; border: 0;
  background: var(--tldl-accent); color: #00131a;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0;
  transition: opacity 180ms ease, transform 180ms ease;
}
.tldl-chat-input button:disabled { opacity: 0.4; cursor: not-allowed; }
.tldl-chat-input button:not(:disabled):hover { transform: translateY(-1px); }

/* ─── VOICE ─── */
.tldl-voice {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 32px 20px 28px; gap: 14px;
  flex: 1;
  text-align: center;
}
.tldl-voice-orb {
  width: 88px; height: 88px; border-radius: 50%;
  border: 0; cursor: pointer;
  background: radial-gradient(circle, var(--tldl-accent) 0%, #2bb8d0 100%);
  color: #00131a;
  display: inline-flex; align-items: center; justify-content: center;
  transition: transform 220ms cubic-bezier(0.22,1,0.36,1), box-shadow 260ms ease;
}
.tldl-voice-orb:hover:not(:disabled) { transform: scale(1.04); }
.tldl-voice-orb:disabled { opacity: 0.55; cursor: default; background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); }
.tldl-voice-orb.in-call {
  background: radial-gradient(circle, #ef4444 0%, #b91c1c 100%);
  color: #fff;
  animation: tldlOrbPulse 1.6s ease-in-out infinite;
}
.tldl-voice-orb.ready:not(.in-call):not(:disabled) {
  animation: tldlOrbReady 2.2s ease-in-out infinite;
}
@keyframes tldlOrbPulse {
  0%,100% { box-shadow: 0 0 30px rgba(239,68,68,0.35); }
  50%     { box-shadow: 0 0 60px rgba(239,68,68,0.55); }
}
@keyframes tldlOrbReady {
  0%,100% { transform: scale(1); }
  50%     { transform: scale(1.03); }
}
.tldl-voice-status {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'DM Mono', monospace;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
}
.tldl-voice-pulse {
  width: 7px; height: 7px; border-radius: 50%;
  animation: tldlPulse 1.4s ease-in-out infinite;
}
@keyframes tldlPulse {
  0%,100% { opacity: 1; transform: scale(1); }
  50%     { opacity: 0.45; transform: scale(0.82); }
}
.tldl-voice-help {
  font-size: 13px; color: rgba(255,255,255,0.65); line-height: 1.5;
  max-width: 320px; margin: 0;
}
.tldl-voice-end {
  margin-top: 4px;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 999px;
  background: rgba(239,68,68,0.10); color: #ef4444;
  border: 1px solid rgba(239,68,68,0.32);
  font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
}
.tldl-voice-mute {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; color: rgba(255,255,255,0.45);
  font-family: 'DM Mono', monospace;
}

.tldl-spin { animation: tldlSpin 0.9s linear infinite; }
@keyframes tldlSpin { to { transform: rotate(360deg); } }

@media (max-width: 540px) {
  .tldl { width: calc(100% - 16px); bottom: 12px; }
  .tldl-bar-text { font-size: 12.5px; }
  .tldl-voice-orb { width: 76px; height: 76px; }
}
`;
