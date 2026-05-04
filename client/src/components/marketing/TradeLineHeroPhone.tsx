/**
 * TradeLineHeroPhone — premium animated phone mockup for /products/tradeline.
 *
 * Ported from the IntellCluster `_hero_bento.html` phone (the .ph-* layer) and
 * adapted to a TradeLine messaging simulation. Cycles through three trades
 * scenarios: emergency plumber, weekend HVAC, electrical panel quote.
 *
 *   1. Placeholder text types in the input ("burst pipe under sink…")
 *   2. Send button activates → user bubble appears
 *   3. AI typing dots → AI response card with quote + booking confirmation
 *   4. Brief hold → next scenario
 *
 * Tap to pause / resume. Pauses while off-screen (IntersectionObserver).
 *
 * Self-contained: all styles scoped under `.tlhp-*` classnames.
 */

import { useEffect, useRef, useState } from "react";
import { mkt } from "@/theme/tokens";

interface Scenario {
  user: string;
  ai: string;            // HTML, supports <strong>
  funcText: string;      // Active-function panel text (visible in caption strip below phone)
  receipt: string;       // Final confirmation chip after AI card
  ctx: { name: string; zip: string; trade: string; window: string };
}

const SCENARIOS: Scenario[] = [
  {
    user: "Hi! Looking for an emergency plumber. Burst pipe under the kitchen sink — water everywhere.",
    ai:
      "<strong>Got it — sending help.</strong><br/><br/>" +
      "I can dispatch a licensed plumber within <strong>60 min</strong>. Emergency call-out + diagnostic runs <strong>$185–$240</strong>, parts billed at cost.<br/><br/>" +
      "Tap to confirm and I'll text the tech's ETA + name.",
    funcText: "EMERGENCY · PLUMBING · 24/7",
    receipt: "✓ BOOKED · Tech ETA 41 min",
    ctx: { name: "Sarah K.", zip: "78704", trade: "Plumbing", window: "Now" },
  },
  {
    user: "AC stopped cooling overnight. Need a quote for tune-up + refrigerant recharge — Saturday if possible?",
    ai:
      "<strong>Heat-wave week — I've got Saturday open.</strong><br/><br/>" +
      "Tune-up + recharge runs <strong>$320–$420</strong> depending on refrigerant level. Tech can be at your place between <strong>8–10 AM</strong>.<br/><br/>" +
      "Want me to lock the slot?",
    funcText: "QUOTE · HVAC · WEEKEND",
    receipt: "✓ SCHEDULED · Sat 8–10 AM",
    ctx: { name: "Morgan T.", zip: "30327", trade: "HVAC", window: "Sat AM" },
  },
  {
    user: "Need a quote for a 200A panel upgrade. Old fuse box, two-story house, room for a generator inlet later.",
    ai:
      "<strong>Standard 200A swap with permit + inspection.</strong><br/><br/>" +
      "Range is <strong>$2,400–$3,200</strong>. With a generator-ready slot pre-wired, add <strong>$280</strong>. A master electrician can do the free assessment Wed or Thu.<br/><br/>" +
      "Pick a slot?",
    funcText: "ESTIMATE · ELECTRICAL · PERMIT",
    receipt: "✓ ASSESSMENT · Wed 2 PM",
    ctx: { name: "Sam R.", zip: "11215", trade: "Electrical", window: "Wed PM" },
  },
];

const T = { typeStart: 600, typeDuration: 2000, sendDelay: 280, aiTypingHold: 1900, holdAfter: 2200 };

export default function TradeLineHeroPhone() {
  const phoneRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const sendBtnRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const funcTextRef = useRef<HTMLSpanElement>(null);
  const ctxNameRef = useRef<HTMLSpanElement>(null);
  const ctxZipRef = useRef<HTMLSpanElement>(null);
  const ctxTradeRef = useRef<HTMLSpanElement>(null);
  const ctxWindowRef = useRef<HTMLSpanElement>(null);

  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const inViewRef = useRef(true);
  const resumeRef = useRef<(() => void) | null>(null);

  // Pause when off-screen (saves CPU and respects user attention)
  useEffect(() => {
    if (!phoneRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => { inViewRef.current = entries[0]?.isIntersecting ?? true; },
      { threshold: 0.15 },
    );
    obs.observe(phoneRef.current);
    return () => obs.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    let cancelled = false;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(async () => {
          while (!cancelled && (pausedRef.current || !inViewRef.current)) {
            await new Promise<void>((r) => { resumeRef.current = r; });
          }
          if (!cancelled) resolve();
          else resolve();
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
          <span class="tlhp-logo">
            <svg viewBox="0 0 32 32" fill="currentColor">
              <path d="M16 2 L18 12 L28 10 L20 16 L28 22 L18 20 L16 30 L14 20 L4 22 L12 16 L4 10 L14 12 Z"/>
            </svg>
          </span>
          TradeLine AI <span class="sep">·</span> <span class="sub">Always-on dispatcher</span>
        </div>
        <div class="tlhp-card-body">${body}</div>
      `;
    }

    function applyContext(s: Scenario) {
      if (funcTextRef.current) funcTextRef.current.textContent = s.funcText;
      if (ctxNameRef.current) ctxNameRef.current.textContent = s.ctx.name;
      if (ctxZipRef.current) ctxZipRef.current.textContent = s.ctx.zip;
      if (ctxTradeRef.current) ctxTradeRef.current.textContent = s.ctx.trade;
      if (ctxWindowRef.current) ctxWindowRef.current.textContent = s.ctx.window;
    }

    async function runScenario(idx: number) {
      const s = SCENARIOS[idx];
      const dotEls = dotsRef.current?.querySelectorAll(".tlhp-dot") ?? [];
      dotEls.forEach((d, i) => {
        if (i === idx) d.classList.add("active");
        else d.classList.remove("active");
      });
      applyContext(s);

      if (!inputRef.current || !sendBtnRef.current || !placeholderRef.current || !bodyRef.current) return;

      inputRef.current.classList.remove("active");
      sendBtnRef.current.classList.remove("active");
      placeholderRef.current.classList.remove("filled");
      placeholderRef.current.textContent = "How can TradeLine help your customers tonight?";

      await wait(T.typeStart);
      if (cancelled) return;

      inputRef.current.classList.add("active");
      await typeInto(placeholderRef.current, s.user, T.typeDuration);
      await wait(T.sendDelay);
      if (cancelled) return;
      sendBtnRef.current.classList.add("active");
      await wait(180);
      sendBtnRef.current.classList.remove("active");
      inputRef.current.classList.remove("active");
      placeholderRef.current.classList.remove("filled");
      placeholderRef.current.textContent = "How can TradeLine help your customers tonight?";

      // User bubble
      const ub = el("div", "tlhp-bubble-user");
      ub.textContent = s.user;
      bodyRef.current.appendChild(ub);
      scrollDown();
      await wait(700);
      if (cancelled) return;

      // AI typing dots
      const td = el("div", "tlhp-typing");
      td.appendChild(el("span"));
      td.appendChild(el("span"));
      td.appendChild(el("span"));
      bodyRef.current.appendChild(td);
      scrollDown();
      await wait(T.aiTypingHold);
      if (cancelled) return;
      td.remove();

      // AI card response
      const card = el("div", "tlhp-card-ai");
      card.innerHTML = aiCardHTML(s.ai);
      bodyRef.current.appendChild(card);
      scrollDown();
      await wait(900);
      if (cancelled) return;

      // Booking receipt chip
      const receipt = el("div", "tlhp-receipt");
      receipt.textContent = s.receipt;
      bodyRef.current.appendChild(receipt);
      scrollDown();
      await wait(T.holdAfter);
    }

    async function resetChat() {
      if (!bodyRef.current) return;
      bodyRef.current.classList.add("reset");
      await wait(600);
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
          await resetChat();
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

  // When un-pausing, fire the awaiting wait()
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
        onClick={togglePause}
        role="button"
        tabIndex={0}
        aria-label="TradeLine animated demo. Tap to pause."
      >
        <div className="tlhp-header">
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

        <div ref={bodyRef} className="tlhp-body" />

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
      </div>

      {/* Caption strip below phone — context flips per scenario */}
      <div className="tlhp-caption">
        <div className="tlhp-caption-row">
          <span className="tlhp-caption-key">Caller</span>
          <span className="tlhp-caption-val" ref={ctxNameRef}>—</span>
        </div>
        <div className="tlhp-caption-row">
          <span className="tlhp-caption-key">ZIP</span>
          <span className="tlhp-caption-val" ref={ctxZipRef}>—</span>
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
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Scoped CSS — copied from IntellCluster phone (.ph-*) and adapted
   to .tlhp-* + WeFixTrades cyan accent.
   ──────────────────────────────────────────────────────────────── */
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

.tlhp-header {
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
.tlhp-brand { font-family: 'DM Sans', sans-serif; font-weight: 700; font-size: 16px; letter-spacing: -0.3px; color: #fff; }

.tlhp-body {
  flex: 1; overflow-y: auto;
  padding: 14px 18px 16px;
  display: flex; flex-direction: column; gap: 14px;
  scroll-behavior: smooth; justify-content: flex-end;
}
.tlhp-body::-webkit-scrollbar { width: 0; }
.tlhp-body.reset { opacity: 0; transition: opacity 0.6s ease; }

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
.tlhp-card-head .tlhp-logo { width: 14px; height: 14px; filter: none; }
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

/* Caption strip below phone — context flips per scenario */
.tlhp-caption {
  display: grid; grid-template-columns: repeat(4, auto);
  gap: 18px;
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
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 110px;
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
  width: 24px; height: 3px;
  background: rgba(255,255,255,0.18);
  border-radius: 2px;
  transition: background 0.4s ease;
}
.tlhp-dot.active { background: var(--tlhp-accent); }

/* Mobile: shrink phone proportionally so it always fits with page padding */
@media (max-width: 420px) {
  .tlhp-phone { width: 300px; height: 570px; border-radius: 26px; }
  .tlhp-header { padding: 14px 14px 12px; }
  .tlhp-body { padding: 12px 14px 14px; gap: 12px; }
  .tlhp-input { margin: 0 12px 12px; padding: 8px 4px 8px 14px; }
  .tlhp-caption { grid-template-columns: repeat(2, auto); gap: 14px 24px; }
}
@media (max-width: 340px) {
  .tlhp-phone { width: 280px; height: 540px; }
}
`;
