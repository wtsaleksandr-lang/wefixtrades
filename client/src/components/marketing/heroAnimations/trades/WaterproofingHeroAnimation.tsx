/**
 * WaterproofingHeroAnimation — basement with seeping water → membrane applied → dry interior.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function WaterproofingHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 2000, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Basement wall with seeping water, waterproof membrane applied, interior is now dry">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For waterproofing · basement seal</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 120,
              background: "#1F2937",
              border: `1px solid ${mkt.onDarkBorder}`,
              display: "flex",
            }}
          >
            {/* Outside ground with water */}
            <div
              style={{
                flex: 1,
                background: "linear-gradient(180deg, #92400E 0%, #5C2208 60%, #1e3a8a 100%)",
                position: "relative",
              }}
            >
              {/* Water drops */}
              {phase === 0 &&
                Array.from({ length: 3 }).map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ y: [0, 60], opacity: [1, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.4 }}
                    style={{
                      position: "absolute",
                      left: 18 + i * 22,
                      top: 12,
                      width: 4,
                      height: 8,
                      borderRadius: 2,
                      background: "#60A5FA",
                    }}
                  />
                ))}
            </div>
            {/* Foundation wall */}
            <div
              style={{
                width: 28,
                background: "#4B5563",
                borderLeft: "1px solid #6B7280",
                borderRight: "1px solid #6B7280",
                position: "relative",
              }}
            >
              {/* Membrane overlay */}
              <motion.div
                initial={false}
                animate={{ opacity: phase >= 1 ? 1 : 0 }}
                transition={{ duration: 0.6 }}
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "repeating-linear-gradient(45deg, #1e3a8a 0 6px, #1e40af 6px 12px)",
                  borderLeft: "2px solid #FCD34D",
                }}
              />
            </div>
            {/* Interior */}
            <div
              style={{
                flex: 1,
                background: phase < 2
                  ? "linear-gradient(180deg, #374151 0%, #1F2937 100%)"
                  : "linear-gradient(180deg, #F3F4F6 0%, #D1D5DB 100%)",
                transition: "background 0.6s ease",
                position: "relative",
              }}
            >
              {/* Water seepage inside (phase 0) */}
              {phase === 0 && (
                <motion.div
                  animate={{ height: [4, 12] }}
                  transition={{ duration: 1.4, repeat: Infinity, repeatType: "reverse" }}
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "rgba(96,165,250,0.5)",
                  }}
                />
              )}
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
            <ShieldCheck size={16} color="#10B981" />
            <div style={{ fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>
              Sealed · 25-yr warranty · $6,400
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
