/**
 * ProgressRing — Apple-Watch-style full-ring progress meter (Wave 26.7).
 *
 * Sibling primitive to KpiGauge. Fills 360° around the value, so it visually
 * complements the semi-circular KpiGauge in a row. Best for "X of Y" or
 * "% of quota" metrics. Alex 2026-05-26 approved adding this as part of
 * the dashboard polish-mix (Stripe/Linear/Notion/Vercel reference patterns).
 *
 * Implementation:
 *  - Two concentric SVG circles. Background = 12%-opacity track. Foreground
 *    = colored arc driven by `stroke-dasharray` + `stroke-dashoffset`.
 *  - Boot animation matches KpiGauge: 0 → 100% → settles at value (~1.5s).
 *  - Same Wave 26.5 palette tokens (sapphire / emerald / amber / crimson /
 *    violet / teal). color="auto" picks by value/max ratio.
 *  - Hover/long-press popover with helpText + improvementTips reuses the
 *    same Radix Popover pattern from KpiGauge (500ms delay, long-press
 *    on touch). Anti-pattern: don't omit on Sparkline (too small).
 *  - Empty-state messaging: dimmed at 60% opacity + "Awaiting data —
 *    updates as activity begins" below the label.
 *  - Caps visual display at max (no overflow past 100% even if value > max).
 *  - Respects `prefers-reduced-motion`. No new npm deps. <5KB minified.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock3, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "./AnimatedCounter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type ProgressRingPalette =
  | "sapphire"
  | "emerald"
  | "amber"
  | "crimson"
  | "violet"
  | "teal";

export type ProgressRingColor = "auto" | ProgressRingPalette;
export type ProgressRingSize = "sm" | "md" | "lg";

export type ProgressRingProps = {
  value: number;
  max?: number;
  /** Suffix on the centre number ("%", "calls", "$"…). */
  unit?: string;
  label?: string;
  size?: ProgressRingSize;
  /** Ring stroke width. Defaults proportional to size. */
  thickness?: number;
  color?: ProgressRingColor;
  /** Light track behind the foreground arc. Default true. */
  showRemainingTrack?: boolean;
  /** Hover popover body — 1-2 sentence metric explanation. */
  helpText?: string;
  /** 2-4 bullets on how to improve this metric. */
  improvementTips?: string[];
  emptyState?: boolean;
  emptyStateMessage?: string;
  animate?: boolean;
  className?: string;
};

const SIZE_PX: Record<ProgressRingSize, number> = {
  sm: 80,
  md: 140,
  lg: 200,
};

const DEFAULT_THICKNESS: Record<ProgressRingSize, number> = {
  sm: 8,
  md: 12,
  lg: 16,
};

const PALETTE_VAR: Record<ProgressRingPalette, string> = {
  sapphire: "var(--gauge-sapphire)",
  emerald: "var(--gauge-emerald)",
  amber: "var(--gauge-amber)",
  crimson: "var(--gauge-crimson)",
  violet: "var(--gauge-violet)",
  teal: "var(--gauge-teal)",
};

/** auto picks: green > 75%, amber 30-75%, red < 30%. */
function autoColor(pct: number): ProgressRingPalette {
  if (pct >= 75) return "emerald";
  if (pct >= 30) return "amber";
  return "crimson";
}

const BOOT_PHASE_1 = 600; // 0 -> 100
const BOOT_PHASE_2 = 200; // hold

export function ProgressRing({
  value,
  max = 100,
  unit = "",
  label,
  size = "md",
  thickness,
  color = "auto",
  showRemainingTrack = true,
  helpText,
  improvementTips,
  emptyState = false,
  emptyStateMessage = "Awaiting data — updates as activity begins",
  animate = true,
  className,
}: ProgressRingProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion;

  const px = SIZE_PX[size];
  const stroke = thickness ?? DEFAULT_THICKNESS[size];
  // viewBox is square (px × px). Circle radius leaves room for stroke + small
  // 2px padding so the ring doesn't clip its own outline.
  const center = px / 2;
  const radius = center - stroke / 2 - 2;
  const circumference = 2 * Math.PI * radius;

  const clamped = Math.min(max, Math.max(0, value));
  const pct = max > 0 ? (clamped / max) * 100 : 0;

  const palette = color === "auto" ? autoColor(pct) : color;
  const colorVar = PALETTE_VAR[palette];

  // Boot animation: 0 → 100 → settle at pct. Single state drives ring + counter.
  const [bootPct, setBootPct] = useState<number>(
    shouldAnimate && !emptyState ? 0 : pct
  );
  const bootStartedRef = useRef(false);

  useEffect(() => {
    if (!shouldAnimate || emptyState) {
      setBootPct(pct);
      return;
    }
    if (bootStartedRef.current) {
      setBootPct(pct);
      return;
    }
    bootStartedRef.current = true;
    setBootPct(0);
    const t1 = setTimeout(() => setBootPct(100), 20);
    const t2 = setTimeout(
      () => setBootPct(pct),
      BOOT_PHASE_1 + BOOT_PHASE_2
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAnimate, emptyState]);

  useEffect(() => {
    if (bootStartedRef.current && !emptyState) {
      setBootPct(pct);
    }
  }, [pct, emptyState]);

  const displayedPct = emptyState ? 0 : bootPct;
  const dashOffset = circumference - (displayedPct / 100) * circumference;
  const displayedValue = emptyState ? 0 : (displayedPct / 100) * max;

  // Hover popover (same pattern as KpiGauge — 500ms delay).
  const hasHelp = Boolean(helpText) || (improvementTips && improvementTips.length > 0);
  const [open, setOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const handleEnter = () => {
    if (!hasHelp) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    hoverTimerRef.current = setTimeout(() => setOpen(true), 500);
  };
  const handleLeave = () => {
    if (!hasHelp) return;
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    closeTimerRef.current = setTimeout(() => setOpen(false), 100);
  };
  useEffect(() => () => clearTimers(), []);

  const handleTouchStart = () => {
    if (!hasHelp) return;
    pressTimerRef.current = setTimeout(() => setOpen(true), 500);
  };
  const handleTouchEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const ariaText = emptyState
    ? `${label ?? "Progress"}: no data yet`
    : `${label ?? "Progress"}: ${Math.round(pct)}% of ${max}${unit ? ` ${unit}` : ""}`;

  // 90deg rotation so the ring starts at 12 o'clock and sweeps clockwise.
  const ringTransform = useMemo(
    () => `rotate(-90 ${center} ${center})`,
    [center]
  );

  const body = (
    <div
      className={cn(
        "inline-flex flex-col items-center select-none",
        emptyState && "opacity-60",
        className
      )}
      style={{ width: px }}
      data-testid="progress-ring"
      data-empty-state={emptyState ? "true" : undefined}
    >
      <div className="relative" style={{ width: px, height: px }}>
        <svg
          viewBox={`0 0 ${px} ${px}`}
          width={px}
          height={px}
          role="img"
          aria-label={ariaText}
        >
          {showRemainingTrack && (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeOpacity={0.12}
              strokeWidth={stroke}
              transform={ringTransform}
            />
          )}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`hsl(${colorVar})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{
              duration: shouldAnimate ? 0.6 : 0,
              ease: [0.16, 1, 0.3, 1],
            }}
            transform={ringTransform}
          />
        </svg>
        {/* Centre value + unit */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div
            className={cn(
              "font-semibold tabular-nums leading-none",
              size === "sm" && "text-sm",
              size === "md" && "text-2xl",
              size === "lg" && "text-4xl"
            )}
            style={{ color: `hsl(${colorVar})` }}
          >
            <AnimatedCounter
              value={displayedValue}
              duration={shouldAnimate ? 400 : 0}
              decimals={0}
            />
            {unit && (
              <span
                className={cn(
                  "ml-0.5 font-normal text-muted-foreground",
                  size === "sm" && "text-[10px]",
                  size === "md" && "text-xs",
                  size === "lg" && "text-sm"
                )}
              >
                {unit}
              </span>
            )}
          </div>
        </div>
      </div>
      {(label || emptyState) && (
        <div className="flex flex-col items-center gap-0.5 mt-1">
          {label && (
            <div
              className={cn(
                "text-muted-foreground text-center px-1",
                size === "sm" && "text-[10px]",
                size === "md" && "text-xs",
                size === "lg" && "text-sm"
              )}
            >
              {label}
            </div>
          )}
          {emptyState && (
            <div
              className={cn(
                "flex items-center gap-1 text-muted-foreground/80 text-center px-1",
                size === "sm" ? "text-[9px]" : "text-[10px]"
              )}
              data-testid="progress-ring-empty-state"
            >
              <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{emptyStateMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!hasHelp) return body;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex flex-col items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          aria-label={`${label ?? "Progress"} — show metric details`}
          data-testid="progress-ring-trigger"
          style={{ minHeight: 44 }}
        >
          {body}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        collisionPadding={12}
        className="w-72 p-3 space-y-2"
        onMouseEnter={() => {
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
        }}
        onMouseLeave={handleLeave}
        data-testid="progress-ring-popover"
      >
        <div className="flex items-start gap-2">
          <Info
            className="h-4 w-4 mt-0.5 shrink-0"
            style={{ color: `hsl(${colorVar})` }}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{label ?? "Progress"}</div>
            {helpText && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {helpText}
              </p>
            )}
          </div>
        </div>
        {improvementTips && improvementTips.length > 0 && (
          <div className="border-t pt-2">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
              How to improve
            </div>
            <ul className="space-y-1 text-xs text-foreground/90">
              {improvementTips.slice(0, 4).map((tip, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span
                    className="mt-0.5 inline-block rounded-full shrink-0"
                    style={{
                      background: `hsl(${colorVar})`,
                      width: 6,
                      height: 6,
                    }}
                    aria-hidden="true"
                  />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default ProgressRing;
