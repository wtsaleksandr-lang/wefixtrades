/**
 * AdFlowHeroAnimation — ad copy auto-generates, CTR ticks up, conversion counter grows.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const COPIES = [
  "Emergency plumber? On the way in 45 min ⚡",
  "Same-day drain clearing — flat $189",
  "Phoenix's top-rated 24/7 plumbing crew",
];

const CTR = ["1.2%", "2.8%", "4.6%"];
const CONV = ["3", "11", "24"];

export default function AdFlowHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 2000, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Ad copy auto-generates, click-through rate climbs from 1.2% to 4.6%, conversions counter grows">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>AdFlow · live test</span>
            <span style={{ ...monoLabel, color: mkt.accent }}>Variant {phase + 1}/3</span>
          </div>

          {/* Ad preview */}
          <motion.div
            key={`ad-${phase}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            style={cardStyle}
          >
            <div style={{ ...monoLabel, color: mkt.accent, marginBottom: 6 }}>Ad · Google</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: mkt.onDark, lineHeight: 1.4 }}>
              {COPIES[phase]}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "#10B981",
                fontFamily: MONO,
              }}
            >
              acmeplumbing.com/247
            </div>
          </motion.div>

          {/* Metric tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <MetricTile label="CTR" value={CTR[phase]} highlight={phase === 2} />
            <MetricTile label="Conversions" value={CONV[phase]} highlight={phase === 2} />
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}

function MetricTile({ label, value, highlight }: { label: string; value: string; highlight: boolean }) {
  return (
    <div
      style={{
        ...cardStyle,
        background: highlight ? "rgba(16,185,129,0.14)" : cardStyle.background,
        border: highlight ? "1px solid rgba(16,185,129,0.5)" : cardStyle.border,
        textAlign: "center",
      }}
    >
      <div style={{ ...monoLabel, marginBottom: 6 }}>{label}</div>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          fontFamily: MONO,
          fontSize: 22,
          fontWeight: 700,
          color: highlight ? "#10B981" : mkt.onDark,
        }}
      >
        {value}
      </motion.div>
    </div>
  );
}
