/**
 * SemiGauge — semicircular satisfaction-style gauge (Wave 71).
 *
 * Half-arc "speedometer" gauge designed for CSAT / NPS / health-score
 * surfaces where a value lives on a fixed scale and benefits from a verdict
 * + advice. Sibling to the existing KpiGauge but with a richer text stack
 * below: big number → verdict line (color-coded by threshold) → advice copy.
 *
 * 180-degree arc from min to max. The foreground arc fills 0 → value on
 * mount via stroke-dashoffset; needle pivots to the value at the same time.
 * Hover the arc to see the exact value via ChartTooltip ("Exact value: 73").
 *
 * Color-coded verdict thresholds:
 *   value/max ≥ 0.80 → emerald
 *   value/max 0.50-0.79 → amber
 *   value/max < 0.50 → crimson
 *
 * The verdict + advice slots are optional — if a consumer only passes
 * `value`, the gauge degrades to a number-with-arc cleanly.
 *
 * Tokens only. Respects `prefers-reduced-motion`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "./AnimatedCounter";
import { ChartTooltip, type ChartTooltipState } from "./ChartTooltip";

export type SemiGaugePalette =
  | "sapphire"
  | "emerald"
  | "amber"
  | "crimson"
  | "violet"
  | "teal";

export type SemiGaugeProps = {
  value: number;
  min?: number;
  max?: number;
  /** Title above the gauge. */
  label?: string;
  /** Headline verdict line shown below the value (e.g. "Good, Room to Improve"). */
  verdict?: string;
  /** Body advice copy beneath the verdict. */
  advice?: string;
  /** Optional unit suffix on the big number (e.g. "%", "/100"). */
  unit?: string;
  /**
   * Force palette regardless of threshold. Useful when you want a brand
   * accent rather than a green/amber/red traffic-light read.
   */
  palette?: SemiGaugePalette;
  /** Diameter in px. Default 220. */
  size?: number;
  /** Show a needle indicator. Default true. */
  showNeedle?: boolean;
  /** Formatter for the centre number. Defaults to toFixed(0). */
  formatValue?: (n: number) => string;
  className?: string;
  ariaLabel?: string;
};

const PALETTE_VAR: Record<SemiGaugePalette, string> = {
  sapphire: "var(--gauge-sapphire)",
  emerald: "var(--gauge-emerald)",
  amber: "var(--gauge-amber)",
  crimson: "var(--gauge-crimson)",
  violet: "var(--gauge-violet)",
  teal: "var(--gauge-teal)",
};

function thresholdPalette(pct: number): SemiGaugePalette {
  if (pct >= 80) return "emerald";
  if (pct >= 50) return "amber";
  return "crimson";
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (Math.PI * deg) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg > startDeg ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

export function SemiGauge({
  value,
  min = 0,
  max = 100,
  label,
  verdict,
  advice,
  unit = "",
  palette,
  size = 220,
  showNeedle = true,
  formatValue,
  className,
  ariaLabel,
}: SemiGaugeProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion;

  const range = Math.max(0.0001, max - min);
  const clamped = Math.min(max, Math.max(min, value));
  const pct = ((clamped - min) / range) * 100;

  const resolvedPalette = palette ?? thresholdPalette(pct);
  const colorVar = PALETTE_VAR[resolvedPalette];

  // SVG geometry — viewBox is 200 wide × 130 tall so the half-arc fits with
  // breathing room for the needle pivot dot.
  const VB_W = 200;
  const VB_H = 130;
  const cx = 100;
  const cy = 100;
  const r = 80;
  const stroke = Math.round(size / 14);

  const startAngle = 180;
  const endAngle = 0;
  const bgPath = useMemo(() => arcPath(cx, cy, r, startAngle, endAngle), []);
  const halfC = Math.PI * r;

  // Animate from 0 → value on mount.
  const [bootPct, setBootPct] = useState<number>(shouldAnimate ? 0 : pct);
  const bootStartedRef = useRef(false);
  useEffect(() => {
    if (!shouldAnimate) {
      setBootPct(pct);
      return;
    }
    if (bootStartedRef.current) {
      setBootPct(pct);
      return;
    }
    bootStartedRef.current = true;
    setBootPct(0);
    const id = setTimeout(() => setBootPct(pct), 30);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAnimate]);
  useEffect(() => {
    if (bootStartedRef.current) setBootPct(pct);
  }, [pct]);

  const displayedAngle = startAngle - (bootPct / 100) * (startAngle - endAngle);
  const needleTip = polar(cx, cy, r - stroke / 2 - 6, displayedAngle);
  const filled = (bootPct / 100) * halfC;
  const displayedValue = min + (bootPct / 100) * range;

  // Hover tooltip on arc.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<ChartTooltipState | null>(null);
  function handleArcEnter(e: React.MouseEvent<SVGPathElement>) {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    setTip({
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
      label: label ?? "Score",
      value: `${(formatValue ?? ((n) => n.toFixed(0)))(clamped)}${unit}`,
      detail: `Range ${min}–${max}`,
      accent: `hsl(${colorVar})`,
    });
  }

  const ariaText =
    ariaLabel ??
    `${label ?? "Gauge"}: ${clamped}${unit} out of ${max}${unit}${
      verdict ? `, ${verdict}` : ""
    }`;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative inline-flex flex-col items-center w-full max-w-xs",
        className
      )}
      style={{ minWidth: size }}
      data-testid="semi-gauge"
    >
      {label && (
        <div className="text-sm font-medium text-muted-foreground mb-2 text-center">
          {label}
        </div>
      )}
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width={size}
        height={size * (VB_H / VB_W)}
        role="img"
        aria-label={ariaText}
      >
        {/* Background half-arc */}
        <path
          d={bgPath}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeOpacity={0.12}
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
          animate={{ strokeDashoffset: halfC - filled }}
          transition={{
            duration: shouldAnimate ? 0.9 : 0,
            ease: [0.16, 1, 0.3, 1],
          }}
          style={{ cursor: "pointer" }}
          onMouseMove={handleArcEnter}
          onMouseLeave={() => setTip(null)}
          data-testid="semi-gauge-arc"
        />
        {showNeedle && (
          <>
            <motion.line
              x1={cx}
              y1={cy}
              animate={{ x2: needleTip.x, y2: needleTip.y }}
              transition={{
                duration: shouldAnimate ? 0.9 : 0,
                ease: [0.16, 1, 0.3, 1],
              }}
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={4} fill="hsl(var(--foreground))" />
          </>
        )}
      </svg>
      <div className="flex flex-col items-center -mt-6 gap-1 px-2 text-center">
        <div
          className="text-3xl font-semibold tabular-nums leading-none"
          style={{ color: `hsl(${colorVar})` }}
        >
          <AnimatedCounter
            value={displayedValue}
            duration={shouldAnimate ? 600 : 0}
            decimals={0}
            suffix={unit}
          />
        </div>
        {verdict && (
          <div
            className="text-sm font-medium leading-tight"
            style={{ color: `hsl(${colorVar})` }}
            data-testid="semi-gauge-verdict"
          >
            {verdict}
          </div>
        )}
        {advice && (
          <p className="text-xs text-muted-foreground leading-snug max-w-[260px]">
            {advice}
          </p>
        )}
      </div>
      <ChartTooltip state={tip} />
    </div>
  );
}

export default SemiGauge;
