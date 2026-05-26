/**
 * HvacHeroAnimation — thermometer spike → call surge intercepted → 14 installs this week.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Thermometer, Calendar } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function HvacHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  const temp = phase === 0 ? 78 : phase === 1 ? 92 : 104;
  const tempColor = temp < 80 ? "#10B981" : temp < 100 ? "#F59E0B" : "#EF4444";

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Outdoor temperature climbs, call volume surges, AI intercepts and books 14 installs this week">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={monoLabel}>For HVAC · seasonal surge</span>
            <span style={{ ...monoLabel, color: tempColor, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Thermometer size={12} /> {temp}°F
            </span>
          </div>

          {/* Call volume bars */}
          <div style={{ ...cardStyle, padding: "12px 12px" }}>
            <div style={{ ...monoLabel, marginBottom: 8 }}>Inbound calls · today</div>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60 }}>
              {Array.from({ length: 12 }).map((_, i) => {
                const targetHeight =
                  phase === 0 ? 14 : phase === 1 ? 26 + (i % 4) * 4 : 40 + (i % 5) * 6;
                return (
                  <motion.span
                    key={i}
                    initial={false}
                    animate={{ height: targetHeight }}
                    transition={{ duration: 0.6, delay: i * 0.03 }}
                    style={{
                      flex: 1,
                      background:
                        phase === 2 ? `linear-gradient(180deg, ${mkt.accent}, ${mkt.accentHover})` : "rgba(255,255,255,0.18)",
                      borderRadius: 3,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Outcome */}
          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.3, scale: phase === 2 ? 1 : 0.97 }}
            transition={{ duration: 0.4 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.16)",
              border: "1px solid rgba(16,185,129,0.5)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Calendar size={16} color="#10B981" />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: mkt.onDark }}>
                14 installs booked
              </div>
              <div style={{ fontSize: 10, color: mkt.onDarkFaint }}>this week · no missed calls</div>
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
