import { Link } from "wouter";
import {
  TrendingUp,
  Share2,
  Star,
  FileText,
  MapPin,
  Zap,
  ShieldCheck,
  ClipboardList,
  Phone,
  Sparkles,
  Lock,
  ArrowRight,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { cn } from "@/lib/utils";

/* ───────────────────────────────────────────────────────────────────────────
 * Marketing Hub — "your growth engine"
 *
 * A read-only consolidation page. Every marketing-ish product already ships as
 * its own portal surface (RankFlow, SocialSync, ReputationShield, …); this hub
 * is the single front door that aggregates them into one card grid, grouped by
 * customer goal (Get Found / Convert Leads / Build Trust / Grow Repeat).
 *
 * Service-gating mirrors PortalLayout.buildNavItems(): we resolve the set of
 * active service prefixes from /api/portal/services and treat a product the
 * customer is subscribed to as "Open", everything else as "available to add"
 * (links to the in-portal catalog). `requires: null` products are always-open
 * (ContentFlow / Reviews funnel render their own empty states, matching the
 * always-visible sidebar entries).
 * ──────────────────────────────────────────────────────────────────────────*/

type MarketingCategory =
  | "Get Found"
  | "Convert Leads"
  | "Build Trust"
  | "Grow Repeat";

interface MarketingProduct {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Whether the product is AI-powered (renders an "AI" badge pill). */
  aiCapable: boolean;
  /** Goal-based tags shown as chips; first entry drives section grouping. */
  categories: MarketingCategory[];
  /** One-line benefit, customer-facing. */
  benefit: string;
  /** Destination route when the customer owns the product. */
  route: string;
  /** Rough setup-time estimate shown on the card. */
  estimatedTime: string;
  /**
   * Service prefix (matches service_id.split("-")[0]) that gates access.
   * null = always available to every account (renders its own empty state).
   */
  requires: string | null;
}

/** In-file catalog — one entry per existing marketing product. */
const MARKETING_PRODUCTS: MarketingProduct[] = [
  {
    id: "rankflow",
    title: "RankFlow",
    icon: TrendingUp,
    aiCapable: true,
    categories: ["Get Found"],
    benefit: "Climb local search with done-for-you SEO pages and citations.",
    route: "/portal/rankflow",
    estimatedTime: "Managed for you",
    requires: "rankflow",
  },
  {
    id: "mapguard",
    title: "MapGuard",
    icon: MapPin,
    aiCapable: true,
    categories: ["Get Found", "Build Trust"],
    benefit: "Protect your Google Business Profile and catch listing changes.",
    route: "/portal/mapguard",
    estimatedTime: "~5 min setup",
    requires: "mapguard",
  },
  {
    id: "citationbuilder",
    title: "Citation Builder",
    icon: ClipboardList,
    aiCapable: false,
    categories: ["Get Found"],
    benefit: "Get listed consistently across the directories that matter.",
    route: "/portal/citation-builder",
    estimatedTime: "~10 min setup",
    requires: "citationbuilder",
  },
  {
    id: "adflow",
    title: "AdFlow",
    icon: Zap,
    aiCapable: true,
    categories: ["Get Found", "Convert Leads"],
    benefit: "Launch and optimise local ads without an agency markup.",
    route: "/portal/adflow/dashboard",
    estimatedTime: "~10 min setup",
    requires: "adflow",
  },
  {
    id: "tradeline",
    title: "24/7 TradeLine",
    icon: Phone,
    aiCapable: true,
    categories: ["Convert Leads"],
    benefit: "An AI receptionist answers every call and books the job.",
    route: "/portal/tradeline/setup",
    estimatedTime: "~15 min setup",
    requires: "tradeline",
  },
  {
    id: "webcare",
    title: "WebCare",
    icon: ShieldCheck,
    aiCapable: false,
    categories: ["Convert Leads", "Build Trust"],
    benefit: "Keep your site fast, secure and converting — handled for you.",
    route: "/portal/webcare/dashboard",
    estimatedTime: "Managed for you",
    requires: "webcare",
  },
  {
    id: "reputationshield",
    title: "ReputationShield",
    icon: Star,
    aiCapable: true,
    categories: ["Build Trust", "Grow Repeat"],
    benefit: "Win more 5-star reviews and respond to them in one place.",
    route: "/portal/reviews",
    estimatedTime: "~5 min setup",
    requires: "reputationshield",
  },
  {
    id: "socialsync",
    title: "SocialSync",
    icon: Share2,
    aiCapable: true,
    categories: ["Build Trust", "Grow Repeat"],
    benefit: "Stay top-of-mind with auto-scheduled, on-brand social posts.",
    route: "/portal/socialsync",
    estimatedTime: "~10 min setup",
    requires: "socialsync",
  },
  {
    id: "contentflow",
    title: "ContentFlow",
    icon: FileText,
    aiCapable: true,
    categories: ["Get Found", "Grow Repeat"],
    benefit: "AI-written articles and posts that bring customers back.",
    route: "/portal/articles",
    estimatedTime: "Always on",
    requires: null,
  },
];

/** Goal sections, in the order they render. */
const CATEGORY_ORDER: { key: MarketingCategory; blurb: string }[] = [
  { key: "Get Found", blurb: "Show up first when local customers are searching." },
  { key: "Convert Leads", blurb: "Turn that traffic and those calls into booked jobs." },
  { key: "Build Trust", blurb: "Prove you're the reliable, reputable choice." },
  { key: "Grow Repeat", blurb: "Keep past customers coming back and referring." },
];

/**
 * Resolve the set of active service prefixes for the signed-in customer.
 * Mirrors PortalLayout.useActiveServicePrefixes() exactly so the hub's
 * "Open vs Add" state stays consistent with the sidebar's gated entries.
 */
function useActiveServicePrefixes(): { prefixes: Set<string>; isLoading: boolean } {
  const { data, isLoading } = useQuery<{ services: { service_id: string; status: string }[] }>({
    queryKey: ["/api/portal/services"],
    queryFn: async () => {
      const res = await fetch("/api/portal/services", { credentials: "include" });
      if (!res.ok) return { services: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  // Defensive: this query key is shared with PortalDashboard / PortalLayout,
  // whose queryFn may have stored the raw array in cache. Handle both shapes.
  const raw: unknown = Array.isArray(data) ? data : (data as { services?: unknown })?.services;
  const services: { service_id: string; status: string }[] = Array.isArray(raw) ? raw : [];
  const prefixes = new Set<string>();
  for (const s of services) {
    if (!s.service_id || s.status === "cancelled" || s.status === "completed") continue;
    const prefix = s.service_id.split("-")[0];
    if (prefix) prefixes.add(prefix);
  }
  return { prefixes, isLoading };
}

function CategoryChip({ label }: { label: MarketingCategory }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function AiBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] font-semibold text-brand-blue">
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      AI
    </span>
  );
}

function ProductCard({
  product,
  unlocked,
}: {
  product: MarketingProduct;
  unlocked: boolean;
}) {
  const Icon = product.icon;
  const href = unlocked ? product.route : "/portal/catalog";

  return (
    <Link
      href={href}
      data-testid={`marketing-card-${product.id}`}
      className={cn(
        "group flex h-full flex-col rounded-2xl border border-border bg-card p-5 text-card-foreground",
        "shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-brand-blue/40",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      )}
    >
      {/* Header: icon + AI badge / lock chip */}
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-xl",
            unlocked ? "bg-brand-blue/10 text-brand-blue" : "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="flex items-center gap-1.5">
          {product.aiCapable && <AiBadge />}
          {!unlocked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Add-on
            </span>
          )}
        </div>
      </div>

      {/* Title + benefit */}
      <h3 className="mt-4 text-base font-semibold text-foreground">{product.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
        {product.benefit}
      </p>

      {/* Category chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {product.categories.map((c) => (
          <CategoryChip key={c} label={c} />
        ))}
      </div>

      {/* Footer: time estimate + CTA */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="text-xs text-muted-foreground">{product.estimatedTime}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-sm font-semibold",
            unlocked ? "text-brand-blue" : "text-muted-foreground group-hover:text-brand-blue"
          )}
        >
          {unlocked ? "Open" : "Learn more"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

export default function MarketingHubPage() {
  const { prefixes } = useActiveServicePrefixes();

  const isUnlocked = (p: MarketingProduct) => p.requires === null || prefixes.has(p.requires);

  return (
    <PortalLayout>
      <div className="space-y-8">
        {/* Hero — title-left per hero layout rule; eyebrow top-left. */}
        <header className="rounded-2xl border border-border bg-gradient-to-br from-brand-blue/10 via-card to-card p-6 sm:p-8">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-blue">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Marketing
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground text-balance sm:text-3xl">
              Your growth engine
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base text-pretty">
              Every tool to get found, win trust, and book more jobs — in one place.
              Open the products you have, or add the ones you don't.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/portal/catalog"
                data-testid="marketing-hub-add-services"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-brand-blue-50 shadow-sm transition-colors hover:bg-brand-blue-600"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add a marketing service
              </Link>
            </div>
          </div>
        </header>

        {/* Goal-grouped sections */}
        {CATEGORY_ORDER.map(({ key, blurb }) => {
          const items = MARKETING_PRODUCTS.filter((p) => p.categories.includes(key));
          if (items.length === 0) return null;
          return (
            <section key={key} aria-labelledby={`section-${key.replace(/\s+/g, "-").toLowerCase()}`}>
              <div className="mb-3">
                <h2
                  id={`section-${key.replace(/\s+/g, "-").toLowerCase()}`}
                  className="text-lg font-semibold text-foreground"
                >
                  {key}
                </h2>
                <p className="text-sm text-muted-foreground">{blurb}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    unlocked={isUnlocked(product)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PortalLayout>
  );
}
