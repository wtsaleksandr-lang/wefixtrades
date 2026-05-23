/**
 * Admin Audit Log viewer.
 *
 * Reads `admin_activity_log` (every admin/AI/system mutation in the
 * platform writes to this table) and lets the operator filter +
 * search across actor type, action substring, entity type, free-text
 * (summary or actor name), and a date range. Pagination is
 * keyset-based using the `id` column — see the route handler in
 * server/routes/adminCrmRoutes.ts.
 *
 * Linked from the admin sidebar; reachable directly at
 * /admin/crm/audit-log.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bot, User, Cpu, Search, RotateCw, ChevronDown, Download, FileText,
} from "lucide-react";
import { csvDownload, todayIso } from "@/lib/csvDownload";

interface ActivityRow {
  id: number;
  actor_type: "human" | "ai_agent" | "system" | string;
  actor_id: number | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ActivityResponse {
  rows: ActivityRow[];
  nextCursor: number | null;
}

/* The set of entity types we observed in storage.ts comments. Kept
 * as a flat list rather than enum because the column is varchar and
 * may legitimately grow over time. */
const ENTITY_TYPES = [
  "client", "client_service", "order", "fulfillment_task",
  "supplier", "payment", "onboarding", "support_ticket",
  "rule_event", "system",
];

const PAGE_SIZE = 50;

export default function AdminAuditLogPage() {
  usePageTitle("Audit Log");

  /* ─── Filters ─── */
  const [actorType, setActorType] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [actionLike, setActionLike] = useState("");
  const [q, setQ] = useState("");
  const [since, setSince] = useState("");      // YYYY-MM-DD
  const [until, setUntil] = useState("");
  const [pages, setPages] = useState<number[]>([0]); // cursor stack for pagination

  /* The server uses keyset cursors, so each "page" we've visited is
   * just an `id < cursor` boundary. pages[0] = 0 means "no cursor". */
  const currentCursor = pages[pages.length - 1] || undefined;

  const queryKey = useMemo(
    () => [
      "/api/admin/crm/activity",
      { actorType, entityType, actionLike, q, since, until, currentCursor },
    ],
    [actorType, entityType, actionLike, q, since, until, currentCursor],
  );

  const { data, isLoading, isError, refetch, isFetching } = useQuery<ActivityResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (actorType !== "all") params.set("actor_type", actorType);
      if (entityType !== "all") params.set("entity_type", entityType);
      if (actionLike.trim()) params.set("action", actionLike.trim());
      if (q.trim()) params.set("q", q.trim());
      if (since) params.set("since", new Date(since).toISOString());
      if (until) {
        // Treat the date input as end-of-day so the operator's
        // "until 2026-05-08" filter includes that day's events.
        const d = new Date(until);
        d.setHours(23, 59, 59, 999);
        params.set("until", d.toISOString());
      }
      params.set("limit", String(PAGE_SIZE));
      if (currentCursor) params.set("cursor", String(currentCursor));
      const res = await fetch(`/api/admin/crm/activity?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`audit-log ${res.status}`);
      return res.json();
    },
  });

  /* ─── Pagination handlers ─── */

  const goNext = () => {
    if (data?.nextCursor) setPages([...pages, data.nextCursor]);
  };
  const goPrev = () => {
    if (pages.length > 1) setPages(pages.slice(0, -1));
  };

  /* When any filter changes, reset to page 1 — otherwise the cursor
   * we have is stale relative to the new filter set. */
  const resetFilters = (mutator: () => void) => {
    mutator();
    setPages([0]);
  };

  /* ─── CSV export — current page only ─── */
  const exportCsv = () => {
    if (!data?.rows.length) return;
    csvDownload<ActivityRow>({
      filename: `audit-log-${todayIso()}.csv`,
      columns: [
        { header: "id",          value: (r) => r.id },
        { header: "created_at",  value: (r) => r.created_at },
        { header: "actor_type",  value: (r) => r.actor_type },
        { header: "actor_name",  value: (r) => r.actor_name },
        { header: "action",      value: (r) => r.action },
        { header: "entity_type", value: (r) => r.entity_type },
        { header: "entity_id",   value: (r) => r.entity_id },
        { header: "summary",     value: (r) => r.summary },
      ],
      rows: data.rows,
    });
  };

  const rows = data?.rows ?? [];

  return (
    <AdminLayout>
      <div data-theme="light" className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Audit Log
            </h2>
            <p className="text-sm text-gray-500">
              Every admin, AI agent, and system mutation. Page {pages.length} · {rows.length} row{rows.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={rows.length === 0}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select value={actorType} onValueChange={(v) => resetFilters(() => setActorType(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Actor type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              <SelectItem value="human">Human</SelectItem>
              <SelectItem value="ai_agent">AI agent</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>

          <Select value={entityType} onValueChange={(v) => resetFilters(() => setEntityType(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Entity type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              type="text"
              placeholder="Action contains…"
              value={actionLike}
              onChange={(e) => resetFilters(() => setActionLike(e.target.value))}
              className="pl-8 h-9"
            />
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              type="text"
              placeholder="Search summary or actor…"
              value={q}
              onChange={(e) => resetFilters(() => setQ(e.target.value))}
              className="pl-8 h-9"
            />
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-gray-600">From</span>
            <Input
              type="date"
              value={since}
              onChange={(e) => resetFilters(() => setSince(e.target.value))}
              className="h-9"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-gray-600">To</span>
            <Input
              type="date"
              value={until}
              onChange={(e) => resetFilters(() => setUntil(e.target.value))}
              className="h-9"
            />
          </label>
        </div>

        {/* Body */}
        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            Couldn't load activity. <button onClick={() => refetch()} className="underline font-medium">Retry</button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">No activity matches these filters</p>
            <p className="text-xs text-gray-500 mt-1">Try widening the date range or clearing search terms.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {rows.map((row) => (
                <ActivityRowItem key={row.id} row={row} />
              ))}
            </ul>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && rows.length > 0 && (
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={goPrev} disabled={pages.length === 1}>
              ← Newer
            </Button>
            <span className="text-xs text-gray-500">Page {pages.length}</span>
            <Button variant="outline" size="sm" onClick={goNext} disabled={!data?.nextCursor}>
              Older →
            </Button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function ActivityRowItem({ row }: { row: ActivityRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasMetadata = row.metadata && Object.keys(row.metadata).length > 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => hasMetadata && setExpanded(!expanded)}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
          hasMetadata ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
        }`}
        aria-expanded={expanded}
      >
        <ActorIcon type={row.actor_type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-[11px] font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
              {row.action}
            </code>
            <Badge variant="outline" className="text-[10px] py-0">
              {row.entity_type}{row.entity_id ? `#${row.entity_id}` : ""}
            </Badge>
            <span className="text-[11px] text-gray-400 ml-auto flex-shrink-0">
              {formatTimestamp(row.created_at)}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1 truncate">
            {row.summary || <em className="text-gray-400">no summary</em>}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {row.actor_name || `${row.actor_type}${row.actor_id ? ` #${row.actor_id}` : ""}`}
          </p>
        </div>
        {hasMetadata && (
          <ChevronDown
            className={`w-4 h-4 text-gray-300 flex-shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {expanded && hasMetadata && (
        <div className="px-4 pb-3 -mt-1">
          <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto text-gray-700">
            {JSON.stringify(row.metadata, null, 2)}
          </pre>
        </div>
      )}
    </li>
  );
}

function ActorIcon({ type }: { type: string }) {
  if (type === "ai_agent") {
    return (
      <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
        <Bot className="w-3.5 h-3.5" />
      </span>
    );
  }
  if (type === "system") {
    return (
      <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center flex-shrink-0">
        <Cpu className="w-3.5 h-3.5" />
      </span>
    );
  }
  return (
    <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
      <User className="w-3.5 h-3.5" />
    </span>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
