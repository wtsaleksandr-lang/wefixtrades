/**
 * /admin/contentflow — ContentFlow draft queue.
 *
 * Read view + filter + click-through to a right-side drawer that exposes
 * approve/reject actions. Backed by the Sprint 1 verified endpoint
 * GET /api/admin/contentflow/queue plus the Sprint 2 detail/approve/reject
 * endpoints.
 *
 * Mobile: filters stack, table scrolls horizontally, drawer goes full-width.
 */
import { useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, Filter as FilterIcon, Inbox, Loader2, Calendar, ChevronLeft, ChevronRight, LayoutList, Facebook, Instagram, Globe, Mail, Settings } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  CONTENT_DRAFT_STATUS_LABELS,
  CONTENT_DRAFT_STATUS_STYLES,
  statusLabel,
} from "@/config/portalLabels";
import ContentFlowDraftDrawer from "@/components/contentflow/ContentFlowDraftDrawer";
import ContentFlowSettingsPanel from "@/components/contentflow/ContentFlowSettingsPanel";

interface ContentDraftRow {
  id: number;
  client_id: number;
  surface: string;
  kind: string;
  status: string;
  quality_score: number | null;
  target_platform: string | null;
  linked_social_post_id: number | null;
  linked_task_id: number | null;
  created_at: string;
  title: string | null;
  excerpt: string | null;
  metadata: any;
}

/** Sprint 5: derive a publish queue badge from the wordpress metadata. */
function deriveQueueBadge(d: ContentDraftRow): { label: string; className: string } | null {
  const wp = d.metadata?.wordpress;
  if (!wp) return null;
  if (wp.post_url && wp.post_id) return { label: "Published", className: "border-blue-300 text-blue-700" };
  if (wp.queue_status === "publishing") return { label: "Publishing", className: "border-indigo-300 text-indigo-700" };
  if (wp.queue_status === "queued") {
    if (wp.scheduled_for && new Date(wp.scheduled_for).getTime() > Date.now()) {
      return { label: "Scheduled", className: "border-violet-300 text-violet-700" };
    }
    return { label: "Queued", className: "border-emerald-300 text-emerald-700" };
  }
  if (wp.queue_status === "failed") return { label: "Failed", className: "border-red-300 text-red-700" };
  return null;
}

interface QueueResponse {
  drafts: ContentDraftRow[];
  count: number;
  limit: number;
  offset: number;
}

interface ClientLite {
  id: number;
  business_name: string | null;
}

const STATUS_OPTIONS = [
  "draft",
  "awaiting_admin",
  "awaiting_client",
  "approved",
  "rejected",
  "published",
  "delivered",
  "failed",
];

const SURFACE_OPTIONS = ["socialsync", "rankflow"];
const KIND_OPTIONS = ["social_post", "article", "caption"];

const ANY = "__any__";

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function ContentFlowQueuePage() {
  usePageTitle("ContentFlow Queue");
  const qc = useQueryClient();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<"list" | "calendar" | "settings">("list");

  const [clientFilter, setClientFilter] = useState<string>(ANY);
  const [statusFilter, setStatusFilter] = useState<string>(ANY);
  const [surfaceFilter, setSurfaceFilter] = useState<string>(ANY);
  const [kindFilter, setKindFilter] = useState<string>(ANY);

  const [drawerDraftId, setDrawerDraftId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sprint 5: bulk-select state for Queue/Retry actions.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const bulkQueueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/contentflow/bulk-queue", {
        draft_ids: Array.from(selectedIds),
        status: "draft",
      });
      return res.json();
    },
    onSuccess: (body: any) => {
      toast({
        title: "Bulk queue submitted",
        description: `${body?.succeeded ?? 0} queued, ${body?.failed ?? 0} skipped`,
      });
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/queue"] });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Bulk queue failed", description: e?.message || "Unknown error" });
    },
  });

  // Build query string for the queue endpoint
  const queueQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (clientFilter !== ANY) params.set("client_id", clientFilter);
    if (statusFilter !== ANY) params.set("status", statusFilter);
    if (surfaceFilter !== ANY) params.set("surface", surfaceFilter);
    if (kindFilter !== ANY) params.set("kind", kindFilter);
    params.set("limit", "100");
    return params.toString();
  }, [clientFilter, statusFilter, surfaceFilter, kindFilter]);

  const queueKey = ["/api/admin/contentflow/queue", queueQuery];

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<QueueResponse>({
    queryKey: queueKey,
    queryFn: async () => {
      const url = `/api/admin/contentflow/queue?${queueQuery}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`Queue load failed: ${res.status}`);
      return res.json();
    },
    refetchInterval: 60_000,
  });

  // Client list — for the client filter and to render names in the table.
  // The /api/admin/crm/clients endpoint returns `{ data: rows, total }`
  // and caps `limit` at 100 server-side. We also accept `{ clients: ... }`
  // and a raw array for forward-compatibility with future shape changes.
  const { data: clientsResp } = useQuery<unknown>({
    queryKey: ["/api/admin/crm/clients"],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/clients?limit=100", { credentials: "include" });
      if (!res.ok) throw new Error(`Clients load failed: ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const clients: ClientLite[] = useMemo(() => {
    if (!clientsResp) return [];
    if (Array.isArray(clientsResp)) return clientsResp as ClientLite[];
    const r = clientsResp as Record<string, unknown>;
    if (Array.isArray(r.data)) return r.data as ClientLite[];
    if (Array.isArray(r.clients)) return r.clients as ClientLite[];
    return [];
  }, [clientsResp]);

  const clientNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of clients) m.set(c.id, c.business_name || `Client #${c.id}`);
    return m;
  }, [clients]);

  const drafts = data?.drafts ?? [];

  const openDrawer = (id: number) => {
    setDrawerDraftId(id);
    setDrawerOpen(true);
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">ContentFlow</h1>
            <p className="text-sm text-muted-foreground">
              Review and act on AI-generated drafts before they publish.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 text-xs font-medium ${
                  viewMode === "list"
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <LayoutList className="h-3.5 w-3.5 inline mr-1" />
                List
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={`px-3 py-1.5 text-xs font-medium ${
                  viewMode === "calendar"
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Calendar className="h-3.5 w-3.5 inline mr-1" />
                Calendar
              </button>
              <button
                onClick={() => setViewMode("settings")}
                className={`px-3 py-1.5 text-xs font-medium ${
                  viewMode === "settings"
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Settings className="h-3.5 w-3.5 inline mr-1" />
                Settings
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/queue"] });
                refetch();
              }}
              disabled={isFetching}
              data-testid="contentflow-refresh"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="default"
              onClick={() => bulkQueueMutation.mutate()}
              disabled={bulkQueueMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="bulk-queue-publish-btn"
            >
              {bulkQueueMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Queue {selectedIds.size} for Publish
            </Button>
          )}
        </div>

        {/* Filters */}
        {viewMode !== "settings" && (
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
            <FilterIcon className="h-3.5 w-3.5" />
            <span>Filters</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <FilterSelect
              label="Client"
              value={clientFilter}
              onChange={setClientFilter}
              options={[
                { value: ANY, label: "Any client" },
                ...clients.map((c) => ({
                  value: String(c.id),
                  label: c.business_name || `Client #${c.id}`,
                })),
              ]}
            />
            <FilterSelect
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: ANY, label: "Any status" },
                ...STATUS_OPTIONS.map((s) => ({
                  value: s,
                  label: statusLabel(CONTENT_DRAFT_STATUS_LABELS, s),
                })),
              ]}
            />
            <FilterSelect
              label="Surface"
              value={surfaceFilter}
              onChange={setSurfaceFilter}
              options={[
                { value: ANY, label: "Any surface" },
                ...SURFACE_OPTIONS.map((s) => ({ value: s, label: s })),
              ]}
            />
            <FilterSelect
              label="Kind"
              value={kindFilter}
              onChange={setKindFilter}
              options={[
                { value: ANY, label: "Any kind" },
                ...KIND_OPTIONS.map((k) => ({ value: k, label: k.replace(/_/g, " ") })),
              ]}
            />
          </div>
        </Card>
        )}

        {/* Settings View */}
        {viewMode === "settings" && <ContentFlowSettingsPanel />}

        {/* Calendar View */}
        {viewMode === "calendar" && (
          <ContentCalendarView drafts={drafts} isLoading={isLoading} onSelectDraft={openDrawer} />
        )}

        {/* Table */}
        {viewMode === "list" && <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead className="min-w-[160px]">Client</TableHead>
                  <TableHead>Surface</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28">Publish</TableHead>
                  <TableHead className="w-24">Quality</TableHead>
                  <TableHead className="w-32">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <>
                    {[0, 1, 2, 3].map((i) => (
                      <TableRow key={`s-${i}`}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </>
                )}

                {isError && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <div className="py-8 text-center text-sm text-red-700">
                        Failed to load queue: {(error as any)?.message || "unknown error"}
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && !isError && drafts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <div className="py-12 flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <Inbox className="h-8 w-8 opacity-50" />
                        <div>No drafts match the current filters.</div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && drafts.map((d) => {
                  const queueBadge = deriveQueueBadge(d);
                  const canSelect =
                    d.status === "approved" &&
                    d.kind === "article" &&
                    d.surface === "rankflow" &&
                    !(d.metadata?.wordpress?.post_url && d.metadata?.wordpress?.post_id);
                  return (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDrawer(d.id)}
                    data-testid={`contentflow-row-${d.id}`}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {canSelect && (
                        <Checkbox
                          checked={selectedIds.has(d.id)}
                          onCheckedChange={() => toggleSelected(d.id)}
                          aria-label={`Select draft ${d.id}`}
                          data-testid={`select-row-${d.id}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">#{d.id}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">
                        {clientNameById.get(d.client_id) || `Client #${d.client_id}`}
                      </div>
                      {d.title && (
                        <div className="text-xs text-muted-foreground line-clamp-1 max-w-[260px]">
                          {d.title}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {d.surface}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">
                        {d.kind.replace(/_/g, " ")}
                        {d.target_platform && (
                          <span className="text-muted-foreground"> · {d.target_platform}</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={CONTENT_DRAFT_STATUS_STYLES[d.status] || "bg-gray-100 text-gray-600"}
                      >
                        {statusLabel(CONTENT_DRAFT_STATUS_LABELS, d.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {queueBadge ? (
                        <Badge variant="outline" className={`text-xs ${queueBadge.className}`}>
                          {queueBadge.label}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {typeof d.quality_score === "number" ? (
                        <span className={`text-xs font-mono ${
                          d.quality_score >= 70 ? "text-emerald-700" :
                          d.quality_score >= 40 ? "text-amber-700" : "text-red-700"
                        }`}>
                          {d.quality_score}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground" title={new Date(d.created_at).toLocaleString()}>
                      {formatRelative(d.created_at)}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {!isLoading && drafts.length > 0 && (
            <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
              <span>{drafts.length} {drafts.length === 1 ? "draft" : "drafts"}</span>
              {data?.count === data?.limit && (
                <span className="italic">showing first {data?.limit} — refine filters to narrow</span>
              )}
            </div>
          )}
        </Card>}
      </div>

      <ContentFlowDraftDrawer
        draftId={drawerDraftId}
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) {
            // Light delay so the queue refresh is visible after approve/reject.
            qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/queue"] });
          }
        }}
      />
    </AdminLayout>
  );
}

/* ─── Internal: filter select with label ─── */

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ─── Content Calendar View ─── */

const PLATFORM_CAL_ICONS: Record<string, React.ReactNode> = {
  facebook: <Facebook className="h-3 w-3 text-blue-600" />,
  instagram: <Instagram className="h-3 w-3 text-pink-600" />,
  google_business: <Globe className="h-3 w-3 text-green-600" />,
  email: <Mail className="h-3 w-3 text-gray-600" />,
  wordpress: <Globe className="h-3 w-3 text-indigo-600" />,
};

const STATUS_DOT: Record<string, string> = {
  published: "bg-emerald-500",
  approved: "bg-blue-500",
  failed: "bg-red-500",
  draft: "bg-gray-400",
  rejected: "bg-red-400",
  queued: "bg-blue-400",
};

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ContentCalendarView({
  drafts,
  isLoading,
  onSelectDraft,
}: {
  drafts: ContentDraftRow[];
  isLoading: boolean;
  onSelectDraft: (id: number) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [viewMode, setCalViewMode] = useState<"month" | "week">("month");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
    setSelectedDay(null);
  };

  /** Group drafts by date (using scheduled_for from metadata, or created_at). */
  const draftsByDate = useMemo(() => {
    const map = new Map<string, ContentDraftRow[]>();
    for (const d of drafts) {
      const meta = d.metadata as any;
      // Try multiple date sources
      const dateStr =
        meta?.wordpress?.scheduled_for ||
        meta?.calendar?.scheduled_for ||
        meta?.facebook?.scheduled_for ||
        meta?.instagram?.scheduled_for ||
        meta?.gbp_post?.scheduled_for ||
        meta?.email?.scheduled_for ||
        (d.status === "published" ? meta?.wordpress?.published_at : null) ||
        d.created_at;
      if (!dateStr) continue;
      const dt = new Date(dateStr);
      if (isNaN(dt.getTime())) continue;
      const key = dateKey(dt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return map;
  }, [drafts]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const monthName = new Date(year, month).toLocaleString("default", { month: "long" });
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /* Get current week boundaries for week view */
  const todayKey = dateKey(today);

  /* Build grid cells */
  const cells: Array<{ date: Date; key: string; inMonth: boolean }> = [];
  // Previous month padding
  const prevMonthDays = getDaysInMonth(year, month === 0 ? 11 : month - 1);
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    cells.push({ date: d, key: dateKey(d), inMonth: false });
  }
  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    cells.push({ date: d, key: dateKey(d), inMonth: true });
  }
  // Next month padding to complete the grid
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      cells.push({ date: d, key: dateKey(d), inMonth: false });
    }
  }

  const selectedDrafts = selectedDay ? (draftsByDate.get(selectedDay) ?? []) : [];

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        {/* Calendar header */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-semibold">
            {monthName} {year}
          </h3>
          <Button variant="ghost" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Day names */}
        <div className="grid grid-cols-7 gap-px mb-1">
          {dayNames.map((name) => (
            <div key={name} className="text-center text-[10px] font-medium text-muted-foreground py-1">
              {name}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden">
          {cells.map((cell) => {
            const dayDrafts = draftsByDate.get(cell.key) ?? [];
            const isToday = cell.key === todayKey;
            const isSelected = cell.key === selectedDay;
            const publishedCount = dayDrafts.filter((d) => d.status === "published").length;
            const queuedCount = dayDrafts.filter((d) => d.status === "approved" || d.metadata?.wordpress?.queue_status === "queued").length;
            const failedCount = dayDrafts.filter((d) => d.status === "failed" || d.metadata?.wordpress?.queue_status === "failed").length;
            const draftCount = dayDrafts.filter((d) => d.status === "draft").length;

            // Collect unique platforms
            const platforms = new Set<string>();
            for (const d of dayDrafts) {
              if (d.target_platform) platforms.add(d.target_platform);
              else if (d.surface === "rankflow") platforms.add("wordpress");
            }

            return (
              <button
                key={cell.key}
                onClick={() => setSelectedDay(isSelected ? null : cell.key)}
                className={`min-h-[72px] p-1 text-left transition-colors ${
                  cell.inMonth ? "bg-white" : "bg-gray-50"
                } ${isSelected ? "ring-2 ring-inset ring-blue-500" : ""} ${
                  dayDrafts.length > 0 ? "cursor-pointer hover:bg-blue-50" : ""
                }`}
              >
                <div className={`text-xs mb-0.5 ${
                  isToday
                    ? "font-bold text-blue-600"
                    : cell.inMonth
                    ? "text-gray-700"
                    : "text-gray-400"
                }`}>
                  {cell.date.getDate()}
                </div>

                {dayDrafts.length > 0 && (
                  <div className="space-y-0.5">
                    {/* Status dots */}
                    <div className="flex gap-0.5 flex-wrap">
                      {publishedCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {publishedCount}
                        </span>
                      )}
                      {queuedCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          {queuedCount}
                        </span>
                      )}
                      {failedCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-red-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          {failedCount}
                        </span>
                      )}
                      {draftCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-gray-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          {draftCount}
                        </span>
                      )}
                    </div>
                    {/* Platform icons */}
                    <div className="flex gap-0.5">
                      {Array.from(platforms).slice(0, 4).map((p) => (
                        <span key={p}>{PLATFORM_CAL_ICONS[p] || null}</span>
                      ))}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Published</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Queued</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Failed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400" /> Draft</span>
        </div>
      </Card>

      {/* Selected day details */}
      {selectedDay && (
        <Card className="p-4">
          <h4 className="text-sm font-semibold mb-3">
            {new Date(selectedDay + "T00:00:00").toLocaleDateString("default", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            <Badge variant="outline" className="ml-2 text-[10px]">{selectedDrafts.length} {selectedDrafts.length === 1 ? "draft" : "drafts"}</Badge>
          </h4>
          {selectedDrafts.length === 0 && (
            <p className="text-xs text-muted-foreground">No drafts scheduled for this day.</p>
          )}
          <div className="space-y-2">
            {selectedDrafts.map((d) => {
              const queueBadge = deriveQueueBadge(d);
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => onSelectDraft(d.id)}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[d.status] || "bg-gray-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{d.title || `Draft #${d.id}`}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {d.kind.replace(/_/g, " ")}
                      {d.target_platform && <> / {d.target_platform}</>}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] flex-shrink-0 ${CONTENT_DRAFT_STATUS_STYLES[d.status] || "bg-gray-100"}`}
                  >
                    {statusLabel(CONTENT_DRAFT_STATUS_LABELS, d.status)}
                  </Badge>
                  {queueBadge && (
                    <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${queueBadge.className}`}>
                      {queueBadge.label}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
