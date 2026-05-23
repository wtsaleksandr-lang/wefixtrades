import { usePageTitle } from "@/hooks/usePageTitle";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Wrench, ClipboardList, Truck, CreditCard, TrendingUp, AlertTriangle, CheckCircle, RefreshCw, ShieldCheck, RotateCcw, Clock, Calculator, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { adminStatusColor, ALERT_SEVERITY } from "@/config/adminLabels";
// IA-1 (2026-05-22) — wizard minimize-to-floating-badge.
import MinimizedWizardBadge from "@/components/wizard/MinimizedWizardBadge";

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
  critical: { badge: ALERT_SEVERITY.critical.color, dot: ALERT_SEVERITY.critical.bgColor },
  high:     { badge: "bg-orange-50 text-orange-700 border border-orange-200", dot: "bg-orange-500" },
  medium:   { badge: "bg-amber-50 text-amber-700 border border-amber-200", dot: "bg-amber-400" },
  low:      { badge: "bg-gray-50 text-gray-600 border border-gray-200", dot: "bg-gray-400" },
};

function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low;
  return (
    <span data-theme="light" className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${s.badge}`}>
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
          <div className="w-6 h-6 rounded-md bg-brand-blue flex items-center justify-center">
            <AlertTriangle className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Daily Operations Summary</h3>
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
            Something went wrong loading the daily summary. Please try again later.
          </div>
        ) : !snapshot ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500 mb-3">No daily summary yet. Run your first operations check.</p>
            <TriggerOpsRunButton />
          </div>
        ) : !aiOutput ? (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">AI summarization failed for this run.</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {snapshot.signal_count} issues were detected but the AI summary couldn't be generated. Try running again.
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
        className="text-[10px] text-brand-blue hover:underline font-medium"
      >
        Run now
      </button>
    );
  }

  return (
    <button
      onClick={handleRun}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue text-white text-xs font-medium rounded-lg hover:bg-[#235c43] transition-colors"
    >
      <RefreshCw className="w-3 h-3" />
      Run Ops Analysis
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${adminStatusColor(status)}`}>
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
    <Card className={`h-full p-4 transition-all duration-150 ${href ? "cursor-pointer hover:border-gray-300 hover:shadow-md active:scale-[0.98]" : "cursor-default"}`}>
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
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}

/* ─── QA Queue Widget ─── */
interface QaTask {
  id: number;
  client_id: number;
  client_service_id: number;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  client_name: string | null;
  service_name: string | null;
}

function QaQueueWidget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tasks, isLoading } = useQuery<QaTask[]>({
    queryKey: ["/api/admin/crm/qa-queue"],
    staleTime: 30_000,
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/crm/fulfillment/${id}`, { status });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/qa-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/overview"] });
      toast({
        title: variables.status === "delivered" ? "Task approved" : "Revision requested",
        description: variables.status === "delivered"
          ? "Task marked as delivered."
          : "Task sent back for revision.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update task.", variant: "destructive" });
    },
  });

  const count = tasks?.length ?? 0;

  return (
    <Card className="h-full p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-600 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              QA Queue
              {count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold">
                  {count}
                </span>
              )}
            </h3>
            <p className="text-[10px] text-gray-400">Tasks awaiting quality review before delivery</p>
          </div>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : count === 0 ? (
          <div className="text-center py-6">
            <ShieldCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No tasks awaiting QA review.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks!.map((t) => {
              const dueDate = t.due_at ? new Date(t.due_at) : null;
              const isOverdue = dueDate ? dueDate < new Date() : false;
              const submittedDate = t.updated_at ? new Date(t.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
              const dueLabel = dueDate
                ? dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : null;

              return (
                <div key={t.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/crm/clients/${t.client_id}`}>
                        <p className="text-sm font-medium text-gray-800 hover:text-brand-blue truncate cursor-pointer">{t.title}</p>
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                        <span>{t.client_name ?? "Unknown client"}</span>
                        {t.service_name && (
                          <>
                            <span className="text-gray-300">|</span>
                            <span>{t.service_name}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                        {submittedDate && <span>Submitted {submittedDate}</span>}
                        {dueLabel && (
                          <span className={`flex items-center gap-0.5 ${isOverdue ? "text-red-500 font-medium" : ""}`}>
                            <Clock className="w-2.5 h-2.5" />
                            Due {dueLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] text-orange-600 border-orange-200 hover:bg-orange-50"
                        disabled={updateTask.isPending}
                        onClick={() => updateTask.mutate({ id: t.id, status: "revision_required" })}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Revise
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={updateTask.isPending}
                        onClick={() => updateTask.mutate({ id: t.id, status: "delivered" })}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── Products section — IA-1 deferral completion (2026-05-22)
   Surfaces top-of-funnel product cards on the admin overview so operators
   can jump straight into product-scoped admin pages. Currently scoped to
   QuoteQuick (the only live SaaS product); future products slot in next
   to it as additional <ProductCard /> entries inside the same grid. ─── */
interface QQOverviewResponse {
  calculators: { id: number; status: string; total_leads: number }[];
}
interface QQTrendResponse {
  trend: { date: string; count: number }[];
  total: number;
}

function QuoteQuickProductCard() {
  const { data: overviewData, isLoading: overviewLoading } = useQuery<QQOverviewResponse>({
    queryKey: ["/api/admin/crm/quotequick/overview"],
    queryFn: () => apiRequest("GET", "/api/admin/crm/quotequick/overview").then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: trendData, isLoading: trendLoading } = useQuery<QQTrendResponse>({
    queryKey: ["/api/admin/crm/quotequick/trends"],
    queryFn: () => apiRequest("GET", "/api/admin/crm/quotequick/trends").then((r) => r.json()),
    staleTime: 60_000,
  });

  const isLoading = overviewLoading || trendLoading;

  // Active calculators = live deployments only (paused/draft excluded — those
  // can't take leads). Matches the metric admins see on the QuoteQuick page.
  const activeCalculators = (overviewData?.calculators ?? []).filter(
    (c) => c.status === "live",
  ).length;

  // Leads this month = sum of daily counts from the trend endpoint, filtered
  // to dates within the current calendar month (local time).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const leadsThisMonth = (trendData?.trend ?? []).reduce((acc, d) => {
    const dt = new Date(d.date);
    return dt >= monthStart ? acc + d.count : acc;
  }, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Products</h3>
        <p className="text-[11px] text-gray-400">Jump into product-scoped admin tools</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link href="/admin/crm/quotequick" className="block">
          <Card className="h-full p-4 transition-all duration-150 cursor-pointer hover:border-gray-300 hover:shadow-md active:scale-[0.98]">
            <div className="flex items-start gap-3">
              <div data-theme="dark" className="w-10 h-10 rounded-lg flex items-center justify-center bg-brand-blue shrink-0">
                <Calculator className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">QuoteQuick</p>
                  <span className="inline-flex items-center text-[11px] font-medium text-brand-blue shrink-0">
                    Manage calculators
                    <ArrowRight className="w-3 h-3 ml-0.5" />
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Embeddable quote calculators across all clients
                </p>
                <div className="mt-2 min-h-[20px]">
                  {isLoading ? (
                    <Skeleton className="h-3 w-48" />
                  ) : (
                    <p className="text-xs text-gray-600">
                      <span className="font-semibold text-gray-900">{activeCalculators}</span> active
                      {activeCalculators === 1 ? " calculator" : " calculators"}
                      <span className="text-gray-300 mx-1.5">·</span>
                      <span className="font-semibold text-gray-900">{leadsThisMonth}</span>{" "}
                      lead{leadsThisMonth === 1 ? "" : "s"} this month
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </Link>
        {/* Future product cards slot in here (one per product). */}
      </div>
    </div>
  );
}

export default function CrmOverview() {
  usePageTitle("Overview");
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
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Operations Overview</h2>
          <p className="text-sm text-gray-500 mt-0.5">Your business at a glance</p>
        </div>

        {/* Stat cards */}
        <div className="grid auto-rows-fr grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-full p-4">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-12" />
              </Card>
            ))
          ) : (
            <>
              <StatCard label="Clients" value={data?.totalClients ?? 0} icon={Users} href="/admin/crm/clients" color="bg-brand-blue" />
              <StatCard label="Active Services" value={data?.activeServices ?? 0} icon={Wrench} href="/admin/crm/services" color="bg-blue-500" />
              <StatCard label="Onboarding" value={data?.pendingOnboarding ?? 0} icon={ClipboardList} href="/admin/crm/inbox" color="bg-amber-500" />
              <StatCard label="Open Tasks" value={data?.openFulfillment ?? 0} icon={Truck} href="/admin/crm/inbox" color="bg-purple-500" />
              <StatCard label="Unpaid" value={formatCurrency(data?.unpaidAmount ?? 0)} icon={CreditCard} href="/admin/crm/billing" color="bg-red-500" />
              <StatCard label="Revenue (Mo)" value={formatCurrency(data?.monthlyRevenue ?? 0)} icon={TrendingUp} href="/admin/crm/billing" color="bg-emerald-500" />
            </>
          )}
        </div>

        {/* Products section — IA-1 deferral (2026-05-22) */}
        <QuoteQuickProductCard />

        {/* Ops Intelligence Widget */}
        <div className="grid grid-cols-1 gap-4">
          <OpsIntelligenceWidget />
        </div>

        {/* QA Queue */}
        <QaQueueWidget />

        {/* Bottom panels */}
        <div className="grid auto-rows-fr md:grid-cols-2 gap-4">
          {/* Recent Clients */}
          <Card className="h-full p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-gray-900">Recent Clients</h3>
              <Link href="/admin/crm/clients">
                <span className="text-xs text-brand-blue font-medium hover:underline">View all</span>
              </Link>
            </div>
            {isLoading ? (
              <div className="px-4 pb-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !data?.recentClients?.length ? (
              <div className="px-4 pb-4">
                <p className="text-sm text-gray-500">No clients yet. <a href="/admin/crm/clients" className="text-brand-blue hover:underline">Add your first client</a> to get started.</p>
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
          <Card className="h-full p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-gray-900">Open Tasks</h3>
              <Link href="/admin/crm/inbox">
                <span className="text-xs text-brand-blue font-medium hover:underline">View inbox</span>
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
      {/* IA-1 — floating "resume editing" badge. Renders only when a
         minimized-wizard session exists in sessionStorage. */}
      <MinimizedWizardBadge />
    </AdminLayout>
  );
}
