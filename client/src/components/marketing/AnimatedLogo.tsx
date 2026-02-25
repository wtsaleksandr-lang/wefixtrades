import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";

const CAP_W = 8;
const CAP_H = 22;
const CAP_GAP = 5;
const CAP_COLOR = "#1F3B2E";

export default function AnimatedLogo() {
  const prefersReduced = useReducedMotion();

  return (
    <Link
      href="/"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        textDecoration: "none",
        height: 44,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: CAP_GAP,
          flexShrink: 0,
          height: CAP_H + 6,
        }}
      >
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.22 }}
          transition={
            prefersReduced
              ? { duration: 0 }
              : { duration: 0.3, delay: 0.6, ease: "easeOut" }
          }
          style={{
            position: "absolute",
            inset: "-4px -6px",
            borderRadius: 8,
            background:
              "radial-gradient(ellipse at center, rgba(31,59,46,0.35) 0%, transparent 70%)",
            filter: "blur(4px)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            initial={
              prefersReduced
                ? { x: 0, opacity: 1, filter: "blur(0px)" }
                : { x: 8, opacity: 0, filter: "blur(1px)" }
            }
            animate={
              prefersReduced
                ? { x: 0, opacity: 1, filter: "blur(0px)" }
                : {
                    x: [8, -6, 0],
                    opacity: [0, 1, 1],
                    filter: ["blur(1px)", "blur(0px)", "blur(0px)"],
                  }
            }
            transition={
              prefersReduced
                ? { duration: 0 }
                : {
                    duration: 0.5,
                    delay: i * 0.08,
                    times: [0, 0.6, 1],
                    ease: [0.25, 0.1, 0.25, 1],
                  }
            }
            style={{
              width: CAP_W,
              height: CAP_H,
              borderRadius: 999,
              background: CAP_COLOR,
              flexShrink: 0,
              position: "relative",
              zIndex: 1,
            }}
          />
        ))}
      </div>

      <motion.span
        initial={prefersReduced ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={
          prefersReduced
            ? { duration: 0 }
            : { duration: 0.3, delay: 0.35, ease: [0.22, 1, 0.36, 1] }
        }
        style={{
          fontSize: 17,
          fontWeight: 800,
          color: "#0B0D0E",
          letterSpacing: "-0.025em",
          whiteSpace: "nowrap",
        }}
      >
        WeFixTrades
      </motion.span>
    </Link>
  );
}
