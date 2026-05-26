/**
 * AnimatedCounter — value count-up animation.
 *
 * Part of Wave 22A shared visual primitives. Consumed by KpiGauge and
 * intended for any KPI tile / dashboard surface where a number should
 * count up to its target rather than appear instantly.
 *
 * Animation:
 *  - Ease-out from previous value (or 0 on mount) to current value
 *  - Duration configurable, defaults to 800ms
 *  - Optional delta indicator (up/down arrow) when value differs from previous
 *  - Respects `prefers-reduced-motion`: snaps to target instantly when set
 *
 * No raw hex — semantic tokens only. No new deps.
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type AnimatedCounterProps = {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  deltaIndicator?: { previous: number; showArrow: boolean };
  className?: string;
};

// Ease-out cubic. Matches the --ease-out token's perceptual feel without
// pulling in a CSS variable inside the JS animation loop.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function format(n: number, decimals: number, prefix: string, suffix: string): string {
  const fixed = n.toFixed(decimals);
  // Inject thousands separators in the integer part only.
  const [intPart, fracPart] = fixed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = fracPart !== undefined ? `${withSep}.${fracPart}` : withSep;
  return `${prefix}${body}${suffix}`;
}

export function AnimatedCounter({
  value,
  duration = 800,
  decimals = 0,
  prefix = "",
  suffix = "",
  deltaIndicator,
  className,
}: AnimatedCounterProps) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState<number>(value);
  // Track the value the previous animation ended at, so when `value`
  // changes mid-mount we tween from the *displayed* number rather than 0.
  const fromRef = useRef<number>(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration, reduceMotion]);

  let deltaNode: JSX.Element | null = null;
  if (deltaIndicator) {
    const diff = value - deltaIndicator.previous;
    if (diff !== 0) {
      const isUp = diff > 0;
      // text-[color:var(--success/destructive)] would create CSS-vars we
      // don't have, so we ride the semantic tokens that DO exist: primary
      // for "up" (positive trend = brand colour) and destructive for "down".
      // Reviewers: if a dedicated success token is added later, swap here.
      const colorClass = isUp
        ? "text-[hsl(var(--chart-2))]"
        : "text-[hsl(var(--destructive))]";
      deltaNode = (
        <span
          className={cn("inline-flex items-center gap-0.5 text-xs font-medium", colorClass)}
          aria-label={isUp ? "trending up" : "trending down"}
        >
          {deltaIndicator.showArrow ? (
            isUp ? (
              <ArrowUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
            )
          ) : null}
          {format(Math.abs(diff), decimals, "", "")}
        </span>
      );
    }
  }

  return (
    <span className={cn("inline-flex items-baseline gap-1 tabular-nums", className)}>
      <span>{format(display, decimals, prefix, suffix)}</span>
      {deltaNode}
    </span>
  );
}

export default AnimatedCounter;
