/**
 * Integration Health dashboard.
 *
 * Surfaces the live status of every external dependency (Stripe,
 * Twilio, SMTP, Vapi, Anthropic, OpenAI, Postgres). The page polls
 * /api/admin/integration-health every 30 seconds — the route runs all
 * probes in parallel server-side, each capped at 5s.
 *
 * Status colour map mirrors what the operator already sees on the
 * SystemAlertsPage: ok=emerald, degraded=amber, down=red,
 * not_configured=slate.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, AlertTriangle, XCircle, MinusCircle,
  RefreshCw, ServerCog, CreditCard, MessageSquare, Brain, Database, X,
} from "lucide-react";

type ProbeStatus = "ok" | "degraded" | "down" | "not_configured";

interface ProbeResult {
  service: string;
  label: string;
  category: "payments" | "comms" | "ai" | "infra";
  status: ProbeStatus;
  latency_ms: number | null;
  details: string | null;
  last_checked: string;
}

interface HealthResponse {
  generated_at: string;
  items: ProbeResult[];
}

const POLL_MS = 30_000;

const CATEGORY_META: Record<ProbeResult["category"], { label: string; Icon: typeof ServerCog }> = {
  infra:    { label: "Infrastructure", Icon: Database },
  payments: { label: "Payments",       Icon: CreditCard },
  comms:    { label: "Communications", Icon: MessageSquare },
  ai:       { label: "AI Providers",   Icon: Brain },
};

const STATUS_META: Record<ProbeStatus, {
  label: string; ring: string; bg: string; ink: string; Icon: typeof CheckCircle2;
}> = {
  ok:             { label: "Operational",      ring: "ring-emerald-300", bg: "bg-emerald-50",  ink: "text-emerald-700", Icon: CheckCircle2 },
  degraded:       { label: "Degraded",         ring: "ring-amber-300",   bg: "bg-amber-50",    ink: "text-amber-800",   Icon: AlertTriangle },
  down:           { label: "Down",             ring: "ring-red-300",     bg: "bg-red-50",      ink: "text-red-800",     Icon: XCircle },
  not_configured: { label: "Not configured",   ring: "ring-slate-200",   bg: "bg-slate-50",    ink: "text-slate-600",   Icon: MinusCircle },
};

export default function IntegrationHealthPage() {
  usePageTitle("Integration Health");
  /* Q29: clicking a status card toggles a filter on the list below.
     Click the active card again (or the explicit Clear) to remove. */
  const [statusFilter, setStatusFilter] = useState<ProbeStatus | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<HealthResponse>({
    queryKey: ["/api/admin/integration-health"],
    queryFn: async () => {
      const res = await fetch("/api/admin/integration-health", { credentials: "include" });
      if (!res.ok) throw new Error(`health ${res.status}`);
      return res.json();
    },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: POLL_MS / 2,
  });

  const items = data?.items ?? [];
  const filteredItems = statusFilter ? items.filter((item) => item.status === statusFilter) : items;

  /* Group by category for the rendered sections. */
  const grouped = filteredItems.reduce<Record<string, ProbeResult[]>>((acc, item) => {
    (acc[item.category] ||= []).push(item);
    return acc;
  }, {});

  /* Top-line summary counts. */
  const counts = items.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { ok: 0, degraded: 0, down: 0, not_configured: 0 } as Record<ProbeStatus, number>,
  );

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ServerCog className="w-5 h-5" />
              Integration Health
            </h2>
            <p className="text-sm text-gray-500">
              Live status of every external dependency. Auto-refreshes every 30 seconds.
              {data?.generated_at && (
                <> Last checked {formatTimestamp(data.generated_at)}.</>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh now
          </Button>
        </div>

        {/* Summary strip — Q29: cards are clickable filters */}
        {!isLoading && !isError && (
          <div className="grid auto-rows-fr grid-cols-2 sm:grid-cols-4 gap-3">
            {(["ok", "degraded", "down", "not_configured"] as const).map((s) => {
              const meta = STATUS_META[s];
              const Icon = meta.Icon;
              const isActive = statusFilter === s;
              const isDisabled = counts[s] === 0;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => !isDisabled && setStatusFilter(isActive ? null : s)}
                  disabled={isDisabled}
                  aria-pressed={isActive}
                  className={`h-full text-left rounded-xl border p-4 transition-all ${meta.bg} ${
                    isActive
                      ? "border-gray-400 ring-2 ring-offset-1 ring-gray-400 shadow-sm"
                      : "border-gray-200"
                  } ${isDisabled ? "opacity-50 cursor-not-allowed" : "hover:border-gray-300 hover:shadow-sm cursor-pointer"}`}
                  data-testid={`health-filter-${s}`}
                >
                  <div className={`flex items-center gap-2 ${meta.ink}`}>
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wide">{meta.label}</span>
                  </div>
                  <p className={`text-2xl font-bold mt-1 ${meta.ink}`}>{counts[s]}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Q29: active filter banner with clear button */}
        {statusFilter && !isLoading && !isError && (
          <div
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600"
            data-testid="health-filter-banner"
          >
            <span>
              Showing <strong className="text-gray-900">{filteredItems.length}</strong> integration
              {filteredItems.length === 1 ? "" : "s"} with status <strong className="text-gray-900">{STATUS_META[statusFilter].label.toLowerCase()}</strong>
            </span>
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              data-testid="health-filter-clear"
            >
              <X className="w-3 h-3" /> Clear filter
            </button>
          </div>
        )}

        {/* Body */}
        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
            Couldn't load health data. <button onClick={() => refetch()} className="underline font-medium">Retry</button>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        )}

        {!isLoading && !isError && filteredItems.length === 0 && statusFilter && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500" data-testid="health-empty-filtered">
            No integrations currently have status <strong>{STATUS_META[statusFilter].label.toLowerCase()}</strong>.
          </div>
        )}

        {!isLoading && !isError && (
          (["infra", "payments", "comms", "ai"] as const).map((cat) => {
            const rows = grouped[cat];
            if (!rows || rows.length === 0) return null;
            const { label, Icon } = CATEGORY_META[cat];
            return (
              <section key={cat}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </h3>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                  {rows.map((row) => (
                    <ProbeRow key={row.service} row={row} />
                  ))}
                </div>
              </section>
            );
          })
        )}

        <p className="text-[11px] text-gray-400 text-center pt-4">
          Anthropic and OpenAI probes are non-invasive — we report "Operational" if the API key is present
          rather than burn tokens on health checks. Any model call failure will surface on the alerts page.
        </p>
      </div>
    </AdminLayout>
  );
}

function ProbeRow({ row }: { row: ProbeResult }) {
  const meta = STATUS_META[row.status];
  const Icon = meta.Icon;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className={`w-9 h-9 rounded-full ${meta.bg} ${meta.ink} ring-1 ${meta.ring} flex items-center justify-center flex-shrink-0`}
      >
        <Icon className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{row.label}</p>
        <p className="text-xs text-gray-500 truncate">
          {row.details || (row.status === "ok" ? "Healthy" : meta.label)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${meta.ink}`}>
          {meta.label}
        </span>
        {row.latency_ms !== null && row.status !== "not_configured" && (
          <span className="text-[10px] text-gray-400 tabular-nums">{row.latency_ms} ms</span>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}
