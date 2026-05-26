/**
 * CabinetInstallerHeroAnimation — empty wall → cabinets fade in stage-by-stage → install checkmark.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Check } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function CabinetInstallerHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(4, 1300, inView && !reduced);
  const phase = reduced ? 3 : beat;

  // Cabinet boxes: 6 base + 4 upper
  const cabinets = [
    { x: 4, y: 60, w: 30, h: 38, row: 0 },
    { x: 36, y: 60, w: 30, h: 38, row: 0 },
    { x: 68, y: 60, w: 30, h: 38, row: 1 },
    { x: 100, y: 60, w: 30, h: 38, row: 1 },
    { x: 132, y: 60, w: 30, h: 38, row: 2 },
    { x: 164, y: 60, w: 30, h: 38, row: 2 },
    { x: 4, y: 6, w: 30, h: 38, row: 0 },
    { x: 36, y: 6, w: 30, h: 38, row: 0 },
    { x: 132, y: 6, w: 30, h: 38, row: 2 },
    { x: 164, y: 6, w: 30, h: 38, row: 2 },
  ];

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Empty kitchen wall fills with cabinets stage by stage, install complete checkmark">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For cabinet installers · staged build</span>

          {/* Wall + cabinets */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 110,
              background: "linear-gradient(180deg, #1f2937 0%, #111827 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 110" preserveAspectRatio="none">
              {cabinets.map((c, i) => {
                const visible = c.row <= phase - 1;
                return (
                  <motion.rect
                    key={i}
                    initial={false}
                    animate={{ opacity: visible ? 1 : 0 }}
                    transition={{ duration: 0.4 }}
                    x={c.x}
                    y={c.y}
                    width={c.w}
                    height={c.h}
                    rx={2}
                    fill="#C8A574"
                    stroke="#6B4A22"
                    strokeWidth={1}
                  />
                );
              })}
            </svg>
          </div>

          <div style={cardStyle}>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Install · linear ft</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: mkt.onDark }}>
                {phase === 0 ? "0" : phase === 1 ? "6" : phase === 2 ? "12" : "18"} ft
              </span>
              <span style={{ fontFamily: MONO, fontSize: 14, color: mkt.accent }}>
                ${phase === 0 ? "0" : phase === 1 ? "2,160" : phase === 2 ? "4,320" : "6,480"}
              </span>
            </div>
          </div>

          <motion.div
            animate={{ opacity: phase === 3 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.16)",
              border: "1px solid rgba(16,185,129,0.5)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Check size={16} color="#10B981" />
            <div style={{ fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>Install complete · sign-off sent</div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
