/**
 * QuoteQuick free-tier quote-quota meter (portal).
 *
 * Shows "X / 50 quotes this month" with a usage bar + an upgrade CTA when the
 * account is NEAR or OVER its free monthly allowance. Paid accounts see an
 * "Unlimited" badge instead of a bar.
 *
 * Reads GET /api/portal/quotequick/usage → { used, limit, tier, near_limit,
 * quota_exceeded, resets_at }. Server-side enforcement is soft-cap (leads are
 * still captured over the limit); this meter is the OWNER-facing nudge.
 *
 * All colours are theme tokens (chart-2 / chart-4 / destructive) — no bare
 * literals — so it reads correctly in light + dark.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Infinity as InfinityIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuotaUsageResponse {
  used: number;
  limit: number | null;
  tier: "free" | "paid";
  quota_exceeded: boolean;
  near_limit: boolean;
  resets_at: string;
}

function formatResetDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "next month";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function QuotaMeter() {
  const { data, isLoading, isError } = useQuery<QuotaUsageResponse>({
    queryKey: ["/api/portal/quotequick/usage"],
    queryFn: async () => {
      const res = await fetch("/api/portal/quotequick/usage", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load usage");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card
        className="flex h-20 animate-pulse items-center justify-center p-4"
        data-testid="qq-quota-meter-loading"
      >
        <p className="text-xs text-muted-foreground">Loading quote usage…</p>
      </Card>
    );
  }

  // Fail quiet: if the meter can't load, don't break the dashboard.
  if (isError || !data) return null;

  // Paid → unlimited badge, no bar / CTA.
  if (data.tier === "paid" || data.limit === null) {
    return (
      <Card className="flex items-center gap-3 p-4" data-testid="qq-quota-meter-unlimited">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--chart-2)/0.12)]">
          <InfinityIcon className="h-4 w-4 text-[hsl(var(--chart-2))]" aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <p className="text-sm font-semibold text-foreground">Unlimited quotes</p>
          <p className="text-xs text-muted-foreground">
            {data.used} captured this month
          </p>
        </div>
      </Card>
    );
  }

  const limit = data.limit;
  const pct = Math.min(100, Math.round((data.used / limit) * 100));

  const state: "ok" | "near" | "over" = data.quota_exceeded
    ? "over"
    : data.near_limit
      ? "near"
      : "ok";

  const barColor =
    state === "over"
      ? "bg-[hsl(var(--destructive))]"
      : state === "near"
        ? "bg-[hsl(var(--chart-4))]"
        : "bg-[hsl(var(--chart-2))]";

  const showUpgrade = state !== "ok";

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="qq-quota-meter">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-col">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Free plan · quotes this month
          </p>
          <p className="text-lg font-semibold text-foreground" data-testid="qq-quota-count">
            {data.used} <span className="text-muted-foreground">/ {limit}</span>
          </p>
        </div>
        {state === "over" && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--destructive)/0.12)] px-2 py-0.5 text-xs font-medium text-[hsl(var(--destructive))]"
            data-testid="qq-quota-over-badge"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Limit reached
          </span>
        )}
      </div>

      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={data.used}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-label={`${data.used} of ${limit} monthly quotes used`}
      >
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {state === "over"
            ? "New quotes are still captured — upgrade to remove the cap."
            : `Resets ${formatResetDate(data.resets_at)}`}
        </p>
        {showUpgrade && (
          <Button asChild size="sm" variant="outline" data-testid="qq-quota-upgrade-cta">
            <Link href="/portal/billing">Upgrade for unlimited</Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
