import { usePageTitle } from "@/hooks/usePageTitle";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import ListSearchAndFilters from "@/components/admin/ListSearchAndFilters";
import { useListUrlState } from "@/components/admin/useListUrlState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Download, Tag as TagIcon, Archive, UserCheck, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { csvDownload, todayIso } from "@/lib/csvDownload";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Client {
  id: number;
  user_id: number | null;
  business_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  trade_type: string | null;
  status: string;
  source: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  lead: "bg-gray-100 text-gray-700",
  onboarding: "bg-amber-50 text-amber-700",
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-blue-50 text-blue-700",
  churned: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span data-theme="light" className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

export default function ClientsPage() {
  usePageTitle("Clients");
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  /* URL-persisted search + filter chips. `status` drives the existing
   * server-side query (single-select). `source` is a client-side
   * overlay applied on the fetched page. */
  const { search: urlSearch, filters: urlFilters, setSearch: setUrlSearch, setFilters: setUrlFilters } =
    useListUrlState(["status", "source", "sort", "dir"]);
  const search = urlSearch;
  const setSearch = setUrlSearch;
  const statusFilter = urlFilters.status?.[0] ?? "all";
  const setStatusFilter = (v: string) => {
    const next = { ...urlFilters };
    if (v === "all") delete next.status;
    else next.status = [v];
    setUrlFilters(next);
  };
  /* Sort state — persisted to URL via the same hook so refresh / shared
   * links restore the operator's column order. Default: most recently
   * created at the top. */
  type SortKey = "business_name" | "status" | "trade_type" | "source" | "created_at";
  const SORT_KEYS: SortKey[] = ["business_name", "status", "trade_type", "source", "created_at"];
  const rawSort = urlFilters.sort?.[0];
  const sortKey: SortKey = (SORT_KEYS as string[]).includes(rawSort ?? "")
    ? (rawSort as SortKey)
    : "created_at";
  const sortDir: "asc" | "desc" = urlFilters.dir?.[0] === "asc" ? "asc" : "desc";
  const toggleSort = (key: SortKey) => {
    const next = { ...urlFilters };
    if (sortKey === key) {
      next.dir = [sortDir === "asc" ? "desc" : "asc"];
    } else {
      next.sort = [key];
      next.dir = ["asc"];
    }
    setUrlFilters(next);
  };
  const [showAdd, setShowAdd] = useState(false);
  /** Set of selected client ids — drives the bulk-action toolbar.
   *  Cleared whenever the underlying list refetches (filters change /
   *  bulk action completes) so we never act on stale selections. */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  /** Bulk-tag dialog state. When `tagDialog` is true the user is
   *  typing a tag value; submit POSTs /api/admin/crm/clients/bulk-tag
   *  with the current selection. */
  const [tagDialog, setTagDialog] = useState(false);
  const [tagValue, setTagValue] = useState("");
  /** Bulk-archive confirm. Archive is terminal (sets status=archived
   *  and removes the row from default views) so we surface an
   *  AlertDialog rather than firing immediately. */
  const [archiveDialog, setArchiveDialog] = useState(false);
  /** Per-row impersonation confirm. */
  const [impersonateTarget, setImpersonateTarget] = useState<Client | null>(null);
  const [form, setForm] = useState({
    business_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    trade_type: "",
    status: "lead",
    source: "manual",
  });

  const { data, isLoading } = useQuery<{ data: Client[]; total: number }>({
    queryKey: ["/api/admin/crm/clients", { search, status: statusFilter === "all" ? undefined : statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/crm/clients?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/admin/crm/clients", data);
      return res.json();
    },
    onSuccess: (data: { id: number; business_name: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
      const name = form.business_name;
      setShowAdd(false);
      setForm({ business_name: "", contact_name: "", contact_email: "", contact_phone: "", trade_type: "", status: "lead", source: "manual" });
      toast({ title: "Client created", description: name });
      navigate(`/admin/crm/clients/${data.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create client", description: err.message, variant: "destructive" });
    },
  });

  /* ─── Bulk action — fires N parallel PATCHes against the existing
   *   /api/admin/crm/clients/:id endpoint so we don't need a new bulk
   *   route. The result toast shows partial success: "12 updated, 1
   *   failed" rather than aborting on the first failure. */
  const runBulkUpdate = async (label: string, updates: Record<string, string>) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkRunning) return;
    setBulkRunning(true);
    const results = await Promise.allSettled(
      ids.map((id) => apiRequest("PATCH", `/api/admin/crm/clients/${id}`, updates)),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;
    if (failed === 0) {
      toast({ title: `${ok} client${ok === 1 ? "" : "s"} ${label}` });
    } else {
      toast({
        title: `${ok} updated, ${failed} failed`,
        description: "Refresh and retry the failed rows individually.",
        variant: failed > ok ? "destructive" : undefined,
      });
    }
    setBulkRunning(false);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/clients"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
  };

  /* ─── Bulk endpoints (server-side) ───
   *
   * The Activate/Pause/Mark-churned buttons above use the per-row
   * PATCH endpoint in parallel — fine for status flips. Tag, Archive
   * and Export need a single server-side action (tag idempotency,
   * archive audit grouping, server-rendered CSV) so they POST to the
   * new bulk endpoints in adminCrmRoutes.ts. */
  const submitBulkTag = async () => {
    const ids = Array.from(selectedIds);
    const tag = tagValue.trim();
    if (ids.length === 0 || !tag || bulkRunning) return;
    setBulkRunning(true);
    try {
      const res = await apiRequest("POST", "/api/admin/crm/clients/bulk-tag", { ids, tag });
      const body = await res.json();
      toast({ title: `Tagged ${body.ok} client${body.ok === 1 ? "" : "s"}`, description: body.failed ? `${body.failed} failed` : undefined });
      setTagDialog(false);
      setTagValue("");
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/clients"] });
    } catch (err) {
      toast({ title: "Bulk tag failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBulkRunning(false);
    }
  };

  const submitBulkArchive = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkRunning) return;
    setBulkRunning(true);
    try {
      const res = await apiRequest("POST", "/api/admin/crm/clients/bulk-archive", { ids });
      const body = await res.json();
      toast({ title: `Archived ${body.ok} client${body.ok === 1 ? "" : "s"}`, description: body.failed ? `${body.failed} failed` : undefined });
      setArchiveDialog(false);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
    } catch (err) {
      toast({ title: "Bulk archive failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBulkRunning(false);
    }
  };

  /** Bulk CSV export. POSTs the explicit id list to the server so the
   *  download reflects exactly the user's selection — no row drift. */
  const submitBulkExport = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkRunning) return;
    setBulkRunning(true);
    try {
      const res = await fetch("/api/admin/crm/clients/export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clients-${todayIso()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${ids.length} client${ids.length === 1 ? "" : "s"}` });
    } catch (err) {
      toast({ title: "Export failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBulkRunning(false);
    }
  };

  /** Start an impersonation for a single client's linked user. We pass
   *  the user_id (not the client_id) because impersonation operates on
   *  the auth-user identity, not the CRM record. After success we
   *  navigate to the redirect URL the server returns (typically /portal)
   *  and force a reload so the impersonation middleware applies on the
   *  next request. */
  const impersonate = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${userId}`, { reason: "View as customer from /admin/crm/clients" });
      return res.json();
    },
    onSuccess: (data: { redirect?: string }) => {
      toast({ title: "Impersonation started" });
      queryClient.clear();
      const redirect = data.redirect || "/portal";
      window.location.assign(redirect);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't start impersonation", description: err.message, variant: "destructive" });
    },
  });

  /* Reset the selection whenever filters change so the toolbar's
   * count never reflects rows that aren't visible. */
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, statusFilter]);

  // Client-side overlay filter on top of server response (currently:
  // `source` chip group). Server already narrows by search + status.
  const sourceFilter = urlFilters.source ?? [];
  const visibleRows = useMemo(() => {
    const rows = data?.data ?? [];
    const filtered = sourceFilter.length === 0
      ? rows
      : rows.filter((c) => sourceFilter.includes(c.source ?? "unknown"));
    // Stable client-side sort. Comparator coerces nullish to empty
    // string so unsorted-at-end rather than crashing on null.
    const dirMul = sortDir === "asc" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const av = (a[sortKey] ?? "") as string | number;
      const bv = (b[sortKey] ?? "") as string | number;
      if (sortKey === "created_at") {
        return (new Date(av as string).getTime() - new Date(bv as string).getTime()) * dirMul;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return -1 * dirMul;
      if (as > bs) return 1 * dirMul;
      return 0;
    });
    return sorted;
  }, [data?.data, sourceFilter, sortKey, sortDir]);

  // Build a count map for source chips off the raw page rows.
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of data?.data ?? []) {
      const s = c.source ?? "unknown";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [data?.data]);

  const allVisibleIds = visibleRows.map((c) => c.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allVisibleIds));
  };
  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <AdminLayout pageContext={{
      page: "clients",
      totalClients: data?.total,
      activeFilters: statusFilter !== "all" ? statusFilter : undefined,
    }}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Clients</h2>
            <p className="text-sm text-gray-500">{data?.total ?? 0} total</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!data?.data?.length) return;
                csvDownload<Client>({
                  filename: `clients-${todayIso()}.csv`,
                  columns: [
                    { header: "id", value: (c) => c.id },
                    { header: "business_name", value: (c) => c.business_name },
                    { header: "contact_name", value: (c) => c.contact_name },
                    { header: "contact_email", value: (c) => c.contact_email },
                    { header: "contact_phone", value: (c) => c.contact_phone },
                    { header: "trade_type", value: (c) => c.trade_type },
                    { header: "status", value: (c) => c.status },
                    { header: "source", value: (c) => c.source },
                    { header: "created_at", value: (c) => c.created_at },
                  ],
                  rows: data.data,
                });
              }}
              disabled={!data?.data?.length}
              className="min-h-[36px]"
            >
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)} className="bg-brand-blue hover:bg-brand-blue-600 min-h-[36px]">
              <Plus className="w-4 h-4 mr-1" /> Add Client
            </Button>
          </div>
        </div>

        {/* Unified search + filter chips. Status drives the server query;
            Source filters the in-memory page. URL-persisted. */}
        <ListSearchAndFilters
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by name, email, phone…"
          activeFilters={urlFilters}
          onFiltersChange={(next) => {
            // Status is single-select on the server; trim any extras.
            // Preserve sort/dir which aren't owned by the chip UI.
            const trimmed = { ...next };
            if (trimmed.status && trimmed.status.length > 1) {
              trimmed.status = [trimmed.status[trimmed.status.length - 1]];
            }
            if (urlFilters.sort) trimmed.sort = urlFilters.sort;
            if (urlFilters.dir) trimmed.dir = urlFilters.dir;
            setUrlFilters(trimmed);
          }}
          filterGroups={[
            {
              id: "status",
              label: "Status",
              multi: false,
              options: [
                { value: "lead", label: "Lead" },
                { value: "onboarding", label: "Onboarding" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                { value: "churned", label: "Churned" },
              ],
            },
            {
              id: "source",
              label: "Source",
              options: Object.entries(sourceCounts).map(([value, count]) => ({
                value,
                label: value.charAt(0).toUpperCase() + value.slice(1),
                count,
              })),
            },
          ]}
        />


        {/* Bulk-action toolbar — only renders when at least one row
            is selected. Shadows when the user scrolls so it stays
            visually anchored to the table header. */}
        {selectedIds.size > 0 && (
          <div className="bg-[#0F1F12] text-white rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => runBulkUpdate("activated", { status: "active" })}
                disabled={bulkRunning}
                className="px-3 py-1.5 text-xs font-medium bg-emerald-500 text-white rounded-md hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                Activate
              </button>
              <button
                onClick={() => runBulkUpdate("paused", { status: "paused" })}
                disabled={bulkRunning}
                className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                Pause
              </button>
              <button
                onClick={() => runBulkUpdate("marked as churned", { status: "churned" })}
                disabled={bulkRunning}
                className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                Mark churned
              </button>
              {/* New bulk actions — tag / export / archive. Tag opens
                  a dialog so the user can name the tag. Export streams
                  a server-rendered CSV. Archive opens an AlertDialog
                  confirm because the action is terminal. */}
              <button
                onClick={() => { setTagValue(""); setTagDialog(true); }}
                disabled={bulkRunning}
                className="px-3 py-1.5 text-xs font-medium bg-white/10 text-white rounded-md hover:bg-white/15 disabled:opacity-50 transition-colors inline-flex items-center gap-1"
              >
                <TagIcon className="w-3 h-3" /> Tag
              </button>
              <button
                onClick={submitBulkExport}
                disabled={bulkRunning}
                className="px-3 py-1.5 text-xs font-medium bg-white/10 text-white rounded-md hover:bg-white/15 disabled:opacity-50 transition-colors inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> Export CSV
              </button>
              <button
                onClick={() => setArchiveDialog(true)}
                disabled={bulkRunning}
                className="px-3 py-1.5 text-xs font-medium bg-white/10 text-white rounded-md hover:bg-white/15 disabled:opacity-50 transition-colors inline-flex items-center gap-1"
              >
                <Archive className="w-3 h-3" /> Archive
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkRunning}
                className="px-3 py-1.5 text-xs font-medium bg-white/10 text-white rounded-md hover:bg-white/15 disabled:opacity-50 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all visible"
                    className="cursor-pointer"
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Business" sortKey="business_name" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                </TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="hidden lg:table-cell">
                  <SortableHeader label="Trade" sortKey="trade_type" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <SortableHeader label="Source" sortKey="source" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                </TableHead>
                <TableHead className="hidden xl:table-cell">
                  <SortableHeader label="Added" sortKey="created_at" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
                </TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-7 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    {search || sourceFilter.length > 0 || statusFilter !== "all" ? (
                      "No clients match your search or filters."
                    ) : (
                      <>No clients yet. <button type="button" onClick={() => setShowAdd(true)} className="underline text-[var(--brand-blue,#0d3cfc)]">Add Client</button> to create your first one.</>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((client) => (
                  /* Entire row is a clickable surface that navigates to the
                   * client's profile. Checkbox + Actions cells stop
                   * propagation so toggling/impersonating doesn't trigger
                   * navigation. role=button + keyboard (Enter/Space) keeps
                   * the row accessible for non-mouse users. */
                  <TableRow
                    key={client.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${client.business_name}`}
                    onClick={() => navigate(`/admin/crm/clients/${client.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/admin/crm/clients/${client.id}`);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-brand-blue/40"
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(client.id)}
                        onChange={() => toggleOne(client.id)}
                        aria-label={`Select ${client.business_name}`}
                        className="cursor-pointer"
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-gray-900">
                        {client.business_name}
                      </span>
                      <p className="text-xs text-gray-500 md:hidden">{client.contact_email}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="text-sm text-gray-700">{client.contact_name || "-"}</div>
                      <div className="text-xs text-gray-500">{client.contact_email || ""}</div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm text-gray-600 capitalize">{client.trade_type || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={client.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-xs text-gray-500 capitalize">{client.source || "-"}</span>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className="text-xs text-gray-500">
                        {client.created_at
                          ? new Date(client.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                          : "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {/* "View as customer" — only shown when the client
                          row has a linked portal user (user_id != null).
                          Disabled rows without a linked user. */}
                      {client.user_id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setImpersonateTarget(client)}
                          disabled={impersonate.isPending}
                        >
                          <UserCheck className="w-3 h-3 mr-1" /> View as
                        </Button>
                      ) : (
                        <span className="text-[11px] text-gray-400" title="No linked portal user">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Add client dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Business Name *</label>
                  <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Contact Name</label>
                    <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Phone</label>
                    <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Email</label>
                  <Input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Trade Type</label>
                    <Input value={form.trade_type} onChange={(e) => setForm({ ...form, trade_type: e.target.value })} placeholder="e.g. plumber" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Status</label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="onboarding">Onboarding</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={!form.business_name || createMutation.isPending}
                  className="bg-brand-blue hover:bg-brand-blue-600"
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Bulk-tag dialog */}
        <Dialog open={tagDialog} onOpenChange={setTagDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Tag {selectedIds.size} client{selectedIds.size === 1 ? "" : "s"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); submitBulkTag(); }}>
              <label className="text-xs font-medium text-gray-600 block mb-1">Tag name</label>
              <Input
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                placeholder="e.g. priority, q3-launch"
                autoFocus
                maxLength={64}
              />
              <p className="text-xs text-gray-500 mt-2">
                Created on the fly if it doesn't exist. Existing tags on each client are preserved.
              </p>
              <DialogFooter className="mt-4">
                <Button variant="outline" type="button" onClick={() => setTagDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={!tagValue.trim() || bulkRunning} className="btn-primary-premium">
                  {bulkRunning ? "Applying…" : "Apply tag"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Bulk-archive confirm */}
        <AlertDialog open={archiveDialog} onOpenChange={setArchiveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive {selectedIds.size} client{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
              <AlertDialogDescription>
                Archived clients are hidden from the default Clients view. They can be restored by an admin
                directly editing the status. No data is deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkRunning}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={submitBulkArchive} disabled={bulkRunning}>
                {bulkRunning ? "Archiving…" : "Archive"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* "View as customer" per-row confirm */}
        <AlertDialog
          open={impersonateTarget !== null}
          onOpenChange={(open) => { if (!open) setImpersonateTarget(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Open the portal as {impersonateTarget?.business_name}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Every action will be logged and visible to them as if they did it. This will end your current
                admin session and restore it when you click <strong>Stop</strong> in the banner at the top of
                the page. Auto-expires after 60 minutes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={impersonate.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="btn-primary-premium"
                disabled={impersonate.isPending}
                onClick={() => {
                  if (impersonateTarget?.user_id) {
                    impersonate.mutate(impersonateTarget.user_id);
                  }
                }}
              >
                {impersonate.isPending ? "Starting…" : "View as customer"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}

/* Column header that toggles sort direction on click. Active column
 * shows a directional arrow; inactive columns show a neutral up/down
 * affordance so the user knows the column is sortable. */
function SortableHeader<K extends string>({
  label, sortKey, activeKey, dir, onToggle,
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  dir: "asc" | "desc";
  onToggle: (key: K) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      aria-label={`Sort by ${label}${active ? ` (${dir})` : ""}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider transition-colors ${
        active ? "text-gray-900" : "text-gray-500"
      } hover:text-gray-900`}
    >
      {label}
      <Icon className={`w-3 h-3 ${active ? "" : "opacity-60"}`} />
    </button>
  );
}
