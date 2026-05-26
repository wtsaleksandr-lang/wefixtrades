/**
 * CountertopInstallerHeroAnimation — empty counter → granite slab slides in → measurement check.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Ruler } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function CountertopInstallerHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Empty counter base, granite slab slides into place, measurement confirmed">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For countertop installers · template to install</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 100,
              background: "#0f172a",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            {/* Base cabinets */}
            <div
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 8,
                height: 56,
                background: "#3F2A14",
                borderRadius: 4,
                border: "1px solid #1F1308",
              }}
            />
            {/* Granite slab slides in from right */}
            <motion.div
              initial={false}
              animate={{ x: phase === 0 ? 220 : 0 }}
              transition={{ duration: 0.7 }}
              style={{
                position: "absolute",
                left: 12,
                right: 12,
                bottom: 60,
                height: 12,
                background:
                  "linear-gradient(135deg, #6B7280 0%, #E5E7EB 30%, #9CA3AF 60%, #4B5563 100%)",
                borderRadius: 2,
                boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
              }}
            />
            {/* Measurement tape on top */}
            <motion.div
              animate={{ opacity: phase === 2 ? 1 : 0 }}
              style={{
                position: "absolute",
                left: 18,
                bottom: 76,
                fontFamily: MONO,
                fontSize: 10,
                color: "#FCD34D",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(0,0,0,0.55)",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              <Ruler size={12} /> 11.4 lin ft · seamless
            </motion.div>
          </div>

          <div style={cardStyle}>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Quartz · Calacatta</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <motion.span
                animate={{ opacity: phase >= 1 ? 1 : 0.3 }}
                style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: mkt.onDark }}
              >
                ${phase === 0 ? "0" : phase === 1 ? "5,200" : "5,840"}
              </motion.span>
              <motion.span
                animate={{ opacity: phase === 2 ? 1 : 0.3 }}
                style={{ fontFamily: MONO, fontSize: 12, color: "#10B981", alignSelf: "center" }}
              >
                Install ✓
              </motion.span>
            </div>
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
