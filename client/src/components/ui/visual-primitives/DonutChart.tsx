/**
 * DonutChart — segmented ring + legend (Wave 71).
 *
 * Renders a donut SVG with 2-8 proportional arcs (70% inner radius for the
 * ring effect) plus a legend on the right showing colored dot + label + value.
 * Arcs draw in clockwise on mount over ~800ms, with a 90ms stagger per segment
 * for a sequential reveal. Hovering a segment shows label + value + percent
 * via ChartTooltip and slightly pulls that segment outward.
 *
 * Token-only colors. If `segments[i].color` is omitted, the component cycles
 * through the Wave 26.5 gauge palette (sapphire / violet / emerald / amber /
 * teal / crimson). Respects `prefers-reduced-motion`.
 *
 * ARIA: role="img" with aria-label summarising segment totals. Legend rows
 * are individually focusable via Tab.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChartTooltip, type ChartTooltipState } from "./ChartTooltip";

export type DonutChartPalette =
  | "sapphire"
  | "emerald"
  | "amber"
  | "crimson"
  | "violet"
  | "teal";

export type DonutSegment = {
  label: string;
  value: number;
  /** Optional palette override; cycles through the default palette if omitted. */
  color?: DonutChartPalette;
};

export type DonutChartProps = {
  segments: DonutSegment[];
  /** Headline above the donut (e.g. "Visitors Segmentation"). Optional. */
  title?: string;
  /** Optional centre label shown inside the donut (e.g. total count). */
  centerLabel?: string;
  /** Optional centre sub-label (e.g. "visits"). */
  centerSub?: string;
  /** Donut diameter in px. Default 160. */
  size?: number;
  /** Ring thickness as a fraction of radius (0-1). Default 0.3 (~70% inner radius). */
  thickness?: number;
  /** Show legend on the right. Default true. */
  showLegend?: boolean;
  /** Formatter for legend + tooltip values. */
  formatValue?: (n: number) => string;
  className?: string;
  ariaLabel?: string;
};

const PALETTE_VAR: Record<DonutChartPalette, string> = {
  sapphire: "var(--gauge-sapphire)",
  emerald: "var(--gauge-emerald)",
  amber: "var(--gauge-amber)",
  crimson: "var(--gauge-crimson)",
  violet: "var(--gauge-violet)",
  teal: "var(--gauge-teal)",
};

const DEFAULT_CYCLE: DonutChartPalette[] = [
  "sapphire",
  "violet",
  "emerald",
  "amber",
  "teal",
  "crimson",
];

function defaultFormat(n: number): string {
  return n.toLocaleString();
}

/** Polar → cartesian helper. Angle measured clockwise from 12 o'clock. */
function polar(cx: number, cy: number, r: number, deg: number) {
  // Subtract 90 so 0deg points up (12 o'clock).
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** Build a donut-segment path (ring slice) from startDeg to endDeg. */
function ringSlicePath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  endDeg: number
) {
  const span = endDeg - startDeg;
  // Avoid 0-length paths.
  if (span <= 0) return "";
  // Full-circle case (rare but possible with a single segment).
  const isFullCircle = span >= 359.99;
  const sweep = isFullCircle ? 359.99 : span;
  const aEnd = startDeg + sweep;
  const o1 = polar(cx, cy, rOuter, startDeg);
  const o2 = polar(cx, cy, rOuter, aEnd);
  const i1 = polar(cx, cy, rInner, aEnd);
  const i2 = polar(cx, cy, rInner, startDeg);
  const large = sweep > 180 ? 1 : 0;
  return [
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
    `L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function DonutChart({
  segments,
  title,
  centerLabel,
  centerSub,
  size = 160,
  thickness = 0.3,
  showLegend = true,
  formatValue = defaultFormat,
  className,
  ariaLabel,
}: DonutChartProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion;

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter * (1 - Math.min(0.9, Math.max(0.1, thickness)));

  const total = useMemo(
    () => segments.reduce((s, seg) => s + Math.max(0, seg.value), 0),
    [segments]
  );

  type SegArc = {
    seg: DonutSegment;
    color: DonutChartPalette;
    startDeg: number;
    endDeg: number;
    sharePct: number;
  };
  const arcs: SegArc[] = useMemo(() => {
    let cursor = 0;
    return segments.map((seg, i) => {
      const value = Math.max(0, seg.value);
      const span = total > 0 ? (value / total) * 360 : 0;
      const start = cursor;
      cursor += span;
      const color = seg.color ?? DEFAULT_CYCLE[i % DEFAULT_CYCLE.length];
      return {
        seg,
        color,
        startDeg: start,
        endDeg: cursor,
        sharePct: total > 0 ? (value / total) * 100 : 0,
      };
    });
  }, [segments, total]);

  const [bootIdx, setBootIdx] = useState<number>(
    shouldAnimate ? -1 : segments.length
  );
  useEffect(() => {
    if (!shouldAnimate) {
      setBootIdx(segments.length);
      return;
    }
    setBootIdx(-1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    segments.forEach((_, i) => {
      timers.push(
        setTimeout(() => setBootIdx((c) => Math.max(c, i)), i * 90)
      );
    });
    return () => timers.forEach((t) => clearTimeout(t));
  }, [segments, shouldAnimate]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<ChartTooltipState | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  function handleEnter(
    _e: React.SyntheticEvent<Element>,
    idx: number,
    arc: SegArc
  ) {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    // Position tooltip at the segment's midpoint on the donut ring (or
    // at the cursor if hovered via legend).
    const midDeg = (arc.startDeg + arc.endDeg) / 2;
    const midR = (rOuter + rInner) / 2;
    const target = polar(cx, cy, midR, midDeg);
    const svgEl = containerRef.current.querySelector("svg");
    let svgX = target.x;
    let svgY = target.y;
    if (svgEl) {
      const svgRect = svgEl.getBoundingClientRect();
      svgX = svgRect.left - containerRect.left + target.x;
      svgY = svgRect.top - containerRect.top + target.y;
    }
    setHoveredIdx(idx);
    setTip({
      x: svgX,
      y: svgY,
      label: arc.seg.label,
      value: formatValue(arc.seg.value),
      detail: `${arc.sharePct.toFixed(1)}% of total`,
      accent: `hsl(${PALETTE_VAR[arc.color]})`,
    });
  }
  function handleLeave() {
    setHoveredIdx(null);
    setTip(null);
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex flex-col gap-3", className)}
      data-testid="donut-chart"
    >
      {title && <div className="text-sm font-medium">{title}</div>}
      <div className="flex items-center gap-4">
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            viewBox={`0 0 ${size} ${size}`}
            width={size}
            height={size}
            role="img"
            aria-label={
              ariaLabel ??
              `Donut chart with ${segments.length} segments, total ${formatValue(total)}`
            }
          >
            {arcs.map((arc, i) => {
              const visible = bootIdx >= i;
              // Slight outward pull on hovered segment for affordance.
              const pull = hoveredIdx === i ? 3 : 0;
              const midDeg = (arc.startDeg + arc.endDeg) / 2;
              const offset = polar(0, 0, pull, midDeg);
              return (
                <motion.path
                  key={`${arc.seg.label}-${i}`}
                  d={ringSlicePath(cx, cy, rOuter, rInner, arc.startDeg, arc.endDeg)}
                  fill={`hsl(${PALETTE_VAR[arc.color]})`}
                  initial={
                    shouldAnimate ? { opacity: 0, scale: 0.9 } : { opacity: 1, scale: 1 }
                  }
                  animate={{
                    opacity: visible ? 1 : 0,
                    scale: visible ? 1 : 0.9,
                    x: offset.x,
                    y: offset.y,
                  }}
                  transition={{
                    duration: shouldAnimate ? 0.5 : 0,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{
                    transformOrigin: `${cx}px ${cy}px`,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => handleEnter(e, i, arc)}
                  onMouseLeave={handleLeave}
                  data-testid={`donut-segment-${i}`}
                />
              );
            })}
          </svg>
          {(centerLabel || centerSub) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {centerLabel && (
                <div className="text-xl font-semibold tabular-nums leading-none">
                  {centerLabel}
                </div>
              )}
              {centerSub && (
                <div className="text-[10px] text-muted-foreground mt-1 leading-none uppercase tracking-wide">
                  {centerSub}
                </div>
              )}
            </div>
          )}
        </div>
        {showLegend && (
          <ul className="flex-1 space-y-1.5 min-w-0">
            {arcs.map((arc, i) => (
              <li
                key={`${arc.seg.label}-legend-${i}`}
                className={cn(
                  "flex items-center gap-2 text-xs rounded px-1 py-0.5",
                  hoveredIdx === i && "bg-muted/60"
                )}
                onMouseEnter={(e) => handleEnter(e, i, arc)}
                onMouseLeave={handleLeave}
                tabIndex={0}
                onFocus={(e) => handleEnter(e, i, arc)}
                onBlur={handleLeave}
                data-testid={`donut-legend-${i}`}
              >
                <span
                  className="inline-block rounded-full shrink-0"
                  style={{
                    width: 8,
                    height: 8,
                    background: `hsl(${PALETTE_VAR[arc.color]})`,
                  }}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate text-muted-foreground">
                  {arc.seg.label}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatValue(arc.seg.value)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ChartTooltip state={tip} />
    </div>
  );
}

export default DonutChart;
