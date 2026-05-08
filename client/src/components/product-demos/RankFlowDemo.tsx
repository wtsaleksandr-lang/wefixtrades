/**
 * RankFlowDemo — keyword ranks climbing.
 * Position numbers tick down (47 → 12 → 3 → 1).
 */

import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useDemoLoop, DemoFrame, DemoHeader } from "./_shared";

const KEYWORDS = [
  { q: "emergency plumber austin", positions: [47, 23, 12, 5, 3] },
  { q: "drain cleaning 78704",     positions: [18, 9, 6, 2, 1] },
  { q: "water heater repair",      positions: [62, 34, 18, 11, 7] },
  { q: "burst pipe weekend",       positions: [41, 28, 19, 14, 12] },
];

export default function RankFlowDemo() {
  const loop = useDemoLoop({ steps: KEYWORDS[0].positions.length, stepMs: 1300 });

  return (
    <DemoFrame
      ref={loop.ref}
      onMouseEnter={loop.onMouseEnter}
      onMouseLeave={loop.onMouseLeave}
      ariaLabel="Animated demo: keyword rank numbers climbing from low positions to top of Google search results."
      maxWidth={420}
    >
      <DemoHeader icon={<TrendingUp size={16} />} title="RankFlow" subtitle="47 keywords tracked" status="Live" />
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>Top searches</span>
          <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint }}>30-day trend</span>
        </div>
        {KEYWORDS.map((k, i) => {
          const pos = k.positions[loop.step];
          const start = k.positions[0];
          const delta = start - pos;
          return (
            <div key={k.q} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${mkt.onDarkBorder}` }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: mkt.onDark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{k.q}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={pos}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.32 }}
                    style={{ fontSize: 18, fontWeight: 700, color: pos <= 3 ? "#10B981" : pos <= 10 ? mkt.accent : mkt.onDarkMuted, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}
                  >
                    #{pos}
                  </motion.span>
                </AnimatePresence>
                {delta > 0 && (
                  <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: "rgba(16,185,129,0.15)", color: "#10B981" }}>
                    ↑ {delta}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
          <span style={{ color: mkt.onDarkFaint, fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>Organic clicks 30d</span>
          <span style={{ color: "#10B981", fontWeight: 700, fontSize: 14 }}>+38%</span>
        </div>
      </div>
    </DemoFrame>
  );
}
