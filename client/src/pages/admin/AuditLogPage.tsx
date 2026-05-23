/**
 * AuditLogPage — Wave W-AI-3c.
 *
 * Cross-cutting reader for the general-purpose `audit_log` table. This is
 * separate from the existing `AdminAuditLogPage` (which reads
 * `admin_activity_log` at /admin/crm/audit-log) — the new table is the
 * one written by every admin mutation surface that uses
 * `server/lib/auditLog.ts` `writeAudit()`. Reachable at /admin/audit-log.
 *
 * Filters: entity type, actor id, action, date range. Pagination is
 * offset-based (server enforces limit ≤ 200).
 */

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, FileText, RotateCw } from "lucide-react";

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_type: string;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  diff: unknown;
  metadata: unknown;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AuditResponse {
  rows: AuditRow[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 50;

/* Known entity_type values — additive list since the column is free-form. */
const ENTITY_TYPES = [
  "quotequick_template",
  "quotequick_trade",
  "api_key",
];

/* Common action verbs. */
const ACTIONS = [
  "create",
  "update",
  "delete",
  "archive",
  "unarchive",
  "reset",
  "rename",
  "merge",
  "import",
  "export",
];

/**
 * Map an entity type + id to the appropriate detail page link. Returns
 * null when no in-app link is defined for the entity type (the cell
 * renders as plain text in that case).
 */
function entityHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "quotequick_template":
      return `/admin/quotequick/templates/${encodeURIComponent(entityId)}`;
    case "quotequick_trade":
      return `/admin/quotequick/trades/${encodeURIComponent(entityId)}`;
    default:
      return null;
  }
}

function formatActor(r: AuditRow): string {
  if (r.actor_name) return r.actor_name;
  if (r.actor_email) return r.actor_email;
  if (r.actor_id) return `#${r.actor_id}`;
  return r.actor_type;
}

export default function AuditLogPage() {
  usePageTitle("Activity Audit");

  const [entityType, setEntityType] = useState("all");
  const [actorIdFilter, setActorIdFilter] = useState("");
  const [action, setAction] = useState("all");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const queryKey = useMemo(
    () => ["/api/admin/audit-log", { entityType, actorIdFilter, action, offset }],
    [entityType, actorIdFilter, action, offset],
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery<AuditResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityType !== "all") params.set("entity_type", entityType);
      if (action !== "all") params.set("action", action);
      if (actorIdFilter.trim()) params.set("actor_id", actorIdFilter.trim());
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      const res = await fetch(`/api/admin/audit-log?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`audit-log ${res.status}`);
      return res.json();
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const resetFilters = (mutator: () => void) => {
    mutator();
    setOffset(0);
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Activity Audit
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Append-only log of admin writes (templates, trades, taxonomy changes, etc.).
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RotateCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Filter bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 rounded-md border bg-muted/30">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Entity type
            </label>
            <Select
              value={entityType}
              onValueChange={(v) => resetFilters(() => setEntityType(v))}
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Action
            </label>
            <Select
              value={action}
              onValueChange={(v) => resetFilters(() => setAction(v))}
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Actor id
            </label>
            <Input
              className="mt-1"
              placeholder="e.g. 42"
              value={actorIdFilter}
              onChange={(e) => resetFilters(() => setActorIdFilter(e.target.value))}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => resetFilters(() => {
                setEntityType("all");
                setAction("all");
                setActorIdFilter("");
              })}
            >
              Clear
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 w-8" />
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">Actor</th>
                <th className="text-left px-3 py-2">Action</th>
                <th className="text-left px-3 py-2">Entity</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-t">
                  <td colSpan={5} className="px-3 py-2"><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))}
              {isError && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-destructive">Failed to load audit log.</td></tr>
              )}
              {!isLoading && !isError && rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No audit entries match the current filters.</td></tr>
              )}
              {rows.map((r) => {
                const href = entityHref(r.entity_type, r.entity_id);
                const isOpen = expandedId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 align-top">
                        <button
                          type="button"
                          className="p-1 hover:bg-muted rounded"
                          onClick={() => setExpandedId(isOpen ? null : r.id)}
                          aria-label={isOpen ? "Collapse row" : "Expand row"}
                        >
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-col">
                          <span>{formatActor(r)}</span>
                          <Badge variant="outline" className="mt-1 w-fit text-[10px]">{r.actor_type}</Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge>{r.action}</Badge>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">{r.entity_type}</span>
                          {href ? (
                            <Link href={href} className="font-mono text-xs underline">
                              {r.entity_id}
                            </Link>
                          ) : (
                            <span className="font-mono text-xs">{r.entity_id}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t bg-muted/10">
                        <td colSpan={5} className="px-3 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div>
                              <div className="font-semibold mb-1">Before</div>
                              <pre className="bg-background border rounded p-2 overflow-x-auto max-h-64">
                                {JSON.stringify(r.before, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">After</div>
                              <pre className="bg-background border rounded p-2 overflow-x-auto max-h-64">
                                {JSON.stringify(r.after, null, 2)}
                              </pre>
                            </div>
                            {r.diff != null && (
                              <div className="md:col-span-2">
                                <div className="font-semibold mb-1">Diff</div>
                                <pre className="bg-background border rounded p-2 overflow-x-auto max-h-32">
                                  {JSON.stringify(r.diff, null, 2)}
                                </pre>
                              </div>
                            )}
                            {r.metadata != null && (
                              <div className="md:col-span-2">
                                <div className="font-semibold mb-1">Metadata</div>
                                <pre className="bg-background border rounded p-2 overflow-x-auto max-h-32">
                                  {JSON.stringify(r.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {total > 0 ? (
              <>Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total} • Page {currentPage} / {totalPages}</>
            ) : (
              <>No entries</>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
