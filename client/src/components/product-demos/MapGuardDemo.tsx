/**
 * MapGuardDemo — animated map with status pins flipping from "?" to ✓.
 *
 * Each step: another pin gets fixed. Counter ticks: "12 issues found → 8 fixed".
 */

import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Check, AlertTriangle } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useDemoLoop, DemoFrame, DemoHeader } from "./_shared";

const PINS = [
  { x: 28, y: 32, label: "Hours mismatch" },
  { x: 58, y: 28, label: "Missing photos" },
  { x: 42, y: 56, label: "Wrong category" },
  { x: 72, y: 64, label: "Profile suspended" },
];

export default function MapGuardDemo() {
  const loop = useDemoLoop({ steps: PINS.length + 2, stepMs: 1200 });
  const fixedCount = Math.max(0, loop.step - 1);
  const totalIssues = PINS.length;

  return (
    <DemoFrame
      ref={loop.ref}
      onMouseEnter={loop.onMouseEnter}
      onMouseLeave={loop.onMouseLeave}
      ariaLabel="Animated demo: an interactive map detects issues with a Google Business Profile and resolves them one by one."
      maxWidth={400}
      data-theme="light"
    >
      <DemoHeader
        icon={<MapPin size={16} />}
        title="MapGuard"
        subtitle="Profile health · scanning"
        status="Live"
      />
      <div style={{ position: "relative", height: 280, background: "linear-gradient(180deg, #1a2a2e 0%, #0f1d20 100%)" }}>
        {/* Grid */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.18 }}>
          <defs>
            <pattern id="mg-grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#0d3cfc" strokeWidth="0.2" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#mg-grid)" />
        </svg>
        {/* Roads */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <path d="M0,40 Q30,38 60,45 T100,42" fill="none" stroke="rgba(13,60,252,0.18)" strokeWidth="0.6" />
          <path d="M0,70 Q40,66 70,72 T100,68" fill="none" stroke="rgba(13,60,252,0.18)" strokeWidth="0.6" />
          <path d="M50,0 Q52,40 48,100" fill="none" stroke="rgba(13,60,252,0.18)" strokeWidth="0.6" />
        </svg>
        {/* Pins */}
        {PINS.map((p, i) => {
          const fixed = loop.step >= i + 1;
          return (
            <motion.div
              key={i}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.15, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
                transform: "translate(-50%, -50%)",
                width: 32, height: 32, borderRadius: "50%",
                background: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: fixed ? "0 0 18px rgba(16,185,129,0.5)" : "0 0 18px rgba(245,158,11,0.45)",
                transition: "box-shadow 0.5s ease",
              }}
            >
              <motion.div
                animate={{ background: fixed ? "#10B981" : "#F59E0B" }}
                transition={{ duration: 0.4 }}
                style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}
              >
                {fixed ? <Check size={12} strokeWidth={3} /> : <AlertTriangle size={12} strokeWidth={2.5} />}
              </motion.div>
            </motion.div>
          );
        })}
      </div>
      {/* Stats footer */}
      <div style={{ padding: "14px 20px", borderTop: `1px solid ${mkt.onDarkBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>Issues</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: mkt.onDark, fontVariantNumeric: "tabular-nums" }}>
            {totalIssues - fixedCount} <span style={{ fontSize: 12, color: mkt.onDarkFaint, fontWeight: 500 }}>open</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>Fixed</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={fixedCount}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              style={{ fontSize: 18, fontWeight: 700, color: "#10B981", fontVariantNumeric: "tabular-nums" }}
            >
              {fixedCount}
            </motion.div>
          </AnimatePresence>
        </div>
        <div>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>Score</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: mkt.accent, fontVariantNumeric: "tabular-nums" }}>
            {Math.min(62 + fixedCount * 7, 89)}
          </div>
        </div>
      </div>
    </DemoFrame>
  );
}
