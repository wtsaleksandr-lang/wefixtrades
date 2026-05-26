/**
 * WebFixHeroAnimation — PageSpeed 32 → fixes check off → 94.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Check } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const FIXES = ["Compress images", "Minify CSS", "Lazy-load videos", "Defer JS"];

export default function WebFixHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(5, 1100, inView && !reduced);
  const phase = reduced ? 4 : beat;

  // Phase 0: score 32, phase 1-4: each fix checks off, score climbs
  const fixedCount = Math.max(0, phase);
  const score = phase === 0 ? 32 : phase === 1 ? 51 : phase === 2 ? 68 : phase === 3 ? 82 : 94;
  const scoreColor = score < 50 ? "#EF4444" : score < 90 ? "#F59E0B" : "#10B981";

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="PageSpeed score climbing from 32 to 94 as performance fixes check off">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>PageSpeed audit</span>
            <span style={{ ...monoLabel, color: mkt.accent }}>WebFix · live</span>
          </div>

          {/* Score dial */}
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: "50%",
                position: "relative",
                background: `conic-gradient(${scoreColor} 0% ${score}%, rgba(255,255,255,0.08) ${score}% 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 86,
                  height: 86,
                  borderRadius: "50%",
                  background: mkt.dark,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <motion.span
                  key={score}
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    fontFamily: MONO,
                    fontSize: 28,
                    fontWeight: 700,
                    color: scoreColor,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {score}
                </motion.span>
              </div>
            </div>
          </div>

          {/* Fix list */}
          <div style={{ ...cardStyle, padding: "10px 12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {FIXES.map((fix, i) => {
                const done = i < fixedCount;
                return (
                  <motion.div
                    key={fix}
                    initial={false}
                    animate={{ opacity: done ? 1 : 0.5 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      color: done ? "#10B981" : mkt.onDarkMuted,
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        border: `1px solid ${done ? "#10B981" : mkt.onDarkBorder}`,
                        background: done ? "rgba(16,185,129,0.18)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {done && <Check size={12} color="#10B981" />}
                    </span>
                    {fix}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
