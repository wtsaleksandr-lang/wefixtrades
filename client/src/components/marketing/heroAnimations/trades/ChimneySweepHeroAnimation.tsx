/**
 * ChimneySweepHeroAnimation — smoke + soot → MapGuard pin "near me" → top-3 listing.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { MapPin, Flame } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function ChimneySweepHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Smoke rising from chimney, MapGuard finds nearby sweeps, your business is top-3">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For chimney sweeps · pre-season demand</span>

          {/* Chimney with smoke */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 100,
              background: "linear-gradient(180deg, #475569 0%, #1e293b 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 100">
              {/* House roof */}
              <polygon points="40,90 100,55 160,90" fill="#7c2d12" />
              {/* Chimney */}
              <rect x="120" y="40" width="18" height="28" fill="#9a3412" />
              {/* Smoke puffs */}
              <motion.circle
                animate={phase === 0 ? { cy: [38, 14], opacity: [0.5, 0] } : { opacity: 0 }}
                transition={{ duration: 1.4, repeat: phase === 0 ? Infinity : 0 }}
                cx="129"
                r="6"
                fill="#9CA3AF"
              />
              <motion.circle
                animate={phase === 0 ? { cy: [38, 8], opacity: [0.4, 0] } : { opacity: 0 }}
                transition={{ duration: 1.6, repeat: phase === 0 ? Infinity : 0, delay: 0.6 }}
                cx="125"
                r="8"
                fill="#6B7280"
              />
            </svg>
            <div
              style={{
                position: "absolute",
                bottom: 6,
                left: 8,
                fontFamily: MONO,
                fontSize: 10,
                color: mkt.onDarkFaint,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Flame size={12} /> "chimney sweep near me"
            </div>
          </div>

          {/* Map listing */}
          <div style={{ ...cardStyle, padding: "10px 12px" }}>
            <div style={{ ...monoLabel, marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <MapPin size={12} /> Local results
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { rank: "1", name: "Your Chimney Co.", you: true },
                { rank: "2", name: "Hearth & Flue", you: false },
                { rank: "3", name: "Soot Brothers", you: false },
              ].map((row, i) => (
                <motion.div
                  key={row.rank}
                  animate={{ opacity: phase >= 1 ? 1 : 0.3 }}
                  transition={{ delay: i * 0.05 }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    padding: "4px 6px",
                    borderRadius: 6,
                    background: row.you && phase === 2 ? "rgba(13,60,252,0.18)" : "transparent",
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
