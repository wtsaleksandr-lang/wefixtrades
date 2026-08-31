/**
 * WebCareHeroAnimation — uptime dashboard pulses, security shield rotates.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Shield, Check } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useInView, usePrefersReducedMotion } from "./_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

const UPTIME_BARS = 30;

export default function WebCareHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const animate = inView && !reduced;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame aspect="auto" ariaLabel="Uptime monitor showing 100% green across 30 checks, security shield rotating">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={monoLabel}>WebCare · monitor</span>
            <span style={{ ...monoLabel, color: "#10B981" }}>● 100%</span>
          </div>

          {/* Uptime bar row */}
          <div style={{ ...cardStyle, padding: "12px 12px" }}>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Last 30 days · uptime</div>
            <div style={{ display: "flex", gap: 2, height: 28, alignItems: "flex-end" }}>
              {Array.from({ length: UPTIME_BARS }).map((_, i) => (
                <motion.span
                  key={i}
                  animate={animate ? { scaleY: [0.85, 1, 0.85] } : { scaleY: 1 }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    delay: i * 0.05,
                    ease: "easeInOut",
                  }}
                  style={{
                    flex: 1,
                    background: "#10B981",
                    borderRadius: 2,
                    height: "100%",
                    transformOrigin: "bottom",
                    opacity: 0.85,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: mkt.onDarkFaint,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Last incident</span>
              <span style={{ color: "#10B981", fontFamily: MONO }}>NEVER</span>
            </div>
          </div>

          {/* Rotating shield */}
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
            <motion.div
              animate={animate ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `radial-gradient(circle, rgba(13,60,252,0.4) 0%, transparent 70%)`,
              }}
            >
              <Shield size={32} color={mkt.accent} strokeWidth={2} />
            </motion.div>
          </div>

          {/* Security checklist — fills the lower half so the card reads as a
              full monitor dashboard instead of a mostly-empty frame. */}
          <div style={{ ...cardStyle, padding: "10px 12px" }}>
            {/* Cadences must match the jobs that actually run: uptime every
                15 min (webcareHealthWorker), backups + malware scan weekly
                on Sunday (webcareBackupWorker). This said "Daily backups"
                while no backup job existed at all. */}
            {[
              { label: "SSL certificate", value: "Valid" },
              { label: "Plugin updates", value: "Current" },
              { label: "Weekly backups", value: "On" },
              { label: "Malware scan", value: "Clear" },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 0",
                  fontSize: 12,
                }}
              >
                <span style={{ color: mkt.onDarkMuted }}>{row.label}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#10B981", fontFamily: MONO, fontSize: 11 }}>
                  <Check size={14} /> {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </AnimationFrame>
    </div>
  );
}
