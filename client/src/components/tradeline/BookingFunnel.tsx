/**
 * BookingFunnel — TradeLine UI upgrade Wave 26.
 *
 * 4 horizontal segments visualising the call→booking funnel:
 *   Calls Today → Qualified Leads → Bookings Created → Completed Jobs
 *
 * Each segment renders:
 *   - count (animated via AnimatedCounter)
 *   - conversion % vs the previous stage (or "—" for the first stage)
 *   - colour band: green ≥ target, amber within ±10%, red below
 *
 * Below the strip: aggregate revenue from completed jobs (hidden when
 * the backend reports $0 — no fake numbers, per anti-pattern rules).
 *
 * Animation: segment bars expand left→right on mount over 700ms,
 * staggered 80ms per segment. Respects prefers-reduced-motion.
 *
 * No raw hex, no hover-shift, semantic tokens only. 2px gaps.
 */

import { motion, useReducedMotion } from "framer-motion";
import { AnimatedCounter } from "@/components/ui/visual-primitives";
import { cn } from "@/lib/utils";

export interface FunnelData {
  calls: number;
  qualified: number;
  bookings: number;
  completed: number;
  aggregateRevenue: number;
  windowLabel?: string;
}

export interface BookingFunnelProps {
  data: FunnelData;
  className?: string;
  /** Per-stage target conversion ratios (0..1). Used to colour-code the
   *  conversion percentage. Defaults are industry sensible: 60% qualified,
   *  40% booking, 80% completed (most booked jobs complete). */
  targets?: { qualified?: number; booking?: number; completed?: number };
}

type StageColor = "green" | "amber" | "red" | "muted";

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function colorVsTarget(actual: number, target: number): StageColor {
  if (target <= 0) return "muted";
  if (actual >= target * 100) return "green";
  if (actual >= target * 100 - 10) return "amber";
  return "red";
}

const COLOR_CLASS: Record<StageColor, { bar: string; ring: string; text: string }> = {
  green: {
    bar: "bg-[hsl(var(--chart-2)/0.6)]",
    ring: "ring-[color:hsl(var(--chart-2)/0.45)]",
    text: "text-[hsl(var(--chart-2))]",
  },
  amber: {
    bar: "bg-[hsl(var(--chart-4)/0.55)]",
    ring: "ring-[color:hsl(var(--chart-4)/0.4)]",
    text: "text-[hsl(var(--chart-4))]",
  },
  red: {
    bar: "bg-[hsl(var(--chart-5)/0.55)]",
    ring: "ring-[color:hsl(var(--chart-5)/0.4)]",
    text: "text-[hsl(var(--chart-5))]",
  },
  muted: {
    bar: "bg-[hsl(var(--chart-1)/0.4)]",
    ring: "ring-[color:hsl(var(--chart-1)/0.3)]",
    text: "text-[hsl(var(--chart-1))]",
  },
};

export function BookingFunnel({ data, className, targets }: BookingFunnelProps) {
  const reduceMotion = useReducedMotion();
  const t = {
    qualified: targets?.qualified ?? 0.6,
    booking: targets?.booking ?? 0.4,
    completed: targets?.completed ?? 0.8,
  };

  const maxCount = Math.max(data.calls, data.qualified, data.bookings, data.completed, 1);

  const stages: Array<{
    key: string;
    label: string;
    count: number;
    convPct: number | null;
    color: StageColor;
    helpText: string;
  }> = [
    {
      key: "calls",
      label: "Calls Today",
      count: data.calls,
      convPct: null,
      color: "muted",
      helpText: "Total inbound calls handled",
    },
    {
      key: "qualified",
      label: "Qualified Leads",
      count: data.qualified,
      convPct: pct(data.qualified, data.calls),
      color: colorVsTarget(pct(data.qualified, data.calls), t.qualified),
      helpText: "Answered or transferred (vs total calls)",
    },
    {
      key: "bookings",
      label: "Bookings Created",
      count: data.bookings,
      convPct: pct(data.bookings, data.qualified),
      color: colorVsTarget(pct(data.bookings, data.qualified), t.booking),
      helpText: "Customer booked a slot (vs qualified)",
    },
    {
      key: "completed",
      label: "Completed Jobs",
      count: data.completed,
      convPct: pct(data.completed, data.bookings),
      color: colorVsTarget(pct(data.completed, data.bookings), t.completed),
      helpText: "Booking led to a finished job (vs bookings)",
    },
  ];

  const allZero = data.calls + data.qualified + data.bookings + data.completed === 0;

  return (
    <div
      className={cn("rounded-lg border bg-card p-4", className)}
      data-testid="booking-funnel"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Booking funnel
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            {data.windowLabel ?? "This month"}
          </span>
        </div>
        {data.aggregateRevenue > 0 && (
          <div className="text-right">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Revenue
            </div>
            <div className="text-base font-semibold tabular-nums">
              <AnimatedCounter
                value={data.aggregateRevenue}
                prefix="$"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-[2px] sm:grid-cols-4">
        {stages.map((stage, idx) => {
          const styles = COLOR_CLASS[stage.color];
          const barWidthPct = (stage.count / maxCount) * 100;

          return (
            <div
              key={stage.key}
              className={cn(
                "relative overflow-hidden rounded-md border bg-muted/20 p-3 ring-1",
                styles.ring,
              )}
              data-testid={`booking-funnel-stage-${stage.key}`}
            >
              {/* Animated bar — eases width 0 → actual on mount */}
              <motion.div
                aria-hidden="true"
                initial={reduceMotion ? { width: `${barWidthPct}%` } : { width: 0 }}
                animate={{ width: `${barWidthPct}%` }}
                transition={{
                  duration: 0.7,
                  ease: "easeOut",
                  delay: idx * 0.08,
                }}
                className={cn("absolute inset-y-0 left-0", styles.bar)}
              />

              <div className="relative flex flex-col gap-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {stage.label}
                  </span>
                  {stage.convPct !== null && stage.count > 0 && (
                    <span className={cn("text-[10px] font-semibold tabular-nums", styles.text)}>
                      {stage.convPct.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="text-2xl font-semibold tabular-nums leading-none">
                  <AnimatedCounter value={stage.count} />
                </div>
                <div className="text-[10px] text-muted-foreground/70">
                  {stage.helpText}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {allZero && (
        <p className="mt-3 text-center text-xs text-muted-foreground/80">
          No calls yet this month. As your AI receptionist answers calls, this
          funnel fills in automatically.
        </p>
      )}
    </div>
  );
}

export default BookingFunnel;
