/**
 * QuoteQuickHeroAnimation — calculator auto-fills, tier slides, price band reveals.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Check } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const TIERS = ["Standard", "Premium", "Lifetime"];

export default function QuoteQuickHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(4, 1300, inView && !reduced);
  const phase = reduced ? 3 : beat;

  const sqft = phase >= 1 ? "1,240" : "—";
  const tierIdx = phase >= 2 ? 1 : 0;
  const showPrice = phase >= 2;
  const sent = phase === 3;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="QuoteQuick form auto-fills, tier slides to Premium, price band reveals, quote sent confirmation">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>Instant quote</span>
            <span style={{ ...monoLabel, color: mkt.accent }}>Live preview</span>
          </div>

          <div style={cardStyle}>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Square footage</div>
            <motion.div
              key={sqft}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                fontFamily: MONO,
                fontSize: 22,
                fontWeight: 700,
                color: mkt.onDark,
                letterSpacing: "-0.02em",
              }}
            >
              {sqft}
            </motion.div>
          </div>

          {/* Tier toggle */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${TIERS.length}, 1fr)`,
              gap: 4,
              padding: 4,
              borderRadius: 10,
              background: mkt.dark,
              border: `1px solid ${mkt.onDarkBorder}`,
              position: "relative",
            }}
          >
            <motion.div
              animate={{ left: `calc(${(tierIdx * 100) / TIERS.length}% + 4px)` }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
              style={{
                position: "absolute",
                top: 4,
                width: `calc(${100 / TIERS.length}% - 8px)`,
                height: "calc(100% - 8px)",
                borderRadius: 8,
                background: mkt.accent,
                zIndex: 0,
              }}
            />
            {TIERS.map((t, i) => (
              <span
                key={t}
                style={{
                  position: "relative",
                  zIndex: 1,
                  padding: "8px 4px",
                  textAlign: "center",
                  fontFamily: MONO,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: i === tierIdx ? mkt.onDark : mkt.onDarkMuted,
                  transition: "color 0.3s",
                }}
              >
                {t}
              </span>
            ))}
          </div>

          {/* Price band */}
          <motion.div
            initial={false}
            animate={{ opacity: showPrice ? 1 : 0.25, y: showPrice ? 0 : 6 }}
            transition={{ duration: 0.4 }}
            style={{
              ...cardStyle,
              background: "rgba(13,60,252,0.14)",
              border: `1px solid ${mkt.accent}`,
              textAlign: "center",
            }}
          >
            <div style={{ ...monoLabel, color: mkt.onDarkMuted, marginBottom: 4 }}>
              Estimated range
            </div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: mkt.onDark }}>
              $4,200 – $5,600
            </div>
          </motion.div>

          {/* Sent state */}
          <motion.div
            initial={false}
            animate={{ opacity: sent ? 1 : 0.2 }}
            transition={{ duration: 0.3 }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontFamily: MONO,
              fontSize: 11,
              color: sent ? "#10B981" : mkt.onDarkFaint,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {sent && <Check size={14} />}
            {sent ? "Quote sent" : "Send quote →"}
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
