/**
 * CarpenterHeroAnimation — wood plank measure → AI quote band → calendar fills.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Ruler, Calendar } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function CarpenterHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;
  const tickPct = phase === 0 ? 0 : phase === 1 ? 0.6 : 1;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Wood plank with measuring tape extending, AI quote band lands, install date booked">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For carpenters · measure to book</span>

          {/* Wood plank with tape measure */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 80,
              background: "linear-gradient(180deg, #B98448 0%, #8B5E2B 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            {/* Wood grain lines */}
            <svg width="100%" height="100%" viewBox="0 0 200 80" style={{ position: "absolute", inset: 0, opacity: 0.32 }}>
              <path d="M0 18 Q60 14 200 22" stroke="#5C3A18" strokeWidth="1" fill="none" />
              <path d="M0 38 Q80 44 200 38" stroke="#5C3A18" strokeWidth="1" fill="none" />
              <path d="M0 58 Q100 52 200 60" stroke="#5C3A18" strokeWidth="1" fill="none" />
            </svg>
            {/* Tape measure */}
            <motion.div
              animate={{ width: `${tickPct * 100}%` }}
              transition={{ duration: 0.6 }}
              style={{
                position: "absolute",
                top: 28,
                left: 8,
                height: 22,
                background: "#FCD34D",
                borderRadius: 3,
                display: "flex",
                alignItems: "center",
                paddingLeft: 6,
                fontFamily: MONO,
                fontSize: 10,
                color: "#1F1B0F",
                fontWeight: 700,
              }}
            >
              <Ruler size={12} style={{ marginRight: 4 }} />
              {phase === 0 ? "0\"" : phase === 1 ? "48\"" : "96\""}
            </motion.div>
          </div>

          {/* Quote band */}
          <motion.div
            animate={{ opacity: phase >= 1 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              textAlign: "center",
              border: `1px solid ${phase >= 1 ? mkt.accent : mkt.onDarkBorder}`,
            }}
          >
            <div style={{ ...monoLabel, marginBottom: 4 }}>Built-in shelving · 8 ft</div>
            <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: mkt.onDark }}>
              $1,240 – $1,680
            </div>
          </motion.div>

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
            <Calendar size={14} color="#10B981" />
            <div style={{ fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>Install · Thu 9 AM booked</div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
