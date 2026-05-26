/**
 * RankFlowHeroAnimation — keyword graph line trending up over 12 weeks.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { TrendingUp } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const POINTS = [42, 38, 36, 31, 28, 25, 22, 18, 15, 11, 8, 5];

export default function RankFlowHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const animate = inView && !reduced;

  // SVG viewBox 200x100, lower rank = higher visually
  const w = 220;
  const h = 110;
  const maxRank = Math.max(...POINTS);
  const path = POINTS.map((p, i) => {
    const x = (i / (POINTS.length - 1)) * w;
    const y = (p / maxRank) * (h - 10) + 5;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Keyword rank graph trending from 42 to 5 over 12 weeks">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>RankFlow · 12wk trend</span>
            <span
              style={{
                ...monoLabel,
                color: "#10B981",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <TrendingUp size={12} /> +37 spots
            </span>
          </div>

          <div style={cardStyle}>
            <div style={{ ...monoLabel, marginBottom: 8 }}>
              "emergency plumber phoenix" · rank
            </div>
            <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={120} style={{ display: "block" }}>
              <defs>
                <linearGradient id="rankflow-fade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={mkt.accent} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={mkt.accent} stopOpacity="0" />
                </linearGradient>
              </defs>
              <motion.path
                d={`${path} L ${w} ${h} L 0 ${h} Z`}
                fill="url(#rankflow-fade)"
                initial={false}
                animate={animate ? { opacity: [0.4, 0.9, 0.4] } : { opacity: 0.7 }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.path
                d={path}
                fill="none"
                stroke={mkt.accent}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                animate={animate ? { pathLength: [0, 1] } : { pathLength: 1 }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
              />
              {/* Latest point dot */}
              <motion.circle
                cx={w}
                cy={(POINTS[POINTS.length - 1] / maxRank) * (h - 10) + 5}
                r={4}
                fill={mkt.accent}
                animate={animate ? { r: [4, 6, 4] } : { r: 4 }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
            </svg>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 8,
                fontFamily: MONO,
                fontSize: 10,
                color: mkt.onDarkFaint,
                letterSpacing: "0.04em",
              }}
            >
              <span>Wk 1 · #42</span>
              <span style={{ color: mkt.accent, fontWeight: 700 }}>Wk 12 · #5</span>
            </div>
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
