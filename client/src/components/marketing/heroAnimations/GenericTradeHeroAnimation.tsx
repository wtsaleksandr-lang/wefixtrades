/**
 * GenericTradeHeroAnimation — fallback for trades not in the top-12.
 * Calendar fills + phone rings + reviews flow.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Phone, Calendar, Star } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function GenericTradeHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1800, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Phone rings, calendar fills with new bookings, 5-star reviews flow in">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <div style={{ ...monoLabel }}>WeFixTrades · live</div>

          {/* Call */}
          <motion.div
            animate={phase === 0 ? { y: [0, -3, 0] } : { y: 0 }}
            transition={{ duration: 0.9, repeat: phase === 0 ? Infinity : 0 }}
            style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 10 }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: mkt.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Phone size={14} color="#FFFFFF" />
            </div>
            <div style={{ flex: 1, fontSize: 12 }}>
              <strong>Incoming call</strong>
              <div style={{ fontSize: 10, color: mkt.onDarkFaint }}>
                {phase === 0 ? "Ringing…" : "AI answered · job booked"}
              </div>
            </div>
          </motion.div>

          {/* Calendar */}
          <motion.div
            animate={{ opacity: phase >= 1 ? 1 : 0.4 }}
            style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 10 }}
          >
            <Calendar size={16} color={mkt.accent} />
            <div style={{ flex: 1, fontSize: 12 }}>
              <strong>This week · 5 booked</strong>
              <div style={{ fontSize: 10, color: mkt.onDarkFaint }}>Auto-scheduled</div>
            </div>
          </motion.div>

          {/* Reviews */}
          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.4 }}
            style={{
              ...cardStyle,
              background: phase === 2 ? "rgba(16,185,129,0.14)" : cardStyle.background,
              border: phase === 2 ? "1px solid rgba(16,185,129,0.5)" : cardStyle.border,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", gap: 1 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={12} fill="#F59E0B" stroke="#F59E0B" />
              ))}
            </div>
            <div style={{ flex: 1, fontSize: 12, fontFamily: MONO, color: mkt.onDark }}>
              +3 reviews this week
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
