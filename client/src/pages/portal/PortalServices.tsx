import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";

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
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  onboarding: "bg-amber-50 text-amber-700",
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-blue-50 text-blue-700",
  cancelled: "bg-gray-100 text-gray-500",
  completed: "bg-indigo-50 text-indigo-700",
};

const CATEGORY_STYLES: Record<string, string> = {
  leads: "bg-purple-50 text-purple-700",
  visibility: "bg-sky-50 text-sky-700",
  reputation: "bg-orange-50 text-orange-700",
  website: "bg-teal-50 text-teal-700",
  automation: "bg-pink-50 text-pink-700",
};

const ONBOARDING_LABELS: Record<string, string> = {
  not_sent: "Onboarding not started",
  sent: "Onboarding sent",
  viewed: "Onboarding viewed",
  submitted: "Onboarding submitted",
  approved: "Onboarding approved",
  needs_followup: "Onboarding needs attention",
};

export default function PortalServices() {
  const { data, isLoading, error } = useQuery<{ services: ServiceRow[] }>({
    queryKey: ["/api/portal/services"],
    queryFn: async () => {
      const res = await fetch("/api/portal/services", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load services");
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
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm">
            Failed to load services. Please try again.
          </div>
        )}

        {data && data.services.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">No services yet. Once you purchase a service, it will appear here.</p>
          </div>
        )}

        {data && data.services.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.services.map((svc) => {
              const progress = svc.tasks_total > 0 ? Math.round((svc.tasks_delivered / svc.tasks_total) * 100) : 0;
              const showOnboarding = svc.onboarding_status && svc.onboarding_status !== "approved";

              return (
                <Link key={svc.id} href={`/portal/services/${svc.id}`}>
                  <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer group">
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_STYLES[svc.status] || "bg-gray-100 text-gray-600"}`}>
                        {svc.status}
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
                              <span>Complete Onboarding</span>
                              <ArrowRight className="w-3 h-3" />
                            </div>
                          </Link>
                        ) : (
                          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-700">
                            {ONBOARDING_LABELS[svc.onboarding_status!] || svc.onboarding_status}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Progress bar */}
                    {svc.tasks_total > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Progress</span>
                          <span>{svc.tasks_delivered}/{svc.tasks_total} tasks</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#2D6A4F] rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-400">
                        {svc.billing_period === "one-time" ? "One-time" : "Monthly"}
                      </span>
                      <span className="text-xs text-[#2D6A4F] font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
