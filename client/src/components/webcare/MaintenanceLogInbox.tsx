/**
 * MaintenanceLogInbox — Wave 31's structural moat.
 *
 * Reverse-chronological feed of every action WebCare has taken on the
 * customer's site. Each row carries: timestamp + plain-English summary
 * + status icon + technical-detail expander. Right-rail filter
 * narrows by event-type (updates / security / performance / backups).
 *
 * "All caught up" empty state when no entries land for the active
 * filter. "Fresh service" empty state on first paint.
 *
 * Industry insight from the research: translate technical jargon into
 * outcomes ("updated 7 plugins" → "prevented 3 known vulnerabilities").
 * The plain-language summary lives in the database; this surface just
 * renders it.
 *
 * No raw hex — semantic tokens only. No new npm deps.
 */

import { useMemo, useState } from "react";
import {
  BugOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Cloud,
  Filter,
  Gauge,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WebcareEventType =
  | "updates"
  | "security"
  | "performance"
  | "backups"
  | "uptime"
  | "other";

export type WebcareSeverity = "success" | "warning" | "failed" | "info";

export interface MaintenanceLogEntry {
  id: number;
  recordedAt: string;
  eventType: WebcareEventType;
  severity: WebcareSeverity;
  plainLanguageSummary: string;
  technicalSummary: string;
  expandedDetail: Record<string, unknown> | null;
}

export interface MaintenanceLogInboxProps {
  entries: MaintenanceLogEntry[];
  /** "none" = no service yet, "fresh" = service active but no entries,
   *  "filtered" = entries exist but filter excludes all of them. */
  emptyState: "none" | "fresh" | "filtered";
  hasMore: boolean;
  isLoading?: boolean;
  filter: WebcareEventType | "all";
  onFilterChange: (f: WebcareEventType | "all") => void;
  onLoadMore?: () => void;
}

const EVENT_LABEL: Record<WebcareEventType, string> = {
  updates: "Updates",
  security: "Security",
  performance: "Performance",
  backups: "Backups",
  uptime: "Uptime",
  other: "Other",
};

const SEVERITY_TONE: Record<WebcareSeverity, string> = {
  success: "var(--chart-2)",
  warning: "var(--chart-4)",
  failed: "var(--chart-5)",
  info: "var(--chart-1)",
};

function EventIcon({
  eventType,
  severity,
}: {
  eventType: WebcareEventType;
  severity: WebcareSeverity;
}) {
  const color = `hsl(${SEVERITY_TONE[severity]})`;
  const cls = "h-4 w-4 shrink-0";
  if (severity === "failed") {
    return <XCircle className={cls} style={{ color }} aria-hidden="true" />;
  }
  if (severity === "warning") {
    return <TriangleAlert className={cls} style={{ color }} aria-hidden="true" />;
  }
  switch (eventType) {
    case "updates":
      return <RefreshCw className={cls} style={{ color }} aria-hidden="true" />;
    case "security":
      return <ShieldCheck className={cls} style={{ color }} aria-hidden="true" />;
    case "performance":
      return <Gauge className={cls} style={{ color }} aria-hidden="true" />;
    case "backups":
      return <Cloud className={cls} style={{ color }} aria-hidden="true" />;
    case "uptime":
      return <CheckCircle2 className={cls} style={{ color }} aria-hidden="true" />;
    case "other":
    default:
      return <CircleDashed className={cls} style={{ color }} aria-hidden="true" />;
  }
}

function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const FILTERS: Array<{ id: WebcareEventType | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "updates", label: "Updates" },
  { id: "security", label: "Security" },
  { id: "performance", label: "Performance" },
  { id: "backups", label: "Backups" },
];

export function MaintenanceLogInbox({
  entries,
  emptyState,
  hasMore,
  isLoading,
  filter,
  onFilterChange,
  onLoadMore,
}: MaintenanceLogInboxProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const showEmpty = entries.length === 0;
  const emptyCopy = useMemo(() => {
    if (emptyState === "none") {
      return {
        title: "WebCare isn't set up yet",
        body: "Take the 3-question setup wizard — under 5 minutes — and your maintenance feed will start here.",
      };
    }
    if (emptyState === "filtered") {
      return {
        title: "No matching events in that filter",
        body: "Try a different filter, or switch to All to see every action we've taken on your site.",
      };
    }
    return {
      title: "New here — actions will appear as we maintain your site",
      body: "Each plugin update, security scan, and backup will be logged here in plain English.",
    };
  }, [emptyState]);

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="webcare-maintenance-log">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">
            Maintenance log inbox
          </h2>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Every action taken on your site, translated to plain English.
        </p>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onFilterChange(f.id)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                data-testid={`webcare-log-filter-${f.id}`}
                aria-pressed={active}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      {showEmpty ? (
        <div
          className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border px-4 py-8 text-center"
          data-testid="webcare-log-empty"
        >
          <CheckCircle2
            className="h-5 w-5 text-[hsl(var(--chart-2))]"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-foreground">{emptyCopy.title}</p>
          <p className="max-w-md text-xs text-muted-foreground">{emptyCopy.body}</p>
        </div>
      ) : (
        <ul className="flex flex-col" data-testid="webcare-log-entries">
          {entries.map((e) => {
            const isOpen = expanded.has(e.id);
            const detailEntries = e.expandedDetail
              ? Object.entries(e.expandedDetail).filter(
                  ([, v]) => v !== null && v !== undefined,
                )
              : [];
            return (
              <li
                key={e.id}
                className="border-t border-border first:border-t-0"
                data-testid={`webcare-log-entry-${e.id}`}
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(e.id)}
                  className="flex w-full items-start gap-3 px-1 py-2 text-left hover:bg-muted/40"
                  aria-expanded={isOpen}
                >
                  <EventIcon eventType={e.eventType} severity={e.severity} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-sm text-foreground">
                      {e.plainLanguageSummary}
                    </p>
                    <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{formatTimeAgo(e.recordedAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{EVENT_LABEL[e.eventType]}</span>
                    </p>
                  </div>
                  {isOpen ? (
                    <ChevronUp
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronDown
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </button>
                {isOpen && (
                  <div
                    className="ml-7 mb-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                    data-testid={`webcare-log-detail-${e.id}`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Technical detail
                    </p>
                    <p className="mt-1 break-words font-mono text-[11px] text-foreground">
                      {e.technicalSummary}
                    </p>
                    {detailEntries.length > 0 && (
                      <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {detailEntries.map(([k, v]) => (
                          <div key={k} className="flex items-baseline gap-2">
                            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              {k}
                            </dt>
                            <dd className="break-words text-[11px] text-foreground">
                              {typeof v === "string" ? v : JSON.stringify(v)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer */}
      {hasMore && (
        <Button
          variant="outline"
          size="sm"
          onClick={onLoadMore}
          disabled={isLoading}
          data-testid="webcare-log-load-more"
        >
          {isLoading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <BugOff className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          )}
          Load older actions
        </Button>
      )}
    </Card>
  );
}
