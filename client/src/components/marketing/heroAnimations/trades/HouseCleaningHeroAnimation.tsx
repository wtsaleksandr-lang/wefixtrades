/**
 * HouseCleaningHeroAnimation — recurring schedule grid → weekly checkmarks.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Check, Sparkles } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const WEEKS = ["W1", "W2", "W3", "W4"];

export default function HouseCleaningHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(WEEKS.length + 1, 1100, inView && !reduced);
  const phase = reduced ? WEEKS.length : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Weekly recurring bookings filling 4 weeks of the calendar, all green checkmarks">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For house cleaning · recurring</span>

          <div style={cardStyle}>
            <div
              style={{
                ...monoLabel,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Sparkles size={12} /> Tue 10 AM · biweekly · 1,200 sqft
            </div>
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: mkt.onDark }}>
              $128 / visit
            </div>
          </div>

          {/* Weekly grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {WEEKS.map((w, i) => {
              const done = i < phase;
              return (
                <motion.div
                  key={w}
                  initial={false}
                  animate={{
                    background: done ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.04)",
                    borderColor: done ? "rgba(16,185,129,0.45)" : mkt.onDarkBorder,
                  }}
                  transition={{ duration: 0.35 }}
                  style={{
                    padding: "12px 6px",
                    borderRadius: 10,
                    border: "1px solid",
                    textAlign: "center",
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    color: done ? "#10B981" : mkt.onDarkFaint,
                  }}
                >
                  {done && <Check size={12} style={{ display: "block", margin: "0 auto 4px" }} />}
                  {w}
                </motion.div>
              );
            })}
          </div>

          <motion.div
            animate={{ opacity: phase === WEEKS.length ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.14)",
              border: "1px solid rgba(16,185,129,0.5)",
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 12,
              color: mkt.onDark,
            }}
          >
            4 weeks booked · $512 recurring
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
