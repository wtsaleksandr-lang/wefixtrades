import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Wrench, ClipboardList, Truck, CreditCard, TrendingUp, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";

interface Overview {
  totalClients: number;
  activeServices: number;
  pendingOnboarding: number;
  openFulfillment: number;
  unpaidAmount: number;
  monthlyRevenue: number;
  recentClients: { id: number; business_name: string; status: string; created_at: string }[];
  recentTasks: { id: number; title: string; status: string; priority: string; client_id: number; client_name: string | null; due_at: string | null }[];
}

/* ─── Ops Intelligence types ─── */
interface OpsPriority {
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  related_entities: Array<{ type: string; id: number }>;
}

interface DailyOpsSummaryOutput {
  summary: string;
  priorities: OpsPriority[];
  risks: string[];
  recommendations: string[];
}

interface OpsSnapshotResponse {
  snapshot: {
    id: number;
    snapshot_type: string;
    generated_at: string;
    signal_count: number;
    ai_output: DailyOpsSummaryOutput | null;
    prompt_version: string | null;
    detector_version: string | null;
    metadata: Record<string, any> | null;
  } | null;
}

const SEVERITY_STYLES: Record<string, { badge: string; dot: string }> = {
  critical: { badge: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" },
  high:     { badge: "bg-orange-50 text-orange-700 border border-orange-200", dot: "bg-orange-500" },
  medium:   { badge: "bg-amber-50 text-amber-700 border border-amber-200", dot: "bg-amber-400" },
  low:      { badge: "bg-gray-50 text-gray-600 border border-gray-200", dot: "bg-gray-400" },
};

function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {severity}
    </span>
  );
}

function OpsIntelligenceWidget() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<OpsSnapshotResponse>({
    queryKey: ["/api/admin/ops/summary/daily"],
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  const snapshot = data?.snapshot;
  const aiOutput = snapshot?.ai_output;

  const generatedAt = snapshot?.generated_at
    ? new Date(snapshot.generated_at).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
      })
    : null;

  return (
    <Card className="p-0 overflow-hidden col-span-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#2D6A4F] flex items-center justify-center">
            <AlertTriangle className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">AI Ops Intelligence</h3>
            {generatedAt && (
              <p className="text-[10px] text-gray-400">
                Last run {generatedAt}
                {snapshot?.signal_count != null && ` · ${snapshot.signal_count} signal${snapshot.signal_count !== 1 ? "s" : ""} detected`}
                {snapshot?.detector_version && ` · ${snapshot.detector_version}`}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40 transition-opacity"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2 mt-3" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Failed to load ops summary. Check server logs.
          </div>
        ) : !snapshot ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500 mb-3">No ops snapshot yet. Run the first analysis.</p>
            <TriggerOpsRunButton />
          </div>
        ) : !aiOutput ? (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">AI summarization failed for this run.</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {snapshot.signal_count} signals were detected. Check server logs for error details.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Narrative summary */}
            <p className="text-sm text-gray-700 leading-relaxed">{aiOutput.summary}</p>

            {/* Priorities */}
            {aiOutput.priorities.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Priorities ({aiOutput.priorities.length})
                </p>
                <div className="space-y-1.5">
                  {aiOutput.priorities.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2">
                      <div className="pt-0.5">
                        <SeverityBadge severity={p.severity} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800">{p.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{p.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risks and Recommendations side by side */}
            <div className="grid sm:grid-cols-2 gap-3">
              {aiOutput.risks.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Risks</p>
                  <ul className="space-y-1">
                    {aiOutput.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600">
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aiOutput.recommendations.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Recommended Actions</p>
                  <ul className="space-y-1">
                    {aiOutput.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600">
                        <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer meta */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 italic">
                AI-generated summary — review before acting. Signals detected by deterministic rules.
              </p>
              <TriggerOpsRunButton small />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function TriggerOpsRunButton({ small }: { small?: boolean }) {
  const { refetch: refetchSummary } = useQuery<OpsSnapshotResponse>({
    queryKey: ["/api/admin/ops/summary/daily"],
    enabled: false,
  });

  const handleRun = async () => {
    try {
      await fetch("/api/admin/ops/run", { method: "POST" });
      refetchSummary();
    } catch (err) {
      console.error("[OpsWidget] Manual run failed:", err);
    }
  };

  if (small) {
    return (
      <button
        onClick={handleRun}
        className="text-[10px] text-[#2D6A4F] hover:underline font-medium"
      >
        Run now
      </button>
    );
  }

  return (
    <button
      onClick={handleRun}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2D6A4F] text-white text-xs font-medium rounded-lg hover:bg-[#235c43] transition-colors"
    >
      <RefreshCw className="w-3 h-3" />
      Run Ops Analysis
    </button>
  );
}

const STATUS_COLORS: Record<string, string> = {
  lead: "bg-gray-100 text-gray-700",
  onboarding: "bg-amber-50 text-amber-700",
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-blue-50 text-blue-700",
  churned: "bg-red-50 text-red-700",
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-indigo-50 text-indigo-700",
  waiting: "bg-amber-50 text-amber-700",
  blocked: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  href?: string;
  color: string;
}) {
  const inner = (
    <Card className="p-4 hover:shadow-sm transition-shadow cursor-default">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
    </Card>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

export default function CrmOverview() {
  const { data, isLoading } = useQuery<Overview>({
    queryKey: ["/api/admin/crm/overview"],
  });

  const formatCurrency = (cents: number) =>
    `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <AdminLayout pageContext={{
      page: "overview",
      totalClients: data?.totalClients,
      monthlyRevenue: data?.monthlyRevenue,
      totalOpenTasks: data?.openFulfillment,
      unpaidAmount: data?.unpaidAmount,
      pendingOnboardingCount: data?.pendingOnboarding,
      overdueTasksCount: data?.recentTasks?.filter(
        (t) => t.due_at && new Date(t.due_at) < new Date() && !["delivered", "cancelled"].includes(t.status)
      ).length,
      blockedCount: data?.recentTasks?.filter((t) => t.status === "blocked").length,
    }}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Operations Overview</h2>
          <p className="text-sm text-gray-500 mt-0.5">Your business at a glance</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-12" />
              </Card>
            ))
          ) : (
            <>
              <StatCard label="Clients" value={data?.totalClients ?? 0} icon={Users} href="/admin/crm/clients" color="bg-[#2D6A4F]" />
              <StatCard label="Active Services" value={data?.activeServices ?? 0} icon={Wrench} color="bg-blue-500" />
              <StatCard label="Onboarding" value={data?.pendingOnboarding ?? 0} icon={ClipboardList} color="bg-amber-500" />
              <StatCard label="Open Tasks" value={data?.openFulfillment ?? 0} icon={Truck} href="/admin/crm/inbox" color="bg-purple-500" />
              <StatCard label="Unpaid" value={formatCurrency(data?.unpaidAmount ?? 0)} icon={CreditCard} color="bg-red-500" />
              <StatCard label="Revenue (Mo)" value={formatCurrency(data?.monthlyRevenue ?? 0)} icon={TrendingUp} color="bg-emerald-500" />
            </>
          )}
        </div>

        {/* Ops Intelligence Widget */}
        <div className="grid grid-cols-1 gap-4">
          <OpsIntelligenceWidget />
        </div>

        {/* Bottom panels */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Recent Clients */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-gray-900">Recent Clients</h3>
              <Link href="/admin/crm/clients">
                <span className="text-xs text-[#2D6A4F] font-medium hover:underline">View all</span>
              </Link>
            </div>
            {isLoading ? (
              <div className="px-4 pb-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !data?.recentClients?.length ? (
              <div className="px-4 pb-4">
                <p className="text-sm text-gray-500">No clients yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {data.recentClients.map((c) => (
                  <Link key={c.id} href={`/admin/crm/clients/${c.id}`}>
                    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer min-h-[44px]">
                      <span className="text-sm font-medium text-gray-800 truncate">{c.business_name}</span>
                      <StatusBadge status={c.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Recent Tasks */}
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-gray-900">Open Tasks</h3>
              <Link href="/admin/crm/inbox">
                <span className="text-xs text-[#2D6A4F] font-medium hover:underline">View inbox</span>
              </Link>
            </div>
            {isLoading ? (
              <div className="px-4 pb-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !data?.recentTasks?.length ? (
              <div className="px-4 pb-4">
                <p className="text-sm text-gray-500">No open tasks.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {data.recentTasks.map((t) => (
                  <Link key={t.id} href={`/admin/crm/clients/${t.client_id}`}>
                    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer min-h-[44px] gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                        <p className="text-xs text-gray-400 truncate">{t.client_name}</p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
