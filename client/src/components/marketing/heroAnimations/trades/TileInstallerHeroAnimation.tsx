/**
 * TileInstallerHeroAnimation — bathroom floor → tiles snap into grid → complete.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Grid2x2, Check } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const ROWS = 5;
const COLS = 6;
const TOTAL = ROWS * COLS;

export default function TileInstallerHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(TOTAL + 2, 90, inView && !reduced);
  const phase = reduced ? TOTAL + 1 : beat;
  const placed = Math.min(phase, TOTAL);

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Bathroom floor tiles snap into grid one by one until install is complete">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For tile · grid install</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 130,
              background: "#374151",
              border: `1px solid ${mkt.onDarkBorder}`,
              padding: 8,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                gridTemplateRows: `repeat(${ROWS}, 1fr)`,
                gap: 3,
                width: "100%",
                height: "100%",
              }}
            >
              {Array.from({ length: TOTAL }).map((_, i) => {
                const visible = i < placed;
                return (
                  <motion.div
                    key={i}
                    initial={false}
                    animate={{
                      opacity: visible ? 1 : 0.15,
                      scale: visible ? 1 : 0.86,
                    }}
                    transition={{ duration: 0.18 }}
                    style={{
                      background: visible
                        ? `linear-gradient(135deg, #E5E7EB 0%, #9CA3AF 100%)`
                        : "#1F2937",
                      borderRadius: 2,
                      border: visible ? "1px solid #4B5563" : "1px dashed #4B5563",
                    }}
                  />
                );
              })}
            </div>
          </div>

          <motion.div
            animate={{ opacity: phase > TOTAL ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.16)",
              border: "1px solid rgba(16,185,129,0.5)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Grid2x2 size={14} color="#10B981" />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>
              42 sq ft · porcelain · $1,260
            </div>
            <Check size={14} color="#10B981" />
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
