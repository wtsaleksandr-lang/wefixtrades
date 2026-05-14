/**
 * ContentFlowDemo — blog post drafts itself ChatGPT-style.
 * Title types in, then paragraph streams, then "Published" + auto-distribute.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { PenTool, Send, Check } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useDemoLoop, DemoFrame, DemoHeader } from "./_shared";

const TITLE = "Why Your Hot Water Keeps Running Cold (And How To Fix It)";
const BODY = "Most homeowners blame the heater first — but in 7 out of 10 cases, the real culprit is a stuck thermostatic mixing valve. Here's what to check before you call a plumber.";

export default function ContentFlowDemo() {
  const loop = useDemoLoop({ steps: 4, stepMs: 2400 });

  // Step 0: typing title
  // Step 1: typing body
  // Step 2: published to site
  // Step 3: distributed to channels
  const titleChars = useTypewriter(TITLE, loop.step >= 0 && loop.inView ? 40 : 0, loop.isStatic);
  const bodyChars = useTypewriter(BODY, loop.step >= 1 && loop.inView ? 18 : 0, loop.isStatic);
  // For static frame, show full content
  const showTitle = loop.isStatic ? TITLE : titleChars;
  const showBody = loop.isStatic || loop.step >= 1 ? (loop.isStatic ? BODY : bodyChars) : "";

  return (
    <DemoFrame
      ref={loop.ref}
      onMouseEnter={loop.onMouseEnter}
      onMouseLeave={loop.onMouseLeave}
      ariaLabel="Animated demo: a blog post drafts itself in real time, then publishes and auto-distributes to multiple channels."
      maxWidth={420}
    >
      <DemoHeader icon={<PenTool size={16} />} title="ContentFlow" subtitle="Drafting article…" status={loop.step >= 2 ? "Published" : "Drafting"} />
      <div style={{ padding: 20, minHeight: 320, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{
          padding: "14px 16px", borderRadius: 12,
          background: "rgba(255,255,255,0.03)", border: `1px solid ${mkt.onDarkBorder}`,
        }}>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
            Article draft
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.01em", marginBottom: 10, lineHeight: 1.3, minHeight: 36 }}>
            {showTitle}
            {!loop.isStatic && loop.step === 0 && titleChars.length < TITLE.length && <Cursor />}
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.55, color: mkt.onDarkMuted, minHeight: 50 }}>
            {showBody}
            {!loop.isStatic && loop.step === 1 && bodyChars.length < BODY.length && <Cursor />}
          </p>
        </div>

        {/* Published to site */}
        <AnimatePresence>
          {loop.step >= 2 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(16,185,129,0.10)", border: `1px solid rgba(16,185,129,0.28)`, fontSize: 12, color: "#10B981", fontWeight: 600 }}>
              <Check size={14} strokeWidth={3} /> Published to your-trade.com/blog
            </motion.div>
          )}
        </AnimatePresence>

        {/* Distribute to channels */}
        <AnimatePresence>
          {loop.step >= 3 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(13,60,252,0.10)", border: `1px solid rgba(13,60,252,0.24)`, fontSize: 12, color: mkt.accent, fontWeight: 600 }}>
              <Send size={14} /> Distributing to FB · IG · LinkedIn · GBP
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DemoFrame>
  );
}

function Cursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.8, repeat: Infinity }}
      style={{ display: "inline-block", width: 2, height: "1em", background: mkt.accent, marginLeft: 2, verticalAlign: "middle" }}
    />
  );
}

function useTypewriter(text: string, speedMs: number, immediate: boolean): string {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (immediate) { setOut(text); return; }
    if (speedMs <= 0) { setOut(""); return; }
    setOut("");
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(iv);
    }, speedMs);
    return () => clearInterval(iv);
  }, [text, speedMs, immediate]);
  return out;
}
