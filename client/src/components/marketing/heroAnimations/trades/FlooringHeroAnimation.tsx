/**
 * FlooringHeroAnimation — bare subfloor → planks lay down row-by-row → finished room.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Check } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const ROWS = 6;

export default function FlooringHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(ROWS + 1, 700, inView && !reduced);
  const phase = reduced ? ROWS : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Bare subfloor fills row-by-row with hardwood planks until room is finished">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For flooring · LVP install</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 130,
              background: "#1F2937",
              border: `1px solid ${mkt.onDarkBorder}`,
              padding: 6,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {Array.from({ length: ROWS }).map((_, i) => {
              const laid = i < phase;
              return (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{ opacity: laid ? 1 : 0.15 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    flex: 1,
                    background: laid
                      ? `linear-gradient(90deg, #B98448 0%, #C99458 ${20 + (i % 3) * 20}%, #A57438 100%)`
                      : "#374151",
                    borderRadius: 2,
                    border: laid ? "1px solid #6B4A22" : "1px dashed #4B5563",
                  }}
                />
              );
            })}
          </div>

          <motion.div
            animate={{ opacity: phase >= ROWS ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.16)",
              border: "1px solid rgba(16,185,129,0.5)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Check size={16} color="#10B981" />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>
              480 sq ft · $4,320 · 2 days
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
