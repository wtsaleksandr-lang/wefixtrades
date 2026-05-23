import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  Activity,
  Clock,
  Eye,
  ShieldAlert,
  Loader2,
} from "lucide-react";

interface OpsHealth {
  generated_at: string;
  active_clients: number;
  scans_last_7d: {
    total: number;
    success: number;
    warnings_only: number;
    hard_errors: number;
  };
  scan_errors_breakdown: Record<string, number>;
  recent_failed_scans: Array<{
    snapshot_id: number;
    client_id: number;
    business_name: string;
    captured_at: string;
    errors: string[];
  }>;
  duration_ms: {
    p50: number | null;
    p95: number | null;
    p99: number | null;
    sample_size: number;
  };
  uncovered_clients: Array<{
    client_id: number;
    business_name: string;
    last_scan_at: string | null;
  }>;
  alerts_last_7d: {
    total: number;
    by_type: Record<string, number>;
  };
  serper_outage_signal: {
    scans_last_24h: number;
    serper_errored_scans: number;
    rate: number;
    alert_threshold: number;
    likely_outage: boolean;
  };
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
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
    </Card>
  );
}

function formatRel(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function MapguardOpsPage() {
  useEffect(() => {
    document.title = "MapGuard Ops Health - WeFixTrades Admin";
  }, []);

  const { data, isLoading, error, refetch, isFetching } = useQuery<OpsHealth>({
    queryKey: ["/api/mapguard/ops/health"],
    queryFn: async () => {
      const res = await fetch("/api/mapguard/ops/health", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    refetchInterval: 60_000, // refresh every minute
  });

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">MapGuard Ops Health</h1>
            <p className="text-sm text-gray-500">
              Live scan reliability + Serper / Places error signals.
              {data && <> Last refreshed {new Date(data.generated_at).toLocaleTimeString()}.</>}
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            data-testid="ops-refresh"
          >
            {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
            Refresh
          </button>
        </div>

        {isLoading && (
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        )}
        {error && (
          <Card className="p-4">
            <p className="text-sm text-red-600">Failed to load. Retry in a moment.</p>
          </Card>
        )}

        {data && (
          <>
            {/* Outage banner */}
            {data.serper_outage_signal.likely_outage && (
              <Card className="p-4 border-red-200 bg-red-50">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-900">
                      Likely Serper outage in progress
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      {(data.serper_outage_signal.rate * 100).toFixed(0)}% of scans in the
                      last 24h hit Serper keyword errors
                      ({data.serper_outage_signal.serper_errored_scans} of{" "}
                      {data.serper_outage_signal.scans_last_24h}). Ranking-derived issues are
                      auto-suppressed while the rate is above
                      {" "}{(data.serper_outage_signal.alert_threshold * 100).toFixed(0)}%.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Top stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Active clients"
                value={data.active_clients}
                icon={CheckCircle2}
                tone="good"
              />
              <StatCard
                label="Scans (7d)"
                value={data.scans_last_7d.total}
                hint={`${data.scans_last_7d.success} ok · ${data.scans_last_7d.warnings_only} warn · ${data.scans_last_7d.hard_errors} hard fail`}
                icon={Activity}
                tone={data.scans_last_7d.hard_errors > 0 ? "bad" : data.scans_last_7d.warnings_only > 0 ? "warn" : "good"}
              />
              <StatCard
                label="Coverage gap"
                value={data.uncovered_clients.length}
                hint="active clients with no scan in 14d"
                icon={Eye}
                tone={data.uncovered_clients.length > 0 ? "warn" : "good"}
              />
              <StatCard
                label="Alerts (7d)"
                value={data.alerts_last_7d.total}
                icon={AlertTriangle}
                tone={data.alerts_last_7d.total > 10 ? "warn" : "neutral"}
              />
            </div>

            {/* Latency */}
            {data.duration_ms.sample_size > 0 && (
              <Card className="p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Per-scan duration ({data.duration_ms.sample_size} samples)
                </p>
                <div className="flex flex-wrap gap-6">
                  <Stat label="p50" value={data.duration_ms.p50 ? `${data.duration_ms.p50}ms` : "—"} />
                  <Stat label="p95" value={data.duration_ms.p95 ? `${data.duration_ms.p95}ms` : "—"} />
                  <Stat label="p99" value={data.duration_ms.p99 ? `${data.duration_ms.p99}ms` : "—"} />
                </div>
              </Card>
            )}

            {/* Error breakdown */}
            <Card className="p-4">
              <p className="text-sm font-semibold text-gray-900 mb-2">Scan error breakdown (7d)</p>
              {Object.keys(data.scan_errors_breakdown).length === 0 ? (
                <p className="text-xs text-gray-500">No errors recorded in the last 7 days.</p>
              ) : (
                <ul className="text-sm divide-y divide-gray-100">
                  {Object.entries(data.scan_errors_breakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([code, count]) => (
                      <li key={code} className="py-1.5 flex items-center justify-between">
                        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{code}</code>
                        <span className="font-medium text-gray-900">{count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </Card>

            {/* Recent failed scans */}
            {data.recent_failed_scans.length > 0 && (
              <Card className="p-4">
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  Recent hard-failed scans ({data.recent_failed_scans.length})
                </p>
                <ul className="text-sm divide-y divide-gray-100">
                  {data.recent_failed_scans.map(s => (
                    <li key={s.snapshot_id} className="py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{s.business_name}</p>
                        <p className="text-xs text-gray-500">
                          client #{s.client_id} · {formatRel(s.captured_at)}
                        </p>
                        {s.errors.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {s.errors.map((e, i) => (
                              <code key={i} className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded">{e}</code>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Coverage gap */}
            {data.uncovered_clients.length > 0 && (
              <Card className="p-4">
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  Active clients without a scan in 14 days
                </p>
                <ul className="text-sm divide-y divide-gray-100">
                  {data.uncovered_clients.map(c => (
                    <li key={c.client_id} className="py-1.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{c.business_name}</p>
                        <p className="text-xs text-gray-500">
                          client #{c.client_id} · last scan: {formatRel(c.last_scan_at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Alerts breakdown */}
            {data.alerts_last_7d.total > 0 && (
              <Card className="p-4">
                <p className="text-sm font-semibold text-gray-900 mb-2">Alerts by type (7d)</p>
                <ul className="text-sm divide-y divide-gray-100">
                  {Object.entries(data.alerts_last_7d.by_type)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <li key={type} className="py-1.5 flex items-center justify-between">
                        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{type}</code>
                        <span className="font-medium text-gray-900">{count}</span>
                      </li>
                    ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-0.5 flex items-center gap-1">
        <Clock className="w-3.5 h-3.5 text-gray-400" />
        {value}
      </p>
    </div>
  );
}
