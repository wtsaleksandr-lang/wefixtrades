import { usePageTitle } from "@/hooks/usePageTitle";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SERVICE_STATUS } from "@/config/adminLabels";

interface ServiceCatalogItem {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  default_price: number | null;
  billing_period: string;
  is_active: boolean;
}

interface ServiceStat {
  service_id: string;
  count: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  visibility: "bg-blue-50 text-blue-700",
  leads: "bg-emerald-50 text-emerald-700",
  reputation: "bg-purple-50 text-purple-700",
  automation: "bg-cyan-50 text-cyan-700",
  website: "bg-amber-50 text-amber-700",
};

/* Services defined in the business but not yet in the DB catalog */
const CORE_SERVICES = [
  { id: "tradeline", name: "24/7 TradeLine™", category: "leads", description: "Chat + Voice + DMs — the full lead engine. Every inbound channel covered." },
  { id: "quotequick", name: "QuoteQuick™", category: "leads", description: "Instant quote calculator for trades websites. Captures leads with real pricing." },
  { id: "mapguard-setup", name: "MapSetup™", category: "visibility", description: "One-time Google Business Profile optimization sprint." },
  { id: "mapguard-ongoing", name: "MapGuard™ Ongoing", category: "visibility", description: "Monthly Google Maps maintenance and growth." },
  { id: "reputationshield", name: "ReputationShield™", category: "reputation", description: "Review generation, response templates, and reputation monitoring." },
  { id: "socialsync", name: "SocialSync™", category: "visibility", description: "Social media content and posting for trades businesses." },
  { id: "sitelaunch", name: "SiteLaunch™", category: "website", description: "High-converting website built for trades. Launched in 2 weeks." },
  { id: "webfix", name: "WebFix™", category: "website", description: "Website fixes, tweaks, and optimization." },
  { id: "rankflow", name: "RankFlow™", category: "visibility", description: "Ongoing SEO that brings consistent traffic and leads." },
  { id: "webcare", name: "WebCare™", category: "website", description: "Monthly website maintenance, uptime monitoring, and security checks." },
  { id: "adflow", name: "AdFlow™", category: "leads", description: "Managed Google + Facebook ads. White-label PPC agencies handle fulfillment." },
  { id: "bookflow", name: "BookFlow", category: "automation", description: "Simple online booking system. Standalone product or bundled with QuoteQuick." },
];

function fmt(cents: number | null) {
  if (cents == null) return "-";
  return `$${(cents / 100).toFixed(0)}`;
}

export default function ServicesPage() {
  usePageTitle("Services");
  const { data: catalog, isLoading } = useQuery<ServiceCatalogItem[]>({
    queryKey: ["/api/admin/crm/services"],
  });

  const { data: stats } = useQuery<ServiceStat[]>({
    queryKey: ["/api/admin/crm/services/stats"],
  });

  const statMap = new Map((stats ?? []).map(s => [s.service_id, s.count]));

  // Merge catalog from DB with core services list.
  //
  // Wave Q audit (W-PRICING) — products in `shared/pricing.ts` get one
  // service_catalog row per TIER (e.g. quotequick-free, quotequick-pro,
  // quotequick-business, quotequick-install). The legacy product-level
  // rows like bare `quotequick` were soft-retired by
  // retire-duplicate-services.sql. If we iterate CORE_SERVICES first (which
  // is keyed by product id), tier-level rows never appear and per-tier
  // prices show as blank.
  //
  // New approach: iterate the DB catalog primarily. Each row already has
  // name + price + billing period from the seed. Then append any
  // CORE_SERVICES entries the DB doesn't have yet (marked "Not yet active").
  const coreMap = new Map(CORE_SERVICES.map(s => [s.id, s]));
  const dbCatalog = (catalog ?? []).filter(s => s.is_active);

  const dbRows = dbCatalog.map(db => {
    const core = coreMap.get(db.id);
    return {
      id: db.id,
      name: db.name || core?.name || db.id,
      description: db.description || core?.description || "",
      category: db.category || core?.category || "leads",
      default_price: db.default_price ?? null,
      billing_period: db.billing_period ?? "monthly",
      is_active: db.is_active,
      inDatabase: true,
      activeClients: statMap.get(db.id) ?? 0,
    };
  });

  // Append product-level placeholders for products that aren't in the DB at all
  // (e.g. bookflow — flagged for setup). Skip any whose id already exists in DB.
  const dbIds = new Set(dbCatalog.map(s => s.id));
  const fallbackRows = CORE_SERVICES
    .filter(core => !dbIds.has(core.id))
    .map(core => ({
      id: core.id,
      name: core.name,
      description: core.description,
      category: core.category,
      default_price: null as number | null,
      billing_period: "monthly",
      is_active: true,
      inDatabase: false,
      activeClients: statMap.get(core.id) ?? 0,
    }));

  const merged = [...dbRows, ...fallbackRows];

  const topByClients = [...merged]
    .sort((a, b) => b.activeClients - a.activeClients)
    .filter((s) => s.activeClients > 0)
    .slice(0, 6)
    .map((s) => ({ name: s.name, activeClients: s.activeClients }));

  return (
    <AdminLayout pageContext={{
      page: "services",
      serviceCatalogCount: merged.length,
      topServicesByClients: topByClients.length > 0 ? topByClients : undefined,
    }}>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Services</h2>
          <p className="text-sm text-gray-500">{merged.length} services in your catalog</p>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-3 auto-rows-fr">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4"><Skeleton className="h-16 w-full" /></Card>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3 auto-rows-fr">
            {merged.map((svc) => (
              <Link
                key={svc.id}
                href={`/admin/products/${svc.id}`}
                className="block focus:outline-none focus:ring-2 focus:ring-brand-blue/30 rounded-xl h-full"
                data-testid={`product-card-${svc.id}`}
              >
              <Card className="h-full p-4 hover:border-brand-blue/40 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900">{svc.name}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${CATEGORY_COLORS[svc.category] || "bg-gray-100 text-gray-600"}`}>
                        {svc.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{svc.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      {svc.default_price != null && (
                        <span>{fmt(svc.default_price)}{svc.billing_period === "monthly" ? "/mo" : " one-time"}</span>
                      )}
                      <span>{svc.activeClients} active client{svc.activeClients !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {svc.is_active ? (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${SERVICE_STATUS.active.color}`}>Active</span>
                    ) : (
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">Inactive</span>
                    )}
                    {!svc.inDatabase && (
                      <span className="text-[10px] text-gray-300">Not yet active</span>
                    )}
                  </div>
                </div>
              </Card>
              </Link>
            ))}
          </div>
        )}

        <Card className="p-4 space-y-2">
          <p className="text-xs text-gray-400">
            These are all available services in your catalog. Services marked "Not yet active" need to be set up before they can be assigned to clients. Contact support if you need help activating a service.
          </p>
          <p className="text-[11px] text-gray-400">
            <strong className="text-gray-500">Source of truth:</strong>{" "}
            Marketing pricing pages read from <code>shared/pricing.ts</code> (compiled into the
            client bundle). The admin product editor writes to the <code>service_catalog</code>{" "}
            DB table, which is seeded from the same file via{" "}
            <code>server/scripts/seed-services.ts</code>. Customer checkout + Stripe sync read
            from the DB. So price edits in this dashboard go live for customers immediately, but
            the marketing site keeps showing the bundle value until the next deploy.
          </p>
        </Card>
      </div>
    </AdminLayout>
  );
}
