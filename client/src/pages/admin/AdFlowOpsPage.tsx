import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminProductPageShell, type ProductStats } from "@/components/admin/AdminProductPageShell";
import { Card } from "@/components/ui/card";
import { StatCard, StatCardGrid } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, AlertTriangle, CheckCircle2, ChevronRight, Eye, RotateCcw, X, Pause, Play, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { AdflowEngineConfig, EngineConfig } from "@shared/engineConfig";
import { emptyAdflowEngineConfig } from "@shared/engineConfig";

const PRODUCT_ID = "adflow";

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

interface ProductRecord {
  live: { id: string; name: string; is_active: boolean; hidden: boolean; engine_config: EngineConfig | null } | null;
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

  /* AdminProductPageShell wiring — see QuoteQuickPage pilot (PR #578). */
  const productKey = ["/api/admin/products", PRODUCT_ID] as const;
  const { data: productData } = useQuery<ProductRecord>({
    queryKey: productKey,
    queryFn: () => apiRequest("GET", `/api/admin/products/${PRODUCT_ID}`).then((r) => r.json()),
  });
  const live = productData?.live ?? null;

  const statsKey = ["/api/admin/products", PRODUCT_ID, "stats"] as const;
  const { data: productStats, error: productStatsError } = useQuery<ProductStats>({
    queryKey: statsKey,
    queryFn: () => apiRequest("GET", `/api/admin/products/${PRODUCT_ID}/stats`).then((r) => r.json()),
  });

  const activeToggle = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/products/${PRODUCT_ID}/status`, { is_active: next });
      return res.json();
    },
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: productKey });
      const prev = queryClient.getQueryData<ProductRecord>(productKey);
      if (prev?.live) {
        queryClient.setQueryData<ProductRecord>(productKey, { live: { ...prev.live, is_active: next } });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(productKey, ctx.prev);
      toast({ title: "Could not update status", description: "Try again", variant: "destructive" });
    },
    onSuccess: (_data, next) => {
      toast({ title: next ? "Product activated" : "Product deactivated" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: productKey });
    },
  });

  const hiddenToggle = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PATCH", `/api/admin/products/${PRODUCT_ID}/visibility`, { hidden: next });
      return res.json();
    },
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: productKey });
      const prev = queryClient.getQueryData<ProductRecord>(productKey);
      if (prev?.live) {
        queryClient.setQueryData<ProductRecord>(productKey, { live: { ...prev.live, hidden: next } });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(productKey, ctx.prev);
      toast({ title: "Could not update visibility", description: "Try again", variant: "destructive" });
    },
    onSuccess: (_data, next) => {
      toast({ title: next ? "Hidden from public catalog" : "Visible in public catalog" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: productKey });
    },
  });

  const { data: services, isLoading, isError, error: servicesError, refetch, isFetching } = useQuery<AdFlowServiceRow[]>({
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

  const overviewBody = (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Active AdFlow client services. Enter metrics before the 2nd of each month for reports to send automatically.
      </p>

      {/* Summary cards */}
      <StatCardGrid className="md:grid-cols-3 mb-0">
        <StatCard label="Active Services" value={services?.length ?? 0} />
        <StatCard
          label="Metrics Entered"
          value={<span className="text-emerald-600">{(services || []).filter((s) => s.has_current_metrics).length}</span>}
        />
        <StatCard
          label="Missing Metrics"
          value={<span className={missingCount > 0 ? "text-amber-600" : ""}>{missingCount}</span>}
          tone={missingCount > 0 ? "warn" : "default"}
        />
      </StatCardGrid>

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

      {/* 0047 — AdFlow product-namespaced engine config */}
      <AdflowSettingsCard productId={PRODUCT_ID} initial={live?.engine_config ?? null} />

      {/* Service list */}
      {isError ? (
        <Card className="p-6 bg-red-50 border-red-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Couldn't load AdFlow services</p>
              <p className="text-xs text-red-700 mt-1">
                {(servicesError as Error | null)?.message ?? "The server didn't respond as expected."}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="button-retry-adflow"
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
                      className="text-sm font-medium text-gray-900 hover:text-brand-blue transition-colors"
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
                      className="text-gray-400 hover:text-brand-blue transition-colors"
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
  );

  return (
    <AdminLayout pageContext={{ page: "adflow-ops" }}>
      <AdminProductPageShell
        productId={PRODUCT_ID}
        productName="AdFlow"
        isActive={live?.is_active ?? true}
        hidden={live?.hidden ?? false}
        stats={productStats ?? null}
        statsError={productStatsError}
        tabs={[
          {
            id: "overview",
            label: "Overview",
            render: () => overviewBody,
          },
        ]}
        onToggleActive={(next) => activeToggle.mutate(next)}
        onToggleHidden={(next) => hiddenToggle.mutate(next)}
      />
    </AdminLayout>
  );
}

/* ── AdflowSettingsCard ────────────────────────────────────────────
 * AdFlow-specific engine config namespaced under engine_config.adflow.
 * Posts to the same PATCH /api/admin/services/:id/engine-config route
 * as ProductDetailPage; the generic card scrubs the .adflow key on its
 * own writes so the two surfaces don't fight.
 */
function AdflowSettingsCard({ productId, initial }: { productId: string; initial: EngineConfig | null }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const base = useMemo<AdflowEngineConfig>(
    () => ({ ...emptyAdflowEngineConfig(), ...((initial?.adflow ?? {}) as AdflowEngineConfig) }),
    [initial],
  );
  const [form, setForm] = useState<AdflowEngineConfig>(base);
  useEffect(() => { setForm(base); }, [base]);

  const dirty = JSON.stringify(form) !== JSON.stringify(base);

  const save = useMutation({
    mutationFn: async () => {
      // PATCH merges server-side, so sending only { adflow } leaves the
      // generic keys intact.
      const res = await fetch(`/api/admin/services/${productId}/engine-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ adflow: form }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save AdFlow settings");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products", productId] });
      toast({ title: "AdFlow settings saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't save AdFlow settings", description: err.message, variant: "destructive" });
    },
  });

  const dollars = ((form.spend_cap_per_client_per_week_cents ?? 0) / 100).toFixed(2);

  return (
    <Card className="p-5 space-y-4" data-testid="adflow-settings-card">
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-brand-blue" />
        <h2 className="text-sm font-semibold text-gray-900">AdFlow settings</h2>
      </div>
      <p className="text-[11px] text-gray-500 -mt-2">
        Product-level defaults applied to every AdFlow client. Saves immediately.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-600 mb-1">Default audience</span>
          <select
            className="h-9 w-full px-2 text-sm border border-gray-200 rounded-md bg-white"
            value={form.default_audience ?? "all"}
            onChange={(e) => setForm({ ...form, default_audience: e.target.value as AdflowEngineConfig["default_audience"] })}
            data-testid="adflow-default-audience"
          >
            <option value="all">All clients</option>
            <option value="active_only">Active only</option>
            <option value="new_leads_only">New leads only</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-[11px] font-medium text-gray-600 mb-1">Spend cap per client per week</span>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-sm text-gray-500 pointer-events-none">$</span>
            <Input
              type="text"
              inputMode="decimal"
              value={dollars}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[$,\s]/g, "");
                const n = Number(cleaned);
                if (!Number.isFinite(n) || n < 0) return;
                setForm({ ...form, spend_cap_per_client_per_week_cents: Math.round(n * 100) });
              }}
              className="pl-6 tabular-nums"
              data-testid="adflow-spend-cap"
            />
          </div>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-600 mb-1">Auto-pause on low conversion</span>
          <label className="inline-flex items-center gap-2 h-9 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={form.auto_pause_low_conversion ?? false}
              onChange={(e) => setForm({ ...form, auto_pause_low_conversion: e.target.checked })}
              className="h-4 w-4"
              data-testid="adflow-auto-pause"
            />
            Pause an AdFlow client when conversion drops below threshold
          </label>
        </label>

        <label className="block">
          <span className="block text-[11px] font-medium text-gray-600 mb-1">Threshold (% conversion)</span>
          <Input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={form.auto_pause_threshold_pct ?? 1.0}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              setForm({ ...form, auto_pause_threshold_pct: Math.max(0, Math.min(100, n)) });
            }}
            disabled={!(form.auto_pause_low_conversion ?? false)}
            className="max-w-[160px] tabular-nums"
            data-testid="adflow-threshold-pct"
          />
        </label>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="bg-brand-blue hover:bg-brand-blue-600"
          data-testid="adflow-save-button"
        >
          {save.isPending ? "Saving..." : "Save AdFlow settings"}
        </Button>
        {!dirty && <span className="text-xs text-gray-400">No changes</span>}
        {dirty && <span className="text-xs text-gray-500">Unsaved changes</span>}
      </div>
    </Card>
  );
}
