/**
 * Admin view of all tradeline phone-number setup wizards in progress.
 * Lists rows, surfaces KPIs, and exposes admin-only nudge actions:
 *   - Retry queued provisioning (mode='new', status='queued')
 *   - Mark port_status manually (mode='port') while Twilio porting API isn't wired
 *
 * Mounted at /admin/crm/tradeline-setups (RequirePortal, admin-only).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import AdminLayout from "@/components/admin/AdminLayout";
import { ProductSettingsMenu } from "@/components/admin/AdminProductPageShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Phone, RefreshCw, ExternalLink, CheckCircle2, XCircle, Clock, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ListRow {
  id: number;
  client_id: number;
  mode: "new" | "forward" | "port" | null;
  last_step: string | null;
  provisioning_status: string | null;
  assigned_number: string | null;
  customer_number: string | null;
  carrier: string | null;
  forwarding_verified_at: string | null;
  port_status: string | null;
  started_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
  client_business_name: string;
  client_contact_email: string | null;
}

interface ListResponse {
  rows: ListRow[];
  total: number;
  limit: number;
  offset: number;
}

interface Stats {
  total: number;
  completed: number;
  abandoned: number;
  queued: number;
  byMode: Record<string, number>;
  byPortStatus: Record<string, number>;
}

const MODE_LABEL: Record<string, string> = {
  new: "New number",
  forward: "Forward existing",
  port: "Port existing",
};

const MODE_TONE: Record<string, string> = {
  new: "bg-emerald-100 text-emerald-800",
  forward: "bg-blue-100 text-blue-800",
  port: "bg-amber-100 text-amber-800",
};

export default function TradelineSetupsPage() {
  usePageTitle("TradeLine setups");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<string>("all");
  const [completed, setCompleted] = useState<"all" | "yes" | "no">("all");
  const [detailId, setDetailId] = useState<number | null>(null);

  const stats = useQuery<Stats>({
    queryKey: ["/api/admin/tradeline-setups/stats"],
    queryFn: () => apiRequest("GET", "/api/admin/tradeline-setups/stats").then((r) => r.json()),
  });

  const list = useQuery<ListResponse>({
    queryKey: ["/api/admin/tradeline-setups", mode, completed],
    queryFn: () => {
      const params = new URLSearchParams();
      if (mode !== "all") params.set("mode", mode);
      if (completed !== "all") params.set("completed", completed);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return apiRequest("GET", `/api/admin/tradeline-setups${qs}`).then((r) => r.json());
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Phone className="w-6 h-6 text-brand-blue-600" />
              TradeLine setups
            </h1>
            <p className="text-sm text-gray-600 mt-0.5">
              Customer phone-number setup wizards (new / forward / port).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/portal/tradeline/setup"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-brand-blue-600 hover:text-brand-blue-700"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open customer view in new tab
            </a>
            <ProductSettingsMenu productId="tradeline" productName="TradeLine" />
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total wizards" value={stats.data?.total} loading={stats.isLoading} />
          <StatCard label="Completed" value={stats.data?.completed} loading={stats.isLoading} tone="emerald" />
          <StatCard label="Queued" value={stats.data?.queued} loading={stats.isLoading} tone="amber" />
          <StatCard label="Abandoned" value={stats.data?.abandoned} loading={stats.isLoading} tone="rose" />
        </div>

        {/* By-mode breakdown */}
        {stats.data && (
          <div className="grid grid-cols-3 gap-3 text-sm">
            {(["new", "forward", "port"] as const).map((m) => (
              <div key={m} className={`rounded-lg p-3 ${MODE_TONE[m]}`}>
                <p className="text-xs uppercase tracking-wide font-semibold opacity-80">{MODE_LABEL[m]}</p>
                <p className="text-2xl font-bold">{stats.data.byMode?.[m] ?? 0}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <FilterSelect label="Mode" value={mode} onChange={setMode} options={[
            { value: "all", label: "All modes" },
            { value: "new", label: "New number" },
            { value: "forward", label: "Forward existing" },
            { value: "port", label: "Port existing" },
          ]} />
          <FilterSelect label="Completed" value={completed} onChange={(v) => setCompleted(v as any)} options={[
            { value: "all", label: "All" },
            { value: "yes", label: "Completed" },
            { value: "no", label: "In progress" },
          ]} />
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {list.isLoading && (
            <div className="p-6 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {list.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last step</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-12">
                      No setup wizards match the filters yet.
                    </TableCell>
                  </TableRow>
                )}
                {list.data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900">{r.client_business_name}</p>
                        {r.client_contact_email && (
                          <p className="text-xs text-gray-500">{r.client_contact_email}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.mode ? (
                        <Badge className={MODE_TONE[r.mode]} variant="outline">
                          {MODE_LABEL[r.mode]}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusCell row={r} />
                    </TableCell>
                    <TableCell className="text-xs text-gray-600">
                      {r.last_step || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 whitespace-nowrap">
                      {formatDate(r.started_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailId(r.id)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {list.data && list.data.total > list.data.rows.length && (
          <p className="text-xs text-gray-500 text-center">
            Showing {list.data.rows.length} of {list.data.total}. Pagination controls coming in a follow-up.
          </p>
        )}
      </div>

      {detailId !== null && (
        <DetailDialog
          id={detailId}
          onClose={() => setDetailId(null)}
          onMutate={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/tradeline-setups"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/tradeline-setups/stats"] });
            toast({ title: "Updated" });
          }}
        />
      )}
    </AdminLayout>
  );
}

function StatCard({
  label,
  value,
  loading,
  tone = "default",
}: {
  label: string;
  value?: number;
  loading?: boolean;
  tone?: "default" | "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald" ? "text-emerald-700" :
    tone === "amber" ? "text-amber-700" :
    tone === "rose" ? "text-rose-700" :
    "text-gray-900";
  return (
    <Card className="p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{label}</p>
      {loading ? (
        <Skeleton className="h-7 w-12 mt-1" />
      ) : (
        <p className={`text-2xl font-bold ${toneClass}`}>{value ?? 0}</p>
      )}
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1 block">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-48">
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

function StatusCell({ row }: { row: ListRow }) {
  if (row.completed_at) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Completed
      </span>
    );
  }
  if (row.abandoned_at) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rose-700">
        <XCircle className="w-3.5 h-3.5" />
        Abandoned
      </span>
    );
  }
  if (row.mode === "new" && row.provisioning_status === "queued") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
        <Clock className="w-3.5 h-3.5" />
        Queued (Twilio pending)
      </span>
    );
  }
  if (row.mode === "new" && row.provisioning_status === "failed") {
    return <span className="text-xs text-rose-700">Provisioning failed</span>;
  }
  if (row.mode === "port" && row.port_status) {
    return <span className="text-xs text-gray-700">Port: {row.port_status}</span>;
  }
  return <span className="text-xs text-gray-500">In progress</span>;
}

function formatDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/* ─── Detail dialog ─── */

interface DetailResponse {
  setup: ListRow & {
    assigned_number_sid: string | null;
    provisioning_failed_reason: string | null;
    forwarding_verified_method: string | null;
    port_request_id: string | null;
    port_loa_object_key: string | null;
    port_bill_object_key: string | null;
    port_submitted_at: string | null;
    port_resolved_at: string | null;
    port_rejection_reason: string | null;
  };
  client: {
    business_name: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  } | null;
}

function DetailDialog({ id, onClose, onMutate }: { id: number; onClose: () => void; onMutate: () => void }) {
  const { data, isLoading, refetch } = useQuery<DetailResponse>({
    queryKey: [`/api/admin/tradeline-setups/${id}`],
    queryFn: () => apiRequest("GET", `/api/admin/tradeline-setups/${id}`).then((r) => r.json()),
  });

  const retryMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/tradeline-setups/${id}/retry-provision`, {}).then((r) => r.json()),
    onSuccess: () => {
      refetch();
      onMutate();
    },
  });

  const [portStatusInput, setPortStatusInput] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const markPortMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/admin/tradeline-setups/${id}/mark-port-status`, {
        status: portStatusInput,
        rejectionReason: rejectionReason || undefined,
      }).then((r) => r.json()),
    onSuccess: () => {
      refetch();
      onMutate();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wizard detail #{id}</DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-2 py-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {/* Client */}
            {data.client && (
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Client</h4>
                <p className="font-medium text-gray-900">{data.client.business_name}</p>
                {data.client.contact_name && <p className="text-gray-600">{data.client.contact_name}</p>}
                <p className="text-xs text-gray-500">
                  {data.client.contact_email} · {data.client.contact_phone}
                </p>
              </section>
            )}

            {/* Common */}
            <section className="grid grid-cols-2 gap-3 text-xs">
              <KV k="Mode" v={data.setup.mode ?? "—"} />
              <KV k="Last step" v={data.setup.last_step ?? "—"} />
              <KV k="Started" v={formatDate(data.setup.started_at)} />
              <KV k="Completed" v={data.setup.completed_at ? formatDate(data.setup.completed_at) : "—"} />
            </section>

            {/* Mode-specific */}
            {data.setup.mode === "new" && (
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Option A — new number</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <KV k="Provisioning status" v={data.setup.provisioning_status ?? "—"} />
                  <KV k="Assigned number" v={data.setup.assigned_number ?? "—"} />
                  <KV k="Twilio SID" v={data.setup.assigned_number_sid ?? "—"} />
                  <KV k="Failed reason" v={data.setup.provisioning_failed_reason ?? "—"} />
                </div>
                {(data.setup.provisioning_status === "queued" || data.setup.provisioning_status === "failed") && (
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => retryMutation.mutate()}
                    disabled={retryMutation.isPending}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    {retryMutation.isPending ? "Retrying…" : "Retry provisioning now"}
                  </Button>
                )}
              </section>
            )}

            {data.setup.mode === "forward" && (
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Option B — forward existing</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <KV k="Customer number" v={data.setup.customer_number ?? "—"} />
                  <KV k="Carrier" v={data.setup.carrier ?? "—"} />
                  <KV k="Verified at" v={data.setup.forwarding_verified_at ? formatDate(data.setup.forwarding_verified_at) : "—"} />
                  <KV k="Verified method" v={data.setup.forwarding_verified_method ?? "—"} />
                </div>
              </section>
            )}

            {data.setup.mode === "port" && (
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Option C — port existing</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <KV k="Port status" v={data.setup.port_status ?? "—"} />
                  <KV k="Port request id" v={data.setup.port_request_id ?? "—"} />
                  <KV k="Submitted at" v={data.setup.port_submitted_at ? formatDate(data.setup.port_submitted_at) : "—"} />
                  <KV k="Resolved at" v={data.setup.port_resolved_at ? formatDate(data.setup.port_resolved_at) : "—"} />
                  <KV k="Bill key" v={data.setup.port_bill_object_key ?? "—"} />
                  <KV k="LOA key" v={data.setup.port_loa_object_key ?? "—"} />
                </div>
                {data.setup.port_rejection_reason && (
                  <p className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                    Rejection reason: {data.setup.port_rejection_reason}
                  </p>
                )}

                <div className="mt-3 border-t pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-700">Admin: mark port status</p>
                  <Select value={portStatusInput} onValueChange={setPortStatusInput}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick a status…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_progress">in_progress</SelectItem>
                      <SelectItem value="approved">approved (terminal)</SelectItem>
                      <SelectItem value="rejected">rejected (terminal)</SelectItem>
                    </SelectContent>
                  </Select>
                  {portStatusInput === "rejected" && (
                    <textarea
                      placeholder="Rejection reason (shown to customer)"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-full rounded border border-gray-300 p-2 text-xs"
                      rows={3}
                    />
                  )}
                  <Button
                    size="sm"
                    onClick={() => markPortMutation.mutate()}
                    disabled={!portStatusInput || markPortMutation.isPending}
                  >
                    {markPortMutation.isPending ? "Saving…" : "Save port status"}
                  </Button>
                </div>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{k}</p>
      <p className="font-medium text-gray-900 break-all">{v}</p>
    </div>
  );
}
