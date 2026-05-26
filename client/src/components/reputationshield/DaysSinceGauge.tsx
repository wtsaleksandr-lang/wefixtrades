/**
 * DaysSinceGauge — Wave 28.
 *
 * Semi-circular "days since last review" urgency gauge — genuine
 * whitespace per competitive research. Color thresholds:
 *   0-7   emerald (fresh)
 *   8-14  amber (warming up)
 *   15-29 amber/crimson (warning)
 *   30+   crimson (red zone; gauge pulses)
 *
 * Below the gauge: 1-click button "Request reviews from last 10 jobs" that
 * the parent wires to the run-action endpoint. Disabled while pending.
 *
 * DESIGN-SYSTEM: semantic tokens (chart-2/4 + destructive) only, no raw
 * hex, no hover-shift, respects prefers-reduced-motion (pulse opts out).
 */

import { motion, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface DaysSinceGaugeProps {
  days: number | null;
  /** Triggered by the 1-click action button. */
  onRequestBatch: () => void | Promise<void>;
  requesting?: boolean;
  emptyState?: boolean;
  className?: string;
}

interface ZoneSpec {
  arcColor: string;
  textColor: string;
  badgeColor: string;
  label: string;
  pulse: boolean;
}

function zoneFor(days: number | null): ZoneSpec {
  if (days == null) {
    return {
      arcColor: "stroke-muted-foreground/30",
      textColor: "text-muted-foreground",
      badgeColor: "bg-muted text-muted-foreground",
      label: "No reviews yet",
      pulse: false,
    };
  }
  if (days <= 7) {
    return {
      arcColor: "stroke-[hsl(var(--chart-2))]",
      textColor: "text-[hsl(var(--chart-2))]",
      badgeColor: "bg-[hsl(var(--chart-2)/0.12)] text-[hsl(var(--chart-2))]",
      label: "Fresh",
      pulse: false,
    };
  }
  if (days <= 14) {
    return {
      arcColor: "stroke-[hsl(var(--chart-4))]",
      textColor: "text-[hsl(var(--chart-4))]",
      badgeColor: "bg-[hsl(var(--chart-4)/0.12)] text-[hsl(var(--chart-4))]",
      label: "Warming up",
      pulse: false,
    };
  }
  if (days <= 29) {
    return {
      arcColor: "stroke-[hsl(var(--chart-4))]",
      textColor: "text-[hsl(var(--chart-4))]",
      badgeColor: "bg-[hsl(var(--chart-4)/0.2)] text-[hsl(var(--chart-4))]",
      label: "Getting stale",
      pulse: false,
    };
  }
  return {
    arcColor: "stroke-[hsl(var(--destructive))]",
    textColor: "text-[hsl(var(--destructive))]",
    badgeColor:
      "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]",
    label: "Action needed",
    pulse: true,
  };
}

/** Render the semi-circular gauge as an SVG path. Days are clamped to 0-45
 *  visually so the indicator doesn't shoot off the arc past a month. */
function arcPath(days: number | null): {
  fillFraction: number;
  display: string;
} {
  if (days == null) return { fillFraction: 0, display: "—" };
  const clamped = Math.min(45, Math.max(0, days));
  return {
    fillFraction: clamped / 45,
    display: String(days),
  };
}

export function DaysSinceGauge({
  days,
  onRequestBatch,
  requesting,
  emptyState,
  className,
}: DaysSinceGaugeProps) {
  const reduceMotion = useReducedMotion();
  const zone = zoneFor(days);
  const { fillFraction, display } = arcPath(days);

  // Semi-circle arc: 180 degrees from -180° (left) to 0° (right).
  // SVG path for the background rail + foreground meter.
  const RADIUS = 60;
  const CIRC = Math.PI * RADIUS; // half-circumference
  const dashOffset = CIRC * (1 - fillFraction);

  return (
    <Card
      className={cn("flex flex-col items-center gap-2 p-4", className)}
      data-testid="reputationshield-days-since"
    >
      <div className="flex w-full items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Days since last review
        </h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            zone.badgeColor,
          )}
          data-testid="days-since-zone"
        >
          {zone.label}
        </span>
      </div>

      <div className="relative h-[88px] w-full">
        <svg
          viewBox="0 0 160 90"
          className="absolute inset-0 mx-auto block h-full w-full"
          role="img"
          aria-label={`${display} days since last review`}
        >
          {/* Background rail */}
          <path
            d="M20,80 A60,60 0 0 1 140,80"
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            className="stroke-muted/60"
          />
          {/* Foreground meter */}
          <motion.path
            d="M20,80 A60,60 0 0 1 140,80"
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            initial={reduceMotion ? false : { strokeDashoffset: CIRC }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              zone.arcColor,
              zone.pulse && !reduceMotion && "animate-pulse",
            )}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span
            className={cn(
              "text-3xl font-semibold tabular-nums",
              zone.textColor,
            )}
            data-testid="days-since-value"
          >
            {display}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {days == null ? "across 4 platforms" : "days"}
          </span>
        </div>
      </div>

      <Button
        size="sm"
        className="mt-1 w-full"
        onClick={() => void onRequestBatch()}
        disabled={requesting || emptyState}
        data-testid="days-since-request-batch"
      >
        <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        {requesting ? "Sending…" : "Request reviews from last 10 jobs"}
      </Button>
    </Card>
  );
}

export default DaysSinceGauge;
