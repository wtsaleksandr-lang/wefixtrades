// ─── Canonical navigation data ───────────────────────────────────────────────
// Single source of truth for all nav menu items across desktop and mobile.
// Icon keys are resolved to Lucide components at render time via NavIcon.

export type NavIconKey =
  | "workflow"
  | "messageSquare"
  | "phoneCall"
  | "layers"
  | "calculator"
  | "mapPinned"
  | "shieldCheck"
  | "rocket"
  | "share2"
  | "layout"
  | "fileText"
  | "sparkles"
  | "wrench"
  | "fan"
  | "zap"
  | "home"
  | "search"
  | "trees"
  | "bug"
  | "warehouse"
  | "keyRound"
  | "paintbrush"
  | "hammer"
  | "building2"
  | "trendingUp"
  | "target";

export type NavItemChild = {
  label: string;
  href: string;
  description?: string;
  icon: NavIconKey;
  /** When true, this destination lives inside the authenticated portal and is
   *  auth + paid gated. Logged-out users who click it bounce to /login. The
   *  nav renders a subtle lock badge so the gate is signposted BEFORE the
   *  click (otherwise it's a silent dead-end). Used by the Free Tools →
   *  Widgets column (/portal/free-tools/*). */
  portalGated?: boolean;
};

export type NavSubgroup = {
  /** Heading shown above the sub-column on desktop and in the mobile
   *  accordion. */
  heading: string;
  /** Anchor on the hub page (used by "+ N more" cap-link) — e.g. for
   *  the AI Content column we link to /free-tools#ai-content. */
  hubAnchor?: string;
  /** Tools shown directly in this column. Anything beyond `maxShown` is
   *  hidden behind an in-place "Show N more" expander (desktop) / the
   *  accordion (mobile) — nothing is dropped, everything stays reachable. */
  items: NavItemChild[];
  /** Cap for items shown in the dropdown column before the in-place
   *  "Show more" expander takes over. Defaults to 4. */
  maxShown?: number;
};

export type NavItem = {
  label: string;
  href: string;
  children?: NavItemChild[];
  /** When set, the desktop nav renders a multi-column mega-menu and the
   *  mobile sheet renders nested accordions, one per subgroup. Used by
   *  the Products entry so the navbar item unfolds inline while the hub
   *  pages stay canonical for SEO + full detail. */
  subgroups?: NavSubgroup[];
  /** Optional CTA links rendered as pill buttons in a footer strip at the
   *  bottom of the dropdown tray (desktop only). */
  footer?: { label: string; href: string }[];
  /** Flagship trio — our three home-grown ("built from scratch") tools.
   *  Rendered as full-bleed rich cards (real product screenshot poster +
   *  on-hover motion) in a prominent row ABOVE the normal product grid via
   *  <ToolsRichCards>. Purely additive: when set, the desktop dropdown shows
   *  this hero row first, then the standard `children` grid below it. */
  flagship?: NavItemChild[];
};

/**
 * Breakpoint (px) at which navigation switches between desktop and mobile.
 * This is intentionally higher than the global 768 breakpoint in use-mobile.tsx
 * because the nav's horizontal items need more room.
 *
 * At 900, items crop on intermediate widths (~900–1024) before the hamburger
 * kicks in. Lifted to 1024 so the desktop nav always has room for: logo + 4
 * top-level menus + auth CTA.
 *
 * Kept at 1256 (FIX 4). The nav's inner row is clamped to maxWidth:1280; as the
 * viewport narrows the clamped row keeps shrinking, but the right CTA cluster
 * (Login + primary + demo) hits its intrinsic min content-width and stops
 * shrinking. The IA restructure to 4 top-level items dissolves most of the
 * horizontal pressure, but the breakpoint is retained so the CTA cluster is
 * never clipped — below 1256 the hamburger carries BOTH CTAs in the mobile
 * menu (already works). See MarketingNav FIX 2/FIX 4.
 */
export const NAV_MOBILE_BREAKPOINT = 1256;

export const NAV_LINKS: NavItem[] = [
  {
    // IA restructure (QuoteIQ-style) — the whole product + tools + templates
    // surface now lives under ONE "Products" mega-menu, organised into
    // job-grouped COLUMNS (Products / Free Tools / Templates). Each column
    // shows a few primary items and folds its long-tail behind an in-place
    // "Show N more" expander (FreeToolsMegaPanel), so the default view is
    // clean but EVERY destination stays reachable without leaving the menu.
    // Free Tools + Templates are no longer separate top-level items; they are
    // folded in here as columns. Nothing was removed — only regrouped.
    label: "Products",
    href: "/products",
    subgroups: [
      {
        // Column 1 — all products. The three home-grown flagship tools show
        // first (primary); the remaining paid products fold under "Show more".
        heading: "Products",
        hubAnchor: "/products",
        maxShown: 3,
        items: [
          { label: "TradeLine™", href: "/products/tradeline", icon: "workflow" },
          { label: "QuoteQuick™", href: "/products/quickquotepro/demo", icon: "calculator" },
          { label: "LocalScore", href: "/tools/free-audit", icon: "shieldCheck" },
          { label: "MapGuard Suite™", href: "/mapguard-suite", icon: "mapPinned" },
          { label: "CiteTrack", href: "/citation-tracker", icon: "search" },
          { label: "CiteFlow", href: "/citation-builder", icon: "layers" },
          { label: "ContentFlow™", href: "/products/contentflow", icon: "sparkles" },
          { label: "ReputationShield™", href: "/products/reputationshield", icon: "shieldCheck" },
          { label: "SocialSync™", href: "/products/socialsync", icon: "share2" },
          { label: "RankFlow™", href: "/products/rankflow", icon: "trendingUp" },
          { label: "SiteLaunch™", href: "/products/sitelaunch", icon: "layout" },
          { label: "WebCare™", href: "/products/webcare", icon: "wrench" },
          { label: "WebFix™", href: "/products/webfix", icon: "hammer" },
          { label: "AdFlow™", href: "/products/adflow", icon: "target" },
        ],
      },
      {
        // Column 2 — Free Tools (was its own top-level item). Top few show;
        // the full 19-tool set folds under "Show more". Hub at /free-tools
        // stays canonical for SEO + full detail.
        heading: "Free Tools",
        hubAnchor: "/free-tools",
        maxShown: 4,
        items: [
          { label: "LocalScore", href: "/tools/free-audit", icon: "shieldCheck" },
          { label: "Google Ranking Checker", href: "/tools/local-serp-checker", icon: "search" },
          { label: "Citation Checker", href: "/tools/citation-checker", icon: "search" },
          { label: "Local Rank Grid", href: "/tools/local-rank-grid", icon: "mapPinned" },
          { label: "Local Rank Tracker", href: "/tools/local-rank-tracker", icon: "trendingUp" },
          { label: "Local Rankflux", href: "/tools/local-rankflux", icon: "trendingUp" },
          { label: "Google Review Link Gen", href: "/tools/google-review-link-generator", icon: "shieldCheck" },
          { label: "Plumbing Prompts", href: "/tools/plumbing-ai-content-prompts", icon: "wrench" },
          { label: "HVAC Prompts", href: "/tools/hvac-ai-content-prompts", icon: "fan" },
          { label: "Electrical Prompts", href: "/tools/electrical-ai-content-prompts", icon: "zap" },
          { label: "Roofing Prompts", href: "/tools/roofing-ai-content-prompts", icon: "home" },
          { label: "Landscaping Prompts", href: "/tools/landscaping-ai-content-prompts", icon: "trees" },
          { label: "Schema Generator", href: "/portal/free-tools/schema", icon: "fileText", portalGated: true },
          { label: "FAQ Widget", href: "/portal/free-tools/faq", icon: "messageSquare", portalGated: true },
          { label: "Hours Widget", href: "/portal/free-tools/hours", icon: "layout", portalGated: true },
          { label: "Trust Badges", href: "/portal/free-tools/trust-badges", icon: "shieldCheck", portalGated: true },
          { label: "Review Link", href: "/portal/free-tools/review-link", icon: "sparkles", portalGated: true },
          { label: "Callback Form", href: "/portal/free-tools/callback", icon: "phoneCall", portalGated: true },
          { label: "Service Area Map", href: "/portal/free-tools/service-area", icon: "mapPinned", portalGated: true },
        ],
      },
      {
        // Column 3 — Templates (was its own top-level item). Both galleries
        // show; hub at /templates for the full library.
        heading: "Templates",
        hubAnchor: "/templates",
        maxShown: 4,
        items: [
          { label: "Quote Calculators", href: "/templates", icon: "calculator" },
          { label: "AI Receptionists", href: "/ai-receptionists", icon: "phoneCall" },
        ],
      },
    ],
    footer: [
      { label: "Compare all products", href: "/products" },
      { label: "See pricing", href: "/pricing" },
    ],
  },
  {
    // "Industries" (was "Solutions") — trade-specific landing pages. The
    // "Find your trade" typeahead (keyed on this label) searches all 40
    // trades; the footer CTA links to the full catalogue.
    label: "Industries",
    href: "/solutions/for-plumbers",
    children: [
      { label: "For Plumbers", href: "/solutions/for-plumbers", description: "Win more plumbing leads.", icon: "wrench" },
      { label: "For HVAC", href: "/solutions/for-hvac", description: "Book more service calls.", icon: "fan" },
      { label: "For Electricians", href: "/solutions/for-electricians", description: "Automate quotes & follow-ups.", icon: "zap" },
      { label: "For Roofers", href: "/solutions/for-roofers", description: "Boost visibility & conversions.", icon: "home" },
      { label: "For Cleaners", href: "/solutions/for-cleaners", description: "Get booked on autopilot.", icon: "sparkles" },
      { label: "For Landscapers", href: "/solutions/for-landscapers", description: "Capture more local jobs.", icon: "trees" },
      { label: "For Pest Control", href: "/solutions/for-pest-control", description: "Respond faster to new leads.", icon: "bug" },
      { label: "For Garage Door", href: "/solutions/for-garage-door", description: "Turn urgent calls into bookings.", icon: "warehouse" },
      { label: "For Locksmiths", href: "/solutions/for-locksmiths", description: "Convert high-intent searches.", icon: "keyRound" },
      { label: "For Painters", href: "/solutions/for-painters", description: "Generate more estimate requests.", icon: "paintbrush" },
      { label: "For Remodelers", href: "/solutions/for-remodelers", description: "Turn inquiries into projects.", icon: "hammer" },
      { label: "For General Contractors", href: "/solutions/for-general-contractors", description: "Organize leads & follow-ups.", icon: "building2" },
    ],
    footer: [
      { label: "See all 40 trades", href: "/solutions" },
      { label: "Compare products for your trade", href: "/products" },
    ],
  },
  { label: "Pricing", href: "/pricing" },
  {
    label: "Resources",
    href: "/demos",
    children: [
      { label: "Demo Center", href: "/demos", description: "Try live demos.", icon: "layout" },
      { label: "Docs", href: "/docs", description: "Guides & references.", icon: "fileText" },
      { label: "Blog", href: "/blog", description: "Tips & updates.", icon: "fileText" },
      { label: "Case Studies", href: "/case-studies", description: "Customer success stories.", icon: "shieldCheck" },
    ],
  },
];
