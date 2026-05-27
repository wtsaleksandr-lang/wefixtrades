/**
 * DaysWithoutIncident — Wave 31 gamified counter.
 *
 * Big number = days since the last security/uptime incident. Subtle
 * pulsing green glow when the counter is high; resets to 0 on a fresh
 * incident with a "Resolved" badge for 24h after reset.
 *
 * Novel surface — no competitor in WP-care exposes a streak counter.
 * Drives habit-forming engagement per the Wave 31 brief.
 *
 * Respects prefers-reduced-motion. No raw hex — semantic tokens only.
 */

import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, TimerReset } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AnimatedCounter } from "@/components/ui/visual-primitives";

export interface DaysWithoutIncidentProps {
  days: number;
  bestStreak: number;
  /** Resets show a small "Resolved" pill for 24h after the last incident. */
  recentlyResolved?: boolean;
  emptyState?: boolean;
}

const HIGH_STREAK = 30;

export function DaysWithoutIncident({
  days,
  bestStreak,
  recentlyResolved,
  emptyState,
}: DaysWithoutIncidentProps) {
  const reduce = useReducedMotion();
  const isHighStreak = !emptyState && days >= HIGH_STREAK;

  return (
    <Card
      className="flex h-full flex-col items-start gap-1 overflow-hidden p-4"
      data-testid="webcare-days-without-incident"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Days without incident
        </p>
      </div>

      <div className="relative flex items-baseline gap-2">
        {isHighStreak && !reduce && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-2 rounded-full"
            style={{
              backgroundColor: "hsl(var(--chart-2) / 0.15)",
              filter: "blur(12px)",
            }}
            animate={{ opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <AnimatedCounter
          value={emptyState ? 0 : days}
          className="relative text-3xl font-bold text-foreground md:text-4xl"
        />
        <span className="relative text-xs text-muted-foreground">
          {days === 1 ? "day" : "days"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <p className="text-[11px] text-muted-foreground">
          {emptyState
            ? "We'll start the counter on the first clean day."
            : `Your record: ${bestStreak} day${bestStreak === 1 ? "" : "s"} incident-free`}
        </p>
        {recentlyResolved && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: "hsl(var(--chart-2) / 0.12)",
              color: "hsl(var(--chart-2))",
            }}
            data-testid="webcare-days-resolved-badge"
          >
            <TimerReset className="h-3 w-3" aria-hidden="true" />
            Resolved
          </span>
        )}
      </div>
    </Card>
  );
}
