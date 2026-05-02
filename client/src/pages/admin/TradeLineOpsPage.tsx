import { usePageTitle } from "@/hooks/usePageTitle";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Phone, RefreshCw, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/* ─── Types ─── */
interface FleetRow {
  clientServiceId: number;
  clientId: number;
  businessName: string;
  serviceId: string;
  status: string;
  variant: string;
  mode: string;
  assistantStatus: string;
  lastCallAt: string | null;
  periodMinutes: number;
  failedCalls24h: number;
}

/* ─── Helpers ─── */
function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function VariantBadge({ variant }: { variant: string }) {
  const styles: Record<string, string> = {
    call_backup: "bg-blue-50 text-blue-700",
    chat: "bg-purple-50 text-purple-700",
    complete: "bg-emerald-50 text-emerald-700",
  };
  const labels: Record<string, string> = {
    call_backup: "Call Backup",
    chat: "Chat",
    complete: "Complete",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[variant] || "bg-gray-100 text-gray-600"}`}>
      {labels[variant] || variant}
    </span>
  );
}

function ModeBadge({ mode }: { mode: string }) {
  const styles: Record<string, string> = {
    available: "bg-green-50 text-green-700",
    on_the_job: "bg-amber-50 text-amber-700",
    after_hours: "bg-slate-100 text-slate-600",
  };
  const labels: Record<string, string> = {
    available: "Available",
    on_the_job: "On Job",
    after_hours: "After Hours",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[mode] || "bg-gray-100 text-gray-600"}`}>
      {labels[mode] || mode}
    </span>
  );
}

function AssistantStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    built: "bg-green-50 text-green-700",
    building: "bg-blue-50 text-blue-600",
    not_built: "bg-gray-100 text-gray-500",
    failed: "bg-red-50 text-red-700",
    disabled: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

/* ─── Page ─── */
export default function TradeLineOpsPage() {
  usePageTitle("TradeLine Ops");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: fleet, isLoading } = useQuery<FleetRow[]>({
    queryKey: ["/api/admin/crm/tradeline/fleet"],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/tradeline/fleet", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const rebuildMutation = useMutation({
    mutationFn: async (csId: number) => {
      const res = await apiRequest("POST", `/api/admin/crm/tradeline/${csId}/build-assistant`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/tradeline/fleet"] });
      toast({ title: "Rebuild triggered", description: "Assistant is being rebuilt." });
    },
    onError: (err: Error) => {
      toast({ title: "Rebuild failed", description: err.message, variant: "destructive" });
    },
  });

  const disableMutation = useMutation({
    mutationFn: async (csId: number) => {
      const res = await apiRequest("POST", `/api/admin/crm/tradeline/${csId}/disable`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/tradeline/fleet"] });
      toast({ title: "Service disabled", description: "TradeLine has been paused for this client." });
    },
    onError: (err: Error) => {
      toast({ title: "Disable failed", description: err.message, variant: "destructive" });
    },
  });

  // Separate failed items (assistant failed or calls failed in 24h)
  const failedItems = fleet?.filter(
    (r) => r.assistantStatus === "failed" || r.failedCalls24h > 0
  ) ?? [];

  const activeItems = fleet?.filter(
    (r) => r.assistantStatus !== "failed" && r.failedCalls24h === 0
  ) ?? [];

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">TradeLine Ops</h1>
            <p className="text-sm text-gray-500 mt-1">
              Fleet-level overview of all TradeLine services.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Phone className="w-4 h-4" />
            <span>{fleet?.length ?? 0} services</span>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {/* Failed section */}
        {failedItems.length > 0 && (
          <Card className="border-red-200 bg-red-50/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <h2 className="text-sm font-semibold text-red-800">
                Attention Required ({failedItems.length})
              </h2>
            </div>
            <div className="space-y-2">
              {failedItems.map((row) => (
                <div
                  key={row.clientServiceId}
                  className="flex items-center justify-between bg-white border border-red-100 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm text-gray-900">
                      {row.businessName}
                    </span>
                    <AssistantStatusBadge status={row.assistantStatus} />
                    {row.failedCalls24h > 0 && (
                      <span className="text-xs text-red-600 font-medium">
                        {row.failedCalls24h} failed call{row.failedCalls24h > 1 ? "s" : ""} (24h)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rebuildMutation.mutate(row.clientServiceId)}
                      disabled={rebuildMutation.isPending}
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" />
                      Rebuild
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => disableMutation.mutate(row.clientServiceId)}
                      disabled={disableMutation.isPending}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" />
                      Disable
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Fleet table */}
        {!isLoading && activeItems.length > 0 && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/80">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Variant</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Mode</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Assistant</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Last Call</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Minutes</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeItems.map((row) => (
                    <tr key={row.clientServiceId} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {row.businessName}
                      </td>
                      <td className="px-4 py-3">
                        <VariantBadge variant={row.variant} />
                      </td>
                      <td className="px-4 py-3">
                        <ModeBadge mode={row.mode} />
                      </td>
                      <td className="px-4 py-3">
                        <AssistantStatusBadge status={row.assistantStatus} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {relativeTime(row.lastCallAt)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 font-mono">
                        {row.periodMinutes}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => rebuildMutation.mutate(row.clientServiceId)}
                            disabled={rebuildMutation.isPending}
                            title="Rebuild assistant"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => disableMutation.mutate(row.clientServiceId)}
                            disabled={disableMutation.isPending}
                            title="Disable service"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {!isLoading && (!fleet || fleet.length === 0) && (
          <Card className="p-12 text-center">
            <Phone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No TradeLine services found.</p>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
