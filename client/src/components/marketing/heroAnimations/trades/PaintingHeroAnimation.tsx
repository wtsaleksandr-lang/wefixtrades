/**
 * PaintingHeroAnimation — empty room → QuoteQuick fills → painted preview.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { PaintBucket } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const COLORS = ["#FFFFFF", "#0d3cfc", "#10B981"];

export default function PaintingHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;
  const colorIdx = phase;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Empty room walls swatching through colors as QuoteQuick form auto-fills and prices update">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For painters · interior estimate</span>

          {/* Room preview */}
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              height: 130,
              position: "relative",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <motion.div
              animate={{ background: COLORS[colorIdx] }}
              transition={{ duration: 0.6 }}
              style={{ position: "absolute", inset: 0 }}
            />
            {/* "Walls" — diagonal lines for perspective */}
            <svg width="100%" height="100%" viewBox="0 0 200 130" style={{ position: "absolute", inset: 0 }}>
              <polygon points="0,0 200,0 160,30 40,30" fill="rgba(0,0,0,0.18)" />
              <polygon points="0,0 0,130 40,100 40,30" fill="rgba(0,0,0,0.10)" />
              <polygon points="200,0 200,130 160,100 160,30" fill="rgba(0,0,0,0.10)" />
            </svg>
            <div
              style={{
                position: "absolute",
                bottom: 6,
                left: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: MONO,
                fontSize: 9,
                color: colorIdx === 0 ? "#1E1E1E" : "#FFFFFF",
                letterSpacing: "0.06em",
              }}
            >
              <PaintBucket size={12} /> {colorIdx === 0 ? "Empty" : colorIdx === 1 ? "Brand blue" : "Sage"}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ ...monoLabel, color: mkt.onDarkMuted }}>Interior · 18×12 ft</span>
              <span style={{ ...monoLabel, color: mkt.accent }}>2 coats</span>
            </div>
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: mkt.onDark }}
            >
              ${phase === 0 ? "640" : phase === 1 ? "820" : "1,140"}
            </motion.div>
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
