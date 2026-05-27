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
  formatValue = defaultFormat,
  className,
  ariaLabel,
}: MonthlyBarSeriesProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = !reduceMotion;
  const colorVar = PALETTE_VAR[color];

  const max = Math.max(...bars.map((b) => b.value), 0.0001);
  const innerW = bars.length * barWidth + Math.max(0, bars.length - 1) * barGap;
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

  const containerRef = useRef<HTMLDivElement | null>(null);
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
      className={cn("relative inline-flex flex-col gap-2", className)}
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
        viewBox={`0 0 ${innerW} ${height}`}
        width={innerW}
        height={height}
        role="img"
        aria-label={
          ariaLabel ?? `Bar series, ${bars.length} periods, peak ${formatValue(max)}`
        }
      >
        {bars.map((b, i) => {
          const barH = Math.max(2, (b.value / max) * innerH);
          const x = i * (barWidth + barGap);
          const targetH = bootIdx >= i ? barH : 0;
          const isHi = b.highlighted;
          const fill = isHi ? `hsl(${colorVar})` : "hsl(var(--foreground) / 0.18)";
          return (
            <g key={`${b.label}-${i}`} role="presentation">
              <motion.rect
                x={x}
                width={barWidth}
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
                x={x + barWidth / 2}
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
