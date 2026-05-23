import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, CheckCircle2, ExternalLink, ChevronRight, Eye, RotateCcw, X, Pause, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface AdFlowServiceRow {
  id: number;
  client_id: number;
  service_id: string;
  enabled: boolean;
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
    <span data-theme="light" className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${styles[tier] || "bg-gray-100 text-gray-600"}`}>
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

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const { data: services, isLoading } = useQuery<AdFlowServiceRow[]>({
    queryKey: ["/api/admin/crm/adflow/services"],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/adflow/services", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (csId: number) => {
      const res = await apiRequest("GET", `/api/admin/crm/adflow/${csId}/preview-report`);
      return res.json();
    },
    onSuccess: (data: { html: string; subject: string }) => {
      setPreviewHtml(data.html);
    },
    onError: (err: any) => {
      toast({ title: "Preview failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (csId: number) => {
      const res = await apiRequest("POST", `/api/admin/crm/adflow/${csId}/resend-report`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.sent) {
        toast({ title: "Report re-sent", description: `${data.period} report re-sent to client.` });
      } else {
        toast({ title: "Not sent", description: data.reason || "Check metrics first.", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/adflow/services"] });
    },
    onError: (err: any) => {
      toast({ title: "Re-send failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const enabledMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/client-services/${id}`, { enabled });
      return res.json();
    },
    onSuccess: (_data, { enabled }) => {
      toast({ title: enabled ? "AdFlow resumed" : "AdFlow paused" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/adflow/services"] });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message || "Try again", variant: "destructive" });
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
        <div className="grid grid-cols-3 gap-4 auto-rows-fr">
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
                  <th className="px-4 py-3 font-medium">Actions</th>
                  <th className="px-4 py-3 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {services.map((svc) => (
                  <tr key={svc.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/crm/clients/${svc.client_id}`}
                        className="text-sm font-medium text-gray-900 hover:text-[#0d3cfc] transition-colors"
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => previewMutation.mutate(svc.id)}
                          disabled={previewMutation.isPending}
                          title="Preview report"
                        >
                          <Eye className="w-3 h-3 mr-1" /> Preview
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => resendMutation.mutate(svc.id)}
                          disabled={resendMutation.isPending || !svc.has_current_metrics}
                          title="Re-send report"
                        >
                          <RotateCcw className="w-3 h-3 mr-1" /> Re-send
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-7 px-2 text-xs ${svc.enabled ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"}`}
                          onClick={() => enabledMutation.mutate({ id: svc.id, enabled: !svc.enabled })}
                          disabled={enabledMutation.isPending}
                          title={svc.enabled ? "Pause AdFlow (stops reports & metrics checks)" : "Resume AdFlow"}
                        >
                          {svc.enabled ? (
                            <><Pause className="w-3 h-3 mr-1" /> Pause</>
                          ) : (
                            <><Play className="w-3 h-3 mr-1" /> Resume</>
                          )}
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/service-ops?csid=${svc.id}`}
                        className="text-gray-400 hover:text-[#0d3cfc] transition-colors"
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
        {/* Report preview modal */}
        {previewHtml && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">Report Preview</h3>
                <button
                  onClick={() => setPreviewHtml(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full min-h-[70vh] border-0"
                  title="Report Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
