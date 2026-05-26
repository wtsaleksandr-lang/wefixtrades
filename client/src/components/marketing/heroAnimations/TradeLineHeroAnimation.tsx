/**
 * TradeLineHeroAnimation — phone rings, AI waveform pulses, booking lands.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Phone, Calendar } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const BAR_COUNT = 18;

export default function TradeLineHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1800, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Incoming call answered by TradeLine AI, booking confirmed for Monday 9am, revenue +$280">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>TradeLine · live</span>
            <motion.span
              animate={phase === 0 ? { color: ["#10B981", "#FFFFFF", "#10B981"] } : { color: "#10B981" }}
              transition={{ duration: 1.2, repeat: Infinity }}
              style={{ fontSize: 10, fontFamily: MONO, letterSpacing: "0.1em", textTransform: "uppercase" }}
            >
              ● Active
            </motion.span>
          </div>

          {/* Call card */}
          <motion.div
            initial={false}
            animate={phase === 0 ? { y: [0, -3, 0] } : { y: 0 }}
            transition={{ duration: 0.9, repeat: phase === 0 ? Infinity : 0 }}
            style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12 }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: mkt.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Phone size={16} color="#FFFFFF" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Sarah K. · (480) 555-0142</div>
              <div style={{ fontSize: 11, color: mkt.onDarkFaint, marginTop: 2 }}>
                {phase === 0 ? "Incoming call · 2:14 PM" : "AI handling…"}
              </div>
            </div>
          </motion.div>

          {/* Waveform — pulses brand-blue while answering */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              height: 48,
              padding: "0 10px",
            }}
          >
            {Array.from({ length: BAR_COUNT }).map((_, i) => (
              <motion.span
                key={i}
                animate={
                  phase === 1 && !reduced
                    ? { scaleY: [0.3, 1, 0.5, 0.8, 0.3] }
                    : { scaleY: 0.4 }
                }
                transition={{
                  duration: 1.1,
                  repeat: Infinity,
                  delay: i * 0.04,
                  ease: "easeInOut",
                }}
                style={{
                  width: 3,
                  height: 32,
                  background: mkt.accent,
                  borderRadius: 2,
                  transformOrigin: "center",
                  opacity: phase === 1 ? 1 : 0.35,
                }}
              />
            ))}
          </div>

          {/* Booking receipt */}
          <motion.div
            initial={false}
            animate={
              phase === 2
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0.3, y: 6, scale: 0.98 }
            }
            transition={{ duration: 0.5 }}
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
            <div style={{ flex: 1, fontSize: 12 }}>
              <strong>Booked · Mon 9:00 AM</strong>
              <div style={{ fontSize: 10, color: mkt.onDarkFaint }}>Drain clear · +$280</div>
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
