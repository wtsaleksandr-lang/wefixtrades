/**
 * CampaignCard — AdFlow per-campaign tile (Wave 30).
 *
 * Displays a single ad campaign with:
 *   - LetterGradeBadge (A-F) from the campaign's score
 *   - 1-sentence plain-language summary
 *   - Stats row (Money Spent / Jobs Booked / Cost per Booking) — trade
 *     first nouns, no PMAX / CPA / ROAS
 *   - "Why?" expander surfacing the weighted score factors (this is where
 *     the jargon hides — power users can dig in)
 *   - "Pause" 1-click button with confirmation modal (Universal action #5)
 *
 * No raw hex — semantic tokens only. Reuses LetterGradeBadge from Wave
 * 22A shared visual primitives.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, PauseCircle, PlayCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LetterGradeBadge } from "@/components/ui/visual-primitives";

export type CampaignPlatform = "google" | "meta" | "bing" | "other";
export type CampaignStatus = "active" | "paused" | "draft";

export interface CampaignCardProps {
  id: string;
  name: string;
  platform: CampaignPlatform;
  status: CampaignStatus;
  score: number;
  grade: string;
  summary: string;
  factors: {
    costPerBookingScore: number;
    volumeScore: number;
    ltvTrendScore: number;
  };
  stats: {
    moneySpent: number; // cents
    jobsBooked: number;
    customersReached: number;
    costPerBooking: number; // cents
  };
  onPause?: () => void | Promise<void>;
  onResume?: () => void | Promise<void>;
  isMutating?: boolean;
}

const PLATFORM_LABEL: Record<CampaignPlatform, string> = {
  google: "Google",
  meta: "Meta",
  bing: "Bing",
  other: "Other",
};

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

export function CampaignCard({
  id,
  name,
  platform,
  status,
  score,
  grade,
  summary,
  factors,
  stats,
  onPause,
  onResume,
  isMutating,
}: CampaignCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);

  return (
    <Card
      className="flex flex-col gap-3 p-4"
      data-testid={`campaign-card-${id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {name}
            </h3>
            <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {PLATFORM_LABEL[platform]}
            </span>
            <StatusPill status={status} />
          </div>
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1">
          <LetterGradeBadge score={score} size="md" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Score
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Money Spent" value={dollars(stats.moneySpent)} />
        <Stat label="Jobs Booked" value={String(stats.jobsBooked)} />
        <Stat
          label="Cost / Booking"
          value={stats.costPerBooking > 0 ? dollars(stats.costPerBooking) : "—"}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          data-testid={`campaign-why-${id}`}
        >
          {expanded ? (
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          )}
          Why this score?
        </button>

        {status === "active" ? (
          <AlertDialog open={pauseOpen} onOpenChange={setPauseOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={isMutating}
                data-testid={`campaign-pause-${id}`}
              >
                <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Pause campaign
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Pause {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  You can resume anytime. Already-spent budget is not
                  refunded. Pausing usually takes a few minutes to
                  propagate to the ad platform.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid={`campaign-pause-cancel-${id}`}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await onPause?.();
                    setPauseOpen(false);
                  }}
                  data-testid={`campaign-pause-confirm-${id}`}
                >
                  Pause campaign
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={isMutating || status === "draft"}
            onClick={() => onResume?.()}
            data-testid={`campaign-resume-${id}`}
          >
            <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {status === "paused" ? "Resume" : "Draft"}
          </Button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-1.5 rounded-md bg-muted/30 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Score breakdown (advanced)
          </p>
          <FactorRow label="Cost per booking" pct={factors.costPerBookingScore} weight={50} />
          <FactorRow label="Booking volume" pct={factors.volumeScore} weight={30} />
          <FactorRow label="Customer lifetime trend" pct={factors.ltvTrendScore} weight={20} />
          <p className="pt-1 text-[11px] text-muted-foreground">
            Trade-side note: factors are weighted to surface campaigns that
            book jobs cheaply at scale. Grade {grade}.
          </p>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function FactorRow({ label, pct, weight }: { label: string; pct: number; weight: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-40 text-[11px] text-muted-foreground">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            backgroundColor:
              pct >= 80
                ? "hsl(var(--chart-2))"
                : pct >= 60
                  ? "hsl(var(--chart-4))"
                  : "hsl(var(--chart-5))",
          }}
        />
      </div>
      <span className="w-16 text-right text-[11px] tabular-nums text-foreground">
        {pct}/100
      </span>
      <span className="w-12 text-right text-[10px] text-muted-foreground">
        ×{weight}%
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: CampaignStatus }) {
  const map: Record<CampaignStatus, { label: string; tone: string }> = {
    active: { label: "Active", tone: "var(--chart-2)" },
    paused: { label: "Paused", tone: "var(--chart-4)" },
    draft: { label: "Draft", tone: "var(--muted-foreground)" },
  };
  const v = map[status];
  return (
    <span
      className="rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
      style={{
        backgroundColor: `hsl(${v.tone} / 0.12)`,
        color: `hsl(${v.tone})`,
      }}
    >
      {v.label}
    </span>
  );
}
