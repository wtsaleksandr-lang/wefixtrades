/**
 * Per-icon animations for the "How it works" pipeline diagram.
 *
 * Each function returns an SVG component that loops a continuous, on-brand
 * animation telling the story of that step. Runs only when the parent
 * AnimationWrapper sets `active = true`.
 *
 * All use the same V7 cyan accent for line strokes / fills so the visual
 * language stays consistent across icons.
 *
 * Designed to be 30×30px in the parent's icon slot.
 */

import { motion, useReducedMotion } from "framer-motion";

const STROKE = 1.6;

interface IconProps { color: string; active: boolean }

/**
 * Hook that returns `true` only when the parent says active AND the user has
 * not asked for reduced motion. All icons below funnel `active` through this
 * so a prefers-reduced-motion request collapses every loop to its static
 * resting state without modifying each animation block.
 */
function useActive(active: boolean): boolean {
  const reduced = useReducedMotion();
  return active && !reduced;
}

/* ── Phone ringing (vibrates + emits sound waves) ───────────────── */
export function RingingPhone({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <motion.g
        animate={active ? { rotate: [-8, 8, -6, 6, -4, 4, 0] } : { rotate: 0 }}
        transition={active ? { duration: 0.7, repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" } : {}}
        style={{ transformOrigin: "15px 15px" }}
      >
        <path d="M22 17.5v3a1.5 1.5 0 0 1-1.6 1.5 14.4 14.4 0 0 1-6.3-2.2 14.2 14.2 0 0 1-4.4-4.4 14.4 14.4 0 0 1-2.2-6.3A1.5 1.5 0 0 1 9 7.5h3a1.5 1.5 0 0 1 1.5 1.3 9.6 9.6 0 0 0 .5 2.4 1.5 1.5 0 0 1-.3 1.6l-1.3 1.3a11.2 11.2 0 0 0 4.2 4.2l1.3-1.3a1.5 1.5 0 0 1 1.6-.3 9.6 9.6 0 0 0 2.4.5A1.5 1.5 0 0 1 22 17.5z" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </motion.g>
      {/* Sound waves */}
      {active && (
        <>
          <motion.path
            d="M22 5.5a8 8 0 0 1 4 4"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 0], scale: [0.6, 1, 1.2] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
            style={{ transformOrigin: "22px 5.5px" }}
          />
          <motion.path
            d="M22 2.5a11 11 0 0 1 6 6"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 0.6, 0], scale: [0.6, 1, 1.2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: 0.25, ease: "easeOut" }}
            style={{ transformOrigin: "22px 2.5px" }}
          />
        </>
      )}
    </svg>
  );
}

/* ── Message replying (typing dots inside a bubble) ─────────────── */
export function ReplyingMessage({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <path d="M22 6H8a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h2v3l4-3h8a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3z" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" fill="none" />
      {/* Typing dots */}
      {[10, 15, 20].map((cx, i) => (
        <motion.circle
          key={cx}
          cx={cx} cy={13} r={1.4} fill={color}
          animate={active ? { opacity: [0.3, 1, 0.3], y: [0, -1.5, 0] } : { opacity: 1, y: 0 }}
          transition={active ? { duration: 1.0, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" } : {}}
        />
      ))}
    </svg>
  );
}

/* ── Lead captured (user + check stamp) ─────────────────────────── */
export function LeadStamping({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <circle cx="12" cy="11" r="3.5" stroke={color} strokeWidth={STROKE} fill="none" />
      <path d="M5 23c0-4 3.2-6 7-6s7 2 7 6" stroke={color} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      {/* Stamping check */}
      <motion.circle
        cx="22" cy="20" r="5"
        stroke={color}
        strokeWidth={STROKE}
        fill="none"
        animate={active ? { scale: [0.6, 1.15, 1] } : { scale: 1 }}
        transition={active ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.8, ease: [0.22, 1, 0.36, 1] } : {}}
        style={{ transformOrigin: "22px 20px" }}
      />
      <motion.path
        d="M19.5 20l2 2 3-3.5"
        stroke={color}
        strokeWidth={STROKE + 0.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pathLength={1}
        initial={{ pathLength: 0 }}
        animate={active ? { pathLength: [0, 1, 1, 0] } : { pathLength: 1 }}
        transition={active ? { duration: 1.4, repeat: Infinity, ease: "easeOut", times: [0, 0.4, 0.85, 1] } : {}}
      />
    </svg>
  );
}

/* ── Calendar slot filling ──────────────────────────────────────── */
export function CalendarFilling({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <rect x="5" y="7" width="20" height="18" rx="2" stroke={color} strokeWidth={STROKE} fill="none" />
      <line x1="5" y1="11" x2="25" y2="11" stroke={color} strokeWidth={STROKE} />
      <line x1="10" y1="5" x2="10" y2="9" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <line x1="20" y1="5" x2="20" y2="9" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      {/* Slot cells filling in sequence */}
      {[
        { x: 8, y: 14 }, { x: 13, y: 14 }, { x: 18, y: 14 },
        { x: 8, y: 19 }, { x: 13, y: 19 }, { x: 18, y: 19 },
      ].map((c, i) => (
        <motion.rect
          key={i}
          x={c.x} y={c.y} width={3} height={3} rx={0.6}
          fill={color}
          animate={active ? { opacity: [0, 1, 1, 0] } : { opacity: i === 4 ? 1 : 0 }}
          transition={active ? { duration: 2.4, repeat: Infinity, delay: i * 0.2, times: [0, 0.2, 0.85, 1] } : {}}
        />
      ))}
    </svg>
  );
}

/* ── Wrench rotating ────────────────────────────────────────────── */
export function ServiceWrench({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <motion.g
        animate={active ? { rotate: [0, 12, -8, 8, 0] } : { rotate: 0 }}
        transition={active ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : {}}
        style={{ transformOrigin: "15px 15px" }}
      >
        <path d="M19.5 5a5 5 0 0 0-6.3 6.3l-7.7 7.7a2 2 0 1 0 2.8 2.8l7.7-7.7a5 5 0 0 0 6.3-6.3l-3 3-2.8-.4-.4-2.8 3-3z" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" fill="none" />
      </motion.g>
    </svg>
  );
}

/* ── Job details (checkboxes filling) ──────────────────────────── */
export function JobDetailsFilling({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <rect x="5" y="5" width="20" height="20" rx="2.5" stroke={color} strokeWidth={STROKE} fill="none" />
      {[10, 15, 20].map((y, i) => (
        <g key={y}>
          <rect x="8" y={y - 1.5} width="3" height="3" rx="0.6" stroke={color} strokeWidth={STROKE} fill="none" />
          <motion.path
            d={`M9 ${y} l1 1 l2-2`}
            stroke={color}
            strokeWidth={STROKE + 0.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            pathLength={1}
            initial={{ pathLength: 0 }}
            animate={active ? { pathLength: [0, 1, 1, 0] } : { pathLength: 1 }}
            transition={active ? { duration: 2, repeat: Infinity, delay: i * 0.4, times: [0, 0.3, 0.85, 1] } : {}}
          />
          <line x1={13} y1={y} x2={22} y2={y} stroke={color} strokeWidth={STROKE - 0.4} strokeLinecap="round" opacity={0.5} />
        </g>
      ))}
    </svg>
  );
}

/* ── Price calculator (digits cycling) ──────────────────────────── */
export function PriceCalculating({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <rect x="6" y="4" width="18" height="22" rx="2" stroke={color} strokeWidth={STROKE} fill="none" />
      <rect x="9" y="7" width="12" height="4" rx="1" stroke={color} strokeWidth={STROKE - 0.4} fill="none" />
      {/* Price ticker */}
      {active && (
        <motion.text
          x="15" y="10"
          fontFamily="monospace"
          fontSize="3"
          fill={color}
          textAnchor="middle"
          dominantBaseline="middle"
          animate={{ opacity: [1, 1, 1] }}
        >
          <motion.tspan
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 0.1, ease: "easeInOut" }}
          >
            $185
          </motion.tspan>
        </motion.text>
      )}
      {[
        { x: 10, y: 14 }, { x: 15, y: 14 }, { x: 20, y: 14 },
        { x: 10, y: 18 }, { x: 15, y: 18 }, { x: 20, y: 18 },
        { x: 10, y: 22 }, { x: 15, y: 22 }, { x: 20, y: 22 },
      ].map((b, i) => (
        <motion.circle
          key={i}
          cx={b.x} cy={b.y} r={1.2}
          fill={color}
          animate={active ? { opacity: [0.3, 1, 0.3] } : { opacity: 0.5 }}
          transition={active ? { duration: 0.4, repeat: Infinity, delay: (i * 0.06) % 1.2, ease: "easeInOut" } : {}}
        />
      ))}
    </svg>
  );
}

/* ── Paper plane flying trajectory ──────────────────────────────── */
export function FlyingPlane({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {/* Trajectory dotted line */}
      {active && (
        <motion.path
          d="M2 24 Q 12 20 18 12 Q 22 8 28 6"
          stroke={color}
          strokeWidth={STROKE - 0.6}
          strokeDasharray="2 2"
          strokeLinecap="round"
          fill="none"
          opacity={0.4}
          pathLength={1}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      {/* The plane following the path */}
      <motion.g
        animate={active ? {
          x: [0, 16],
          y: [0, -16],
          rotate: [0, -25],
        } : {}}
        transition={active ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : {}}
      >
        <path d="M2 14 L20 6 L14 22 L11 16 L2 14z" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" fill="none" />
        <path d="M11 16 L20 6" stroke={color} strokeWidth={STROKE - 0.4} fill="none" />
      </motion.g>
    </svg>
  );
}

/* ── Check sealing (filling check mark) ─────────────────────────── */
export function CheckSealing({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <circle cx="15" cy="15" r="11" stroke={color} strokeWidth={STROKE} fill="none" />
      <motion.path
        d="M9 15 l4 4 l8-8"
        stroke={color}
        strokeWidth={STROKE + 0.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pathLength={1}
        initial={{ pathLength: 0 }}
        animate={active ? { pathLength: [0, 1, 1, 0] } : { pathLength: 1 }}
        transition={active ? { duration: 1.6, repeat: Infinity, ease: "easeOut", times: [0, 0.4, 0.85, 1] } : {}}
      />
    </svg>
  );
}

/* ── Mail flying out ────────────────────────────────────────────── */
export function MailFlying({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <motion.g
        animate={active ? { x: [0, 12], opacity: [1, 1, 0.3] } : {}}
        transition={active ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : {}}
      >
        <rect x="4" y="9" width="16" height="12" rx="1.5" stroke={color} strokeWidth={STROKE} fill="none" />
        <path d="M4 11 L12 17 L20 11" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" fill="none" />
      </motion.g>
    </svg>
  );
}

/* ── Stars filling one by one ───────────────────────────────────── */
export function StarsFilling({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {[3, 9, 15, 21, 27].map((cx, i) => (
        <motion.path
          key={cx}
          d={`M${cx} 10 l1.4 2.8 l3 .4 l-2.2 2.1 .5 3 -2.7-1.4 -2.7 1.4 .5-3 -2.2-2.1 3-.4 1.4-2.8z`}
          fill={color}
          stroke={color}
          strokeWidth={0.5}
          strokeLinejoin="round"
          animate={active ? { opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.9] } : { opacity: 1, scale: 1 }}
          transition={active ? { duration: 2.0, repeat: Infinity, delay: i * 0.15, times: [0, 0.4, 0.85, 1], ease: "easeOut" } : {}}
          style={{ transformOrigin: `${cx}px 14.5px` }}
        />
      ))}
    </svg>
  );
}

/* ── Ranking arrow climbing ─────────────────────────────────────── */
export function RankingClimbing({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {/* Bars */}
      {[6, 12, 18, 24].map((x, i) => (
        <motion.rect
          key={x}
          x={x - 1.5} width={3} rx={0.6}
          fill={color}
          animate={active ? {
            height: [4 + i * 2, 6 + i * 4, 4 + i * 2],
            y: [22 - (4 + i * 2), 22 - (6 + i * 4), 22 - (4 + i * 2)],
          } : { height: 4 + i * 4, y: 22 - (4 + i * 4) }}
          transition={active ? { duration: 1.6, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" } : {}}
        />
      ))}
      {/* Climbing arrow */}
      <motion.path
        d="M4 18 L11 12 L17 16 L26 6"
        stroke={color}
        strokeWidth={STROKE + 0.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pathLength={1}
        initial={{ pathLength: 0 }}
        animate={active ? { pathLength: [0, 1, 1, 0] } : { pathLength: 1 }}
        transition={active ? { duration: 1.8, repeat: Infinity, times: [0, 0.5, 0.85, 1] } : {}}
      />
      <motion.path d="M22 6 l4 0 l0 4" stroke={color} strokeWidth={STROKE + 0.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/* ── Profile gear spinning ──────────────────────────────────────── */
export function ProfileGear({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <circle cx="11" cy="10" r="3" stroke={color} strokeWidth={STROKE} fill="none" />
      <path d="M5 22c0-3.5 2.7-5 6-5s6 1.5 6 5" stroke={color} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      <motion.g
        animate={active ? { rotate: 360 } : { rotate: 0 }}
        transition={active ? { duration: 3, repeat: Infinity, ease: "linear" } : {}}
        style={{ transformOrigin: "22px 20px" }}
      >
        <circle cx="22" cy="20" r="4" stroke={color} strokeWidth={STROKE} fill="none" />
        <circle cx="22" cy="20" r="1.4" fill={color} />
        {[0, 60, 120, 180, 240, 300].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x1 = 22 + Math.cos(rad) * 4;
          const y1 = 20 + Math.sin(rad) * 4;
          const x2 = 22 + Math.cos(rad) * 5.5;
          const y2 = 20 + Math.sin(rad) * 5.5;
          return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />;
        })}
      </motion.g>
    </svg>
  );
}

/* ── Reviews-grow bars rising ───────────────────────────────────── */
export function ReviewsGrowing({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <line x1="4" y1="24" x2="26" y2="24" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      {[7, 12, 17, 22].map((x, i) => (
        <motion.rect
          key={x}
          x={x - 1.5} width={3} rx={0.5}
          fill={color}
          animate={active ? {
            height: [4, 6 + i * 3, 4],
            y: [20, 18 - i * 3, 20],
          } : { height: 6 + i * 3, y: 18 - i * 3 }}
          transition={active ? { duration: 2, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" } : {}}
        />
      ))}
    </svg>
  );
}

/* ── Map pin dropping with ripple ───────────────────────────────── */
export function MapPinDropping({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      {/* Ripple */}
      {active && [0, 0.5].map((delay) => (
        <motion.circle
          key={delay}
          cx="15" cy="22" r="1"
          stroke={color}
          strokeWidth={STROKE - 0.6}
          fill="none"
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: [1, 5], opacity: [0.6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, delay, ease: "easeOut" }}
          style={{ transformOrigin: "15px 22px" }}
        />
      ))}
      <motion.path
        d="M15 4 a7 7 0 0 1 7 7 c0 5-7 12-7 12 s-7-7-7-12 a7 7 0 0 1 7-7z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        fill="none"
        animate={active ? { y: [-2, 0, -1, 0], scale: [0.95, 1.05, 1] } : {}}
        transition={active ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : {}}
        style={{ transformOrigin: "15px 22px" }}
      />
      <circle cx="15" cy="11" r="2.5" fill={color} />
    </svg>
  );
}

/* ── Phone radiating waves (more calls) ─────────────────────────── */
export function PhoneRadiating({ color, active: activeProp }: IconProps) {
  const active = useActive(activeProp);
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
      <path d="M22 17.5v3a1.5 1.5 0 0 1-1.6 1.5 14.4 14.4 0 0 1-6.3-2.2 14.2 14.2 0 0 1-4.4-4.4 14.4 14.4 0 0 1-2.2-6.3A1.5 1.5 0 0 1 9 7.5h3a1.5 1.5 0 0 1 1.5 1.3 9.6 9.6 0 0 0 .5 2.4 1.5 1.5 0 0 1-.3 1.6l-1.3 1.3a11.2 11.2 0 0 0 4.2 4.2l1.3-1.3a1.5 1.5 0 0 1 1.6-.3 9.6 9.6 0 0 0 2.4.5A1.5 1.5 0 0 1 22 17.5z" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {active && [0, 0.4, 0.8].map((delay) => (
        <motion.circle
          key={delay}
          cx="15" cy="15" r="14"
          stroke={color}
          strokeWidth={STROKE - 0.6}
          fill="none"
          initial={{ scale: 0.4, opacity: 0.7 }}
          animate={{ scale: [0.4, 1], opacity: [0.7, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, delay, ease: "easeOut" }}
          style={{ transformOrigin: "15px 15px" }}
        />
      ))}
    </svg>
  );
}

/* ─── Registry: maps the iconKey from AutomationDiagram → component ─── */
export const ICON_ANIMATIONS: Record<string, (p: IconProps) => JSX.Element> = {
  "missed-call":   RingingPhone,
  "instant-reply": ReplyingMessage,
  "lead-captured": LeadStamping,
  "callback":      CalendarFilling,
  "service":       ServiceWrench,
  "job-details":   JobDetailsFilling,
  "price":         PriceCalculating,
  "quote-sent":    FlyingPlane,
  "job-complete":  CheckSealing,
  "request-sent":  MailFlying,
  "five-star":     StarsFilling,
  "ranking-up":    RankingClimbing,
  "profile":       ProfileGear,
  "reviews-grow":  ReviewsGrowing,
  "maps":          MapPinDropping,
  "more-calls":    PhoneRadiating,
};
