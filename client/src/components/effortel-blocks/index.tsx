/**
 * Effortel-style design block primitives.
 *
 * These are the reusable inner-element components that compose the Effortel
 * marketing pattern. Build inner elements first, then wrap them in NumberedCard.
 *
 * Usage:
 *   <NumberedCard number="01" title="..." description="...">
 *     <StatTile value="120 547" label="Total users" trend="+3.2%" chart={...} />
 *     <StatTile value="216" label="Subscription plans" />
 *     <StatTile value="112 355" label="Ongoing billing" />
 *   </NumberedCard>
 */

import type { CSSProperties, ReactNode } from "react";
import { motion, useInView, useReducedMotion, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { mkt } from "@/theme/tokens";

export const MONO = "'Et Mono', 'DM Mono', monospace";
export const SANS = "'Satoshi', Inter, system-ui, sans-serif";

/* ─── Pastel inner-tile palette (Effortel-style) ──────────────── */
export const TILE = {
  cyan:    { bg: "#A9D3DA", ink: "#1B2A2D", muted: "rgba(27,42,45,0.6)" },
  cyanSoft:{ bg: "#C5DDE2", ink: "#1B2A2D", muted: "rgba(27,42,45,0.6)" },
  pink:    { bg: "#F8C6C0", ink: "#3D1F1B", muted: "rgba(61,31,27,0.6)" },
  lavender:{ bg: "#D5D5E8", ink: "#1F1F3D", muted: "rgba(31,31,61,0.6)" },
  mint:    { bg: "#B5DBC8", ink: "#1B3D2C", muted: "rgba(27,61,44,0.6)" },
  white:   { bg: "#F5FCFF", ink: "#1B2A2D", muted: "rgba(27,42,45,0.55)" },
  steel:   { bg: "#9BAFB8", ink: "#171818", muted: "rgba(23,24,24,0.6)" },
} as const;

export type TileColor = keyof typeof TILE;

/* ════════════════════════════════════════════════════════════════
   NumberedCard — the section wrapper.
   Big rounded card, dotted bg, faded number indicator, mockup on top,
   title + description below.
   ════════════════════════════════════════════════════════════════ */

export function NumberedCard({
  number,
  title,
  description,
  cta,
  children,
  align = "center",
}: {
  number: string;
  title: string;
  description: string;
  cta?: { label: string; href: string };
  children: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div data-theme="dark" data-component="numbered-card" style={{
      position: "relative",
      background: mkt.sectionLight,
      borderRadius: 28,
      border: `1px solid rgba(255,255,255,0.04)`,
      overflow: "hidden",
      padding: "48px 32px 60px",
      fontFamily: SANS,
    }}>
      <DottedBackground />
      {/* Mockup container */}
      <div style={{ position: "relative", minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0 56px" }}>
        {children}
      </div>
      {/* Title block */}
      <div style={{ position: "relative", maxWidth: 540, margin: align === "center" ? "0 auto" : undefined, textAlign: align }}>
        <h3 style={{
          fontSize: 32, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.02em",
          color: mkt.onDark, marginBottom: 16,
        }}>
          {title}
        </h3>
        <p style={{
          fontSize: 16, lineHeight: 1.55, color: mkt.onDarkMuted, marginBottom: cta ? 24 : 0,
        }}>
          {description}
        </p>
        {cta && (
          <a href={cta.href} style={{
            display: "inline-block", fontSize: 12, fontWeight: 500,
            color: mkt.onDark, textDecoration: "none",
            fontFamily: MONO, letterSpacing: "0.12em", textTransform: "uppercase",
            paddingBottom: 6, borderBottom: `1px solid ${mkt.accent}`,
          }}>
            {cta.label}
          </a>
        )}
      </div>
      {/* Faded number indicator */}
      <div style={{
        position: "absolute", left: 32, bottom: 24,
        fontSize: 14, fontFamily: MONO, fontWeight: 500,
        color: "rgba(255,255,255,0.18)", letterSpacing: "0.1em",
      }}>
        {number}
      </div>
    </div>
  );
}

function DottedBackground() {
  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none",
      backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)`,
      backgroundSize: "16px 16px",
      opacity: 0.7,
    }} />
  );
}

/* ════════════════════════════════════════════════════════════════
   StatTile — chunky number + label + optional badge / icon.
   "120 547 / TOTAL USERS / ↑ 3.2%"
   ════════════════════════════════════════════════════════════════ */

export function StatTile({
  value, label, color = "cyanSoft", icon, badge, size = "md", style, animate = true,
}: {
  value: string;
  label: string;
  color?: TileColor;
  icon?: ReactNode;
  badge?: ReactNode;
  size?: "sm" | "md" | "lg";
  style?: CSSProperties;
  animate?: boolean;
}) {
  const c = TILE[color];
  const valueSize = size === "lg" ? 38 : size === "sm" ? 22 : 30;
  return (
    <div style={{
      background: c.bg, color: c.ink,
      borderRadius: 18, padding: 20,
      fontFamily: SANS,
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      minHeight: size === "lg" ? 168 : 130,
      ...style,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        {icon && <div style={{ opacity: 0.55 }}>{icon}</div>}
        {badge && <div>{badge}</div>}
      </div>
      <div>
        <div style={{
          fontSize: valueSize, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em",
          fontFamily: SANS, marginBottom: 8, color: c.ink,
        }}>
          {animate ? <Ticker value={value} /> : value}
        </div>
        <div style={{
          fontSize: 11, fontFamily: MONO, fontWeight: 500,
          letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted,
        }}>
          {label}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MiniChartTile — line chart + stat (Effortel's "120 547 TOTAL USERS" card)
   ════════════════════════════════════════════════════════════════ */

export function MiniChartTile({
  value, label, trend, color = "cyanSoft", style,
}: {
  value: string;
  label: string;
  trend?: string;
  color?: TileColor;
  style?: CSSProperties;
}) {
  const c = TILE[color];
  return (
    <div style={{
      background: c.bg, color: c.ink,
      borderRadius: 18, padding: 20,
      fontFamily: SANS,
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      minHeight: 168,
      ...style,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <UserIcon color={c.muted} />
        {trend && (
          <span style={{
            fontSize: 11, fontFamily: MONO, fontWeight: 500,
            padding: "3px 10px", borderRadius: 999,
            background: "rgba(255,255,255,0.5)", color: c.ink,
          }}>
            ↑ {trend}
          </span>
        )}
      </div>
      <AnimatedSparkline color={c.ink} />
      <div>
        <div style={{
          fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em",
          color: c.ink, marginBottom: 6, fontFamily: SANS,
        }}>
          <Ticker value={value} />
        </div>
        <div style={{
          fontSize: 11, fontFamily: MONO, fontWeight: 500,
          letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted,
        }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function UserIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6" r="3" stroke={color} strokeWidth="1.5" />
      <path d="M3 16c0-3 2.7-5 6-5s6 2 6 5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════
   BadgePill — colored category chip ("ENGAGEMENT", "CONTROL")
   ════════════════════════════════════════════════════════════════ */

export function BadgePill({
  label, icon, iconBg = "cyan",
}: {
  label: string;
  icon: ReactNode;
  iconBg?: TileColor;
}) {
  const c = TILE[iconBg];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "10px 18px 10px 10px",
      borderRadius: 999,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      fontFamily: MONO,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: c.bg, color: c.ink,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon}
      </div>
      <span style={{
        fontSize: 13, fontWeight: 500, color: mkt.onDark,
        letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        {label}
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   FlowCard — status flow with current step (Effortel's "Dunning plan / WAITING")
   ════════════════════════════════════════════════════════════════ */

export function FlowCard({
  title, currentStep, nextStep, color = "cyan", style,
}: {
  title: string;
  currentStep: { label: string; date?: string; type: "x" | "check" | "wait" };
  nextStep: string;
  color?: TileColor;
  style?: CSSProperties;
}) {
  const c = TILE[color];
  return (
    <div style={{
      background: c.bg, color: c.ink,
      borderRadius: 18, padding: 24,
      fontFamily: SANS, ...style,
    }}>
      <div style={{
        fontSize: 14, fontWeight: 600, marginBottom: 24, color: c.ink,
      }}>
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        <StepDot type={currentStep.type} ink={c.ink} />
        <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${c.muted}`, margin: "0 8px" }} />
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          border: `1.5px dashed ${c.muted}`,
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: c.ink, marginBottom: 4 }}>
            {currentStep.label}
          </div>
          {currentStep.date && (
            <div style={{ fontSize: 10, fontFamily: MONO, color: c.muted }}>{currentStep.date}</div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, fontFamily: MONO, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>
            {nextStep}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepDot({ type, ink }: { type: "x" | "check" | "wait"; ink: string }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      background: ink, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 14, flexShrink: 0,
    }}>
      {type === "x" ? "✕" : type === "check" ? "✓" : "•"}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   OrbitingLogos — colored logo squares on concentric rings
   ════════════════════════════════════════════════════════════════ */

export function OrbitingLogos({
  logos, center,
}: {
  logos: { label: string; color: string; angle: number; ring: 1 | 2; size?: number }[];
  center: ReactNode;
}) {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 520, height: 380, margin: "0 auto" }}>
      {/* Concentric circles */}
      <Ring radius={140} />
      <Ring radius={90} />
      {/* Logo squares */}
      {logos.map((l, i) => {
        const radius = l.ring === 1 ? 90 : 140;
        const x = Math.cos((l.angle * Math.PI) / 180) * radius;
        const y = Math.sin((l.angle * Math.PI) / 180) * radius;
        const size = l.size ?? 48;
        return (
          <div key={i} style={{
            position: "absolute", left: "50%", top: "50%",
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
            width: size, height: size, borderRadius: 12,
            background: l.color, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, fontFamily: SANS,
            boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
          }}>
            {l.label}
          </div>
        );
      })}
      {/* Center mockup */}
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)", zIndex: 2,
      }}>
        {center}
      </div>
    </div>
  );
}

function Ring({ radius }: { radius: number }) {
  return (
    <div style={{
      position: "absolute", left: "50%", top: "50%",
      transform: "translate(-50%, -50%)",
      width: radius * 2, height: radius * 2,
      borderRadius: "50%",
      border: "1px solid rgba(255,255,255,0.06)",
    }} />
  );
}

/* ════════════════════════════════════════════════════════════════
   Reveal — fade-up on scroll. prefers-reduced-motion safe.
   ════════════════════════════════════════════════════════════════ */

export function Reveal({
  children, delay = 0, style,
}: {
  children: ReactNode;
  delay?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduced = useReducedMotion();
  // `armed` gates the hide-then-reveal animation. The component renders its
  // content FULLY VISIBLE on first paint — so crawlers, non-JS visitors, and
  // the pre-hydration paint always see real content instead of an opacity-0
  // blank section. After mount, JS arms the effect ONLY for elements that are
  // still below the fold; on-screen elements stay visible (no flash), and
  // below-fold elements are hidden, then animated in when scrolled into view.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    // Only arm the reveal if this element is currently off-screen. Elements
    // already in the viewport at mount keep their visible first paint.
    const el = ref.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight) {
      setArmed(true);
    }
  }, []);

  if (reduced) return <div style={style}>{children}</div>;

  // armed && !inView → below-fold and not yet scrolled to: hidden.
  // Everything else (pre-mount, on-screen at mount, scrolled into view): visible.
  const hidden = armed && !inView;
  return (
    <motion.div
      ref={ref}
      style={style}
      // No `initial` — first paint is the visible state, so SSR/crawler
      // markup is never blank. `animate` then drives hide → reveal.
      animate={hidden ? { opacity: 0, y: 18 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MapTile — small map illustration with status pins.
   For MapGuard, BookFlow (dispatch), etc.
   ════════════════════════════════════════════════════════════════ */

export function MapTile({
  pins,
  label,
  color = "cyanSoft",
  style,
}: {
  pins: { x: number; y: number; status: "ok" | "warn" | "alert" }[];
  label: string;
  color?: TileColor;
  style?: CSSProperties;
}) {
  const c = TILE[color];
  const pinColor = (s: "ok" | "warn" | "alert") =>
    s === "ok" ? "#10B981" : s === "warn" ? "#F59E0B" : "#EF4444";
  return (
    <div style={{
      background: c.bg, color: c.ink, borderRadius: 18, padding: 0,
      fontFamily: SANS, position: "relative", overflow: "hidden",
      minHeight: 220, ...style,
    }}>
      {/* Stylized map */}
      <svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke={c.ink} strokeOpacity="0.08" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="320" height="200" fill="url(#grid)" />
        {/* roads */}
        <path d="M0,80 Q80,70 160,90 T320,80" fill="none" stroke={c.ink} strokeOpacity="0.2" strokeWidth="2" />
        <path d="M0,140 Q120,130 200,150 T320,135" fill="none" stroke={c.ink} strokeOpacity="0.2" strokeWidth="2" />
        <path d="M120,0 Q130,80 110,200" fill="none" stroke={c.ink} strokeOpacity="0.2" strokeWidth="2" />
      </svg>
      {/* Pins */}
      {pins.map((p, i) => (
        <div key={i} style={{
          position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
          width: 28, height: 28, borderRadius: "50%",
          background: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)", transform: "translate(-50%, -50%)",
        }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: pinColor(p.status) }} />
        </div>
      ))}
      {/* Label */}
      <div style={{
        position: "absolute", left: 16, bottom: 16,
        padding: "6px 12px", borderRadius: 8,
        background: "rgba(255,255,255,0.85)",
        fontSize: 11, fontFamily: MONO, fontWeight: 500,
        letterSpacing: "0.1em", textTransform: "uppercase", color: c.ink,
      }}>
        {label}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   RankTile — keyword search rank rows. For RankFlow.
   ════════════════════════════════════════════════════════════════ */

export function RankTile({
  rows, color = "white", style,
}: {
  rows: { keyword: string; pos: number; delta: number }[];
  color?: TileColor;
  style?: CSSProperties;
}) {
  const c = TILE[color];
  return (
    <div style={{
      background: c.bg, color: c.ink, borderRadius: 18, padding: 20,
      fontFamily: SANS, ...style,
    }}>
      <div style={{
        fontSize: 11, fontFamily: MONO, fontWeight: 500,
        letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted,
        marginBottom: 14,
      }}>Top Keywords</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.keyword} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 13, color: c.ink, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.keyword}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: c.ink, fontFamily: SANS, letterSpacing: "-0.01em" }}>#{r.pos}</span>
              <span style={{
                fontSize: 11, fontFamily: MONO, fontWeight: 500,
                padding: "2px 8px", borderRadius: 999,
                background: r.delta < 0 ? "#10B98122" : r.delta > 0 ? "#EF444422" : "rgba(0,0,0,0.05)",
                color: r.delta < 0 ? "#059669" : r.delta > 0 ? "#DC2626" : c.muted,
              }}>
                {r.delta < 0 ? "↑" : r.delta > 0 ? "↓" : "—"} {Math.abs(r.delta) || "0"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   CalendarTile — 7-day grid with booked / available / blocked slots.
   For BookFlow, ContentFlow, SocialSync.
   ════════════════════════════════════════════════════════════════ */

export function CalendarTile({
  cells,
  label,
  color = "lavender",
  style,
}: {
  cells: ("booked" | "free" | "blocked" | "today")[];
  label: string;
  color?: TileColor;
  style?: CSSProperties;
}) {
  const c = TILE[color];
  const fill = (state: typeof cells[number]) => {
    if (state === "booked") return c.ink;
    if (state === "today") return "#10B981";
    if (state === "blocked") return c.muted;
    return "rgba(255,255,255,0.55)";
  };
  return (
    <div style={{
      background: c.bg, color: c.ink, borderRadius: 18, padding: 20,
      fontFamily: SANS, ...style,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{
          fontSize: 11, fontFamily: MONO, fontWeight: 500,
          letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted,
        }}>{label}</span>
        <span style={{ fontSize: 11, fontFamily: MONO, color: c.muted }}>This week</span>
      </div>
      <CalendarGrid cells={cells} fill={fill} />
    </div>
  );
}

function CalendarGrid({ cells, fill }: { cells: ("booked" | "free" | "blocked" | "today")[]; fill: (s: "booked" | "free" | "blocked" | "today") => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  return (
    <div ref={ref} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
        <div key={i} style={{ textAlign: "center", fontSize: 10, fontFamily: MONO, color: "rgba(0,0,0,0.4)", marginBottom: 4 }}>{d}</div>
      ))}
      {cells.map((state, i) => (
        <motion.div
          key={i}
          style={{
            aspectRatio: "1",
            borderRadius: 6, background: fill(state),
          }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={
            (inView || reduced)
              ? { opacity: state === "free" ? 0.4 : 1, scale: 1 }
              : { opacity: 0, scale: 0.6 }
          }
          transition={{
            duration: reduced ? 0 : 0.35,
            delay: reduced ? 0 : 0.04 * i,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   GaugeTile — score gauge 0-100. For WebFix, WebCare, AdFlow.
   ════════════════════════════════════════════════════════════════ */

export function GaugeTile({
  value, label, color = "mint", suffix = "", style,
}: {
  value: number;        // 0-100
  label: string;
  color?: TileColor;
  suffix?: string;
  style?: CSSProperties;
}) {
  const c = TILE[color];
  const dash = (value / 100) * 220;
  return (
    <div style={{
      background: c.bg, color: c.ink, borderRadius: 18, padding: 20,
      fontFamily: SANS, display: "flex", flexDirection: "column",
      justifyContent: "space-between", minHeight: 168, ...style,
    }}>
      <div style={{ position: "relative", display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <svg width="120" height="80" viewBox="0 0 120 80">
          <path d="M 10 70 A 50 50 0 0 1 110 70" fill="none" stroke={c.ink} strokeOpacity="0.15" strokeWidth="8" strokeLinecap="round" />
          <path d="M 10 70 A 50 50 0 0 1 110 70" fill="none" stroke={c.ink} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} 220`} />
        </svg>
        <div style={{
          position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-30%)",
          textAlign: "center",
          fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", color: c.ink,
        }}>
          {value}{suffix}
        </div>
      </div>
      <div style={{
        fontSize: 11, fontFamily: MONO, fontWeight: 500,
        letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted,
        textAlign: "center",
      }}>
        {label}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   ReviewTile — single star-rated review with author + status.
   For ReputationShield.
   ════════════════════════════════════════════════════════════════ */

export function ReviewTile({
  author, stars, text, status = "replied", color = "white", style,
}: {
  author: string;
  stars: number;
  text: string;
  status?: "replied" | "new" | "flagged";
  color?: TileColor;
  style?: CSSProperties;
}) {
  const c = TILE[color];
  const statusColor = status === "replied" ? "#10B981" : status === "flagged" ? "#EF4444" : "#F59E0B";
  const statusLabel = status === "replied" ? "AI replied" : status === "flagged" ? "Flagged" : "New";
  return (
    <div style={{
      background: c.bg, color: c.ink, borderRadius: 18, padding: 20,
      fontFamily: SANS, ...style,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: c.muted, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
            {author.charAt(0)}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: c.ink }}>{author}</span>
        </div>
        <div style={{ display: "flex", gap: 1, color: "#F59E0B" }}>
          {[1, 2, 3, 4, 5].map(s => <span key={s} style={{ fontSize: 12, opacity: s <= stars ? 1 : 0.3 }}>★</span>)}
        </div>
      </div>
      <p style={{ fontSize: 12, lineHeight: 1.5, color: c.muted, marginBottom: 12 }}>"{text}"</p>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 10, fontFamily: MONO, fontWeight: 500,
        letterSpacing: "0.1em", textTransform: "uppercase", color: statusColor,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
        {statusLabel}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Animated bits — number ticker, sparkline draw.
   All respect prefers-reduced-motion.
   ════════════════════════════════════════════════════════════════ */

function parseValue(raw: string): { prefix: string; num: number; suffix: string; sep: string } {
  const m = raw.match(/^(\D*)([\d,. ]+)(.*)$/);
  if (!m) return { prefix: "", num: NaN, suffix: raw, sep: "" };
  const [, prefix, numStr, suffix] = m;
  const sep = numStr.includes(",") ? "," : numStr.includes(" ") ? " " : "";
  const num = Number(numStr.replace(/[, ]/g, ""));
  return { prefix, num, suffix, sep };
}

function formatNum(n: number, sep: string, hasDecimal: boolean): string {
  if (hasDecimal) return n.toFixed(1);
  const rounded = Math.round(n);
  if (sep === ",") return rounded.toLocaleString("en-US");
  if (sep === " ") return rounded.toLocaleString("fr-FR").replace(/ /g, " ");
  return String(rounded);
}

/**
 * Ticker — animates the numeric portion of `value` from 0 to target
 * the first time it scrolls into view. Handles prefixes/suffixes like
 * "$", "%", "★", "+", and thousands separators ("," or " ").
 */
export function Ticker({
  value, duration = 1.6, delay = 0, style,
}: { value: string; duration?: number; delay?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  // B1 fix (2026-05-20): previously used `margin: "-40px"` which shrinks the
  // observer's effective viewport in all directions and was unreliable on
  // small mobile viewports — count-ups never fired on the live product pages
  // at 390×844, leaving every stat tile showing "0%/<0s/0+" forever. Switch
  // to a generous rootMargin (`0px 0px -10% 0px`) so the animation fires
  // when the element is anywhere within the visible viewport (minus a small
  // bottom sliver so we wait until the tile is comfortably on-screen),
  // `amount: 0` to fire on ANY intersection, and NO mobile-disabling guard.
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px", amount: 0 });
  const reduced = useReducedMotion();
  const parsed = parseValue(value);
  const hasDecimal = String(parsed.num).includes(".") || value.includes(".");
  const [current, setCurrent] = useState(
    reduced || isNaN(parsed.num) ? value : parsed.prefix + "0" + parsed.suffix
  );

  useEffect(() => {
    if (!inView || reduced || isNaN(parsed.num)) return;
    const controls = animate(0, parsed.num, {
      duration, delay, ease: [0.22, 1, 0.36, 1],
      onUpdate: (n) => setCurrent(parsed.prefix + formatNum(n, parsed.sep, hasDecimal) + parsed.suffix),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value]);

  return <span ref={ref} style={style}>{current}</span>;
}

/**
 * AnimatedSparkline — draws the line left → right when in view.
 */
export function AnimatedSparkline({
  points = "0,30 12,28 24,22 36,25 48,18 60,20 72,12 84,14 96,8 108,10 120,4",
  color = "#000",
  duration = 1.6,
  delay = 0.1,
}: { points?: string; color?: string; duration?: number; delay?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  return (
    <svg ref={ref} viewBox="0 0 120 36" width="100%" height="36" style={{ marginBottom: 8, opacity: 0.6 }}>
      <motion.polyline
        fill="none" stroke={color} strokeWidth="1.5"
        points={points}
        initial={{ pathLength: reduced ? 1 : 0 }}
        animate={inView ? { pathLength: 1 } : { pathLength: reduced ? 1 : 0 }}
        transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}
