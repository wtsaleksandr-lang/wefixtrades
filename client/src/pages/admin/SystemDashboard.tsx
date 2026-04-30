/**
 * /admin/system — observability + manual control over the background
 * job system. Three sections:
 *   1. system status card  (overall health + counters)
 *   2. workers table       (per-job last run, staleness, "Run now")
 *   3. job logs table      (paginated, filterable, expandable, retry)
 *
 * All data comes from /api/admin/system/*. No product data is touched.
 */

import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Loader2, PlayCircle, RefreshCw, RotateCw,
} from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ─── */
interface SystemSummary {
  total_jobs_last_24h: number;
  failed_jobs_last_24h: number;
  running_jobs_now: number;
  stale_workers_count: number;
  top_failed_jobs: Array<{ job_name: string; count: number }>;
  failure_rate_24h: number;
  system_status: "healthy" | "warning" | "critical";
}

interface WorkerRow {
  job_name: string;
  label: string;
  schedule_minutes: number;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_success_at: string | null;
  minutes_since_last_run: number | null;
  minutes_since_last_success: number | null;
  is_stale: boolean;
  avg_duration_ms: number | null;
  manually_triggerable: boolean;
}

interface JobLogRow {
  id: number;
  job_name: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  duration_ms: number | null;
}

/* ─── Helpers ─── */
function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

const STATUS_BADGE: Record<string, string> = {
  running:   "bg-blue-50 text-blue-700 border border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  failed:    "bg-red-50 text-red-700 border border-red-200",
};

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">—</span>;
  const cls = STATUS_BADGE[status] ?? "bg-gray-50 text-gray-600 border border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

const SYS_STYLES: Record<SystemSummary["system_status"], { card: string; dot: string; label: string; Icon: typeof CheckCircle2 }> = {
  healthy:  { card: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500", label: "Healthy",  Icon: CheckCircle2 },
  warning:  { card: "bg-amber-50 border-amber-200",     dot: "bg-amber-500",   label: "Warning",  Icon: AlertTriangle },
  critical: { card: "bg-red-50 border-red-200",         dot: "bg-red-500",     label: "Critical", Icon: AlertTriangle },
};

/* ─── Section 1: status card ─── */
function StatusCard() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<SystemSummary>({
    queryKey: ["/api/admin/system/summary"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system/summary", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load system summary");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <Card className="p-4 col-span-full">
        <Skeleton className="h-6 w-40 mb-3" />
        <Skeleton className="h-20 w-full" />
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card className="p-4 col-span-full border-red-200 bg-red-50">
        <div className="flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4" />
          Failed to load system summary
        </div>
      </Card>
    );
  }

  const style = SYS_STYLES[data.system_status];
  const Icon = style.Icon;
  return (
    <Card className={`p-4 col-span-full border ${style.card}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-white/70 flex items-center justify-center">
            <Icon className="w-5 h-5 text-gray-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              System status
              <span className={`inline-block w-2 h-2 rounded-full ${style.dot}`} />
              <span className="text-xs font-medium text-gray-700">{style.label}</span>
            </h3>
            <p className="text-[11px] text-gray-500">
              Failure rate (24h): {(data.failure_rate_24h * 100).toFixed(1)}%
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Failed (24h)" value={data.failed_jobs_last_24h} accent={data.failed_jobs_last_24h > 0 ? "red" : "ok"} />
        <Stat label="Stale workers" value={data.stale_workers_count} accent={data.stale_workers_count > 0 ? "red" : "ok"} />
        <Stat label="Running now" value={data.running_jobs_now} accent="ok" />
        <Stat label="Total runs (24h)" value={data.total_jobs_last_24h} accent="ok" />
      </div>

      {data.top_failed_jobs.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-200/70">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Top failed jobs (24h)</p>
          <div className="flex flex-wrap gap-2">
            {data.top_failed_jobs.map((j) => (
              <Badge key={j.job_name} variant="outline" className="text-[11px]">
                {j.job_name}
                <span className="ml-1 text-red-600 font-semibold">{j.count}</span>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: "ok" | "red" }) {
  return (
    <div className="bg-white/70 rounded-md p-3 border border-white">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-semibold ${accent === "red" ? "text-red-700" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

/* ─── Section 2: workers table ─── */
function WorkersTable() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ workers: WorkerRow[] }>({
    queryKey: ["/api/admin/system/workers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system/workers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load workers");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const runJob = useMutation({
    mutationFn: async (jobName: string) => {
      const res = await apiRequest("POST", `/api/admin/system/run/${encodeURIComponent(jobName)}`);
      return res.json();
    },
    onMutate: (jobName) => {
      setRunning((m) => ({ ...m, [jobName]: true }));
    },
    onSuccess: (_data, jobName) => {
      toast({ title: "Job started", description: jobName });
      // Give the worker a moment, then refresh.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/system/workers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/system/jobs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/system/summary"] });
      }, 1500);
    },
    onError: (err: any, jobName) => {
      toast({ title: "Failed to start job", description: err?.message || jobName, variant: "destructive" });
    },
    onSettled: (_d, _e, jobName) => {
      setTimeout(() => setRunning((m) => ({ ...m, [jobName]: false })), 1500);
    },
  });

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Workers</h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : isError || !data ? (
          <div className="p-4 text-sm text-red-600">Failed to load workers.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wide">Job</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Last run</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Last success</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Stale</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Avg duration</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.workers.map((w) => (
                <TableRow key={w.job_name} className={w.is_stale ? "bg-red-50/40" : undefined}>
                  <TableCell className="text-xs">
                    <div className="font-medium text-gray-900">{w.label}</div>
                    <div className="text-[10px] text-gray-500 font-mono">{w.job_name}</div>
                  </TableCell>
                  <TableCell className="text-xs text-gray-700">{formatRelative(w.last_run_at)}</TableCell>
                  <TableCell className="text-xs text-gray-700">{formatRelative(w.last_success_at)}</TableCell>
                  <TableCell><StatusPill status={w.last_status} /></TableCell>
                  <TableCell>
                    {w.is_stale ? (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">stale</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-gray-700">{formatDuration(w.avg_duration_ms)}</TableCell>
                  <TableCell className="text-right">
                    {w.manually_triggerable ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!running[w.job_name] || w.last_status === "running"}
                        onClick={() => runJob.mutate(w.job_name)}
                        className="h-7 px-2 text-[11px]"
                      >
                        {running[w.job_name] ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <PlayCircle className="w-3 h-3 mr-1" />
                        )}
                        Run now
                      </Button>
                    ) : (
                      <span className="text-[10px] text-gray-400 italic">scheduler-only</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Card>
  );
}

/* ─── Section 3: job logs table ─── */
function JobLogsTable({ workerNames }: { workerNames: string[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const limit = 25;

  const { data, isLoading, isError, refetch, isFetching } = useQuery<{ data: JobLogRow[]; total: number; limit: number; offset: number }>({
    queryKey: ["/api/admin/system/jobs", { status: statusFilter, job: jobFilter, page }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (jobFilter !== "all") params.set("job_name", jobFilter);
      const res = await fetch(`/api/admin/system/jobs?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load job logs");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const retry = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/system/retry/${id}`);
      return res.json();
    },
    onSuccess: (resp: any) => {
      toast({ title: "Retry started", description: resp?.job_name ?? "" });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/system/jobs"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/system/workers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/system/summary"] });
      }, 1500);
    },
    onError: (err: any) => {
      toast({ title: "Retry failed", description: err?.message || "", variant: "destructive" });
    },
  });

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / limit));
  }, [data]);

  function toggleRow(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <RotateCw className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Job logs</h3>
          {data && <span className="text-[11px] text-gray-500">{data.total} total</span>}
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={jobFilter} onValueChange={(v) => { setJobFilter(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Job" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jobs</SelectItem>
              {workerNames.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : isError || !data ? (
          <div className="p-4 text-sm text-red-600">Failed to load job logs.</div>
        ) : data.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No job runs match these filters.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6"></TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Job</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Started</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide">Duration</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((r) => {
                const isOpen = expanded.has(r.id);
                return (
                  <Fragment key={r.id}>
                    <TableRow className="hover:bg-gray-50/60">
                      <TableCell className="py-2">
                        <button
                          onClick={() => toggleRow(r.id)}
                          className="text-gray-400 hover:text-gray-700"
                          aria-label={isOpen ? "Collapse" : "Expand"}
                        >
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="py-2 text-xs font-mono text-gray-800">{r.job_name}</TableCell>
                      <TableCell className="py-2"><StatusPill status={r.status} /></TableCell>
                      <TableCell className="py-2 text-xs text-gray-700">{formatRelative(r.started_at)}</TableCell>
                      <TableCell className="py-2 text-xs text-gray-700">{formatDuration(r.duration_ms)}</TableCell>
                      <TableCell className="py-2 text-right">
                        {r.status === "failed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={retry.isPending && retry.variables === r.id}
                            onClick={() => retry.mutate(r.id)}
                            className="h-7 px-2 text-[11px]"
                          >
                            {retry.isPending && retry.variables === r.id ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <RotateCw className="w-3 h-3 mr-1" />
                            )}
                            Retry
                          </Button>
                        ) : (
                          <span className="text-[10px] text-gray-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-gray-50">
                        <TableCell colSpan={6} className="py-3">
                          <div className="text-[11px] text-gray-700 space-y-1">
                            <div>
                              <span className="font-semibold text-gray-500">Started:</span>{" "}
                              {r.started_at ? new Date(r.started_at).toLocaleString() : "—"}
                            </div>
                            <div>
                              <span className="font-semibold text-gray-500">Finished:</span>{" "}
                              {r.finished_at ? new Date(r.finished_at).toLocaleString() : "—"}
                            </div>
                            {r.error_message && (
                              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-800 font-mono text-[10px] whitespace-pre-wrap break-words">
                                {r.error_message}
                              </div>
                            )}
                            {!r.error_message && r.status === "completed" && (
                              <div className="text-emerald-700">Completed without errors.</div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.total > limit && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-600">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="h-7 px-2 text-[11px]">Prev</Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-7 px-2 text-[11px]">Next</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Page ─── */
export default function SystemDashboard() {
  usePageTitle("System");

  const { data: workersData } = useQuery<{ workers: WorkerRow[] }>({
    queryKey: ["/api/admin/system/workers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system/workers", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const workerNames = useMemo(
    () => (workersData?.workers ?? []).map((w) => w.job_name).sort(),
    [workersData],
  );

  return (
    <AdminLayout pageContext={{ page: "system" }}>
      <div className="space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">System</h2>
            <p className="text-sm text-gray-500">Background workers, job logs, and manual control.</p>
          </div>
          <Link href="/admin/crm" className="text-xs text-gray-500 hover:text-gray-800">← Back to overview</Link>
        </div>

        <StatusCard />
        <WorkersTable />
        <JobLogsTable workerNames={workerNames} />
      </div>
    </AdminLayout>
  );
}
