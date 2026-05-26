/**
 * SolarInstallerHeroAnimation — rooftop → panels stage in → energy meter ticks down to $0.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Sun } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const PANELS = [
  { x: 36, y: 20 },
  { x: 72, y: 20 },
  { x: 108, y: 20 },
  { x: 144, y: 20 },
  { x: 36, y: 46 },
  { x: 72, y: 46 },
  { x: 108, y: 46 },
  { x: 144, y: 46 },
];

export default function SolarInstallerHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(4, 1300, inView && !reduced);
  const phase = reduced ? 3 : beat;
  const panelsVisible = phase * 3;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Solar panels populate rooftop, monthly electric bill counts down toward zero">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For solar · design + install</span>

          {/* Rooftop with panels */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 100,
              background: "linear-gradient(180deg, #0c4a6e 0%, #1e3a8a 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 100">
              {/* Sun */}
              <circle cx="170" cy="20" r="10" fill="#FCD34D" />
              {/* Roof */}
              <polygon points="20,90 100,8 180,90" fill="#7c2d12" />
              {/* Panels */}
              {PANELS.map((p, i) => (
                <motion.rect
                  key={i}
                  initial={false}
                  animate={{ opacity: i < panelsVisible ? 1 : 0 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  x={p.x}
                  y={p.y}
                  width={28}
                  height={20}
                  fill="#1e293b"
                  stroke="#60A5FA"
                  strokeWidth="1"
                  rx="1"
                />
              ))}
            </svg>
          </div>

          <motion.div
            animate={{ opacity: phase >= 1 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              border: `1px solid ${phase === 3 ? "rgba(16,185,129,0.5)" : mkt.onDarkBorder}`,
              background: phase === 3 ? "rgba(16,185,129,0.14)" : cardStyle.background,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Sun size={16} color={phase === 3 ? "#10B981" : "#FCD34D"} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: mkt.onDarkFaint, letterSpacing: "0.08em" }}>
                MONTHLY BILL
              </div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: mkt.onDark }}>
                ${phase === 0 ? "248" : phase === 1 ? "164" : phase === 2 ? "82" : "0"}
              </div>
            </div>
            <span style={{ fontFamily: MONO, fontSize: 10, color: mkt.accent }}>8 kW</span>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
