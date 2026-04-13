import { usePageTitle } from "@/hooks/usePageTitle";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Zap, ExternalLink, Filter } from "lucide-react";
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

const STATUS_COLORS: Record<string, string> = {
  connected: "bg-emerald-50 text-emerald-700",
  expiring_soon: "bg-amber-50 text-amber-700",
  expired: "bg-red-50 text-red-700",
  error: "bg-red-50 text-red-700",
  disconnected: "bg-gray-100 text-gray-500",
  not_connected: "bg-gray-100 text-gray-500",
};

function ConnBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[status] || "bg-gray-100 text-gray-500"}`}>
      {status === "connected" ? "OK" : status === "expiring_soon" ? "Expiring" : status === "not_connected" ? "—" : status.replace(/_/g, " ")}
    </span>
  );
}

/* ─── Page ─── */

export default function SocialSyncOpsPage() {
  usePageTitle("SocialSync");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<OpsOverview>({
    queryKey: ["/api/socialsync/ops/overview"],
    refetchInterval: 60000, // Auto-refresh every minute
  });

  const { data: profitData } = useQuery<{
    totals: { revenue: number; cost: number; profit: number; margin_pct: number | null };
    clients: { client_id: number; revenue_usd: number; cost_usd: number; profit_usd: number; margin_pct: number | null; business_name: string | null }[];
  }>({
    queryKey: ["/api/socialsync/ops/profitability"],
    refetchInterval: 300000,
  });

  const profitMap = new Map<number, { revenue: number; cost: number; margin: number | null }>();
  profitData?.clients.forEach(c => profitMap.set(c.client_id, { revenue: c.revenue_usd, cost: c.cost_usd, margin: c.margin_pct }));

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

  const metrics = data?.metrics;
  const clients = data?.clients || [];

  // Apply filter
  const filtered = clients.filter((c) => {
    switch (filter) {
      case "at_risk": return c.at_risk;
      case "autopilot": return c.autopilot;
      case "no_autopilot": return !c.autopilot;
      case "fb_connected": return c.fb_status === "connected" || c.fb_status === "expiring_soon";
      case "ig_connected": return c.ig_status === "connected" || c.ig_status === "expiring_soon";
      case "disconnected": return c.fb_status === "not_connected" || c.fb_status === "disconnected";
      case "expired": return c.fb_status === "expired" || c.ig_status === "expired";
      case "failed": return c.failed_queue > 0;
      case "no_posts": return c.upcoming_posts === 0;
      default: return true;
    }
  });

  if (isLoading) {
    return (
      <AdminLayout pageContext={{ page: "socialsync_ops" }}>
        <div className="max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageContext={{ page: "socialsync_ops" }}>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">SocialSync Operations</h1>
            <p className="text-xs text-gray-500">Cross-client health and publishing status</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => processQueue.mutate()} disabled={processQueue.isPending}>
              {processQueue.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Process Queue"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => checkExpiry.mutate()} disabled={checkExpiry.isPending}>
              Check Expiry
            </Button>
            <Button size="sm" className="bg-[#2D6A4F] hover:bg-[#1B4332]" onClick={() => generateAllDue.mutate()} disabled={generateAllDue.isPending}>
              {generateAllDue.isPending ? <><RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> Generating...</> : <><Zap className="w-3.5 h-3.5 mr-1" /> Generate All Due</>}
            </Button>
          </div>
        </div>

        {/* Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <MetricCard label="Enabled" value={metrics.total_enabled} />
            <MetricCard label="Autopilot" value={metrics.total_autopilot} />
            <MetricCard label="FB Connected" value={metrics.fb_connected} color="emerald" />
            <MetricCard label="IG Connected" value={metrics.ig_connected} color="emerald" />
            <MetricCard label="GBP Connected" value={metrics.gbp_connected || 0} color="emerald" />
            <MetricCard label="Published 24h" value={metrics.published_24h} color="emerald" />
            <MetricCard label="Published 7d" value={metrics.published_7d} color="blue" />
            <MetricCard label="Due Today" value={metrics.queued_due_today} color="amber" />
            <MetricCard label="Queue Failures" value={metrics.queue_failures} color={metrics.queue_failures > 0 ? "red" : undefined} />
            <MetricCard label="Expired Tokens" value={metrics.expired_tokens} color={metrics.expired_tokens > 0 ? "red" : undefined} />
            <MetricCard label="Expiring Soon" value={metrics.expiring_soon} color={metrics.expiring_soon > 0 ? "amber" : undefined} />
            <MetricCard label="At Risk" value={metrics.clients_at_risk} color={metrics.clients_at_risk > 0 ? "red" : undefined} />
            <MetricCard label="In Cooldown" value={metrics.clients_in_cooldown || 0} color={(metrics.clients_in_cooldown || 0) > 0 ? "amber" : undefined} />
            <MetricCard label="Suppressed" value={metrics.clients_suppressed || 0} color={(metrics.clients_suppressed || 0) > 0 ? "red" : undefined} />
            <MetricCard label="Total Clients" value={clients.length} />
            {profitData && (
              <>
                <MetricCard label="Revenue/mo" value={`$${profitData.totals.revenue}`} color="emerald" />
                <MetricCard label="Cost/mo" value={`$${profitData.totals.cost}`} />
                <MetricCard label="Margin" value={profitData.totals.margin_pct != null ? `${profitData.totals.margin_pct}%` : "—"} color={profitData.totals.margin_pct != null && profitData.totals.margin_pct >= 60 ? "emerald" : "amber"} />
              </>
            )}
          </div>
        )}

        {/* Filter + Table */}
        <Card>
          <div className="flex items-center justify-between p-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients ({clients.length})</SelectItem>
                  <SelectItem value="at_risk">At Risk ({clients.filter(c => c.at_risk).length})</SelectItem>
                  <SelectItem value="autopilot">Autopilot On ({clients.filter(c => c.autopilot).length})</SelectItem>
                  <SelectItem value="no_autopilot">Autopilot Off ({clients.filter(c => !c.autopilot).length})</SelectItem>
                  <SelectItem value="fb_connected">FB Connected</SelectItem>
                  <SelectItem value="ig_connected">IG Connected</SelectItem>
                  <SelectItem value="disconnected">Disconnected</SelectItem>
                  <SelectItem value="expired">Expired Token</SelectItem>
                  <SelectItem value="failed">Queue Failures</SelectItem>
                  <SelectItem value="no_posts">No Upcoming Posts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-gray-400">{filtered.length} client(s)</span>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-center">Rate</TableHead>
                  <TableHead className="text-center">Auto</TableHead>
                  <TableHead className="text-center">FB</TableHead>
                  <TableHead className="text-center">IG</TableHead>
                  <TableHead className="text-center">GBP</TableHead>
                  <TableHead className="text-center">Upcoming</TableHead>
                  <TableHead className="text-center">Pub 7d</TableHead>
                  <TableHead className="text-center">Fails</TableHead>
                  <TableHead className="text-center">Margin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.client_id} className={c.at_risk ? "bg-red-50/50" : ""}>
                    <TableCell className="text-xs font-mono">{c.client_id}</TableCell>
                    <TableCell>
                      <span className="text-sm">{c.business_name || c.niche || "—"}</span>
                      {c.business_name && c.niche && <span className="text-[10px] text-gray-400 block capitalize">{c.niche}</span>}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">{c.location || "—"}</TableCell>
                    <TableCell className="text-center">
                      {c.success_rate !== null ? (
                        <span className={`text-xs font-medium ${c.success_rate >= 80 ? "text-emerald-600" : c.success_rate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                          {c.success_rate}%
                        </span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {c.autopilot ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <XCircle className="w-3.5 h-3.5 text-gray-300 mx-auto" />}
                    </TableCell>
                    <TableCell className="text-center"><ConnBadge status={c.fb_status} /></TableCell>
                    <TableCell className="text-center"><ConnBadge status={c.ig_status} /></TableCell>
                    <TableCell className="text-center"><ConnBadge status={c.gbp_status || "not_connected"} /></TableCell>
                    <TableCell className="text-center text-sm">{c.upcoming_posts}</TableCell>
                    <TableCell className="text-center text-sm">{c.published_7d}</TableCell>
                    <TableCell className="text-center">
                      {c.failed_queue > 0
                        ? <span className="text-xs font-medium text-red-600">{c.failed_queue}</span>
                        : <span className="text-xs text-gray-300">0</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const p = profitMap.get(c.client_id);
                        if (!p || p.margin === null) return <span className="text-xs text-gray-300">—</span>;
                        return <span className={`text-xs font-medium ${p.margin >= 70 ? "text-emerald-600" : p.margin >= 40 ? "text-amber-600" : "text-red-600"}`}>{p.margin}%</span>;
                      })()}
                    </TableCell>
                    <TableCell>
                      {Object.entries(c.cooldown || {}).some(([_, v]) => v.cooling_down) && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 mr-1">
                          Cooldown
                        </span>
                      )}
                      {c.at_risk ? (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-[10px] text-amber-700">{c.risk_reasons.join(", ").replace(/_/g, " ")}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-emerald-600">Healthy</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/crm/clients/${c.client_id}?tab=socialsync`}>
                        <Button size="sm" variant="ghost" className="h-7 text-xs">
                          <ExternalLink className="w-3 h-3 mr-1" /> Open
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-8 text-sm text-gray-500">
                      No clients match the current filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filtered.map((c) => (
              <div key={c.client_id} className={`p-3 ${c.at_risk ? "bg-red-50/50" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500">#{c.client_id}</span>
                    <span className="text-sm font-medium">{c.business_name || c.niche || "—"}</span>
                  </div>
                  <Link href={`/admin/crm/clients/${c.client_id}?tab=socialsync`}>
                    <Button size="sm" variant="ghost" className="h-7 text-xs"><ExternalLink className="w-3 h-3" /></Button>
                  </Link>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">{c.location || "No location"}</span>
                  {c.autopilot && <Badge className="bg-emerald-50 text-emerald-700 text-[10px]">Autopilot</Badge>}
                  <ConnBadge status={c.fb_status} />
                  <ConnBadge status={c.ig_status} />
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>{c.upcoming_posts} upcoming</span>
                  <span>{c.published_7d} pub/7d</span>
                  {c.failed_queue > 0 && <span className="text-red-500">{c.failed_queue} failed</span>}
                </div>
                {c.at_risk && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-700">
                    <AlertTriangle className="w-3 h-3" /> {c.risk_reasons.join(", ").replace(/_/g, " ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

/* ─── Sub-components ─── */

function MetricCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  const textColor = color === "emerald" ? "text-emerald-700" : color === "red" ? "text-red-600" : color === "amber" ? "text-amber-700" : color === "blue" ? "text-blue-700" : "text-gray-900";
  return (
    <Card className="p-3 text-center">
      <p className={`text-xl font-bold ${textColor}`}>{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </Card>
  );
}
