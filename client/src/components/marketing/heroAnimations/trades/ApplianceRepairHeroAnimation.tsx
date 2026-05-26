/**
 * ApplianceRepairHeroAnimation — broken appliance icon → wrench fix → working again + revenue.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Wrench, DollarSign } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function ApplianceRepairHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Broken refrigerator icon, wrench symbol overlays, appliance running with $185 revenue">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For appliance repair · diagnose to fix</span>

          {/* Appliance scene */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 130,
              background: "#1F2937",
              border: `1px solid ${mkt.onDarkBorder}`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {/* Fridge body */}
            <div
              style={{
                position: "relative",
                width: 90,
                height: 110,
                background: "linear-gradient(180deg, #E5E7EB 0%, #9CA3AF 100%)",
                borderRadius: 4,
                border: "2px solid #4B5563",
              }}
            >
              {/* Top freezer division */}
              <div style={{ position: "absolute", top: 36, left: 0, right: 0, height: 2, background: "#4B5563" }} />
              {/* Handle */}
              <div style={{ position: "absolute", right: 6, top: 12, width: 4, height: 18, background: "#4B5563", borderRadius: 2 }} />
              <div style={{ position: "absolute", right: 6, top: 46, width: 4, height: 52, background: "#4B5563", borderRadius: 2 }} />
              {/* Status light */}
              <motion.div
                animate={{
                  background:
                    phase === 0 ? "#EF4444" : phase === 1 ? "#F59E0B" : "#10B981",
                }}
                transition={{ duration: 0.4 }}
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  boxShadow: phase === 0 ? "0 0 6px #EF4444" : phase === 2 ? "0 0 6px #10B981" : "none",
                }}
              />
              {/* Error code (phase 0) or fix label (phase 1+) */}
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 0,
                  right: 0,
                  textAlign: "center",
                  fontFamily: MONO,
                  fontSize: 10,
                  color: phase === 0 ? "#EF4444" : phase === 1 ? "#F59E0B" : "#10B981",
                  fontWeight: 700,
                }}
              >
                {phase === 0 ? "ERR F1" : phase === 1 ? "FIXING…" : "RUNNING"}
              </div>
            </div>
            {/* Wrench overlay */}
            {phase === 1 && (
              <motion.div
                animate={{ rotate: [-12, 12, -12] }}
                transition={{ duration: 0.6, repeat: Infinity }}
                style={{
                  position: "absolute",
                  background: "rgba(252,211,77,0.95)",
                  padding: 8,
                  borderRadius: 999,
                }}
              >
                <Wrench size={20} color="#1F2937" />
              </motion.div>
            )}
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
            <DollarSign size={16} color="#10B981" />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 14, fontWeight: 700, color: mkt.onDark }}>
              +$185 · same-day diagnostic
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
