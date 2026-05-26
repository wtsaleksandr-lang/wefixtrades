/**
 * WellWaterHeroAnimation — dry tap → drill icon → water flows → service complete.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Droplet, Check } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function WellWaterHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Dry tap, well pump diagnosed and restored, water flows again with service complete">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For well water · pump + restore</span>

          {/* Tap with flow */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 120,
              background: "linear-gradient(180deg, #1F2937 0%, #0f172a 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 120">
              {/* Tap pipe */}
              <rect x="80" y="20" width="8" height="40" fill="#9CA3AF" />
              <rect x="76" y="58" width="16" height="6" fill="#9CA3AF" />
              {/* Water stream */}
              {phase === 2 && (
                <motion.rect
                  animate={{ height: [0, 50] }}
                  transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
                  x="82"
                  y="64"
                  width="4"
                  fill="#60A5FA"
                />
              )}
              {/* Bucket / catch basin */}
              <path d="M60 110 L80 80 L108 80 L128 110 Z" fill="#374151" stroke="#9CA3AF" strokeWidth="1.5" />
              {/* Water in bucket */}
              <motion.rect
                initial={false}
                animate={{ height: phase === 2 ? 22 : phase === 1 ? 6 : 0 }}
                transition={{ duration: 0.5 }}
                x={62}
                y={(phase === 2 ? 88 : phase === 1 ? 104 : 110)}
                width={66}
                fill="rgba(96,165,250,0.7)"
              />
              {/* Drill spinning in phase 1 */}
              {phase === 1 && (
                <motion.g
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
                  style={{ transformOrigin: "150px 70px" }}
                >
                  <circle cx="150" cy="70" r="14" fill="#FCD34D" />
                  <rect x="146" y="56" width="8" height="28" fill="#92400E" />
                </motion.g>
              )}
            </svg>
            <div
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                fontFamily: MONO,
                fontSize: 10,
                color: mkt.onDarkFaint,
              }}
            >
              {phase === 0 ? "Dry · pump failure" : phase === 1 ? "Diagnosing pressure tank" : "Pressure restored · 60 psi"}
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
            <Droplet size={14} color="#60A5FA" />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>
              Pump swap · same day · $1,240
            </div>
            <Check size={14} color="#10B981" />
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
