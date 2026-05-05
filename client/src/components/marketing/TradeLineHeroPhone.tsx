/**
 * TradeLineHeroPhone — premium animated phone mockup for /products/tradeline.
 *
 * Cycles through 4 trades scenarios in two modes:
 *   1. CHAT  · Plumbing   — emergency dispatch + booking
 *   2. VOICE · HVAC       — quote, scheduling, multi-Q&A
 *   3. CHAT  · Roofing    — storm-damage estimate
 *   4. VOICE · Electrical — panel-upgrade quote + booking
 *
 * Chat mode: types into input → user bubble → AI typing → AI card with
 * pricing → green BOOKED receipt chip.
 * Voice mode: incoming-call shell with caller avatar + live timer +
 * animated waveform on the active speaker. Turns alternate caller (mic
 * icon, right) and AI (speaker icon, left, cyan accent). Ends with a
 * red call-end pulse + receipt chip.
 *
 * Tap to pause / resume. IntersectionObserver auto-pauses off-screen.
 *
 * All styles scoped under `.tlhp-*`.
 */

import { useEffect, useRef, useState } from "react";
import { mkt } from "@/theme/tokens";

interface BaseScenario {
  funcText: string;
  receipt: string;
  ctx: { name: string; trade: string; window: string };
}

interface ChatScenario extends BaseScenario {
  mode: "chat";
  user: string;
  ai: string; // HTML, supports <strong>
}

interface VoiceScenario extends BaseScenario {
  mode: "voice";
  callerName: string;
  callerInitial: string;
  turns: Array<{ who: "caller" | "ai"; text: string; ms: number }>;
}

type Scenario = ChatScenario | VoiceScenario;

const SCENARIOS: Scenario[] = [
  // 1 — CHAT — Plumbing
  {
    mode: "chat",
    user: "Burst pipe under the kitchen sink. Water everywhere — please help.",
    ai:
      "<strong>Sending a plumber now.</strong><br/><br/>" +
      "Tech ETA <strong>38 min</strong>. Emergency call-out + diagnostic <strong>$185–$240</strong>, parts at cost.<br/><br/>" +
      "Tap to confirm — I'll text the tech's name + live ETA.",
    funcText: "EMERGENCY · PLUMBING · 24/7",
    receipt: "✓ BOOKED · Tech ETA 38 min",
    ctx: { name: "Sarah K.", trade: "Plumbing", window: "Now" },
  },

  // 2 — VOICE — HVAC
  {
    mode: "voice",
    callerName: "Morgan T.",
    callerInitial: "M",
    turns: [
      { who: "ai",     text: "Hi, you've reached TradeLine. What can I help with tonight?", ms: 3400 },
      { who: "caller", text: "AC died this morning. Can you get someone here Saturday?",     ms: 3200 },
      { who: "ai",     text: "Saturday 8 to 10 AM is open. Tune-up plus recharge runs $320 to $420.", ms: 4200 },
      { who: "caller", text: "Lock it in.",                                                   ms: 1500 },
      { who: "ai",     text: "Booked. Confirmation text incoming now.",                       ms: 2400 },
    ],
    funcText: "QUOTE · HVAC · WEEKEND",
    receipt: "✓ SCHEDULED · Sat 8–10 AM",
    ctx: { name: "Morgan T.", trade: "HVAC", window: "Sat AM" },
  },

  // 3 — CHAT — Roofing
  {
    mode: "chat",
    user: "Storm last night took 3 shingles off. Need a quote for repair + full roof inspection.",
    ai:
      "<strong>Inspection is free this week.</strong><br/><br/>" +
      "Missed-shingle repair averages <strong>$420–$680</strong> depending on layer count. A few photos over text speeds the estimate.<br/><br/>" +
      "Inspector is open <strong>Thu 9 AM</strong>. Want the slot?",
    funcText: "ESTIMATE · ROOFING · FREE INSPECT",
    receipt: "✓ INSPECTOR · Thu 9 AM hold",
    ctx: { name: "Jay P.", trade: "Roofing", window: "Thu AM" },
  },

  // 4 — VOICE — Electrical
  {
    mode: "voice",
    callerName: "Sam R.",
    callerInitial: "S",
    turns: [
      { who: "ai",     text: "TradeLine here — what's the job?",                              ms: 2400 },
      { who: "caller", text: "200 amp panel upgrade. Two-story, 1962 build, old fuse box.",  ms: 3800 },
      { who: "ai",     text: "Permit plus swap is $2,400 to $3,200. Generator-ready inlet adds $280.", ms: 4500 },
      { who: "caller", text: "Schedule the free assessment.",                                 ms: 2200 },
      { who: "ai",     text: "Wednesday 2 PM. Master electrician confirmed.",                 ms: 2800 },
    ],
    funcText: "ESTIMATE · ELECTRICAL · PERMIT",
    receipt: "✓ ASSESSMENT · Wed 2 PM",
    ctx: { name: "Sam R.", trade: "Electrical", window: "Wed PM" },
  },
];

const T = {
  chatTypeStart: 600,
  chatTypeDuration: 1900,
  chatSendDelay: 260,
  chatAiTyping: 1700,
  chatHold: 2200,
  voiceConnect: 900,
  voiceTurnGap: 350,
  voiceHold: 2200,
  receiptHold: 1700,
};

export default function TradeLineHeroPhone() {
  const phoneRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Chat
  const inputRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const sendBtnRef = useRef<HTMLDivElement>(null);
  // Voice
  const voiceAvatarRef = useRef<HTMLDivElement>(null);
  const voiceNameRef = useRef<HTMLDivElement>(null);
  const voiceTimerRef = useRef<HTMLSpanElement>(null);
  const endBtnRef = useRef<HTMLDivElement>(null);
  // Shared
  const dotsRef = useRef<HTMLDivElement>(null);
  const funcTextRef = useRef<HTMLSpanElement>(null);
  const ctxNameRef = useRef<HTMLSpanElement>(null);
  const ctxTradeRef = useRef<HTMLSpanElement>(null);
  const ctxWindowRef = useRef<HTMLSpanElement>(null);

  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const inViewRef = useRef(true);
  const resumeRef = useRef<(() => void) | null>(null);

  // Pause when off-screen
  useEffect(() => {
    if (!phoneRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => { inViewRef.current = entries[0]?.isIntersecting ?? true; },
      { threshold: 0.15 },
    );
    obs.observe(phoneRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(async () => {
          while (!cancelled && (pausedRef.current || !inViewRef.current)) {
            await new Promise<void>((r) => { resumeRef.current = r; });
          }
          resolve();
        }, ms);
      });

    const el = (tag: string, cls?: string, html?: string) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html) e.innerHTML = html;
      return e;
    };

    const scrollDown = () => {
      bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
    };

    const setMode = (mode: "chat" | "voice") => {
      if (phoneRef.current) phoneRef.current.dataset.mode = mode;
    };

    function applyContext(s: Scenario) {
      if (funcTextRef.current) funcTextRef.current.textContent = s.funcText;
      if (ctxNameRef.current) ctxNameRef.current.textContent = s.ctx.name;
      if (ctxTradeRef.current) ctxTradeRef.current.textContent = s.ctx.trade;
      if (ctxWindowRef.current) ctxWindowRef.current.textContent = s.ctx.window;
    }

    async function typeInto(target: HTMLElement, text: string, dur: number) {
      const step = Math.max(16, dur / text.length);
      target.textContent = "";
      target.classList.add("filled");
      const c = el("span", "tlhp-caret");
      target.appendChild(c);
      for (let i = 0; i < text.length; i++) {
        if (cancelled) return;
        target.insertBefore(document.createTextNode(text[i]), c);
        await wait(step);
      }
    }

    function aiCardHTML(body: string) {
      return `
        <div class="tlhp-card-head">
          <span class="tlhp-card-logo">
            <svg viewBox="0 0 32 32" fill="currentColor">
              <path d="M16 2 L18 12 L28 10 L20 16 L28 22 L18 20 L16 30 L14 20 L4 22 L12 16 L4 10 L14 12 Z"/>
            </svg>
          </span>
          TradeLine AI <span class="sep">·</span> <span class="sub">Always-on dispatcher</span>
        </div>
        <div class="tlhp-card-body">${body}</div>
      `;
    }

    /* ─── CHAT ─────────────────────────────────────── */
    async function runChat(s: ChatScenario) {
      setMode("chat");
      if (!inputRef.current || !sendBtnRef.current || !placeholderRef.current || !bodyRef.current) return;

      inputRef.current.classList.remove("active");
      sendBtnRef.current.classList.remove("active");
      placeholderRef.current.classList.remove("filled");
      placeholderRef.current.textContent = "How can TradeLine help your customers tonight?";

      await wait(T.chatTypeStart);
      if (cancelled) return;

      inputRef.current.classList.add("active");
      await typeInto(placeholderRef.current, s.user, T.chatTypeDuration);
      await wait(T.chatSendDelay);
      if (cancelled) return;
      sendBtnRef.current.classList.add("active");
      await wait(180);
      sendBtnRef.current.classList.remove("active");
      inputRef.current.classList.remove("active");
      placeholderRef.current.classList.remove("filled");
      placeholderRef.current.textContent = "How can TradeLine help your customers tonight?";

      const ub = el("div", "tlhp-bubble-user");
      ub.textContent = s.user;
      bodyRef.current.appendChild(ub);
      scrollDown();
      await wait(700);
      if (cancelled) return;

      const td = el("div", "tlhp-typing");
      td.appendChild(el("span"));
      td.appendChild(el("span"));
      td.appendChild(el("span"));
      bodyRef.current.appendChild(td);
      scrollDown();
      await wait(T.chatAiTyping);
      if (cancelled) return;
      td.remove();

      const card = el("div", "tlhp-card-ai");
      card.innerHTML = aiCardHTML(s.ai);
      bodyRef.current.appendChild(card);
      scrollDown();
      await wait(900);
      if (cancelled) return;

      const receipt = el("div", "tlhp-receipt");
      receipt.textContent = s.receipt;
      bodyRef.current.appendChild(receipt);
      scrollDown();
      await wait(T.chatHold);
    }

    /* ─── VOICE ────────────────────────────────────── */
    function voiceTurnHTML(who: "caller" | "ai", text: string, isLive: boolean) {
      const iconSvg = who === "caller"
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
      const wf = isLive
        ? `<span class="tlhp-wave"><span></span><span></span><span></span><span></span></span>`
        : "";
      return `<span class="tlhp-vt-icon">${iconSvg}</span><span class="tlhp-vt-text">${text}</span>${wf}`;
    }

    function makeVoiceTurn(who: "caller" | "ai", text: string) {
      const div = el("div", `tlhp-vt ${who}`);
      div.innerHTML = voiceTurnHTML(who, text, true);
      return div;
    }

    function freezeWaveform(div: HTMLElement) {
      // Remove the .tlhp-wave element so previous turns stop animating
      const wave = div.querySelector(".tlhp-wave");
      if (wave) wave.remove();
    }

    async function runVoice(s: VoiceScenario) {
      setMode("voice");
      if (!bodyRef.current || !voiceAvatarRef.current || !voiceNameRef.current || !voiceTimerRef.current) return;

      voiceAvatarRef.current.textContent = s.callerInitial;
      voiceNameRef.current.textContent = s.callerName;
      voiceTimerRef.current.textContent = "Connecting…";

      // Brief connecting state
      phoneRef.current?.classList.add("connecting");
      await wait(T.voiceConnect);
      if (cancelled) return;
      phoneRef.current?.classList.remove("connecting");

      // Live timer (counts up while voice is running)
      let seconds = 0;
      const fmt = () => `On call · ${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
      voiceTimerRef.current.textContent = fmt();
      const timerId = window.setInterval(() => {
        seconds++;
        if (voiceTimerRef.current) voiceTimerRef.current.textContent = fmt();
      }, 1000);

      try {
        let prevTurn: HTMLElement | null = null;
        for (const turn of s.turns) {
          if (cancelled) break;
          if (prevTurn) freezeWaveform(prevTurn);
          const node = makeVoiceTurn(turn.who, turn.text);
          bodyRef.current.appendChild(node);
          scrollDown();
          prevTurn = node;
          await wait(turn.ms);
          await wait(T.voiceTurnGap);
        }
        if (prevTurn) freezeWaveform(prevTurn);
      } finally {
        window.clearInterval(timerId);
      }

      // Pulse the end-call button briefly
      endBtnRef.current?.classList.add("hangup");
      await wait(500);
      endBtnRef.current?.classList.remove("hangup");

      const receipt = el("div", "tlhp-receipt");
      receipt.textContent = s.receipt;
      bodyRef.current.appendChild(receipt);
      scrollDown();
      await wait(T.voiceHold);
    }

    /* ─── LOOP ─────────────────────────────────────── */
    async function runScenario(idx: number) {
      const s = SCENARIOS[idx];
      const dotEls = dotsRef.current?.querySelectorAll(".tlhp-dot") ?? [];
      dotEls.forEach((d, i) => {
        if (i === idx) d.classList.add("active");
        else d.classList.remove("active");
      });
      applyContext(s);
      if (s.mode === "chat") await runChat(s);
      else await runVoice(s);
    }

    async function resetBody() {
      if (!bodyRef.current) return;
      bodyRef.current.classList.add("reset");
      await wait(550);
      if (cancelled) return;
      bodyRef.current.innerHTML = "";
      bodyRef.current.classList.remove("reset");
      await wait(200);
    }

    (async function loop() {
      while (!cancelled) {
        for (let i = 0; i < SCENARIOS.length; i++) {
          if (cancelled) return;
          await runScenario(i);
          if (cancelled) return;
          await resetBody();
        }
      }
    })();

    return () => {
      cancelled = true;
      if (resumeRef.current) {
        const r = resumeRef.current;
        resumeRef.current = null;
        r();
      }
    };
  }, []);

  // Resume any awaiter when un-paused
  useEffect(() => {
    if (!paused && resumeRef.current) {
      const r = resumeRef.current;
      resumeRef.current = null;
      r();
    }
  }, [paused]);

  const togglePause = () => setPaused((p) => !p);

  return (
    <div className="tlhp-wrap">
      <style>{TLHP_CSS}</style>

      <div
        ref={phoneRef}
        className={`tlhp-phone${paused ? " paused" : ""}`}
        data-mode="chat"
        onClick={togglePause}
        role="button"
        tabIndex={0}
        aria-label="TradeLine animated demo. Tap to pause."
      >
        {/* CHAT HEADER */}
        <div className="tlhp-header tlhp-chat-header">
          <div className="tlhp-header-left">
            <div className="tlhp-iconbtn" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </div>
            <div className="tlhp-logo" aria-hidden>
              <svg viewBox="0 0 32 32" fill="currentColor">
                <path d="M16 2 L18 12 L28 10 L20 16 L28 22 L18 20 L16 30 L14 20 L4 22 L12 16 L4 10 L14 12 Z" />
              </svg>
            </div>
            <div className="tlhp-brand">TradeLine</div>
          </div>
          <div className="tlhp-header-right">
            <div className="tlhp-iconbtn" aria-hidden>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </div>
          </div>
        </div>

        {/* VOICE HEADER */}
        <div className="tlhp-header tlhp-voice-header">
          <div ref={voiceAvatarRef} className="tlhp-voice-avatar">M</div>
          <div className="tlhp-voice-meta">
            <div ref={voiceNameRef} className="tlhp-voice-name">Morgan T.</div>
            <div className="tlhp-voice-status">
              <span className="tlhp-voice-pulse" />
              <span ref={voiceTimerRef}>Connecting…</span>
            </div>
          </div>
          <div className="tlhp-voice-incoming" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
        </div>

        <div ref={bodyRef} className="tlhp-body" />

        {/* CHAT INPUT */}
        <div ref={inputRef} className="tlhp-input">
          <div ref={placeholderRef} className="tlhp-placeholder">
            How can TradeLine help your customers tonight?
          </div>
          <div ref={sendBtnRef} className="tlhp-sendbtn" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </div>
        </div>

        {/* VOICE CONTROLS */}
        <div className="tlhp-voice-controls">
          <div className="tlhp-vc-btn" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
          </div>
          <div ref={endBtnRef} className="tlhp-vc-btn end" aria-hidden>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" transform="rotate(135 12 12)"/>
            </svg>
          </div>
          <div className="tlhp-vc-btn" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Caption strip — context flips per scenario */}
      <div className="tlhp-caption">
        <div className="tlhp-caption-row">
          <span className="tlhp-caption-key">Caller</span>
          <span className="tlhp-caption-val" ref={ctxNameRef}>—</span>
        </div>
        <div className="tlhp-caption-row">
          <span className="tlhp-caption-key">Trade</span>
          <span className="tlhp-caption-val" ref={ctxTradeRef}>—</span>
        </div>
        <div className="tlhp-caption-row">
          <span className="tlhp-caption-key">Window</span>
          <span className="tlhp-caption-val" ref={ctxWindowRef}>—</span>
        </div>
      </div>

      <div className="tlhp-funcrow">
        <span className="tlhp-funcdot" />
        <span className="tlhp-functext" ref={funcTextRef}>—</span>
      </div>

      <div ref={dotsRef} className="tlhp-dots" aria-hidden>
        <span className="tlhp-dot active" />
        <span className="tlhp-dot" />
        <span className="tlhp-dot" />
        <span className="tlhp-dot" />
      </div>
    </div>
  );
}

const ACCENT = mkt.accent;
const ACCENT_GLOW = "rgba(102,232,250,0.45)";

const TLHP_CSS = `
.tlhp-wrap {
  --tlhp-accent: ${ACCENT};
  --tlhp-accent-glow: ${ACCENT_GLOW};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
}
.tlhp-phone {
  position: relative;
  width: 340px; height: 650px;
  background: #020917;
  border: 1.5px solid rgba(255,255,255,0.55);
  border-radius: 30px;
  overflow: hidden;
  display: flex; flex-direction: column;
  cursor: pointer;
  box-shadow: 0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(102,232,250,0.06) inset;
  user-select: none;
}
.tlhp-phone.paused::after {
  content: 'Tap to resume';
  position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  font-family: 'DM Mono', monospace; font-size: 10px;
  letter-spacing: 1.5px; text-transform: uppercase;
  color: #fff; background: rgba(2,9,23,0.85);
  border: 1px solid rgba(255,255,255,0.22); padding: 8px 14px;
  border-radius: 999px; pointer-events: none;
  backdrop-filter: blur(4px); z-index: 5;
  opacity: 0; animation: tlhpPausedFade 0.3s ease forwards;
}
@keyframes tlhpPausedFade { to { opacity: 1; } }

/* ─── Mode-gated visibility ─── */
.tlhp-phone[data-mode="voice"] .tlhp-chat-header,
.tlhp-phone[data-mode="voice"] .tlhp-input,
.tlhp-phone[data-mode="chat"]  .tlhp-voice-header,
.tlhp-phone[data-mode="chat"]  .tlhp-voice-controls {
  display: none;
}

/* ═══ CHAT HEADER ═══ */
.tlhp-chat-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 18px 14px; flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.tlhp-header-left { display: flex; align-items: center; gap: 10px; color: #fff; }
.tlhp-header-right { display: flex; align-items: center; gap: 14px; color: #fff; }
.tlhp-iconbtn { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; color: #fff; }
.tlhp-iconbtn svg { width: 18px; height: 18px; }
.tlhp-logo { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: var(--tlhp-accent); flex-shrink: 0; filter: drop-shadow(0 0 6px var(--tlhp-accent-glow)); }
.tlhp-logo svg { width: 100%; height: 100%; }
.tlhp-brand { font-weight: 700; font-size: 16px; letter-spacing: -0.3px; color: #fff; }

/* ═══ VOICE HEADER ═══ */
.tlhp-voice-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 16px 14px; flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(102,232,250,0.06) 0%, transparent 100%);
}
.tlhp-voice-avatar {
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--tlhp-accent); color: #00131a;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 15px; flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(102,232,250,0.18);
}
.tlhp-voice-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.tlhp-voice-name { font-weight: 600; color: #fff; font-size: 14.5px; letter-spacing: -0.1px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tlhp-voice-status {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'DM Mono', monospace;
  font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
  color: rgba(255,255,255,0.62);
  white-space: nowrap;
}
.tlhp-voice-pulse {
  width: 7px; height: 7px; border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 8px rgba(74,222,128,0.55);
  animation: tlhpPulseGreen 1.5s ease-in-out infinite;
}
.tlhp-phone.connecting .tlhp-voice-pulse {
  background: #facc15; box-shadow: 0 0 8px rgba(250,204,21,0.55);
  animation-duration: 0.7s;
}
@keyframes tlhpPulseGreen {
  0%,100% { opacity: 1; transform: scale(1); }
  50%     { opacity: 0.45; transform: scale(0.82); }
}
.tlhp-voice-incoming {
  width: 30px; height: 30px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  background: rgba(74,222,128,0.14);
  border: 1px solid rgba(74,222,128,0.40);
  color: #4ade80;
  animation: tlhpRing 1.2s ease-in-out infinite;
}
.tlhp-voice-incoming svg { width: 14px; height: 14px; }
@keyframes tlhpRing {
  0%, 100% { transform: rotate(0deg); }
  10%, 30%, 50% { transform: rotate(-12deg); }
  20%, 40% { transform: rotate(12deg); }
  60% { transform: rotate(0deg); }
}

/* ═══ BODY ═══ */
.tlhp-body {
  flex: 1; overflow-y: auto;
  padding: 14px 18px 16px;
  display: flex; flex-direction: column; gap: 12px;
  scroll-behavior: smooth; justify-content: flex-end;
}
.tlhp-body::-webkit-scrollbar { width: 0; }
.tlhp-body.reset { opacity: 0; transition: opacity 0.55s ease; }

/* ═══ CHAT BUBBLES ═══ */
.tlhp-bubble-user {
  align-self: flex-end; max-width: 84%;
  padding: 11px 14px;
  background: var(--tlhp-accent); color: #00131a;
  font-size: 13.5px; font-weight: 500; line-height: 1.4; border-radius: 14px;
  opacity: 0; transform: translateY(16px);
  animation: tlhpBubbleIn 0.5s cubic-bezier(0.22,1,0.36,1) forwards;
  box-shadow: 0 8px 22px rgba(102,232,250,0.18);
}
@keyframes tlhpBubbleIn { to { opacity: 1; transform: translateY(0); } }

.tlhp-card-ai {
  align-self: flex-start; max-width: 92%;
  padding: 12px 14px 14px; background: transparent;
  border: 1px solid rgba(255,255,255,0.22); border-radius: 14px;
  color: #fff;
  opacity: 0; transform: translateY(8px);
  animation: tlhpBubbleIn 0.4s cubic-bezier(0.22,1,0.36,1) forwards;
}
.tlhp-card-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
  font-size: 12.5px; font-weight: 600; color: #fff;
}
.tlhp-card-logo { width: 14px; height: 14px; display: flex; color: var(--tlhp-accent); }
.tlhp-card-logo svg { width: 100%; height: 100%; }
.tlhp-card-head .sub { font-weight: 400; color: rgba(255,255,255,0.72); }
.tlhp-card-head .sep { color: rgba(255,255,255,0.40); }
.tlhp-card-body { font-size: 13px; line-height: 1.5; letter-spacing: -0.05px; }
.tlhp-card-body strong { font-weight: 600; color: var(--tlhp-accent); }

.tlhp-typing {
  align-self: flex-start; display: inline-flex; gap: 5px;
  padding: 9px 13px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.22);
  border-radius: 999px;
  opacity: 0; animation: tlhpBubbleIn 0.25s ease forwards;
}
.tlhp-typing span { width: 5px; height: 5px; background: #fff; border-radius: 50%; animation: tlhpTypingBounce 1.2s infinite ease-in-out; }
.tlhp-typing span:nth-child(2) { animation-delay: 0.2s; }
.tlhp-typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes tlhpTypingBounce {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30%           { opacity: 1;   transform: translateY(-3px); }
}

/* ═══ VOICE TRANSCRIPT BUBBLES ═══ */
.tlhp-vt {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 12px; max-width: 90%;
  font-size: 12.5px; line-height: 1.4; border-radius: 14px;
  opacity: 0; transform: translateY(8px);
  animation: tlhpBubbleIn 0.35s cubic-bezier(0.22,1,0.36,1) forwards;
}
.tlhp-vt.caller {
  align-self: flex-end; flex-direction: row-reverse;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  color: #fff;
}
.tlhp-vt.ai {
  align-self: flex-start;
  background: rgba(102,232,250,0.07);
  border: 1px solid rgba(102,232,250,0.32);
  color: #fff;
}
.tlhp-vt-icon {
  flex-shrink: 0;
  width: 24px; height: 24px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
}
.tlhp-vt.caller .tlhp-vt-icon {
  background: rgba(255,255,255,0.10);
  border: 1px solid rgba(255,255,255,0.20);
  color: rgba(255,255,255,0.92);
}
.tlhp-vt.ai .tlhp-vt-icon {
  background: rgba(102,232,250,0.18);
  border: 1px solid rgba(102,232,250,0.45);
  color: var(--tlhp-accent);
}
.tlhp-vt-icon svg { width: 12px; height: 12px; }
.tlhp-vt-text { letter-spacing: -0.05px; }

/* Animated waveform shown next to active speaker */
.tlhp-wave { display: inline-flex; align-items: center; gap: 2px; height: 14px; flex-shrink: 0; }
.tlhp-wave span {
  width: 2px; border-radius: 1px;
  background: currentColor;
  animation: tlhpWave 0.9s ease-in-out infinite;
}
.tlhp-vt.caller .tlhp-wave span { background: rgba(255,255,255,0.85); }
.tlhp-vt.ai     .tlhp-wave span { background: var(--tlhp-accent); }
.tlhp-wave span:nth-child(1) { height: 40%; animation-delay: 0s; }
.tlhp-wave span:nth-child(2) { height: 80%; animation-delay: 0.12s; }
.tlhp-wave span:nth-child(3) { height: 100%; animation-delay: 0.24s; }
.tlhp-wave span:nth-child(4) { height: 60%; animation-delay: 0.36s; }
@keyframes tlhpWave {
  0%, 100% { transform: scaleY(0.45); }
  50%      { transform: scaleY(1); }
}

/* ═══ RECEIPT CHIP ═══ */
.tlhp-receipt {
  align-self: flex-start;
  font-family: 'DM Mono', monospace;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em;
  padding: 6px 12px; border-radius: 999px;
  background: rgba(74, 222, 128, 0.14);
  color: #4ade80;
  border: 1px solid rgba(74, 222, 128, 0.32);
  opacity: 0; animation: tlhpBubbleIn 0.4s ease forwards;
}

/* ═══ CHAT INPUT ═══ */
.tlhp-input {
  display: flex; align-items: center; gap: 10px;
  margin: 0 14px 14px;
  padding: 10px 6px 10px 16px;
  border: 1px solid rgba(255,255,255,0.25); border-radius: 999px;
  transition: border-color 0.4s ease;
}
.tlhp-input.active { border-color: rgba(102,232,250,0.55); }
.tlhp-placeholder {
  flex: 1; font-size: 13.5px; color: rgba(255,255,255,0.40);
  min-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tlhp-placeholder.filled { color: #fff; }
.tlhp-caret {
  display: inline-block; width: 1.5px; height: 14px;
  background: #fff; margin-left: 1px; vertical-align: middle;
  animation: tlhpCaretBlink 0.8s infinite;
}
@keyframes tlhpCaretBlink { 50% { opacity: 0; } }
.tlhp-sendbtn {
  width: 28px; height: 28px; border-radius: 50%;
  background: #fff; display: flex; align-items: center; justify-content: center;
  color: #000; flex-shrink: 0;
  transition: transform 0.2s ease, background 0.2s ease;
}
.tlhp-sendbtn.active {
  transform: scale(1.08);
  background: var(--tlhp-accent); color: #00131a;
  box-shadow: 0 0 0 6px rgba(102,232,250,0.18);
}
.tlhp-sendbtn svg { width: 13px; height: 13px; }

/* ═══ VOICE CONTROLS (footer) ═══ */
.tlhp-voice-controls {
  display: flex; gap: 18px; justify-content: center;
  padding: 12px 14px 18px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.tlhp-vc-btn {
  width: 46px; height: 46px; border-radius: 50%;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.16);
  display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.85);
  transition: transform 0.18s ease, background 0.18s ease;
}
.tlhp-vc-btn svg { width: 18px; height: 18px; }
.tlhp-vc-btn.end {
  background: #ef4444;
  border-color: rgba(239,68,68,0.55);
  color: #fff;
  box-shadow: 0 8px 22px rgba(239,68,68,0.35);
}
.tlhp-vc-btn.end.hangup {
  animation: tlhpHangup 0.5s ease;
}
@keyframes tlhpHangup {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.18); box-shadow: 0 0 0 14px rgba(239,68,68,0.0); }
  100% { transform: scale(1); }
}

/* ═══ CAPTION + FUNC + DOTS (below phone) ═══ */
.tlhp-caption {
  display: grid; grid-template-columns: repeat(3, auto);
  gap: 22px;
  padding: 12px 18px; border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.02);
  font-family: 'DM Mono', monospace;
}
.tlhp-caption-row { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tlhp-caption-key {
  font-size: 9px; font-weight: 600; letter-spacing: 0.12em;
  text-transform: uppercase; color: rgba(255,255,255,0.40);
}
.tlhp-caption-val {
  font-size: 12px; font-weight: 600; color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;
}

.tlhp-funcrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'DM Mono', monospace;
  font-size: 10px; font-weight: 600; letter-spacing: 0.18em;
  text-transform: uppercase; color: rgba(255,255,255,0.65);
}
.tlhp-funcdot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--tlhp-accent);
  box-shadow: 0 0 12px var(--tlhp-accent-glow);
  animation: tlhpPulse 2s ease-in-out infinite;
}
@keyframes tlhpPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(0.85); opacity: 0.6; }
}

.tlhp-dots { display: flex; gap: 8px; }
.tlhp-dot {
  width: 22px; height: 3px;
  background: rgba(255,255,255,0.18);
  border-radius: 2px;
  transition: background 0.4s ease;
}
.tlhp-dot.active { background: var(--tlhp-accent); }

/* ═══ Responsive ═══ */
@media (max-width: 420px) {
  .tlhp-phone { width: 300px; height: 580px; border-radius: 26px; }
  .tlhp-chat-header { padding: 14px 14px 12px; }
  .tlhp-voice-header { padding: 14px 14px 12px; }
  .tlhp-body { padding: 12px 14px 14px; gap: 11px; }
  .tlhp-input { margin: 0 12px 12px; padding: 8px 4px 8px 14px; }
  .tlhp-voice-controls { padding: 10px 12px 14px; gap: 14px; }
  .tlhp-vc-btn { width: 42px; height: 42px; }
  .tlhp-caption { grid-template-columns: repeat(3, auto); gap: 14px; padding: 10px 14px; }
  .tlhp-caption-val { max-width: 90px; font-size: 11px; }
}
@media (max-width: 340px) {
  .tlhp-phone { width: 280px; height: 545px; }
}
`;
