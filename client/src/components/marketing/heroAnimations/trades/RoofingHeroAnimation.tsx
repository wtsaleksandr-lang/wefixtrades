/**
 * RoofingHeroAnimation — storm hits → instant range quote → top-3 rank.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { CloudRain, Calendar } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function RoofingHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Storm hits Thursday, QuoteQuick range fills in, top-3 ranking on Google by Friday">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For roofers · storm response</span>

          <motion.div
            animate={phase === 0 ? { opacity: [1, 0.6, 1] } : { opacity: 1 }}
            transition={{ duration: 0.9, repeat: phase === 0 ? Infinity : 0 }}
            style={{
              ...cardStyle,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: phase === 0 ? "rgba(239,68,68,0.14)" : cardStyle.background,
              border: `1px solid ${phase === 0 ? "rgba(239,68,68,0.4)" : mkt.onDarkBorder}`,
            }}
          >
            <CloudRain size={20} color={phase === 0 ? "#EF4444" : mkt.accent} />
            <div style={{ flex: 1, fontSize: 12 }}>
              <strong>Storm alert · Thursday</strong>
              <div style={{ fontSize: 10, color: mkt.onDarkFaint }}>14 inbound leads in 2 hrs</div>
            </div>
          </motion.div>

          <motion.div
            animate={{ opacity: phase >= 1 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(13,60,252,0.12)",
              border: `1px solid ${mkt.accent}`,
              textAlign: "center",
            }}
          >
            <div style={{ ...monoLabel, color: mkt.onDarkMuted, marginBottom: 4 }}>
              Range estimate · 1,800 sq ft
            </div>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: mkt.onDark }}>
              $8,400 – $11,200
            </div>
          </motion.div>

          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.14)",
              border: "1px solid rgba(16,185,129,0.45)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Calendar size={14} color="#10B981" />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>
              Top-3 on Google · Friday
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
