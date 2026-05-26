/**
 * FoundationRepairHeroAnimation — cracked foundation → "near me" search → top-3 result.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { MapPin, AlertTriangle } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function FoundationRepairHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Cracked foundation, MapGuard finds nearby experts, your business is top-3">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For foundation repair · urgent</span>

          {/* Cracked foundation */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 90,
              background: "linear-gradient(180deg, #6B7280 0%, #374151 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 90">
              {/* Foundation block */}
              <rect x="0" y="20" width="200" height="60" fill="#4B5563" />
              {/* Crack */}
              <motion.path
                animate={phase === 0 ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }}
                transition={{ duration: 1.4, repeat: phase === 0 ? Infinity : 0 }}
                d="M100 20 L96 36 L104 50 L98 66 L102 80"
                stroke="#1F2937"
                strokeWidth="2.5"
                fill="none"
              />
            </svg>
            <motion.div
              animate={phase === 0 ? { opacity: [1, 0.5, 1] } : { opacity: 1 }}
              transition={{ duration: 1, repeat: phase === 0 ? Infinity : 0 }}
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(239,68,68,0.85)",
                padding: "3px 8px",
                borderRadius: 999,
                fontFamily: MONO,
                fontSize: 10,
                color: mkt.onDark,
                fontWeight: 700,
              }}
            >
              <AlertTriangle size={12} /> Active settlement
            </motion.div>
          </div>

          {/* MapGuard search results */}
          <div style={{ ...cardStyle, padding: "10px 12px" }}>
            <div style={{ ...monoLabel, marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <MapPin size={12} /> "foundation repair near me"
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { rank: "1", name: "Your Foundation Co.", you: true, show: phase >= 1 },
                { rank: "2", name: "PierTech Solutions", you: false, show: phase >= 2 },
                { rank: "3", name: "Slab Savers LLC", you: false, show: phase >= 2 },
              ].map((row) => (
                <motion.div
                  key={row.rank}
                  animate={{ opacity: row.show ? 1 : 0.2 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    padding: "4px 6px",
                    borderRadius: 6,
                    background: row.you ? "rgba(13,60,252,0.18)" : "transparent",
                    color: row.you ? mkt.onDark : mkt.onDarkMuted,
                    fontWeight: row.you ? 700 : 400,
                  }}
                >
                  <span style={{ fontFamily: MONO, color: mkt.accent }}>#{row.rank}</span>
                  {row.name}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
