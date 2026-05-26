/**
 * DeckBuilderHeroAnimation — empty yard → deck planks materialize → revenue counter ticks up.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { DollarSign } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function DeckBuilderHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(4, 1200, inView && !reduced);
  const phase = reduced ? 3 : beat;

  // 8 planks build up over phases
  const planks = Array.from({ length: 8 }).map((_, i) => ({
    x: 14 + i * 22,
    width: 18,
    visible: i < phase * 3,
  }));

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Empty yard fills plank-by-plank into finished deck, revenue counter ticks up">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For deck builders · materialize</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 110,
              background: "linear-gradient(180deg, #166534 0%, #14532D 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 110">
              {/* Deck frame (joists) */}
              <rect x="10" y="30" width="180" height="70" fill="#3F2A14" rx="2" />
              {/* Planks */}
              {planks.map((p, i) => (
                <motion.rect
                  key={i}
                  initial={false}
                  animate={{ opacity: p.visible ? 1 : 0, y: p.visible ? 30 : 18 }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  x={p.x}
                  width={p.width}
                  height={70}
                  fill="#B98448"
                  stroke="#6B4A22"
                  strokeWidth={0.6}
                />
              ))}
            </svg>
          </div>

          <motion.div
            animate={{ opacity: phase === 3 ? 1 : 0.4 }}
            style={{
              ...cardStyle,
              background: phase === 3 ? "rgba(16,185,129,0.16)" : cardStyle.background,
              border: `1px solid ${phase === 3 ? "rgba(16,185,129,0.5)" : mkt.onDarkBorder}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <DollarSign size={16} color={phase === 3 ? "#10B981" : mkt.accent} />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 18, fontWeight: 700, color: mkt.onDark }}>
              ${phase === 0 ? "0" : phase === 1 ? "3,200" : phase === 2 ? "7,800" : "12,400"}
            </div>
            <span style={{ fontFamily: MONO, fontSize: 10, color: mkt.onDarkFaint }}>320 sq ft · composite</span>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
