/**
 * /admin/system-health — Phase 3E.
 *
 * Read-only operator dashboard for cross-cutting integration health.
 * Backed by GET /api/admin/system/integrations-health (Phase 3D).
 * Refresh on interval and on manual click. Never displays secret
 * values — only presence booleans.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";

type SystemStatus = "ok" | "degraded" | "critical";

interface SystemHealthReport {
  status: SystemStatus;
  generated_at: string;
  window_hours: number;
  is_production: boolean;
  webhook_secrets: { stripe: boolean; vapi: boolean; outreach: boolean };
  errors: {
    total: number;
    critical: number;
    error: number;
    warning: number;
    info: number;
    by_integration: Array<{ integration_name: string; severity: string; count: number }>;
  };
  recent_critical: Array<{
    id: number;
    integration_name: string;
    area: string | null;
    severity: string;
    message: string;
    error_code: string | null;
    status_code: number | null;
    request_id: string | null;
    client_id: number | null;
    created_at: string;
  }>;
  workers: Array<{
    job_name: string;
    last_status: "completed" | "failed" | "running" | "unknown";
    last_started_at: string | null;
    last_finished_at: string | null;
    last_error: string | null;
    last_success_at: string | null;
    last_failure_at: string | null;
  }>;
  queue_depths: {
    notification_queue_pending: number;
    followup_jobs_pending: number;
    dunning_events_pending: number;
    content_drafts_queued: number;
    content_drafts_publishing: number;
  };
  alerts: string[];
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function statusStyle(status: SystemStatus): { label: string; className: string; Icon: typeof CheckCircle2 } {
  if (status === "critical") return { label: "Critical", className: "bg-red-100 text-red-800 border-red-300", Icon: ShieldAlert };
  if (status === "degraded") return { label: "Degraded", className: "bg-amber-100 text-amber-800 border-amber-300", Icon: AlertTriangle };
  return { label: "Healthy", className: "bg-emerald-100 text-emerald-800 border-emerald-300", Icon: ShieldCheck };
}

function severityBadge(sev: string): string {
  if (sev === "critical") return "bg-red-100 text-red-800 border-red-300";
  if (sev === "error") return "bg-orange-100 text-orange-800 border-orange-300";
  if (sev === "warning") return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function workerRowStyle(status: string): string {
  if (status === "failed") return "text-red-700";
  if (status === "running") return "text-blue-700";
  if (status === "completed") return "text-slate-700";
  return "text-slate-400";
}

export default function SystemHealthPage() {
  usePageTitle("System Health");
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<SystemHealthReport>({
    queryKey: ["/api/admin/system/integrations-health"],
    refetchInterval: 60_000, // auto-refresh every minute
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">System health</h1>
            <p className="text-sm text-slate-500">
              Cross-integration error visibility and worker status. Auto-refreshes every minute.
              Last updated {dataUpdatedAt ? formatRelative(new Date(dataUpdatedAt).toISOString()) : "—"}.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </header>

        {isError && (
          <Card className="border-red-200 bg-red-50 p-4 text-red-800">
            Failed to load system health. Check the server logs.
          </Card>
        )}

        {isLoading && !data && (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {data && (() => {
          const s = statusStyle(data.status);
          const Icon = s.Icon;
          return (
            <>
              {/* Status header */}
              <Card className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Icon className="h-8 w-8 text-slate-700" />
                    <div>
                      <Badge className={`border ${s.className}`}>{s.label}</Badge>
                      <p className="mt-1 text-sm text-slate-500">
                        Window: last {data.window_hours}h · {data.is_production ? "production" : "non-prod"} ·
                        {" "}generated {formatRelative(data.generated_at)}
                      </p>
                    </div>
                  </div>
                </div>
                {data.alerts.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t pt-3 text-sm">
                    {data.alerts.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-slate-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Webhook secrets */}
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Webhook secrets configured</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(["stripe", "vapi", "outreach"] as const).map((name) => {
                    const present = data.webhook_secrets[name];
                    return (
                      <div
                        key={name}
                        className={`rounded border p-3 text-sm ${
                          present ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
                        }`}
                      >
                        <div className="font-mono text-xs uppercase">{name}</div>
                        <div className="mt-1 text-base font-medium">{present ? "configured" : "missing"}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Error counts */}
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">
                  Integration errors — last {data.window_hours}h
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    { label: "Total", value: data.errors.total, className: "border-slate-200 bg-slate-50 text-slate-800" },
                    { label: "Critical", value: data.errors.critical, className: "border-red-200 bg-red-50 text-red-800" },
                    { label: "Error", value: data.errors.error, className: "border-orange-200 bg-orange-50 text-orange-800" },
                    { label: "Warning", value: data.errors.warning, className: "border-amber-200 bg-amber-50 text-amber-800" },
                    { label: "Info", value: data.errors.info, className: "border-slate-200 bg-slate-50 text-slate-700" },
                  ].map((cell) => (
                    <div key={cell.label} className={`rounded border p-3 text-center ${cell.className}`}>
                      <div className="text-xs uppercase">{cell.label}</div>
                      <div className="mt-1 text-2xl font-semibold">{cell.value}</div>
                    </div>
                  ))}
                </div>
                {data.errors.by_integration.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Integration</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.errors.by_integration.map((row, i) => (
                          <TableRow key={`${row.integration_name}-${row.severity}-${i}`}>
                            <TableCell className="font-mono text-xs">{row.integration_name}</TableCell>
                            <TableCell>
                              <Badge className={`border ${severityBadge(row.severity)}`}>{row.severity}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{row.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>

              {/* Recent critical errors */}
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">
                  Recent critical errors
                </h2>
                {data.recent_critical.length === 0 ? (
                  <p className="text-sm text-slate-500">No critical errors in the window — nice.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Integration</TableHead>
                          <TableHead>Area</TableHead>
                          <TableHead>Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recent_critical.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-nowrap text-xs text-slate-600">
                              {formatRelative(row.created_at)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{row.integration_name}</TableCell>
                            <TableCell className="font-mono text-xs text-slate-600">{row.area ?? "—"}</TableCell>
                            <TableCell className="max-w-md truncate text-sm" title={row.message}>
                              {row.message}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>

              {/* Queue depths */}
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Queue depths (pending)</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    { label: "Notifications", value: data.queue_depths.notification_queue_pending },
                    { label: "Followup jobs", value: data.queue_depths.followup_jobs_pending },
                    { label: "Dunning", value: data.queue_depths.dunning_events_pending },
                    { label: "CF queued", value: data.queue_depths.content_drafts_queued },
                    { label: "CF publishing", value: data.queue_depths.content_drafts_publishing },
                  ].map((c) => (
                    <div key={c.label} className="rounded border border-slate-200 bg-slate-50 p-3 text-center text-slate-800">
                      <div className="text-xs uppercase">{c.label}</div>
                      <div className="mt-1 text-2xl font-semibold">{c.value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Workers */}
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Workers</h2>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead>Last status</TableHead>
                        <TableHead>Last success</TableHead>
                        <TableHead>Last failure</TableHead>
                        <TableHead>Last error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.workers.map((w) => (
                        <TableRow key={w.job_name}>
                          <TableCell className="font-mono text-xs">{w.job_name}</TableCell>
                          <TableCell className={`font-mono text-xs ${workerRowStyle(w.last_status)}`}>
                            {w.last_status}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">{formatRelative(w.last_success_at)}</TableCell>
                          <TableCell className="text-xs text-slate-600">{formatRelative(w.last_failure_at)}</TableCell>
                          <TableCell className="max-w-md truncate text-xs text-red-700" title={w.last_error ?? undefined}>
                            {w.last_error ?? ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </>
          );
        })()}
      </div>
    </AdminLayout>
  );
}
