/**
 * SepticServicesHeroAnimation — underground tank → "Service due" alert → calendar booked.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Bell, Calendar } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function SepticServicesHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Underground septic tank diagram, service-due alert appears, pump appointment booked">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For septic services · pump cycle</span>

          {/* Cross-section: yard + tank */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 120,
              background: "linear-gradient(180deg, #166534 0%, #92400E 40%, #5C2208 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 120">
              {/* Ground line */}
              <line x1="0" y1="38" x2="200" y2="38" stroke="#3F2A14" strokeWidth="2" />
              {/* House */}
              <polygon points="20,38 35,28 50,38" fill="#7c2d12" />
              <rect x="22" y="38" width="26" height="0" />
              {/* Pipe */}
              <line x1="48" y1="42" x2="110" y2="68" stroke="#9CA3AF" strokeWidth="3" />
              {/* Tank */}
              <rect x="110" y="58" width="68" height="32" fill="#374151" stroke="#9CA3AF" strokeWidth="1.5" rx="2" />
              {/* Fill level */}
              <motion.rect
                initial={false}
                animate={{ height: phase === 0 ? 14 : phase === 1 ? 24 : 4 }}
                transition={{ duration: 0.6 }}
                x={112}
                y={(phase === 0 ? 74 : phase === 1 ? 64 : 84)}
                width={64}
                fill={phase === 1 ? "#92400E" : "#6B7280"}
              />
              {/* Lid indicator */}
              <rect x="138" y="56" width="14" height="3" fill="#FCD34D" />
            </svg>
          </div>

          {phase < 2 ? (
            <motion.div
              animate={phase === 1 ? { boxShadow: ["0 0 0 0 rgba(245,158,11,0.5)", "0 0 0 10px rgba(245,158,11,0)"] } : {}}
              transition={{ duration: 1.1, repeat: phase === 1 ? Infinity : 0 }}
              style={{
                ...cardStyle,
                background: phase === 1 ? "rgba(245,158,11,0.18)" : cardStyle.background,
                border: `1px solid ${phase === 1 ? "rgba(245,158,11,0.5)" : mkt.onDarkBorder}`,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Bell size={14} color={phase === 1 ? "#F59E0B" : mkt.accent} />
              <div style={{ flex: 1, fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>
                {phase === 0 ? "Last pump · 38 mo" : "Service due · 1,000-gal tank"}
              </div>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1 }}
              style={{
                ...cardStyle,
                background: "rgba(16,185,129,0.16)",
                border: "1px solid rgba(16,185,129,0.5)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Calendar size={14} color="#10B981" />
              <div style={{ fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>Pump · Thu 10 AM · $385</div>
            </motion.div>
          )}
        </div>
      </AnimationFrame>
    </div>
  );
}
