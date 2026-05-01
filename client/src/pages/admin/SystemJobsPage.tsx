import { usePageTitle } from "@/hooks/usePageTitle";
import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface JobLog {
  id: number;
  job_name: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  metadata: any;
}

interface JobSummaryRow {
  job_name: string;
  total_runs_today: number;
  failures_today: number;
  last_run_at: string | null;
  last_status: string;
  last_error: string | null;
  failure_rate: number;
}

interface JobSummary {
  jobs: JobSummaryRow[];
  overall: {
    total_runs_today: number;
    failures_today: number;
    longest_job: { job_name: string; duration_seconds: number } | null;
    most_failures: { job_name: string; failure_count: number } | null;
  };
}

interface JobListResponse {
  data: JobLog[];
  total: number;
  limit: number;
  offset: number;
  job_names: string[];
}

/* ─── Helpers ─── */
function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

const STATUS_STYLES: Record<string, string> = {
  running: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  running: Clock,
  completed: CheckCircle2,
  failed: XCircle,
};

/* ─── Expanded row ─── */
function ExpandedRow({ log }: { log: JobLog }) {
  return (
    <tr>
      <td colSpan={6} className="px-4 py-3 bg-gray-50 border-b">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {log.error_message && (
            <div>
              <p className="font-medium text-red-700 mb-1">Error Message</p>
              <pre className="text-xs bg-red-50 border border-red-100 rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">
                {log.error_message}
              </pre>
            </div>
          )}
          {log.metadata && (
            <div>
              <p className="font-medium text-gray-700 mb-1">Metadata</p>
              <pre className="text-xs bg-white border rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
          {!log.error_message && !log.metadata && (
            <p className="text-gray-400 italic">No additional details</p>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ─── Main page ─── */
export default function SystemJobsPage() {
  usePageTitle("Job Logs");

  const [jobName, setJobName] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const limit = 50;

  // Build query params
  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (jobName) params.set("job_name", jobName);
    if (status) params.set("status", status);
    if (fromDate) params.set("from", new Date(fromDate).toISOString());
    if (toDate) params.set("to", new Date(toDate + "T23:59:59").toISOString());
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return params.toString();
  }, [jobName, status, fromDate, toDate, offset]);

  const {
    data: jobsData,
    isLoading: jobsLoading,
    refetch: refetchJobs,
  } = useQuery<JobListResponse>({
    queryKey: ["/api/admin/system/jobs", jobName, status, fromDate, toDate, offset],
    queryFn: async () => {
      const res = await fetch(`/api/admin/system/jobs?${buildParams()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load jobs");
      return res.json();
    },
  });

  const { data: summary, refetch: refetchSummary } = useQuery<JobSummary>({
    queryKey: ["/api/admin/system/jobs/summary"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system/jobs/summary", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load summary");
      return res.json();
    },
  });

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      refetchJobs();
      refetchSummary();
    }, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, refetchJobs, refetchSummary]);

  const totalPages = jobsData ? Math.ceil(jobsData.total / limit) : 0;
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <AdminLayout pageContext={{ page: "system_jobs" }}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Job Logs</h1>
            <p className="text-sm text-gray-500 mt-0.5">Monitor background job runs and failures</p>
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
              onClick={() => { refetchJobs(); refetchSummary(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-medium text-gray-500 uppercase">Runs Today</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{summary.overall.total_runs_today}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-xs font-medium text-gray-500 uppercase">Failures Today</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{summary.overall.failures_today}</p>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-gray-500 uppercase">Longest Job</span>
              </div>
              <p className="text-lg font-bold text-gray-900">
                {summary.overall.longest_job
                  ? formatSeconds(summary.overall.longest_job.duration_seconds)
                  : "-"}
              </p>
              {summary.overall.longest_job && (
                <p className="text-xs text-gray-400 truncate">{summary.overall.longest_job.job_name}</p>
              )}
            </div>
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs font-medium text-gray-500 uppercase">Most Failures</span>
              </div>
              <p className="text-lg font-bold text-gray-900">
                {summary.overall.most_failures
                  ? `${summary.overall.most_failures.failure_count}x`
                  : "-"}
              </p>
              {summary.overall.most_failures && (
                <p className="text-xs text-gray-400 truncate">{summary.overall.most_failures.job_name}</p>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Job Name</label>
              <select
                value={jobName}
                onChange={(e) => { setJobName(e.target.value); setOffset(0); }}
                className="h-9 px-3 rounded-md border border-gray-200 text-sm bg-white min-w-[180px]"
              >
                <option value="">All Jobs</option>
                {jobsData?.job_names.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Status</label>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setOffset(0); }}
                className="h-9 px-3 rounded-md border border-gray-200 text-sm bg-white min-w-[120px]"
              >
                <option value="">All</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setOffset(0); }}
                className="h-9 px-3 rounded-md border border-gray-200 text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setOffset(0); }}
                className="h-9 px-3 rounded-md border border-gray-200 text-sm bg-white"
              />
            </div>
            {(jobName || status || fromDate || toDate) && (
              <button
                onClick={() => { setJobName(""); setStatus(""); setFromDate(""); setToDate(""); setOffset(0); }}
                className="h-9 px-3 rounded-md text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          {jobsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-8"></th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Job Name</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Started</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Duration</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Error / Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {jobsData?.data.map((log) => {
                      const expanded = expandedId === log.id;
                      const Icon = STATUS_ICON[log.status] || Clock;
                      return (
                        <>
                          <tr
                            key={log.id}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setExpandedId(expanded ? null : log.id)}
                          >
                            <td className="px-4 py-2.5">
                              {expanded
                                ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-800">{log.job_name}</td>
                            <td className="px-4 py-2.5">
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                                STATUS_STYLES[log.status] || "bg-gray-100 text-gray-600"
                              )}>
                                <Icon className="w-3 h-3" />
                                {log.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">
                              {log.started_at ? formatRelativeTime(log.started_at) : "-"}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">
                              {formatDuration(log.started_at, log.finished_at)}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[300px] truncate">
                              {log.error_message
                                ? <span className="text-red-600">{log.error_message.slice(0, 80)}</span>
                                : log.metadata
                                  ? <span className="text-gray-400">{JSON.stringify(log.metadata).slice(0, 80)}</span>
                                  : <span className="text-gray-300">-</span>}
                            </td>
                          </tr>
                          {expanded && <ExpandedRow key={`exp-${log.id}`} log={log} />}
                        </>
                      );
                    })}
                    {jobsData?.data.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                          No job logs found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {jobsData && jobsData.total > limit && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                  <p className="text-xs text-gray-500">
                    Showing {offset + 1}-{Math.min(offset + limit, jobsData.total)} of {jobsData.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                      className="px-3 py-1 rounded text-xs font-medium border bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-gray-500 px-2">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      disabled={offset + limit >= jobsData.total}
                      onClick={() => setOffset(offset + limit)}
                      className="px-3 py-1 rounded text-xs font-medium border bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
