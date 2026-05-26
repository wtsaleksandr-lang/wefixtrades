/**
 * SiteLaunchHeroAnimation — blank canvas → sections appear → website live.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Check } from "lucide-react";
import { AnimationFrame, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const SECTIONS = [
  { label: "Hero", h: 38 },
  { label: "Services", h: 56 },
  { label: "Reviews", h: 32 },
  { label: "Contact", h: 26 },
];

export default function SiteLaunchHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(5, 900, inView && !reduced);
  const phase = reduced ? 4 : beat;
  const built = Math.min(phase, SECTIONS.length);
  const live = phase === 4;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Blank canvas filling with hero, services, reviews, contact sections — site goes live">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>Building site</span>
            <motion.span
              animate={live ? { color: "#10B981" } : { color: mkt.onDarkFaint }}
              style={{ ...monoLabel, display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              {live ? <Check size={12} /> : <span>●</span>} {live ? "Live" : "Drafting"}
            </motion.span>
          </div>

          {/* Browser chrome */}
          <div
            style={{
              borderRadius: 12,
              background: mkt.dark,
              border: `1px solid ${mkt.onDarkBorder}`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "8px 10px",
                borderBottom: `1px solid ${mkt.onDarkBorder}`,
              }}
            >
              <span style={dotStyle("#EF4444")} />
              <span style={dotStyle("#F59E0B")} />
              <span style={dotStyle("#10B981")} />
              <span
                style={{
                  marginLeft: 8,
                  fontFamily: MONO,
                  fontSize: 9,
                  color: mkt.onDarkFaint,
                  letterSpacing: "0.05em",
                }}
              >
                acmeplumbing.com
              </span>
            </div>

            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {SECTIONS.map((s, i) => {
                const visible = i < built;
                return (
                  <motion.div
                    key={s.label}
                    initial={false}
                    animate={{
                      opacity: visible ? 1 : 0.12,
                      scale: visible ? 1 : 0.98,
                    }}
                    transition={{ duration: 0.35 }}
                    style={{
                      height: s.h,
                      borderRadius: 8,
                      background: visible
                        ? `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`
                        : "rgba(255,255,255,0.06)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        bottom: 6,
                        left: 10,
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: visible ? mkt.onDark : mkt.onDarkFaint,
                        opacity: 0.92,
                      }}
                    >
                      {s.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}

const dotStyle = (bg: string): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: bg,
  display: "inline-block",
});
