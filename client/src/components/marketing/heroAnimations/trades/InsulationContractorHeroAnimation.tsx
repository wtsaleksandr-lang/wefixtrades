/**
 * InsulationContractorHeroAnimation — cold outside, insulation goes in, indoor temp warms up.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Thermometer } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function InsulationContractorHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  const indoorTemp = phase === 0 ? 58 : phase === 1 ? 64 : 72;
  const tempColor = indoorTemp < 60 ? "#60A5FA" : indoorTemp < 70 ? "#F59E0B" : "#10B981";

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Cold outdoor temperature, insulation fills wall cavity, indoor temperature rises to comfortable">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={monoLabel}>For insulation · attic / wall</span>
            <span style={{ ...monoLabel, color: "#60A5FA", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Thermometer size={12} /> 22°F outside
            </span>
          </div>

          {/* Wall cross-section */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 100,
              background: "#0f172a",
              border: `1px solid ${mkt.onDarkBorder}`,
              display: "flex",
            }}
          >
            {/* Outside */}
            <div style={{ flex: 1, background: "linear-gradient(180deg, #1e3a8a 0%, #0c4a6e 100%)" }} />
            {/* Wall cavity */}
            <div
              style={{
                width: 70,
                background: "#1F2937",
                borderLeft: "2px solid #9CA3AF",
                borderRight: "2px solid #9CA3AF",
                display: "flex",
                alignItems: "stretch",
                position: "relative",
              }}
            >
              <motion.div
                initial={false}
                animate={{ height: phase === 0 ? 0 : phase === 1 ? "55%" : "100%" }}
                transition={{ duration: 0.7 }}
                style={{
                  width: "100%",
                  alignSelf: "flex-end",
                  background:
                    "repeating-linear-gradient(45deg, #FCD34D 0 6px, #FBBF24 6px 12px)",
                }}
              />
            </div>
            {/* Inside */}
            <div
              style={{
                flex: 1,
                background:
                  indoorTemp < 60
                    ? "linear-gradient(180deg, #1e3a8a 0%, #1e40af 100%)"
                    : indoorTemp < 70
                    ? "linear-gradient(180deg, #92400E 0%, #B45309 100%)"
                    : "linear-gradient(180deg, #166534 0%, #14532D 100%)",
              }}
            />
          </div>

          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.4 }}
            style={{
              ...cardStyle,
              border: `1px solid ${phase === 2 ? "rgba(16,185,129,0.5)" : mkt.onDarkBorder}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Thermometer size={16} color={tempColor} />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 14, color: mkt.onDark }}>
              Indoor · {indoorTemp}°F
            </div>
            <span style={{ fontFamily: MONO, fontSize: 11, color: mkt.accent }}>R-49 attic</span>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
