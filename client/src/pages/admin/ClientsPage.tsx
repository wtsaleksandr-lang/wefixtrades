import { usePageTitle } from "@/hooks/usePageTitle";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
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
import { Plus, Search, Download } from "lucide-react";
import { csvDownload, todayIso } from "@/lib/csvDownload";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Client {
  id: number;
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  /** Set of selected client ids — drives the bulk-action toolbar.
   *  Cleared whenever the underlying list refetches (filters change /
   *  bulk action completes) so we never act on stale selections. */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
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

  /* Reset the selection whenever filters change so the toolbar's
   * count never reflects rows that aren't visible. */
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, statusFilter]);

  const allVisibleIds = (data?.data ?? []).map((c) => c.id);
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
      <div className="max-w-6xl mx-auto space-y-4">
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
            <Button size="sm" onClick={() => setShowAdd(true)} className="bg-[#0d3cfc] hover:bg-[#0b34d6] min-h-[36px]">
              <Plus className="w-4 h-4 mr-1" /> Add Client
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="onboarding">Onboarding</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="churned">Churned</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
                <TableHead>Business</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="hidden lg:table-cell">Trade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Source</TableHead>
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
                  </TableRow>
                ))
              ) : data?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    {search ? (
                      "No clients match your search."
                    ) : (
                      <>No clients yet. <button type="button" onClick={() => setShowAdd(true)} className="underline text-[var(--brand-blue,#0d3cfc)]">Add Client</button> to create your first one.</>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                data?.data.map((client) => (
                  <TableRow key={client.id} className="cursor-pointer hover:bg-gray-50">
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
                      <Link href={`/admin/crm/clients/${client.id}`}>
                        <span className="font-medium text-gray-900 hover:text-[#0d3cfc]">
                          {client.business_name}
                        </span>
                      </Link>
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
                  className="bg-[#0d3cfc] hover:bg-[#0b34d6]"
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
