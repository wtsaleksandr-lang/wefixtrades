/**
 * FencingContractorHeroAnimation — yard outline → fence posts go up → linear footage counter.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Ruler } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function FencingContractorHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(4, 1200, inView && !reduced);
  const phase = reduced ? 3 : beat;

  const posts = Array.from({ length: 10 }).map((_, i) => ({
    x: 14 + i * 18,
    visible: i < phase * 3,
  }));

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Yard outline appears, fence posts rise one by one, linear footage tallies up">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For fencing · linear ft estimate</span>

          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 110,
              background: "linear-gradient(180deg, #14532D 0%, #052E16 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 110">
              {/* Property outline */}
              <rect
                x="10"
                y="20"
                width="180"
                height="70"
                fill="none"
                stroke="#FCD34D"
                strokeWidth="1"
                strokeDasharray="3,2"
              />
              {/* Posts */}
              {posts.map((p, i) => (
                <motion.rect
                  key={i}
                  initial={false}
                  animate={{ opacity: p.visible ? 1 : 0, height: p.visible ? 56 : 0 }}
                  transition={{ duration: 0.4, delay: i * 0.06 }}
                  x={p.x}
                  y={34}
                  width={3}
                  fill="#92400E"
                />
              ))}
              {/* Top rail */}
              <motion.line
                initial={false}
                animate={{ opacity: phase >= 3 ? 1 : 0 }}
                x1={14}
                y1={36}
                x2={194}
                y2={36}
                stroke="#92400E"
                strokeWidth="3"
              />
            </svg>
          </div>

          <div style={cardStyle}>
            <div style={{ ...monoLabel, marginBottom: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Ruler size={12} /> Linear footage
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: mkt.onDark }}>
                {phase === 0 ? "0" : phase === 1 ? "60" : phase === 2 ? "120" : "180"} ft
              </span>
              <span style={{ fontFamily: MONO, fontSize: 14, color: mkt.accent, alignSelf: "center" }}>
                ${phase === 0 ? "0" : phase === 1 ? "2,160" : phase === 2 ? "4,320" : "6,480"}
              </span>
            </div>
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
