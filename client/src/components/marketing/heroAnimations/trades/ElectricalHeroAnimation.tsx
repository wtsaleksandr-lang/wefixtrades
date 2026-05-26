/**
 * ElectricalHeroAnimation — emergency 3am call → AI dispatches → certified review.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Zap, Phone, ShieldCheck } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function ElectricalHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Emergency electrical call at 3am answered by AI, dispatched, completed with certified review">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For electricians · emergency</span>

          <motion.div
            animate={phase === 0 ? { boxShadow: [`0 0 0 0 rgba(239,68,68,0.6)`, `0 0 0 12px rgba(239,68,68,0)`] } : {}}
            transition={{ duration: 1.1, repeat: phase === 0 ? Infinity : 0 }}
            style={{
              ...cardStyle,
              display: "flex",
              alignItems: "center",
              gap: 10,
              borderColor: phase === 0 ? "rgba(239,68,68,0.5)" : mkt.onDarkBorder,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: phase === 0 ? "#EF4444" : mkt.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {phase === 0 ? <Phone size={14} color="#FFFFFF" /> : <Zap size={14} color="#FFFFFF" />}
            </div>
            <div style={{ flex: 1, fontSize: 12 }}>
              <strong>{phase === 0 ? "Emergency · 3:14 AM" : "AI dispatched · 14 min"}</strong>
              <div style={{ fontSize: 10, color: mkt.onDarkFaint }}>
                {phase === 0 ? "Panel sparking" : "Certified tech en route"}
              </div>
            </div>
          </motion.div>

          {/* Job board: priority vs standard */}
          <div style={{ ...cardStyle, padding: "10px 12px" }}>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Today's queue</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { label: "Panel emergency · Tom W.", color: "#EF4444", visible: true },
                { label: "EV install · Lisa M.", color: mkt.accent, visible: phase >= 1 },
                { label: "Outlet replace · Dan R.", color: "#10B981", visible: phase >= 2 },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    color: row.visible ? mkt.onDark : mkt.onDarkFaint,
                    opacity: row.visible ? 1 : 0.4,
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: row.color }} />
                  {row.label}
                </div>
              ))}
            </div>
          </div>

          {/* Cert review */}
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
            <ShieldCheck size={16} color="#10B981" />
            <div style={{ flex: 1, fontSize: 12, color: mkt.onDark }}>
              <strong>Licensed · review posted</strong>
              <div style={{ fontFamily: MONO, fontSize: 10, color: mkt.onDarkFaint }}>
                CERT #C-10
              </div>
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
