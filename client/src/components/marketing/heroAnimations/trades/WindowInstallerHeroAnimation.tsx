/**
 * WindowInstallerHeroAnimation — old single-pane → new double-pane swap → energy efficiency badge.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Zap } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function WindowInstallerHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Old single-pane window replaced with double-pane, energy efficiency badge awarded">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For window installers · upgrade swap</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 130,
              background: "#0f172a",
              border: `1px solid ${mkt.onDarkBorder}`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {/* Window frame */}
            <div
              style={{
                position: "relative",
                width: 130,
                height: 100,
                background: "#1F2937",
                border: `6px solid ${phase < 2 ? "#5C2208" : "#FFFFFF"}`,
                borderRadius: 4,
                transition: "border-color 0.5s ease",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gridTemplateRows: "1fr 1fr",
                gap: 4,
                padding: 4,
              }}
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{
                    background:
                      phase === 0
                        ? "rgba(100,116,139,0.4)"
                        : phase === 1
                        ? "rgba(96,165,250,0.5)"
                        : "rgba(56,189,248,0.7)",
                  }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  style={{
                    borderRadius: 2,
                  }}
                />
              ))}
            </div>
          </div>

          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.16)",
              border: "1px solid rgba(16,185,129,0.5)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Zap size={14} color="#FCD34D" />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>
              ENERGY STAR · 8 windows · $5,200
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
