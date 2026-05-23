/**
 * AdFlowDemo — cost-per-lead drops in real-time over 4 weeks.
 * Sparkline + ticker showing $42 → $28 → $19.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Megaphone, TrendingDown } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useDemoLoop, DemoFrame, DemoHeader } from "./_shared";

const WEEKS = [
  { label: "Wk 1", cpl: 42, leads: 12, spend: 504, color: "#EF4444" },
  { label: "Wk 2", cpl: 31, leads: 18, spend: 558, color: "#F59E0B" },
  { label: "Wk 3", cpl: 24, leads: 26, spend: 624, color: "#A3E635" },
  { label: "Wk 4", cpl: 19, leads: 38, spend: 722, color: "#10B981" },
];

export default function AdFlowDemo() {
  const loop = useDemoLoop({ steps: WEEKS.length, stepMs: 1400 });
  const cur = WEEKS[loop.step];

  return (
    <DemoFrame
      ref={loop.ref}
      onMouseEnter={loop.onMouseEnter}
      onMouseLeave={loop.onMouseLeave}
      ariaLabel="Animated demo: cost-per-lead dropping from $42 to $19 over four weeks of AI-tuned ad campaigns."
      maxWidth={420}
    >
      <DemoHeader icon={<Megaphone size={16} />} title="AdFlow" subtitle="Google + Meta · live" status="Tuning" />
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* CPL big number */}
        <div style={{ padding: "16px 18px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: `1px solid ${mkt.onDarkBorder}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>Cost per lead</span>
            <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint }}>{cur.label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <AnimatePresence mode="wait">
              <motion.span
                key={cur.cpl}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.32 }}
                style={{ fontSize: 36, fontWeight: 700, color: cur.color, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}
              >
                ${cur.cpl}
              </motion.span>
            </AnimatePresence>
            {loop.step > 0 && (
              <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 600, color: "#10B981", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <TrendingDown size={12} />
                −{Math.round(((WEEKS[0].cpl - cur.cpl) / WEEKS[0].cpl) * 100)}%
              </span>
            )}
          </div>
        </div>

        {/* Bar chart by week */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, height: 80, padding: "8px 4px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: `1px solid ${mkt.onDarkBorder}` }}>
          {WEEKS.map((w, i) => {
            const visible = loop.step >= i;
            const height = (w.cpl / WEEKS[0].cpl) * 100;
            return (
              <div key={w.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={visible ? { height: `${height}%`, opacity: 1 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  style={{ width: "100%", background: w.color, borderRadius: "4px 4px 0 0", minHeight: 4 }}
                />
                <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint }}>{w.label}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Mini value={cur.leads} label="Leads / wk" />
          <Mini value={`$${cur.spend}`} label="Spend / wk" />
        </div>
      </div>
    </DemoFrame>
  );
}

function Mini({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${mkt.onDarkBorder}` }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={String(value)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{ fontSize: 16, fontWeight: 700, color: mkt.accent, fontVariantNumeric: "tabular-nums" }}
        >{value}</motion.div>
      </AnimatePresence>
      <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
    </div>
  );
}
