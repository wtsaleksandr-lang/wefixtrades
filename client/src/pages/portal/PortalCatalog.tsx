/**
 * Portal service catalog — /portal/catalog
 *
 * Q16: shows services the customer is NOT yet subscribed to, with two CTAs
 * per card: "Add to subscription" (triggers checkout — TBD cycle) and
 * "Read more" (links to public product page on marketing site).
 *
 * Cycle 8 status: backend wired, UI skeleton renders cards, "Add" CTA
 * is a no-op placeholder until the Stripe-checkout integration lands.
 */

import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowRight, ExternalLink } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePageTitle } from "@/hooks/usePageTitle";

interface CatalogService {
  id: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  priceLabel: string;
  billingPeriod: "monthly" | "one-time";
  category: "visibility" | "leads" | "reputation" | "automation" | "website";
  fixesIssues: string[];
  features: string[];
  isPopular?: boolean;
}

const CATEGORY_STYLES: Record<CatalogService["category"], string> = {
  leads: "bg-purple-50 text-purple-700",
  visibility: "bg-sky-50 text-sky-700",
  reputation: "bg-orange-50 text-orange-700",
  website: "bg-teal-50 text-teal-700",
  automation: "bg-pink-50 text-pink-700",
};

function productPageUrl(serviceId: string): string {
  const slug = serviceId.replace(/-setup$|-ongoing$/, "").replace(/^reputationshield$/, "reputation-shield");
  return `/${slug}`;
}

export default function PortalCatalog() {
  usePageTitle("Add Services");

  const { data, isLoading, error } = useQuery<{ services: CatalogService[] }>({
    queryKey: ["/api/portal/catalog"],
    queryFn: async () => {
      const res = await fetch("/api/portal/catalog", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load catalog");
      return res.json();
    },
  });

  const services = data?.services ?? [];

  return (
    <PortalLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Add Services</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Expand your subscription. Click any service to add it to your account or learn more.
          </p>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="bg-white rounded-xl border border-red-200 p-4 text-sm text-red-600">
            Couldn't load the catalog. Please try again in a moment.
          </div>
        )}

        {!isLoading && !error && services.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-600">
              You're subscribed to every available service. Nothing to add right now.
            </p>
          </div>
        )}

        {services.length > 0 && (
          <div className="grid auto-rows-fr grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="catalog-grid">
            {services.map((svc) => (
              <div
                key={svc.id}
                className="h-full bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow"
                data-testid={`catalog-card-${svc.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{svc.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{svc.tagline}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${CATEGORY_STYLES[svc.category] ?? "bg-gray-50 text-gray-600"}`}>
                    {svc.category}
                  </span>
                </div>

                <p className="text-xs text-gray-600 leading-relaxed flex-1">{svc.description}</p>

                <div className="text-sm font-semibold text-[#2D6A4F]">{svc.priceLabel}</div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled
                    title="Checkout integration coming next cycle"
                    className="flex-1 px-3 py-2 text-xs font-medium text-white bg-[#2D6A4F] rounded-lg hover:bg-[#1B4332] transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
                    data-testid={`catalog-add-${svc.id}`}
                  >
                    Add to subscription <ArrowRight className="w-3 h-3" />
                  </button>
                  <a
                    href={productPageUrl(svc.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 text-xs font-medium text-[#2D6A4F] border border-[#2D6A4F]/30 rounded-lg hover:bg-[#F0F7F4] transition-colors inline-flex items-center justify-center gap-1"
                    data-testid={`catalog-readmore-${svc.id}`}
                  >
                    Read more <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
