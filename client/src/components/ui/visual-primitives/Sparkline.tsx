/**
 * Sparkline — tiny inline trend chart (Wave 26.7).
 *
 * Alex 2026-05-26 approved adding 2 new viz primitives so a 4-gauge
 * dashboard row mixes visual rhythm (vs all semi-circular). Pattern
 * references: Stripe, Linear, Notion, Vercel dashboards.
 *
 * Pure SVG, ~50 LOC. Renders a line (or filled area) for a small array
 * of values normalised to width × height. A pulsing dot marks the
 * latest point. Stroke is drawn left-to-right via `stroke-dasharray`
 * animation on mount (~600ms ease-out).
 *
 * Uses the same Wave 26.5 palette tokens (sapphire / emerald / amber /
 * crimson / violet / teal) as KpiGauge for consistency across a row.
 * color="auto" picks based on trend direction (rising=emerald,
 * falling=crimson, flat=sapphire).
 *
 * Anti-pattern: deliberately no hover popover. Sparklines are too small
 * to host a help bubble — that responsibility stays on the surrounding
 * tile (KpiGauge / ProgressRing) or label. Respects `prefers-reduced-motion`.
 */

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type SparklinePalette =
  | "sapphire"
  | "emerald"
  | "amber"
  | "crimson"
  | "violet"
  | "teal";

export type SparklineColor = "auto" | SparklinePalette;
export type SparklineVariant = "line" | "area";

export type SparklineProps = {
  /** Data points to render (7-30 typical). */
  values: number[];
  /** Pixel width. Default 80. */
  width?: number;
  /** Pixel height. Default 24. */
  height?: number;
  /** "line" (just a stroke) or "area" (stroke + tinted fill to baseline). */
  variant?: SparklineVariant;
  /** Color token. `auto` picks by trend direction. */
  color?: SparklineColor;
  /** Pulsing dot on the most-recent value (default true). */
  showLastPoint?: boolean;
  ariaLabel?: string;
  className?: string;
};

// Same gauge palette tokens as Wave 26.5 KpiGauge — consistency across a row.
const PALETTE_VAR: Record<SparklinePalette, string> = {
  sapphire: "var(--gauge-sapphire)",
  emerald: "var(--gauge-emerald)",
  amber: "var(--gauge-amber)",
  crimson: "var(--gauge-crimson)",
  violet: "var(--gauge-violet)",
  teal: "var(--gauge-teal)",
};

/** Pick a palette by trend direction (compare first half vs second half mean). */
function autoTrendColor(values: number[]): SparklinePalette {
  if (values.length < 2) return "sapphire";
  const half = Math.floor(values.length / 2);
  const a = values.slice(0, half);
  const b = values.slice(half);
  const mean = (xs: number[]) =>
    xs.reduce((sum, v) => sum + v, 0) / Math.max(1, xs.length);
  const ma = mean(a);
  const mb = mean(b);
  const range = Math.max(...values) - Math.min(...values);
  // Treat <5% range as flat to avoid noise.
  const threshold = Math.max(0.0001, Math.abs(ma) * 0.05, range * 0.05);
  if (mb - ma > threshold) return "emerald";
  if (ma - mb > threshold) return "crimson";
  return "sapphire";
}

export function Sparkline({
  values,
  width = 80,
  height = 24,
  variant = "line",
  color = "auto",
  showLastPoint = true,
  ariaLabel,
  className,
}: SparklineProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion;

  const palette = color === "auto" ? autoTrendColor(values) : color;
  const colorVar = PALETTE_VAR[palette];

  // Normalize values to viewBox. If all values are identical (or empty), draw
  // a flat midline. Reserve 2px padding top/bottom so the stroke doesn't clip.
  const { linePath, areaPath, lastPoint, hasData } = useMemo(() => {
    if (values.length === 0) {
      return { linePath: "", areaPath: "", lastPoint: null, hasData: false };
    }
    const pad = 2;
    const innerH = height - pad * 2;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = values.length > 1 ? width / (values.length - 1) : 0;
    const points = values.map((v, i) => {
      const x = i * stepX;
      const y = pad + innerH - ((v - min) / range) * innerH;
      return { x, y };
    });
    const line = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
    const area = `${line} L ${width.toFixed(2)} ${height} L 0 ${height} Z`;
    return {
      linePath: line,
      areaPath: area,
      lastPoint: points[points.length - 1],
      hasData: true,
    };
  }, [values, width, height]);

  if (!hasData) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("inline-block", className)}
        role="img"
        aria-label={ariaLabel ?? "Sparkline — no data"}
        data-testid="sparkline"
      >
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="hsl(var(--foreground))"
          strokeOpacity={0.18}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  const initial = shouldAnimate ? { pathLength: 0 } : { pathLength: 1 };
  const animate = { pathLength: 1 };
  const transition = {
    duration: shouldAnimate ? 0.6 : 0,
    ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("inline-block", className)}
      role="img"
      aria-label={
        ariaLabel ??
        `Trend sparkline (${values.length} points, latest ${values[values.length - 1]})`
      }
      data-testid="sparkline"
      data-palette={palette}
      data-variant={variant}
    >
      {variant === "area" && (
        <motion.path
          d={areaPath}
          fill={`hsl(${colorVar})`}
          fillOpacity={0.12}
          initial={shouldAnimate ? { opacity: 0 } : { opacity: 1 }}
          animate={{ opacity: 1 }}
          transition={{ duration: shouldAnimate ? 0.6 : 0, ease: "easeOut" }}
        />
      )}
      <motion.path
        d={linePath}
        fill="none"
        stroke={`hsl(${colorVar})`}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={initial}
        animate={animate}
        transition={transition}
      />
      {showLastPoint && lastPoint && (
        <motion.circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={2}
          fill={`hsl(${colorVar})`}
          animate={
            shouldAnimate
              ? { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }
              : undefined
          }
          transition={
            shouldAnimate
              ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
              : undefined
          }
          style={{ transformOrigin: `${lastPoint.x}px ${lastPoint.y}px` }}
        />
      )}
    </svg>
  );
}

export default Sparkline;
