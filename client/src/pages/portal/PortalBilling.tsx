import { useQuery } from "@tanstack/react-query";
import { Loader2, CreditCard, Clock, CheckCircle, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES, statusLabel } from "@/config/portalLabels";

interface PaymentRow {
  id: number;
  type: string;
  amount_cents: number;
  status: string;
  description: string | null;
  service_name: string | null;
  period_start: string | null;
  period_end: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string | null;
}

interface BillingData {
  payments: PaymentRow[];
  summary: {
    total_paid_cents: number;
    total_pending_cents: number;
    next_due_at: string | null;
    next_due_amount_cents: number | null;
  };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PortalBilling() {
  const { data, isLoading, error, refetch } = useQuery<BillingData>({
    queryKey: ["/api/portal/billing"],
    queryFn: async () => {
      const res = await fetch("/api/portal/billing", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load billing");
      return res.json();
    },
  });

  const hasPending = data && data.summary.total_pending_cents > 0;

  return (
    <PortalLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Billing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your invoices and payment history.</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm flex items-center justify-between">
            <span>Failed to load billing.</span>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Paid</p>
                    <p className="text-lg font-semibold text-gray-900">{formatCents(data.summary.total_paid_cents)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Amount Due</p>
                    <p className="text-lg font-semibold text-gray-900">{formatCents(data.summary.total_pending_cents)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Next Due</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {data.summary.next_due_amount_cents
                        ? formatCents(data.summary.next_due_amount_cents)
                        : "-"}
                      {data.summary.next_due_at && (
                        <span className="text-xs font-normal text-gray-400 ml-1.5">on {formatDate(data.summary.next_due_at)}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment guidance for unpaid invoices */}
            {hasPending && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <CreditCard className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">You have unpaid invoices</p>
                  <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
                    To arrange payment, please <Link href="/portal/help" className="underline font-medium hover:text-amber-800">contact us via the Help page</Link> or
                    reply to the invoice email you received. We accept bank transfer and card payments.
                  </p>
                </div>
              </div>
            )}

            {/* Payments table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Payment History</h2>
              </div>
              {data.payments.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">
                  No payments yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="px-5 py-2 font-medium">Date</th>
                        <th className="px-5 py-2 font-medium">Service</th>
                        <th className="px-5 py-2 font-medium">Description</th>
                        <th className="px-5 py-2 font-medium text-right">Amount</th>
                        <th className="px-5 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50/50">
                          <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{formatDate(p.created_at)}</td>
                          <td className="px-5 py-3 text-gray-700">{p.service_name || "-"}</td>
                          <td className="px-5 py-3 text-gray-500">{p.description || "Invoice"}</td>
                          <td className="px-5 py-3 text-gray-900 font-medium text-right whitespace-nowrap">{formatCents(p.amount_cents)}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${PAYMENT_STATUS_STYLES[p.status] || "bg-gray-100 text-gray-600"}`}>
                              {statusLabel(PAYMENT_STATUS_LABELS, p.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
