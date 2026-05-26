/**
 * SiteInventory — Wave 31 plugins/themes table.
 *
 * Each row: name + version + last-updated timestamp + small green
 * pulse dot if updated recently. Sorted by last-updated desc so the
 * most recently-maintained plugin appears at the top — visually
 * reinforces ongoing maintenance work.
 *
 * Status column:
 *   ✅ up-to-date
 *   ⚠️ update available
 *   🛡️ security patch needed (highest urgency)
 *
 * Hard rule (CLAUDE.md): no hover-shift, 2px gaps. The pulse
 * animation respects prefers-reduced-motion.
 */

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ListChecks,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type InventoryStatus = "up-to-date" | "update-available" | "security-patch";
export type InventoryKind = "plugin" | "theme" | "core";

export interface InventoryEntry {
  kind: InventoryKind;
  name: string;
  version: string;
  latestVersion?: string;
  lastUpdated: string | null;
  status: InventoryStatus;
  recentlyUpdated: boolean;
}

export interface SiteInventoryProps {
  entries: InventoryEntry[];
  lastSnapshotAt: string | null;
  /** Triggered by the "Apply all pending updates" CTA. */
  onApplyAllUpdates?: () => void | Promise<void>;
  isMutating?: boolean;
}

const STATUS_TONE: Record<InventoryStatus, string> = {
  "up-to-date": "var(--chart-2)",
  "update-available": "var(--chart-4)",
  "security-patch": "var(--chart-5)",
};

const STATUS_LABEL: Record<InventoryStatus, string> = {
  "up-to-date": "Up to date",
  "update-available": "Update available",
  "security-patch": "Security patch",
};

const KIND_LABEL: Record<InventoryKind, string> = {
  plugin: "Plugin",
  theme: "Theme",
  core: "Core",
};

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";
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

function PulseDot() {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{ backgroundColor: "hsl(var(--chart-2))" }}
        aria-hidden="true"
      />
    );
  }
  return (
    <motion.span
      className="inline-block h-3 w-3 rounded-full"
      style={{ backgroundColor: "hsl(var(--chart-2))" }}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      aria-hidden="true"
    />
  );
}

export function SiteInventory({
  entries,
  lastSnapshotAt,
  onApplyAllUpdates,
  isMutating,
}: SiteInventoryProps) {
  const [sortBy, setSortBy] = useState<"recent" | "status">("recent");
  const pendingCount = useMemo(
    () => entries.filter((e) => e.status !== "up-to-date").length,
    [entries],
  );

  const sorted = useMemo(() => {
    const copy = [...entries];
    if (sortBy === "status") {
      const rank: Record<InventoryStatus, number> = {
        "security-patch": 0,
        "update-available": 1,
        "up-to-date": 2,
      };
      copy.sort((a, b) => rank[a.status] - rank[b.status]);
    } else {
      copy.sort((a, b) => {
        const ta = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const tb = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return tb - ta;
      });
    }
    return copy;
  }, [entries, sortBy]);

  if (entries.length === 0) {
    return (
      <Card className="flex flex-col gap-2 p-4" data-testid="webcare-site-inventory">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Site inventory</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          First scan scheduled — your installed plugins, themes, and WordPress
          core will appear here after the next maintenance run.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="webcare-site-inventory">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Site inventory</h2>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} update${pendingCount === 1 ? "" : "s"} available`
            : "Everything is up to date"}
          {lastSnapshotAt && ` · last scanned ${formatTimeAgo(lastSnapshotAt)}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSortBy("recent")}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-medium",
              sortBy === "recent"
                ? "border-foreground text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            data-testid="webcare-inventory-sort-recent"
            aria-pressed={sortBy === "recent"}
          >
            Most recently maintained
          </button>
          <button
            type="button"
            onClick={() => setSortBy("status")}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-medium",
              sortBy === "status"
                ? "border-foreground text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            data-testid="webcare-inventory-sort-status"
            aria-pressed={sortBy === "status"}
          >
            By status
          </button>
        </div>
        {onApplyAllUpdates && pendingCount > 0 && (
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={isMutating}
            onClick={() => onApplyAllUpdates()}
            data-testid="webcare-inventory-apply-all"
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Apply all pending updates
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Kind</th>
              <th className="px-2 py-2">Version</th>
              <th className="px-2 py-2">Last maintained</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, idx) => (
              <tr
                key={`${e.kind}-${e.name}-${idx}`}
                className="border-b border-border last:border-b-0"
                data-testid={`webcare-inventory-row-${idx}`}
              >
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground">{e.name}</span>
                    {e.recentlyUpdated && <PulseDot />}
                  </div>
                </td>
                <td className="px-2 py-2 text-muted-foreground">
                  {KIND_LABEL[e.kind]}
                </td>
                <td className="px-2 py-2 text-muted-foreground">
                  {e.version}
                  {e.latestVersion && e.latestVersion !== e.version && (
                    <span className="ml-1 text-[10px]">→ {e.latestVersion}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-muted-foreground">
                  {formatTimeAgo(e.lastUpdated)}
                </td>
                <td className="px-2 py-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: `hsl(${STATUS_TONE[e.status]} / 0.12)`,
                      color: `hsl(${STATUS_TONE[e.status]})`,
                    }}
                  >
                    {e.status === "up-to-date" && (
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    )}
                    {e.status === "update-available" && (
                      <ChevronUp className="h-3 w-3" aria-hidden="true" />
                    )}
                    {e.status === "security-patch" && (
                      <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                    )}
                    {STATUS_LABEL[e.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Re-export the unused icon to keep the lint happy when sorting changes.
export { ChevronDown };
