/**
 * EntityAuditWidget — Wave W-AI-3c.
 *
 * Compact "Recent changes" panel embedded on entity detail pages
 * (QuoteQuick template/trade detail in AI-3a/AI-3b). Shows the last N
 * audit rows for a single entity. Reads from the same audit endpoint as
 * the full Activity Audit page but with `entity_type` + `entity_id`
 * pre-filtered server-side.
 *
 * Loading state shows a skeleton; empty state shows "No recent changes."
 * Failure logs to console and shows a quiet inline error.
 *
 * Used like:
 *   <EntityAuditWidget entityType="quotequick_template" entityId={id} />
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_type: string;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  diff?: unknown;
  metadata?: unknown;
}

interface AuditResponse {
  rows: AuditRow[];
  total: number;
}

interface Props {
  entityType: string;
  entityId: string;
  /** How many rows to show (default 5). */
  limit?: number;
  /** Optional title override. */
  title?: string;
}

function formatActor(r: AuditRow): string {
  if (r.actor_name) return r.actor_name;
  if (r.actor_email) return r.actor_email;
  if (r.actor_id) return `#${r.actor_id}`;
  return r.actor_type;
}

export default function EntityAuditWidget({
  entityType,
  entityId,
  limit = 5,
  title = "Recent changes",
}: Props) {
  const { data, isLoading, isError } = useQuery<AuditResponse>({
    queryKey: ["/api/admin/audit-log", { entityType, entityId, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({
        entity_type: entityType,
        entity_id: entityId,
        limit: String(limit),
      });
      const res = await fetch(`/api/admin/audit-log?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`entity-audit ${res.status}`);
      return res.json();
    },
    // Refresh when the underlying entity is edited.
    refetchOnWindowFocus: true,
  });

  return (
    <div className="rounded-md border bg-card">
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock className="w-4 h-4" />
          {title}
        </div>
        <Link
          href={`/admin/audit-log?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`}
          className="text-xs underline text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      </div>
      <div className="divide-y">
        {isLoading && (
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        {isError && (
          <div className="p-3 text-xs text-destructive">Failed to load recent changes.</div>
        )}
        {!isLoading && !isError && (data?.rows?.length ?? 0) === 0 && (
          <div className="p-3 text-xs text-muted-foreground">No recent changes.</div>
        )}
        {!isLoading && !isError && data?.rows?.map((r) => (
          <div key={r.id} className="px-3 py-2 text-xs flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{r.action}</Badge>
              <span className="text-muted-foreground">{formatActor(r)}</span>
            </div>
            <span className="text-muted-foreground whitespace-nowrap">
              {new Date(r.created_at).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
