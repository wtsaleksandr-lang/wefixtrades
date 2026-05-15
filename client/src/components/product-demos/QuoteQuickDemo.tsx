/**
 * QuoteQuickDemo — animated quote calculator.
 *
 * Step 0: empty form
 * Step 1: trade selected (Plumbing)
 * Step 2: square footage slider moves
 * Step 3: urgency selected
 * Step 4: price ticker animates 0 → 420 → final estimate shown
 * Step 5: "Lead captured" toast
 */

import { motion, AnimatePresence } from "framer-motion";
import { Calculator, Wrench, Check } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useDemoLoop, DemoFrame, DemoHeader } from "./_shared";

const TRADES = ["Plumbing", "HVAC", "Electrical", "Roofing"];
const PRICES = ["$0", "$120", "$280", "$340", "$420"];

export default function QuoteQuickDemo() {
  const loop = useDemoLoop({ steps: 6, stepMs: 1500 });
  const tradeIdx = loop.step >= 1 ? Math.min(Math.floor((loop.step - 1) / 1.4), TRADES.length - 1) : 0;
  const sliderPct = loop.step >= 2 ? 65 : 10;
  const priceIdx = Math.min(loop.step, PRICES.length - 1);

  return (
    <DemoFrame
      ref={loop.ref}
      onMouseEnter={loop.onMouseEnter}
      onMouseLeave={loop.onMouseLeave}
      ariaLabel="Animated demo: a customer selects their trade and job size, the price calculates in real time, and the lead is captured."
      maxWidth={400}
    >
      <DemoHeader
        icon={<Calculator size={16} />}
        title="QuoteQuick"
        subtitle="instantquote.your-trade.com"
      />
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Trade selector */}
        <div>
          <label style={lbl}>Trade</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TRADES.map((t, i) => (
              <motion.span
                key={t}
                animate={{
                  background: i === tradeIdx && loop.step >= 1 ? mkt.accent : "rgba(255,255,255,0.04)",
                  color: i === tradeIdx && loop.step >= 1 ? mkt.dark : mkt.onDarkMuted,
                }}
                transition={{ duration: 0.3 }}
                style={{
                  padding: "6px 12px", borderRadius: 999,
                  border: `1px solid ${i === tradeIdx && loop.step >= 1 ? mkt.accent : mkt.onDarkBorder}`,
                  fontSize: 11, fontWeight: 600,
                }}
              >
                {t}
              </motion.span>
            ))}
          </div>
        </div>

        {/* Square footage slider */}
        <div>
          <label style={lbl}>Job size <span style={{ color: mkt.accent, marginLeft: 4 }}>{Math.round(sliderPct * 30)} sq ft</span></label>
          <div style={{ position: "relative", height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${sliderPct}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{ height: "100%", background: mkt.accent, borderRadius: 999 }}
            />
          </div>
        </div>

        {/* Urgency */}
        <div>
          <label style={lbl}>Urgency</label>
          <div style={{ display: "flex", gap: 6 }}>
            {["Standard", "Same-day", "Emergency"].map((u, i) => (
              <motion.span
                key={u}
                animate={{
                  background: loop.step >= 3 && i === 1 ? mkt.accent : "rgba(255,255,255,0.04)",
                  color: loop.step >= 3 && i === 1 ? mkt.dark : mkt.onDarkMuted,
                }}
                style={{ flex: 1, textAlign: "center", padding: "8px 6px", borderRadius: 8, border: `1px solid ${loop.step >= 3 && i === 1 ? mkt.accent : mkt.onDarkBorder}`, fontSize: 10, fontWeight: 600 }}
              >
                {u}
              </motion.span>
            ))}
          </div>
        </div>

        {/* Price */}
        <div style={{ marginTop: 6, padding: "14px 16px", borderRadius: 12, background: "rgba(13,60,252,0.05)", border: `1px solid rgba(13,60,252,0.18)`, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 11, color: mkt.onDarkMuted, fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>Estimate</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={PRICES[priceIdx]}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              style={{ fontSize: 28, fontWeight: 700, color: mkt.accent, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}
            >
              {PRICES[priceIdx]}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Lead captured toast */}
        <AnimatePresence>
          {loop.step >= 5 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ marginTop: 4, padding: "10px 14px", borderRadius: 10, background: mkt.accent, color: "#FFFFFF", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start" }}
            >
              <Check size={14} strokeWidth={3} /> Lead captured · sales notified
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DemoFrame>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 10, color: mkt.onDarkFaint, fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 };
