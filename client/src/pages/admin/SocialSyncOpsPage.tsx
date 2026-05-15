import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw, AlertTriangle, ExternalLink, Zap, Facebook, Instagram, Globe, ShieldAlert, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ─── */

interface OpsOverview {
  metrics: {
    total_enabled: number;
    total_autopilot: number;
    fb_connected: number;
    ig_connected: number;
    gbp_connected: number;
    expired_tokens: number;
    expiring_soon: number;
    queued_due_today: number;
    queue_failures: number;
    published_24h: number;
    published_7d: number;
    clients_at_risk: number;
    clients_in_cooldown: number;
    clients_suppressed: number;
  };
  clients: ClientSummary[];
}

interface ClientSummary {
  client_id: number;
  enabled: boolean;
  autopilot: boolean;
  business_name: string | null;
  niche: string | null;
  location: string | null;
  fb_status: string;
  ig_status: string;
  gbp_status: string;
  upcoming_posts: number;
  published_7d: number;
  failed_queue: number;
  success_rate: number | null;
  ig_missing_media: number;
  cooldown: Record<string, { cooling_down: boolean; reason: string | null; until: string | null; consecutive_failures: number }>;
  at_risk: boolean;
  risk_reasons: string[];
}

/* ─── Helpers ─── */

const TD_DIVIDER = "border-r border-gray-100";

const FILTER_LABELS: Record<string, string> = {
  failed: "Queue failures",
  expired: "Expired tokens",
  expiring: "Expiring soon",
  at_risk: "At risk",
  fb_connected: "Facebook connected",
  ig_connected: "Instagram connected",
  gbp_connected: "Google Business connected",
};

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Small icon with a fast, rounded hover tooltip. */
function IconTip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center">{icon}</span>
      </TooltipTrigger>
      <TooltipContent className="rounded-md px-2 py-1 text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

/** One platform's connection state — green icon = connected, amber =
 *  expiring, red warning triangle = expired/error, gray = not connected. */
function ConnIndicator({ platform, status }: { platform: "fb" | "ig" | "gbp"; status: string }) {
  const expired = status === "expired" || status === "error";
  const expiring = status === "expiring_soon";
  const ok = status === "connected";
  const color = expired ? "text-red-600" : expiring ? "text-amber-600" : ok ? "text-emerald-600" : "text-gray-300";
  const PlatformIcon = platform === "fb" ? Facebook : platform === "ig" ? Instagram : Globe;
  const Icon = expired ? AlertTriangle : PlatformIcon;
  const platLabel = platform === "fb" ? "Facebook" : platform === "ig" ? "Instagram" : "Google Business";
  const statusLabel =
    ok ? "Connected" : expiring ? "Expiring soon" : status === "expired" ? "Token expired"
    : status === "error" ? "Connection error" : "Not connected";
  return <IconTip icon={<Icon className={`h-4 w-4 ${color}`} />} label={`${platLabel} — ${statusLabel}`} />;
}

/* ─── Page ─── */

export default function SocialSyncOpsPage() {
  usePageTitle("SocialSync");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [lastExpiryCheck, setLastExpiryCheck] = useState<number | null>(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("ss_last_expiry_check") : null;
    return v ? Number(v) : null;
  });

  const { data, isLoading } = useQuery<OpsOverview>({
    queryKey: ["/api/socialsync/ops/overview"],
    refetchInterval: 60000,
  });

  const { data: profitData } = useQuery<{
    totals: { revenue: number; cost: number; profit: number; margin_pct: number | null };
    clients: { client_id: number; revenue_usd: number; cost_usd: number; profit_usd: number; margin_pct: number | null; business_name: string | null }[];
  }>({
    queryKey: ["/api/socialsync/ops/profitability"],
    refetchInterval: 300000,
  });

  const profitMap = new Map<number, { revenue: number; cost: number; margin: number | null }>();
  profitData?.clients.forEach((c) => profitMap.set(c.client_id, { revenue: c.revenue_usd, cost: c.cost_usd, margin: c.margin_pct }));

  const generateAllDue = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/socialsync/internal/generate-all-due");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/socialsync/ops/overview"] });
      toast({ title: "Batch generation complete", description: `${data.total_posts_generated} posts, ${data.clients_processed} clients` });
    },
    onError: () => toast({ title: "Batch generation failed", variant: "destructive" }),
  });

  const checkExpiry = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/socialsync/internal/check-connection-expiry");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/socialsync/ops/overview"] });
      const now = Date.now();
      setLastExpiryCheck(now);
      try { localStorage.setItem("ss_last_expiry_check", String(now)); } catch { /* ignore */ }
      toast({ title: "Expiry check done", description: `${data.expired} expired, ${data.expiring_soon} expiring soon` });
    },
  });

  const processQueue = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/socialsync/internal/queue/process-due");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/socialsync/ops/overview"] });
      toast({ title: "Queue processed", description: `${data.published || 0} published, ${data.processed} processed` });
    },
  });

  /* Active/Inactive master toggle. The profile PUT is an upsert, so we
   * GET the current profile and PUT it back with only `enabled` flipped —
   * avoids nulling tone/frequency/etc. No backend change needed. */
  const toggleEnabled = useMutation({
    mutationFn: async ({ clientId, enabled }: { clientId: number; enabled: boolean }) => {
      const cur = await fetch(`/api/socialsync/clients/${clientId}/profile`, { credentials: "include" }).then((r) => r.json());
      const res = await apiRequest("PUT", `/api/socialsync/clients/${clientId}/profile`, {
        enabled,
        niche: cur.niche,
        location: cur.location,
        services: cur.services,
        tone: cur.tone,
        frequency: cur.frequency,
        autopilot: cur.autopilot,
        platform_preferences: cur.platform_preferences,
        service_focus: cur.service_focus,
      });
      return res.json();
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/socialsync/ops/overview"] });
      toast({ title: vars.enabled ? "SocialSync activated" : "SocialSync paused" });
    },
    onError: () => toast({ title: "Couldn't update", variant: "destructive" }),
  });

  const metrics = data?.metrics;
  const clients = data?.clients || [];

  const filtered = clients.filter((c) => {
    switch (filter) {
      case "at_risk": return c.at_risk;
      case "failed": return c.failed_queue > 0;
      case "expired": return c.fb_status === "expired" || c.ig_status === "expired" || c.gbp_status === "expired";
      case "expiring": return [c.fb_status, c.ig_status, c.gbp_status].includes("expiring_soon");
      case "fb_connected": return c.fb_status === "connected" || c.fb_status === "expiring_soon";
      case "ig_connected": return c.ig_status === "connected" || c.ig_status === "expiring_soon";
      case "gbp_connected": return c.gbp_status === "connected" || c.gbp_status === "expiring_soon";
      default: return true;
    }
  });

  /** Click a metric → filter the table (toggles off if already active). */
  const applyFilter = (key: string) => setFilter((cur) => (cur === key ? "all" : key));

  if (isLoading) {
    return (
      <AdminLayout pageContext={{ page: "socialsync_ops" }}>
        <div className="max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageContext={{ page: "socialsync_ops" }}>
      <TooltipProvider>
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">SocialSync Operations</h1>
              <p className="text-xs text-gray-500">Cross-client health and publishing status</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Utility actions */}
              <Button size="sm" variant="outline" onClick={() => processQueue.mutate()} disabled={processQueue.isPending}>
                {processQueue.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Process Queue"}
              </Button>
              <div className="flex flex-col items-start">
                <Button size="sm" variant="outline" onClick={() => checkExpiry.mutate()} disabled={checkExpiry.isPending}>
                  {checkExpiry.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Check Expiry"}
                </Button>
                <span className="text-[10px] text-gray-400 mt-0.5">
                  {lastExpiryCheck ? `Last checked: ${relativeTime(lastExpiryCheck)}` : "Not checked yet"}
                </span>
              </div>
              {/* Heavy action — set apart + confirmed so it isn't clicked by accident */}
              <div className="h-8 w-px bg-gray-200 mx-1" />
              <Button
                size="sm"
                variant="outline"
                className="border-[#2D6A4F] text-[#2D6A4F] hover:bg-[#F0F7F4]"
                onClick={() => {
                  if (window.confirm("Generate posts for ALL due autopilot clients now? This runs AI generation and may incur cost.")) {
                    generateAllDue.mutate();
                  }
                }}
                disabled={generateAllDue.isPending}
              >
                {generateAllDue.isPending
                  ? <><RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> Generating…</>
                  : <><Zap className="w-3.5 h-3.5 mr-1" /> Generate All Due</>}
              </Button>
            </div>
          </div>

          {/* Expiring / Expired token banners */}
          <ExpiringConnectionBanners clients={clients} />

          {/* Clustered metric cards */}
          {metrics && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {/* Critical health — far left, red accent */}
              <Card className="border-red-200 p-3">
                <div className="mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-red-700">System Alerts</h2>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <AlertStat label="Queue failures" value={metrics.queue_failures} filterKey="failed" activeFilter={filter} onClick={applyFilter} />
                  <AlertStat label="Expired tokens" value={metrics.expired_tokens} filterKey="expired" activeFilter={filter} onClick={applyFilter} />
                  <AlertStat label="Expiring soon" value={metrics.expiring_soon} filterKey="expiring" activeFilter={filter} onClick={applyFilter} tone="amber" />
                  <AlertStat label="At risk" value={metrics.clients_at_risk} filterKey="at_risk" activeFilter={filter} onClick={applyFilter} />
                </div>
              </Card>

              {/* Integration cluster */}
              <Card className="p-3">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Active API Links</h2>
                <div className="grid grid-cols-3 gap-2">
                  <ApiLinkStat icon={<Facebook className="h-4 w-4 text-blue-600" />} label="Facebook" value={metrics.fb_connected} filterKey="fb_connected" activeFilter={filter} onClick={applyFilter} />
                  <ApiLinkStat icon={<Instagram className="h-4 w-4 text-pink-600" />} label="Instagram" value={metrics.ig_connected} filterKey="ig_connected" activeFilter={filter} onClick={applyFilter} />
                  <ApiLinkStat icon={<Globe className="h-4 w-4 text-green-600" />} label="Google" value={metrics.gbp_connected || 0} filterKey="gbp_connected" activeFilter={filter} onClick={applyFilter} />
                </div>
              </Card>

              {/* Business cluster — far right */}
              <Card className="p-3">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Business</h2>
                <div className="grid grid-cols-3 gap-2">
                  <BizStat label="Revenue/mo" value={profitData ? `$${profitData.totals.revenue}` : "—"} tone="emerald" />
                  <BizStat label="Cost/mo" value={profitData ? `$${profitData.totals.cost}` : "—"} />
                  <BizStat
                    label="Margin"
                    value={profitData?.totals.margin_pct != null ? `${profitData.totals.margin_pct}%` : "—"}
                    tone={profitData?.totals.margin_pct != null && profitData.totals.margin_pct >= 60 ? "emerald" : "amber"}
                  />
                </div>
              </Card>
            </div>
          )}

          {/* Secondary operational counts — slim strip */}
          {metrics && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <span><strong className="text-gray-900">{metrics.total_enabled}</strong> enabled</span>
              <span><strong className="text-gray-900">{metrics.total_autopilot}</strong> on autopilot</span>
              <span><strong className="text-gray-900">{metrics.queued_due_today}</strong> due today</span>
              <span><strong className="text-gray-900">{metrics.published_24h}</strong> published 24h</span>
              <span><strong className="text-gray-900">{metrics.published_7d}</strong> published 7d</span>
              {(metrics.clients_in_cooldown || 0) > 0 && (
                <span className="text-purple-700"><strong>{metrics.clients_in_cooldown}</strong> in cooldown</span>
              )}
              {(metrics.clients_suppressed || 0) > 0 && (
                <span className="text-red-700"><strong>{metrics.clients_suppressed}</strong> suppressed</span>
              )}
            </div>
          )}

          {/* Table */}
          <Card>
            <div className="flex items-center justify-between border-b border-gray-100 p-3">
              <div className="flex items-center gap-2">
                {filter !== "all" ? (
                  <button
                    onClick={() => setFilter("all")}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-200"
                  >
                    {FILTER_LABELS[filter] || filter}
                    <X className="h-3 w-3" />
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">Click a metric above to filter</span>
                )}
              </div>
              <span className="text-xs text-gray-400">{filtered.length} client(s)</span>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`w-14 ${TD_DIVIDER}`}>ID</TableHead>
                    <TableHead className={TD_DIVIDER}>Client</TableHead>
                    <TableHead className={TD_DIVIDER}>Location</TableHead>
                    <TableHead className={`text-center ${TD_DIVIDER}`}>Revenue</TableHead>
                    <TableHead className={`text-center ${TD_DIVIDER}`}>Cost</TableHead>
                    <TableHead className={`text-center ${TD_DIVIDER}`}>Margin</TableHead>
                    <TableHead className={`text-center ${TD_DIVIDER}`}>Connections</TableHead>
                    <TableHead className={`text-center ${TD_DIVIDER}`}>Mode</TableHead>
                    <TableHead className={`text-center ${TD_DIVIDER}`}>Upcoming</TableHead>
                    <TableHead className={`text-center ${TD_DIVIDER}`}>Pub 7d</TableHead>
                    <TableHead className={`text-center ${TD_DIVIDER}`}>Fails</TableHead>
                    <TableHead className={`text-center ${TD_DIVIDER}`}>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const p = profitMap.get(c.client_id);
                    const inCooldown = Object.values(c.cooldown || {}).some((v) => v.cooling_down);
                    const toggling = toggleEnabled.isPending && toggleEnabled.variables?.clientId === c.client_id;
                    return (
                      <TableRow key={c.client_id} className={c.at_risk ? "bg-red-50/50" : ""}>
                        <TableCell className={`font-mono text-xs ${TD_DIVIDER}`}>{c.client_id}</TableCell>
                        <TableCell className={TD_DIVIDER}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{c.business_name || c.niche || "—"}</span>
                            {c.at_risk && (
                              <IconTip
                                icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                                label={`At risk: ${c.risk_reasons.join(", ").replace(/_/g, " ") || "unknown"}`}
                              />
                            )}
                            {inCooldown && (
                              <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                                Cooldown
                              </span>
                            )}
                          </div>
                          {c.business_name && c.niche && (
                            <span className="block text-[10px] capitalize text-gray-400">{c.niche}</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-xs text-gray-500 ${TD_DIVIDER}`}>{c.location || "—"}</TableCell>
                        <TableCell className={`text-center text-xs ${TD_DIVIDER}`}>
                          {p ? `$${p.revenue}` : <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className={`text-center text-xs ${TD_DIVIDER}`}>
                          {p ? `$${p.cost}` : <span className="text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className={`text-center ${TD_DIVIDER}`}>
                          {p && p.margin !== null ? (
                            <span className={`text-xs font-medium ${p.margin >= 70 ? "text-emerald-600" : p.margin >= 40 ? "text-amber-600" : "text-red-600"}`}>
                              {p.margin}%
                            </span>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </TableCell>
                        <TableCell className={TD_DIVIDER}>
                          <div className="flex items-center justify-center gap-1.5">
                            <ConnIndicator platform="fb" status={c.fb_status} />
                            <ConnIndicator platform="ig" status={c.ig_status} />
                            <ConnIndicator platform="gbp" status={c.gbp_status || "not_connected"} />
                          </div>
                        </TableCell>
                        <TableCell className={`text-center ${TD_DIVIDER}`}>
                          {c.autopilot ? (
                            <Badge className="bg-emerald-50 text-emerald-700 text-[10px]">Autopilot</Badge>
                          ) : (
                            <span className="text-[10px] text-gray-400">Manual</span>
                          )}
                        </TableCell>
                        <TableCell className={`text-center text-sm ${TD_DIVIDER}`}>{c.upcoming_posts}</TableCell>
                        <TableCell className={`text-center text-sm ${TD_DIVIDER}`}>{c.published_7d}</TableCell>
                        <TableCell className={`text-center ${TD_DIVIDER}`}>
                          {c.failed_queue > 0
                            ? <span className="text-xs font-semibold text-red-600">{c.failed_queue}</span>
                            : <span className="text-xs text-gray-300">0</span>}
                        </TableCell>
                        <TableCell className={`${TD_DIVIDER}`}>
                          <div className="flex items-center justify-center gap-1.5">
                            <Switch
                              checked={c.enabled}
                              disabled={toggling}
                              onCheckedChange={(checked) => toggleEnabled.mutate({ clientId: c.client_id, enabled: checked })}
                              aria-label={c.enabled ? "Deactivate" : "Activate"}
                            />
                            <span className={`text-[10px] ${c.enabled ? "text-emerald-700" : "text-gray-400"}`}>
                              {c.enabled ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link href={`/admin/crm/clients/${c.client_id}?tab=socialsync`}>
                            <Button size="sm" variant="ghost" className="h-7 text-xs">
                              <ExternalLink className="w-3 h-3 mr-1" /> Open
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} className="py-8 text-center text-sm text-gray-500">
                        No clients match the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-gray-100 md:hidden">
              {filtered.map((c) => {
                const p = profitMap.get(c.client_id);
                const toggling = toggleEnabled.isPending && toggleEnabled.variables?.clientId === c.client_id;
                return (
                  <div key={c.client_id} className={`p-3 ${c.at_risk ? "bg-red-50/50" : ""}`}>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">#{c.client_id}</span>
                        <span className="text-sm font-medium">{c.business_name || c.niche || "—"}</span>
                      </div>
                      <Switch
                        checked={c.enabled}
                        disabled={toggling}
                        onCheckedChange={(checked) => toggleEnabled.mutate({ clientId: c.client_id, enabled: checked })}
                        aria-label={c.enabled ? "Deactivate" : "Activate"}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">{c.location || "No location"}</span>
                      {c.autopilot && <Badge className="bg-emerald-50 text-emerald-700 text-[10px]">Autopilot</Badge>}
                      <ConnIndicator platform="fb" status={c.fb_status} />
                      <ConnIndicator platform="ig" status={c.ig_status} />
                      <ConnIndicator platform="gbp" status={c.gbp_status || "not_connected"} />
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      <span>{c.upcoming_posts} upcoming</span>
                      <span>{c.published_7d} pub/7d</span>
                      {c.failed_queue > 0 && <span className="font-medium text-red-500">{c.failed_queue} failed</span>}
                      {p && p.margin !== null && <span>{p.margin}% margin</span>}
                    </div>
                    {c.at_risk && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> {c.risk_reasons.join(", ").replace(/_/g, " ")}
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-8 text-center text-sm text-gray-500">No clients match the current filter.</div>
              )}
            </div>
          </Card>
        </div>
      </TooltipProvider>
    </AdminLayout>
  );
}

/* ─── Sub-components ─── */

function AlertStat({
  label, value, filterKey, activeFilter, onClick, tone = "red",
}: {
  label: string;
  value: number;
  filterKey: string;
  activeFilter: string;
  onClick: (key: string) => void;
  tone?: "red" | "amber";
}) {
  const active = activeFilter === filterKey;
  const danger = value > 0;
  const dangerClass = danger
    ? tone === "amber" ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50"
    : "border-gray-200 bg-white";
  return (
    <button
      type="button"
      onClick={() => onClick(filterKey)}
      className={`flex flex-col items-start rounded-lg border p-2 text-left transition-all hover:shadow-sm ${dangerClass} ${
        active ? "ring-2 ring-indigo-400 ring-offset-1" : ""
      }`}
    >
      <span className={`text-lg font-bold leading-none ${danger ? (tone === "amber" ? "text-amber-700" : "text-red-600") : "text-gray-400"}`}>
        {value}
      </span>
      <span className="mt-1 text-[10px] text-gray-600">{label}</span>
    </button>
  );
}

function ApiLinkStat({
  icon, label, value, filterKey, activeFilter, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  filterKey: string;
  activeFilter: string;
  onClick: (key: string) => void;
}) {
  const active = activeFilter === filterKey;
  return (
    <button
      type="button"
      onClick={() => onClick(filterKey)}
      className={`flex flex-col items-center rounded-lg border p-2 transition-all hover:bg-gray-50 ${
        active ? "border-indigo-300 ring-2 ring-indigo-400 ring-offset-1" : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-lg font-bold leading-none text-gray-900">{value}</span>
      </div>
      <span className="mt-1 text-[10px] text-gray-500">{label}</span>
    </button>
  );
}

function BizStat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" }) {
  const color = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 p-2 text-center">
      <p className={`text-base font-bold leading-none ${color}`}>{value}</p>
      <p className="mt-1 text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

/**
 * Renders amber/red banners for any client whose Facebook or Instagram
 * connection is "expiring_soon" or "expired". Each banner links to the
 * client's SocialSync tab to start the re-auth OAuth flow.
 */
function ExpiringConnectionBanners({ clients }: { clients: ClientSummary[] }) {
  const alerts: { clientId: number; businessName: string; platform: string; status: string }[] = [];

  for (const c of clients) {
    if (c.fb_status === "expired" || c.fb_status === "expiring_soon") {
      alerts.push({ clientId: c.client_id, businessName: c.business_name || c.niche || `Client #${c.client_id}`, platform: "Facebook", status: c.fb_status });
    }
    if (c.ig_status === "expired" || c.ig_status === "expiring_soon") {
      alerts.push({ clientId: c.client_id, businessName: c.business_name || c.niche || `Client #${c.client_id}`, platform: "Instagram", status: c.ig_status });
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const isExpired = a.status === "expired";
        return (
          <div
            key={`${a.clientId}-${a.platform}`}
            className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
              isExpired ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"
            }`}
          >
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className={`h-4 w-4 ${isExpired ? "text-red-500" : "text-amber-500"}`} />
              <span>
                <strong>{a.platform}</strong> connection for <strong>{a.businessName}</strong>{" "}
                {isExpired ? "has expired." : "is expiring soon."}{" "}
                Re-authorize to avoid publishing disruptions.
              </span>
            </div>
            <Link href={`/admin/crm/clients/${a.clientId}?tab=socialsync`}>
              <Button
                size="sm"
                variant="outline"
                className={`h-7 text-xs ${
                  isExpired ? "border-red-300 text-red-700 hover:bg-red-100" : "border-amber-300 text-amber-700 hover:bg-amber-100"
                }`}
              >
                Re-authorize
              </Button>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
