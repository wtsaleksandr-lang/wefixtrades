/**
 * CitationTrackerHeroAnimation (MapGuard Suite bonus) — NAP mismatch found → fixed.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const DIRECTORIES = ["Yelp", "Yellow Pages", "Foursquare", "BBB", "Angi", "HomeAdvisor"];

export default function CitationTrackerHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1700, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Citation Tracker scans directories, finds NAP mismatch, fixes automatically">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>Citation tracker · scan</span>
            <motion.span
              animate={phase === 0 ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
              transition={{ duration: 0.9, repeat: Infinity }}
              style={{ ...monoLabel, color: mkt.accent }}
            >
              ◉ scanning
            </motion.span>
          </div>

          {/* Directories list */}
          <div style={{ ...cardStyle, padding: "10px 12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {DIRECTORIES.map((d, i) => {
                const hasIssue = i === 2; // Foursquare flagged
                const fixed = phase === 2 && hasIssue;
                return (
                  <div
                    key={d}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "4px 0",
                      fontSize: 12,
                      color: mkt.onDark,
                      borderBottom:
                        i < DIRECTORIES.length - 1
                          ? `1px solid ${mkt.onDarkBorder}`
                          : "none",
                    }}
                  >
                    <span>{d}</span>
                    {hasIssue ? (
                      fixed ? (
                        <span
                          style={{
                            ...monoLabel,
                            color: "#10B981",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Check size={12} /> fixed
                        </span>
                      ) : (
                        <motion.span
                          animate={
                            phase === 1 ? { color: ["#F59E0B", "#EF4444", "#F59E0B"] } : { color: "#F59E0B" }
                          }
                          transition={{ duration: 0.9, repeat: phase === 1 ? Infinity : 0 }}
                          style={{
                            ...monoLabel,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <AlertTriangle size={12} /> NAP mismatch
                        </motion.span>
                      )
                    ) : (
                      <span style={{ ...monoLabel, color: "#10B981" }}>● OK</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <motion.div
            initial={false}
            animate={{
              opacity: phase === 2 ? 1 : 0.2,
              y: phase === 2 ? 0 : 6,
            }}
            transition={{ duration: 0.4 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.14)",
              border: "1px solid rgba(16,185,129,0.5)",
              fontSize: 12,
              color: mkt.onDark,
              fontFamily: MONO,
              letterSpacing: "0.04em",
              textAlign: "center",
            }}
          >
            Fixed automatically · 1 of 1
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
