import { useLocation } from "wouter";
import type { BreadcrumbItem } from "@/components/ui/breadcrumbs";

/**
 * useBreadcrumbs — derive a breadcrumb trail from the current wouter
 * location. Recognises the top admin + portal routes; falls back to a
 * sensible "humanise the path" trail for anything else so even un-mapped
 * deep links get a usable breadcrumb.
 *
 * Why static map (not router-introspection): wouter doesn't expose the
 * matched route shape, and we want stable, hand-curated labels (e.g.
 * "QuoteQuick" vs "quotequick"). Map covers the top customer-visible
 * routes; everything else degrades to a humanised path.
 */
type StaticRoute = {
  /** Regex against the pathname. First match wins. */
  match: RegExp;
  /** Build the trail given the regex match groups. */
  build: (m: RegExpMatchArray) => BreadcrumbItem[];
};

const humanise = (slug: string): string =>
  slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

/* ────────────── Admin routes ────────────── */
const ADMIN_ROOT: BreadcrumbItem = { label: "Admin", to: "/admin/crm" };

const ADMIN_ROUTES: StaticRoute[] = [
  // /admin/crm/clients/:id  →  Admin › Clients › #id
  {
    match: /^\/admin\/crm\/clients\/(\d+)$/,
    build: (m) => [
      ADMIN_ROOT,
      { label: "Clients", to: "/admin/crm/clients" },
      { label: `#${m[1]}` },
    ],
  },
  {
    match: /^\/admin\/crm\/clients$/,
    build: () => [ADMIN_ROOT, { label: "Clients" }],
  },
  // /admin/crm/services  →  Admin › Services
  {
    match: /^\/admin\/crm\/services$/,
    build: () => [ADMIN_ROOT, { label: "Services" }],
  },
  // /admin/products/:slug → Admin › Products › <Slug>
  {
    match: /^\/admin\/products\/([^/]+)$/,
    build: (m) => [
      ADMIN_ROOT,
      { label: "Products", to: "/admin/crm/services" },
      { label: humanise(m[1]) },
    ],
  },
  // /admin/tradeline/voices → Admin › TradeLine › Voices
  {
    match: /^\/admin\/tradeline\/voices$/,
    build: () => [
      ADMIN_ROOT,
      { label: "TradeLine", to: "/admin/crm/tradeline-ops" },
      { label: "Voices" },
    ],
  },
  // /admin/tradeline/templates
  {
    match: /^\/admin\/tradeline\/templates$/,
    build: () => [
      ADMIN_ROOT,
      { label: "TradeLine", to: "/admin/crm/tradeline-ops" },
      { label: "Templates" },
    ],
  },
  // /admin/quotequick/templates/:id  → Admin › QuoteQuick › Templates › #id
  {
    match: /^\/admin\/quotequick\/templates\/([^/]+)$/,
    build: (m) => [
      ADMIN_ROOT,
      { label: "QuoteQuick", to: "/admin/crm/quotequick" },
      { label: "Templates", to: "/admin/quotequick/templates" },
      { label: `#${m[1]}` },
    ],
  },
  {
    match: /^\/admin\/quotequick\/templates$/,
    build: () => [
      ADMIN_ROOT,
      { label: "QuoteQuick", to: "/admin/crm/quotequick" },
      { label: "Templates" },
    ],
  },
  // /admin/quotequick/trades
  {
    match: /^\/admin\/quotequick\/trades$/,
    build: () => [
      ADMIN_ROOT,
      { label: "QuoteQuick", to: "/admin/crm/quotequick" },
      { label: "Trades" },
    ],
  },
  // /admin/integrations/google  →  Admin › Integrations › Google
  {
    match: /^\/admin\/integrations\/([^/]+)$/,
    build: (m) => [
      ADMIN_ROOT,
      { label: "Integrations", to: "/admin/system/integrations" },
      { label: humanise(m[1]) },
    ],
  },
  // /admin/system/:section
  {
    match: /^\/admin\/system\/([^/]+)$/,
    build: (m) => [
      ADMIN_ROOT,
      { label: "System" },
      { label: humanise(m[1]) },
    ],
  },
  // /admin/crm  → Admin › Overview
  {
    match: /^\/admin\/crm\/?$/,
    build: () => [ADMIN_ROOT, { label: "Overview" }],
  },
];

/* ────────────── Portal routes ────────────── */
const PORTAL_ROOT: BreadcrumbItem = { label: "Portal", to: "/portal" };

const PORTAL_ROUTES: StaticRoute[] = [
  // /portal  → Portal › Overview
  {
    match: /^\/portal\/?$/,
    build: () => [PORTAL_ROOT, { label: "Overview" }],
  },
  // /portal/dashboard  → Portal › Dashboard
  {
    match: /^\/portal\/dashboard\/?$/,
    build: () => [PORTAL_ROOT, { label: "Dashboard" }],
  },
  // /portal/services/:id  → Portal › Services › #id
  {
    match: /^\/portal\/services\/([^/]+)$/,
    build: (m) => [
      PORTAL_ROOT,
      { label: "Services", to: "/portal/services" },
      { label: `#${m[1]}` },
    ],
  },
  {
    match: /^\/portal\/services\/?$/,
    build: () => [PORTAL_ROOT, { label: "Services" }],
  },
  // /portal/billing  → Portal › Billing
  {
    match: /^\/portal\/billing\/?$/,
    build: () => [PORTAL_ROOT, { label: "Billing" }],
  },
  // /portal/invoices
  {
    match: /^\/portal\/invoices\/?$/,
    build: () => [PORTAL_ROOT, { label: "Invoices" }],
  },
];

/** Fallback — split the path, drop the leading root, humanise the rest. */
function fallbackTrail(location: string): BreadcrumbItem[] {
  const parts = location.split("/").filter(Boolean);
  if (parts.length === 0) return [];
  const isAdmin = parts[0] === "admin";
  const isPortal = parts[0] === "portal";

  const trail: BreadcrumbItem[] = [];
  if (isAdmin) trail.push(ADMIN_ROOT);
  else if (isPortal) trail.push(PORTAL_ROOT);

  // Walk the remaining segments, accumulating a path. Each segment but
  // the last is clickable to its accumulated path.
  let acc = isAdmin || isPortal ? `/${parts[0]}` : "";
  const rest = isAdmin || isPortal ? parts.slice(1) : parts;
  rest.forEach((seg, idx) => {
    acc += `/${seg}`;
    const isLast = idx === rest.length - 1;
    trail.push({
      label: humanise(seg),
      to: isLast ? undefined : acc,
    });
  });
  return trail;
}

/**
 * Resolve breadcrumbs for the current pathname. Returns [] when the
 * page is at a root we don't want crumbs on (e.g. /login, /).
 */
export function useBreadcrumbs(): BreadcrumbItem[] {
  const [location] = useLocation();

  // Skip non-admin, non-portal routes entirely.
  if (!location.startsWith("/admin") && !location.startsWith("/portal")) {
    return [];
  }

  const routes = location.startsWith("/admin") ? ADMIN_ROUTES : PORTAL_ROUTES;
  for (const route of routes) {
    const m = location.match(route.match);
    if (m) return route.build(m);
  }
  return fallbackTrail(location);
}

export default useBreadcrumbs;
