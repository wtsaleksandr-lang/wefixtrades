/**
 * DoorInstallerHeroAnimation — old door → swap → install timer 30 min badge.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Clock } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function DoorInstallerHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Old door swings out, new door swings in, install timer reads 30 minutes">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For door installers · same-day swap</span>

          {/* Doorway */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 130,
              background: "#0f172a",
              border: `1px solid ${mkt.onDarkBorder}`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                position: "relative",
                width: 70,
                height: 110,
                background: "#1F2937",
                border: "3px solid #4B5563",
                borderRadius: 2,
                perspective: 400,
              }}
            >
              {/* Old door — swings out */}
              <motion.div
                initial={false}
                animate={{
                  rotateY: phase === 0 ? 0 : -85,
                  opacity: phase === 0 ? 1 : 0,
                }}
                transition={{ duration: 0.6 }}
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, #7c2d12 0%, #5C2208 100%)",
                  transformOrigin: "left center",
                  border: "1px solid #3D1604",
                }}
              />
              {/* New door — swings in */}
              <motion.div
                initial={false}
                animate={{
                  rotateY: phase < 1 ? 85 : 0,
                  opacity: phase < 1 ? 0 : 1,
                }}
                transition={{ duration: 0.6, delay: 0.2 }}
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, #1e3a8a 0%, #1e40af 100%)",
                  transformOrigin: "left center",
                  border: "1px solid #1e3a8a",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#FCD34D",
                  }}
                />
              </motion.div>
            </div>
          </div>

          <motion.div
            animate={{ opacity: phase === 2 ? 1 : 0.3 }}
            style={{
              ...cardStyle,
              background: "rgba(16,185,129,0.16)",
              border: "1px solid rgba(16,185,129,0.5)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Clock size={16} color="#10B981" />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 14, fontWeight: 700, color: mkt.onDark }}>
              30 min install · sealed
            </div>
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
