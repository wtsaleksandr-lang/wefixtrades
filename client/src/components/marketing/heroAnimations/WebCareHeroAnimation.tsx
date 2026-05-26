/**
 * WebCareHeroAnimation — uptime dashboard pulses, security shield rotates.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Shield } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const UPTIME_BARS = 30;

export default function WebCareHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const animate = inView && !reduced;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Uptime monitor showing 100% green across 30 checks, security shield rotating">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>WebCare · monitor</span>
            <span style={{ ...monoLabel, color: "#10B981" }}>● 100%</span>
          </div>

          {/* Uptime bar row */}
          <div style={{ ...cardStyle, padding: "12px 12px" }}>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Last 30 days · uptime</div>
            <div style={{ display: "flex", gap: 2, height: 28, alignItems: "flex-end" }}>
              {Array.from({ length: UPTIME_BARS }).map((_, i) => (
                <motion.span
                  key={i}
                  animate={animate ? { scaleY: [0.85, 1, 0.85] } : { scaleY: 1 }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    delay: i * 0.05,
                    ease: "easeInOut",
                  }}
                  style={{
                    flex: 1,
                    background: "#10B981",
                    borderRadius: 2,
                    height: "100%",
                    transformOrigin: "bottom",
                    opacity: 0.85,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: mkt.onDarkFaint,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Last incident</span>
              <span style={{ color: "#10B981", fontFamily: MONO }}>NEVER</span>
            </div>
          </div>

          {/* Rotating shield */}
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
            <motion.div
              animate={animate ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `radial-gradient(circle, rgba(13,60,252,0.4) 0%, transparent 70%)`,
              }}
            >
              <Shield size={32} color={mkt.accent} strokeWidth={2} />
            </motion.div>
          </div>

          <div style={{ textAlign: "center", ...monoLabel, color: mkt.onDarkMuted }}>
            SSL · Plugins · Backups · OK
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
