/**
 * ReputationShieldDemo — review feed scrolling up.
 * New 5-star arrives → AI types reply → reply posts.
 * Periodically a 1-star comes in and gets escalated.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Star, ShieldCheck } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useDemoLoop, DemoFrame, DemoHeader } from "./_shared";

interface Review {
  who: string;
  stars: number;
  text: string;
  state: "new" | "replying" | "replied" | "flagged";
}

const SEQUENCE: Review[] = [
  { who: "Sarah K.", stars: 5, text: "Same-day fix on a burst pipe. Saved us thousands.", state: "new" },
  { who: "Sarah K.", stars: 5, text: "Same-day fix on a burst pipe. Saved us thousands.", state: "replying" },
  { who: "Sarah K.", stars: 5, text: "Same-day fix on a burst pipe. Saved us thousands.", state: "replied" },
  { who: "Mike R.",  stars: 2, text: "Took longer than expected and the price went up mid-job.", state: "flagged" },
  { who: "Diana L.", stars: 5, text: "Polite, fast, and explained everything. Will recommend!", state: "replied" },
];

export default function ReputationShieldDemo() {
  const loop = useDemoLoop({ steps: SEQUENCE.length, stepMs: 1800 });
  const r = SEQUENCE[loop.step];

  return (
    <DemoFrame
      ref={loop.ref}
      onMouseEnter={loop.onMouseEnter}
      onMouseLeave={loop.onMouseLeave}
      ariaLabel="Animated demo: review feed showing AI drafting replies to 5-star reviews and flagging 1-star reviews for human review."
      maxWidth={420}
    >
      <DemoHeader icon={<ShieldCheck size={16} />} title="ReputationShield" subtitle="247 reviews · 4.9★" status="Live" />
      <div style={{ padding: 20, minHeight: 320, display: "flex", flexDirection: "column", gap: 14 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={loop.step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{
              padding: 14, borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${r.state === "flagged" ? "rgba(239,68,68,0.35)" : mkt.onDarkBorder}`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.08)", color: mkt.onDark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                  {r.who.charAt(0)}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: mkt.onDark }}>{r.who}</span>
              </div>
              <div style={{ display: "flex", gap: 1 }}>
                {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={10} fill={i <= r.stars ? "#F59E0B" : "transparent"} stroke="#F59E0B" strokeWidth={1.5} />)}
              </div>
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.5, color: mkt.onDarkMuted, marginBottom: 10 }}>"{r.text}"</p>

            {/* State pill */}
            {r.state === "new" && <Pill color="#F59E0B" text="● Just landed" />}
            {r.state === "replying" && <Pill color={mkt.accent} text="● AI drafting reply…" pulse />}
            {r.state === "replied" && <Pill color="#10B981" text="✓ AI replied" />}
            {r.state === "flagged" && <Pill color="#EF4444" text="⚑ Flagged for you — texting your phone" />}
          </motion.div>
        </AnimatePresence>

        <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <Mini value="< 30m" label="Avg reply" />
          <Mini value="100%" label="1★ caught" />
          <Mini value="+1.2★" label="30-day lift" />
        </div>
      </div>
    </DemoFrame>
  );
}

function Pill({ color, text, pulse }: { color: string; text: string; pulse?: boolean }) {
  return (
    <motion.div
      animate={pulse ? { opacity: [0.6, 1, 0.6] } : {}}
      transition={pulse ? { duration: 1.4, repeat: Infinity } : {}}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 10, fontFamily: "'DM Mono', monospace", fontWeight: 500,
        letterSpacing: "0.08em", textTransform: "uppercase", color,
      }}
    >
      {text}
    </motion.div>
  );
}

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${mkt.onDarkBorder}` }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: mkt.accent, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
    </div>
  );
}
