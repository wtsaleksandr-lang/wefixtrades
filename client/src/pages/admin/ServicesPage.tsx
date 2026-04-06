import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
  { id: "quotequick", name: "QuoteQuick Pro™", category: "leads", description: "Instant quote calculator for trades websites. Captures leads with real pricing." },
  { id: "mapguard-setup", name: "MapSetup™", category: "visibility", description: "One-time Google Business Profile optimization sprint." },
  { id: "mapguard-ongoing", name: "MapGuard™ Ongoing", category: "visibility", description: "Monthly Google Maps maintenance and growth." },
  { id: "reputationshield", name: "ReputationShield™", category: "reputation", description: "Review generation, response templates, and reputation monitoring." },
  { id: "socialsync", name: "SocialSync™", category: "visibility", description: "Social media content and posting for trades businesses." },
  { id: "sitelaunch", name: "SiteLaunch™", category: "website", description: "High-converting website built for trades. Launched in 2 weeks." },
  { id: "webfix", name: "WebFix™", category: "website", description: "Website fixes, tweaks, and optimization." },
  { id: "rankflow", name: "RankFlow™", category: "visibility", description: "Ongoing SEO that brings consistent traffic and leads." },
  { id: "adflow", name: "AdFlow™", category: "leads", description: "Done-for-you ads that bring leads fast." },
];

function fmt(cents: number | null) {
  if (cents == null) return "-";
  return `$${(cents / 100).toFixed(0)}`;
}

export default function ServicesPage() {
  const { data: catalog, isLoading } = useQuery<ServiceCatalogItem[]>({
    queryKey: ["/api/admin/crm/services"],
  });

  const { data: stats } = useQuery<ServiceStat[]>({
    queryKey: ["/api/admin/crm/services/stats"],
  });

  const statMap = new Map((stats ?? []).map(s => [s.service_id, s.count]));

  // Merge catalog from DB with core services list
  const catalogMap = new Map((catalog ?? []).map(s => [s.id, s]));
  const merged = CORE_SERVICES.map(core => {
    const db = catalogMap.get(core.id);
    return {
      id: core.id,
      name: db?.name || core.name,
      description: db?.description || core.description,
      category: db?.category || core.category,
      default_price: db?.default_price ?? null,
      billing_period: db?.billing_period ?? "monthly",
      is_active: db?.is_active ?? true,
      inDatabase: !!db,
      activeClients: statMap.get(core.id) ?? 0,
    };
  });

  return (
    <AdminLayout pageContext={{ page: "services" }}>
      <div className="max-w-5xl mx-auto space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Services</h2>
          <p className="text-sm text-gray-500">{merged.length} services in your catalog</p>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4"><Skeleton className="h-16 w-full" /></Card>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {merged.map((svc) => (
              <Card key={svc.id} className="p-4">
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
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Active</span>
                    ) : (
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">Inactive</span>
                    )}
                    {!svc.inDatabase && (
                      <span className="text-[10px] text-gray-300">Not in DB</span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Card className="p-4">
          <p className="text-xs text-gray-400">
            Services are defined in the business catalog. To add a service to the database for client assignment, use the service catalog API or seed script. Services marked "Not in DB" are defined in the UI only and need to be seeded.
          </p>
        </Card>
      </div>
    </AdminLayout>
  );
}
