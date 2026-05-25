import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CreditCard, Clock, CheckCircle, RefreshCw, ExternalLink, FileText } from "lucide-react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES, statusLabel } from "@/config/portalLabels";
import { FirstVisitTooltip } from "@/components/portal/FirstVisitTooltip";

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
  usePageTitle("Billing");
  const { data, isLoading, error, refetch } = useQuery<BillingData>({
    queryKey: ["/api/portal/billing"],
    queryFn: async () => {
      const res = await fetch("/api/portal/billing", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load billing");
      return res.json();
    },
  });

  // Defensive: server normally returns the full BillingData shape, but if a
  // partial/malformed payload ever slips through we don't want the page to
  // hard-crash (which trips the top-level AppErrorBoundary with "This page
  // crashed unexpectedly"). Treat missing fields as empty/zero.
  const payments = data?.payments ?? [];
  const summary = data?.summary;
  const totalPaidCents = summary?.total_paid_cents ?? 0;
  const totalPendingCents = summary?.total_pending_cents ?? 0;
  const nextDueAt = summary?.next_due_at ?? null;
  const nextDueAmountCents = summary?.next_due_amount_cents ?? null;
  const hasPending = totalPendingCents > 0;
  const unpaidCount = payments.filter((p) => p.status === "pending" || p.status === "failed").length;
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  async function openBillingPortal() {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/portal/billing/portal-session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to open billing portal");
      }
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch (err: any) {
      setPortalError(err.message || "Could not open billing portal");
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <PortalLayout>
      <div data-theme="light" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Billing</h1>
            <p className="text-sm text-gray-500 mt-0.5">Your invoices and payment history.</p>
          </div>
          <Button
            onClick={openBillingPortal}
            disabled={portalLoading}
            className="btn-primary-premium"
          >
            {portalLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4 mr-2" />
            )}
            Manage Billing
          </Button>
        </div>
        {portalError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {portalError}
          </div>
        )}

        {isLoading && (
          <div className="space-y-6" data-testid="billing-skeleton">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 auto-rows-fr">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <div className="flex-1">
                      <Skeleton className="h-3 w-20 mb-1.5" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="p-5 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm flex items-center justify-between">
            <span>We couldn't load your invoices right now. Try refreshing — or reach us from the Help tab.</span>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <RefreshCw className="w-3 h-3" /> Try again
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 auto-rows-fr">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Paid</p>
                    <p className="text-lg font-semibold text-gray-900">{formatCents(totalPaidCents)}</p>
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
                    <p className="text-lg font-semibold text-gray-900">{formatCents(totalPendingCents)}</p>
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
                      {nextDueAmountCents
                        ? formatCents(nextDueAmountCents)
                        : "-"}
                      {nextDueAt && (
                        <span className="text-xs font-normal text-gray-400 ml-1.5">on {formatDate(nextDueAt)}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment guidance for unpaid invoices — direct-pay CTA opens
               the Stripe billing portal in a new tab. The fallback "contact
               us" link is for edge cases (no payment method on file, etc.). */}
            {hasPending && (
              <div
                className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                data-testid="billing-unpaid-banner"
              >
                <div className="flex items-start gap-3">
                  <CreditCard className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      {unpaidCount > 0
                        ? `You have ${unpaidCount} unpaid invoice${unpaidCount === 1 ? "" : "s"}`
                        : "You have unpaid invoices"}
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
                      Pay in your Stripe billing portal — we accept bank transfer and card.{" "}
                      <Link href="/portal/help" className="underline hover:text-amber-800">
                        Or contact us
                      </Link>
                      .
                    </p>
                  </div>
                </div>
                <FirstVisitTooltip
                  storageKey="portal-billing-pay-unpaid"
                  title="Pay directly via Stripe"
                  position="top"
                  anchor={
                    <Button
                      onClick={openBillingPortal}
                      disabled={portalLoading}
                      className="btn-primary-premium shrink-0"
                      data-testid="billing-pay-unpaid-cta"
                    >
                      {portalLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4 mr-2" />
                      )}
                      {unpaidCount > 0
                        ? `Pay ${unpaidCount} unpaid invoice${unpaidCount === 1 ? "" : "s"}`
                        : "Pay now"}
                    </Button>
                  }
                >
                  Click to pay your open invoices through Stripe — no support ticket needed.
                </FirstVisitTooltip>
              </div>
            )}

            {/* Payments table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Payment History</h2>
              </div>
              {payments.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" aria-hidden="true" />
                  <p className="text-sm font-medium text-gray-700 mb-1">No invoices yet</p>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">Once your first service is active, every invoice and payment will show up here.</p>
                </div>
              ) : (
                <>
                {/* Mobile-friendly stacked cards — appears < md */}
                <div className="md:hidden divide-y divide-gray-50">
                  {payments.map((p) => {
                    const isUnpaid = p.status === "pending" || p.status === "failed";
                    return (
                      <div key={p.id} className="p-4 space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{p.service_name || "Invoice"}</p>
                            <p className="text-xs text-gray-500 truncate">{p.description || "Invoice"}</p>
                          </div>
                          <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">{formatCents(p.amount_cents)}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${PAYMENT_STATUS_STYLES[p.status] || "bg-gray-100 text-gray-600"}`}>
                            {statusLabel(PAYMENT_STATUS_LABELS, p.status)}
                          </span>
                          <span className="text-xs text-gray-400">{formatDate(p.created_at)}</span>
                        </div>
                        {isUnpaid && (
                          <button
                            type="button"
                            onClick={openBillingPortal}
                            disabled={portalLoading}
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-600 disabled:opacity-50 pt-1"
                          >
                            Pay now <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="px-5 py-2 font-medium">Date</th>
                        <th className="px-5 py-2 font-medium">Service</th>
                        <th className="px-5 py-2 font-medium">Description</th>
                        <th className="px-5 py-2 font-medium text-right">Amount</th>
                        <th className="px-5 py-2 font-medium">Status</th>
                        <th className="px-5 py-2 font-medium text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {payments.map((p) => {
                        const isUnpaid = p.status === "pending" || p.status === "failed";
                        return (
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
                            <td className="px-5 py-3 text-right whitespace-nowrap">
                              {isUnpaid && (
                                /* Per-row "Pay now" sends the customer
                                   to the Stripe billing portal where
                                   their open invoices are listed. We
                                   reuse the same portal-session endpoint
                                   the header CTA uses — Stripe handles
                                   payment method, amount, and receipt. */
                                <button
                                  type="button"
                                  onClick={openBillingPortal}
                                  disabled={portalLoading}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-blue-600 disabled:opacity-50"
                                >
                                  Pay now <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
