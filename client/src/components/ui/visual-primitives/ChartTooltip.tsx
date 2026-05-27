/**
 * ChartTooltip — shared cursor-follow tooltip for data-viz primitives (Wave 71).
 *
 * Single tooltip component reused by every chart primitive (SparklineWithPeak,
 * BarComparisonCard, MonthlyBarSeries, DonutChart, SemiGauge) plus retrofitted
 * into the existing Sparkline + ProgressRing. Renders an absolutely-positioned
 * card relative to the chart container with an arrow pointing at the data
 * point, themed to read on both dark and light surfaces.
 *
 * Purpose vs KpiGauge popover (Wave 26.5):
 *  - KpiGauge popover = "what is this metric and how do I improve it"
 *    (Radix Popover, rich content, 500ms intentional hover delay)
 *  - ChartTooltip = "exact value at this data point" (fast hover, lightweight,
 *    cursor-follow, no improvement tips)
 *
 * Implementation:
 *  - Pure React + Tailwind semantic tokens (no Radix, no portal — we want
 *    the tooltip clipped to the chart's overflow box when chart is in a
 *    scrolling parent, and we want pointer-events:none so cursor passes
 *    through to the chart for continuous data tracking).
 *  - Position prop = { x, y } in chart-container-local coordinates.
 *  - Auto-flips vertically when too close to the top edge.
 *  - Respects `prefers-reduced-motion` (skips fade-in animation).
 *  - Small dark popover with arrow (light variant via theme tokens).
 *  - ARIA: role="tooltip", aria-hidden=false when visible.
 *
 * Usage pattern in a chart primitive:
 *   const [hover, setHover] = useState<ChartTooltipState | null>(null);
 *   return (
 *     <div className="relative">
 *       <svg onMouseMove={...} onMouseLeave={() => setHover(null)}>...</svg>
 *       <ChartTooltip state={hover} />
 *     </div>
 *   );
 */

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ChartTooltipState = {
  /** X position in chart-container-local pixels. */
  x: number;
  /** Y position in chart-container-local pixels. */
  y: number;
  /** Primary label (e.g. "March", "Direct Store"). */
  label: string;
  /** Primary value display (e.g. "$12,180", "73%"). */
  value: string;
  /** Optional secondary detail line. */
  detail?: string;
  /** Optional color swatch token. Accepts CSS color string (e.g. "hsl(var(--gauge-sapphire))"). */
  accent?: string;
};

export type ChartTooltipProps = {
  /** Active tooltip state, or null to hide. */
  state: ChartTooltipState | null;
  /**
   * Horizontal nudge so the tooltip sits *above* and slightly offset from the
   * cursor / data point. Defaults to 0 (centred).
   */
  offsetX?: number;
  /**
   * Vertical offset between the data point and the tooltip's bottom arrow.
   * Defaults to 10px above the point.
   */
  offsetY?: number;
  /** Force a side; `auto` flips based on container bounds. */
  side?: "top" | "bottom" | "auto";
  className?: string;
};

const ARROW_SIZE = 6;

export function ChartTooltip({
  state,
  offsetX = 0,
  offsetY = 10,
  side = "auto",
  className,
}: ChartTooltipProps) {
  const reduceMotion = useReducedMotion();

  if (!state) {
    // Render an empty placeholder so the consumer's layout doesn't shift.
    // pointer-events:none ensures it never blocks hit-testing.
    return null;
  }

  // Auto-flip: if the data point is in the top 40px of the container, render
  // below instead of above. The consumer container's relative position is
  // 0,0 at top-left.
  const renderSide = side === "auto" ? (state.y < 40 ? "bottom" : "top") : side;
  const isTop = renderSide === "top";

  // Wrapper is positioned by left/top, then translated so the arrow sits on
  // the data point. translateX(-50%) centres horizontally; translateY moves
  // either fully above (-100% - offsetY) or fully below (offsetY).
  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: state.x + offsetX,
    top: state.y,
    transform: isTop
      ? `translate(-50%, calc(-100% - ${offsetY}px))`
      : `translate(-50%, ${offsetY}px)`,
    pointerEvents: "none",
    zIndex: 30,
  };

  const initial = reduceMotion
    ? { opacity: 1, y: 0 }
    : { opacity: 0, y: isTop ? 2 : -2 };
  const animate = { opacity: 1, y: 0 };

  return (
    <motion.div
      role="tooltip"
      aria-hidden={false}
      style={wrapperStyle}
      initial={initial}
      animate={animate}
      transition={{ duration: reduceMotion ? 0 : 0.12, ease: "easeOut" }}
      className={cn(
        "select-none",
        // Tooltip card — dark in light theme, light in dark theme via popover token.
        // Using --popover / --popover-foreground keeps theme parity with Radix tooltips.
        "rounded-md border border-[color:var(--border)] bg-popover text-popover-foreground",
        "shadow-md px-2.5 py-1.5 min-w-[80px] max-w-[220px]",
        className
      )}
      data-testid="chart-tooltip"
      data-side={renderSide}
    >
      <div className="flex items-center gap-1.5">
        {state.accent && (
          <span
            className="inline-block rounded-full shrink-0"
            style={{
              width: 6,
              height: 6,
              background: state.accent,
            }}
            aria-hidden="true"
          />
        )}
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium truncate">
          {state.label}
        </span>
      </div>
      <div className="text-sm font-semibold tabular-nums leading-tight mt-0.5">
        {state.value}
      </div>
      {state.detail && (
        <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
          {state.detail}
        </div>
      )}
      {/* Arrow — pure CSS triangle pointing toward the data point. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-1/2 -translate-x-1/2 w-0 h-0",
          isTop
            ? "top-full border-l-transparent border-r-transparent border-t-[color:var(--border)]"
            : "bottom-full border-l-transparent border-r-transparent border-b-[color:var(--border)]"
        )}
        style={{
          borderLeftWidth: ARROW_SIZE,
          borderRightWidth: ARROW_SIZE,
          ...(isTop
            ? { borderTopWidth: ARROW_SIZE }
            : { borderBottomWidth: ARROW_SIZE }),
        }}
      />
      {/* Inner arrow (popover fill) — sits 1px inside the border arrow. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-1/2 -translate-x-1/2 w-0 h-0",
          isTop
            ? "top-full border-l-transparent border-r-transparent border-t-[color:hsl(var(--popover))]"
            : "bottom-full border-l-transparent border-r-transparent border-b-[color:hsl(var(--popover))]"
        )}
        style={{
          borderLeftWidth: ARROW_SIZE - 1,
          borderRightWidth: ARROW_SIZE - 1,
          ...(isTop
            ? { borderTopWidth: ARROW_SIZE - 1, marginTop: -1 }
            : { borderBottomWidth: ARROW_SIZE - 1, marginBottom: -1 }),
        }}
      />
    </motion.div>
  );
}

export default ChartTooltip;
