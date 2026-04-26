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
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, Filter as FilterIcon, Inbox } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  CONTENT_DRAFT_STATUS_LABELS,
  CONTENT_DRAFT_STATUS_STYLES,
  statusLabel,
} from "@/config/portalLabels";
import ContentFlowDraftDrawer from "@/components/contentflow/ContentFlowDraftDrawer";

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

  const [clientFilter, setClientFilter] = useState<string>(ANY);
  const [statusFilter, setStatusFilter] = useState<string>(ANY);
  const [surfaceFilter, setSurfaceFilter] = useState<string>(ANY);
  const [kindFilter, setKindFilter] = useState<string>(ANY);

  const [drawerDraftId, setDrawerDraftId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

        {/* Filters */}
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

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead className="min-w-[160px]">Client</TableHead>
                  <TableHead>Surface</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Quality</TableHead>
                  <TableHead className="w-32">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <>
                    {[0, 1, 2, 3].map((i) => (
                      <TableRow key={`s-${i}`}>
                        {Array.from({ length: 7 }).map((_, j) => (
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
                    <TableCell colSpan={7}>
                      <div className="py-8 text-center text-sm text-red-700">
                        Failed to load queue: {(error as any)?.message || "unknown error"}
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && !isError && drafts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <div className="py-12 flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <Inbox className="h-8 w-8 opacity-50" />
                        <div>No drafts match the current filters.</div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && drafts.map((d) => (
                  <TableRow
                    key={d.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDrawer(d.id)}
                    data-testid={`contentflow-row-${d.id}`}
                  >
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
                ))}
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
        </Card>
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
