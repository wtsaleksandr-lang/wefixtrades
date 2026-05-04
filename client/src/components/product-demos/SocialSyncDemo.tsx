/**
 * SocialSyncDemo — content calendar with multi-channel publishing.
 * Posts appear in time slots. One post simultaneously broadcasts to 4 channels.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Send } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useDemoLoop, DemoFrame, DemoHeader } from "./_shared";

const POSTS = [
  { day: "Mon", time: "9:00", title: "Drain unblock 101", channels: ["F", "I"] },
  { day: "Wed", time: "12:00", title: "Why hot water runs cold", channels: ["F", "I", "L"] },
  { day: "Fri", time: "15:00", title: "Burst pipe? 60-second fix", channels: ["F", "I", "G", "L"] },
];

const CHANNEL = (c: string) => c === "F" ? "#1877F2" : c === "I" ? "#E4405F" : c === "L" ? "#0A66C2" : "#EA4335";
const CHANNEL_LABEL = (c: string) => c === "F" ? "Facebook" : c === "I" ? "Instagram" : c === "L" ? "LinkedIn" : "Google";

export default function SocialSyncDemo() {
  // 4 main steps: 3 posts appearing one by one, then publish-burst
  const loop = useDemoLoop({ steps: 5, stepMs: 1500 });

  return (
    <DemoFrame
      ref={loop.ref}
      onMouseEnter={loop.onMouseEnter}
      onMouseLeave={loop.onMouseLeave}
      ariaLabel="Animated demo: posts appear in a content calendar and broadcast to multiple social channels at once."
      maxWidth={420}
    >
      <DemoHeader icon={<Calendar size={16} />} title="SocialSync" subtitle="this week · 4 posts" status="Live" />
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        {POSTS.map((p, i) => {
          const visible = loop.step >= i + 1;
          const publishing = loop.step === 4 && i === POSTS.length - 1;
          return (
            <AnimatePresence key={i} initial={false}>
              {visible && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.04)", border: `1px solid ${publishing ? "rgba(102,232,250,0.35)" : mkt.onDarkBorder}` }}
                >
                  <div style={{ width: 38, fontSize: 9, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.06em" }}>{p.day}<br/>{p.time}</div>
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: mkt.onDark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {p.channels.map((c) => (
                      <motion.span
                        key={c}
                        animate={publishing ? { scale: [1, 1.25, 1] } : {}}
                        transition={publishing ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.4 } : {}}
                        style={{ width: 18, height: 18, borderRadius: 4, background: CHANNEL(c), color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                      >
                        {c}
                      </motion.span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          );
        })}

        {/* Publish-broadcast notification */}
        <AnimatePresence>
          {loop.step >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ marginTop: 6, padding: "10px 14px", borderRadius: 10, background: "rgba(102,232,250,0.10)", border: `1px solid rgba(102,232,250,0.24)`, fontSize: 11, color: mkt.accent, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}
            >
              <Send size={12} /> Publishing to 4 channels at once · ~2s
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, letterSpacing: "0.06em", textTransform: "uppercase" }}>This week</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>+340% engagement</span>
        </div>
      </div>
    </DemoFrame>
  );
}
