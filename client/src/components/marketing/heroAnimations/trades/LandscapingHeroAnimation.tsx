/**
 * LandscapingHeroAnimation — before/after lawn → multi-tier quote.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function LandscapingHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 2000, inView && !reduced);
  const phase = reduced ? 2 : beat;
  const revealPct = phase === 0 ? 0 : phase === 1 ? 0.55 : 1;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Before and after lawn reveal, multi-tier landscaping quote">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For landscapers · mow → hardscape</span>

          {/* Before/after */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 120,
              background: "#8B6A3F",
            }}
          >
            {/* "After" layer (green) */}
            <motion.div
              animate={{ width: `${revealPct * 100}%` }}
              transition={{ duration: 0.7 }}
              style={{
                position: "absolute",
                inset: 0,
                width: `${revealPct * 100}%`,
                background: "linear-gradient(135deg, #10B981 0%, #047857 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 12px",
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ color: mkt.onDark }}>Before</span>
              <span style={{ color: mkt.onDark }}>After</span>
            </div>
            {/* Divider line */}
            <motion.div
              animate={{ left: `${revealPct * 100}%` }}
              transition={{ duration: 0.7 }}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                width: 2,
                background: mkt.onDark,
                boxShadow: "0 0 10px rgba(255,255,255,0.6)",
              }}
            />
          </div>

          <div style={cardStyle}>
            <div style={{ ...monoLabel, marginBottom: 8 }}>QuoteQuick · tier</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { tier: "Mow & edge", price: "$85", on: phase >= 0 },
                { tier: "Seasonal cleanup", price: "$420", on: phase >= 1 },
                { tier: "Hardscape build", price: "$8,400", on: phase >= 2 },
              ].map((row) => (
                <motion.div
                  key={row.tier}
                  animate={{ opacity: row.on ? 1 : 0.3 }}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    color: mkt.onDark,
                    padding: "3px 0",
                  }}
                >
                  <span>{row.tier}</span>
                  <span style={{ fontFamily: MONO, color: mkt.accent, fontWeight: 700 }}>{row.price}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
