import { usePageTitle } from "@/hooks/usePageTitle";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowRight, Calculator, Eye, Users, ExternalLink, RefreshCw, Plus, MessageCircle, PackageOpen } from "lucide-react";
import { Link } from "wouter";
import PortalLayout from "@/components/portal/PortalLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { SERVICE_STATUS_LABELS, SERVICE_STATUS_STYLES, ONBOARDING_STATUS_LABELS, statusLabel } from "@/config/portalLabels";
import { FirstVisitTooltip } from "@/components/portal/FirstVisitTooltip";

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
  leads: "bg-brand-blue-50 text-brand-blue-700",
  visibility: "bg-sky-50 text-sky-700",
  reputation: "bg-orange-50 text-orange-700",
  website: "bg-teal-50 text-teal-700",
  automation: "bg-pink-50 text-pink-700",
};

export default function PortalServices() {
  usePageTitle("Services");
  const { data, isLoading, error, refetch } = useQuery<{ services: ServiceRow[] }>({
    queryKey: ["/api/portal/services"],
    queryFn: async () => {
      const res = await fetch("/api/portal/services", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load services");
      return res.json();
    },
  });

  const { data: qqData } = useQuery<{ calculator: {
    id: number;
    business_name: string;
    trade_type: string | null;
    slug: string;
    plan_tier: string;
    total_views: number;
    total_leads: number;
    status: string;
    calculator_url: string | null;
    edit_url: string | null;
    preview_url: string | null;
    edit_token_expired: boolean;
    created_at: string | null;
  } | null }>({
    queryKey: ["/api/portal/quotequick/summary"],
    queryFn: async () => {
      const res = await fetch("/api/portal/quotequick/summary", { credentials: "include" });
      if (!res.ok) return { calculator: null };
      return res.json();
    },
  });

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <FirstVisitTooltip
            storageKey="portal-services-header"
            title="Your active products"
            position="bottom"
            anchor={
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-foreground">Your Services</h1>
                <p className="text-sm text-muted-foreground mt-0.5">All active and past services for your account.</p>
              </div>
            }
          >
            Each card below is one of your active products. Click any card to manage settings, run setup, or see analytics.
          </FirstVisitTooltip>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Direct line to support — replaces the dead-end of staring
                at a read-only list with no obvious next step. */}
            <Link href="/portal/help">
              <button className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors min-h-[36px]">
                <MessageCircle className="w-3.5 h-3.5" />
                Contact your team
              </button>
            </Link>
            {/* Same-tab route to the in-portal catalog so customers stay
                authenticated and we keep the analytics funnel coherent. */}
            <Link href="/portal/catalog">
              <button className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary-foreground bg-primary rounded-lg hover:bg-brand-blue-600 transition-colors min-h-[36px]">
                <Plus className="w-3.5 h-3.5" />
                Add a service
              </button>
            </Link>
          </div>
        </div>

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2" data-testid="services-skeleton">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
                <Skeleton className="h-3 w-full mb-2" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 text-sm flex items-center justify-between">
            <span>We couldn't pull up your services. Try again — if it keeps failing, the Help tab is the fastest way to reach us.</span>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <RefreshCw className="w-3 h-3" /> Try again
            </button>
          </div>
        )}

        {data && data.services.length === 0 && !qqData?.calculator && (
          <div className="bg-card rounded-xl border border-border p-8 text-center">
            <PackageOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground mb-1">No services yet</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">Once you pick a service from our catalog, you'll see it here with its setup form, tasks, and live status.</p>
          </div>
        )}

        {/* QuoteQuick tool card */}
        {qqData?.calculator && (
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-blue-50 flex items-center justify-center">
                  <Calculator className="w-4 h-4 text-brand-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">QuoteQuick</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
                      qqData.calculator.status === "live" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {qqData.calculator.status === "live" ? "Live" : "Draft"}
                    </span>
                    {qqData.calculator.trade_type && (
                      <span className="text-[10px] text-muted-foreground capitalize">{qqData.calculator.trade_type}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground capitalize">{qqData.calculator.plan_tier}</span>
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize bg-brand-blue-50 text-brand-blue-700">leads</span>
            </div>
            <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {qqData.calculator.total_views.toLocaleString()} views</span>
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {qqData.calculator.total_leads.toLocaleString()} leads</span>
            </div>
            <div className="flex items-center gap-3">
              {qqData.calculator.calculator_url && (
                <a
                  href={qqData.calculator.calculator_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium hover:text-foreground transition-colors"
                >
                  View Live <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {qqData.calculator.edit_url && (
                <a
                  href={qqData.calculator.edit_url}
                  className="inline-flex items-center gap-1.5 text-xs text-brand-blue font-medium hover:underline"
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
          <div className="grid gap-4 sm:grid-cols-2 auto-rows-fr">
            {data.services.map((svc) => {
              const progress = svc.tasks_total > 0 ? Math.round((svc.tasks_delivered / svc.tasks_total) * 100) : 0;
              const showOnboarding = svc.onboarding_status && svc.onboarding_status !== "approved";

              return (
                <Link key={svc.id} href={`/portal/services/${svc.id}`}>
                  <div className="bg-card rounded-xl border border-border p-5 hover:shadow-sm hover:border-border active:scale-[0.99] transition-all cursor-pointer">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
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
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Progress</span>
                          <span>{svc.tasks_delivered}/{svc.tasks_total} steps</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-blue rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Footer — always visible on mobile */}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">
                        {svc.billing_period === "one-time" ? "One-time" : svc.billing_period === "monthly" ? "Monthly" : ""}
                      </span>
                      <span className="text-xs text-brand-blue font-medium flex items-center gap-1">
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
