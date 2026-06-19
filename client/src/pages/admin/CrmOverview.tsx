import { usePageTitle } from "@/hooks/usePageTitle";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Wrench, ClipboardList, Truck, CreditCard, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, RefreshCw, ShieldCheck, RotateCcw, Clock, Calculator, ArrowRight, Repeat, UserPlus, UserMinus, Inbox, FileText, Calendar, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import AdminLayout from "@/components/admin/AdminLayout";
import SystemHealthPanel from "@/components/admin/SystemHealthPanel";
import { adminStatusColor, ALERT_SEVERITY } from "@/config/adminLabels";

interface OverviewDeltas {
  mrrPct: number | null;
  activeSubscribersPct: number | null;
  collectedPct: number | null;
}

interface OverviewTimePoint {
  date: string;
  revenue_cents: number;
  leads: number;
}

interface Overview {
  totalClients: number;
  activeServices: number;
  pendingOnboarding: number;
  openFulfillment: number;
  unpaidAmount: number;
  monthlyRevenue: number;
  /** Recurring monthly revenue (active monthly client_services), cents. */
  mrrCents: number;
  /** Distinct clients with ≥1 active monthly recurring service. */
  activeSubscribers: number;
  newClientsThisMonth: number;
  churnThisMonth: number;
  deltas: OverviewDeltas;
  timeSeries: OverviewTimePoint[];
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
  low:      { badge: "bg-muted/50 text-muted-foreground border border-border", dot: "bg-gray-400" },
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
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-brand-blue flex items-center justify-center">
            <AlertTriangle className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Daily Operations Summary</h3>
            {generatedAt && (
              <p className="text-[10px] text-muted-foreground/70">
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
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 transition-opacity"
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
            <p className="text-sm text-muted-foreground mb-3">No daily summary yet. Run your first operations check.</p>
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
            <p className="text-sm text-foreground leading-relaxed">{aiOutput.summary}</p>

            {/* Priorities */}
            {aiOutput.priorities.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Priorities ({aiOutput.priorities.length})
                </p>
                <div className="space-y-1.5">
                  {aiOutput.priorities.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      <div className="pt-0.5">
                        <SeverityBadge severity={p.severity} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">{p.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{p.reason}</p>
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
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Risks</p>
                  <ul className="space-y-1">
                    {aiOutput.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aiOutput.recommendations.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Recommended Actions</p>
                  <ul className="space-y-1">
                    {aiOutput.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer meta */}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <p className="text-[10px] text-muted-foreground/70 italic">
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
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue text-white text-xs font-medium rounded-lg hover:bg-brand-blue-700 transition-colors"
    >
      <RefreshCw className="w-3 h-3" />
      Run Ops Analysis
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${adminStatusColor(status)}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* Trend pill — "+12% vs last month" with direction-aware color + arrow.
   null delta (no prior-period baseline) renders a neutral "New" chip so we
   never show a misleading +100% or a NaN. Theme-aware semantic tokens. */
function TrendPill({ delta }: { delta: number | null | undefined }) {
  if (delta == null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/80">
        New
        <span className="text-muted-foreground/50">vs last mo.</span>
      </span>
    );
  }
  const up = delta >= 0;
  const Arrow = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
        up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      <Arrow className="w-3 h-3" />
      {up ? "+" : ""}{delta}%
      <span className="text-muted-foreground/50 font-normal">vs last mo.</span>
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  color,
  delta,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  href?: string;
  color: string;
  /** Optional MoM trend; `undefined` = no trend row, `null` = no baseline. */
  delta?: number | null;
}) {
  const inner = (
    <Card className={`h-full p-4 transition-all duration-150 ${href ? "cursor-pointer hover:border-input hover:shadow-md active:scale-[0.98]" : "cursor-default"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      {delta !== undefined && (
        <div className="mt-2">
          <TrendPill delta={delta} />
        </div>
      )}
    </Card>
  );
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return inner;
}

/* ─── Revenue + Leads 30-day chart (recharts) ───
   Dual-series area chart: collected revenue ($, left axis) + leads (count,
   right axis) over the trailing 30 days. Semantic-token colors so it tracks
   light/dark. Reduced-motion: recharts honors isAnimationActive=false. */
function RevenueLeadsChart({ data, isLoading }: { data: OverviewTimePoint[] | undefined; isLoading: boolean }) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const chartData = (data ?? []).map((d) => ({
    date: d.date,
    label: new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    revenue: Math.round(d.revenue_cents / 100),
    leads: d.leads,
  }));

  const hasData = chartData.some((d) => d.revenue > 0 || d.leads > 0);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Revenue &amp; Leads</h3>
          <p className="text-[11px] text-muted-foreground/70">Collected revenue and new leads — last 30 days</p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--gauge-emerald))" }} />
            Revenue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--gauge-sapphire))" }} />
            Leads
          </span>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : !hasData ? (
        <div className="h-[220px] flex flex-col items-center justify-center text-center">
          <TrendingUp className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No revenue or leads in the last 30 days yet.</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">This chart fills in as payments clear and leads arrive.</p>
        </div>
      ) : (
        <div className="w-full h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="crmRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--gauge-emerald))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--gauge-emerald))" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="crmLeadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--gauge-sapphire))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--gauge-sapphire))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                interval="preserveStartEnd"
                minTickGap={24}
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis
                yAxisId="rev"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => `$${(v as number).toLocaleString()}`}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <YAxis
                yAxisId="leads"
                orientation="right"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={32}
                allowDecimals={false}
              />
              <RTooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "hsl(var(--popover-foreground))",
                }}
                formatter={(value: number, name: string) =>
                  name === "Revenue" ? [`$${value.toLocaleString()}`, name] : [value, name]
                }
              />
              <Area
                yAxisId="rev"
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="hsl(var(--gauge-emerald))"
                strokeWidth={2}
                fill="url(#crmRevGrad)"
                isAnimationActive={!prefersReducedMotion}
              />
              <Area
                yAxisId="leads"
                type="monotone"
                dataKey="leads"
                name="Leads"
                stroke="hsl(var(--gauge-sapphire))"
                strokeWidth={2}
                fill="url(#crmLeadGrad)"
                isAnimationActive={!prefersReducedMotion}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
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
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-brand-blue-600 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              QA Queue
              {count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-blue-100 text-brand-blue-700 text-[10px] font-bold">
                  {count}
                </span>
              )}
            </h3>
            <p className="text-[10px] text-muted-foreground/70">Tasks awaiting quality review before delivery</p>
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
            <ShieldCheck className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No tasks awaiting QA review.</p>
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
                <div key={t.id} className="rounded-lg border border-border bg-muted/50 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/crm/clients/${t.client_id}`}>
                        <p className="text-sm font-medium text-foreground hover:text-brand-blue truncate cursor-pointer">{t.title}</p>
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                        <span>{t.client_name ?? "Unknown client"}</span>
                        {t.service_name && (
                          <>
                            <span className="text-muted-foreground/50">|</span>
                            <span>{t.service_name}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/70">
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
        <h3 className="text-sm font-semibold text-foreground">Products</h3>
        <p className="text-[11px] text-muted-foreground/70">Jump into product-scoped admin tools</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link href="/admin/crm/quotequick" className="block">
          <Card className="h-full p-4 transition-all duration-150 cursor-pointer hover:border-input hover:shadow-md active:scale-[0.98]">
            <div className="flex items-start gap-3">
              <div data-theme="dark" className="w-10 h-10 rounded-lg flex items-center justify-center bg-brand-blue shrink-0">
                <Calculator className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">QuoteQuick</p>
                  <span className="inline-flex items-center text-[11px] font-medium text-brand-blue shrink-0">
                    Manage calculators
                    <ArrowRight className="w-3 h-3 ml-0.5" />
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Embeddable quote calculators across all clients
                </p>
                <div className="mt-2 min-h-[20px]">
                  {isLoading ? (
                    <Skeleton className="h-3 w-48" />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{activeCalculators}</span> active
                      {activeCalculators === 1 ? " calculator" : " calculators"}
                      <span className="text-muted-foreground/50 mx-1.5">·</span>
                      <span className="font-semibold text-foreground">{leadsThisMonth}</span>{" "}
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

/* ─── Time-of-day greeting ───
   "Good morning/afternoon/evening, {name}" — Jobber-style personalized
   header. Falls back to the email local-part, then a neutral greeting, so
   we never render "Good morning, null". */
function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardGreeting() {
  const { user } = useAuth();
  const firstName =
    user?.name?.trim().split(/\s+/)[0] ||
    user?.email?.split("@")[0] ||
    null;
  const greeting = greetingForHour(new Date().getHours());
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">
        {greeting}{firstName ? `, ${firstName}` : ""}
      </h2>
      <p className="text-sm text-muted-foreground mt-0.5">Here's your business at a glance</p>
    </div>
  );
}

/* ─── Workflow row (Jobber-inspired) ───
   Four lifecycle cards — Requests/Leads, Quotes (QuoteQuick), Jobs
   (BookFlow appointments), Invoices — each a big count + 1–3 sub-status
   quick-links to the relevant admin route. Data is sourced from EXISTING
   endpoints only; a card renders a graceful skeleton/zero state when its
   slice hasn't loaded rather than inventing numbers. On-brand WeFixTrades
   cards (rounded, soft shadow, brand accents) — not a Jobber visual clone. */
interface WorkflowSubLink {
  label: string;
  href: string;
  count?: number;
  emphasize?: boolean;
}

function WorkflowCard({
  icon: Icon,
  label,
  value,
  href,
  color,
  isLoading,
  subLinks,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  href: string;
  color: string;
  isLoading: boolean;
  subLinks: WorkflowSubLink[];
}) {
  return (
    <Card className="h-full p-4 flex flex-col transition-all duration-150 hover:border-input hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          {isLoading ? (
            <Skeleton className="h-8 w-12 mt-1" />
          ) : (
            <Link href={href} className="block">
              <p className="text-2xl font-semibold text-foreground mt-1 hover:text-brand-blue transition-colors">{value}</p>
            </Link>
          )}
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-border space-y-1.5">
        {subLinks.map((sl) => (
          <Link
            key={sl.label}
            href={sl.href}
            className="flex items-center justify-between gap-2 text-xs text-muted-foreground hover:text-brand-blue transition-colors group"
          >
            <span className={`truncate ${sl.emphasize ? "font-medium text-foreground" : ""}`}>{sl.label}</span>
            <span className="flex items-center gap-0.5 shrink-0">
              {isLoading ? (
                <Skeleton className="h-3 w-4" />
              ) : (
                sl.count != null && <span className="font-semibold tabular-nums">{sl.count}</span>
              )}
              <ChevronRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-brand-blue" />
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

interface AdminRecentBooking {
  id: number;
  date: string | null;
  time: string | null;
  customer_name: string;
  service: string | null;
  status: string;
}
interface AdminRecentBookingsResponse {
  data: AdminRecentBooking[];
  total: number;
}

function AdminWorkflowRow({ overview, overviewLoading }: { overview: Overview | undefined; overviewLoading: boolean }) {
  // QuoteQuick slice — active calculators + leads this month (existing endpoints).
  const { data: qqOverview, isLoading: qqOverviewLoading } = useQuery<QQOverviewResponse>({
    queryKey: ["/api/admin/crm/quotequick/overview"],
    queryFn: () => apiRequest("GET", "/api/admin/crm/quotequick/overview").then((r) => r.json()),
    staleTime: 60_000,
  });
  const { data: qqTrend, isLoading: qqTrendLoading } = useQuery<QQTrendResponse>({
    queryKey: ["/api/admin/crm/quotequick/trends"],
    queryFn: () => apiRequest("GET", "/api/admin/crm/quotequick/trends").then((r) => r.json()),
    staleTime: 60_000,
  });
  // Jobs/Bookings slice — unified BookFlow appointments (existing admin endpoint).
  const { data: bookings, isLoading: bookingsLoading } = useQuery<AdminRecentBookingsResponse>({
    queryKey: ["/api/admin/booking/recent"],
    queryFn: () => apiRequest("GET", "/api/admin/booking/recent?limit=200").then((r) => r.json()),
    staleTime: 60_000,
  });

  const calculators = qqOverview?.calculators ?? [];
  const activeCalculators = calculators.filter((c) => c.status === "live").length;
  const draftCalculators = calculators.filter((c) => c.status !== "live").length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const leadsThisMonth = (qqTrend?.trend ?? []).reduce((acc, d) => {
    const dt = new Date(d.date);
    return dt >= monthStart ? acc + d.count : acc;
  }, 0);

  const rows = bookings?.data ?? [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysJobs = rows.filter((b) => b.date === todayStr).length;
  const upcomingJobs = rows.filter((b) => (b.date ?? "") > todayStr).length;
  const pendingJobs = rows.filter((b) => b.status === "pending").length;

  const formatCurrency = (cents: number) =>
    `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">Workflow</h3>
        <p className="text-[11px] text-muted-foreground/70">Requests → quotes → jobs → invoices</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Requests / Leads — onboarding submissions + open tasks (admin overview) */}
        <WorkflowCard
          icon={Inbox}
          label="Requests"
          value={overview?.pendingOnboarding ?? 0}
          href="/admin/crm/inbox"
          color="bg-amber-500"
          isLoading={overviewLoading}
          subLinks={[
            { label: "Awaiting onboarding", href: "/admin/crm/inbox", count: overview?.pendingOnboarding, emphasize: true },
            { label: "Open tasks", href: "/admin/crm/inbox", count: overview?.openFulfillment },
          ]}
        />
        {/* Quotes — QuoteQuick calculators + leads captured this month */}
        <WorkflowCard
          icon={Calculator}
          label="Quotes"
          value={activeCalculators}
          href="/admin/crm/quotequick"
          color="bg-brand-blue"
          isLoading={qqOverviewLoading || qqTrendLoading}
          subLinks={[
            { label: "Live calculators", href: "/admin/crm/quotequick", count: activeCalculators, emphasize: true },
            { label: "Drafts / paused", href: "/admin/crm/quotequick", count: draftCalculators },
            { label: "Leads this month", href: "/admin/crm/quotequick", count: leadsThisMonth },
          ]}
        />
        {/* Jobs — BookFlow appointments across every origin */}
        <WorkflowCard
          icon={Calendar}
          label="Jobs"
          value={todaysJobs}
          href="/admin/booking"
          color="bg-violet-500"
          isLoading={bookingsLoading}
          subLinks={[
            { label: "Today", href: "/admin/booking", count: todaysJobs, emphasize: true },
            { label: "Upcoming", href: "/admin/booking", count: upcomingJobs },
            { label: "Pending confirm", href: "/admin/booking", count: pendingJobs },
          ]}
        />
        {/* Invoices — outstanding balance (admin overview) */}
        <WorkflowCard
          icon={FileText}
          label="Invoices"
          value={overviewLoading ? "—" : formatCurrency(overview?.unpaidAmount ?? 0)}
          href="/admin/crm/billing"
          color="bg-red-500"
          isLoading={overviewLoading}
          subLinks={[
            { label: "Unpaid balance", href: "/admin/crm/billing", emphasize: true },
            { label: "View billing", href: "/admin/crm/billing" },
          ]}
        />
      </div>
    </div>
  );
}

/* ─── Today's appointments panel (admin) ───
   Reads the unified BookFlow appointments via the existing
   /api/admin/booking/recent endpoint, filters to today, and lists them in
   start-time order. Graceful empty-state with a CTA to the schedule when
   the day is clear. */
function TodaysAppointmentsPanel() {
  const { data, isLoading } = useQuery<AdminRecentBookingsResponse>({
    queryKey: ["/api/admin/booking/recent"],
    queryFn: () => apiRequest("GET", "/api/admin/booking/recent?limit=200").then((r) => r.json()),
    staleTime: 60_000,
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const todays = (data?.data ?? [])
    .filter((b) => b.date === todayStr)
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  const formatTime = (t: string | null) => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h)) return t;
    const d = new Date();
    d.setHours(h, m || 0, 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  return (
    <Card className="h-full p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-violet-500 flex items-center justify-center">
            <Calendar className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Today's appointments
              {!isLoading && todays.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-blue-100 text-brand-blue-700 text-[10px] font-bold">
                  {todays.length}
                </span>
              )}
            </h3>
            <p className="text-[10px] text-muted-foreground/70">Scheduled BookFlow jobs for today</p>
          </div>
        </div>
        <Link href="/admin/booking">
          <span className="text-xs text-brand-blue font-medium hover:underline">View schedule</span>
        </Link>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : todays.length === 0 ? (
          <div className="text-center py-6">
            <Calendar className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No appointments scheduled today.</p>
            <Link href="/admin/booking" className="text-xs text-brand-blue hover:underline mt-1 inline-block">
              Open the schedule →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {todays.map((appt) => (
              <Link key={appt.id} href="/admin/booking">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2.5 hover:bg-muted transition-colors cursor-pointer">
                  <div className="flex flex-col items-center justify-center min-w-[52px] shrink-0">
                    <span className="text-sm font-semibold text-foreground tabular-nums">{formatTime(appt.time)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{appt.customer_name}</p>
                    {appt.service && <p className="text-[11px] text-muted-foreground truncate">{appt.service}</p>}
                  </div>
                  <StatusBadge status={appt.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
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
        {/* Wave 141 — system health surfaces, pinned to the very top. */}
        <SystemHealthPanel />

        {/* Time-of-day greeting (Jobber-style personalized header) */}
        <DashboardGreeting />

        {/* Workflow row — Jobber-inspired lifecycle cards (Requests → Quotes
            → Jobs → Invoices), each linking into the relevant admin surface. */}
        <AdminWorkflowRow overview={data} overviewLoading={isLoading} />

        {/* Headline subscription KPIs — recurring-revenue health with MoM
            trend. MRR is recurring (active monthly subs); Collected is cash
            in this month. Both shown side-by-side so they're never conflated. */}
        <div className="grid auto-rows-fr grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="h-full p-4">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-24 mt-3" />
              </Card>
            ))
          ) : (
            <>
              <StatCard label="MRR" value={formatCurrency(data?.mrrCents ?? 0)} icon={Repeat} href="/admin/crm/billing" color="bg-emerald-600" delta={data?.deltas?.mrrPct} />
              <StatCard label="Collected (Mo)" value={formatCurrency(data?.monthlyRevenue ?? 0)} icon={TrendingUp} href="/admin/crm/billing" color="bg-emerald-500" delta={data?.deltas?.collectedPct} />
              <StatCard label="Active Subscribers" value={data?.activeSubscribers ?? 0} icon={Users} href="/admin/crm/services" color="bg-brand-blue" delta={data?.deltas?.activeSubscribersPct} />
              <StatCard label="New / Churned (Mo)" value={`${data?.newClientsThisMonth ?? 0} / ${data?.churnThisMonth ?? 0}`} icon={UserPlus} href="/admin/crm/clients" color="bg-violet-500" />
            </>
          )}
        </div>

        {/* Revenue + Leads 30-day chart */}
        <RevenueLeadsChart data={data?.timeSeries} isLoading={isLoading} />

        {/* Operations stat cards */}
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
              <StatCard label="Total Clients" value={data?.totalClients ?? 0} icon={Users} href="/admin/crm/clients" color="bg-brand-blue" />
              <StatCard label="Active Services" value={data?.activeServices ?? 0} icon={Wrench} href="/admin/crm/services" color="bg-blue-500" />
              <StatCard label="Onboarding" value={data?.pendingOnboarding ?? 0} icon={ClipboardList} href="/admin/crm/inbox" color="bg-amber-500" />
              <StatCard label="Open Tasks" value={data?.openFulfillment ?? 0} icon={Truck} href="/admin/crm/inbox" color="bg-brand-blue-500" />
              <StatCard label="Unpaid" value={formatCurrency(data?.unpaidAmount ?? 0)} icon={CreditCard} href="/admin/crm/billing" color="bg-red-500" />
              <StatCard label="Churned (Mo)" value={data?.churnThisMonth ?? 0} icon={UserMinus} href="/admin/crm/services" color="bg-red-500" />
            </>
          )}
        </div>

        {/* Products section — IA-1 deferral (2026-05-22) */}
        <QuoteQuickProductCard />

        {/* Ops Intelligence Widget */}
        <div className="grid grid-cols-1 gap-4">
          <OpsIntelligenceWidget />
        </div>

        {/* Today's appointments (BookFlow) + QA Queue side-by-side */}
        <div className="grid auto-rows-fr md:grid-cols-2 gap-4">
          <TodaysAppointmentsPanel />
          <QaQueueWidget />
        </div>

        {/* Bottom panels */}
        <div className="grid auto-rows-fr md:grid-cols-2 gap-4">
          {/* Recent Clients */}
          <Card className="h-full p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-foreground">Recent Clients</h3>
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
                <p className="text-sm text-muted-foreground">No clients yet. <a href="/admin/crm/clients" className="text-brand-blue hover:underline">Add your first client</a> to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.recentClients.map((c) => (
                  <Link key={c.id} href={`/admin/crm/clients/${c.id}`}>
                    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 cursor-pointer min-h-[44px]">
                      <span className="text-sm font-medium text-foreground truncate">{c.business_name}</span>
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
              <h3 className="text-sm font-semibold text-foreground">Open Tasks</h3>
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
                <p className="text-sm text-muted-foreground">No open tasks.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.recentTasks.map((t) => (
                  <Link key={t.id} href={`/admin/crm/clients/${t.client_id}`}>
                    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 cursor-pointer min-h-[44px] gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground/70 truncate">{t.client_name}</p>
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
