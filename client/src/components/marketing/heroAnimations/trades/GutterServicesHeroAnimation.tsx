/**
 * GutterServicesHeroAnimation — clogged gutter w/ leaves → cleaning → water flows freely.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { CloudRain } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function GutterServicesHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Clogged gutter cleared so water flows freely through the downspout">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For gutter services · seasonal cleaning</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 130,
              background: "linear-gradient(180deg, #475569 0%, #1e293b 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 130">
              {/* Roof line */}
              <polygon points="0,40 200,40 180,30 20,30" fill="#7c2d12" />
              {/* Gutter trough */}
              <rect x="10" y="42" width="180" height="14" fill="#9CA3AF" rx="2" />
              {/* Downspout */}
              <rect x="178" y="56" width="10" height="60" fill="#9CA3AF" />
              {/* Leaves (clogged in phase 0) */}
              {phase === 0 &&
                Array.from({ length: 7 }).map((_, i) => (
                  <ellipse
                    key={i}
                    cx={24 + i * 26}
                    cy={48}
                    rx={6}
                    ry={3}
                    fill="#92400E"
                  />
                ))}
              {/* Brush sweeping (phase 1) */}
              <motion.rect
                animate={{ x: phase === 1 ? [10, 170] : 10, opacity: phase === 1 ? 1 : 0 }}
                transition={{ duration: 1.4 }}
                y={36}
                width={20}
                height={20}
                fill="#FCD34D"
                rx={2}
              />
              {/* Water droplets in downspout (phase 2) */}
              {phase === 2 &&
                Array.from({ length: 3 }).map((_, i) => (
                  <motion.circle
                    key={i}
                    animate={{ cy: [60, 116] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.3 }}
                    cx={183}
                    r={2.5}
                    fill="#60A5FA"
                  />
                ))}
            </svg>
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
            <CloudRain size={16} color="#10B981" />
            <div style={{ fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>
              160 ft · $240 · pre-storm
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
