import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";

const CAPSULES = [
  { background: "#4A7C6F" },
  { background: "#5E9485" },
  { background: "#3B6358" },
];

const CAP_W = 7;
const CAP_H = 26;
const CAP_GAP = 3;

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
        width: 148,
        height: 44,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: CAP_GAP,
          flexShrink: 0,
          height: CAP_H,
        }}
      >
        {CAPSULES.map((cap, i) => (
          <motion.div
            key={i}
            initial={
              prefersReduced
                ? { opacity: 1, y: 0 }
                : { opacity: 0, y: 6 }
            }
            animate={{ opacity: 1, y: 0 }}
            transition={
              prefersReduced
                ? { duration: 0 }
                : {
                    duration: 0.35,
                    delay: i * 0.2,
                    ease: [0.25, 0.1, 0.25, 1],
                  }
            }
            style={{
              width: CAP_W,
              height: CAP_H,
              borderRadius: 9999,
              background: cap.background,
              flexShrink: 0,
            }}
          />
        ))}
      </div>

      <motion.div
        initial={prefersReduced ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={
          prefersReduced
            ? { duration: 0 }
            : { duration: 0.3, delay: 0.5, ease: "easeOut" }
        }
        style={{ display: "flex", flexDirection: "column", gap: 0, lineHeight: 1 }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "#111111",
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
          }}
        >
          WeFixTrades
        </span>
      </motion.div>
    </Link>
  );
}
