/**
 * RequestFunnel — Wave 28.
 *
 * Animated horizontal bar funnel showing review-request conversion at
 * three honest stages: Sent → Clicked → Posted. The "Opened" stage is
 * intentionally absent because there's no email-open pixel wired yet
 * (per spec anti-pattern: "don't fake review-request conversion data").
 *
 * Time-range selector: 7 / 30 / 90 days. The parent owns the windowDays
 * state because it's part of the dashboard query key.
 *
 * DESIGN-SYSTEM: semantic tokens, 2px gaps, no hover-shift. Bars animate
 * in on mount via Framer Motion (respects reduced-motion).
 */

import { motion, useReducedMotion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  pctOfPrevious: number;
}

export interface RequestFunnelProps {
  stages: FunnelStage[];
  windowDays: 7 | 30 | 90;
  onWindowChange?: (next: 7 | 30 | 90) => void;
  /** Whether the backend reports an open-tracking pixel exists. */
  hasOpenTracking?: boolean;
  className?: string;
}

const STAGE_COLORS = [
  "bg-[hsl(var(--chart-1))]",
  "bg-[hsl(var(--chart-4))]",
  "bg-[hsl(var(--chart-2))]",
];

export function RequestFunnel({
  stages,
  windowDays,
  onWindowChange,
  hasOpenTracking,
  className,
}: RequestFunnelProps) {
  const reduceMotion = useReducedMotion();
  const max = Math.max(1, ...stages.map((s) => s.count));

  return (
    <Card
      className={cn("flex flex-col gap-3 p-4", className)}
      data-testid="reputationshield-funnel"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Review-request funnel
          </h3>
          <p
            className="text-[11px] text-muted-foreground"
            title="Last N days of outbound review requests + conversion at each step."
          >
            Sent → Clicked → Posted
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-muted p-0.5 text-[11px]">
          {([7, 30, 90] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onWindowChange?.(w)}
              className={cn(
                "rounded-full px-2 py-0.5 font-medium",
                windowDays === w
                  ? "bg-card text-foreground ring-1 ring-inset ring-[color:var(--border)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              data-testid={`funnel-window-${w}`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {stages.map((s, idx) => {
          const widthPct = max > 0 ? Math.max(4, (s.count / max) * 100) : 4;
          const color = STAGE_COLORS[idx] ?? STAGE_COLORS[0];
          return (
            <div key={s.key} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-foreground">{s.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {s.count.toLocaleString()}
                  {idx > 0 ? (
                    <span className="ml-2 text-[10px]">
                      {s.pctOfPrevious}% of {stages[idx - 1]?.label.toLowerCase()}
                    </span>
                  ) : null}
                </span>
              </div>
              <div
                className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60"
                role="meter"
                aria-valuenow={s.count}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={`${s.label}: ${s.count}`}
              >
                <motion.div
                  initial={reduceMotion ? false : { width: 0 }}
                  animate={{ width: `${widthPct}%` }}
                  transition={{
                    duration: 0.6,
                    delay: idx * 0.08,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={cn("h-full rounded-full", color)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {!hasOpenTracking && (
        <p
          className="text-[10px] text-muted-foreground/80"
          data-testid="funnel-open-tracking-note"
        >
          Open-rate tracking arrives in a future release — funnel currently
          collapses Sent → Clicked.
        </p>
      )}
    </Card>
  );
}

export default RequestFunnel;
