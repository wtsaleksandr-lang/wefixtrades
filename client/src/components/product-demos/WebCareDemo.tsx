/**
 * WebCareDemo — uptime monitor with green dots filling, plugin auto-update.
 */

import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Check } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useDemoLoop, DemoFrame, DemoHeader } from "./_shared";

const CHECK_COUNT = 18; // 18 dots = roughly 4.5 hours of 15-min checks

export default function WebCareDemo() {
  // 5 steps: dots progress through full set, then "plugin updated" notification
  const loop = useDemoLoop({ steps: 5, stepMs: 1500 });
  const visibleDots = Math.floor((loop.step + 1) / 5 * CHECK_COUNT);

  return (
    <DemoFrame
      ref={loop.ref}
      onMouseEnter={loop.onMouseEnter}
      onMouseLeave={loop.onMouseLeave}
      ariaLabel="Animated demo: uptime check dots filling green over the past 4.5 hours, plugin auto-updating, security and SSL check passing."
      maxWidth={420}
    >
      <DemoHeader icon={<ShieldCheck size={16} />} title="WebCare" subtitle="your-trade.com · Monitored" status="Healthy" />
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Uptime dots */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.08em", textTransform: "uppercase" }}>Last 4.5 hours</span>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#10B981" }}>● All passing</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: CHECK_COUNT }).map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  background: i < visibleDots ? "#10B981" : "rgba(255,255,255,0.06)",
                  scale: i < visibleDots ? 1 : 0.8,
                }}
                transition={{ duration: 0.3, delay: (i % 6) * 0.04 }}
                style={{ flex: 1, height: 24, borderRadius: 4 }}
              />
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <Mini label="Checks 30d" value="2,880" color="#10B981" />
          <Mini label="Updates" value="47" color={mkt.accent} />
          <Mini label="Security checks" value="OK" color={mkt.accent} />
        </div>

        {/* Auto-update toast */}
        <AnimatePresence>
          {loop.step >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(13,60,252,0.10)", border: `1px solid rgba(13,60,252,0.24)`, fontSize: 12, color: mkt.accent, fontWeight: 600 }}
            >
              <Check size={14} strokeWidth={3} /> Plugin auto-updated · WP Forms 1.8.4 → 1.8.5
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {loop.step >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(16,185,129,0.10)", border: `1px solid rgba(16,185,129,0.28)`, fontSize: 12, color: "#10B981", fontWeight: 600 }}
            >
              <Check size={14} strokeWidth={3} /> Security & SSL check passed · no issues found
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DemoFrame>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${mkt.onDarkBorder}` }}>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
    </div>
  );
}
