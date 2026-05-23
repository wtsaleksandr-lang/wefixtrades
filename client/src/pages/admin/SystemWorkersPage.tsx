import { usePageTitle } from "@/hooks/usePageTitle";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Play,
  ChevronDown,
  ChevronUp,
  Activity,
  Zap,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ─── */
interface Worker {
  name: string;
  job_name: string;
  schedule: string;
  interval_minutes: number;
  last_run_at: string | null;
  last_finished_at: string | null;
  last_status: string;
  last_error: string | null;
  stale: boolean;
}

interface WorkersResponse {
  workers: Worker[];
  summary: {
    total: number;
    healthy: number;
    stale: number;
    failed: number;
  };
}

interface HistoryRow {
  id: number;
  job_name: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  metadata: any;
}

/* ─── Helpers ─── */
function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function statusDot(w: Worker): { color: string; label: string } {
  if (w.last_status === "failed") return { color: "bg-red-500", label: "Failed" };
  if (w.stale) return { color: "bg-amber-400", label: "Stale" };
  if (w.last_status === "completed") return { color: "bg-emerald-500", label: "Healthy" };
  if (w.last_status === "running") return { color: "bg-blue-500 animate-pulse", label: "Running" };
  return { color: "bg-gray-300", label: "No runs" };
}

function healthBadgeText(summary: WorkersResponse["summary"]): {
  text: string;
  style: string;
} {
  if (summary.failed > 0) {
    return {
      text: `${summary.failed} worker${summary.failed > 1 ? "s" : ""} failed`,
      style: "bg-red-50 text-red-700 border-red-200",
    };
  }
  if (summary.stale > 0) {
    return {
      text: `${summary.stale} worker${summary.stale > 1 ? "s" : ""} stale`,
      style: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }
  return { text: "All healthy", style: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

/* ─── Worker history panel ─── */
function WorkerHistory({ jobName }: { jobName: string }) {
  const { data, isLoading } = useQuery<{ data: HistoryRow[] }>({
    queryKey: [`/api/admin/system/workers/${jobName}/history`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/system/workers/${jobName}/history?limit=10`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div data-theme="light" className="py-4 text-center">
        <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
      </div>
    );
  }

  const rows = data?.data ?? [];

  return (
    <div className="mt-3 border-t pt-3">
      <p className="text-xs font-medium text-gray-500 mb-2">Last 10 runs</p>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No run history</p>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                    row.status === "completed"
                      ? "bg-emerald-50 text-emerald-700"
                      : row.status === "failed"
                        ? "bg-red-50 text-red-700"
                        : "bg-blue-50 text-blue-700"
                  )}
                >
                  {row.status}
                </span>
                <span className="text-gray-400">{formatRelativeTime(row.started_at)}</span>
              </div>
              <span className="text-gray-400">{formatDuration(row.started_at, row.finished_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Worker card ��── */
function WorkerCard({ worker }: { worker: Worker }) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { color, label } = statusDot(worker);

  const runMutation = useMutation({
    mutationFn: async () => {
      setRunning(true);
      const res = await apiRequest("POST", `/api/admin/system/workers/${worker.job_name}/run`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Worker triggered", description: `${worker.name} completed${data.result ? "" : " (no result)"}` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system/workers"] });
    },
    onError: (err: any) => {
      toast({ title: "Worker failed", description: err.message, variant: "destructive" });
    },
    onSettled: () => setRunning(false),
  });

  return (
    <div className={cn(
      "bg-white rounded-lg border p-4 transition-shadow hover:shadow-sm",
      worker.last_status === "failed" && "border-red-200",
      worker.stale && worker.last_status !== "failed" && "border-amber-200",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", color)} />
          <h3 className="text-sm font-medium text-gray-900">{worker.name}</h3>
        </div>
        <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
          {worker.schedule}
        </span>
      </div>

      {/* Status info */}
      <div className="space-y-1.5 text-xs text-gray-500">
        <div className="flex justify-between">
          <span>Status</span>
          <span className={cn(
            "font-medium",
            worker.last_status === "completed" && "text-emerald-600",
            worker.last_status === "failed" && "text-red-600",
            worker.last_status === "running" && "text-blue-600",
            worker.last_status === "never_run" && "text-gray-400",
          )}>
            {label}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Last run</span>
          <span className="text-gray-700">{formatRelativeTime(worker.last_run_at)}</span>
        </div>
        {worker.last_error && (
          <div className="mt-1">
            <p className="text-red-600 truncate" title={worker.last_error}>
              {worker.last_error.slice(0, 60)}...
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t">
        <button
          onClick={(e) => {
            e.stopPropagation();
            runMutation.mutate();
          }}
          disabled={running}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          {running ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          Run Now
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors ml-auto"
        >
          History
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Expandable history */}
      {expanded && <WorkerHistory jobName={worker.job_name} />}
    </div>
  );
}

/* ─── Main page ─── */
export default function SystemWorkersPage() {
  usePageTitle("Worker Status");

  const [autoRefresh, setAutoRefresh] = useState(false);

  const {
    data: workersData,
    isLoading,
    refetch,
  } = useQuery<WorkersResponse>({
    queryKey: ["/api/admin/system/workers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system/workers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load workers");
      return res.json();
    },
  });

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => refetch(), 30000);
    return () => clearInterval(id);
  }, [autoRefresh, refetch]);

  const summary = workersData?.summary;
  const badge = summary ? healthBadgeText(summary) : null;

  return (
    <AdminLayout pageContext={{ page: "system_workers" }}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Worker Status</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Real-time status of all {workersData?.summary.total ?? "..."} cron workers
              </p>
            </div>
            {badge && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border",
                  badge.style
                )}
              >
                {summary!.failed > 0 ? (
                  <XCircle className="w-3.5 h-3.5" />
                ) : summary!.stale > 0 ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                {badge.text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                autoRefresh
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", autoRefresh && "animate-spin")} />
              Auto-refresh {autoRefresh ? "ON" : "OFF"}
            </button>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary row */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-1">
                <Server className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-500 uppercase">Total Workers</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-medium text-gray-500 uppercase">Healthy</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{summary.healthy}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-gray-500 uppercase">Stale</span>
              </div>
              <p className="text-2xl font-bold text-amber-600">{summary.stale}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs font-medium text-gray-500 uppercase">Failed</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{summary.failed}</p>
            </div>
          </div>
        )}

        {/* Worker grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {workersData?.workers
              .sort((a, b) => {
                // Sort: failed first, then stale, then healthy
                const rank = (w: Worker) =>
                  w.last_status === "failed" ? 0 : w.stale ? 1 : 2;
                return rank(a) - rank(b) || a.name.localeCompare(b.name);
              })
              .map((w) => (
                <WorkerCard key={w.job_name} worker={w} />
              ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
