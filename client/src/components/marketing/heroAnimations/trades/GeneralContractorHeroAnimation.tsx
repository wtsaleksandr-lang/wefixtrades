/**
 * GeneralContractorHeroAnimation — multi-trade Gantt → AI insights → pipeline forecast.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Sparkles } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const ROWS = [
  { trade: "Framing", color: mkt.accent, start: 0, len: 30 },
  { trade: "Electrical", color: "#F59E0B", start: 22, len: 24 },
  { trade: "Plumbing", color: "#10B981", start: 28, len: 22 },
  { trade: "Drywall", color: "#A855F7", start: 46, len: 20 },
];

export default function GeneralContractorHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 2000, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Multi-trade project Gantt chart with AI-driven pipeline forecast">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For GCs · pipeline view</span>

          <div style={{ ...cardStyle, padding: "10px 12px" }}>
            <div style={{ ...monoLabel, marginBottom: 8 }}>Project · 8 weeks</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {ROWS.map((row, i) => {
                const widthPct = (row.len / 70) * 100;
                const leftPct = (row.start / 70) * 100;
                return (
                  <div key={row.trade} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div
                      style={{
                        width: 64,
                        fontFamily: MONO,
                        fontSize: 9,
                        color: mkt.onDarkMuted,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {row.trade}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        height: 12,
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: 4,
                        position: "relative",
                      }}
                    >
                      <motion.div
                        initial={false}
                        animate={{ width: phase >= i ? `${widthPct}%` : "0%" }}
                        transition={{ duration: 0.5, delay: i * 0.1 }}
                        style={{
                          position: "absolute",
                          left: `${leftPct}%`,
                          height: "100%",
                          background: row.color,
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.4 }}
            style={{
              ...cardStyle,
              background: "rgba(13,60,252,0.12)",
              border: `1px solid ${mkt.accent}`,
            }}
          >
            <div
              style={{
                ...monoLabel,
                color: mkt.accent,
                marginBottom: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Sparkles size={12} /> AI insight
            </div>
            <div style={{ fontSize: 12, color: mkt.onDark, lineHeight: 1.4 }}>
              Closing rate <strong>38%</strong> · forecast <strong>+$120k</strong> this quarter
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
