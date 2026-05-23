/**
 * /admin/contentflow — ContentFlow draft queue.
 *
 * List view with column-header filters (Client / Source / Kind / Status),
 * a global text search, a Created sort + date-range control, bulk-select,
 * and platform/source icons. Calendar + Settings views unchanged.
 *
 * Filtering is client-side over the most recent 200 drafts so search and
 * every header filter are instant.
 *
 * Wrapped with <AdminProductPageShell> (PR #578 pilot pattern). View
 * modes (list / calendar / settings) become shell tabs; the search input
 * + bulk-action bar lift into the shell's filtersBar.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminProductPageShell, type ProductStats } from "@/components/admin/AdminProductPageShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  RefreshCw, Inbox, Loader2, ChevronLeft, ChevronRight,
  Search, ArrowDownUp, Facebook, Instagram, Globe, Mail, Linkedin, Youtube, Pin,
  FileText, Share2, TrendingUp, MessageSquare, Video,
} from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  CONTENT_DRAFT_STATUS_LABELS,
  CONTENT_DRAFT_STATUS_STYLES,
  statusLabel,
} from "@/config/portalLabels";
import ContentFlowDraftDrawer from "@/components/contentflow/ContentFlowDraftDrawer";
import ContentFlowSettingsPanel from "@/components/contentflow/ContentFlowSettingsPanel";
import { HeaderFilterDropdown } from "@/components/datatable/HeaderFilterDropdown";

const PRODUCT_ID = "contentflow";

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

interface ProductRecord {
  live: { id: string; name: string; is_active: boolean; hidden: boolean } | null;
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

type IconMeta = { label: string; icon: React.ReactNode };

/* Source (which product generated the draft) — icons mirror the nav. */
const SOURCE_META: Record<string, IconMeta> = {
  socialsync: { label: "SocialSync", icon: <Share2 className="h-3.5 w-3.5 text-sky-600" /> },
  rankflow: { label: "RankFlow", icon: <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> },
  reputationshield: { label: "ReputationShield", icon: <MessageSquare className="h-3.5 w-3.5 text-amber-600" /> },
};

/* Content kind. */
const KIND_META: Record<string, IconMeta> = {
  social_post: { label: "Social post", icon: <Share2 className="h-3.5 w-3.5 text-sky-600" /> },
  carousel_post: { label: "Carousel post", icon: <Share2 className="h-3.5 w-3.5 text-sky-600" /> },
  article: { label: "Article", icon: <FileText className="h-3.5 w-3.5 text-indigo-600" /> },
  caption: { label: "Caption", icon: <MessageSquare className="h-3.5 w-3.5 text-gray-600" /> },
  google_post: { label: "Google post", icon: <Globe className="h-3.5 w-3.5 text-green-600" /> },
  review_reply: { label: "Review reply", icon: <MessageSquare className="h-3.5 w-3.5 text-amber-600" /> },
  video: { label: "Video", icon: <Video className="h-3.5 w-3.5 text-red-600" /> },
  video_script: { label: "Video script", icon: <Video className="h-3.5 w-3.5 text-red-600" /> },
  infographic: { label: "Infographic", icon: <FileText className="h-3.5 w-3.5 text-violet-600" /> },
};

/* Target platform (where the draft will post). */
const PLATFORM_META: Record<string, IconMeta> = {
  facebook: { label: "Facebook", icon: <Facebook className="h-3.5 w-3.5 text-blue-600" /> },
  instagram: { label: "Instagram", icon: <Instagram className="h-3.5 w-3.5 text-pink-600" /> },
  google_business: { label: "Google Business", icon: <Globe className="h-3.5 w-3.5 text-green-600" /> },
  linkedin: { label: "LinkedIn", icon: <Linkedin className="h-3.5 w-3.5 text-sky-700" /> },
  pinterest: { label: "Pinterest", icon: <Pin className="h-3.5 w-3.5 text-red-600" /> },
  youtube: { label: "YouTube", icon: <Youtube className="h-3.5 w-3.5 text-red-600" /> },
  email: { label: "Email", icon: <Mail className="h-3.5 w-3.5 text-gray-600" /> },
  website: { label: "Website", icon: <Globe className="h-3.5 w-3.5 text-indigo-600" /> },
};

function metaFor(map: Record<string, IconMeta>, key: string): IconMeta {
  return map[key] || { label: key.replace(/_/g, " "), icon: <FileText className="h-3.5 w-3.5 text-gray-400" /> };
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

function uniqueSorted(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean))).sort();
}

type DateRange = "all" | "today" | "7d" | "30d";

function dateRangeCutoff(range: DateRange): number | null {
  if (range === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (range === "7d") return Date.now() - 7 * 86_400_000;
  if (range === "30d") return Date.now() - 30 * 86_400_000;
  return null;
}

/** Small icon with a fast, rounded hover tooltip naming what it is. */
function IconTip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center">{icon}</span>
      </TooltipTrigger>
      <TooltipContent className="rounded-md px-2 py-1 text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Created column header — toggles sort direction and picks a date range. */
function CreatedHeader({
  sortDir, onSort, dateRange, onDateRange,
}: {
  sortDir: "desc" | "asc";
  onSort: (d: "desc" | "asc") => void;
  dateRange: DateRange;
  onDateRange: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = dateRange !== "all";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 -mx-1 rounded px-1 py-0.5 transition-colors hover:bg-gray-100 ${
            active ? "font-semibold text-indigo-700" : ""
          }`}
        >
          Created
          <ArrowDownUp className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-2">
        <div className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sort</div>
        <button
          type="button"
          onClick={() => onSort("desc")}
          className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-50 ${sortDir === "desc" ? "font-medium text-indigo-700" : ""}`}
        >
          Newest first
        </button>
        <button
          type="button"
          onClick={() => onSort("asc")}
          className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-50 ${sortDir === "asc" ? "font-medium text-indigo-700" : ""}`}
        >
          Oldest first
        </button>
        <div className="mb-1 mt-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Date range</div>
        {([["all", "All time"], ["today", "Today"], ["7d", "Last 7 days"], ["30d", "Last 30 days"]] as [DateRange, string][]).map(
          ([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => onDateRange(v)}
              className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-50 ${dateRange === v ? "font-medium text-indigo-700" : ""}`}
            >
              {label}
            </button>
          ),
        )}
      </PopoverContent>
    </Popover>
  );
}

const TD_DIVIDER = "border-r border-gray-100";

export default function ContentFlowQueuePage() {
  usePageTitle("ContentFlow Queue");
  const qc = useQueryClient();
  const { toast } = useToast();

  /* Filters — applied client-side over the loaded set. */
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [surfaceFilter, setSurfaceFilter] = useState<Set<string>>(new Set());
  const [kindFilter, setKindFilter] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const [drawerDraftId, setDrawerDraftId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  /* AdminProductPageShell wiring — see QuoteQuickPage pilot (PR #578). */
  const productKey = ["/api/admin/products", PRODUCT_ID] as const;
  const { data: productData } = useQuery<ProductRecord>({
    queryKey: productKey,
    queryFn: () => apiRequest("GET", `/api/admin/products/${PRODUCT_ID}`).then((r) => r.json()),
  });
  const live = productData?.live ?? null;

  const statsKey = ["/api/admin/products", PRODUCT_ID, "stats"] as const;
  const { data: productStats } = useQuery<ProductStats>({
    queryKey: statsKey,
    queryFn: () => apiRequest("GET", `/api/admin/products/${PRODUCT_ID}/stats`).then((r) => r.json()),
  });

  const activeToggle = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/products/${PRODUCT_ID}/status`, { is_active: next });
      return res.json();
    },
    onMutate: async (next: boolean) => {
      await qc.cancelQueries({ queryKey: productKey });
      const prev = qc.getQueryData<ProductRecord>(productKey);
      if (prev?.live) {
        qc.setQueryData<ProductRecord>(productKey, { live: { ...prev.live, is_active: next } });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(productKey, ctx.prev);
      toast({ title: "Could not update status", description: "Try again", variant: "destructive" });
    },
    onSuccess: (_data, next) => {
      toast({ title: next ? "Product activated" : "Product deactivated" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: productKey });
    },
  });

  const hiddenToggle = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/products/${PRODUCT_ID}/visibility`, { hidden: next });
      return res.json();
    },
    onMutate: async (next: boolean) => {
      await qc.cancelQueries({ queryKey: productKey });
      const prev = qc.getQueryData<ProductRecord>(productKey);
      if (prev?.live) {
        qc.setQueryData<ProductRecord>(productKey, { live: { ...prev.live, hidden: next } });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(productKey, ctx.prev);
      toast({ title: "Could not update visibility", description: "Try again", variant: "destructive" });
    },
    onSuccess: (_data, next) => {
      toast({ title: next ? "Hidden from public catalog" : "Visible in public catalog" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: productKey });
    },
  });

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

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<QueueResponse>({
    queryKey: ["/api/admin/contentflow/queue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/contentflow/queue?limit=200", { credentials: "include" });
      if (!res.ok) throw new Error(`Queue load failed: ${res.status}`);
      return res.json();
    },
    refetchInterval: 60_000,
  });

  // Client list — for the Client filter and to render names in the table.
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

  /* W-AM-2: warn admin when video_script drafts exist while video generation
   * is globally disabled (script/output mismatch — 3-5 min script vs 5-sec
   * B-roll). Scripts will still appear in the queue but no video will auto-
   * produce until VIDEO_GENERATION_ENABLED is flipped back on. */
  const videoScriptCount = useMemo(
    () => drafts.filter((d) => d.kind === "video_script").length,
    [drafts],
  );

  /* Header-filter option lists, derived from the loaded drafts. */
  const clientOptions = useMemo(
    () => uniqueSorted(drafts.map((d) => String(d.client_id))).map((id) => ({
      value: id,
      label: clientNameById.get(Number(id)) || `Client #${id}`,
    })),
    [drafts, clientNameById],
  );
  const surfaceOptions = useMemo(
    () => uniqueSorted(drafts.map((d) => d.surface)).map((s) => {
      const m = metaFor(SOURCE_META, s);
      return { value: s, label: m.label, icon: m.icon };
    }),
    [drafts],
  );
  const kindOptions = useMemo(
    () => uniqueSorted(drafts.map((d) => d.kind)).map((k) => {
      const m = metaFor(KIND_META, k);
      return { value: k, label: m.label, icon: m.icon };
    }),
    [drafts],
  );
  const statusOptions = useMemo(
    () => STATUS_OPTIONS.map((s) => ({ value: s, label: statusLabel(CONTENT_DRAFT_STATUS_LABELS, s) })),
    [],
  );

  /* Filtered + sorted view. */
  const filtered = useMemo(() => {
    let rows = drafts;
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((d) =>
        String(d.id).includes(q) ||
        (d.title || "").toLowerCase().includes(q) ||
        (clientNameById.get(d.client_id) || "").toLowerCase().includes(q),
      );
    }
    if (clientFilter.size) rows = rows.filter((d) => clientFilter.has(String(d.client_id)));
    if (statusFilter.size) rows = rows.filter((d) => statusFilter.has(d.status));
    if (surfaceFilter.size) rows = rows.filter((d) => surfaceFilter.has(d.surface));
    if (kindFilter.size) rows = rows.filter((d) => kindFilter.has(d.kind));
    const cutoff = dateRangeCutoff(dateRange);
    if (cutoff != null) rows = rows.filter((d) => new Date(d.created_at).getTime() >= cutoff);
    return [...rows].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortDir === "desc" ? tb - ta : ta - tb;
    });
  }, [drafts, search, clientFilter, statusFilter, surfaceFilter, kindFilter, dateRange, sortDir, clientNameById]);

  const activeFilterCount =
    clientFilter.size + statusFilter.size + surfaceFilter.size + kindFilter.size +
    (dateRange !== "all" ? 1 : 0) + (search.trim() ? 1 : 0);

  /* Bulk select — only approved, not-yet-published RankFlow articles. */
  function canSelect(d: ContentDraftRow): boolean {
    return (
      d.status === "approved" &&
      d.kind === "article" &&
      d.surface === "rankflow" &&
      !(d.metadata?.wordpress?.post_url && d.metadata?.wordpress?.post_id)
    );
  }
  const selectableVisible = filtered.filter(canSelect);
  const allVisibleSelected =
    selectableVisible.length > 0 && selectableVisible.every((d) => selectedIds.has(d.id));
  const someVisibleSelected = selectableVisible.some((d) => selectedIds.has(d.id));

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) selectableVisible.forEach((d) => next.delete(d.id));
      else selectableVisible.forEach((d) => next.add(d.id));
      return next;
    });
  }

  const openDrawer = (id: number) => {
    setDrawerDraftId(id);
    setDrawerOpen(true);
  };

  /* The search + bulk-action + refresh row lift into the shell's
   * filtersBar so layout stays consistent with the other product pages. */
  const filtersBar = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search posts or clients…"
          className="h-8 w-44 pl-8 text-sm sm:w-56"
          data-testid="contentflow-search"
        />
      </div>
      <div className="flex items-center gap-2">
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5">
            <span className="text-xs font-medium text-indigo-900">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              onClick={() => bulkQueueMutation.mutate()}
              disabled={bulkQueueMutation.isPending}
              className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700"
              data-testid="bulk-queue-publish-btn"
            >
              {bulkQueueMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Queue for Publish
            </Button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-indigo-700 hover:underline"
            >
              Clear
            </button>
          </div>
        )}
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
          <RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    </div>
  );

  function ListView() {
    return (
      <div className="space-y-4">
        {/* W-AM-2: video script-without-video banner */}
        {videoScriptCount > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            <Video className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
            <div className="text-sm">
              <span className="font-medium">Video generation is currently disabled.</span>{" "}
              {videoScriptCount} script draft{videoScriptCount === 1 ? "" : "s"} will not auto-produce video
              output until the script/output mismatch (3–5 min script vs 5-sec B-roll) is resolved and
              <code className="mx-1 rounded bg-amber-100 px-1 text-[11px]">VIDEO_GENERATION_ENABLED</code>
              is flipped back on.
            </div>
          </div>
        )}

        <Card className="overflow-hidden">
          <TooltipProvider>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`w-8 ${TD_DIVIDER}`}>
                      <Checkbox
                        checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAll}
                        disabled={selectableVisible.length === 0}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className={`w-16 ${TD_DIVIDER}`}>ID</TableHead>
                    <TableHead className={`min-w-[160px] ${TD_DIVIDER}`}>
                      <HeaderFilterDropdown
                        label="Client"
                        searchable
                        options={clientOptions}
                        selected={clientFilter}
                        onChange={setClientFilter}
                      />
                    </TableHead>
                    <TableHead className={TD_DIVIDER}>
                      <HeaderFilterDropdown
                        label="Source"
                        options={surfaceOptions}
                        selected={surfaceFilter}
                        onChange={setSurfaceFilter}
                      />
                    </TableHead>
                    <TableHead className={TD_DIVIDER}>
                      <HeaderFilterDropdown
                        label="Kind"
                        options={kindOptions}
                        selected={kindFilter}
                        onChange={setKindFilter}
                      />
                    </TableHead>
                    <TableHead className={TD_DIVIDER}>
                      <HeaderFilterDropdown
                        label="Status"
                        options={statusOptions}
                        selected={statusFilter}
                        onChange={setStatusFilter}
                      />
                    </TableHead>
                    <TableHead className={`w-28 ${TD_DIVIDER}`}>Publish</TableHead>
                    <TableHead className={`w-24 ${TD_DIVIDER}`}>Quality</TableHead>
                    <TableHead className="w-36">
                      <CreatedHeader
                        sortDir={sortDir}
                        onSort={setSortDir}
                        dateRange={dateRange}
                        onDateRange={setDateRange}
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <>
                      {[0, 1, 2, 3].map((i) => (
                        <TableRow key={`s-${i}`}>
                          {Array.from({ length: 9 }).map((_, j) => (
                            <TableCell key={j} className={j < 8 ? TD_DIVIDER : ""}>
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

                  {!isLoading && !isError && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9}>
                        <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
                          <Inbox className="h-8 w-8 opacity-50" />
                          <div>
                            {drafts.length === 0
                              ? "No drafts yet."
                              : "No drafts match the current filters."}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                  {!isLoading && filtered.map((d) => {
                    const queueBadge = deriveQueueBadge(d);
                    const selectable = canSelect(d);
                    const src = metaFor(SOURCE_META, d.surface);
                    const kind = metaFor(KIND_META, d.kind);
                    const plat = d.target_platform ? metaFor(PLATFORM_META, d.target_platform) : null;
                    return (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDrawer(d.id)}
                        data-testid={`contentflow-row-${d.id}`}
                      >
                        <TableCell className={TD_DIVIDER} onClick={(e) => e.stopPropagation()}>
                          {selectable && (
                            <Checkbox
                              checked={selectedIds.has(d.id)}
                              onCheckedChange={() => toggleSelected(d.id)}
                              aria-label={`Select draft ${d.id}`}
                              data-testid={`select-row-${d.id}`}
                            />
                          )}
                        </TableCell>
                        <TableCell className={`font-mono text-xs ${TD_DIVIDER}`}>#{d.id}</TableCell>
                        <TableCell className={TD_DIVIDER}>
                          <div className="text-sm font-medium">
                            {clientNameById.get(d.client_id) || `Client #${d.client_id}`}
                          </div>
                          {d.title && (
                            <div className="line-clamp-1 max-w-[260px] text-xs text-muted-foreground">
                              {d.title}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className={TD_DIVIDER}>
                          <div className="flex items-center gap-1.5">
                            <IconTip icon={src.icon} label={src.label} />
                            <span className="text-xs">{src.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className={TD_DIVIDER}>
                          <div className="flex items-center gap-1.5">
                            <IconTip icon={kind.icon} label={kind.label} />
                            <span className="text-xs">{kind.label}</span>
                            {plat && <IconTip icon={plat.icon} label={plat.label} />}
                          </div>
                        </TableCell>
                        <TableCell className={TD_DIVIDER}>
                          <Badge
                            variant="outline"
                            className={CONTENT_DRAFT_STATUS_STYLES[d.status] || "bg-gray-100 text-gray-600"}
                          >
                            {statusLabel(CONTENT_DRAFT_STATUS_LABELS, d.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className={TD_DIVIDER}>
                          {queueBadge ? (
                            <Badge variant="outline" className={`text-xs ${queueBadge.className}`}>
                              {queueBadge.label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className={TD_DIVIDER}>
                          {typeof d.quality_score === "number" ? (
                            <span
                              className={`font-mono text-xs ${
                                d.quality_score >= 70
                                  ? "text-emerald-700"
                                  : d.quality_score >= 40
                                  ? "text-amber-700"
                                  : "text-red-700"
                              }`}
                            >
                              {d.quality_score}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="text-xs text-muted-foreground"
                          title={new Date(d.created_at).toLocaleString()}
                        >
                          {formatRelative(d.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>

          {!isLoading && (
            <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
              <span>
                {filtered.length} {filtered.length === 1 ? "draft" : "drafts"}
                {activeFilterCount > 0 && drafts.length !== filtered.length && (
                  <span className="text-muted-foreground/70"> of {drafts.length}</span>
                )}
              </span>
              {drafts.length >= 200 && (
                <span className="italic">showing the 200 most recent drafts</span>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <AdminLayout>
      <AdminProductPageShell
        productId={PRODUCT_ID}
        productName="ContentFlow"
        isActive={live?.is_active ?? true}
        hidden={live?.hidden ?? false}
        stats={productStats ?? null}
        filtersBar={filtersBar}
        tabs={[
          { id: "list", label: "List", render: () => <ListView /> },
          { id: "calendar", label: "Calendar", render: () => <ContentCalendarView drafts={filtered} isLoading={isLoading} onSelectDraft={openDrawer} /> },
          { id: "settings", label: "Settings", render: () => <ContentFlowSettingsPanel /> },
        ]}
        onToggleActive={(next) => activeToggle.mutate(next)}
        onToggleHidden={(next) => hiddenToggle.mutate(next)}
      />

      <ContentFlowDraftDrawer
        draftId={drawerDraftId}
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) {
            qc.invalidateQueries({ queryKey: ["/api/admin/contentflow/queue"] });
          }
        }}
      />
    </AdminLayout>
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

  const todayKey = dateKey(today);

  const cells: Array<{ date: Date; key: string; inMonth: boolean }> = [];
  const prevMonthDays = getDaysInMonth(year, month === 0 ? 11 : month - 1);
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    cells.push({ date: d, key: dateKey(d), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    cells.push({ date: d, key: dateKey(d), inMonth: true });
  }
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
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-4 flex items-center justify-between">
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

        <div className="mb-1 grid grid-cols-7 gap-px">
          {dayNames.map((name) => (
            <div key={name} className="py-1 text-center text-[10px] font-medium text-muted-foreground">
              {name}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-gray-100">
          {cells.map((cell) => {
            const dayDrafts = draftsByDate.get(cell.key) ?? [];
            const isToday = cell.key === todayKey;
            const isSelected = cell.key === selectedDay;
            const publishedCount = dayDrafts.filter((d) => d.status === "published").length;
            const queuedCount = dayDrafts.filter((d) => d.status === "approved" || d.metadata?.wordpress?.queue_status === "queued").length;
            const failedCount = dayDrafts.filter((d) => d.status === "failed" || d.metadata?.wordpress?.queue_status === "failed").length;
            const draftCount = dayDrafts.filter((d) => d.status === "draft").length;

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
                <div
                  className={`mb-0.5 text-xs ${
                    isToday ? "font-bold text-blue-600" : cell.inMonth ? "text-gray-700" : "text-gray-400"
                  }`}
                >
                  {cell.date.getDate()}
                </div>

                {dayDrafts.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap gap-0.5">
                      {publishedCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {publishedCount}
                        </span>
                      )}
                      {queuedCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                          {queuedCount}
                        </span>
                      )}
                      {failedCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-red-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          {failedCount}
                        </span>
                      )}
                      {draftCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-gray-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          {draftCount}
                        </span>
                      )}
                    </div>
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

        <div className="mt-3 flex gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Published</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Queued</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Failed</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-400" /> Draft</span>
        </div>
      </Card>

      {selectedDay && (
        <Card className="p-4">
          <h4 className="mb-3 text-sm font-semibold">
            {new Date(selectedDay + "T00:00:00").toLocaleDateString("default", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            <Badge variant="outline" className="ml-2 text-[10px]">
              {selectedDrafts.length} {selectedDrafts.length === 1 ? "draft" : "drafts"}
            </Badge>
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
                  className="flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-muted/40"
                  onClick={() => onSelectDraft(d.id)}
                >
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[d.status] || "bg-gray-400"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{d.title || `Draft #${d.id}`}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {d.kind.replace(/_/g, " ")}
                      {d.target_platform && <> / {d.target_platform}</>}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`flex-shrink-0 text-[10px] ${CONTENT_DRAFT_STATUS_STYLES[d.status] || "bg-gray-100"}`}
                  >
                    {statusLabel(CONTENT_DRAFT_STATUS_LABELS, d.status)}
                  </Badge>
                  {queueBadge && (
                    <Badge variant="outline" className={`flex-shrink-0 text-[10px] ${queueBadge.className}`}>
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
