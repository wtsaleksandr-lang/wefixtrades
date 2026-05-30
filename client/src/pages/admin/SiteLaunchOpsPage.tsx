import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { StatCard, StatCardGrid } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, RotateCcw, ChevronRight } from "lucide-react";

interface SiteLaunchOrderRow {
  id: number;
  client_id: number;
  service_id: string;
  status: string | null;
  business_name: string;
  service_name: string | null;
  tier: string;
  price_cents: number | null;
  cost_cents: number | null;
  margin_cents: number;
  fulfillment_mode: string | null;
  started_at: string | null;
  completed_at: string | null;
}

const DONE_STATUSES = new Set(["delivered", "completed", "cancelled", "canceled"]);

function dollars(cents: number | null | undefined): string {
  const n = (cents ?? 0) / 100;
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function StatusPill({ status }: { status: string | null }) {
  const s = (status || "unknown").toLowerCase();
  const styles: Record<string, string> = {
    active: "bg-blue-50 text-blue-700",
    in_progress: "bg-blue-50 text-blue-700",
    pending: "bg-amber-50 text-amber-700",
    delivered: "bg-emerald-50 text-emerald-700",
    completed: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-gray-100 text-gray-600",
    canceled: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      data-theme="light"
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize whitespace-nowrap ${styles[s] || "bg-gray-100 text-gray-600"}`}
    >
      {s.replace(/_/g, " ")}
    </span>
  );
}

export default function SiteLaunchOpsPage() {
  useEffect(() => {
    document.title = "SiteLaunch Orders - WeFixTrades Admin";
  }, []);

  const { data: orders, isLoading, isError, error, refetch, isFetching } = useQuery<SiteLaunchOrderRow[]>({
    queryKey: ["/api/admin/crm/sitelaunch/services"],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/sitelaunch/services", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const list = orders ?? [];
  const inProgress = list.filter((o) => !DONE_STATUSES.has((o.status || "").toLowerCase())).length;
  const totalSales = list.reduce((sum, o) => sum + (o.price_cents ?? 0), 0);
  const totalMargin = list.reduce((sum, o) => sum + (o.margin_cents ?? 0), 0);

  return (
    <AdminLayout pageContext={{ page: "sitelaunch-ops" }}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">SiteLaunch Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            SiteLaunch is fulfilled by a third-party supplier. Track each order's buyer,
            status, sale price, our supplier cost, and margin.
          </p>
        </div>

        {/* KPI row */}
        <StatCardGrid className="sm:grid-cols-2 lg:grid-cols-4 mb-0">
          <StatCard label="Total Orders" value={list.length} />
          <StatCard
            label="In Progress"
            value={<span className={inProgress > 0 ? "text-amber-600" : ""}>{inProgress}</span>}
            tone={inProgress > 0 ? "warn" : "default"}
          />
          <StatCard label="Total Sales" value={<span className="whitespace-nowrap">{dollars(totalSales)}</span>} />
          <StatCard
            label="Total Margin"
            value={
              <span className={`whitespace-nowrap ${totalMargin > 0 ? "text-emerald-600" : totalMargin < 0 ? "text-red-600" : ""}`}>
                {dollars(totalMargin)}
              </span>
            }
          />
        </StatCardGrid>

        {isError ? (
          <Card className="p-6 bg-red-50 border-red-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800">Couldn't load SiteLaunch orders</p>
                <p className="text-xs text-red-700 mt-1">
                  {(error as Error | null)?.message ?? "The server didn't respond as expected."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  data-testid="button-retry-sitelaunch"
                >
                  <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
                  Retry
                </Button>
              </div>
            </div>
          </Card>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : list.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-gray-500">No SiteLaunch orders yet.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 font-medium">Buyer</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Sale</th>
                  <th className="px-4 py-3 font-medium text-right">Cost</th>
                  <th className="px-4 py-3 font-medium text-right">Margin</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {list.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/crm/clients/${o.client_id}`}
                        className="text-sm font-medium text-gray-900 hover:text-brand-blue transition-colors"
                      >
                        {o.business_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize bg-gray-100 text-gray-600 whitespace-nowrap">
                        {o.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-gray-900">
                      {dollars(o.price_cents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-gray-500">
                      {dollars(o.cost_cents)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                      <span className={o.margin_cents > 0 ? "text-emerald-600" : o.margin_cents < 0 ? "text-red-600" : "text-gray-500"}>
                        {dollars(o.margin_cents)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/service-ops?csid=${o.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline whitespace-nowrap"
                        title="Manage this order"
                      >
                        Manage <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
