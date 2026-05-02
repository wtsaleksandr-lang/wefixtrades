import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Loader2, AlertTriangle, CheckCircle2, ExternalLink, ChevronRight } from "lucide-react";

interface AdFlowServiceRow {
  id: number;
  client_id: number;
  service_id: string;
  business_name: string;
  tier: string;
  has_current_metrics: boolean;
  last_report_sent: string | null;
  last_report_period: string | null;
  period_start: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    starter: "bg-blue-50 text-blue-700",
    growth: "bg-emerald-50 text-emerald-700",
    pro: "bg-purple-50 text-purple-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${styles[tier] || "bg-gray-100 text-gray-600"}`}>
      {tier}
    </span>
  );
}

function MetricsStatus({ hasMetrics }: { hasMetrics: boolean }) {
  if (hasMetrics) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <CheckCircle2 className="w-3.5 h-3.5" /> Entered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
      <AlertTriangle className="w-3.5 h-3.5" /> Missing
    </span>
  );
}

export default function AdFlowOpsPage() {
  useEffect(() => {
    document.title = "AdFlow Ops - WeFixTrades Admin";
  }, []);

  const { data: services, isLoading } = useQuery<AdFlowServiceRow[]>({
    queryKey: ["/api/admin/crm/adflow/services"],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/adflow/services", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const missingCount = (services || []).filter((s) => !s.has_current_metrics).length;

  return (
    <AdminLayout pageContext={{ page: "adflow-ops" }}>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">AdFlow Operations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Active AdFlow client services. Enter metrics before the 2nd of each month for reports to send automatically.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-xs text-gray-500">Active Services</p>
            <p className="text-2xl font-bold text-gray-900">{services?.length ?? 0}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-gray-500">Metrics Entered</p>
            <p className="text-2xl font-bold text-emerald-600">
              {(services || []).filter((s) => s.has_current_metrics).length}
            </p>
          </Card>
          <Card className={`p-4 ${missingCount > 0 ? "border-amber-200 bg-amber-50" : ""}`}>
            <p className="text-xs text-gray-500">Missing Metrics</p>
            <p className={`text-2xl font-bold ${missingCount > 0 ? "text-amber-600" : "text-gray-900"}`}>
              {missingCount}
            </p>
          </Card>
        </div>

        {/* Missing metrics warning */}
        {missingCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {missingCount} client{missingCount === 1 ? "" : "s"} missing current-month metrics
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Enter metrics via Service Ops before the 2nd to ensure reports are sent automatically.
              </p>
            </div>
          </div>
        )}

        {/* Service list */}
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : !services || services.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-gray-500">No active AdFlow services found.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 font-medium">Current Metrics</th>
                  <th className="px-4 py-3 font-medium">Last Report</th>
                  <th className="px-4 py-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {services.map((svc) => (
                  <tr key={svc.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/crm/clients/${svc.client_id}`}
                        className="text-sm font-medium text-gray-900 hover:text-[#2D6A4F] transition-colors"
                      >
                        {svc.business_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <TierBadge tier={svc.tier} />
                    </td>
                    <td className="px-4 py-3">
                      <MetricsStatus hasMetrics={svc.has_current_metrics} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {svc.last_report_period || "Never sent"}
                      {svc.last_report_sent && (
                        <span className="text-gray-400 ml-1">({formatDate(svc.last_report_sent)})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/service-ops?csid=${svc.id}`}
                        className="text-gray-400 hover:text-[#2D6A4F] transition-colors"
                        title="Enter metrics"
                      >
                        <ChevronRight className="w-4 h-4" />
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
