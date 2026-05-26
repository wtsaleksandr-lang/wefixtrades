/**
 * LocksmithHeroAnimation — "locksmith near me" → top-3 → 4-min ETA.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { MapPin, KeyRound } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function LocksmithHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Locked out search lands at top-3 result, TradeLine answers with 4 minute ETA">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For locksmiths · near-me</span>

          {/* Search bar */}
          <div
            style={{
              ...cardStyle,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: mkt.onDarkMuted,
            }}
          >
            <MapPin size={14} color={mkt.accent} />
            <span style={{ fontFamily: MONO, letterSpacing: "0.03em" }}>"locksmith near me"</span>
          </div>

          {/* Results list */}
          <div style={{ ...cardStyle, padding: "10px 12px" }}>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Top results</div>
            {[
              { name: "Your business", rank: 1, you: true },
              { name: "Quick Lock Pros", rank: 2 },
              { name: "City Keys 24/7", rank: 3 },
            ].map((row) => (
              <motion.div
                key={row.name}
                animate={
                  row.you && phase >= 1
                    ? { background: ["rgba(13,60,252,0.0)", "rgba(13,60,252,0.18)", "rgba(13,60,252,0.0)"] }
                    : {}
                }
                transition={{ duration: 1.4, repeat: Infinity }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "5px 8px",
                  borderRadius: 6,
                  fontSize: 12,
                  color: row.you ? mkt.onDark : mkt.onDarkMuted,
                  fontWeight: row.you ? 700 : 400,
                }}
              >
                <span>
                  <span style={{ fontFamily: MONO, color: mkt.accent, marginRight: 8 }}>
                    #{row.rank}
                  </span>
                  {row.name}
                </span>
              </motion.div>
            ))}
          </div>

          {/* ETA */}
          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.14)",
              border: "1px solid rgba(16,185,129,0.5)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <KeyRound size={16} color="#10B981" />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 13, fontWeight: 700, color: mkt.onDark }}>
              "I'm 4 min away" · auto-reply
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
