/**
 * BookFlowDemo — calendar slots filling as customers self-book.
 * Each step: a new slot turns from "open" → "booked".
 */

import { motion, AnimatePresence } from "framer-motion";
import { Calendar as CalIcon, Check } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useDemoLoop, DemoFrame, DemoHeader } from "./_shared";

const SLOTS = [
  { day: "Mon", time: "9:00", customer: "Sarah K." },
  { day: "Mon", time: "11:30" },
  { day: "Tue", time: "10:00", customer: "Mike R." },
  { day: "Tue", time: "14:00", customer: "Diana L." },
  { day: "Wed", time: "9:00" },
  { day: "Wed", time: "13:00", customer: "Chris T." },
];

export default function BookFlowDemo() {
  const loop = useDemoLoop({ steps: 5, stepMs: 1300 });
  // Each step books one new slot (the ones with `customer` defined)
  const bookOrder = SLOTS.map((s, i) => ({ ...s, index: i })).filter(s => s.customer);
  const bookedCount = Math.min(loop.step + 1, bookOrder.length);

  return (
    <DemoFrame
      ref={loop.ref}
      onMouseEnter={loop.onMouseEnter}
      onMouseLeave={loop.onMouseLeave}
      ariaLabel="Animated demo: customers self-book time slots in a real calendar, filling the schedule throughout the week."
      maxWidth={420}
    >
      <DemoHeader icon={<CalIcon size={16} />} title="BookFlow" subtitle="this week · live" status="Open" />
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {SLOTS.map((s, i) => {
            const slot = bookOrder.find(b => b.index === i);
            const booked = slot && bookOrder.indexOf(slot) < bookedCount;
            return (
              <motion.div
                key={i}
                animate={{
                  background: booked ? mkt.accent : "rgba(255,255,255,0.04)",
                  color: booked ? mkt.dark : mkt.onDarkMuted,
                  borderColor: booked ? mkt.accent : mkt.onDarkBorder,
                }}
                transition={{ duration: 0.4 }}
                style={{
                  padding: "10px 12px", borderRadius: 10,
                  border: "1px solid", display: "flex", flexDirection: "column", gap: 2,
                }}
              >
                <span style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.8 }}>{s.day} · {s.time}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {booked ? s.customer : "Open"}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Booking confirmation toast */}
        <AnimatePresence mode="wait">
          {bookedCount > 0 && bookOrder[bookedCount - 1] && (
            <motion.div
              key={bookedCount}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(16,185,129,0.10)", border: `1px solid rgba(16,185,129,0.28)`, fontSize: 12, color: "#10B981", fontWeight: 600 }}
            >
              <Check size={14} strokeWidth={3} />
              {bookOrder[bookedCount - 1].customer} booked {bookOrder[bookedCount - 1].day} {bookOrder[bookedCount - 1].time}
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: `1px solid ${mkt.onDarkBorder}` }}>
          <span style={{ fontSize: 11, color: mkt.onDarkFaint, fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>Today's revenue</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: mkt.accent, fontVariantNumeric: "tabular-nums" }}>${bookedCount * 310}</span>
        </div>
      </div>
    </DemoFrame>
  );
}
