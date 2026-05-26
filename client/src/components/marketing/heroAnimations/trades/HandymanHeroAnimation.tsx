/**
 * HandymanHeroAnimation — variety of job types triaged by TradeLine.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Phone, Hammer, Wrench, Tv } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const JOBS = [
  { icon: Hammer, label: "Drywall hole · 30 min" },
  { icon: Wrench, label: "Faucet swap · 45 min" },
  { icon: Tv, label: "TV mount · 60 min" },
];

export default function HandymanHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(JOBS.length + 1, 1100, inView && !reduced);
  const phase = reduced ? JOBS.length : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Various handyman job types ring in and are triaged by TradeLine">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For handymen · triage</span>

          <div
            style={{
              ...cardStyle,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <motion.div
              animate={{ rotate: [0, -8, 8, -8, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.4 }}
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
            </motion.div>
            <div style={{ flex: 1, fontSize: 12 }}>
              <strong>Inbound call</strong>
              <div style={{ fontSize: 10, color: mkt.onDarkFaint }}>AI classifying intent…</div>
            </div>
          </div>

          {/* Job list */}
          <div style={{ ...cardStyle, padding: "10px 12px" }}>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Booked today</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {JOBS.map((j, i) => {
                const Icon = j.icon;
                const booked = i < phase;
                return (
                  <motion.div
                    key={j.label}
                    initial={false}
                    animate={{ opacity: booked ? 1 : 0.2 }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 11,
                      color: mkt.onDark,
                    }}
                  >
                    <Icon size={14} color={booked ? mkt.accent : mkt.onDarkFaint} />
                    <span>{j.label}</span>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <motion.div
            animate={{ opacity: phase === JOBS.length ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.14)",
              border: "1px solid rgba(16,185,129,0.5)",
              fontFamily: MONO,
              fontSize: 12,
              color: mkt.onDark,
              textAlign: "center",
            }}
          >
            +$340 booked today
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
