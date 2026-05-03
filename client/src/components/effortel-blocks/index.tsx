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
import { mkt } from "@/theme/tokens";

const MONO = "'Et Mono', 'DM Mono', monospace";
const SANS = "'Satoshi', Inter, system-ui, sans-serif";

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
    <div style={{
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
  value, label, color = "cyanSoft", icon, badge, size = "md", style,
}: {
  value: string;
  label: string;
  color?: TileColor;
  icon?: ReactNode;
  badge?: ReactNode;
  size?: "sm" | "md" | "lg";
  style?: CSSProperties;
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
          {value}
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
      <Sparkline color={c.ink} />
      <div>
        <div style={{
          fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em",
          color: c.ink, marginBottom: 6, fontFamily: SANS,
        }}>
          {value}
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

function Sparkline({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 120 36" width="100%" height="36" style={{ marginBottom: 8, opacity: 0.6 }}>
      <polyline
        fill="none" stroke={color} strokeWidth="1.5"
        points="0,30 12,28 24,22 36,25 48,18 60,20 72,12 84,14 96,8 108,10 120,4"
      />
    </svg>
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
