/**
 * PlumbingHeroAnimation — missed call 2:14pm → TradeLine books Sarah K. Mon 9am → +$280.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Phone, Calendar, DollarSign } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function PlumbingHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Missed call at 2:14pm intercepted by TradeLine AI, Sarah K. booked for Monday 9am, revenue +$280">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For plumbers · after-hours</span>

          {/* Missed call notification */}
          <motion.div
            animate={phase === 0 ? { x: [0, 4, -4, 0] } : { x: 0 }}
            transition={{ duration: 0.6, repeat: phase === 0 ? Infinity : 0 }}
            style={{
              ...cardStyle,
              background: phase === 0 ? "rgba(239,68,68,0.16)" : cardStyle.background,
              border: `1px solid ${phase === 0 ? "rgba(239,68,68,0.5)" : mkt.onDarkBorder}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Phone size={16} color={phase === 0 ? "#EF4444" : mkt.accent} />
            <div style={{ flex: 1, fontSize: 12 }}>
              <strong>Missed call · 2:14 PM</strong>
              <div style={{ fontSize: 10, color: mkt.onDarkFaint }}>
                {phase === 0 ? "Sarah K." : "AI intercepted"}
              </div>
            </div>
          </motion.div>

          {/* AI booking */}
          <motion.div
            animate={{ opacity: phase >= 1 ? 1 : 0.3 }}
            style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 10 }}
          >
            <Calendar size={16} color={mkt.accent} />
            <div style={{ flex: 1, fontSize: 12 }}>
              <strong>Sarah K. · Mon 9:00 AM</strong>
              <div style={{ fontSize: 10, color: mkt.onDarkFaint }}>Drain clear</div>
            </div>
          </motion.div>

          {/* Revenue */}
          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.3, scale: phase === 2 ? 1 : 0.96 }}
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
            <DollarSign size={16} color="#10B981" />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 16, fontWeight: 700, color: mkt.onDark }}>
              +$280 booked
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
