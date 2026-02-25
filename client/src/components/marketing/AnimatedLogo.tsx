import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";

const SHAPES = [
  { restHeight: 20, peakHeight: 28, background: "#2D6A4F" },
  { restHeight: 26, peakHeight: 32, background: "#40916C" },
  { restHeight: 22, peakHeight: 18, background: "#1B4332" },
];

export default function AnimatedLogo() {
  const prefersReduced = useReducedMotion();

  return (
    <Link
      href="/"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        textDecoration: "none",
        width: 168,
        height: 44,
        flexShrink: 0,
      }}
    >
      {/* Mark — 3 vertical capsule shapes, equaliser loop */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 3,
          flexShrink: 0,
          height: 34,
        }}
      >
        {SHAPES.map((shape, i) => (
          <motion.div
            key={i}
            initial={
              prefersReduced
                ? { opacity: 1, x: 0, filter: "blur(0px)", height: shape.restHeight }
                : { opacity: 0, x: 8, filter: "blur(3px)", height: shape.restHeight }
            }
            animate={{
              opacity: 1,
              x: 0,
              filter: "blur(0px)",
              height: prefersReduced
                ? shape.restHeight
                : [shape.restHeight, shape.peakHeight, shape.restHeight],
            }}
            transition={
              prefersReduced
                ? { duration: 0 }
                : {
                    opacity: { duration: 0.3, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
                    x: { duration: 0.3, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
                    filter: { duration: 0.3, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
                    height: {
                      duration: 1.6,
                      delay: i * 0.28,
                      repeat: Infinity,
                      repeatType: "mirror",
                      ease: "easeInOut",
                    },
                  }
            }
            style={{
              width: 7,
              borderRadius: 9999,
              background: shape.background,
              transformOrigin: "bottom",
            }}
          />
        ))}
      </div>

      {/* Brand text — one-shot slide-in only */}
      <motion.div
        initial={prefersReduced ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={
          prefersReduced
            ? { duration: 0 }
            : { delay: 0.36, duration: 0.28, ease: [0.22, 1, 0.36, 1] }
        }
        style={{ display: "flex", flexDirection: "column", gap: 0, lineHeight: 1 }}
      >
        <span
          style={{
            fontSize: 17,
            fontWeight: 800,
            color: "#0F172A",
            letterSpacing: "-0.02em",
          }}
        >
          QuickQuote
          <span style={{ color: "#2D6A4F" }}>Pro</span>
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#94A3B8",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginTop: 1,
          }}
        >
          by WeFixTrades
        </span>
      </motion.div>
    </Link>
  );
}
