/**
 * KpiGauge — semi-circular animated radial gauge.
 *
 * Part of Wave 22A shared visual primitives. The roadmap surfaced this as
 * one of the five visual elements no competitor (Surfer, Scalenut, Frase,
 * Clearscope, Jasper, Copy.ai, Writesonic, HubSpot, Hootsuite, Buffer,
 * Later, Sprout) animates. Built once here so Waves 23/24/25 share it.
 *
 * Renders as SVG (cleaner than conic-gradient for needle sweep + target
 * marker + crisp scaling). 180-degree arc, needle pivots from min to value,
 * value text + label below, optional target threshold triangle marker.
 *
 * Animation: needle sweep on mount, 800ms ease-out. Value counts up via
 * AnimatedCounter. Respects `prefers-reduced-motion` — snaps to target.
 *
 * No raw hex — uses chart tokens. Semantic tokens only.
 */

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "./AnimatedCounter";

export type KpiGaugeColor = "blue" | "green" | "amber" | "red" | "auto";
export type KpiGaugeSize = "sm" | "md" | "lg";

export type KpiGaugeProps = {
  value: number;
  min?: number;
  max?: number;
  label: string;
  unit?: string;
  targetThreshold?: number;
  size?: KpiGaugeSize;
  color?: KpiGaugeColor;
  animate?: boolean;
  className?: string;
};

const SIZE_PX: Record<KpiGaugeSize, number> = {
  sm: 80,
  md: 140,
  lg: 220,
};

// Map color name -> chart token. chart-1=brand blue, chart-2=teal,
// chart-4=amber, chart-5=red destructive.
const COLOR_VAR: Record<Exclude<KpiGaugeColor, "auto">, string> = {
  blue: "var(--chart-1)",
  green: "var(--chart-2)",
  amber: "var(--chart-4)",
  red: "var(--chart-5)",
};

function autoColor(pct: number): Exclude<KpiGaugeColor, "auto"> {
  if (pct >= 80) return "green";
  if (pct >= 50) return "amber";
  return "red";
}

/** Polar-to-cartesian on the gauge's unit circle. Angle: 180deg = left, 0deg = right. */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (Math.PI * angleDeg) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

/** Build an SVG arc path from `startAngle` to `endAngle` along radius `r`. */
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  // sweep flag = 0 because we go from larger angle to smaller (CCW in SVG y-down)
  const sweep = endAngle > startAngle ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

export function KpiGauge({
  value,
  min = 0,
  max = 100,
  label,
  unit = "",
  targetThreshold,
  size = "md",
  color = "auto",
  animate = true,
  className,
}: KpiGaugeProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion;

  const px = SIZE_PX[size];
  // Inner viewBox is a 200-wide / 110-tall canvas. The dial occupies
  // a half-circle of radius 80 centred at (100, 95).
  const VB_W = 200;
  const VB_H = 130;
  const cx = 100;
  const cy = 95;
  const r = 80;
  const stroke = size === "sm" ? 10 : size === "lg" ? 16 : 13;

  const range = Math.max(1, max - min);
  const clamped = Math.min(max, Math.max(min, value));
  const pct = ((clamped - min) / range) * 100;

  const resolvedColor = color === "auto" ? autoColor(pct) : color;
  const colorVar = COLOR_VAR[resolvedColor];

  // Angle ranges: gauge starts at 180deg (left) and sweeps to 0deg (right).
  const startAngle = 180;
  const endAngle = 0;
  const valueAngle = useMemo(() => startAngle - (pct / 100) * (startAngle - endAngle), [pct]);

  const bgPath = useMemo(() => arcPath(cx, cy, r, startAngle, endAngle), []);

  // Target marker
  let targetMarker: JSX.Element | null = null;
  if (typeof targetThreshold === "number" && targetThreshold >= min && targetThreshold <= max) {
    const tPct = ((targetThreshold - min) / range) * 100;
    const tAngle = startAngle - (tPct / 100) * (startAngle - endAngle);
    const outer = polar(cx, cy, r + stroke / 2 + 4, tAngle);
    const tip = polar(cx, cy, r + stroke / 2 + 12, tAngle);
    const leftBase = polar(cx, cy, r + stroke / 2 + 12, tAngle + 3);
    const rightBase = polar(cx, cy, r + stroke / 2 + 12, tAngle - 3);
    const tri = `M ${outer.x} ${outer.y} L ${leftBase.x} ${leftBase.y} L ${rightBase.x} ${rightBase.y} Z`;
    targetMarker = (
      <path
        d={tri}
        fill="hsl(var(--foreground))"
        opacity="0.6"
        aria-label={`target ${targetThreshold}`}
      />
    );
    // Suppress lint warning on unused tip — kept for future visual variants.
    void tip;
  }

  // Needle tip
  const needleTip = polar(cx, cy, r - stroke / 2 - 4, shouldAnimate ? startAngle : valueAngle);
  const targetNeedleTip = polar(cx, cy, r - stroke / 2 - 4, valueAngle);

  // Foreground arc: animate stroke-dashoffset from full to (full - filled).
  // Half-circumference = pi * r.
  const halfC = Math.PI * r;
  const filled = (pct / 100) * halfC;

  return (
    <div
      className={cn("inline-flex flex-col items-center", className)}
      style={{ width: px }}
      data-testid="kpi-gauge"
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width={px}
        height={px * (VB_H / VB_W)}
        role="img"
        aria-label={`${label}: ${value}${unit}`}
      >
        {/* Background ring */}
        <path
          d={bgPath}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeOpacity="0.12"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Foreground sweep */}
        <motion.path
          d={bgPath}
          fill="none"
          stroke={`hsl(${colorVar})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${halfC} ${halfC}`}
          initial={{ strokeDashoffset: shouldAnimate ? halfC : halfC - filled }}
          animate={{ strokeDashoffset: halfC - filled }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* Target marker (rendered above arc) */}
        {targetMarker}
        {/* Needle — line from centre to tip, with circle at pivot */}
        <motion.line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="hsl(var(--foreground))"
          strokeWidth={size === "sm" ? 2 : 3}
          strokeLinecap="round"
          initial={false}
          animate={{ x2: targetNeedleTip.x, y2: targetNeedleTip.y }}
          transition={{ duration: shouldAnimate ? 0.8 : 0, ease: [0.16, 1, 0.3, 1] }}
        />
        <circle
          cx={cx}
          cy={cy}
          r={size === "sm" ? 3 : 5}
          fill="hsl(var(--foreground))"
        />
      </svg>
      {/* Value + label, 2px stack (0.5 = 2px in Tailwind) */}
      <div className="flex flex-col items-center gap-0.5 -mt-3">
        <div
          className={cn(
            "font-semibold tabular-nums",
            size === "sm" && "text-base",
            size === "md" && "text-2xl",
            size === "lg" && "text-4xl"
          )}
          style={{ color: `hsl(${colorVar})` }}
        >
          <AnimatedCounter
            value={clamped}
            duration={shouldAnimate ? 800 : 0}
            decimals={0}
            suffix={unit}
          />
        </div>
        <div
          className={cn(
            "text-muted-foreground",
            size === "sm" && "text-[10px]",
            size === "md" && "text-xs",
            size === "lg" && "text-sm"
          )}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

export default KpiGauge;
