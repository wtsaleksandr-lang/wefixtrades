/**
 * MapGuardHeroAnimation — 5x5 grid heatmap, pins shift red→green, rank ticks 8.2 → 3.1.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { AnimationFrame, chipStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const GRID = 5;
const TILES = Array.from({ length: GRID * GRID }, (_, i) => i);

export default function MapGuardHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1800, inView && !reduced);
  const phase = reduced ? 2 : beat;

  // beat 0: all red, beat 1: half green, beat 2: mostly green
  const greenCount = phase === 0 ? 2 : phase === 1 ? 12 : 22;
  const rank = phase === 0 ? "8.2" : phase === 1 ? "5.4" : "3.1";

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="MapGuard local-rank heatmap shifting from red to green; average rank climbs from 8.2 to 3.1">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>Local rank heatmap</span>
            <motion.span
              style={chipStyle}
              animate={phase === 2 ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              transition={{ duration: 0.6 }}
            >
              Top 3
            </motion.span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${GRID}, 1fr)`,
              gap: 6,
              padding: 12,
              borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            {TILES.map((i) => {
              const isGreen = i < greenCount;
              return (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{
                    background: isGreen ? "rgba(16,185,129,0.85)" : "rgba(239,68,68,0.75)",
                  }}
                  transition={{ duration: 0.5, delay: (i % 5) * 0.04 }}
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: 6,
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)",
                  }}
                />
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: 10,
              background: mkt.dark,
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <span style={{ ...monoLabel, color: mkt.onDarkMuted }}>Average rank</span>
            <motion.span
              key={rank}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: mkt.accent }}
            >
              {rank}
            </motion.span>
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
