/**
 * WebFixDemo — Lighthouse score gauge climbing 42 → 71 → 89 → 98.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Zap } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useDemoLoop, DemoFrame, DemoHeader } from "./_shared";

const STEPS = [
  { week: "Before", score: 42, issues: 23, color: "#EF4444" },
  { week: "Week 1", score: 71, issues: 11, color: "#F59E0B" },
  { week: "Week 2", score: 89, issues: 4, color: "#A3E635" },
  { week: "Week 4", score: 98, issues: 1, color: "#10B981" },
];

export default function WebFixDemo() {
  const loop = useDemoLoop({ steps: STEPS.length, stepMs: 1600 });
  const cur = STEPS[loop.step];
  const dash = (cur.score / 100) * 220;

  return (
    <DemoFrame
      ref={loop.ref}
      onMouseEnter={loop.onMouseEnter}
      onMouseLeave={loop.onMouseLeave}
      ariaLabel="Animated demo: a Lighthouse score gauge climbing from 42 to 98 as WebFix audits and fixes site issues."
      maxWidth={400}
    >
      <DemoHeader icon={<Zap size={16} />} title="WebFix" subtitle="your-trade.com · mobile" status={cur.week} />
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        {/* Big gauge */}
        <div style={{ position: "relative", width: 220, height: 130 }}>
          <svg width="220" height="140" viewBox="0 0 220 140">
            <path d="M 20 120 A 90 90 0 0 1 200 120" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" strokeLinecap="round" />
            <motion.path
              d="M 20 120 A 90 90 0 0 1 200 120"
              fill="none"
              stroke={cur.color}
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray="280"
              initial={{ strokeDashoffset: 280 }}
              animate={{ strokeDashoffset: 280 - (cur.score / 100) * 280 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 14 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={cur.score}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.32 }}
                style={{ fontSize: 56, fontWeight: 800, color: cur.color, letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}
              >
                {cur.score}
              </motion.div>
            </AnimatePresence>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>Performance</div>
          </div>
        </div>

        {/* Issues count */}
        <div style={{ display: "flex", justifyContent: "space-around", width: "100%", padding: "12px 0", borderTop: `1px solid ${mkt.onDarkBorder}`, marginTop: 4 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>Issues</div>
            <AnimatePresence mode="wait">
              <motion.div key={cur.issues} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ fontSize: 22, fontWeight: 700, color: cur.color, fontVariantNumeric: "tabular-nums" }}>
                {cur.issues}
              </motion.div>
            </AnimatePresence>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>LCP</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: mkt.onDark, fontVariantNumeric: "tabular-nums" }}>
              {(4.8 - loop.step * 1.0).toFixed(1)}s
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>CLS</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: mkt.onDark, fontVariantNumeric: "tabular-nums" }}>
              {(0.18 - loop.step * 0.05).toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}
