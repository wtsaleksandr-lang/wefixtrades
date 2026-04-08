import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Loader2, ArrowLeft, Check, Clock, AlertCircle, Circle, RefreshCw, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, Globe } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import ModeToggle from "@/components/portal/ModeToggle";
import {
  SERVICE_STATUS_LABELS, SERVICE_STATUS_STYLES,
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES,
  ONBOARDING_STATUS_LABELS,
  statusLabel,
} from "@/config/portalLabels";

interface TaskRow {
  id: number;
  title: string;
  status: string;
  waiting_on: string | null;
  due_at: string | null;
  completed_at: string | null;
  sort_order: number;
}

interface PaymentRow {
  id: number;
  type: string;
  amount_cents: number;
  status: string;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
  due_at: string | null;
  paid_at: string | null;
  created_at: string | null;
}

interface ServiceDetail {
  service: {
    id: number;
    service_id: string;
    service_name: string | null;
    category: string | null;
    status: string;
    billing_period: string | null;
    price_cents: number | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string | null;
  };
  tasks: TaskRow[];
  onboarding: {
    id: number;
    status: string;
    submitted_at: string | null;
    approved_at: string | null;
  } | null;
  payments: PaymentRow[];
}

interface TradeLineCallRow {
  id: number;
  direction: string;
  caller_number: string | null;
  duration_seconds: number;
  outcome: string;
  summary: string | null;
  ended_at: string | null;
  created_at: string | null;
}

interface TradeLineData {
  config: {
    currentMode: string;
    variant: string;
    channels: { voice: boolean; websiteChat: boolean; websiteVoice: boolean; sms: boolean; hostedFallback: boolean };
    phoneRouting: { primaryBusinessNumber: string; forwardingMode: string; ringTimeoutSeconds: number };
    website: { embedMode: string; hostedUrl: string };
  } | null;
  usage: {
    voice_minutes_used: number;
    calls_count: number;
    sms_count: number;
    included_minutes: number;
    overage_minutes: number;
  } | null;
  recentCalls: TradeLineCallRow[];
}

function CallIcon({ outcome }: { outcome: string }) {
  switch (outcome) {
    case "answered":
      return <PhoneIncoming className="w-4 h-4 text-emerald-500" />;
    case "missed":
      return <PhoneMissed className="w-4 h-4 text-red-500" />;
    case "failed":
      return <PhoneOff className="w-4 h-4 text-gray-400" />;
    default:
      return <PhoneCall className="w-4 h-4 text-gray-400" />;
  }
}

function TaskIcon({ status }: { status: string }) {
  switch (status) {
    case "delivered":
      return <Check className="w-4 h-4 text-emerald-500" />;
    case "in_progress":
    case "submitted":
      return <Clock className="w-4 h-4 text-indigo-500" />;
    case "waiting":
    case "blocked":
      return <AlertCircle className="w-4 h-4 text-amber-500" />;
    case "cancelled":
      return <Circle className="w-4 h-4 text-gray-300" />;
    default:
      return <Circle className="w-4 h-4 text-gray-300" />;
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PortalServiceDetail() {
  const [, params] = useRoute("/portal/services/:id");
  const serviceId = params?.id;

  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<ServiceDetail>({
    queryKey: ["/api/portal/services", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/services/${serviceId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load service");
      return res.json();
    },
    enabled: !!serviceId,
  });

  const isTradeLine = data?.service.service_id?.startsWith("tradeline");

  const { data: tlData } = useQuery<TradeLineData>({
    queryKey: ["/api/portal/tradeline", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/tradeline/${serviceId}`, { credentials: "include" });
      if (!res.ok) return { config: null, usage: null, recentCalls: [] };
      return res.json();
    },
    enabled: !!serviceId && !!isTradeLine,
  });

  return (
    <PortalLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back link */}
        <Link href="/portal/services" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Services
        </Link>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm flex items-center justify-between">
            <span>Failed to load service.</span>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Service header */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">
                    {data.service.service_name || data.service.service_id}
                  </h1>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                    {data.service.category && (
                      <span className="capitalize">{data.service.category}</span>
                    )}
                    {data.service.billing_period && (
                      <span>{data.service.billing_period === "one-time" ? "One-time" : "Monthly"}</span>
                    )}
                    {data.service.started_at && (
                      <span>Started {formatDate(data.service.started_at)}</span>
                    )}
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${SERVICE_STATUS_STYLES[data.service.status] || "bg-gray-100 text-gray-600"}`}>
                  {statusLabel(SERVICE_STATUS_LABELS, data.service.status)}
                </span>
              </div>
            </div>

            {/* TradeLine section */}
            {isTradeLine && tlData?.config && (
              <>
                {/* Mode control */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-3">Current Mode</h2>
                  <ModeToggle
                    currentMode={tlData.config.currentMode as any}
                    clientServiceId={parseInt(serviceId!)}
                    apiBase="/api/portal/tradeline"
                    onModeChanged={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/portal/tradeline", serviceId] });
                    }}
                  />
                  {tlData.config.channels.voice && (
                    <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
                      <PhoneCall className="w-3 h-3" />
                      Your phone rings first. If you miss it, TradeLine steps in.
                    </p>
                  )}
                </div>

                {/* Usage summary */}
                {tlData.usage && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">This Month</h2>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-gray-500">Calls</p>
                        <p className="text-lg font-semibold text-gray-900">{tlData.usage.calls_count}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Voice Minutes</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {tlData.usage.voice_minutes_used}
                          <span className="text-sm font-normal text-gray-400">/{tlData.usage.included_minutes}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">SMS</p>
                        <p className="text-lg font-semibold text-gray-900">{tlData.usage.sms_count}</p>
                      </div>
                    </div>
                    {tlData.usage.overage_minutes > 0 && (
                      <p className="text-xs text-amber-600 mt-2">
                        {tlData.usage.overage_minutes} overage minutes this period
                      </p>
                    )}
                  </div>
                )}

                {/* Recent calls */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900">Recent Calls</h2>
                  </div>
                  {tlData.recentCalls.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-gray-400">
                      No calls yet. Activity will appear here once your system is live.
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-50">
                      {tlData.recentCalls.map((call) => (
                        <li key={call.id} className="px-5 py-3 flex items-start gap-3">
                          <div className="mt-0.5 shrink-0">
                            <CallIcon outcome={call.outcome} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-700">
                                {call.caller_number || "Unknown caller"}
                              </span>
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${
                                call.outcome === "answered" ? "bg-emerald-50 text-emerald-700"
                                : call.outcome === "missed" ? "bg-red-50 text-red-700"
                                : "bg-gray-100 text-gray-600"
                              }`}>
                                {call.outcome}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-400">
                              {call.duration_seconds > 0 && (
                                <span>{Math.floor(call.duration_seconds / 60)}:{String(call.duration_seconds % 60).padStart(2, "0")}</span>
                              )}
                              {call.ended_at && (
                                <span>{formatDate(call.ended_at)}</span>
                              )}
                            </div>
                            {call.summary && (
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{call.summary}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Widget / hosted info */}
                {(tlData.config.website.embedMode !== "none" || tlData.config.website.hostedUrl) && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-2">Website Setup</h2>
                    <div className="space-y-2 text-sm text-gray-600">
                      {tlData.config.website.embedMode !== "none" && (
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-gray-400" />
                          <span>Install type: <span className="font-medium">{
                            tlData.config.website.embedMode === "direct_embed" ? "Installed on your website"
                            : tlData.config.website.embedMode === "hosted_fallback" ? "Hosted version"
                            : tlData.config.website.embedMode.replace(/_/g, " ")
                          }</span></span>
                        </div>
                      )}
                      {tlData.config.website.hostedUrl && (
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-gray-400" />
                          <a href={tlData.config.website.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-[#2D6A4F] hover:underline text-xs truncate">
                            {tlData.config.website.hostedUrl}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Onboarding status */}
            {data.onboarding && data.onboarding.status !== "approved" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    {data.onboarding.status === "submitted" ? "Setup form submitted" : "Setup form required"}
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {statusLabel(ONBOARDING_STATUS_LABELS, data.onboarding.status)}
                    {data.onboarding.submitted_at && (
                      <> &middot; Submitted {formatDate(data.onboarding.submitted_at)}</>
                    )}
                  </p>
                </div>
                {data.onboarding.status !== "submitted" && (
                  <Link href={`/portal/onboarding/${data.onboarding.id}`}>
                    <button className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap">
                      Complete setup
                    </button>
                  </Link>
                )}
              </div>
            )}

            {/* Task timeline */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Progress</h2>
                {data.tasks.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {data.tasks.filter((t) => t.status === "delivered").length} of {data.tasks.length} steps complete
                  </p>
                )}
              </div>
              {data.tasks.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-400">
                  We're setting things up. Your progress tracker will appear shortly.
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {data.tasks.map((task) => (
                    <li key={task.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        <TaskIcon status={task.status} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${task.status === "delivered" ? "text-gray-400 line-through" : "text-gray-700"}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {task.waiting_on === "client" && (
                            <span className="text-[10px] font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                              Waiting on you
                            </span>
                          )}
                          {task.completed_at && (
                            <span className="text-[10px] text-gray-400">
                              Completed {formatDate(task.completed_at)}
                            </span>
                          )}
                          {task.due_at && !task.completed_at && (
                            <span className="text-[10px] text-gray-400">
                              Due {formatDate(task.due_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Payments */}
            {data.payments.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">Payments</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="px-5 py-2 font-medium">Date</th>
                        <th className="px-5 py-2 font-medium">Description</th>
                        <th className="px-5 py-2 font-medium">Amount</th>
                        <th className="px-5 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{formatDate(p.created_at)}</td>
                          <td className="px-5 py-3 text-gray-700">{p.description || "Invoice"}</td>
                          <td className="px-5 py-3 text-gray-900 font-medium whitespace-nowrap">{formatCents(p.amount_cents)}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${PAYMENT_STATUS_STYLES[p.status] || "bg-gray-100 text-gray-600"}`}>
                              {statusLabel(PAYMENT_STATUS_LABELS, p.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
}
