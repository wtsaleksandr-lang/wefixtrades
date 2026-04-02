import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, AlertCircle } from "lucide-react";

interface PaymentRow {
  id: number;
  client_id: number;
  client_name: string | null;
  type: string;
  amount_cents: number;
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function fmt(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function BillingPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
  });

  const payments = data?.data ?? [];
  const unpaidTotal = data?.unpaidTotal ?? 0;

  return (
    <AdminLayout pageContext={{ page: "billing", unpaidAmount: unpaidTotal }}>
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Billing</h2>
            <p className="text-sm text-gray-500">All payments across clients</p>
          </div>
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
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500 text-sm">
                      No payment records yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/admin/crm/clients/${p.client_id}`}>
                          <span className="text-sm font-medium text-gray-900 hover:text-[#2D6A4F]">
                            {p.client_name || `Client #${p.client_id}`}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{p.type}</TableCell>
                      <TableCell className="text-sm font-medium">{fmt(p.amount_cents)}</TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={(v) => updatePaymentStatus.mutate({ id: p.id, status: v })}>
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
                      <TableCell className="text-sm text-gray-500 truncate max-w-[200px]">{p.description || "-"}</TableCell>
                      <TableCell className="text-sm text-gray-500">{fmtDate(p.paid_at || p.created_at)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-gray-100">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : payments.length === 0 ? (
              <p className="text-center py-8 text-gray-500 text-sm">No payment records yet.</p>
            ) : (
              payments.map((p) => (
                <div key={p.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Link href={`/admin/crm/clients/${p.client_id}`}>
                        <span className="text-sm font-medium text-gray-900 hover:text-[#2D6A4F]">
                          {p.client_name || `Client #${p.client_id}`}
                        </span>
                      </Link>
                      <p className="text-xs text-gray-500 capitalize mt-0.5">{p.type} &middot; {fmt(p.amount_cents)}</p>
                    </div>
                    <Select value={p.status} onValueChange={(v) => updatePaymentStatus.mutate({ id: p.id, status: v })}>
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
