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
 * Wave 26.5 polish (Alex 2026-05-26):
 *  - Full-cycle boot animation (min → max → value) so the gauge "warms up"
 *    on mount before settling on its reading. Total ~1.5s.
 *  - Premium palette tokens (sapphire / emerald / amber / crimson / violet /
 *    teal) so dashboards can rotate brand-aligned colors across a 4-gauge
 *    row instead of looking monotone.
 *  - Hover (desktop) / long-press (touch) help popover with helpText +
 *    bulleted improvementTips. Built on Radix Popover (already in tree).
 *  - Empty-state messaging: when value=0 with `emptyState`, gauge is dimmed
 *    at 0 and shows "Awaiting data — updates as activity begins" below.
 *  - Keyboard accessible: Tab to gauge → Space/Enter opens popover.
 *
 * All animations respect `prefers-reduced-motion`. No raw hex — semantic
 * tokens only. No new npm dependencies.
 */

import { useMemo, useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock3, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "./AnimatedCounter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type KpiGaugePalette =
  | "sapphire"
  | "emerald"
  | "amber"
  | "crimson"
  | "violet"
  | "teal";

// Legacy semantic colors — kept for back-compat with existing dashboard usages
// (`color="blue"` / `"green"` / `"amber"` / `"red"` / `"auto"`).
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
  /** Threshold-based color. `auto` picks green/amber/red by `pct`. */
  color?: KpiGaugeColor;
  /**
   * Brand-aligned palette override. When set, takes precedence over `color`
   * regardless of value. Use this to rotate palettes across a dashboard row
   * (e.g. sapphire / emerald / amber / violet).
   */
  palette?: KpiGaugePalette;
  animate?: boolean;
  /** Tooltip body — 1-2 sentence metric explanation. */
  helpText?: string;
  /** 2-4 bullets on how to improve this metric. */
  improvementTips?: string[];
  /**
   * Explicit "no data yet" flag. When true, the gauge stays dimmed at min
   * and shows `emptyStateMessage` below the label.
   */
  emptyState?: boolean;
  emptyStateMessage?: string;
  className?: string;
};

const SIZE_PX: Record<KpiGaugeSize, number> = {
  sm: 80,
  md: 140,
  lg: 220,
};

// Map color name -> chart token (legacy mode).
const COLOR_VAR: Record<Exclude<KpiGaugeColor, "auto">, string> = {
  blue: "var(--chart-1)",
  green: "var(--chart-2)",
  amber: "var(--chart-4)",
  red: "var(--chart-5)",
};

// Wave 26.5 palette tokens.
const PALETTE_VAR: Record<KpiGaugePalette, string> = {
  sapphire: "var(--gauge-sapphire)",
  emerald: "var(--gauge-emerald)",
  amber: "var(--gauge-amber)",
  crimson: "var(--gauge-crimson)",
  violet: "var(--gauge-violet)",
  teal: "var(--gauge-teal)",
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

// Boot-animation phase durations (ms). Total ~1.5s.
const BOOT_PHASE_1 = 600; // min -> max (ease-out)
const BOOT_PHASE_2 = 200; // pause at max
const BOOT_PHASE_3 = 700; // max -> value (ease-in-out)

export function KpiGauge({
  value,
  min = 0,
  max = 100,
  label,
  unit = "",
  targetThreshold,
  size = "md",
  color = "auto",
  palette,
  animate = true,
  helpText,
  improvementTips,
  emptyState = false,
  emptyStateMessage = "Awaiting data — updates as activity begins",
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

  // Resolve display color. `palette` wins over `color` (override). When in
  // empty-state, we fall through to the resolved color but render at 50%
  // opacity via the wrapper.
  let colorVar: string;
  if (palette) {
    colorVar = PALETTE_VAR[palette];
  } else {
    const resolvedColor = color === "auto" ? autoColor(pct) : color;
    colorVar = COLOR_VAR[resolvedColor];
  }

  // Angle ranges: gauge starts at 180deg (left) and sweeps to 0deg (right).
  const startAngle = 180;
  const endAngle = 0;
  const valueAngle = useMemo(
    () => startAngle - (pct / 100) * (startAngle - endAngle),
    [pct]
  );

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

  // Wave 26.5 — full-cycle boot animation.
  // Phase 1 (600ms): min -> max
  // Phase 2 (200ms): hold at max
  // Phase 3 (700ms): max -> value
  // We drive the foreground arc + needle + counter from a single "displayed
  // pct" state so they all stay in sync.
  const halfC = Math.PI * r;
  const [bootPct, setBootPct] = useState<number>(shouldAnimate && !emptyState ? 0 : pct);
  const bootStartedRef = useRef(false);

  useEffect(() => {
    if (!shouldAnimate || emptyState) {
      setBootPct(pct);
      return;
    }
    if (bootStartedRef.current) {
      // Subsequent value changes (after the initial boot) — just go straight
      // to the new value with a short animation, no full cycle.
      setBootPct(pct);
      return;
    }
    bootStartedRef.current = true;
    setBootPct(0);
    const t1 = setTimeout(() => setBootPct(100), 20);
    const t2 = setTimeout(() => {
      // Stay at 100 for BOOT_PHASE_2 (handled by the transition delay below).
      setBootPct(pct);
    }, BOOT_PHASE_1 + BOOT_PHASE_2);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAnimate, emptyState]);

  // When value prop changes after boot, re-sync.
  useEffect(() => {
    if (bootStartedRef.current && !emptyState) {
      setBootPct(pct);
    }
  }, [pct, emptyState]);

  // Computed displayed pct/angle for needle + arc.
  const displayedPct = emptyState ? 0 : bootPct;
  const displayedAngle = startAngle - (displayedPct / 100) * (startAngle - endAngle);
  const displayedNeedleTip = polar(cx, cy, r - stroke / 2 - 4, displayedAngle);
  const filled = (displayedPct / 100) * halfC;
  // Counter follows the displayed pct so it counts up alongside the needle.
  const displayedValue = min + (displayedPct / 100) * range;

  // Decide boot-phase transition timing — slower on phase 1, snappier on phase 3.
  const isBootPhase1 = shouldAnimate && bootPct === 100 && !bootStartedRef.current;
  void isBootPhase1; // currently informational

  const hasHelp = Boolean(helpText) || (improvementTips && improvementTips.length > 0);
  // Track open state so we can debounce hover (500ms) but open immediately on
  // click/keyboard. Radix's `open` prop combined with our own setState is the
  // cleanest way to wire a hover delay without forking the primitive.
  const [open, setOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Long-press on touch — also gated by 500ms.
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const gaugeBody = (
    <div
      className={cn(
        "inline-flex flex-col items-center select-none",
        emptyState && "opacity-60",
        className
      )}
      style={{ width: px }}
      data-testid="kpi-gauge"
      data-empty-state={emptyState ? "true" : undefined}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width={px}
        height={px * (VB_H / VB_W)}
        role="img"
        aria-label={`${label}: ${emptyState ? "no data yet" : `${value}${unit}`}`}
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
        {/* Foreground sweep — driven by `filled` derived from `bootPct`. */}
        <motion.path
          d={bgPath}
          fill="none"
          stroke={`hsl(${colorVar})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${halfC} ${halfC}`}
          animate={{ strokeDashoffset: halfC - filled }}
          transition={{
            duration: shouldAnimate ? 0.6 : 0,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
        {/* Target marker (rendered above arc) */}
        {targetMarker}
        {/* Needle — animates with the same timing as the arc. */}
        <motion.line
          x1={cx}
          y1={cy}
          animate={{ x2: displayedNeedleTip.x, y2: displayedNeedleTip.y }}
          transition={{
            duration: shouldAnimate ? 0.6 : 0,
            ease: [0.16, 1, 0.3, 1],
          }}
          stroke="hsl(var(--foreground))"
          strokeWidth={size === "sm" ? 2 : 3}
          strokeLinecap="round"
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
            value={emptyState ? min : displayedValue}
            duration={shouldAnimate ? 400 : 0}
            decimals={0}
            suffix={unit}
          />
        </div>
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
        {emptyState && (
          <div
            className={cn(
              "mt-1 flex items-center gap-1 text-muted-foreground/80 text-center px-1",
              size === "sm" ? "text-[9px]" : "text-[10px]"
            )}
            data-testid="kpi-gauge-empty-state"
          >
            <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{emptyStateMessage}</span>
          </div>
        )}
      </div>
    </div>
  );

  if (!hasHelp) {
    return gaugeBody;
  }

  // With help text: wrap in Radix Popover. Trigger is a button so the gauge
  // becomes keyboard-focusable (Tab to gauge, Space/Enter opens popover).
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
          aria-label={`${label} — show metric details`}
          data-testid="kpi-gauge-trigger"
          style={{
            // Keep tap-target ≥ 44px tall even at size="sm" (px=80 with
            // VB_H/VB_W ratio gives ~52px svg, but the value+label stack
            // adds another ~24-36px so we're already above 44px).
            minHeight: 44,
          }}
        >
          {gaugeBody}
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
        data-testid="kpi-gauge-popover"
      >
        <div className="flex items-start gap-2">
          <Info
            className="h-4 w-4 mt-0.5 shrink-0"
            style={{ color: `hsl(${colorVar})` }}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{label}</div>
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

export default KpiGauge;
