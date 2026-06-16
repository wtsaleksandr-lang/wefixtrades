import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wrench, ClipboardList, AlertCircle, CreditCard, ExternalLink, HelpCircle, RefreshCw, PhoneCall, Clock, ChevronRight, Plus, UserPlus, Sparkles, LifeBuoy } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { TASK_STATUS_STYLES, TASK_STATUS_LABELS, statusLabel } from "@/config/portalLabels";
import ModeToggle from "@/components/portal/ModeToggle";
import { useAuth } from "@/hooks/useAuth";
import { TradelineSetupBanner } from "./TradelineSetup/DashboardBanner";
import { AdvancedOnly } from "@/components/ui/AdvancedOnly";
// BG-3: canonical elevation primitive — uses --shadow-card token + bg-card/border-card-border
// so cards inherit the design-system soft-card shadow and respond to dark mode.
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
// Premium polish — smooth-count animation on KPI numbers (respects reduced motion).
import AnimatedNumber from "@/components/AnimatedNumber";
// Premium hero sparkline — reuses the TradeLine-grade visual primitive.
import { SparklineWithPeak } from "@/components/ui/visual-primitives/SparklineWithPeak";
// First-visit progressive-disclosure tooltip — one-time hint per browser/profile.
import { FirstVisitTooltip } from "@/components/portal/FirstVisitTooltip";

/* Temporary in-page error surface so a render exception shows on the page
 * instead of blanking the React tree. Replace with the app's global error
 * boundary once the underlying bug is fixed. */
class PortalErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[PortalErrorBoundary]", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="max-w-md mx-auto mt-12 bg-card border border-border rounded-xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground mb-1">Something went wrong</p>
          <p className="text-xs text-muted-foreground mb-4">Refresh the page — if it keeps happening, contact support and we'll look into it.</p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
            <Link
              href="/portal/help"
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-brand-blue border border-brand-blue/40 rounded-lg hover:bg-[#EEF3FF] dark:hover:bg-brand-blue/15 transition-colors"
            >
              Help
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface PendingOnboardingRow {
  id: number;
  client_service_id: number;
  service_id: string;
  service_name: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  has_draft: boolean;
}

interface OverviewData {
  business_name: string;
  contact_name: string | null;
  active_services: number;
  pending_onboarding: number;
  action_needed: number;
  outstanding_balance_cents: number;
  recent_activity: {
    id: number;
    title: string;
    status: string;
    completed_at: string | null;
    updated_at: string | null;
  }[];
  /** 14-day daily leads series (zero-filled) for the hero sparkline. */
  leads_series?: { date: string; count: number }[];
}

interface QuoteQuickData {
  calculator: {
    id: number;
    business_name: string;
    slug: string;
    edit_token: string;
    plan_tier: string;
    total_views: number;
    total_leads: number;
    status: string;
  } | null;
}

interface TradeLineService {
  id: number;
  service_id: string;
  status: string;
}

interface TradeLineData {
  config: {
    currentMode: string;
    variant: string;
    channels: { voice: boolean; websiteChat: boolean; sms: boolean };
    setupStage?: string;
  } | null;
  setupStage?: string;
  usage: {
    voice_minutes_used: number;
    calls_count: number;
    included_minutes: number;
    overage_minutes?: number;
  } | null;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDollarsRound(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return null;
  const ms = t - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  return days >= 0 ? days : null;
}

interface DashboardBillingSlice {
  summary: {
    total_pending_cents: number;
    next_due_at: string | null;
    next_due_amount_cents: number | null;
  };
}

interface TicketsSlice {
  tickets: { id: number; status: string }[];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (isNaN(diff)) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PortalDashboard() {
  return (
    <PortalErrorBoundary>
      <PortalDashboardInner />
    </PortalErrorBoundary>
  );
}

function PortalDashboardInner() {
  usePageTitle("Dashboard");
  const { user } = useAuth();
  const qc = useQueryClient();
  // Q20a: capture the API error code so admin-without-client gets a friendly
  // empty state instead of the generic red error box.
  const { data, isLoading, error, refetch } = useQuery<OverviewData, Error & { code?: string }>({
    queryKey: ["/api/portal/overview"],
    queryFn: async () => {
      const res = await fetch("/api/portal/overview", { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.error || "Failed to load overview") as Error & { code?: string };
        if (body.code) err.code = body.code;
        throw err;
      }
      return res.json();
    },
    retry: (failureCount, err) => {
      // Don't retry on no_client_linked — it's stable until admin creates a client.
      if ((err as Error & { code?: string })?.code === "no_client_linked") return false;
      return failureCount < 2;
    },
  });
  const isAdminWithoutClient = (error as Error & { code?: string })?.code === "no_client_linked";

  const { data: ssProfile } = useQuery<any>({
    queryKey: ["/api/portal/socialsync-profile"],
    queryFn: async () => {
      const res = await fetch("/api/portal/socialsync-profile", { credentials: "include" });
      if (!res.ok) return { exists: false };
      return res.json();
    },
  });

  const { data: pendingOnboarding } = useQuery<{ submissions: PendingOnboardingRow[] }>({
    queryKey: ["/api/portal/onboarding"],
    queryFn: async () => {
      const res = await fetch("/api/portal/onboarding", { credentials: "include" });
      if (!res.ok) return { submissions: [] };
      return res.json();
    },
  });

  const { data: qqData, isSuccess: qqLoaded } = useQuery<QuoteQuickData>({
    queryKey: ["/api/portal/quotequick/summary"],
    queryFn: async () => {
      const res = await fetch("/api/portal/quotequick/summary", { credentials: "include" });
      if (!res.ok) return { calculator: null };
      return res.json();
    },
  });

  // Find TradeLine service from the services list
  const { data: portalServices } = useQuery<TradeLineService[]>({
    queryKey: ["/api/portal/services"],
    queryFn: async () => {
      const res = await fetch("/api/portal/services", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      // Defensive: server may return [], {services: []}, or some other shape.
      // The `?? []` fallback in the consumer doesn't help if data is a non-array
      // object, so we force an array here.
      const raw = data?.services ?? data;
      return Array.isArray(raw) ? raw : [];
    },
  });

  // Defensive at the consumer too: PortalLayout shares this query key but its
  // queryFn returns the raw response (which may be {services: [...]} or another
  // object), and TanStack's first-registered queryFn wins. So coerce here.
  const servicesArr: TradeLineService[] = Array.isArray(portalServices)
    ? portalServices
    : ((portalServices as { services?: TradeLineService[] } | null | undefined)?.services ?? []);
  const tradeLineService = servicesArr.find(
    (s) => s.service_id?.startsWith("tradeline") && s.status !== "cancelled"
  );

  const { data: tlData } = useQuery<TradeLineData>({
    queryKey: ["/api/portal/tradeline", tradeLineService?.id],
    queryFn: async () => {
      const res = await fetch(`/api/portal/tradeline/${tradeLineService!.id}`, { credentials: "include" });
      if (!res.ok) return { config: null, usage: null };
      return res.json();
    },
    enabled: !!tradeLineService,
  });

  // Hero strip: billing + tickets slices. Defensive — if a sub-query fails,
  // the hero just renders without that field rather than breaking the page.
  const { data: billingSlice } = useQuery<DashboardBillingSlice>({
    queryKey: ["/api/portal/billing"],
    queryFn: async () => {
      const res = await fetch("/api/portal/billing", { credentials: "include" });
      if (!res.ok) return { summary: { total_pending_cents: 0, next_due_at: null, next_due_amount_cents: null } };
      return res.json();
    },
  });
  const { data: ticketsSlice } = useQuery<TicketsSlice>({
    queryKey: ["/api/portal/tickets"],
    queryFn: async () => {
      const res = await fetch("/api/portal/tickets", { credentials: "include" });
      if (!res.ok) return { tickets: [] };
      return res.json();
    },
  });
  const openTickets = (ticketsSlice?.tickets ?? []).filter(
    (t) => t.status !== "resolved" && t.status !== "closed",
  ).length;
  const leadsThisMonth = qqData?.calculator?.total_leads ?? 0;
  // First-run signal — the QuoteQuick summary query has resolved AND the user
  // owns no calculator yet. Drives the "build your first calculator" hero so a
  // new signup lands on the wizard CTA instead of a generic admin dashboard.
  const hasNoCalculator = qqLoaded && qqData?.calculator == null;
  const nextBillingDays = daysUntil(billingSlice?.summary.next_due_at);
  const nextBillCents = billingSlice?.summary.next_due_amount_cents ?? null;

  // Hero sparkline series + week-over-week trend. The 14-day series splits
  // into two 7-day halves; the delta is last-7 vs prior-7 leads. null when
  // there's no prior-week baseline so we render "New" not a misleading +100%.
  const leadsSeries = data?.leads_series ?? [];
  const sparkValues = leadsSeries.map((d) => d.count);
  const sparkLabels = leadsSeries.map((d) =>
    new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  );
  const last7 = sparkValues.slice(-7).reduce((a, b) => a + b, 0);
  const prev7 = sparkValues.slice(0, Math.max(0, sparkValues.length - 7)).reduce((a, b) => a + b, 0);
  const leadsTrendPct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;
  const hasSparkData = sparkValues.some((v) => v > 0);

  return (
    <PortalLayout>
      {isLoading && (
        <div className="space-y-6" data-testid="dashboard-skeleton">
          <div>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid auto-rows-fr grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="h-full p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-20 mb-1.5" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
      {error && isAdminWithoutClient && (
        /* Q20a: admin previewing the portal with no client record linked
           to their user account. Show what the customer view looks like
           but empty + give them next-step links. */
        <div className="max-w-2xl mt-8" data-testid="admin-no-client-empty">
          <Card className="border-amber-200 dark:border-amber-800/60 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
                <UserPlus className="w-5 h-5 text-amber-700 dark:text-amber-300" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">No client account linked to your admin user</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  You're seeing the customer portal as <strong>{user?.email}</strong>, but there's no client record
                  linked to this admin user. The portal would normally show that client's dashboard, services,
                  payments, and onboarding tasks.
                </p>
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What you can do</p>
              <div className="space-y-2">
                <Link
                  href="/admin/crm/clients"
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-brand-blue/40 hover:bg-[#EEF3FF]/50 dark:hover:bg-brand-blue/10 transition-colors group"
                  data-testid="empty-state-clients-link"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Open the clients list</p>
                    <p className="text-xs text-muted-foreground">Pick a real client → their portal will populate with their data</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/70 group-hover:text-brand-blue shrink-0" />
                </Link>
                <Link
                  href="/admin/crm"
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-brand-blue/40 hover:bg-[#EEF3FF]/50 dark:hover:bg-brand-blue/10 transition-colors group"
                  data-testid="empty-state-admin-link"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Return to the admin dashboard</p>
                    <p className="text-xs text-muted-foreground">Exit preview mode and go back to /admin/crm</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/70 group-hover:text-brand-blue shrink-0" />
                </Link>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground/70 border-t border-border pt-3">
              To preview a specific client's portal you'd need a client record whose <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">user_id</code> column matches your admin user id.
            </p>
          </Card>
        </div>
      )}
      {error && !isAdminWithoutClient && (
        <div className="bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 rounded-lg p-4 text-sm flex items-center justify-between">
          <span>We hit a snag loading your dashboard. A refresh usually fixes it.</span>
          <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-red-200 dark:border-red-800/60 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors">
            <RefreshCw className="w-3 h-3" /> Try again
          </button>
        </div>
      )}
      {data && data.active_services === 0 && (
        /* New-customer welcome flow — zero active services. Replaces
           StatCards + Recent Activity with a focused first-action prompt.
           Activation fix: QuoteQuick (the free wizard) is the product's front
           door, so for a brand-new signup that owns NO calculator yet the
           PRIMARY action is "build your first quote calculator → /wizard"
           (free, no card). "Browse services"/catalog is demoted to a secondary
           link. A zero-services user who ALREADY built a calculator (free
           QuoteQuick signup) instead leads with "Browse services" — no point
           pushing them to build a second one. */
        <div className="max-w-3xl" data-testid="dashboard-new-customer-welcome">
          <Card className="p-8 text-center">
            <Sparkles className="mx-auto text-brand-blue mb-4" size={32} aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground mb-2">Welcome to WeFixTrades</h2>
            {hasNoCalculator ? (
              <>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Start with a free quote calculator — describe your job and the
                  AI drafts the whole thing. Live in ~5 minutes, no card needed.
                </p>
                <Link
                  href="/wizard"
                  data-testid="dashboard-welcome-build-calculator"
                  className="btn-primary-premium inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg"
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Build your first quote calculator
                </Link>
                <Link
                  href="/portal/catalog"
                  data-testid="dashboard-welcome-browse"
                  className="block mt-3 text-sm text-muted-foreground hover:underline"
                >
                  Or browse done-for-you services →
                </Link>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Pick your first service to get started. We'll guide you through setup and connect everything for you.
                </p>
                <Link
                  href="/portal/catalog"
                  data-testid="dashboard-welcome-browse"
                  className="btn-primary-premium inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg"
                >
                  Browse services
                </Link>
                <Link
                  href="/tools/free-audit"
                  className="block mt-3 text-sm text-muted-foreground hover:underline"
                  data-testid="dashboard-welcome-free-audit"
                >
                  Or run a free audit first →
                </Link>
              </>
            )}
          </Card>
        </div>
      )}
      {data && data.active_services > 0 && (
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Welcome{data.contact_name ? `, ${data.contact_name}` : ""}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{data.business_name}</p>
          </div>

          {/* Hero KPI strip — premium brand-tinted summary panel above
             the existing 4 StatCards. Surfaces leads this month, next
             billing, and open tickets in one glance.
             Wrapped in <FirstVisitTooltip> to give new customers a one-time
             "what is this?" hint anchored to the hero card. */}
          <FirstVisitTooltip
            storageKey="portal-dashboard-hero"
            title="Your dashboard at a glance"
            position="bottom"
            className="block w-full"
            anchor={
              <Card
                data-testid="dashboard-hero-kpi"
                className="mb-4 bg-gradient-to-br from-brand-blue to-brand-blue-600 text-white border-0"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wider opacity-75 mb-2">This month</div>
                      <div className="text-3xl font-bold mb-1">
                        <AnimatedNumber value={leadsThisMonth} duration={1000} /> lead{leadsThisMonth === 1 ? "" : "s"}
                        {nextBillingDays != null && nextBillCents != null && (
                          <span className="text-sm font-normal opacity-80">
                            {" · "}{formatDollarsRound(nextBillCents)} due in {nextBillingDays}d
                          </span>
                        )}
                      </div>
                      {/* Week-over-week leads trend */}
                      <div className="text-xs opacity-80 mb-3">
                        {leadsTrendPct == null ? (
                          <span>Last 14 days</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <span className={leadsTrendPct >= 0 ? "text-emerald-200" : "text-red-200"}>
                              {leadsTrendPct >= 0 ? "▲" : "▼"} {leadsTrendPct >= 0 ? "+" : ""}{leadsTrendPct}%
                            </span>
                            <span className="opacity-70">vs prior 7 days</span>
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Hero sparkline — leads over the last 14 days. Hidden until
                       there's at least one lead so empty accounts stay clean. */}
                    {hasSparkData && (
                      <div className="hidden sm:block shrink-0 -mr-1 -mt-1" data-testid="dashboard-hero-sparkline">
                        <SparklineWithPeak
                          data={sparkValues}
                          pointLabels={sparkLabels}
                          color="sapphire"
                          width={180}
                          height={72}
                          peakLabel={`${Math.max(...sparkValues)} leads`}
                          ariaLabel={`Leads over the last ${sparkValues.length} days`}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href="/portal/services"
                      className="text-sm text-white/90 hover:text-white hover:underline"
                      data-testid="dashboard-hero-services-link"
                    >
                      View your services →
                    </Link>
                    {openTickets > 0 && (
                      <Link
                        href="/portal/help"
                        className="text-sm text-white/90 hover:text-white hover:underline inline-flex items-center gap-1"
                        data-testid="dashboard-hero-tickets-link"
                      >
                        <LifeBuoy className="w-3.5 h-3.5" />
                        {openTickets} open ticket{openTickets === 1 ? "" : "s"}
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            }
          >
            Lead counts, billing, and open tickets all live here. Refreshes every minute.
          </FirstVisitTooltip>

          {/* Wave 36 — Tesla Simplification migration banner. Shown once per user. */}
          <SimplifiedDashboardBanner />

          {/* Tradeline setup banner — hidden once setup is complete */}
          <TradelineSetupBanner />

          {/* Stat cards */}
          <div className="grid auto-rows-fr grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Active Services"
              value={
                data.active_services > 0
                  ? <AnimatedNumber value={data.active_services} duration={800} />
                  : 0
              }
              icon={Wrench}
              color="text-brand-blue"
              bgColor="bg-[#EEF3FF] dark:bg-brand-blue/15"
              href="/portal/services"
              help="Services currently running on your account. Click through to see each one's progress and settings."
            />
            <StatCard
              label="Setup Required"
              value={
                data.pending_onboarding > 0
                  ? <AnimatedNumber value={data.pending_onboarding} duration={800} />
                  : 0
              }
              subtitle="Forms to complete"
              icon={ClipboardList}
              color="text-amber-600 dark:text-amber-300"
              bgColor="bg-amber-50 dark:bg-amber-950/40"
              href="/portal/services"
              help="Setup forms we still need from you — your services can't launch until these are in."
            />
            <StatCard
              label="Action Needed"
              value={
                data.action_needed > 0
                  ? <AnimatedNumber value={data.action_needed} duration={800} />
                  : 0
              }
              subtitle="Waiting on you"
              icon={AlertCircle}
              color={data.action_needed > 0 ? "text-red-600 dark:text-red-300" : "text-muted-foreground/70"}
              bgColor={data.action_needed > 0 ? "bg-red-50 dark:bg-red-950/40" : "bg-muted/50"}
              href="/portal/services"
              help="Items blocked on a decision or approval from you — clear these to keep work moving."
            />
            <StatCard
              label="Amount Due"
              value={
                data.outstanding_balance_cents > 0
                  ? <AnimatedNumber
                      value={data.outstanding_balance_cents}
                      duration={800}
                      format={formatCents}
                    />
                  : formatCents(0)
              }
              icon={CreditCard}
              color="text-blue-600 dark:text-blue-300"
              bgColor="bg-blue-50 dark:bg-blue-950/40"
              href="/portal/billing"
              help="Your current outstanding balance across all invoices. Click through to Billing to pay or see details."
            />
          </div>

          {/* Q16: Add Services CTA — single entry-point to the in-portal service catalog */}
          <Link href="/portal/catalog" data-testid="link-add-services">
            <Card
              className="flex items-center justify-between hover:border-brand-blue/40 p-5 transition-all group cursor-pointer"
            >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#EEF3FF] dark:bg-brand-blue/15 flex items-center justify-center">
                <Plus className="w-5 h-5 text-brand-blue" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Add Services</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Browse available services and add them to your subscription.</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/70 group-hover:text-brand-blue transition-colors" />
            </Card>
          </Link>

          {/* Pending onboarding card — only shows if there are any forms to complete */}
          {pendingOnboarding?.submissions && pendingOnboarding.submissions.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800/60 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-amber-600 dark:text-amber-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Complete your setup</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      We need a few details before we can launch your service
                      {pendingOnboarding.submissions.length > 1 ? "s" : ""}.
                    </p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-border border-t border-border">
                {pendingOnboarding.submissions.map((sub) => (
                  <Link
                    key={sub.id}
                    href={`/portal/onboarding/${sub.id}`}
                    className="flex items-center justify-between py-3 hover:bg-muted/50 -mx-5 px-5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{sub.service_name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {sub.has_draft ? "Draft saved — continue" : "Not started"}
                          {sub.status === "viewed" && !sub.has_draft ? " · viewed" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        sub.has_draft
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}>
                        {sub.has_draft ? "In progress" : "Start"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/70" />
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* First-run hero — shown only when the user owns ZERO calculators
             (qqData resolved + calculator == null). The wizard is the product's
             strength but was invisible on the dashboard; this is the primary
             "build your first calculator" front door → /wizard. Hidden once the
             user has any calculator, so returning users see the normal board. */}
          {hasNoCalculator && (
            <Card
              className="relative border-brand-blue/30 bg-[#EEF3FF]/60 dark:bg-brand-blue/10 p-6"
              data-testid="dashboard-first-calculator-cta"
            >
              {/* Help cue — top-left of the component per DESIGN-SYSTEM hard rule */}
              <span className="absolute top-1 left-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground/70 cursor-default shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px] text-xs">
                    Build a quote calculator your customers fill in to get an instant price — it captures their details as a lead. The wizard drafts the whole thing for you; you can edit everything afterwards.
                  </TooltipContent>
                </Tooltip>
              </span>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-brand-blue/15 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-brand-blue" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-foreground">Build your first quote calculator</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Free, no card — live in ~5 minutes. Describe your job and the AI drafts the whole thing.
                  </p>
                </div>
                <Link
                  href="/wizard"
                  data-testid="dashboard-first-calculator-start"
                  className="btn-primary-premium inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg shrink-0"
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Start building
                </Link>
              </div>
            </Card>
          )}

          {/* TradeLine card */}
          {tradeLineService && tlData?.config && (() => {
            const stage = tlData.setupStage || tlData.config.setupStage || tradeLineService.status;
            const statusBadge = stage === "live"
              ? { label: "Live", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" }
              : stage === "ready_for_testing"
              ? { label: "Ready for testing", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" }
              : { label: "Setting up", cls: "bg-muted text-muted-foreground" };

            return (
              <Card className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                      <PhoneCall className="w-5 h-5 text-blue-600 dark:text-blue-300" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        {/* Help cue — top-left of the component per DESIGN-SYSTEM hard rule */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3 h-3 text-muted-foreground/70 cursor-default shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[280px] text-xs">
                            Your AI phone assistant. The toggle switches between AI answering and forwarding to you; Details opens call history and voice settings.
                          </TooltipContent>
                        </Tooltip>
                        <h3 className="text-sm font-semibold text-foreground">TradeLine</h3>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize bg-muted text-foreground">
                          {(tlData.config.variant ?? "").replace(/_/g, " ")}
                        </span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge.cls}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Link href={`/portal/services/${tradeLineService.id}`}>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-blue-600 transition-colors">
                      Details <ExternalLink className="w-3 h-3" />
                    </span>
                  </Link>
                </div>

                <div className="mt-4 pt-3 border-t border-border space-y-3">
                  <ModeToggle
                    currentMode={tlData.config.currentMode as any}
                    clientServiceId={tradeLineService.id}
                    apiBase="/api/portal/tradeline"
                    onModeChanged={() => {
                      // Refresh the TradeLine slice so the dashboard reflects
                      // the new mode immediately (was a no-op before).
                      qc.invalidateQueries({ queryKey: ["/api/portal/tradeline", tradeLineService.id] });
                    }}
                  />
                  {tlData.usage ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">Monthly usage</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                          <PhoneCall className="w-3.5 h-3.5 text-muted-foreground/70" />
                          <span className="text-sm text-muted-foreground">{tlData.usage.calls_count} calls</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                          <span className="text-sm text-muted-foreground">
                            {tlData.usage.voice_minutes_used} / {tlData.usage.included_minutes} minutes used
                          </span>
                        </div>
                      </div>
                      {(tlData.usage.overage_minutes ?? 0) > 0 && (
                        <p className="text-xs text-amber-600 mt-1.5">
                          {tlData.usage.overage_minutes} overage minutes
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 mt-2">Minutes = total time your AI spends on calls this month.</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/70">No activity yet this month.</p>
                  )}
                </div>
              </Card>
            );
          })()}
          {/* Wave 36 — SocialSync setup CTA deleted (audit: duplicates Services catalogue + nav). */}

          {/* Recent activity — Wave 36: hidden in Simple mode. Ask the
              AI Copilot "what changed?" to surface this. */}
          <AdvancedOnly product="portal" elementId="portal.recent-activity-feed">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            </div>
            {!data.recent_activity || data.recent_activity.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm font-medium text-foreground mb-1">Nothing happening yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-3">Once your services go live, task updates, call logs, and new leads will land here in real time.</p>
                <Link href="/portal/services" className="text-sm text-brand-blue hover:underline">
                  View your services →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.recent_activity.map((item) => (
                  <li key={item.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${TASK_STATUS_STYLES[item.status] || "bg-muted text-muted-foreground"}`}
                      >
                        {statusLabel(TASK_STATUS_LABELS, item.status)}
                      </span>
                      <span className="text-sm text-foreground truncate">{item.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground/70 whitespace-nowrap ml-3">
                      {item.updated_at ? timeAgo(item.updated_at) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          </AdvancedOnly>
        </div>
      )}
    </PortalLayout>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  color,
  bgColor,
  href,
  help,
}: {
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  href?: string;
  help?: string;
}) {
  const card = (
    <Card className="relative h-full p-4 cursor-pointer">
      {/* Help cue — top-left of the component per DESIGN-SYSTEM hard rule */}
      {help && (
        <span className="absolute top-1 left-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="w-3 h-3 text-muted-foreground/70 cursor-default shrink-0" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px] text-xs">{help}</TooltipContent>
          </Tooltip>
        </span>
      )}
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground">{value}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground/70 -mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </Card>
  );
  if (href) return <Link href={href}>{card}</Link>;
  return card;
}

/* ─── Wave 36 — Tesla simplification migration banner ─────────────────── */

/* Wave 43 — banner key bumped to v2 so users who dismissed the v1 "we
 * simplified your dashboard" message get the new "we flipped the default
 * to Advanced" message once. */
const SIMPLIFIED_BANNER_KEY = "portal-simplified-dashboard-banner-v2";

function SimplifiedDashboardBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(SIMPLIFIED_BANNER_KEY) === "1";
    } catch {
      return true;
    }
  });
  if (dismissed) return null;
  return (
    <Card
      className="flex items-start justify-between gap-3 border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-200 p-3 text-xs"
      data-testid="simplified-dashboard-banner"
    >
      <div className="flex-1">
        <p className="font-medium">We've flipped the default to Advanced.</p>
        <p className="mt-0.5 text-blue-900/80 dark:text-blue-200/80">
          Every gauge, chart, and inbox is now visible by default. Toggle Simple Mode in{" "}
          <Link href="/portal/settings?tab=display" className="underline font-medium">
            Settings → Display
          </Link>{" "}
          if you want a stripped-down view.
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded p-1 text-blue-900/70 hover:bg-blue-100 hover:text-blue-900 dark:text-blue-200/70 dark:hover:bg-blue-900/40 dark:hover:text-blue-200"
        aria-label="Dismiss banner"
        onClick={() => {
          try {
            window.localStorage.setItem(SIMPLIFIED_BANNER_KEY, "1");
          } catch {
            /* localStorage unavailable — banner stays dismissed for this session */
          }
          setDismissed(true);
        }}
      >
        <span aria-hidden="true">×</span>
      </button>
    </Card>
  );
}
