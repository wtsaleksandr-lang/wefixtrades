import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";

const CAPSULES = [
  { background: "#4A7C6F", startY: -4 },
  { background: "#5E9485", startY: 6  },
  { background: "#3B6358", startY: -3 },
];

const CAP_W  = 7;
const CAP_H  = 26;
const CAP_R  = 9999;
const CAP_GAP = 3;

export default function AnimatedLogo() {
  const prefersReduced = useReducedMotion();

  const capsuleAnimate = (startY: number) =>
    prefersReduced
      ? { y: 0, opacity: 1, filter: "blur(0px)", scale: 1 }
      : {
          y:      [startY, 0,          0,    0   ],
          opacity:[0.8,    1,          1,    1   ],
          filter: ["blur(1px)", "blur(0px)", "blur(0px)", "blur(0px)"],
          scale:  [1,      1,          1.03, 1   ],
        };

  const capsuleTransition = (i: number) =>
    prefersReduced
      ? { duration: 0 }
      : {
          duration: 0.8,
          delay:    i * 0.08,
          times:    [0, 0.75, 0.875, 1],
          ease:     [0.25, 0.1, 0.25, 1] as [number, number, number, number],
        };

  const glowAnimate = prefersReduced
    ? { opacity: 0.2 }
    : { opacity: [0, 0, 0.22] };

  const glowTransition = prefersReduced
    ? { duration: 0 }
    : { duration: 1.0, times: [0, 0.7, 1], ease: "easeOut" as const };

  const textAnimate = prefersReduced ? { opacity: 1, x: 0 } : { opacity: 1, x: 0 };
  const textInitial = prefersReduced ? { opacity: 1, x: 0 } : { opacity: 0, x: -6 };
  const textTransition = prefersReduced
    ? { duration: 0 }
    : { duration: 0.28, delay: 0.42, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

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
        overflow: "visible",
      }}
    >
      <div
        style={{
          position: "relative",
          width: CAP_W * 3 + CAP_GAP * 2,
          height: CAP_H + 10,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={glowAnimate}
          transition={glowTransition}
          style={{
            position: "absolute",
            inset: "-6px -8px",
            borderRadius: 12,
            background:
              "radial-gradient(ellipse at center, #5E9485 0%, transparent 72%)",
            filter: "blur(6px)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: CAP_GAP,
            position: "relative",
            zIndex: 1,
          }}
        >
          {CAPSULES.map((cap, i) => (
            <motion.div
              key={i}
              initial={
                prefersReduced
                  ? { y: 0, opacity: 1, filter: "blur(0px)", scale: 1 }
                  : { y: cap.startY, opacity: 0.8, filter: "blur(1px)", scale: 1 }
              }
              animate={capsuleAnimate(cap.startY)}
              transition={capsuleTransition(i)}
              style={{
                width: CAP_W,
                height: CAP_H,
                borderRadius: CAP_R,
                background: cap.background,
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      </div>

      <motion.div
        initial={textInitial}
        animate={textAnimate}
        transition={textTransition}
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
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#6B6B6B",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginTop: 1,
            whiteSpace: "nowrap",
          }}
        >
          Pro Platform
        </span>
      </motion.div>
    </Link>
  );
}
