/**
 * SidingContractorHeroAnimation — old siding → new siding sweeps in → "near me" top-3.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { MapPin } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function SidingContractorHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;
  const sweepPct = phase === 0 ? 0 : phase === 1 ? 1 : 1;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Old faded siding replaced with new boards, your business ranks top-3 for 'siding near me'">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For siding · refresh + rank</span>

          {/* House facade */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 110,
              background: "#1F2937",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            {/* Old siding (full) */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "repeating-linear-gradient(180deg, #6B7280 0 8px, #4B5563 8px 16px)",
              }}
            />
            {/* New siding sweep */}
            <motion.div
              animate={{ width: `${sweepPct * 100}%` }}
              transition={{ duration: 0.8 }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                background:
                  "repeating-linear-gradient(180deg, #FFFFFF 0 8px, #E5E7EB 8px 16px)",
              }}
            />
            {/* Window */}
            <div
              style={{
                position: "absolute",
                top: 28,
                left: 80,
                width: 36,
                height: 30,
                background: "#0c4a6e",
                border: "2px solid #1F2937",
                borderRadius: 2,
              }}
            />
            {/* Door */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 30,
                width: 22,
                height: 40,
                background: "#7c2d12",
                borderRadius: "2px 2px 0 0",
              }}
            />
          </div>

          {/* Map listing */}
          <div style={{ ...cardStyle, padding: "10px 12px" }}>
            <div style={{ ...monoLabel, marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <MapPin size={12} /> "siding near me"
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { rank: "1", name: "Your Siding Co.", you: true },
                { rank: "2", name: "Vinyl Pros", you: false },
                { rank: "3", name: "FiberClad Exteriors", you: false },
              ].map((row, i) => (
                <motion.div
                  key={row.rank}
                  animate={{ opacity: phase >= 1 + Math.floor(i / 2) ? 1 : 0.25 }}
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
