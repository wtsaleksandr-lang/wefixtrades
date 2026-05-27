/**
 * TradeLineHeroPhone — premium animated phone mockup for /products/tradeline.
 *
 * Cycles through 4 trades scenarios in two modes:
 *   1. CHAT  · Plumbing   — emergency dispatch + booking
 *   2. VOICE · HVAC       — quote, scheduling, multi-Q&A
 *   3. CHAT  · Roofing    — storm-damage estimate
 *   4. VOICE · Electrical — panel-upgrade quote + booking
 *
 * Chat mode: types into input → user bubble (white/ink) → AI typing → AI
 * card with pricing (brand-blue/white) → green BOOKED receipt chip.
 * Voice mode: branded-white incoming-call header with caller avatar + live
 * timer + active-call icon. Transcript bubbles use the same on-brand
 * scheme: caller bubbles are white with ink text, AI bubbles are brand
 * blue with white text. Ends with a red call-end pulse + receipt chip.
 *
 * Interaction:
 *   • Tap the phone body to pause / resume the active scenario.
 *   • Click any of the 4 dots beneath the phone to jump straight to that
 *     scenario. Auto-cycling pauses for ~10s after manual navigation,
 *     then resumes from the user-chosen index.
 *   • IntersectionObserver auto-pauses off-screen.
 *
 * All styles scoped under `.tlhp-*`.
 */

import { useEffect, useRef, useState } from "react";
import { mkt } from "@/theme/tokens";

interface BaseScenario {
  funcText: string;
  receipt: string;
  ctx: { name: string; trade: string; window: string };
  label: string;
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
    label: "Plumbing emergency · chat",
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
    label: "HVAC weekend booking · voice",
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
    label: "Roofing storm estimate · chat",
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
    label: "Electrical panel upgrade · voice",
  },
];

const T = {
  chatTypeStart: 600,
  chatTypeDuration: 1900,
  chatSendDelay: 260,
  chatAiTyping: 1700,
  // +1s on chat reading time for the AI card before the receipt drops
  // and +1s after the receipt — total +2s per chat scenario
  chatReadHold: 1900,
  chatHold: 3200,
  voiceConnect: 900,
  // +400ms between turns × 5 turns ≈ +2s per voice scenario
  voiceTurnGap: 750,
  voiceHold: 3200,
  receiptHold: 1700,
};

/* After a manual dot click, auto-cycle stays paused for this long with no
 * further interaction. Spec: ~10s. */
const MANUAL_PAUSE_MS = 10_000;

interface TradeLineHeroPhoneProps {
  /**
   * Optional inline overrides for the `--tlhp-*` CSS custom properties
   * defined on `.tlhp-wrap`. Used by the portal widget-style preview modal
   * to live-retheme the phone without prop-plumbing every token. Inline
   * styles win over the stylesheet rule for the same custom property, so
   * any subset of vars can be passed here to re-skin the phone.
   */
  styleOverrides?: React.CSSProperties;
}

export default function TradeLineHeroPhone({ styleOverrides }: TradeLineHeroPhoneProps = {}) {
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
  const funcTextRef = useRef<HTMLSpanElement>(null);

  const [paused, setPaused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const inViewRef = useRef(true);

  /* Loop coordination state — refs so the long-running async loop in the
   * mount effect sees the latest values without re-mounting. */
  const idxRef = useRef(0);                       // scenario currently animating
  const nextIdxRef = useRef<number | null>(null); // requested override (from dot click)
  const manualUntilRef = useRef(0);               // epoch ms: auto-cycle paused until
  const cancelCurrentRef = useRef<(() => void) | null>(null); // cancels in-flight scenario
  const resumeRef = useRef<(() => void) | null>(null);        // unblocks wait()

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
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        const cancelHere = () => finish();
        // Register so a dot click can short-circuit the current wait.
        const prevCancel = cancelCurrentRef.current;
        cancelCurrentRef.current = () => { prevCancel?.(); cancelHere(); };
        setTimeout(async () => {
          while (!done && !cancelled && (pausedRef.current || !inViewRef.current)) {
            await new Promise<void>((r) => { resumeRef.current = r; });
          }
          finish();
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

    /* ─── Sender labels + simulated timestamps ─── */
    // Per-scenario "now" cursor (minutes since midnight). Each scenario
    // picks a fresh starting time so timestamps feel realistic; we then
    // tick forward by 30–90s for each bubble within the scenario.
    let tsMinutes = 0;
    const seedTimeForScenario = (idx: number) => {
      // Stable, varied starting points: 12:47, 14:18, 09:33, 17:05
      const seeds = [12 * 60 + 47, 14 * 60 + 18, 9 * 60 + 33, 17 * 60 + 5];
      tsMinutes = seeds[idx % seeds.length];
    };
    const fmtTime = (mins: number) => {
      const h24 = Math.floor(mins / 60) % 24;
      const m = Math.floor(mins) % 60;
      const period = h24 >= 12 ? "PM" : "AM";
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
    };
    const tickTime = () => {
      // Advance 30–90 seconds (0.5–1.5 min). Deterministic-ish via tsMinutes.
      const step = 0.5 + ((tsMinutes * 7) % 10) / 10; // 0.5–1.5
      tsMinutes += step;
    };

    function senderLabel(side: "user" | "ai", text: string) {
      const lbl = el("div", `tlhp-sender tlhp-sender-${side}`);
      lbl.textContent = text;
      return lbl;
    }
    function timestampNode(side: "user" | "ai") {
      tickTime();
      const ts = el("div", `tlhp-ts tlhp-ts-${side}`);
      ts.textContent = fmtTime(tsMinutes);
      return ts;
    }

    function applyContext(s: Scenario) {
      if (funcTextRef.current) funcTextRef.current.textContent = s.funcText;
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
          TradeLine <span class="sep">·</span> <span class="sub">Always-on dispatcher</span>
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

      bodyRef.current.appendChild(senderLabel("user", s.ctx.name));
      const ub = el("div", "tlhp-bubble-user");
      ub.textContent = s.user;
      bodyRef.current.appendChild(ub);
      bodyRef.current.appendChild(timestampNode("user"));
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

      bodyRef.current.appendChild(senderLabel("ai", "TradeLine"));
      const card = el("div", "tlhp-card-ai");
      card.innerHTML = aiCardHTML(s.ai);
      bodyRef.current.appendChild(card);
      bodyRef.current.appendChild(timestampNode("ai"));
      scrollDown();
      await wait(T.chatReadHold);
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
        let prevWho: "caller" | "ai" | null = null;
        for (const turn of s.turns) {
          if (cancelled) break;
          if (prevTurn) freezeWaveform(prevTurn);
          // Sender label — only when speaker changes (first turn from a
          // given speaker after the previous one). Per spec: customer label
          // = caller name, assistant label = "TradeLine" (no "AI" word).
          if (turn.who !== prevWho) {
            const side: "user" | "ai" = turn.who === "caller" ? "user" : "ai";
            const labelText = turn.who === "caller" ? s.callerName : "TradeLine";
            bodyRef.current.appendChild(senderLabel(side, labelText));
          }
          const node = makeVoiceTurn(turn.who, turn.text);
          bodyRef.current.appendChild(node);
          bodyRef.current.appendChild(timestampNode(turn.who === "caller" ? "user" : "ai"));
          scrollDown();
          prevTurn = node;
          prevWho = turn.who;
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
      idxRef.current = idx;
      setActiveIdx(idx);
      applyContext(s);
      seedTimeForScenario(idx);
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

    // Clear the static skeleton (rendered in JSX for first paint) before the
    // first scenario animates in. resetBody() handles all subsequent loops.
    function clearSkeleton() {
      if (!bodyRef.current) return;
      bodyRef.current.querySelectorAll("[data-skel]").forEach((n) => n.remove());
    }

    (async function loop() {
      clearSkeleton();
      let i = 0;
      while (!cancelled) {
        await runScenario(i);
        if (cancelled) return;
        await resetBody();
        if (cancelled) return;

        // Did the user request a jump while we were animating? Honour it.
        if (nextIdxRef.current !== null) {
          i = nextIdxRef.current;
          nextIdxRef.current = null;
        } else {
          // If we're still inside the manual-pause window, hold here until
          // it expires (or the user picks again).
          while (
            !cancelled &&
            Date.now() < manualUntilRef.current &&
            nextIdxRef.current === null
          ) {
            const remaining = Math.max(50, manualUntilRef.current - Date.now());
            await wait(Math.min(500, remaining));
          }
          if (cancelled) return;
          if (nextIdxRef.current !== null) {
            i = nextIdxRef.current;
            nextIdxRef.current = null;
          } else {
            i = (i + 1) % SCENARIOS.length;
          }
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
      if (cancelCurrentRef.current) {
        const c = cancelCurrentRef.current;
        cancelCurrentRef.current = null;
        c();
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

  /* Dot click: jump to scenario `idx`, cancel the in-flight scenario, and
   * pause auto-cycling for MANUAL_PAUSE_MS. Re-clicking another dot
   * refreshes that window so each interaction gets the full ~10s grace. */
  const handleDotClick = (idx: number) => {
    if (idx === idxRef.current) {
      // Same dot — still refresh the manual-pause window.
      manualUntilRef.current = Date.now() + MANUAL_PAUSE_MS;
      return;
    }
    nextIdxRef.current = idx;
    manualUntilRef.current = Date.now() + MANUAL_PAUSE_MS;
    // Cancel current wait so the loop falls through to resetBody() and
    // picks up the requested index.
    if (cancelCurrentRef.current) {
      const c = cancelCurrentRef.current;
      cancelCurrentRef.current = null;
      c();
    }
  };

  const handleDotKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleDotClick(idx);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleDotClick((idx + 1) % SCENARIOS.length);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      handleDotClick((idx - 1 + SCENARIOS.length) % SCENARIOS.length);
    }
  };

  return (
    <div data-theme="dark" className="tlhp-wrap" style={styleOverrides}>
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
        {/* CHAT HEADER — branded white per spec */}
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

        {/* VOICE HEADER — branded white per spec */}
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

        <div ref={bodyRef} className="tlhp-body">
          {/* Static skeleton — visible from first paint until the JS demo loop
              removes it (runs t≈0, before first scenario animates in). Shapes
              mirror real user / AI / user bubble cadence so there's no layout
              shift when real content paints. data-skel marks nodes for the
              clearSkeleton() removal pass. */}
          <div className="tlhp-skel-user" data-skel aria-hidden>
            <div className="tlhp-skel-line" style={{ width: "82%" }} />
            <div className="tlhp-skel-line" style={{ width: "54%" }} />
          </div>
          <div className="tlhp-skel-ai" data-skel aria-hidden>
            <div className="tlhp-skel-line" style={{ width: "70%" }} />
            <div className="tlhp-skel-line" style={{ width: "88%" }} />
            <div className="tlhp-skel-line" style={{ width: "46%" }} />
          </div>
          <div className="tlhp-skel-user" data-skel aria-hidden>
            <div className="tlhp-skel-line" style={{ width: "62%" }} />
          </div>
        </div>

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

      {/* Scenario indicator strip — currently-running function label */}
      <div className="tlhp-funcrow">
        <span className="tlhp-funcdot" />
        <span className="tlhp-functext" ref={funcTextRef}>—</span>
      </div>

      {/* Interactive dots — click to jump scenarios. Auto-cycle pauses ~10s. */}
      <div
        className="tlhp-dots"
        role="tablist"
        aria-label="TradeLine demo scenarios"
        onClick={(e) => e.stopPropagation()}
      >
        {SCENARIOS.map((s, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === activeIdx}
            aria-label={`Jump to scenario ${i + 1}: ${s.label}`}
            className={`tlhp-dot${i === activeIdx ? " active" : ""}`}
            onClick={(e) => { e.stopPropagation(); handleDotClick(i); }}
            onKeyDown={(e) => handleDotKey(e, i)}
          >
            <span className="tlhp-dot-bar" aria-hidden />
          </button>
        ))}
      </div>

      {/* Trust strip — replaces the old Caller/Trade/Window card. Hints
          the dots are interactive + reinforces the always-on AI value-prop. */}
      <div className="tlhp-trust" aria-hidden>
        <span className="tlhp-trust-pulse" />
        Powered by TradeLine AI <span className="tlhp-trust-sep">·</span>
        Always-on <span className="tlhp-trust-sep">·</span>
        <span className="tlhp-trust-hint">Tap a dot to jump scenarios</span>
      </div>
    </div>
  );
}

const ACCENT = mkt.accent;
const ACCENT_HOVER = mkt.accentHover;
const ACCENT_GLOW = "rgba(13,60,252,0.45)";
const ACCENT_RING = "rgba(13,60,252,0.32)";

const TLHP_CSS = `
.tlhp-wrap {
  --tlhp-accent: ${ACCENT};
  --tlhp-accent-hover: ${ACCENT_HOVER};
  --tlhp-accent-glow: ${ACCENT_GLOW};
  --tlhp-accent-ring: ${ACCENT_RING};
  /* Branded surface tokens for the on-brand white header + bubbles.
     Sourced from mkt.* (#0d3cfc / #161616) so all values stay token-driven
     even though CSS variables consume the resolved hex strings. */
  --tlhp-paper: #ffffff;          /* "branded white" — sourced from mkt.onDark family */
  --tlhp-ink: ${mkt.bgBase};      /* "branded black" — #161616 */
  /* Softer ink for customer bubble text — slate-900 via mkt.onWarm (#0F172A).
     Adds warmth without competing with header/UI ink. */
  --tlhp-bubble-ink: ${mkt.onWarm};
  /* Neutral grey for the customer bubble left-border accent — slate-300. */
  --tlhp-customer-accent: #cbd5e1;
  --tlhp-ink-soft: #2a2f33;
  --tlhp-ink-muted: rgba(22,22,22,0.62);
  --tlhp-hairline: rgba(22,22,22,0.10);
  /* Soft canvas + dot grid for the chat scroll area — matches the
     engineered-grid pattern used on the marketing page below the hero,
     but tuned for a light surface (dark dots on slate-50). */
  --tlhp-canvas: #f4f6f8;
  --tlhp-canvas-dot: rgba(22,22,22,0.07);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
}
.tlhp-phone {
  position: relative;
  width: 340px; height: 650px;
  background: var(--tlhp-paper);
  border: 1.5px solid rgba(255,255,255,0.55);
  border-radius: 30px;
  overflow: hidden;
  display: flex; flex-direction: column;
  cursor: pointer;
  box-shadow:
    0 30px 80px rgba(0,0,0,0.55),
    0 0 0 1px var(--tlhp-accent-ring) inset;
  user-select: none;
}
.tlhp-phone.paused::after {
  content: 'Tap to resume';
  position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  font-family: 'DM Mono', monospace; font-size: 10px;
  letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--tlhp-paper); background: rgba(22,22,22,0.85);
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

/* ═══ CHAT HEADER (white) ═══ */
.tlhp-chat-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 18px 14px; flex-shrink: 0;
  background: var(--tlhp-paper);
  border-bottom: 1px solid var(--tlhp-hairline);
}
.tlhp-header-left { display: flex; align-items: center; gap: 10px; color: var(--tlhp-ink); }
.tlhp-header-right { display: flex; align-items: center; gap: 14px; color: var(--tlhp-ink); }
.tlhp-iconbtn { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; color: var(--tlhp-ink); }
.tlhp-iconbtn svg { width: 18px; height: 18px; }
.tlhp-logo {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  color: var(--tlhp-accent); flex-shrink: 0;
  filter: drop-shadow(0 0 6px var(--tlhp-accent-glow));
}
.tlhp-logo svg { width: 100%; height: 100%; }
.tlhp-brand { font-weight: 700; font-size: 16px; letter-spacing: -0.3px; color: var(--tlhp-ink); }

/* ═══ VOICE HEADER (white per spec) ═══ */
.tlhp-voice-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 16px 14px; flex-shrink: 0;
  background: var(--tlhp-paper);
  border-bottom: 1px solid var(--tlhp-hairline);
}
.tlhp-voice-avatar {
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--tlhp-accent); color: var(--tlhp-paper);
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 15px; flex-shrink: 0;
  box-shadow: 0 0 0 3px var(--tlhp-accent-ring);
}
.tlhp-voice-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.tlhp-voice-name {
  font-weight: 600; color: var(--tlhp-ink);
  font-size: 14.5px; letter-spacing: -0.1px; line-height: 1.1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tlhp-voice-status {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'DM Mono', monospace;
  font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--tlhp-ink-muted);
  white-space: nowrap;
}
.tlhp-voice-pulse {
  width: 7px; height: 7px; border-radius: 50%;
  background: #16a34a;
  box-shadow: 0 0 8px rgba(22,163,74,0.45);
  animation: tlhpPulseGreen 1.5s ease-in-out infinite;
}
.tlhp-phone.connecting .tlhp-voice-pulse {
  background: #d97706; box-shadow: 0 0 8px rgba(217,119,6,0.45);
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
  background: rgba(22,163,74,0.10);
  border: 1px solid rgba(22,163,74,0.40);
  color: #16a34a;
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
  /* Engineered dot-grid on a soft slate canvas — same pattern the page
     uses around the NumberedCards. Header + input stay white so the
     bubble surface reads as a discrete chat area, separated by 1px
     hairlines (border-bottom on header, border-top on input). */
  background-color: var(--tlhp-canvas);
  background-image: radial-gradient(circle, var(--tlhp-canvas-dot) 1px, transparent 1px);
  background-size: 16px 16px;
  border-top: 1px solid var(--tlhp-hairline);
  border-bottom: 1px solid var(--tlhp-hairline);
  display: flex; flex-direction: column; gap: 12px;
  scroll-behavior: smooth; justify-content: flex-end;
}
.tlhp-body::-webkit-scrollbar { width: 0; }
.tlhp-body.reset { opacity: 0; transition: opacity 0.55s ease; }

/* ═══ FIRST-PAINT SKELETON (cleared by JS before scenario 1) ═══ */
.tlhp-skel-user, .tlhp-skel-ai {
  display: flex; flex-direction: column; gap: 6px;
  padding: 11px 14px; border-radius: 16px;
}
.tlhp-skel-user {
  align-self: flex-end; max-width: 84%;
  background: var(--tlhp-accent-ring);
  border: 1px solid rgba(13,60,252,0.18);
}
.tlhp-skel-ai {
  align-self: flex-start; max-width: 92%;
  background: rgba(22,22,22,0.04);
  border: 1px solid rgba(22,22,22,0.08);
  padding: 12px 14px 14px;
}
.tlhp-skel-line {
  height: 10px; border-radius: 6px;
  background: rgba(22,22,22,0.10);
}

/* ═══ CHAT BUBBLES ═══
   Spec:
   - AI agent → blue background, white text
   - Customer  → white background, ink (branded-black) text
   Caller bubble = customer in this UI surface (right-aligned). */
.tlhp-bubble-user {
  align-self: flex-end; max-width: 84%;
  padding: 11px 15px;
  background: var(--tlhp-paper);
  /* Softened from pure ink (#161616) to slate-900 (#0F172A) for warmth.
     Sourced from mkt.onWarm to stay token-driven. */
  color: var(--tlhp-bubble-ink);
  font-size: 13.5px; font-weight: 500; line-height: 1.4;
  border: 1px solid var(--tlhp-hairline);
  /* Soft left-border accent anchors customer messages without competing
     with the assistant's brand-blue identity. */
  border-left: 1.5px solid var(--tlhp-customer-accent);
  border-radius: 18px 18px 6px 18px;
  opacity: 0; transform: translateY(16px);
  animation: tlhpBubbleIn 0.5s cubic-bezier(0.22,1,0.36,1) forwards;
  box-shadow: 0 4px 14px rgba(22,22,22,0.06);
}
@keyframes tlhpBubbleIn { to { opacity: 1; transform: translateY(0); } }

.tlhp-card-ai {
  align-self: flex-start; max-width: 92%;
  padding: 12px 14px 14px;
  background: var(--tlhp-accent);
  color: var(--tlhp-paper);
  border: 1px solid var(--tlhp-accent-hover);
  border-radius: 18px 18px 18px 6px;
  opacity: 0; transform: translateY(8px);
  animation: tlhpBubbleIn 0.4s cubic-bezier(0.22,1,0.36,1) forwards;
  box-shadow: 0 10px 26px rgba(13,60,252,0.25);
}
.tlhp-card-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
  font-size: 12.5px; font-weight: 600; color: var(--tlhp-paper);
}
.tlhp-card-logo { width: 14px; height: 14px; display: flex; color: var(--tlhp-paper); }
.tlhp-card-logo svg { width: 100%; height: 100%; }
.tlhp-card-head .sub { font-weight: 400; color: rgba(255,255,255,0.78); }
.tlhp-card-head .sep { color: rgba(255,255,255,0.45); }
.tlhp-card-body {
  font-size: 13px; line-height: 1.5; letter-spacing: -0.05px;
  color: var(--tlhp-paper);
}
.tlhp-card-body strong { font-weight: 700; color: var(--tlhp-paper); }

.tlhp-typing {
  align-self: flex-start; display: inline-flex; gap: 5px;
  padding: 9px 13px;
  background: var(--tlhp-accent);
  border: 1px solid var(--tlhp-accent-hover);
  border-radius: 999px;
  opacity: 0; animation: tlhpBubbleIn 0.25s ease forwards;
  box-shadow: 0 6px 16px rgba(13,60,252,0.20);
}
.tlhp-typing span {
  width: 5px; height: 5px;
  background: var(--tlhp-paper); border-radius: 50%;
  animation: tlhpTypingBounce 1.2s infinite ease-in-out;
}
.tlhp-typing span:nth-child(2) { animation-delay: 0.2s; }
.tlhp-typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes tlhpTypingBounce {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30%           { opacity: 1;   transform: translateY(-3px); }
}

/* ═══ SENDER LABELS + TIMESTAMPS ═══
   Tiny grey sender label sits above the FIRST bubble from each speaker
   per turn (chat: always — only one bubble per speaker; voice: only when
   the speaker changes). A subtle timestamp sits below every bubble. The
   .tlhp-body uses gap:12px; we pull labels/timestamps in via negative
   margins so they read as part of the same unit. */
.tlhp-sender {
  font-size: 10px; font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--tlhp-ink-muted);
  margin-bottom: -8px;   /* pull bubble closer than the row gap */
  padding: 0 4px;
  max-width: 92%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  opacity: 0;
  animation: tlhpSenderIn 0.35s ease forwards;
}
.tlhp-sender-user { align-self: flex-end; text-align: right; }
.tlhp-sender-ai   { align-self: flex-start; text-align: left; }
@keyframes tlhpSenderIn { to { opacity: 0.7; } }

.tlhp-ts {
  font-size: 10px; line-height: 1;
  color: var(--tlhp-ink-muted);
  margin-top: -6px;     /* pull timestamp closer to its bubble */
  padding: 0 6px;
  font-variant-numeric: tabular-nums;
  opacity: 0;
  animation: tlhpTsIn 0.4s ease forwards;
}
.tlhp-ts-user { align-self: flex-end; text-align: right; }
.tlhp-ts-ai   { align-self: flex-start; text-align: left; }
@keyframes tlhpTsIn { to { opacity: 0.6; } }

/* ═══ VOICE TRANSCRIPT BUBBLES ═══
   Mirrors the chat variants so both modes feel like one conversation:
   - caller (right) → white bg, ink text
   - ai     (left)  → brand-blue bg, white text */
.tlhp-vt {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 13px; max-width: 90%;
  font-size: 12.5px; line-height: 1.4;
  opacity: 0; transform: translateY(8px);
  animation: tlhpBubbleIn 0.35s cubic-bezier(0.22,1,0.36,1) forwards;
}
.tlhp-vt.caller {
  align-self: flex-end; flex-direction: row-reverse;
  background: var(--tlhp-paper);
  border: 1px solid var(--tlhp-hairline);
  border-left: 1.5px solid var(--tlhp-customer-accent);
  color: var(--tlhp-bubble-ink);
  border-radius: 16px 16px 4px 16px;
  box-shadow: 0 3px 10px rgba(22,22,22,0.05);
}
.tlhp-vt.ai {
  align-self: flex-start;
  background: var(--tlhp-accent);
  border: 1px solid var(--tlhp-accent-hover);
  color: var(--tlhp-paper);
  border-radius: 16px 16px 16px 4px;
  box-shadow: 0 6px 16px rgba(13,60,252,0.22);
}
.tlhp-vt-icon {
  flex-shrink: 0;
  width: 22px; height: 22px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
}
.tlhp-vt.caller .tlhp-vt-icon {
  background: rgba(22,22,22,0.06);
  border: 1px solid rgba(22,22,22,0.12);
  color: var(--tlhp-ink-soft);
}
.tlhp-vt.ai .tlhp-vt-icon {
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.40);
  color: var(--tlhp-paper);
}
.tlhp-vt-icon svg { width: 11px; height: 11px; }
.tlhp-vt-text { letter-spacing: -0.05px; }

/* Animated waveform shown next to active speaker */
.tlhp-wave { display: inline-flex; align-items: center; gap: 2px; height: 14px; flex-shrink: 0; }
.tlhp-wave span {
  width: 2px; border-radius: 1px;
  background: currentColor;
  animation: tlhpWave 0.9s ease-in-out infinite;
}
.tlhp-vt.caller .tlhp-wave span { background: var(--tlhp-ink-soft); }
.tlhp-vt.ai     .tlhp-wave span { background: var(--tlhp-paper); }
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
  background: rgba(22,163,74,0.10);
  color: #15803d;
  border: 1px solid rgba(22,163,74,0.32);
  opacity: 0; animation: tlhpBubbleIn 0.4s ease forwards;
}

/* ═══ CHAT INPUT (white surface) ═══ */
.tlhp-input {
  display: flex; align-items: center; gap: 10px;
  margin: 0 14px 14px;
  padding: 10px 6px 10px 16px;
  background: rgba(22,22,22,0.03);
  border: 1px solid var(--tlhp-hairline); border-radius: 999px;
  transition: border-color 0.4s ease, background 0.4s ease;
}
.tlhp-input.active {
  border-color: var(--tlhp-accent);
  background: rgba(13,60,252,0.04);
}
.tlhp-placeholder {
  flex: 1; font-size: 13.5px; color: var(--tlhp-ink-muted);
  min-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tlhp-placeholder.filled { color: var(--tlhp-ink); }
.tlhp-caret {
  display: inline-block; width: 1.5px; height: 14px;
  background: var(--tlhp-ink); margin-left: 1px; vertical-align: middle;
  animation: tlhpCaretBlink 0.8s infinite;
}
@keyframes tlhpCaretBlink { 50% { opacity: 0; } }
.tlhp-sendbtn {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--tlhp-ink);
  display: flex; align-items: center; justify-content: center;
  color: var(--tlhp-paper); flex-shrink: 0;
  transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}
.tlhp-sendbtn.active {
  transform: scale(1.08);
  background: var(--tlhp-accent); color: var(--tlhp-paper);
  box-shadow: 0 0 0 6px var(--tlhp-accent-ring);
}
.tlhp-sendbtn svg { width: 13px; height: 13px; }

/* ═══ VOICE CONTROLS (footer) ═══ */
.tlhp-voice-controls {
  display: flex; gap: 18px; justify-content: center;
  padding: 12px 14px 18px;
  background: var(--tlhp-paper);
  border-top: 1px solid var(--tlhp-hairline);
}
.tlhp-vc-btn {
  width: 46px; height: 46px; border-radius: 50%;
  background: rgba(22,22,22,0.04);
  border: 1px solid var(--tlhp-hairline);
  display: flex; align-items: center; justify-content: center;
  color: var(--tlhp-ink-soft);
  transition: transform 0.18s ease, background 0.18s ease;
}
.tlhp-vc-btn svg { width: 18px; height: 18px; }
.tlhp-vc-btn.end {
  background: #ef4444;
  border-color: rgba(239,68,68,0.55);
  color: var(--tlhp-paper);
  box-shadow: 0 8px 22px rgba(239,68,68,0.30);
}
.tlhp-vc-btn.end.hangup {
  animation: tlhpHangup 0.5s ease;
}
@keyframes tlhpHangup {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.18); box-shadow: 0 0 0 14px rgba(239,68,68,0.0); }
  100% { transform: scale(1); }
}

/* ═══ FUNC ROW + INTERACTIVE DOTS + TRUST STRIP (below phone) ═══ */
.tlhp-funcrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'DM Mono', monospace;
  font-size: 10px; font-weight: 600; letter-spacing: 0.18em;
  text-transform: uppercase; color: rgba(255,255,255,0.65);
  margin-top: 4px;
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

.tlhp-dots {
  display: flex; gap: 6px;
  padding: 4px;
}
.tlhp-dot {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 8px 4px;          /* generous tap target — ≥ 44px diagonal */
  margin: 0;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 6px;
  transition: transform 0.18s ease, background 0.18s ease;
}
.tlhp-dot:hover .tlhp-dot-bar {
  background: rgba(255,255,255,0.45);
  transform: scaleY(1.4);
}
.tlhp-dot:focus-visible {
  outline: none;
  background: rgba(13,60,252,0.10);
  box-shadow: 0 0 0 2px var(--tlhp-accent);
}
.tlhp-dot-bar {
  display: block;
  width: 26px; height: 3px;
  background: rgba(255,255,255,0.22);
  border-radius: 2px;
  transition: background 0.4s ease, width 0.4s ease, transform 0.18s ease;
}
.tlhp-dot.active .tlhp-dot-bar {
  background: var(--tlhp-accent);
  width: 34px;
  box-shadow: 0 0 10px var(--tlhp-accent-glow);
}
.tlhp-dot.active:hover .tlhp-dot-bar { background: var(--tlhp-accent); }

.tlhp-trust {
  display: inline-flex; align-items: center; gap: 8px;
  flex-wrap: wrap; justify-content: center;
  font-family: 'DM Mono', monospace;
  font-size: 10px; letter-spacing: 0.10em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.50);
  padding: 0 8px;
  text-align: center;
  max-width: 320px;
}
.tlhp-trust-pulse {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--tlhp-accent);
  box-shadow: 0 0 8px var(--tlhp-accent-glow);
  animation: tlhpPulse 2.4s ease-in-out infinite;
}
.tlhp-trust-sep { color: rgba(255,255,255,0.25); }
.tlhp-trust-hint { color: rgba(255,255,255,0.72); }

/* ═══ Responsive ═══ */
@media (max-width: 420px) {
  .tlhp-phone { width: 300px; height: 580px; border-radius: 26px; }
  .tlhp-chat-header { padding: 14px 14px 12px; }
  .tlhp-voice-header { padding: 14px 14px 12px; }
  .tlhp-body { padding: 12px 14px 14px; gap: 11px; }
  .tlhp-input { margin: 0 12px 12px; padding: 8px 4px 8px 14px; }
  .tlhp-voice-controls { padding: 10px 12px 14px; gap: 14px; }
  .tlhp-vc-btn { width: 42px; height: 42px; }
  .tlhp-dot-bar { width: 22px; }
  .tlhp-dot.active .tlhp-dot-bar { width: 28px; }
  .tlhp-trust { font-size: 9.5px; max-width: 280px; }
}
@media (max-width: 340px) {
  .tlhp-phone { width: 280px; height: 545px; }
}

/* ─── REDUCED-MOTION RESPECT ─── */
@media (prefers-reduced-motion: reduce) {
  @keyframes tlhpPausedFade { to { opacity: 1; } }
  @keyframes tlhpPulseGreen { 0%, 100% { opacity: 1; transform: none; } }
  @keyframes tlhpRing       { 0%, 100% { transform: none; } }
  @keyframes tlhpBubbleIn   { to { opacity: 1; transform: none; } }
  @keyframes tlhpTypingBounce { 0%, 100% { opacity: 0.7; transform: none; } }
  @keyframes tlhpSenderIn   { to { opacity: 0.7; } }
  @keyframes tlhpTsIn       { to { opacity: 0.6; } }
  @keyframes tlhpWave       { 0%, 100% { transform: scaleY(0.7); } }
  @keyframes tlhpCaretBlink { 0%, 100% { opacity: 1; } }
  @keyframes tlhpHangup     { 0%, 100% { transform: none; } }
  @keyframes tlhpPulse      { 0%, 100% { transform: none; opacity: 1; } }
}
`;
