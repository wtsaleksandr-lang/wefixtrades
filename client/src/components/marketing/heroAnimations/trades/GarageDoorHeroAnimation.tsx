/**
 * GarageDoorHeroAnimation — stuck door → repair/replace branch → instant range.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Warehouse } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function GarageDoorHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;
  const doorOpenPct = phase === 0 ? 0.5 : phase === 1 ? 0.5 : 1;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Stuck garage door, customer self-triages repair vs replace, instant price range">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For garage door · self-triage</span>

          {/* Door illustration */}
          <div
            style={{
              ...cardStyle,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                position: "relative",
                width: 120,
                height: 80,
                border: `2px solid ${mkt.accent}`,
                borderRadius: 4,
                overflow: "hidden",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <motion.div
                animate={{ height: `${doorOpenPct * 100}%` }}
                transition={{ duration: 0.6 }}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  background: `repeating-linear-gradient(0deg, ${mkt.onDarkMuted}, ${mkt.onDarkMuted} 6px, ${mkt.onDarkBorder} 6px, ${mkt.onDarkBorder} 12px)`,
                }}
              />
            </div>
            <span style={{ ...monoLabel, color: mkt.onDarkMuted }}>
              <Warehouse size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
              {phase === 0 ? "Stuck halfway" : phase === 1 ? "Repair branch" : "Open · fixed"}
            </span>
          </div>

          {/* Branch picker */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {["Repair", "Replace"].map((label, i) => {
              const active = i === 0 && phase >= 1;
              return (
                <div
                  key={label}
                  style={{
                    ...cardStyle,
                    padding: "10px 8px",
                    textAlign: "center",
                    background: active ? "rgba(13,60,252,0.18)" : cardStyle.background,
                    border: `1px solid ${active ? mkt.accent : mkt.onDarkBorder}`,
                    fontFamily: MONO,
                    fontSize: 11,
                    color: active ? mkt.onDark : mkt.onDarkMuted,
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>

          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.14)",
              border: "1px solid rgba(16,185,129,0.45)",
              textAlign: "center",
              fontFamily: MONO,
              fontSize: 16,
              fontWeight: 700,
              color: mkt.onDark,
            }}
          >
            $180 – $340 · booked today
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
