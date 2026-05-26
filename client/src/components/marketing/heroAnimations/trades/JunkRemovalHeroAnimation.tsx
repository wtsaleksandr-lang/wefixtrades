/**
 * JunkRemovalHeroAnimation — cluttered yard → truck arrives → empty yard + 5-star review.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Star, Truck } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function JunkRemovalHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Cluttered yard with junk, truck arrives and crew clears it, empty yard with 5-star review">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For junk removal · haul + clean</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 120,
              background: "linear-gradient(180deg, #166534 0%, #14532D 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 120">
              {/* Ground */}
              <rect x="0" y="92" width="200" height="28" fill="#3F2A14" />
              {/* Junk pile (visible in phase 0-1) */}
              {phase < 2 && (
                <motion.g animate={{ opacity: phase === 1 ? [1, 0.3] : 1 }} transition={{ duration: 0.6 }}>
                  <rect x="30" y="64" width="14" height="14" fill="#7c2d12" />
                  <rect x="42" y="56" width="18" height="22" fill="#5C2208" />
                  <rect x="58" y="68" width="10" height="10" fill="#92400E" />
                  <circle cx="40" cy="56" r="6" fill="#374151" />
                  <rect x="22" y="72" width="12" height="6" fill="#4B5563" />
                </motion.g>
              )}
              {/* Truck */}
              <motion.g animate={{ x: phase === 0 ? -100 : phase === 1 ? 0 : 100 }} transition={{ duration: 0.7 }}>
                <rect x="100" y="56" width="46" height="32" fill="#0d3cfc" rx="2" />
                <rect x="146" y="64" width="16" height="24" fill="#1e3a8a" rx="2" />
                <rect x="148" y="68" width="12" height="10" fill="#60A5FA" />
                <circle cx="112" cy="92" r="5" fill="#1F2937" stroke="#9CA3AF" strokeWidth="1.5" />
                <circle cx="134" cy="92" r="5" fill="#1F2937" stroke="#9CA3AF" strokeWidth="1.5" />
                <circle cx="156" cy="92" r="5" fill="#1F2937" stroke="#9CA3AF" strokeWidth="1.5" />
                {/* Loaded items in phase 1 */}
                {phase === 1 && (
                  <>
                    <rect x="106" y="48" width="8" height="10" fill="#7c2d12" />
                    <rect x="116" y="44" width="10" height="14" fill="#5C2208" />
                  </>
                )}
              </motion.g>
            </svg>
            <div
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                fontFamily: MONO,
                fontSize: 10,
                color: mkt.onDark,
                background: "rgba(0,0,0,0.45)",
                padding: "2px 6px",
                borderRadius: 4,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Truck size={12} /> {phase === 0 ? "Cluttered" : phase === 1 ? "Loading…" : "Cleared ✓"}
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
              "Half-truck · $385 · gone by noon"
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
