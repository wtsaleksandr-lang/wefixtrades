/**
 * ReputationShieldHeroAnimation — 1-star review → AI drafts reply → rating climbs.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Star } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const REPLY_FULL = "Thanks for the feedback Mark — sorry the timing slipped. We refunded $40 and would love to make it right next visit.";

export default function ReputationShieldHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 2000, inView && !reduced);
  const phase = reduced ? 2 : beat;

  const typedLen = phase === 0 ? 0 : phase === 1 ? Math.floor(REPLY_FULL.length * 0.45) : REPLY_FULL.length;
  const reply = REPLY_FULL.slice(0, typedLen);
  const rating = phase === 0 ? "4.2" : phase === 1 ? "4.5" : "4.7";

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="A 1-star review appears, AI drafts a personal reply, star rating climbs from 4.2 to 4.7">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>Review intercepted</span>
            <motion.span
              key={rating}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: "#F59E0B" }}
            >
              ★ {rating}
            </motion.span>
          </div>

          {/* Original review */}
          <div style={cardStyle}>
            <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={12}
                  fill={n <= 1 ? "#F59E0B" : "none"}
                  stroke="#F59E0B"
                />
              ))}
            </div>
            <div style={{ fontSize: 12, color: mkt.onDarkMuted, lineHeight: 1.45 }}>
              "Showed up an hour late. Not great."
              <span style={{ display: "block", marginTop: 4, fontSize: 10, color: mkt.onDarkFaint }}>
                — Mark · 2 hrs ago
              </span>
            </div>
          </div>

          {/* AI Reply */}
          <motion.div
            initial={false}
            animate={{ opacity: phase >= 1 ? 1 : 0.3 }}
            transition={{ duration: 0.4 }}
            style={{
              ...cardStyle,
              background: "rgba(13,60,252,0.10)",
              border: `1px solid ${mkt.accent}`,
            }}
          >
            <div
              style={{
                ...monoLabel,
                color: mkt.accent,
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              ✶ AI reply · {phase === 1 ? "drafting…" : phase === 2 ? "posted" : ""}
            </div>
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.45,
                color: mkt.onDark,
                minHeight: 40,
              }}
            >
              {reply}
              {phase === 1 && (
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.7, repeat: Infinity }}
                >
                  |
                </motion.span>
              )}
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
