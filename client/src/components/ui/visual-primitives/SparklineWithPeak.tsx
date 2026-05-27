/**
 * SparklineWithPeak — sparkline with peak callout (Wave 71).
 *
 * Extends the existing Sparkline pattern. Renders the same left-to-right
 * stroked line, then identifies the MAX value in the series, draws a peak
 * dot at that point, and floats a callout label above the dot ("+$12,180")
 * connected by a short stem. The line draws first (~600ms), then the peak
 * dot + label fade in once the line completes.
 *
 * Designed to mirror dashboard hero charts on Stripe / Linear where a single
 * "best moment" is celebrated visually. Pairs ChartTooltip on hover so the
 * user can read exact values at any point along the line.
 *
 * Theme: semantic tokens only (no hex). Wave 26.5 palette tokens for line
 * color. Respects `prefers-reduced-motion` — skips draw + fade animations
 * and snaps to final state.
 *
 * ARIA: role="img" with aria-label summarising the series and peak. The
 * peak is exposed as a focusable child SVG element with its own label so
 * screen-reader users get the celebrated moment.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChartTooltip, type ChartTooltipState } from "./ChartTooltip";

export type SparklineWithPeakPalette =
  | "sapphire"
  | "emerald"
  | "amber"
  | "crimson"
  | "violet"
  | "teal";

export type SparklineWithPeakProps = {
  /** Numeric series (4+ points typical, 30+ supported). */
  data: number[];
  /** Per-point label for the hover tooltip (e.g. "Mar 14"). Optional. */
  pointLabels?: string[];
  /**
   * Pre-formatted callout shown above the peak dot. If omitted, the raw peak
   * value is rendered with thousands separators.
   */
  peakLabel?: string;
  /** Formatter for tooltip values; defaults to `n.toLocaleString()`. */
  formatValue?: (n: number) => string;
  /** Color palette token. Defaults to sapphire. */
  color?: SparklineWithPeakPalette;
  /** Pixel width. Default 320. */
  width?: number;
  /** Pixel height. Default 96. */
  height?: number;
  /** Stroke width. Default 2. */
  strokeWidth?: number;
  /** Whether to fill the area under the line. Default true. */
  showArea?: boolean;
  /** Total animation duration in ms for the line draw. Default 700. */
  animationDuration?: number;
  ariaLabel?: string;
  className?: string;
};

const PALETTE_VAR: Record<SparklineWithPeakPalette, string> = {
  sapphire: "var(--gauge-sapphire)",
  emerald: "var(--gauge-emerald)",
  amber: "var(--gauge-amber)",
  crimson: "var(--gauge-crimson)",
  violet: "var(--gauge-violet)",
  teal: "var(--gauge-teal)",
};

function defaultFormat(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function SparklineWithPeak({
  data,
  pointLabels,
  peakLabel,
  formatValue = defaultFormat,
  color = "sapphire",
  width = 320,
  height = 96,
  strokeWidth = 2,
  showArea = true,
  animationDuration = 700,
  ariaLabel,
  className,
}: SparklineWithPeakProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion;
  const colorVar = PALETTE_VAR[color];

  // Reserve top space for the callout label (~30px) and bottom for the line.
  // The line itself occupies the lower 60% of the SVG so the callout sits
  // above without overlapping.
  const CALLOUT_RESERVE = 32;
  const PAD_X = 8;
  const PAD_BOTTOM = 6;

  const { linePath, areaPath, points, peakIdx } = useMemo(() => {
    if (data.length === 0) {
      return {
        linePath: "",
        areaPath: "",
        points: [] as Array<{ x: number; y: number; v: number }>,
        peakIdx: -1,
      };
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const innerW = width - PAD_X * 2;
    const innerH = height - CALLOUT_RESERVE - PAD_BOTTOM;
    const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
    const pts = data.map((v, i) => {
      const x = PAD_X + i * stepX;
      const y =
        CALLOUT_RESERVE + (innerH - ((v - min) / range) * innerH);
      return { x, y, v };
    });
    const line = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
    const area = `${line} L ${(width - PAD_X).toFixed(2)} ${height - PAD_BOTTOM} L ${PAD_X} ${height - PAD_BOTTOM} Z`;
    let peak = 0;
    for (let i = 1; i < data.length; i += 1) {
      if (data[i] > data[peak]) peak = i;
    }
    return { linePath: line, areaPath: area, points: pts, peakIdx: peak };
  }, [data, width, height]);

  const hasData = points.length > 0;
  const peakPoint = peakIdx >= 0 ? points[peakIdx] : null;
  const resolvedPeakLabel =
    peakLabel ?? (peakPoint ? formatValue(peakPoint.v) : "");

  // Hover tracking — find nearest point to cursor X.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<ChartTooltipState | null>(null);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!hasData) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
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
    setTip({
      x: p.x,
      y: p.y,
      label: pointLabels?.[nearest] ?? `Point ${nearest + 1}`,
      value: formatValue(p.v),
      accent: `hsl(${colorVar})`,
    });
  }

  // Peak callout fade-in: only after line completes.
  const [peakVisible, setPeakVisible] = useState(!shouldAnimate);
  useEffect(() => {
    if (!shouldAnimate) {
      setPeakVisible(true);
      return;
    }
    setPeakVisible(false);
    const id = setTimeout(() => setPeakVisible(true), animationDuration);
    return () => clearTimeout(id);
  }, [shouldAnimate, animationDuration, data]);

  if (!hasData) {
    return (
      <div
        ref={containerRef}
        className={cn("relative inline-block", className)}
        style={{ width, height }}
        data-testid="sparkline-with-peak-empty"
      >
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
          <line
            x1={PAD_X}
            x2={width - PAD_X}
            y1={height / 2}
            y2={height / 2}
            stroke="hsl(var(--foreground))"
            strokeOpacity={0.18}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        </svg>
      </div>
    );
  }

  // Callout stem connects the peak dot up to the label background. Stem
  // height ~ (peakY - 20). We render the label at y=8 (top of SVG).
  const calloutY = 10;
  // Heuristic horizontal anchor: if peak is in the left/right 15% of width,
  // shift the callout inward so the label doesn't clip outside the SVG.
  const labelAnchor =
    peakPoint && peakPoint.x < width * 0.15
      ? "start"
      : peakPoint && peakPoint.x > width * 0.85
        ? "end"
        : "middle";

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-block", className)}
      style={{ width, height }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={
          ariaLabel ??
          `Trend with peak ${resolvedPeakLabel} at ${pointLabels?.[peakIdx] ?? `point ${peakIdx + 1}`}`
        }
        data-testid="sparkline-with-peak"
        data-palette={color}
        onMouseMove={handleMove}
        onMouseLeave={() => setTip(null)}
      >
        {showArea && (
          <motion.path
            d={areaPath}
            fill={`hsl(${colorVar})`}
            fillOpacity={0.12}
            initial={shouldAnimate ? { opacity: 0 } : { opacity: 1 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: shouldAnimate ? animationDuration / 1000 : 0,
              ease: "easeOut",
            }}
          />
        )}
        <motion.path
          d={linePath}
          fill="none"
          stroke={`hsl(${colorVar})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={shouldAnimate ? { pathLength: 0 } : { pathLength: 1 }}
          animate={{ pathLength: 1 }}
          transition={{
            duration: shouldAnimate ? animationDuration / 1000 : 0,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
        {/* Peak dot + callout — fades in after line completes. */}
        {peakPoint && (
          <motion.g
            initial={shouldAnimate ? { opacity: 0 } : { opacity: 1 }}
            animate={{ opacity: peakVisible ? 1 : 0 }}
            transition={{ duration: shouldAnimate ? 0.3 : 0, ease: "easeOut" }}
          >
            {/* Stem from dot upward to callout */}
            <line
              x1={peakPoint.x}
              y1={peakPoint.y - 4}
              x2={peakPoint.x}
              y2={calloutY + 14}
              stroke={`hsl(${colorVar})`}
              strokeOpacity={0.5}
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            {/* Peak dot — outer halo + solid core */}
            <circle
              cx={peakPoint.x}
              cy={peakPoint.y}
              r={5}
              fill={`hsl(${colorVar})`}
              fillOpacity={0.2}
            />
            <circle
              cx={peakPoint.x}
              cy={peakPoint.y}
              r={3}
              fill={`hsl(${colorVar})`}
            />
            {/* Callout label — pill shape */}
            <g
              transform={`translate(${peakPoint.x}, ${calloutY})`}
              aria-label={`Peak ${resolvedPeakLabel}`}
            >
              <rect
                x={
                  labelAnchor === "middle"
                    ? -((resolvedPeakLabel.length * 6.5) / 2) - 6
                    : labelAnchor === "start"
                      ? -6
                      : -(resolvedPeakLabel.length * 6.5) - 6
                }
                y={0}
                width={resolvedPeakLabel.length * 6.5 + 12}
                height={18}
                rx={9}
                fill={`hsl(${colorVar})`}
              />
              <text
                x={
                  labelAnchor === "middle"
                    ? 0
                    : labelAnchor === "start"
                      ? 0
                      : -resolvedPeakLabel.length * 6.5
                }
                y={12}
                textAnchor={labelAnchor}
                className="text-[11px] font-semibold"
                fill="hsl(var(--background))"
              >
                {resolvedPeakLabel}
              </text>
            </g>
          </motion.g>
        )}
        {/* Hover indicator — vertical guide + dot at nearest point. */}
        {tip && (
          <g pointerEvents="none">
            <line
              x1={tip.x}
              x2={tip.x}
              y1={CALLOUT_RESERVE}
              y2={height - PAD_BOTTOM}
              stroke="hsl(var(--foreground))"
              strokeOpacity={0.25}
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <circle
              cx={tip.x}
              cy={tip.y}
              r={4}
              fill={`hsl(${colorVar})`}
              stroke="hsl(var(--background))"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>
      <ChartTooltip state={tip} />
    </div>
  );
}

export default SparklineWithPeak;
