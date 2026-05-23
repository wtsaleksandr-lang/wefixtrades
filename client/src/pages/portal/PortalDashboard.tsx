import { Component, type ErrorInfo, type ReactNode } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useQuery } from "@tanstack/react-query";
import { Wrench, ClipboardList, AlertCircle, CreditCard, Loader2, Calculator, Eye, Users, ExternalLink, RefreshCw, PhoneCall, Clock, ChevronRight, Plus, UserPlus } from "lucide-react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { TASK_STATUS_STYLES, TASK_STATUS_LABELS, statusLabel } from "@/config/portalLabels";
import ModeToggle from "@/components/portal/ModeToggle";
import { useAuth } from "@/hooks/useAuth";
import { TradelineSetupBanner } from "./TradelineSetup/DashboardBanner";
// BG-3: canonical elevation primitive — uses --shadow-card token + bg-card/border-card-border
// so cards inherit the design-system soft-card shadow and respond to dark mode.
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
// Premium polish — smooth-count animation on KPI numbers (respects reduced motion).
import AnimatedNumber from "@/components/AnimatedNumber";
// IA-1 (2026-05-22) — wizard minimize-to-floating-badge.
import MinimizedWizardBadge from "@/components/wizard/MinimizedWizardBadge";

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
        <div data-theme="light" className="max-w-md mx-auto mt-12 bg-white border border-gray-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm font-semibold text-gray-900 mb-1">Something went wrong</p>
          <p className="text-xs text-gray-500 mb-4">Refresh the page — if it keeps happening, contact support and we'll look into it.</p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0d3cfc] rounded-lg hover:bg-[#0b34d6] transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
            <Link
              href="/portal/help"
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-[#0d3cfc] border border-[#0d3cfc]/40 rounded-lg hover:bg-[#EEF3FF] transition-colors"
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

  const { data: qqData } = useQuery<QuoteQuickData>({
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

  return (
    <PortalLayout>
      {isLoading && (
        <div className="max-w-5xl mx-auto space-y-6" data-testid="dashboard-skeleton">
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
        <div className="max-w-2xl mx-auto mt-8" data-testid="admin-no-client-empty">
          <Card className="border-amber-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                <UserPlus className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">No client account linked to your admin user</h2>
                <p className="text-sm text-gray-600 mt-1">
                  You're seeing the customer portal as <strong>{user?.email}</strong>, but there's no client record
                  linked to this admin user. The portal would normally show that client's dashboard, services,
                  payments, and onboarding tasks.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">What you can do</p>
              <div className="space-y-2">
                <Link
                  href="/admin/crm/clients"
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#0d3cfc]/40 hover:bg-[#EEF3FF]/50 transition-colors group"
                  data-testid="empty-state-clients-link"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Open the clients list</p>
                    <p className="text-xs text-gray-500">Pick a real client → their portal will populate with their data</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#0d3cfc] shrink-0" />
                </Link>
                <Link
                  href="/admin/crm"
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#0d3cfc]/40 hover:bg-[#EEF3FF]/50 transition-colors group"
                  data-testid="empty-state-admin-link"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Return to the admin dashboard</p>
                    <p className="text-xs text-gray-500">Exit preview mode and go back to /admin/crm</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#0d3cfc] shrink-0" />
                </Link>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-3">
              To preview a specific client's portal you'd need a client record whose <code className="px-1 py-0.5 rounded bg-gray-100 font-mono text-[10px]">user_id</code> column matches your admin user id.
            </p>
          </Card>
        </div>
      )}
      {error && !isAdminWithoutClient && (
        <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm flex items-center justify-between">
          <span>We hit a snag loading your dashboard. A refresh usually fixes it.</span>
          <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <RefreshCw className="w-3 h-3" /> Try again
          </button>
        </div>
      )}
      {data && (
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Welcome{data.contact_name ? `, ${data.contact_name}` : ""}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{data.business_name}</p>
          </div>

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
              color="text-[#0d3cfc]"
              bgColor="bg-[#EEF3FF]"
              href="/portal/services"
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
              color="text-amber-600"
              bgColor="bg-amber-50"
              href="/portal/services"
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
              color={data.action_needed > 0 ? "text-red-600" : "text-gray-400"}
              bgColor={data.action_needed > 0 ? "bg-red-50" : "bg-gray-50"}
              href="/portal/services"
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
              color="text-blue-600"
              bgColor="bg-blue-50"
              href="/portal/billing"
            />
          </div>

          {/* Q16: Add Services CTA — single entry-point to the in-portal service catalog */}
          <Link href="/portal/catalog" data-testid="link-add-services">
            <Card
              className="flex items-center justify-between hover:border-[#0d3cfc]/40 p-5 transition-all group cursor-pointer"
            >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#EEF3FF] flex items-center justify-center">
                <Plus className="w-5 h-5 text-[#0d3cfc]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Add Services</h3>
                <p className="text-xs text-gray-500 mt-0.5">Browse available services and add them to your subscription.</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#0d3cfc] transition-colors" />
            </Card>
          </Link>

          {/* Pending onboarding card — only shows if there are any forms to complete */}
          {pendingOnboarding?.submissions && pendingOnboarding.submissions.length > 0 && (
            <Card className="border-amber-200 p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Complete your setup</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      We need a few details before we can launch your service
                      {pendingOnboarding.submissions.length > 1 ? "s" : ""}.
                    </p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-100 border-t border-gray-100">
                {pendingOnboarding.submissions.map((sub) => (
                  <Link
                    key={sub.id}
                    href={`/portal/onboarding/${sub.id}`}
                    className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-5 px-5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{sub.service_name}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {sub.has_draft ? "Draft saved — continue" : "Not started"}
                          {sub.status === "viewed" && !sub.has_draft ? " · viewed" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        sub.has_draft
                          ? "bg-blue-50 text-blue-700"
                          : "bg-amber-50 text-amber-700"
                      }`}>
                        {sub.has_draft ? "In progress" : "Start"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* QuoteQuick card — IA-1 (2026-05-22):
             *
             * Primary CTA now opens the WIZARD EDITOR (not the standalone
             * /dashboard). Per the IA fix, the standalone QuoteQuick
             * dashboard is no longer a navigation target from /portal —
             * the editor is. The dashboard remains reachable via token
             * deep-links (e.g. lead-notification emails). */}
          {qqData?.calculator && (
            <Card className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">QuoteQuick Pro</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
                        qqData.calculator.status === "live" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {qqData.calculator.status === "live" ? "Live" : "Draft"}
                      </span>
                      <span className="text-[10px] text-gray-400 capitalize">{qqData.calculator.plan_tier} plan</span>
                    </div>
                  </div>
                </div>
                <Link
                  href={`/wizard?token=${qqData.calculator.edit_token}`}
                  data-testid="portal-qq-open-editor"
                  className="btn-primary-premium inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg"
                >
                  Open editor <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-600">{(qqData.calculator.total_views ?? 0).toLocaleString()} views</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-600">{(qqData.calculator.total_leads ?? 0).toLocaleString()} leads</span>
                </div>
              </div>
              {/* Wave W-BB-4 — link to per-calculator conversion analytics */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <Link
                  href={`/portal/calculators/${qqData.calculator.id}/analytics`}
                  className="text-xs font-medium text-[#0d3cfc] hover:underline"
                  data-testid="portal-calc-analytics-link"
                >
                  View analytics →
                </Link>
              </div>
            </Card>
          )}
          {qqData && !qqData.calculator && (
            <Card className="border-dashed p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-700">QuoteQuick Pro</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Instant quote calculator for your website</p>
                  </div>
                </div>
                {/* IA-1 — zero-calculator empty state. Lands in the wizard
                 *  with no template so they pick one. */}
                <Link
                  href="/wizard"
                  data-testid="portal-qq-create-first"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0d3cfc] border border-[#0d3cfc] rounded-lg hover:bg-[#EEF3FF] transition-colors"
                >
                  Create your first calculator
                </Link>
              </div>
            </Card>
          )}

          {/* TradeLine card */}
          {tradeLineService && tlData?.config && (() => {
            const stage = tlData.setupStage || tlData.config.setupStage || tradeLineService.status;
            const statusBadge = stage === "live"
              ? { label: "Live", cls: "bg-emerald-50 text-emerald-700" }
              : stage === "ready_for_testing"
              ? { label: "Ready for testing", cls: "bg-amber-50 text-amber-700" }
              : { label: "Setting up", cls: "bg-gray-100 text-gray-600" };

            return (
              <Card className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                      <PhoneCall className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">TradeLine</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize bg-blue-50 text-teal-700">
                          {(tlData.config.variant ?? "").replace(/_/g, " ")}
                        </span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge.cls}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Link href={`/portal/services/${tradeLineService.id}`}>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0d3cfc] rounded-lg hover:bg-[#0b34d6] transition-colors">
                      Details <ExternalLink className="w-3 h-3" />
                    </span>
                  </Link>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 space-y-3">
                  <ModeToggle
                    currentMode={tlData.config.currentMode as any}
                    clientServiceId={tradeLineService.id}
                    apiBase="/api/portal/tradeline"
                    onModeChanged={() => {}}
                  />
                  {tlData.usage ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">Monthly usage</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                          <PhoneCall className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm text-gray-600">{tlData.usage.calls_count} calls</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            {tlData.usage.voice_minutes_used} / {tlData.usage.included_minutes} minutes used
                          </span>
                        </div>
                      </div>
                      {(tlData.usage.overage_minutes ?? 0) > 0 && (
                        <p className="text-xs text-amber-600 mt-1.5">
                          {tlData.usage.overage_minutes} overage minutes
                        </p>
                      )}
                      <p className="text-[10px] text-gray-300 mt-2">Minutes = total time your AI spends on calls this month.</p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No activity yet this month.</p>
                  )}
                </div>
              </Card>
            );
          })()}
          {/* SocialSync CTA */}
          {ssProfile && (ssProfile.exists === false || !ssProfile.niche) && (
            <Card className="p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">Set up SocialSync</p>
                <p className="text-xs text-gray-500 mt-0.5">We'll post content for your business automatically. Takes about 5 minutes.</p>
              </div>
              <Link href="/portal/socialsync-setup" className="shrink-0 px-4 py-2 rounded-lg text-xs font-medium text-white bg-[#0d3cfc] hover:bg-[#0b34d6]">
                Get Started
              </Link>
            </Card>
          )}

          {/* Recent activity */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
            </div>
            {!data.recent_activity || data.recent_activity.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm font-medium text-gray-700 mb-1">Nothing happening yet</p>
                <p className="text-xs text-gray-500 max-w-sm mx-auto mb-3">Once your services go live, task updates, call logs, and new leads will land here in real time.</p>
                <Link href="/portal/services" className="text-sm text-[#0d3cfc] hover:underline">
                  View your services →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {data.recent_activity.map((item) => (
                  <li key={item.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${TASK_STATUS_STYLES[item.status] || "bg-gray-100 text-gray-600"}`}
                      >
                        {statusLabel(TASK_STATUS_LABELS, item.status)}
                      </span>
                      <span className="text-sm text-gray-700 truncate">{item.title}</span>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap ml-3">
                      {item.updated_at ? timeAgo(item.updated_at) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      {/* IA-1 — floating "resume editing" badge. Renders only when a
         minimized-wizard session exists in sessionStorage. */}
      <MinimizedWizardBadge />
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
}: {
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  href?: string;
}) {
  const card = (
    <Card className="h-full p-4 cursor-pointer">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-semibold text-gray-900">{value}</p>
          {subtitle && <p className="text-[10px] text-gray-400 -mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </Card>
  );
  if (href) return <Link href={href}>{card}</Link>;
  return card;
}
