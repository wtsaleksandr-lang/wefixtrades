/**
 * UpsellCard — Q16 spec: every dedicated service page shows an upsell CTA
 * for a complementary service the customer hasn't subscribed to yet.
 *
 * Renders nothing if the recommended service is no longer in the catalog
 * (i.e., the customer already has it). Links to /portal/catalog as the
 * canonical add-services entry-point so the customer gets the full card
 * with description + Read-more + checkout flow.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Sparkles } from "lucide-react";

interface CatalogService {
  id: string;
  name: string;
  tagline: string;
  priceLabel: string;
}

export default function UpsellCard({
  recommendPrefix,
  pitch,
}: {
  /** Prefix of the service ID to recommend (e.g. "rankflow", "socialsync"). The first matching catalog service wins. */
  recommendPrefix: string;
  /** One-line pitch explaining why this pair makes sense (e.g. "Pair MapGuard with local SEO for compound visibility gains."). */
  pitch: string;
}) {
  const { data } = useQuery<{ services: CatalogService[] }>({
    queryKey: ["/api/portal/catalog"],
    queryFn: async () => {
      const res = await fetch("/api/portal/catalog", { credentials: "include" });
      if (!res.ok) return { services: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const services = data?.services ?? [];
  const match = services.find((s) => s.id.startsWith(recommendPrefix));
  if (!match) return null;

  return (
    <Link
      href="/portal/catalog"
      className="flex items-start gap-3 bg-gradient-to-r from-[#EEF3FF] to-white border border-[#0d3cfc]/20 rounded-xl p-4 hover:shadow-sm transition-all group"
      data-testid={`upsell-${recommendPrefix}`}
    >
      <div className="w-9 h-9 rounded-lg bg-white border border-[#0d3cfc]/20 flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4 text-[#0d3cfc]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-900">Add {match.name}</h3>
          <span className="text-[10px] text-gray-500">{match.priceLabel}</span>
        </div>
        <p className="text-xs text-gray-600 mt-0.5">{pitch}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-[#0d3cfc] transition-colors shrink-0 mt-1" />
    </Link>
  );
}
