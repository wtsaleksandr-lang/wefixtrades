/**
 * TreeServiceHeroAnimation — tall tree → AI prune outline → cleaned canopy + booked.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Calendar } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function TreeServiceHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Overgrown tree, AI marks pruning area, cleaned canopy with service booked">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For tree service · prune + remove</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 130,
              background: "linear-gradient(180deg, #0c4a6e 0%, #166534 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 130">
              {/* Tree trunk */}
              <rect x="94" y="80" width="12" height="40" fill="#5C3A18" />
              {/* Canopy (changes by phase) */}
              <motion.ellipse
                initial={false}
                animate={{ rx: phase === 0 ? 60 : 38, ry: phase === 0 ? 42 : 28 }}
                transition={{ duration: 0.7 }}
                cx={100}
                cy={60}
                fill="#15803D"
                stroke="#166534"
                strokeWidth="1"
              />
              <motion.ellipse
                initial={false}
                animate={{ rx: phase === 0 ? 40 : 24, ry: phase === 0 ? 28 : 18, opacity: phase === 0 ? 1 : 0.8 }}
                transition={{ duration: 0.7 }}
                cx={88}
                cy={50}
                fill="#22C55E"
              />
              {/* AI overlay outline in phase 1 */}
              {phase === 1 && (
                <motion.ellipse
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  cx={100}
                  cy={60}
                  rx={60}
                  ry={42}
                  fill="none"
                  stroke="#FCD34D"
                  strokeWidth="2"
                  strokeDasharray="3,2"
                />
              )}
              {/* Ground */}
              <line x1="0" y1="120" x2="200" y2="120" stroke="#3F2A14" strokeWidth="2" />
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
              }}
            >
              {phase === 0 ? "Overgrown · 42 ft" : phase === 1 ? "AI prune plan" : "Trimmed · cleared"}
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
            <Calendar size={14} color="#10B981" />
            <div style={{ fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>
              Crew + chipper · Sat 8 AM · $640
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
