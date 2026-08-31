/**
 * BackupTimeline — Wave 31 30-day strip.
 *
 * Green dot per successful backup, red for failed, gray for pending.
 * Hover any dot to see the timestamp + size + retention. Most recent
 * backup timestamp + a 1-click "Backup now" action on the latest dot
 * (button-disabled state managed by the parent).
 *
 * Competitors show "last backup: 6 hours ago" as text only. This
 * surface translates the same data into a glanceable strip and
 * makes the work visible at a glance.
 *
 * No raw hex — semantic tokens only. No new npm deps.
 */

import {
  Cloud,
  CloudOff,
  Loader2,
  Play,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface BackupEntry {
  date: string;            // YYYY-MM-DD
  status: "success" | "failed" | "pending";
  sizeBytes?: number;
  retentionDays?: number;
}

export interface BackupTimelineProps {
  entries: BackupEntry[];
  /**
   * True once a backup has genuinely been ATTEMPTED for this site (a real
   * row exists in `webcare_backups`) — not merely that one succeeded. A
   * site whose runs all failed shows red dots and a real failure count
   * rather than the softer "nothing yet" state.
   */
  tracked?: boolean;
  onRunBackupNow?: () => void | Promise<void>;
  isMutating?: boolean;
}

const TONE: Record<BackupEntry["status"], string> = {
  success: "var(--chart-2)",
  failed: "var(--chart-5)",
  pending: "var(--muted-foreground)",
};

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BackupTimeline({
  entries,
  tracked = true,
  onRunBackupNow,
  isMutating,
}: BackupTimelineProps) {
  const successCount = entries.filter((e) => e.status === "success").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;
  const latestSuccess = [...entries]
    .reverse()
    .find((e) => e.status === "success");
  /**
   * Only `tracked` decides this — deliberately NOT `|| entries.length === 0`.
   *
   * A site whose backups all fell outside the 30-day window (the worker
   * stopped running) has entries=[] but tracked=true. Folding that into
   * "no backups yet" would show a reassuring first-run message for a site
   * whose backups have actually stopped. It now falls through to the real
   * "no successful backups in the last 30 days" line instead.
   */
  const notTracked = !tracked;

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="webcare-backup-timeline">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">
            Backups — last 30 days
          </h2>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {notTracked
            ? "Not tracked"
            : `${successCount} backups taken${failedCount > 0 ? ` · ${failedCount} failed` : ""}`}
        </p>
      </div>

      <TooltipProvider delayDuration={150}>
        <div
          className="flex flex-wrap items-center gap-1"
          role="list"
          data-testid="webcare-backup-strip"
        >
          {entries.map((e) => (
            <Tooltip key={e.date}>
              <TooltipTrigger asChild>
                <span
                  role="listitem"
                  className={cn(
                    "inline-block h-3 w-3 rounded-full",
                    e.status === "pending" && "opacity-40",
                  )}
                  style={{ backgroundColor: `hsl(${TONE[e.status]})` }}
                  data-testid={`webcare-backup-dot-${e.date}`}
                  aria-label={`Backup ${e.status} on ${formatDate(e.date)}`}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p className="font-medium">{formatDate(e.date)}</p>
                <p className="text-muted-foreground">
                  Status: {e.status}
                  {e.sizeBytes !== undefined &&
                    ` · ${formatSize(e.sizeBytes)}`}
                  {e.retentionDays !== undefined &&
                    ` · ${e.retentionDays}d retention`}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {latestSuccess ? (
            <>
              Most recent backup:&nbsp;
              <span className="font-medium text-foreground">
                {formatDate(latestSuccess.date)}
              </span>
              {latestSuccess.sizeBytes !== undefined &&
                ` · ${formatSize(latestSuccess.sizeBytes)}`}
            </>
          ) : notTracked ? (
            <>
              <CloudOff
                className="mr-1 inline h-3 w-3 align-middle text-muted-foreground"
                aria-hidden="true"
              />
              No backups yet. Your first weekly backup runs on the next Sunday
              sweep &mdash; or take one right now from Quick actions.
            </>
          ) : (
            <>
              <CloudOff
                className="mr-1 inline h-3 w-3 align-middle text-[hsl(var(--chart-4))]"
                aria-hidden="true"
              />
              No successful backups in the last 30 days.
            </>
          )}
        </p>
        {/* Shown whenever a handler is wired: the button now genuinely
            captures a backup, so it is a real affordance even before the
            first run. (It used to start nothing at all, which is why it was
            hidden here.) */}
        {onRunBackupNow && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={isMutating}
            onClick={() => onRunBackupNow()}
            data-testid="webcare-backup-run-now"
          >
            {isMutating ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Backup now
          </Button>
        )}
      </div>
    </Card>
  );
}
