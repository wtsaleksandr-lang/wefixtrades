/**
 * CompetitorAlertFeed — competitor outranking-you timeline.
 *
 * Wave 27 MapGuard upgrade. Lightweight feed showing the 10 most recent
 * competitor moves. Each row uses the Wave 22A `StatusPill` for severity
 * and renders "X moved ahead of you on '<keyword>' at pin (r,c)" with a
 * relative-time stamp.
 *
 * Per the competitive research: "Trades operator is in a van. Universal
 * competitor gap — competitors all show the data; nobody surfaces it as
 * a chronological feed they can scan in 30 seconds."
 *
 * No new deps. Empty-state when no competitor outranks detected (matches
 * the "Don't fake competitor data" anti-pattern from spec).
 */

import { AlertTriangle, MapPin, TrendingDown } from "lucide-react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/visual-primitives";
import type { StatusPillStatus } from "@/components/ui/visual-primitives";
import { cn } from "@/lib/utils";

export type CompetitorAlertSeverity = "info" | "warning" | "critical";

export interface CompetitorAlertEvent {
  id: string;
  competitor_name: string;
  keyword: string;
  /** 0-indexed row/col of the affected pin. */
  pin_row: number;
  pin_col: number;
  /** Customer's prior + current rank at this pin. */
  previous_rank: number | null;
  current_rank: number | null;
  severity: CompetitorAlertSeverity;
  occurred_at: string; // ISO timestamp
}

export interface CompetitorAlertFeedProps {
  events: CompetitorAlertEvent[];
  /** Empty state — service is active but no competitor moves yet. */
  emptyState?: boolean;
  className?: string;
  /** Click handler — drill into the specific keyword × pin detail. */
  onSelect?: (event: CompetitorAlertEvent) => void;
}

/** StatusPill ships a fixed set of statuses — map alert severity to the
 *  closest visual token. */
function severityToPill(sev: CompetitorAlertSeverity): StatusPillStatus {
  if (sev === "critical") return "failed";
  if (sev === "warning") return "in_progress";
  return "draft";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export function CompetitorAlertFeed({
  events,
  emptyState,
  className,
  onSelect,
}: CompetitorAlertFeedProps) {
  const visible = events.slice(0, 10);

  return (
    <Card
      className={cn("p-4", className)}
      data-testid="competitor-alert-feed"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Competitor moves
        </h2>
        {events.length > 10 && (
          <Link
            href="/portal/mapguard/competitor-alerts"
            className="text-[11px] font-medium text-foreground underline-offset-2 hover:underline"
            data-testid="competitor-alert-feed-view-all"
          >
            View all ({events.length})
          </Link>
        )}
      </div>

      {visible.length === 0 && (
        <div
          className="flex flex-col items-center justify-center gap-1 py-6 text-center"
          data-testid="competitor-alert-feed-empty"
        >
          <TrendingDown
            className="h-5 w-5 text-muted-foreground/60"
            aria-hidden
          />
          <p className="text-xs font-medium text-foreground">
            {emptyState
              ? "No competitor data yet"
              : "Holding your position"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {emptyState
              ? "First rank-grid scan runs within 24h of activation."
              : "No competitor has outranked you in the last 30 days."}
          </p>
        </div>
      )}

      {visible.length > 0 && (
        <ul className="space-y-2.5">
          {visible.map((evt) => (
            <li
              key={evt.id}
              data-testid={`competitor-alert-${evt.id}`}
            >
              <button
                type="button"
                onClick={() => onSelect?.(evt)}
                disabled={!onSelect}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border border-transparent p-2 text-left transition-colors",
                  onSelect && "hover:border-border hover:bg-muted/40",
                )}
              >
                <span
                  className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-muted"
                  aria-hidden
                >
                  <AlertTriangle
                    className={cn(
                      "h-3.5 w-3.5",
                      evt.severity === "critical"
                        ? "text-[hsl(var(--gauge-crimson))]"
                        : evt.severity === "warning"
                          ? "text-[hsl(var(--gauge-amber))]"
                          : "text-muted-foreground",
                    )}
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground">
                    <span className="font-semibold">
                      {evt.competitor_name}
                    </span>{" "}
                    moved ahead of you on{" "}
                    <span className="font-medium text-foreground">
                      &ldquo;{evt.keyword}&rdquo;
                    </span>
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" aria-hidden />
                      pin ({evt.pin_row + 1},{evt.pin_col + 1})
                    </span>
                    {evt.previous_rank != null && evt.current_rank != null && (
                      <span>
                        rank #{evt.previous_rank} → #{evt.current_rank}
                      </span>
                    )}
                    <span>·</span>
                    <span>{relativeTime(evt.occurred_at)}</span>
                  </div>
                </div>

                <StatusPill
                  status={severityToPill(evt.severity)}
                  label={
                    evt.severity === "critical"
                      ? "Critical"
                      : evt.severity === "warning"
                        ? "Watch"
                        : "Info"
                  }
                  pulse={evt.severity === "critical"}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
