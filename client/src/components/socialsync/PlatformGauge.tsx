/**
 * Wave 25 — Per-platform engagement gauges for SocialSync.
 *
 * Renders one KpiGauge per connected platform (FB / IG / LinkedIn /
 * WhatsApp). Each gauge maps to the platform's engagement rate
 * (likes+comments+shares / impressions), normalised to a 0..100 percentile
 * against the platform's typical median:
 *   - FB median ~ 3%      → target marker at 3
 *   - IG median ~ 4%      → target marker at 4
 *   - LinkedIn median ~ 2% → target marker at 2
 *   - WhatsApp (no impressions) → shows "Direct reach %" instead and the
 *     gauge represents response rate.
 *
 * Empty-state per platform: when impressions==0 we render a muted gauge
 * with "Awaiting data" instead of NaN/0 — anti-pattern rule says don't show
 * metrics that don't exist yet.
 */

import { KpiGauge } from "@/components/ui/visual-primitives";
import { PLATFORMS, type SocialPlatformId } from "./platforms";
import { cn } from "@/lib/utils";

export interface PlatformEngagement {
  platform: SocialPlatformId;
  /** Engagement-rate percent for FB/IG/LinkedIn, or response-rate % for WhatsApp. */
  ratePct: number | null;
  /** Set true when the platform has no published posts yet. */
  empty?: boolean;
}

export interface PlatformGaugeProps {
  rows: PlatformEngagement[];
  className?: string;
}

export function PlatformGauge({ rows, className }: PlatformGaugeProps) {
  // Build the row in the canonical platform order so gauges don't reorder.
  const ordered = PLATFORMS.map((def) => {
    const row = rows.find((r) => r.platform === def.id);
    return { def, row };
  });

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 md:grid-cols-4",
        className,
      )}
      data-testid="platform-gauge-grid"
    >
      {ordered.map(({ def, row }) => {
        const empty = !row || row.empty || row.ratePct == null;
        const value = empty ? 0 : Math.max(0, Math.min(100, row!.ratePct!));
        return (
          <div
            key={def.id}
            className="flex flex-col items-center gap-1 rounded-lg border bg-card p-3 text-center"
            data-testid={`platform-gauge-${def.id}`}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: def.color }}
                aria-hidden="true"
              />
              {def.label}
            </div>
            <KpiGauge
              value={value}
              min={0}
              max={100}
              label={def.metricLabel}
              unit="%"
              size="sm"
              targetThreshold={def.engagementTargetPct ?? undefined}
              color={empty ? "blue" : "auto"}
              animate={!empty}
            />
            {empty ? (
              <p className="text-[10px] text-muted-foreground/70">
                Awaiting data
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default PlatformGauge;
