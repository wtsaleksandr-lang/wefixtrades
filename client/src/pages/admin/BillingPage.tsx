import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { DollarSign, AlertCircle, Download, Search } from "lucide-react";
import { csvDownload, todayIso } from "@/lib/csvDownload";

interface PaymentRow {
  id: number;
  client_id: number;
  client_name: string | null;
  type: string;
  amount_cents: number;
  currency?: string | null;
  status: string;
  description: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  partial: "bg-blue-50 text-blue-700",
  refunded: "bg-gray-100 text-gray-600",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_COLORS[status] || "bg-muted/50 text-muted-foreground"}`}>
      {status}
    </span>
  );
}

/* Render the amount in the row's own currency (USD canonical — the column
 * defaults to "usd"; non-USD only ever appears if Stripe settles otherwise). */
function fmt(cents: number, currency?: string | null) {
  const code = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function fmtDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function BillingPage() {
  usePageTitle("Billing");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ data: PaymentRow[]; unpaidTotal: number }>({
    queryKey: ["/api/admin/crm/payments", { status: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/crm/payments?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const updatePaymentStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/payments/${id}`, { status });
      return res.json();
    },
    onSuccess: (_data, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
      toast({ title: "Payment updated", description: `Marked as ${status}` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update payment", description: err.message, variant: "destructive" });
    },
  });

  const payments = data?.data ?? [];
  const unpaidTotal = data?.unpaidTotal ?? 0;

  /* Free-text search over the loaded ledger (client name, description, and the
   * formatted/raw amount). Status is still filtered server-side; this narrows
   * the returned rows client-side, matching the Audit-Leads / Prospects pattern. */
  const visiblePayments = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => {
      const name = (p.client_name || `Client #${p.client_id}`).toLowerCase();
      const desc = (p.description || "").toLowerCase();
      const amount = fmt(p.amount_cents, p.currency).toLowerCase();
      const amountRaw = (p.amount_cents / 100).toString();
      return name.includes(q) || desc.includes(q) || amount.includes(q) || amountRaw.includes(q);
    });
  })();

  const now = new Date();
  const pendingPayments = payments.filter((p) => p.status === "pending");
  const failedPayments = payments.filter((p) => p.status === "failed");
  const overduePayments = pendingPayments.filter(
    (p) => p.due_at && new Date(p.due_at) < now
  );

  return (
    <AdminLayout pageContext={{
      page: "billing",
      unpaidAmount: unpaidTotal,
      activeFilters: statusFilter !== "all" ? statusFilter : undefined,
      pendingPaymentsCount: pendingPayments.length,
      failedPaymentsCount: failedPayments.length,
      overduePaymentsCount: overduePayments.length,
      topPendingPayments: pendingPayments.slice(0, 6).map((p) => ({
        client_name: p.client_name || `Client #${p.client_id}`,
        amount_cents: p.amount_cents,
        due_at: p.due_at,
      })),
    }}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Billing</h2>
            <p className="text-sm text-muted-foreground">All payments across clients</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!payments.length) return;
                csvDownload<PaymentRow>({
                  filename: `payments-${todayIso()}.csv`,
                  columns: [
                    { header: "id", value: (p) => p.id },
                    { header: "client_id", value: (p) => p.client_id },
                    { header: "client_name", value: (p) => p.client_name },
                    { header: "type", value: (p) => p.type },
                    { header: "amount_cents", value: (p) => p.amount_cents },
                    { header: "currency", value: (p) => p.currency ?? "usd" },
                    { header: "status", value: (p) => p.status },
                    { header: "description", value: (p) => p.description },
                    { header: "due_at", value: (p) => p.due_at },
                    { header: "paid_at", value: (p) => p.paid_at },
                    { header: "created_at", value: (p) => p.created_at },
                  ],
                  rows: payments,
                });
              }}
              disabled={!payments.length}
              className="min-h-[36px]"
            >
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Search — narrows the loaded ledger by client, description, or amount.
            Matches the Audit-Leads / Prospects search pattern. */}
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, description, or amount…"
            aria-label="Search payments"
            className="pl-9"
          />
        </div>

        {/* Unpaid summary */}
        {unpaidTotal > 0 && (
          <Card className="p-4 flex items-center gap-3 border-amber-200 bg-amber-50/50">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Unpaid invoices: {fmt(unpaidTotal)}</p>
              <p className="text-xs text-amber-600">Total pending across all clients</p>
            </div>
          </Card>
        )}

        {/* Table */}
        <Card>
          {/* Desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                      <p className="text-foreground font-medium mb-1">No payment records yet.</p>
                      <p className="text-xs text-muted-foreground">
                        Payments appear here as soon as a client checks out via Stripe or you log a manual payment from
                        {" "}<Link href="/admin/crm/clients" className="text-brand-blue hover:underline font-medium">a client's page</Link>.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : visiblePayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                      No payments match “{search}”.
                    </TableCell>
                  </TableRow>
                ) : (
                  visiblePayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/admin/crm/clients/${p.client_id}`}>
                          <span className="text-sm font-medium text-foreground hover:text-brand-blue">
                            {p.client_name || `Client #${p.client_id}`}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{p.type}</TableCell>
                      <TableCell className="text-sm font-medium">{fmt(p.amount_cents, p.currency)}</TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={(v) => { if (["paid", "refunded", "failed"].includes(v) && !window.confirm(`Set this payment to "${v}"? This changes the financial record for this client.`)) return; updatePaymentStatus.mutate({ id: p.id, status: v }); }}>
                          <SelectTrigger className="h-7 w-auto min-w-[90px] text-[11px] px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                            <SelectItem value="paid" className="text-xs">Paid</SelectItem>
                            <SelectItem value="failed" className="text-xs">Failed</SelectItem>
                            <SelectItem value="refunded" className="text-xs">Refunded</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{p.description || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(p.paid_at || p.created_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-border">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-10 px-6">
                <p className="text-foreground font-medium mb-1 text-sm">No payment records yet.</p>
                <p className="text-xs text-muted-foreground">
                  Payments appear here as soon as a client checks out, or you log a manual one on
                  {" "}<Link href="/admin/crm/clients" className="text-brand-blue hover:underline font-medium">a client's page</Link>.
                </p>
              </div>
            ) : visiblePayments.length === 0 ? (
              <div className="text-center py-10 px-6 text-sm text-muted-foreground">
                No payments match “{search}”.
              </div>
            ) : (
              visiblePayments.map((p) => (
                <div key={p.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Link href={`/admin/crm/clients/${p.client_id}`}>
                        <span className="text-sm font-medium text-foreground hover:text-brand-blue">
                          {p.client_name || `Client #${p.client_id}`}
                        </span>
                      </Link>
                      <p className="text-xs text-muted-foreground capitalize mt-0.5">{p.type} &middot; {fmt(p.amount_cents, p.currency)}</p>
                    </div>
                    <Select value={p.status} onValueChange={(v) => { if (["paid", "refunded", "failed"].includes(v) && !window.confirm(`Set this payment to "${v}"? This changes the financial record for this client.`)) return; updatePaymentStatus.mutate({ id: p.id, status: v }); }}>
                      <SelectTrigger className="h-7 w-auto min-w-[80px] text-[11px] px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                        <SelectItem value="paid" className="text-xs">Paid</SelectItem>
                        <SelectItem value="failed" className="text-xs">Failed</SelectItem>
                        <SelectItem value="refunded" className="text-xs">Refunded</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
