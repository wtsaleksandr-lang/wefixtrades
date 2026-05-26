/**
 * PestControlHeroAnimation — bug icon → AI categorizes → recurring revenue $2,400 LTV.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Bug, Calendar, Sparkles } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const PESTS = ["Ant", "Termite", "Roach"];

export default function PestControlHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="AI categorizes pest, prices recurring service plan, projects $2,400 lifetime value">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For pest control · recurring</span>

          {/* Pest classifier */}
          <div style={{ ...cardStyle, padding: "12px 12px" }}>
            <div style={{ ...monoLabel, marginBottom: 8 }}>AI · classifying</div>
            <div style={{ display: "flex", gap: 6 }}>
              {PESTS.map((p, i) => {
                const active = i === phase % PESTS.length;
                return (
                  <motion.div
                    key={p}
                    animate={{
                      background: active ? mkt.accent : "rgba(255,255,255,0.05)",
                      color: active ? mkt.onDark : mkt.onDarkMuted,
                    }}
                    style={{
                      flex: 1,
                      padding: "10px 4px",
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      fontFamily: MONO,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    <Bug size={14} />
                    {p}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Recurring calendar */}
          <motion.div
            animate={{ opacity: phase >= 1 ? 1 : 0.4 }}
            style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 10 }}
          >
            <Calendar size={16} color={mkt.accent} />
            <div style={{ flex: 1, fontSize: 12 }}>
              <strong>Quarterly plan · 4 visits</strong>
              <div style={{ fontSize: 10, color: mkt.onDarkFaint }}>auto-scheduled</div>
            </div>
          </motion.div>

          {/* LTV insight */}
          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(13,60,252,0.12)",
              border: `1px solid ${mkt.accent}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Sparkles size={14} color={mkt.accent} />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 13, color: mkt.onDark }}>
              <strong>$2,400</strong> projected LTV
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
