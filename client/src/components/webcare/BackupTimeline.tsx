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
  onRunBackupNow,
  isMutating,
}: BackupTimelineProps) {
  const successCount = entries.filter((e) => e.status === "success").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;
  const latestSuccess = [...entries]
    .reverse()
    .find((e) => e.status === "success");

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
          {successCount} backups taken
          {failedCount > 0 && ` · ${failedCount} failed`}
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
