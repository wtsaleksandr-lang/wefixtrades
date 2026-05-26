/**
 * MovingServicesHeroAnimation — boxes load into truck → calendar booked → arrive at destination.
 */
import { motion } from "framer-motion";
import { useRef } from "react";
import { Truck, MapPin } from "lucide-react";
import { AnimationFrame, cardStyle, monoLabel, useBeat, useInView, usePrefersReducedMotion } from "../_shared";
import { mkt } from "@/theme/tokens";
import { MONO } from "@/components/effortel-blocks";

export default function MovingServicesHeroAnimation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref);
  const reduced = usePrefersReducedMotion();
  const beat = useBeat(3, 1900, inView && !reduced);
  const phase = reduced ? 2 : beat;

  return (
    <div ref={ref} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <AnimationFrame ariaLabel="Boxes load into moving truck, route drawn on map, truck arrives at destination">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
          <span style={monoLabel}>For moving services · load to deliver</span>

          {/* Truck scene */}
          <div
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              height: 130,
              background: "linear-gradient(180deg, #0c4a6e 0%, #0f172a 100%)",
              border: `1px solid ${mkt.onDarkBorder}`,
            }}
          >
            <svg width="100%" height="100%" viewBox="0 0 200 130">
              {/* Ground */}
              <rect x="0" y="100" width="200" height="30" fill="#1F2937" />
              {/* Route line */}
              <motion.line
                animate={{ x2: phase < 2 ? 60 : 180 }}
                transition={{ duration: 0.7 }}
                x1={20}
                y1={108}
                y2={108}
                stroke="#FCD34D"
                strokeWidth="2"
                strokeDasharray="4,3"
              />
              {/* Start pin */}
              <circle cx="20" cy="108" r="3" fill="#10B981" />
              {/* End pin */}
              <circle cx="180" cy="108" r="3" fill="#EF4444" />
              {/* Truck */}
              <motion.g
                animate={{ x: phase === 0 ? 0 : phase === 1 ? 60 : 140 }}
                transition={{ duration: 0.7 }}
              >
                {/* Truck body */}
                <rect x="20" y="62" width="50" height="38" fill="#0d3cfc" rx="2" />
                {/* Cab */}
                <rect x="70" y="74" width="18" height="26" fill="#1e3a8a" rx="2" />
                <rect x="73" y="78" width="12" height="10" fill="#60A5FA" />
                {/* Wheels */}
                <circle cx="32" cy="102" r="6" fill="#1F2937" stroke="#9CA3AF" strokeWidth="1.5" />
                <circle cx="60" cy="102" r="6" fill="#1F2937" stroke="#9CA3AF" strokeWidth="1.5" />
                <circle cx="82" cy="102" r="6" fill="#1F2937" stroke="#9CA3AF" strokeWidth="1.5" />
                {/* Boxes loading (visible when stationary) */}
                {phase === 0 && (
                  <>
                    <motion.rect
                      animate={{ y: [62, 56, 62] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                      x={26}
                      width={10}
                      height={10}
                      fill="#92400E"
                    />
                    <rect x={40} y={70} width={10} height={10} fill="#92400E" />
                    <rect x={54} y={66} width={10} height={10} fill="#92400E" />
                  </>
                )}
              </motion.g>
            </svg>
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
            <MapPin size={14} color="#10B981" />
            <div style={{ flex: 1, fontFamily: MONO, fontSize: 12, color: mkt.onDark }}>
              3BR · 18 miles · $1,680 booked
            </div>
            <Truck size={14} color={mkt.accent} />
          </motion.div>
        </div>
      </AnimationFrame>
    </div>
  );
}
