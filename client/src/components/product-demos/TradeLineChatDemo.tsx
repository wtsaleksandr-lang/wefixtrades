/**
 * TradeLineChatDemo — animated hero demo for /products/tradeline.
 *
 * Plays a 4-step chat sequence on a 9-second loop:
 *   1. Customer texts about a burst pipe
 *   2. AI replies with quote + dispatch question
 *   3. Customer confirms
 *   4. AI books and confirms — "✓ Booked — Tech ETA 41 min"
 *
 * Pauses on hover. Pauses when scrolled out of view. On mobile (< 640px) and
 * with prefers-reduced-motion, renders the final static frame.
 *
 * Drops into the `<DemoSlot>` of the TradeLine numbered card.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useInView, useReducedMotion } from "framer-motion";
import { Phone, MessageSquare } from "lucide-react";
import { mkt } from "@/theme/tokens";

type Bubble = { who: "them" | "us" | "system"; text: string };

const SCRIPT: Bubble[] = [
  { who: "them", text: "Hi! Looking for an emergency plumber. Burst pipe under the sink." },
  { who: "us",   text: "Sorry to hear that — I can dispatch someone within 60 minutes. Can I grab your zip code and a number to text the ETA?" },
  { who: "them", text: "78704. (512) 555-0119" },
  { who: "us",   text: "Got it. Estimated $185–$240 for emergency call-out plus parts. Tap to confirm and we'll send a tech." },
  { who: "system", text: "✓ Booked — Tech ETA 41 min" },
];

const STEP_MS = 1700; // bubble appears every 1.7s
const RESET_MS = 3000; // pause before restart

export default function TradeLineChatDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15%" });
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);          // index of last-revealed bubble
  const [hovering, setHovering] = useState(false);
  const isMobile = useIsMobile();

  // Render the final frame statically on mobile or with reduced-motion
  const showAll = reduced || isMobile;
  const visible = showAll ? SCRIPT : SCRIPT.slice(0, step + 1);

  // Loop: advance step every STEP_MS while in-view + not hovering, restart after pause
  useEffect(() => {
    if (showAll) { setStep(SCRIPT.length - 1); return; }
    if (!inView || hovering) return;

    if (step < SCRIPT.length - 1) {
      const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
      return () => clearTimeout(t);
    }
    // Reached the end → wait, then reset to start
    const t = setTimeout(() => setStep(0), RESET_MS);
    return () => clearTimeout(t);
  }, [step, inView, hovering, showAll]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Animated demo: a customer texts about a burst pipe, the AI quotes the job and books a technician within 41 minutes."
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{ position: "relative", width: "100%", maxWidth: 420, margin: "0 auto" }}
    >
      {/* Glow */}
      <div style={{
        position: "absolute", inset: -40,
        background: "radial-gradient(ellipse, rgba(13,60,252,0.12) 0%, transparent 60%)",
        pointerEvents: "none", filter: "blur(40px)",
      }} />

      <div style={{
        position: "relative",
        background: mkt.dark, borderRadius: 20, border: `1px solid ${mkt.onDarkBorder}`,
        overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${mkt.onDarkBorder}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${mkt.accent}, ${mkt.accentDark})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Phone size={16} color={mkt.dark} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: mkt.onDark }}>TradeLine</div>
            <div style={{ fontSize: 11, color: mkt.success, display: "flex", alignItems: "center", gap: 4 }}>
              <PulsingDot />
              Live
            </div>
          </div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: mkt.onDarkFaint }}>2:47 AM</div>
        </div>

        {/* Bubble stack */}
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, minHeight: 380 }}>
          <AnimatePresence initial={false}>
            {visible.map((b, i) => (
              <motion.div
                key={i}
                initial={showAll ? false : { opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                {b.who === "system" ? <SystemPill text={b.text} /> : <ChatBubble who={b.who} text={b.text} />}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator while next bubble is incoming (not when complete) */}
          {!showAll && step < SCRIPT.length - 1 && step >= 0 && (
            <TypingDots align={SCRIPT[step + 1].who === "us" ? "left" : "right"} />
          )}

          {/* Footer summary — appears after final frame */}
          {(showAll || step === SCRIPT.length - 1) && (
            <motion.div
              initial={showAll ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              style={{ marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${mkt.onDarkBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              <div style={{ fontSize: 11, color: mkt.onDarkFaint, fontFamily: "monospace" }}>2:47 AM • Auto-handled</div>
              <div style={{ fontSize: 11, color: mkt.accent, fontWeight: 600 }}>+$185 captured</div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ who, text }: { who: "us" | "them"; text: string }) {
  const isUs = who === "us";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexDirection: isUs ? "row-reverse" : "row" }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%",
        background: isUs ? mkt.accent : "rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {isUs ? <Phone size={11} color={mkt.dark} /> : <MessageSquare size={11} color={mkt.onDarkMuted} />}
      </div>
      <div style={{
        maxWidth: "78%",
        padding: "10px 14px",
        borderRadius: 14,
        background: isUs ? "rgba(13,60,252,0.10)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${isUs ? "rgba(13,60,252,0.18)" : mkt.onDarkBorder}`,
        fontSize: 13, lineHeight: 1.5, color: mkt.onDark,
      }}>
        {text}
      </div>
    </div>
  );
}

function SystemPill({ text }: { text: string }) {
  return (
    <div style={{
      margin: "8px 0 0 36px",
      padding: "10px 14px",
      borderRadius: 10,
      background: mkt.accent, color: "#FFFFFF",
      fontSize: 13, fontWeight: 600,
      display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
      boxShadow: "0 4px 16px rgba(13,60,252,0.25)",
    }}>
      {text}
    </div>
  );
}

function TypingDots({ align }: { align: "left" | "right" }) {
  return (
    <div style={{ display: "flex", justifyContent: align === "right" ? "flex-end" : "flex-start", padding: "0 4px" }}>
      <div style={{
        display: "inline-flex", gap: 4, padding: "8px 12px",
        background: "rgba(255,255,255,0.04)", border: `1px solid ${mkt.onDarkBorder}`,
        borderRadius: 14,
      }}>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            style={{ width: 5, height: 5, borderRadius: "50%", background: mkt.onDarkFaint, display: "inline-block" }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.0, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
          />
        ))}
      </div>
    </div>
  );
}

function PulsingDot() {
  return (
    <motion.span
      style={{ width: 6, height: 6, borderRadius: "50%", background: mkt.success, display: "inline-block" }}
      animate={{ opacity: [1, 0.4, 1] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < 640 : false);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 640);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
}
