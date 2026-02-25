import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";

const SHAPES = [
  { height: 20, background: "#2D6A4F" },
  { height: 26, background: "#40916C" },
  { height: 22, background: "#1B4332" },
];

export default function AnimatedLogo() {
  const prefersReduced = useReducedMotion();

  const shapeVariants = {
    hidden: prefersReduced
      ? { opacity: 1, x: 0, filter: "blur(0px)", scaleY: 1 }
      : { opacity: 0, x: 8, filter: "blur(3px)", scaleY: 0.88 },
    visible: { opacity: 1, x: 0, filter: "blur(0px)", scaleY: 1 },
  };

  const textVariants = {
    hidden: prefersReduced ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 },
    visible: { opacity: 1, x: 0 },
  };

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
      {/* Mark — 3 vertical capsule shapes */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 3,
          flexShrink: 0,
        }}
      >
        {SHAPES.map((shape, i) => (
          <motion.div
            key={i}
            variants={shapeVariants}
            initial="hidden"
            animate="visible"
            transition={{
              delay: prefersReduced ? 0 : i * 0.07,
              duration: 0.3,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              width: 7,
              height: shape.height,
              borderRadius: 9999,
              background: shape.background,
            }}
          />
        ))}
      </div>

      {/* Brand text */}
      <motion.div
        variants={textVariants}
        initial="hidden"
        animate="visible"
        transition={{
          delay: prefersReduced ? 0 : 0.36,
          duration: 0.28,
          ease: [0.22, 1, 0.36, 1],
        }}
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
