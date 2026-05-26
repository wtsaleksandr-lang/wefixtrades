/**
 * SocialSyncHeroAnimation — single post fans out to 4 platforms.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Facebook, Instagram, Linkedin, Twitter, Check } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const PLATFORMS = [
  { name: "FB", icon: Facebook, x: -90, y: 60 },
  { name: "IG", icon: Instagram, x: -30, y: 92 },
  { name: "LI", icon: Linkedin, x: 30, y: 92 },
  { name: "X", icon: Twitter, x: 90, y: 60 },
];

export default function SocialSyncHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1800, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="A single social post fans out to Facebook, Instagram, LinkedIn, and Twitter">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", alignItems: "center" }}>
          <div style={{ ...monoLabel, alignSelf: "stretch" }}>SocialSync · 1 post → 4 platforms</div>

          {/* Central post + radiating platforms */}
          <div style={{ position: "relative", width: "100%", height: 220 }}>
            {/* Central post */}
            <motion.div
              animate={phase === 0 ? { scale: [0.97, 1.02, 0.97] } : { scale: 1 }}
              transition={{ duration: 1.3, repeat: phase === 0 ? Infinity : 0 }}
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 140,
                padding: "12px 14px",
                borderRadius: 14,
                background: mkt.dark,
                border: `1px solid ${mkt.accent}`,
                textAlign: "center",
                boxShadow: "0 8px 24px rgba(13,60,252,0.28)",
              }}
            >
              <div style={{ ...monoLabel, color: mkt.accent, marginBottom: 4 }}>Post</div>
              <div style={{ fontSize: 11, color: mkt.onDark, lineHeight: 1.35 }}>
                "Before / after: new patio install — 2 days"
              </div>
            </motion.div>

            {/* Platform pills */}
            {PLATFORMS.map((p, i) => {
              const Icon = p.icon;
              const sent = phase >= 1;
              return (
                <motion.div
                  key={p.name}
                  initial={false}
                  animate={
                    sent
                      ? { x: p.x, y: p.y, opacity: 1, scale: 1 }
                      : { x: 0, y: 10, opacity: 0, scale: 0.5 }
                  }
                  transition={{ duration: 0.55, delay: i * 0.08, type: "spring", stiffness: 180, damping: 18 }}
                  style={{
                    position: "absolute",
                    top: 30,
                    left: "50%",
                    width: 56,
                    marginLeft: -28,
                    padding: "10px 8px",
                    borderRadius: 12,
                    background: mkt.dark,
                    border: `1px solid ${
                      phase === 2 ? "rgba(16,185,129,0.5)" : mkt.onDarkBorder
                    }`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Icon size={20} color={mkt.onDark} />
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 9,
                      letterSpacing: "0.06em",
                      color: phase === 2 ? "#10B981" : mkt.onDarkFaint,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    {phase === 2 && <Check size={12} />}
                    {p.name}
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
