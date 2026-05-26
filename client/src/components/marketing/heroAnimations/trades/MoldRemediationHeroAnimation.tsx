/**
 * MoldRemediationHeroAnimation — mold patch → AI scan → before/after split → review.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { ScanLine, Star } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function MoldRemediationHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 2000, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Mold patch on wall scanned by AI, before-after split shows remediation, 5-star review posted">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For mold remediation · scan + remediate</span>

          {/* Before/after wall */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 110,
              background: "#E5E7EB",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 110">
              {/* Mold patches (before) */}
              {phase < 2 && (
                <>
                  <ellipse cx="40" cy="40" rx="14" ry="10" fill="#365314" opacity="0.7" />
                  <ellipse cx="58" cy="62" rx="10" ry="6" fill="#365314" opacity="0.6" />
                  <ellipse cx="32" cy="78" rx="8" ry="5" fill="#365314" opacity="0.5" />
                </>
              )}
              {/* After overlay sliding in */}
              <motion.rect
                initial={false}
                animate={{ width: phase === 0 ? 0 : phase === 1 ? 100 : 200 }}
                transition={{ duration: 0.7 }}
                x={0}
                y={0}
                height={110}
                fill="#F3F4F6"
              />
              {/* Scan line */}
              <motion.line
                animate={phase === 1 ? { x1: [0, 200], x2: [0, 200] } : { x1: 0, x2: 0 }}
                transition={{ duration: 1.4, repeat: phase === 1 ? Infinity : 0 }}
                y1={0}
                y2={110}
                stroke="#0d3cfc"
                strokeWidth="2"
              />
              {/* Divider */}
              <motion.line
                animate={{ x1: phase === 0 ? 0 : phase === 1 ? 100 : 200, x2: phase === 0 ? 0 : phase === 1 ? 100 : 200 }}
                transition={{ duration: 0.7 }}
                y1={0}
                y2={110}
                stroke="#FCD34D"
                strokeWidth="2"
              />
            </svg>
            <div
              style={{
                position: "absolute",
                top: 6,
                left: 8,
                fontFamily: MONO,
                fontSize: 9,
                color: phase < 2 ? "#1F2937" : "#6B7280",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <ScanLine size={12} /> {phase === 0 ? "Active mold" : phase === 1 ? "AI scanning…" : "Cleared · ATP < 30"}
            </div>
          </div>

          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.16)",
              border: "1px solid rgba(16,185,129,0.5)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 2 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={12} color="#FCD34D" fill="#FCD34D" />
              ))}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: mkt.onDark }}>
              "Cleared in 2 days · breathing easy"
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
