/**
 * CampaignCard — one AdFlow campaign, as reported by the ads team.
 *
 * HONESTY CONTRACT (guarded by server/services/aiActions/handlers/adflow.test.ts)
 * ──────────────────────────────────────────────────────────────────────────────
 * Every figure here was typed in by a person from what the agency reported.
 * A figure that was not reported renders as "Not reported", never as 0.
 *
 * DELETED, and must not come back:
 *
 *   - the A–F LetterGradeBadge and its 0-100 score. Half the score was the
 *     campaign's cost-per-booking measured against INDUSTRY_AVG_CPB_CENTS =
 *     15_000 — a benchmark nobody sourced — and 20% was a constant.
 *
 *   - the "Why this score?" expander, which rendered that constant to the
 *     customer as "Customer lifetime trend 50/100 ×20%", complete with a
 *     progress bar, as though an LTV trend had been measured.
 *
 *   - the summary line "This campaign costs $X per booking — industry average
 *     is $150."
 *
 * What remains is the campaign's name, the platform and status the ads team
 * stated, and its reported spend / leads / cost-per-lead. The pause and resume
 * buttons file a request for a human; they do not touch a live campaign.
 */

import { useState } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
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

export type CampaignPlatform = "google" | "meta" | "bing" | "unspecified";
export type CampaignStatus = "active" | "paused" | "draft" | "unspecified";

export interface CampaignCardProps {
  id: string;
  name: string;
  platform: CampaignPlatform;
  status: CampaignStatus;
  periodLabel: string | null;
  stats: {
    adSpendCents: number | null;
    leads: number | null;
    impressions: number | null;
    costPerLeadCents: number | null;
  };
  onPause?: () => void | Promise<void>;
  onResume?: () => void | Promise<void>;
  isMutating?: boolean;
}

const PLATFORM_LABEL: Record<CampaignPlatform, string> = {
  google: "Google",
  meta: "Meta",
  bing: "Bing",
  // The ads team didn't state a platform. We do not guess one from the name.
  unspecified: "Platform not stated",
};

const NOT_REPORTED = "Not reported";

function money(cents: number | null): string {
  if (cents === null) return NOT_REPORTED;
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function count(n: number | null): string {
  if (n === null) return NOT_REPORTED;
  return n.toLocaleString();
}

export function CampaignCard({
  id,
  name,
  platform,
  status,
  periodLabel,
  stats,
  onPause,
  onResume,
  isMutating,
}: CampaignCardProps) {
  const [pauseOpen, setPauseOpen] = useState(false);

  return (
    <Card
      className="flex flex-col gap-2.5 p-4 text-left"
      data-testid={`campaign-card-${id}`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h4 className="truncate text-sm font-semibold text-foreground">{name}</h4>
        {/* Two pills always share a line, so neither can wrap alone. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {PLATFORM_LABEL[platform]}
          </span>
          <StatusPill status={status} />
        </div>
        {periodLabel && (
          <p className="text-[11px] text-muted-foreground">
            Reported for {periodLabel}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Ad spend" value={money(stats.adSpendCents)} />
        <Stat label="Leads" value={count(stats.leads)} />
        <Stat label="Cost / lead" value={money(stats.costPerLeadCents)} />
      </div>

      <div className="flex items-center justify-end gap-2">
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
                <PauseCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Request pause
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Request a pause of {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This sends a pause request to your ads team, who apply it in
                  the ad platform by hand — it is not instant, and nothing
                  changes on your campaign until they action it. You can resume
                  anytime. Already-spent budget is not refunded.
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
                  Send pause request
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : status === "paused" ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={isMutating}
            onClick={() => onResume?.()}
            data-testid={`campaign-resume-${id}`}
          >
            <PlayCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Request resume
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          value === NOT_REPORTED
            ? "text-[11px] font-medium text-muted-foreground"
            : "text-sm font-semibold text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: CampaignStatus }) {
  const map: Record<CampaignStatus, { label: string; tone: string }> = {
    active: { label: "Active", tone: "var(--chart-2)" },
    paused: { label: "Paused", tone: "var(--chart-4)" },
    draft: { label: "Draft", tone: "var(--muted-foreground)" },
    // Reported status absent — say so rather than defaulting to "Active".
    unspecified: { label: "Status not stated", tone: "var(--muted-foreground)" },
  };
  const v = map[status];
  // The tone colours the border and the dot only. As TEXT they measured 3.9:1
  // (active) and 2.9:1 (paused) on the card background in light mode, under the
  // 4.5:1 AA floor for a 10px label — so the label itself is text-foreground.
  return (
    <span
      className="inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground"
      style={{
        borderColor: `hsl(${v.tone} / 0.55)`,
        backgroundColor: `hsl(${v.tone} / 0.1)`,
      }}
    >
      {v.label}
    </span>
  );
}
