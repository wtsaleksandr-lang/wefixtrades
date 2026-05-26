/**
 * DrywallHeroAnimation — hole in wall → patch → smooth → ready to paint.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Check } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function DrywallHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(4, 1300, inView && !reduced);
  const phase = reduced ? 3 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Hole in wall is patched, smoothed, and ready for paint with completion check">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For drywall · patch to paint-ready</span>

          {/* Wall with hole + patch progression */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 130,
              background: "#E5E7EB",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 130">
              {/* Hole (visible in phase 0) */}
              <motion.ellipse
                initial={false}
                animate={{ opacity: phase === 0 ? 1 : 0 }}
                cx="100"
                cy="65"
                rx="22"
                ry="18"
                fill="#0F172A"
              />
              {/* Patch (visible in phase 1+) */}
              <motion.rect
                initial={false}
                animate={{ opacity: phase >= 1 ? 1 : 0 }}
                x="74"
                y="44"
                width="52"
                height="42"
                fill="#FFFFFF"
                stroke="#9CA3AF"
                strokeWidth="1"
                strokeDasharray={phase === 1 ? "3,2" : "0"}
              />
              {/* Mud / smooth in phase 2+ */}
              <motion.ellipse
                initial={false}
                animate={{ opacity: phase >= 2 ? 0.7 : 0 }}
                cx="100"
                cy="65"
                rx="38"
                ry="26"
                fill="#F3F4F6"
              />
              {/* Final smooth in phase 3 */}
              <motion.rect
                initial={false}
                animate={{ opacity: phase >= 3 ? 1 : 0 }}
                x="0"
                y="0"
                width="200"
                height="130"
                fill="#E5E7EB"
              />
            </svg>
            <div
              style={{
                position: "absolute",
                bottom: 6,
                left: 8,
                fontFamily: MONO,
                fontSize: 10,
                color: "#1F2937",
              }}
            >
              {phase === 0 ? "Hole" : phase === 1 ? "Patch" : phase === 2 ? "Mud + tape" : "Paint-ready"}
            </div>
          </div>

          <motion.div
            animate={{ opacity: phase === 3 ? 1 : 0.3 }}
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
            <div style={{ fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>Same-day patch · $180 flat</div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
