/**
 * MonthlyBarSeries — short row of vertical bars for recent periods (Wave 71).
 *
 * 5-12 vertical bars representing months / weeks / sprints. Most bars use a
 * subtle base color; bars flagged `highlighted: true` render in the brand
 * accent so the latest (or peak) period pops. Optional `caption` and `lede`
 * render above the bars (e.g. lede="$42,810" caption="9.2% growth").
 *
 * Animation: each bar grows up from baseline on mount, staggered by 60ms
 * for a sequential reveal. Hover a bar to see exact value via ChartTooltip.
 *
 * Tokens only. Respects `prefers-reduced-motion`. Pure SVG, no chart lib.
 */

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChartTooltip, type ChartTooltipState } from "./ChartTooltip";

export type MonthlyBarSeriesPalette =
  | "sapphire"
  | "emerald"
  | "amber"
  | "crimson"
  | "violet"
  | "teal";

export type MonthlyBar = {
  /** X-axis label (e.g. "Jan", "Wk 12"). */
  label: string;
  /** Numeric value. */
  value: number;
  /** Render this bar in accent color (typically the latest or peak period). */
  highlighted?: boolean;
};

export type MonthlyBarSeriesProps = {
  bars: MonthlyBar[];
  /** Big headline (e.g. "$42,810"). Renders above the bars. */
  lede?: string;
  /** Sub-caption (e.g. "9.2% growth this quarter"). */
  caption?: string;
  /** Accent for the highlighted bar. Default sapphire. */
  color?: MonthlyBarSeriesPalette;
  /** Bar width (px). Default 12. */
  barWidth?: number;
  /** Gap between bars (px). Default 6. */
  barGap?: number;
  /** Container height (px). Default 72. */
  height?: number;
  /**
   * Stretch the bars to fill the parent's full width (responsive). When true
   * the component measures its container and distributes the bars evenly across
   * it instead of using the intrinsic `barWidth`/`barGap` layout — so the chart
   * fills its card rather than hugging the left edge. Default false (intrinsic).
   */
  fillWidth?: boolean;
  /** Formatter for tooltip values. Default toLocaleString. */
  formatValue?: (n: number) => string;
  className?: string;
  ariaLabel?: string;
};

const PALETTE_VAR: Record<MonthlyBarSeriesPalette, string> = {
  sapphire: "var(--gauge-sapphire)",
  emerald: "var(--gauge-emerald)",
  amber: "var(--gauge-amber)",
  crimson: "var(--gauge-crimson)",
  violet: "var(--gauge-violet)",
  teal: "var(--gauge-teal)",
};

function defaultFormat(n: number): string {
  return n.toLocaleString();
}

export function MonthlyBarSeries({
  bars,
  lede,
  caption,
  color = "sapphire",
  barWidth = 12,
  barGap = 6,
  height = 72,
  fillWidth = false,
  formatValue = defaultFormat,
  className,
  ariaLabel,
}: MonthlyBarSeriesProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion;
  const colorVar = PALETTE_VAR[color];

  const containerRef = useRef<HTMLDivElement | null>(null);

  const max = Math.max(...bars.map((b) => b.value), 0.0001);
  const intrinsicW =
    bars.length * barWidth + Math.max(0, bars.length - 1) * barGap;

  // Responsive width: when `fillWidth`, measure the container and lay the bars
  // out across its full width so the chart fills the card. Falls back to the
  // intrinsic width until the first measurement lands.
  const [measuredW, setMeasuredW] = useState<number>(0);
  useEffect(() => {
    if (!fillWidth) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setMeasuredW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fillWidth]);

  const useFill = fillWidth && measuredW > 0;
  const layoutW = useFill ? measuredW : intrinsicW;
  // In fill mode, spread bars into equal slots and widen each bar to ~62% of
  // its slot (capped) so the row reads full and balanced, not sparse.
  const slotW = useFill ? layoutW / bars.length : barWidth + barGap;
  const drawnBarW = useFill
    ? Math.max(barWidth, Math.min(slotW * 0.62, 44))
    : barWidth;
  const xFor = (i: number) =>
    useFill ? i * slotW + (slotW - drawnBarW) / 2 : i * (barWidth + barGap);

  const labelRowH = 16;
  const innerH = height - labelRowH;

  const [bootIdx, setBootIdx] = useState<number>(shouldAnimate ? -1 : bars.length);
  useEffect(() => {
    if (!shouldAnimate) {
      setBootIdx(bars.length);
      return;
    }
    setBootIdx(-1);
    const timers: ReturnType<typeof setTimeout>[] = [];
    bars.forEach((_, i) => {
      timers.push(
        setTimeout(() => setBootIdx((current) => Math.max(current, i)), i * 60)
      );
    });
    return () => timers.forEach((t) => clearTimeout(t));
  }, [bars, shouldAnimate]);

  const [tip, setTip] = useState<ChartTooltipState | null>(null);

  function handleBarEnter(e: React.MouseEvent<SVGRectElement>, idx: number) {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const barRect = e.currentTarget.getBoundingClientRect();
    setTip({
      x: barRect.left + barRect.width / 2 - containerRect.left,
      y: barRect.top - containerRect.top,
      label: bars[idx].label,
      value: formatValue(bars[idx].value),
      accent: `hsl(${colorVar})`,
    });
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex flex-col gap-2",
        fillWidth ? "w-full" : "inline-flex",
        className
      )}
      data-testid="monthly-bar-series"
    >
      {(lede || caption) && (
        <div className="flex flex-col">
          {lede && (
            <div className="text-2xl font-semibold tabular-nums leading-none">
              {lede}
            </div>
          )}
          {caption && (
            <div
              className="text-xs font-medium mt-1"
              style={{ color: `hsl(${colorVar})` }}
            >
              {caption}
            </div>
          )}
        </div>
      )}
      <svg
        viewBox={`0 0 ${layoutW} ${height}`}
        width={useFill ? "100%" : layoutW}
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={
          ariaLabel ?? `Bar series, ${bars.length} periods, peak ${formatValue(max)}`
        }
      >
        {bars.map((b, i) => {
          const barH = Math.max(2, (b.value / max) * innerH);
          const x = xFor(i);
          const targetH = bootIdx >= i ? barH : 0;
          const isHi = b.highlighted;
          const fill = isHi ? `hsl(${colorVar})` : "hsl(var(--foreground) / 0.18)";
          return (
            <g key={`${b.label}-${i}`} role="presentation">
              <motion.rect
                x={x}
                width={drawnBarW}
                rx={2}
                ry={2}
                fill={fill}
                initial={shouldAnimate ? { height: 0, y: innerH } : { height: barH, y: innerH - barH }}
                animate={{ height: targetH, y: innerH - targetH }}
                transition={{
                  duration: shouldAnimate ? 0.5 : 0,
                  ease: [0.16, 1, 0.3, 1],
                }}
                onMouseEnter={(e) => handleBarEnter(e, i)}
                onMouseLeave={() => setTip(null)}
                style={{ cursor: "pointer" }}
                data-testid={`monthly-bar-${i}`}
                data-highlighted={isHi ? "true" : undefined}
              />
              <text
                x={x + drawnBarW / 2}
                y={height - 2}
                textAnchor="middle"
                className="text-[9px] fill-muted-foreground tabular-nums"
                aria-hidden="true"
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartTooltip state={tip} />
    </div>
  );
}

export default MonthlyBarSeries;
