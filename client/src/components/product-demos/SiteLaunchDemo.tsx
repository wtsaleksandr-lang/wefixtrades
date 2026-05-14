/**
 * SiteLaunchDemo — wireframe morphs into styled page.
 * Step 0: gray boxes (wireframe)
 * Step 1: hero block fills with imagery
 * Step 2: text appears
 * Step 3: button styles apply
 * Step 4: "Launched" badge
 */

import { motion, AnimatePresence } from "framer-motion";
import { Globe, Check } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { useDemoLoop, DemoFrame, DemoHeader } from "./_shared";

export default function SiteLaunchDemo() {
  const loop = useDemoLoop({ steps: 5, stepMs: 1300 });
  const s = loop.step;

  return (
    <DemoFrame
      ref={loop.ref}
      onMouseEnter={loop.onMouseEnter}
      onMouseLeave={loop.onMouseLeave}
      ariaLabel="Animated demo: a wireframe morphing into a fully styled, ranked, and launched website."
      maxWidth={420}
    >
      <DemoHeader icon={<Globe size={16} />} title="SiteLaunch" subtitle={s >= 4 ? "your-trade.com" : "Building site…"} status={s >= 4 ? "Live" : `Day ${s + 2}`} />
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Browser chrome */}
        <div style={{ borderRadius: 10, background: "#0d1517", border: `1px solid ${mkt.onDarkBorder}`, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 6, borderBottom: `1px solid ${mkt.onDarkBorder}` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF5F57" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FEBC2E" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#28C840" }} />
            <div style={{ marginLeft: 10, flex: 1, fontSize: 10, fontFamily: "'DM Mono', monospace", color: mkt.onDarkFaint, opacity: s >= 4 ? 1 : 0.4 }}>
              {s >= 4 ? "https://your-trade.com" : "127.0.0.1:dev/preview"}
            </div>
          </div>

          {/* Hero block */}
          <motion.div
            animate={{
              background: s >= 1 ? "linear-gradient(135deg, #0d3cfc 0%, #2D6A4F 100%)" : "rgba(255,255,255,0.06)",
            }}
            transition={{ duration: 0.5 }}
            style={{ height: 110, padding: 18, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}
          >
            {/* Heading skeleton → real text */}
            <motion.div
              animate={{ width: s >= 2 ? "70%" : "50%", opacity: 1, color: s >= 1 ? "#0d1514" : mkt.onDarkFaint }}
              style={{
                height: s >= 2 ? "auto" : 14,
                background: s >= 2 ? "transparent" : "rgba(255,255,255,0.18)",
                borderRadius: 4,
                fontSize: 16, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.02em",
              }}
            >
              {s >= 2 ? "Your trade. Live online in a week." : ""}
            </motion.div>
            {/* Subhead skeleton → real text */}
            <motion.div
              animate={{ width: s >= 2 ? "85%" : "70%" }}
              style={{
                height: s >= 2 ? "auto" : 8,
                background: s >= 2 ? "transparent" : "rgba(255,255,255,0.12)",
                borderRadius: 4,
                fontSize: 11, color: s >= 1 ? "rgba(13,21,20,0.7)" : "transparent",
              }}
            >
              {s >= 2 ? "Designed for plumbers, electricians, and roofers." : ""}
            </motion.div>
            {/* Button skeleton → CTA */}
            <motion.div
              animate={{
                background: s >= 3 ? mkt.dark : "rgba(255,255,255,0.18)",
                color: s >= 3 ? mkt.accent : "transparent",
                width: s >= 3 ? 110 : 80,
              }}
              style={{
                marginTop: 4,
                height: s >= 3 ? 28 : 20,
                borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.06em", textTransform: "uppercase",
              }}
            >
              {s >= 3 ? "Get a quote" : ""}
            </motion.div>
          </motion.div>

          {/* Body content rows */}
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {[80, 95, 60].map((w, i) => (
              <motion.div
                key={i}
                animate={{ width: `${w}%`, opacity: s >= 2 ? 0.35 : 0.18 }}
                transition={{ delay: 0.1 * i }}
                style={{ height: 6, background: "rgba(255,255,255,0.18)", borderRadius: 3 }}
              />
            ))}
          </div>
        </div>

        {/* Launched badge */}
        <AnimatePresence>
          {s >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: mkt.accent, color: mkt.dark, fontSize: 12, fontWeight: 700, alignSelf: "flex-start" }}
            >
              <Check size={14} strokeWidth={3} /> Launched · Lighthouse 98 · indexed by Google
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DemoFrame>
  );
}
