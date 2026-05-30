/**
 * Wave 93 — Deployment Health dashboard.
 *
 * One-click "is anything broken right now" view for prod. Pings every
 * critical SEO + compliance route via the backend probe and shows a
 * simple table: route / HTTP status / body size / OK or BROKEN /
 * last checked. Results are cached server-side for 5 min; the
 * "Re-run check" button forces a fresh probe.
 *
 * This is the runtime complement to:
 *   - tests/build-output-smoke.test.ts          (build-time)
 *   - scripts/deploy/content-verification.mjs   (post-deploy CI)
 *   - server/static.ts CRITICAL_PRERENDERED_ROUTES (live runtime)
 *
 * Mounted at /admin/system/deployment-health behind <RequirePortal>.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, AlertTriangle, RefreshCw, Globe, ExternalLink,
} from "lucide-react";

interface RouteResult {
  route: string;
  ok: boolean;
  status: number;
  bytes: number;
  min_bytes: number;
  must_contain: string[];
  present_tokens: string[];
  problems: string[];
  last_checked: string;
}

interface HealthReport {
  generated_at: string;
  cached: boolean;
  cache_age_s: number;
  base_url: string;
  total: number;
  passed: number;
  failed: number;
  results: RouteResult[];
}

const POLL_MS = 5 * 60 * 1000; // matches server cache TTL

export default function DeploymentHealthPage() {
  usePageTitle("Deployment Health");
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery<HealthReport>({
    queryKey: ["/api/admin/deployment-health"],
    queryFn: async () => {
      const res = await fetch("/api/admin/deployment-health", { credentials: "include" });
      if (!res.ok) throw new Error(`deployment-health ${res.status}`);
      return res.json();
    },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: POLL_MS / 2,
  });

  const handleForceRefresh = async () => {
    const res = await fetch("/api/admin/deployment-health?force=1", { credentials: "include" });
    if (res.ok) {
      const fresh = (await res.json()) as HealthReport;
      queryClient.setQueryData(["/api/admin/deployment-health"], fresh);
    } else {
      refetch();
    }
  };

  const results = data?.results ?? [];

  return (
    <AdminLayout>
      <div data-theme="light" className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Deployment Health
            </h2>
            <p className="text-sm text-gray-500">
              Live check of every critical SEO + compliance route. Hits the public hostname
              with a no-JS crawler User-Agent, so what you see here is what Bing, TCR, and
              link previews see.
              {data?.generated_at && (
                <> Last checked {formatTimestamp(data.generated_at)}{data.cached && ` (cached, ${data.cache_age_s}s old)`}.</>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleForceRefresh}
            disabled={isFetching}
            data-testid="deployment-health-refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Re-run check
          </Button>
        </div>

        {/* Summary strip */}
        {!isLoading && !isError && data && (
          <div className="grid auto-rows-fr grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
              label="Routes"
              value={data.total}
              tone="neutral"
              testId="deployment-health-summary-total"
            />
            <SummaryCard
              label="Passing"
              value={data.passed}
              tone="ok"
              testId="deployment-health-summary-passed"
            />
            <SummaryCard
              label="Broken"
              value={data.failed}
              tone={data.failed > 0 ? "fail" : "neutral"}
              testId="deployment-health-summary-failed"
            />
          </div>
        )}

        {/* Body */}
        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            Couldn't load deployment health.{" "}
            <button onClick={() => refetch()} className="underline font-medium">
              Retry
            </button>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {!isLoading && !isError && data && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm" data-testid="deployment-health-table">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Route</th>
                  <th className="px-4 py-2 text-right font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">Size</th>
                  <th className="px-4 py-2 text-right font-semibold">Health</th>
                  <th className="px-4 py-2 text-right font-semibold">Checked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((row) => (
                  <RouteRow key={row.route} row={row} baseUrl={data.base_url} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-gray-400 text-center pt-4">
          Server caches results for 5 min — "Re-run check" forces a fresh probe.
          The post-deploy watchdog runs the same probes automatically on every push to{" "}
          <code className="text-[10px]">main</code>.
        </p>
      </div>
    </AdminLayout>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: number;
  tone: "ok" | "fail" | "neutral";
  testId?: string;
}) {
  const styles =
    tone === "ok"
      ? { bg: "bg-emerald-50", border: "border-emerald-200", ink: "text-emerald-800" }
      : tone === "fail"
      ? { bg: "bg-red-50", border: "border-red-200", ink: "text-red-800" }
      : { bg: "bg-slate-50", border: "border-slate-200", ink: "text-slate-700" };
  return (
    <div
      className={`rounded-xl border p-4 ${styles.bg} ${styles.border}`}
      data-testid={testId}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${styles.ink}`}>{label}</p>
      <p className={`text-2xl font-bold mt-1 ${styles.ink}`}>{value}</p>
    </div>
  );
}

function RouteRow({ row, baseUrl }: { row: RouteResult; baseUrl: string }) {
  const href = `${baseUrl}${row.route}`;
  return (
    <tr data-testid={`deployment-health-row-${row.route}`}>
      <td className="px-4 py-2.5 align-top">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-700 hover:underline font-medium inline-flex items-center gap-1"
        >
          {row.route}
          <ExternalLink className="w-3 h-3 opacity-60" />
        </a>
        {!row.ok && row.problems.length > 0 && (
          <ul className="mt-1 text-[11px] text-red-700 list-disc list-inside space-y-0.5">
            {row.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-4 py-2.5 align-top text-right tabular-nums">
        <span
          className={row.status === 200 ? "text-gray-700" : "text-red-700 font-medium"}
        >
          {row.status || "—"}
        </span>
      </td>
      <td className="px-4 py-2.5 align-top text-right tabular-nums text-gray-700">
        {formatBytes(row.bytes)}
        <div className="text-[10px] text-gray-400">min {formatBytes(row.min_bytes)}</div>
      </td>
      <td className="px-4 py-2.5 align-top text-right">
        {row.ok ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold uppercase tracking-wide">
            <CheckCircle2 className="w-3.5 h-3.5" /> OK
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-red-700 text-xs font-semibold uppercase tracking-wide">
            <AlertTriangle className="w-3.5 h-3.5" /> Broken
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 align-top text-right text-[11px] text-gray-500 tabular-nums">
        {formatTimestamp(row.last_checked)}
      </td>
    </tr>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimestamp(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}
