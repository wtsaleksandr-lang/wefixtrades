/**
 * PoolServiceHeroAnimation — green pool → cleaner runs → blue pool → recurring schedule.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Calendar } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const COLORS = ["#15803D", "#0891B2", "#0EA5E9"];

export default function PoolServiceHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Green pool cleans up to clear blue with recurring weekly schedule">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For pool service · weekly recurring</span>

          {/* Pool */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 110,
              background: "#1F2937",
              border: `1px solid ${mkt.onDarkBorder}`,
              padding: 14,
            }}
          >
            <motion.div
              animate={{ background: COLORS[phase] }}
              transition={{ duration: 0.8 }}
              style={{
                position: "absolute",
                inset: 14,
                borderRadius: 8,
                boxShadow: "inset 0 4px 12px rgba(0,0,0,0.4)",
              }}
            />
            {/* Ripples */}
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 200 82"
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 14, opacity: phase === 2 ? 0.4 : 0.15 }}
            >
              <path d="M0 30 Q50 24 100 30 T200 30" stroke="#FFFFFF" strokeWidth="1" fill="none" />
              <path d="M0 56 Q50 60 100 56 T200 56" stroke="#FFFFFF" strokeWidth="1" fill="none" />
            </svg>
            {/* Cleaner robot in phase 1 */}
            {phase === 1 && (
              <motion.div
                animate={{ x: [10, 130, 10] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                style={{
                  position: "absolute",
                  bottom: 22,
                  left: 14,
                  width: 26,
                  height: 14,
                  background: "#FCD34D",
                  borderRadius: 3,
                }}
              />
            )}
          </div>

          {/* Recurring schedule */}
          <div style={cardStyle}>
            <div style={{ ...monoLabel, marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Calendar size={12} /> Weekly recurring
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["Mon", "Mon", "Mon", "Mon"].map((d, i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: phase === 2 ? 1 : 0.3 }}
                  transition={{ delay: i * 0.1 }}
                  style={{
                    flex: 1,
                    padding: "6px 4px",
                    background: "rgba(16,185,129,0.18)",
                    border: "1px solid rgba(16,185,129,0.45)",
                    borderRadius: 6,
                    fontFamily: MONO,
                    fontSize: 9,
                    color: "#10B981",
                    textAlign: "center",
                  }}
                >
                  {d} ✓
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
