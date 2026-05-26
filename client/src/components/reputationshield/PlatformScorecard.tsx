/**
 * PlatformScorecard — Wave 28.
 *
 * 4-card row showing average rating + 30-day delta per platform (Google,
 * Yelp, Facebook, BBB). Uses Wave 22A AnimatedCounter for the rating
 * numbers. Color-coded delta: emerald (↑), sapphire (→), crimson (↓).
 *
 * Empty-state friendly: missing platforms render a muted card with
 * "Not connected" instead of zero-out numbers (anti-pattern: don't fake
 * data).
 *
 * DESIGN-SYSTEM: semantic tokens only, 2px gaps, no hover-shift,
 * respects prefers-reduced-motion via AnimatedCounter.
 */

import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AnimatedCounter } from "@/components/ui/visual-primitives";
import { cn } from "@/lib/utils";

export type ScorecardPlatform = "google" | "yelp" | "facebook" | "bbb";

export interface PlatformStats {
  rating: number;
  count: number;
  recentCount: number;
  delta30d: number;
}

export interface PlatformScorecardProps {
  data: Record<ScorecardPlatform, PlatformStats>;
  className?: string;
}

const PLATFORM_LABEL: Record<ScorecardPlatform, string> = {
  google: "Google",
  yelp: "Yelp",
  facebook: "Facebook",
  bbb: "BBB",
};

/** Hard-coded platform colors are NOT semantic tokens, but per
 *  DESIGN-SYSTEM we whitelist brand glyph colors for vendor logos. They
 *  only appear in the small platform indicator dot, never in the card
 *  surface itself. */
const PLATFORM_INDICATOR_CLASS: Record<ScorecardPlatform, string> = {
  google: "bg-[hsl(var(--chart-1))]",
  yelp: "bg-[hsl(var(--destructive))]",
  facebook: "bg-[hsl(var(--chart-2))]",
  bbb: "bg-[hsl(var(--chart-3))]",
};

function deltaTone(delta: number): {
  className: string;
  Icon: typeof ArrowUp;
} {
  if (delta > 0.05) {
    return {
      className: "text-[hsl(var(--chart-2))]",
      Icon: ArrowUp,
    };
  }
  if (delta < -0.05) {
    return {
      className: "text-[hsl(var(--destructive))]",
      Icon: ArrowDown,
    };
  }
  return {
    className: "text-muted-foreground",
    Icon: ArrowRight,
  };
}

function formatDelta(delta: number): string {
  if (Math.abs(delta) < 0.05) return "→";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}`;
}

export function PlatformScorecard({
  data,
  className,
}: PlatformScorecardProps) {
  const platforms: ScorecardPlatform[] = ["google", "yelp", "facebook", "bbb"];

  return (
    <div
      className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", className)}
      data-testid="reputationshield-scorecard"
    >
      {platforms.map((p) => {
        const s = data[p];
        const empty = !s || s.count === 0;
        const tone = deltaTone(s?.delta30d ?? 0);
        const DeltaIcon = tone.Icon;
        return (
          <Card
            key={p}
            className="flex flex-col gap-1 p-3"
            data-testid={`scorecard-${p}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                <span
                  className={cn(
                    "inline-block h-2.5 w-2.5 rounded-full",
                    PLATFORM_INDICATOR_CLASS[p],
                  )}
                  aria-hidden="true"
                />
                {PLATFORM_LABEL[p]}
              </span>
              {!empty && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums",
                    tone.className,
                  )}
                  data-testid={`scorecard-${p}-delta`}
                >
                  <DeltaIcon className="h-3 w-3" aria-hidden="true" />
                  {formatDelta(s.delta30d)}
                </span>
              )}
            </div>
            {empty ? (
              <div className="mt-1 text-sm text-muted-foreground">
                Not connected
              </div>
            ) : (
              <>
                <div className="text-2xl font-semibold text-foreground">
                  <AnimatedCounter
                    value={s.rating}
                    duration={900}
                    decimals={1}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground/80">
                  {s.count} review{s.count === 1 ? "" : "s"}
                  {s.recentCount > 0 ? ` · ${s.recentCount} in 30d` : ""}
                </div>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default PlatformScorecard;
