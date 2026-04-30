import { useQuery } from "@tanstack/react-query";
import { Wrench, ClipboardList, AlertCircle, CreditCard, Loader2, Calculator, Eye, Users, ExternalLink, RefreshCw, PhoneCall, Clock } from "lucide-react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { TASK_STATUS_STYLES, TASK_STATUS_LABELS, statusLabel } from "@/config/portalLabels";
import ModeToggle from "@/components/portal/ModeToggle";

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
  const { data, isLoading, error, refetch } = useQuery<OverviewData>({
    queryKey: ["/api/portal/overview"],
    queryFn: async () => {
      const res = await fetch("/api/portal/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load overview");
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
      return res.json();
    },
  });

  const tradeLineService = (portalServices ?? []).find(
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
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}
      {error && (
        <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm flex items-center justify-between">
          <span>Failed to load dashboard.</span>
          <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <RefreshCw className="w-3 h-3" /> Retry
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

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Active Services"
              value={data.active_services}
              icon={Wrench}
              color="text-[#2D6A4F]"
              bgColor="bg-[#F0F7F4]"
              href="/portal/services"
            />
            <StatCard
              label="Setup Required"
              value={data.pending_onboarding}
              subtitle="Forms to complete"
              icon={ClipboardList}
              color="text-amber-600"
              bgColor="bg-amber-50"
              href="/portal/services"
            />
            <StatCard
              label="Action Needed"
              value={data.action_needed}
              subtitle="Waiting on you"
              icon={AlertCircle}
              color={data.action_needed > 0 ? "text-red-600" : "text-gray-400"}
              bgColor={data.action_needed > 0 ? "bg-red-50" : "bg-gray-50"}
              href="/portal/services"
            />
            <StatCard
              label="Amount Due"
              value={formatCents(data.outstanding_balance_cents)}
              icon={CreditCard}
              color="text-blue-600"
              bgColor="bg-blue-50"
              href="/portal/billing"
            />
          </div>

          {/* QuoteQuick card */}
          {qqData?.calculator && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
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
                <a
                  href={`/dashboard?token=${qqData.calculator.edit_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] transition-colors"
                >
                  Open Dashboard <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-600">{qqData.calculator.total_views.toLocaleString()} views</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-sm text-gray-600">{qqData.calculator.total_leads.toLocaleString()} leads</span>
                </div>
              </div>
            </div>
          )}
          {qqData && !qqData.calculator && (
            <div className="bg-white rounded-xl border border-gray-200 border-dashed p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-700">QuoteQuick Pro</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Instant quote calculator for your website</p>
                  </div>
                </div>
                <a
                  href="/wizard"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2D6A4F] border border-[#2D6A4F] rounded-lg hover:bg-[#F0F7F4] transition-colors"
                >
                  Set up QuoteQuick
                </a>
              </div>
            </div>
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
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                      <PhoneCall className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">TradeLine</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize bg-teal-50 text-teal-700">
                          {tlData.config.variant.replace(/_/g, " ")}
                        </span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge.cls}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Link href={`/portal/services/${tradeLineService.id}`}>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] transition-colors">
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
              </div>
            );
          })()}

          {/* Recent activity */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
            </div>
            {data.recent_activity.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                No activity yet. Your service updates will appear here.
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
          </div>
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
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  href?: string;
}) {
  const card = (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow cursor-pointer">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-semibold text-gray-900">{value}</p>
          {subtitle && <p className="text-[10px] text-gray-400 -mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
  if (href) return <Link href={href}>{card}</Link>;
  return card;
}
