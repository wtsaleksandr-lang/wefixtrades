/**
 * MasonryHeroAnimation — bricks stack one by one → wall complete → 5-star review.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Star } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const BRICKS = Array.from({ length: 16 }).map((_, i) => ({
  row: Math.floor(i / 4),
  col: i % 4,
}));

export default function MasonryHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(BRICKS.length + 2, 220, inView && !reduced);
  const phase = reduced ? BRICKS.length + 1 : beat;
  const placed = Math.min(phase, BRICKS.length);

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Bricks stack one by one until wall is complete, 5-star review appears">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For masonry · brick by brick</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 130,
              background: "#1F2937",
              border: `1px solid ${mkt.onDarkBorder}`,
              padding: 8,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 114" preserveAspectRatio="none">
              {BRICKS.map((b, i) => {
                const offsetX = b.row % 2 === 1 ? 22 : 0;
                const x = 4 + b.col * 44 + offsetX;
                const y = 88 - b.row * 22;
                const visible = i < placed;
                return (
                  <motion.rect
                    key={i}
                    initial={false}
                    animate={{ opacity: visible ? 1 : 0, y: visible ? y : y - 6 }}
                    transition={{ duration: 0.25 }}
                    x={x}
                    width={40}
                    height={18}
                    fill="#B91C1C"
                    stroke="#7F1D1D"
                    strokeWidth={1}
                    rx={1}
                  />
                );
              })}
            </svg>
          </div>

          <motion.div
            animate={{ opacity: phase > BRICKS.length ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.16)",
              border: "1px solid rgba(16,185,129,0.5)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", gap: 2 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={12} color="#FCD34D" fill="#FCD34D" />
              ))}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>
              "Tuckpointing held perfectly"
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
