/**
 * ConcreteHeroAnimation — rough surface → trowel smooths → finished slab + quote.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Square } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function ConcreteHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 2000, inView && !reduced);
  const phase = reduced ? 2 : beat;
  const smoothPct = phase === 0 ? 0 : phase === 1 ? 0.55 : 1;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Rough concrete is troweled smooth, finished slab with quote and pour date">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For concrete · pour to finish</span>

          {/* Slab */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 100,
              background: "#3F3F46",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            {/* Rough texture stipple */}
            <svg width="100%" height="100%" viewBox="0 0 200 100" style={{ position: "absolute", inset: 0 }}>
              {Array.from({ length: 80 }).map((_, i) => (
                <circle
                  key={i}
                  cx={(i * 17) % 200}
                  cy={(i * 23) % 100}
                  r={1.4}
                  fill="rgba(0,0,0,0.45)"
                />
              ))}
            </svg>
            {/* Smooth overlay sliding in */}
            <motion.div
              animate={{ width: `${smoothPct * 100}%` }}
              transition={{ duration: 0.7 }}
              style={{
                position: "absolute",
                inset: 0,
                width: `${smoothPct * 100}%`,
                background: "linear-gradient(180deg, #9CA3AF 0%, #6B7280 100%)",
              }}
            />
            {/* Trowel marker */}
            <motion.div
              animate={{ left: `${smoothPct * 100}%` }}
              transition={{ duration: 0.7 }}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                width: 3,
                background: "#FCD34D",
                boxShadow: "0 0 8px rgba(252,211,77,0.6)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 6,
                right: 8,
                fontFamily: MONO,
                fontSize: 10,
                color: mkt.onDark,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Square size={12} /> 320 sq ft
            </div>
          </div>

          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.14)",
              border: `1px solid ${phase === 2 ? "rgba(16,185,129,0.5)" : mkt.onDarkBorder}`,
              textAlign: "center",
            }}
          >
            <div style={{ ...monoLabel, color: mkt.onDarkMuted, marginBottom: 4 }}>Driveway pour</div>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: mkt.onDark }}>
              $3,840 · pour Mon
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
