/**
 * Sparkline — tiny inline trend chart (Wave 26.7, hover-tooltip wired Wave 71).
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
 * Wave 71 retrofit: now wires the shared ChartTooltip on hover, exposing
 * the exact data value at the cursor's nearest point. Pass `pointLabels`
 * to label each point in the tooltip (e.g. ["Jan", "Feb", ...]); without
 * them, points are labelled "Point N". `enableHover={false}` opts out (the
 * original Wave 26.7 behaviour — useful when the sparkline is decorative
 * inside a hero KPI tile whose own popover handles explanation).
 *
 * Respects `prefers-reduced-motion`.
 */

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChartTooltip, type ChartTooltipState } from "./ChartTooltip";

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
  /**
   * Wave 71: enable cursor-follow ChartTooltip on hover. Default true.
   * Set false to preserve the original Wave 26.7 decorative behaviour.
   */
  enableHover?: boolean;
  /**
   * Wave 71: optional per-point labels for the hover tooltip
   * (e.g. ["Jan", "Feb", "Mar"]). When omitted, tooltip shows "Point N".
   */
  pointLabels?: string[];
  /** Wave 71: formatter for the hover tooltip value. */
  formatValue?: (n: number) => string;
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
  enableHover = true,
  pointLabels,
  formatValue,
  ariaLabel,
  className,
}: SparklineProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion;

  const palette = color === "auto" ? autoTrendColor(values) : color;
  const colorVar = PALETTE_VAR[palette];

  // Normalize values to viewBox. If all values are identical (or empty), draw
  // a flat midline. Reserve 2px padding top/bottom so the stroke doesn't clip.
  const { linePath, areaPath, lastPoint, hasData, points } = useMemo(() => {
    if (values.length === 0) {
      return {
        linePath: "",
        areaPath: "",
        lastPoint: null,
        hasData: false,
        points: [] as Array<{ x: number; y: number; v: number }>,
      };
    }
    const pad = 2;
    const innerH = height - pad * 2;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = values.length > 1 ? width / (values.length - 1) : 0;
    const computedPoints = values.map((v, i) => {
      const x = i * stepX;
      const y = pad + innerH - ((v - min) / range) * innerH;
      return { x, y, v };
    });
    const line = computedPoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
    const area = `${line} L ${width.toFixed(2)} ${height} L 0 ${height} Z`;
    return {
      linePath: line,
      areaPath: area,
      lastPoint: computedPoints[computedPoints.length - 1],
      hasData: true,
      points: computedPoints,
    };
  }, [values, width, height]);

  // Wave 36 — Tesla simplification: hide entirely when the trend is flat
  // (all values equal or variation under 5% of the mean). A flat sparkline
  // adds visual noise without communicating anything; the surrounding tile
  // already shows today's number. Empty/no-data still renders the dashed
  // placeholder so users see the placeholder during loading.
  const isFlat = (() => {
    if (values.length < 2) return false;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return true;
    const meanAbs = Math.abs(values.reduce((s, v) => s + v, 0) / values.length);
    const range = max - min;
    if (meanAbs === 0) return range < 0.0001;
    return range / meanAbs < 0.05;
  })();
  if (hasData && isFlat) {
    return null;
  }

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

  // Wave 71 — cursor-follow ChartTooltip wiring. Find the nearest point on
  // mousemove; clear on leave. Skipped entirely when `enableHover` is false.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<ChartTooltipState | null>(null);
  const formatTipValue = formatValue ?? ((n: number) => n.toLocaleString());

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!enableHover || points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const d = Math.abs(points[i].x - localX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    const p = points[nearest];
    // Scale SVG coords to displayed pixel coords for the tooltip wrapper.
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    setTip({
      x: p.x * scaleX,
      y: p.y * scaleY,
      label: pointLabels?.[nearest] ?? `Point ${nearest + 1}`,
      value: formatTipValue(p.v),
      accent: `hsl(${colorVar})`,
    });
  }

  const svg = (
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
      onMouseMove={enableHover ? handleMove : undefined}
      onMouseLeave={enableHover ? () => setTip(null) : undefined}
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
      {/* Hover dot — small accent on the nearest point. */}
      {enableHover && tip && (
        <circle
          cx={(tip.x / (containerRef.current?.getBoundingClientRect().width ?? width)) * width}
          cy={(tip.y / (containerRef.current?.getBoundingClientRect().height ?? height)) * height}
          r={2.5}
          fill={`hsl(${colorVar})`}
          stroke="hsl(var(--background))"
          strokeWidth={1}
          pointerEvents="none"
        />
      )}
    </svg>
  );

  if (!enableHover) return svg;

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      style={{ width, height }}
    >
      {svg}
      <ChartTooltip state={tip} />
    </div>
  );
}

export default Sparkline;
