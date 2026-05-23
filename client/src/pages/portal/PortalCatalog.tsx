/**
 * Portal service catalog — /portal/catalog
 *
 * Q16: shows services the customer is NOT yet subscribed to, with two CTAs
 * per card serving two intents:
 *   - "Continue to checkout" (primary) — ready-to-buy path → Stripe Checkout
 *   - "Learn more" (secondary) — needs-to-be-sold path → public product page
 *     (full marketing funnel: features, demos, comparisons, testimonials).
 *
 * Q28g2 (cycle 19): when serviceCatalog.tiers is populated, the card
 * renders a radio-list tier picker; the chosen tier_id is passed to the
 * subscribe endpoint so checkout uses the matching Stripe price.
 *
 * Q28g (cycle 18): server merges admin-edited name/tagline/description/
 * features overrides into the hardcoded SERVICES list.
 *
 * Q5e (cycle 25): bundles section above individual services. Each bundle
 * card maps to a single Stripe Checkout Session with one line_item per
 * included tier — same shape the marketing site has supported since launch,
 * now available to authenticated customers too.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, ArrowRight, ExternalLink, Star } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useCopilotForm } from "@/context/CopilotFormContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import type { Tier } from "@shared/tiers";

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
  /* Q28g2: admin-edited tiers from serviceCatalog.tiers. When non-null, the
     portal renders a tier picker; the chosen tier_id is passed to subscribe. */
  tiers: Tier[] | null;
}

interface CatalogBundle {
  id: string;
  name: string;
  tagline: string;
  price: number;             // dollars (whole units), monthly when billingPeriod=monthly
  billingPeriod: "monthly" | "one-time";
  badge: string | null;
  highlighted: boolean;
  savings: number;           // dollars saved per period vs sum of included items
  includes: Array<{ tier_id: string; label: string; value: number }>;
}

function formatCents(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function defaultTierId(tiers: Tier[] | null): string | undefined {
  if (!tiers || tiers.length === 0) return undefined;
  return (tiers.find((t) => t.highlighted) ?? tiers[0]).id;
}

function tierPriceLabel(t: Tier): string {
  const dollars = formatCents(t.price_cents);
  return t.billing_period === "monthly" ? `${dollars}/mo` : `${dollars} one-time`;
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
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Show banner on return from Stripe (success or cancelled)
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const checkoutResult = params?.get("checkout");

  const { data, isLoading, error } = useQuery<{ services: CatalogService[]; bundles: CatalogBundle[] }>({
    queryKey: ["/api/portal/catalog"],
    queryFn: async () => {
      const res = await fetch("/api/portal/catalog", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load catalog");
      return res.json();
    },
  });

  // Q28g2: per-service tier selection. Defaults to the highlighted tier (or first) when tiers exist.
  const [selectedTier, setSelectedTier] = useState<Record<string, string>>({});

  const subscribe = useMutation({
    mutationFn: async (req: { serviceId: string; tierId?: string } | { bundleId: string }) => {
      const body = "bundleId" in req
        ? { bundle_id: req.bundleId }
        : { service_id: req.serviceId, ...(req.tierId ? { tier_id: req.tierId } : {}) };
      const res = await fetch("/api/portal/catalog/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start checkout");
      return data as { checkout_url: string; session_id: string };
    },
    onSuccess: ({ checkout_url }) => {
      if (checkout_url) window.location.href = checkout_url;
    },
    onError: (err: Error) => {
      setPendingId(null);
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    },
  });

  const handleAdd = (svc: CatalogService) => {
    setPendingId(svc.id);
    const tierId = selectedTier[svc.id] ?? defaultTierId(svc.tiers);
    subscribe.mutate({ serviceId: svc.id, tierId });
  };
  const handleAddBundle = (bundle: CatalogBundle) => {
    setPendingId(`bundle:${bundle.id}`);
    subscribe.mutate({ bundleId: bundle.id });
  };

  const services = data?.services ?? [];
  const bundles = data?.bundles ?? [];

  /* Q30c: opt the catalog into AI form-fill for tier selection. For each
   * service with tiers we expose a synthetic field `tier:<service_id>`.
   * The AI can propose "set tier:tradeline to growth" — Apply writes
   * selectedTier state, the user reviews + clicks Continue to checkout. */
  const tierServices = services.filter((s) => s.tiers && s.tiers.length > 0);
  const chatFields = tierServices.length > 0
    ? tierServices.map((s) => {
        const tierIds = (s.tiers ?? []).map((t) => t.id).join(" | ");
        const current = selectedTier[s.id] ?? defaultTierId(s.tiers);
        return {
          key: `tier:${s.id}`,
          label: `${s.name} tier (one of: ${tierIds})`,
          required: false,
          // PortalChatContext.current_responses takes the values map; we'll
          // synthesize it below alongside fields.
          _current: current ?? "(default)",
        };
      })
    : [];

  // Phase 1b: register the tier-selection synthetic form with the copilot
  // form registry.
  useCopilotForm({
    formLabel: "Service tiers",
    fields: chatFields.map(({ key, label, required }) => ({ key, label, required })),
    values: Object.fromEntries(chatFields.map((f) => [f.key, f._current])),
    onApply: (fills: { field_key: string; value: string }[]) => {
      const updates: Record<string, string> = {};
      for (const fill of fills) {
        if (!fill.field_key.startsWith("tier:")) continue;
        const serviceId = fill.field_key.slice("tier:".length);
        const svc = tierServices.find((s) => s.id === serviceId);
        if (!svc) continue;
        const validTier = (svc.tiers ?? []).find((t) => t.id === fill.value);
        if (!validTier) continue;
        updates[serviceId] = validTier.id;
      }
      if (Object.keys(updates).length > 0) {
        setSelectedTier((prev) => ({ ...prev, ...updates }));
      }
    },
    enabled: chatFields.length > 0,
  });

  return (
    <PortalLayout>
      <div data-theme="light" className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Add Services</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Expand your subscription. Click any service to add it to your account or learn more.
          </p>
        </div>

        {checkoutResult === "cancelled" && (
          <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-xl p-4 text-sm" data-testid="banner-checkout-cancelled">
            Checkout was cancelled. Pick a service below to try again.
          </div>
        )}

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

        {!isLoading && !error && services.length === 0 && bundles.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-600">
              You're subscribed to every available service. Nothing to add right now.
            </p>
          </div>
        )}

        {/* Q5e: bundles section — surfaces above individual services when available.
            Each bundle creates one Stripe Checkout Session covering all its included
            tiers in a single transaction. */}
        {bundles.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Bundles</h2>
                <p className="text-xs text-gray-500">Save by combining services into one subscription.</p>
              </div>
            </div>
            <div className="grid auto-rows-fr grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="bundles-grid">
              {bundles.map((b) => (
                <div
                  key={b.id}
                  className={`h-full bg-white rounded-xl border p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow ${
                    b.highlighted
                      ? "border-[#0d3cfc]/40 ring-1 ring-[#0d3cfc]/20"
                      : "border-gray-200"
                  }`}
                  data-testid={`bundle-card-${b.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{b.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{b.tagline}</p>
                    </div>
                    {b.badge && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#EEF3FF] text-[#0d3cfc]">
                        {b.badge}
                      </span>
                    )}
                  </div>

                  <ul className="space-y-1.5 flex-1">
                    {b.includes.map((inc) => (
                      <li key={inc.tier_id} className="text-xs text-gray-600 flex items-start gap-1.5">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0 mt-0.5" />
                        <span>{inc.label}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="text-sm font-semibold text-[#0d3cfc]">
                    ${b.price}{b.billingPeriod === "monthly" ? "/mo" : " one-time"}
                    {b.savings > 0 && (
                      <span className="ml-2 text-[11px] font-normal text-emerald-600">
                        Save ${b.savings}{b.billingPeriod === "monthly" ? "/mo" : ""}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddBundle(b)}
                    disabled={pendingId !== null}
                    className="btn-primary-premium w-full px-3 py-2 text-xs font-medium rounded-lg disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
                    data-testid={`bundle-add-${b.id}`}
                  >
                    {pendingId === `bundle:${b.id}` ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Opening checkout…</>
                    ) : (
                      <>Continue to checkout <ArrowRight className="w-3 h-3" /></>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {services.length > 0 && bundles.length > 0 && (
          <div className="pt-2">
            <h2 className="text-sm font-semibold text-gray-900">Individual services</h2>
            <p className="text-xs text-gray-500">Or pick one at a time.</p>
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

                {/* Q28g2: tier picker when admin has configured tiers; otherwise flat price */}
                {svc.tiers && svc.tiers.length > 0 ? (
                  <div className="space-y-1.5" data-testid={`catalog-tiers-${svc.id}`}>
                    {svc.tiers.map((t) => {
                      const checked = (selectedTier[svc.id] ?? defaultTierId(svc.tiers)) === t.id;
                      return (
                        <label
                          key={t.id}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-colors ${
                            checked
                              ? "border-[#0d3cfc] bg-[#EEF3FF]"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                          data-testid={`catalog-tier-${svc.id}-${t.id}`}
                        >
                          <input
                            type="radio"
                            name={`tier-${svc.id}`}
                            value={t.id}
                            checked={checked}
                            onChange={() => setSelectedTier((s) => ({ ...s, [svc.id]: t.id }))}
                            className="h-3.5 w-3.5 accent-[#0d3cfc]"
                          />
                          <span className="font-medium text-gray-800 flex-1">{t.name}</span>
                          {t.highlighted && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                          <span className="font-semibold text-[#0d3cfc]">{tierPriceLabel(t)}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-[#0d3cfc]">{svc.priceLabel}</div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleAdd(svc)}
                    disabled={pendingId !== null}
                    className="btn-primary-premium flex-1 px-3 py-2 text-xs font-medium rounded-lg disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
                    data-testid={`catalog-add-${svc.id}`}
                  >
                    {pendingId === svc.id ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Opening checkout…</>
                    ) : (
                      <>Continue to checkout <ArrowRight className="w-3 h-3" /></>
                    )}
                  </button>
                  <a
                    href={productPageUrl(svc.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 text-xs font-medium text-[#0d3cfc] border border-[#0d3cfc]/30 rounded-lg hover:bg-[#EEF3FF] transition-colors inline-flex items-center justify-center gap-1"
                    data-testid={`catalog-readmore-${svc.id}`}
                  >
                    Learn more <ExternalLink className="w-3 h-3" />
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
