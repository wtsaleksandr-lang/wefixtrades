/**
 * WaterDamageRestorationHeroAnimation — flooded floor → fans dry → 5-star review.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Wind, Star } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function WaterDamageRestorationHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 2000, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Flooded floor, drying fans deployed, room restored with 5-star review">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For water restoration · dry + restore</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 110,
              background: "#E5E7EB",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            {/* Water layer */}
            <motion.div
              initial={false}
              animate={{ height: phase === 0 ? 60 : phase === 1 ? 28 : 0 }}
              transition={{ duration: 0.8 }}
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "linear-gradient(180deg, rgba(96,165,250,0.7) 0%, rgba(30,64,175,0.85) 100%)",
              }}
            />
            {/* Fans in phase 1 */}
            {phase === 1 && (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  style={{
                    position: "absolute",
                    bottom: 36,
                    left: 30,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "3px solid #FCD34D",
                    borderTopColor: "transparent",
                  }}
                />
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                  style={{
                    position: "absolute",
                    bottom: 36,
                    right: 30,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "3px solid #FCD34D",
                    borderTopColor: "transparent",
                  }}
                />
              </>
            )}
            <div
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                fontFamily: MONO,
                fontSize: 10,
                color: "#1F2937",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Wind size={12} /> {phase === 0 ? "Flooded · Cat 2" : phase === 1 ? "Drying · 48 hr" : "Restored · sealed"}
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
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 2 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={12} color="#FCD34D" fill="#FCD34D" />
              ))}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: mkt.onDark }}>
              "Insurance handled, dry by Friday"
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
