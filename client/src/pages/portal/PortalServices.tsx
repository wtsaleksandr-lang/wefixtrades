import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowRight, Calculator, Eye, Users, ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { SERVICE_STATUS_LABELS, SERVICE_STATUS_STYLES, ONBOARDING_STATUS_LABELS, statusLabel } from "@/config/portalLabels";

interface ServiceRow {
  id: number;
  service_id: string;
  service_name: string | null;
  category: string | null;
  status: string;
  billing_period: string | null;
  started_at: string | null;
  created_at: string | null;
  tasks_total: number;
  tasks_delivered: number;
  onboarding_id: number | null;
  onboarding_status: string | null;
  onboarding_has_responses: boolean;
}

const CATEGORY_STYLES: Record<string, string> = {
  leads: "bg-purple-50 text-purple-700",
  visibility: "bg-sky-50 text-sky-700",
  reputation: "bg-orange-50 text-orange-700",
  website: "bg-teal-50 text-teal-700",
  automation: "bg-pink-50 text-pink-700",
};

export default function PortalServices() {
  const { data, isLoading, error, refetch } = useQuery<{ services: ServiceRow[] }>({
    queryKey: ["/api/portal/services"],
    queryFn: async () => {
      const res = await fetch("/api/portal/services", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load services");
      return res.json();
    },
  });

  const { data: qqData } = useQuery<{ calculator: { id: number; business_name: string; slug: string; edit_token: string; plan_tier: string; total_views: number; total_leads: number; status: string } | null }>({
    queryKey: ["/api/portal/quotequick/summary"],
    queryFn: async () => {
      const res = await fetch("/api/portal/quotequick/summary", { credentials: "include" });
      if (!res.ok) return { calculator: null };
      return res.json();
    },
  });

  return (
    <PortalLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Your Services</h1>
          <p className="text-sm text-gray-500 mt-0.5">All active and past services for your account.</p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm flex items-center justify-between">
            <span>Failed to load services.</span>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}

        {data && data.services.length === 0 && !qqData?.calculator && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">No services yet. Once you purchase a service, it will appear here.</p>
          </div>
        )}

        {/* QuoteQuick tool card */}
        {qqData?.calculator && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Calculator className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">QuoteQuick Pro</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
                      qqData.calculator.status === "live" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {qqData.calculator.status === "live" ? "Live" : "Draft"}
                    </span>
                    {qqData.calculator.trade_type && (
                      <span className="text-[10px] text-gray-400 capitalize">{qqData.calculator.trade_type}</span>
                    )}
                    <span className="text-[10px] text-gray-400 capitalize">{qqData.calculator.plan_tier}</span>
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize bg-purple-50 text-purple-700">leads</span>
            </div>
            <div className="flex items-center gap-4 mb-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {qqData.calculator.total_views.toLocaleString()} views</span>
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {qqData.calculator.total_leads.toLocaleString()} leads</span>
            </div>
            <div className="flex items-center gap-3">
              {qqData.calculator.calculator_url && (
                <a
                  href={qqData.calculator.calculator_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-gray-600 font-medium hover:text-gray-900 transition-colors"
                >
                  View Live <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {qqData.calculator.edit_url && (
                <a
                  href={qqData.calculator.edit_url}
                  className="inline-flex items-center gap-1.5 text-xs text-[#2D6A4F] font-medium hover:underline"
                >
                  Edit Calculator <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {qqData.calculator.edit_token_expired && (
                <span className="text-[10px] text-amber-600 font-medium">Edit access expired</span>
              )}
            </div>
          </div>
        )}

        {data && data.services.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.services.map((svc) => {
              const progress = svc.tasks_total > 0 ? Math.round((svc.tasks_delivered / svc.tasks_total) * 100) : 0;
              const showOnboarding = svc.onboarding_status && svc.onboarding_status !== "approved";

              return (
                <Link key={svc.id} href={`/portal/services/${svc.id}`}>
                  <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">
                          {svc.service_name || svc.service_id}
                        </h3>
                        {svc.category && (
                          <span className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${CATEGORY_STYLES[svc.category] || "bg-gray-50 text-gray-600"}`}>
                            {svc.category}
                          </span>
                        )}
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${SERVICE_STATUS_STYLES[svc.status] || "bg-gray-100 text-gray-600"}`}>
                        {statusLabel(SERVICE_STATUS_LABELS, svc.status)}
                      </span>
                    </div>

                    {/* Onboarding banner */}
                    {showOnboarding && (
                      <div className="mb-3">
                        {svc.onboarding_id && svc.onboarding_status !== "submitted" ? (
                          <Link
                            href={`/portal/onboarding/${svc.onboarding_id}`}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 font-medium hover:bg-amber-100 transition-colors flex items-center justify-between">
                              <span>{svc.onboarding_has_responses ? "Continue setup form" : "Complete setup form"}</span>
                              <ArrowRight className="w-3 h-3" />
                            </div>
                          </Link>
                        ) : (
                          <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
                            {statusLabel(ONBOARDING_STATUS_LABELS, svc.onboarding_status!)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Progress bar */}
                    {svc.tasks_total > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Progress</span>
                          <span>{svc.tasks_delivered}/{svc.tasks_total} steps</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#2D6A4F] rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Footer — always visible on mobile */}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-400">
                        {svc.billing_period === "one-time" ? "One-time" : svc.billing_period === "monthly" ? "Monthly" : ""}
                      </span>
                      <span className="text-xs text-[#2D6A4F] font-medium flex items-center gap-1">
                        View Details <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
