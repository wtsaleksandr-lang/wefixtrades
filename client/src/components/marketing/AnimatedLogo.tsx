import { motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";

/* Three capsules — equal height, staggered y offsets for misaligned start */
const CAPSULES = [
  { background: "#2D6A4F", startY: -4 },
  { background: "#40916C", startY: 6  },
  { background: "#1B4332", startY: -3 },
];

/* Shared capsule dimensions */
const CAP_W  = 7;
const CAP_H  = 26;
const CAP_R  = 9999;
const CAP_GAP = 3;

export default function AnimatedLogo() {
  const prefersReduced = useReducedMotion();

  /* ── Capsule animation ─────────────────────────────────────────────────
     Phase 1  0ms       : misaligned (y offset), opacity 0.8, blur 1px
     Phase 2  0–600ms   : align to y:0, opacity 1, blur 0, ease-out cubic
     Phase 3  600–800ms : subtle scale settle 1 → 1.03 → 1
     All in one keyframe sequence per capsule, stagger 80ms between bars.
  ──────────────────────────────────────────────────────────────────────── */
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

  /* ── Glow animation ────────────────────────────────────────────────────
     Phase 4  700–1000ms : opacity 0 → 0.25, then static forever
  ──────────────────────────────────────────────────────────────────────── */
  const glowAnimate = prefersReduced
    ? { opacity: 0.2 }
    : { opacity: [0, 0, 0.22] };

  const glowTransition = prefersReduced
    ? { duration: 0 }
    : { duration: 1.0, times: [0, 0.7, 1], ease: "easeOut" as const };

  /* ── Brand text animation ──────────────────────────────────────────────
     Simple fade-in after capsules settle (~400ms delay)
  ──────────────────────────────────────────────────────────────────────── */
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
        /* Fixed dimensions — prevents any layout shift */
        width: 148,
        height: 44,
        flexShrink: 0,
        overflow: "visible",
      }}
    >
      {/* Capsule mark — fixed-size container keeps layout stable */}
      <div
        style={{
          position: "relative",
          width: CAP_W * 3 + CAP_GAP * 2,
          height: CAP_H + 10, /* +10 for y-offset travel room */
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Glow — sits behind capsules */}
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
              "radial-gradient(ellipse at center, #40916C 0%, transparent 72%)",
            filter: "blur(6px)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Three capsules */}
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

      {/* Brand text — WeFixTrades only */}
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
            color: "#0F172A",
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
            color: "#94A3B8",
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
