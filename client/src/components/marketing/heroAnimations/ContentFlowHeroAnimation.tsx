/**
 * ContentFlowHeroAnimation — article types out, posted to FB/IG/LinkedIn.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Facebook, Instagram, Linkedin, Check } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const FULL_TEXT = "5 signs your AC is wasting money this summer";
const PLATFORMS = [
  { name: "Facebook", icon: Facebook },
  { name: "Instagram", icon: Instagram },
  { name: "LinkedIn", icon: Linkedin },
];

export default function ContentFlowHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 2000, inView && !reduced);
  const phase = reduced ? 2 : beat;

  // Beat 0: typing, beat 1: image, beat 2: posted
  const typedLen = phase === 0 ? Math.min(FULL_TEXT.length, 24) : FULL_TEXT.length;
  const text = FULL_TEXT.slice(0, typedLen);

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Article being typed live, image generated, posted to Facebook, Instagram, and LinkedIn">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>ContentFlow · drafting</span>
            <motion.span
              animate={phase === 0 ? { opacity: [1, 0.3, 1] } : { opacity: 0.6 }}
              transition={{ duration: 0.9, repeat: Infinity }}
              style={{ ...monoLabel, color: mkt.accent }}
            >
              ✶ AI
            </motion.span>
          </div>

          {/* Article preview */}
          <div style={cardStyle}>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Blog draft</div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: mkt.onDark,
                lineHeight: 1.35,
                minHeight: 38,
              }}
            >
              {text}
              {phase === 0 && (
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.7, repeat: Infinity }}
                  style={{ marginLeft: 2 }}
                >
                  |
                </motion.span>
              )}
            </div>

            {/* Image block */}
            <motion.div
              animate={{ opacity: phase >= 1 ? 1 : 0.15 }}
              transition={{ duration: 0.5 }}
              style={{
                marginTop: 10,
                height: 64,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {phase >= 1 && !reduced && (
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
                  }}
                />
              )}
            </motion.div>
          </div>

          {/* Platform tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {PLATFORMS.map((p, i) => {
              const Icon = p.icon;
              const posted = phase === 2;
              return (
                <motion.div
                  key={p.name}
                  initial={false}
                  animate={
                    posted ? { y: 0, opacity: 1 } : { y: 4, opacity: 0.4 }
                  }
                  transition={{ duration: 0.35, delay: i * 0.08 }}
                  style={{
                    padding: "10px 8px",
                    borderRadius: 10,
                    background: mkt.dark,
                    border: `1px solid ${posted ? "rgba(16,185,129,0.4)" : mkt.onDarkBorder}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Icon size={16} color={mkt.onDark} />
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: posted ? "#10B981" : mkt.onDarkFaint,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    {posted && <Check size={12} />}
                    {posted ? "Posted" : "Draft"}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
