/**
 * WebCare Admin Oversight Panel.
 *
 * Read-only admin view of every active WebCare client_service. Reads
 * GET /api/admin/crm/webcare/ops (see adminCrmRoutes.ts), which composes
 * data the webcare health + maintenance workers already write into
 * client_services.metadata — no new storage was added for this page.
 *
 * Surfaces the audit-report gap: per-client uptime / plugin / health /
 * content state and the headline "is anything failing right now?" tiles.
 *
 * No editable form — listed in scripts/copilot-form-exempt.txt.
 */

import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Globe,
  Loader2,
  RotateCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { csvDownload, todayIso } from "@/lib/csvDownload";

/** Mirrors WebCareOpsRow in server/storage.ts. */
interface WebCareOpsRow {
  client_service_id: number;
  client_id: number;
  business_name: string;
  website_url: string | null;
  service_id: string;
  plan_tier: "basic" | "pro" | "unknown";
  cs_status: string;
  last_uptime_check: { ts: string; status: "up" | "down"; http_status: number | null } | null;
  uptime_percent_30d: number | null;
  last_plugin_update_at: string | null;
  last_health_check_at: string | null;
  content_automation: { last_published_at: string | null; published_this_month: number } | null;
  last_downtime_alert_at: string | null;
}

interface WebCareOpsResponse {
  generated_at: string;
  total_active: number;
  failing_uptime_24h: number;
  overdue_plugin_updates: number;
  overdue_health_checks: number;
  rows: WebCareOpsRow[];
}

function formatRel(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  icon?: React.ElementType;
}) {
  const accent =
    tone === "good" ? "bg-emerald-500" :
    tone === "warn" ? "bg-amber-500" :
    tone === "bad" ? "bg-red-500" :
    "bg-gray-500";
  return (
    <Card data-theme="light" className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
          {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
        </div>
        {Icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
    </Card>
  );
}

function uptimeTone(percent: number | null): "good" | "warn" | "bad" | "neutral" {
  if (percent == null) return "neutral";
  if (percent >= 99.5) return "good";
  if (percent >= 98) return "warn";
  return "bad";
}

function planBadge(tier: "basic" | "pro" | "unknown") {
  if (tier === "pro") {
    return <Badge className="bg-[#0d3cfc]/10 text-[#0d3cfc] hover:bg-[#0d3cfc]/10">Pro</Badge>;
  }
  if (tier === "basic") {
    return <Badge variant="outline" className="text-gray-700">Basic</Badge>;
  }
  return <Badge variant="outline" className="text-gray-500">{tier}</Badge>;
}

export default function WebCareOpsPage() {
  usePageTitle("WebCare Ops");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<WebCareOpsResponse>({
    queryKey: ["/api/admin/crm/webcare/ops"],
    queryFn: async () => {
      const res = await fetch("/api/admin/crm/webcare/ops", { credentials: "include" });
      if (!res.ok) throw new Error(`webcare-ops ${res.status}`);
      return res.json();
    },
    refetchInterval: 60_000, // matches MapGuard ops cadence
  });

  const rows = data?.rows ?? [];

  const exportCsv = () => {
    if (!rows.length) return;
    csvDownload<WebCareOpsRow>({
      filename: `webcare-ops-${todayIso()}.csv`,
      columns: [
        { header: "client_service_id", value: (r) => r.client_service_id },
        { header: "client_id", value: (r) => r.client_id },
        { header: "business_name", value: (r) => r.business_name },
        { header: "website_url", value: (r) => r.website_url },
        { header: "plan_tier", value: (r) => r.plan_tier },
        { header: "cs_status", value: (r) => r.cs_status },
        { header: "uptime_percent_30d", value: (r) => r.uptime_percent_30d },
        { header: "last_uptime_check_ts", value: (r) => r.last_uptime_check?.ts ?? "" },
        { header: "last_uptime_check_status", value: (r) => r.last_uptime_check?.status ?? "" },
        { header: "last_uptime_http_status", value: (r) => r.last_uptime_check?.http_status ?? "" },
        { header: "last_plugin_update_at", value: (r) => r.last_plugin_update_at },
        { header: "last_health_check_at", value: (r) => r.last_health_check_at },
        { header: "content_published_this_month", value: (r) => r.content_automation?.published_this_month ?? "" },
        { header: "last_content_published_at", value: (r) => r.content_automation?.last_published_at ?? "" },
        { header: "last_downtime_alert_at", value: (r) => r.last_downtime_alert_at },
      ],
      rows,
    });
  };

  return (
    <AdminLayout pageContext={{ page: "webcare-ops" }}>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#0d3cfc]" />
              WebCare Ops
            </h1>
            <p className="text-sm text-gray-500">
              Per-client uptime, plugin updates, and health-check state across every active WebCare subscriber.
              {data && <> Last refreshed {new Date(data.generated_at).toLocaleTimeString()}.</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RotateCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {isError && (
          <Card className="p-4 border-red-200 bg-red-50">
            <p className="text-sm text-red-800">
              Couldn't load WebCare ops data.{" "}
              <button onClick={() => refetch()} className="underline font-medium">Retry</button>
            </p>
          </Card>
        )}

        {/* Summary tiles */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Active clients"
              value={data.total_active}
              icon={CheckCircle2}
              tone="good"
            />
            <StatCard
              label="Failing uptime (24h)"
              value={data.failing_uptime_24h}
              hint="last check was DOWN"
              icon={AlertTriangle}
              tone={data.failing_uptime_24h > 0 ? "bad" : "good"}
            />
            <StatCard
              label="Overdue plugin updates"
              value={data.overdue_plugin_updates}
              hint="no run in 40 days"
              icon={Wrench}
              tone={data.overdue_plugin_updates > 0 ? "warn" : "good"}
            />
            <StatCard
              label="Overdue health checks"
              value={data.overdue_health_checks}
              hint="no run in 40 days"
              icon={Activity}
              tone={data.overdue_health_checks > 0 ? "warn" : "good"}
            />
          </div>
        )}

        {/* Per-client table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Uptime (30d)</TableHead>
                <TableHead className="hidden md:table-cell">Last check</TableHead>
                <TableHead className="hidden md:table-cell">Plugins</TableHead>
                <TableHead className="hidden lg:table-cell">Health</TableHead>
                <TableHead className="hidden lg:table-cell">Content (this month)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-gray-500">
                    No active WebCare clients yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const tone = uptimeTone(r.uptime_percent_30d);
                  const uptimeClass =
                    tone === "good" ? "text-emerald-600" :
                    tone === "warn" ? "text-amber-600" :
                    tone === "bad" ? "text-red-600" :
                    "text-gray-400";
                  const lastDown = r.last_uptime_check?.status === "down";
                  return (
                    <TableRow key={r.client_service_id}>
                      <TableCell>
                        <a
                          href={`/admin/crm/clients/${r.client_id}`}
                          className="font-medium text-gray-900 hover:text-[#0d3cfc] hover:underline"
                        >
                          {r.business_name}
                        </a>
                        {r.website_url && (
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Globe className="w-3 h-3" />
                            <span className="truncate max-w-[260px]">{r.website_url}</span>
                          </div>
                        )}
                        {r.cs_status !== "active" && (
                          <Badge variant="outline" className="mt-1 text-[10px] text-amber-700 border-amber-300">
                            {r.cs_status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{planBadge(r.plan_tier)}</TableCell>
                      <TableCell>
                        <span className={`text-sm font-semibold ${uptimeClass}`}>
                          {r.uptime_percent_30d == null ? "-" : `${r.uptime_percent_30d.toFixed(1)}%`}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {r.last_uptime_check ? (
                          <div>
                            <div className="text-xs text-gray-700 flex items-center gap-1.5">
                              {lastDown ? (
                                <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                                  <AlertTriangle className="w-3 h-3" /> Down
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                  <CheckCircle2 className="w-3 h-3" /> Up
                                </span>
                              )}
                              {r.last_uptime_check.http_status != null && (
                                <code className="text-[10px] bg-gray-100 text-gray-600 px-1 rounded">
                                  {r.last_uptime_check.http_status}
                                </code>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500">{formatRel(r.last_uptime_check.ts)}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">never</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-xs text-gray-600">{formatRel(r.last_plugin_update_at)}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-xs text-gray-600">{formatRel(r.last_health_check_at)}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {r.content_automation ? (
                          <div>
                            <span className="text-xs font-medium text-gray-700">
                              {r.content_automation.published_this_month} published
                            </span>
                            <div className="text-[11px] text-gray-500">
                              last: {formatRel(r.content_automation.last_published_at)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AdminLayout>
  );
}
