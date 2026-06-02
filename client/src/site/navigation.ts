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
};

export type NavSubgroup = {
  /** Heading shown above the sub-column on desktop and in the mobile
   *  accordion. */
  heading: string;
  /** Anchor on the hub page (used by "+ N more" cap-link) — e.g. for
   *  the AI Content column we link to /free-tools#ai-content. */
  hubAnchor?: string;
  /** Tools shown directly in this column. Anything beyond `maxShown` is
   *  hidden behind a "+ N more →" link to `hubAnchor`. */
  items: NavItemChild[];
  /** Cap for items shown in the dropdown column before the "more" link
   *  takes over. Defaults to 7. */
  maxShown?: number;
};

export type NavItem = {
  label: string;
  href: string;
  children?: NavItemChild[];
  /** When set, the desktop nav renders a multi-column mega-menu and the
   *  mobile sheet renders nested accordions, one per subgroup. Used by
   *  the Free Tools entry (Wave 14) so the navbar item unfolds inline
   *  while /free-tools stays the canonical hub for SEO + full detail. */
  subgroups?: NavSubgroup[];
};

/**
 * Breakpoint (px) at which navigation switches between desktop and mobile.
 * This is intentionally higher than the global 768 breakpoint in use-mobile.tsx
 * because the nav's horizontal items need more room.
 *
 * At 900, items crop on intermediate widths (~900–1024) before the hamburger
 * kicks in. Lifted to 1024 so the desktop nav always has room for: logo + 6
 * top-level menus + auth CTA. Below 1024 we go straight to hamburger.
 */
export const NAV_MOBILE_BREAKPOINT = 1024;

export const NAV_LINKS: NavItem[] = [
  {
    // Wave 11D D5 \u2014 MapGuard Suite group surfaces FIRST in the dropdown so
    // the 4 paid local-SEO products are visible together. Free Tools is now
    // a separate top-level nav item (parallel to Products), not a sub-item
    // here. BookFlow removed as standalone (bundled into QuoteQuick per D2).
    label: "Products",
    href: "/products/tradeline",
    children: [
      { label: "MapGuard Suite\u2122", href: "/mapguard-suite", description: "Local SEO platform \u2014 4 paid products.", icon: "mapPinned" },
      { label: "MapGuard\u2122", href: "/products/mapguard", description: "Managed Google Maps visibility.", icon: "mapPinned" },
      { label: "Citation Tracker", href: "/citation-tracker", description: "Monitor citations across directories.", icon: "search" },
      { label: "Citation Builder", href: "/citation-builder", description: "One-time citation submission service.", icon: "layers" },
      { label: "24/7 TradeLine\u2122", href: "/products/tradeline", description: "Always-on lead handling system.", icon: "workflow" },
      { label: "QuoteQuick\u2122", href: "/products/quickquotepro", description: "Instant quotes + booking on your site.", icon: "calculator" },
      { label: "ContentFlow\u2122", href: "/products/contentflow", description: "AI content creation engine.", icon: "sparkles" },
      { label: "ReputationShield\u2122", href: "/products/reputationshield", description: "Reviews + reputation.", icon: "shieldCheck" },
      { label: "SocialSync\u2122", href: "/products/socialsync", description: "Social media automation.", icon: "share2" },
      { label: "RankFlow\u2122", href: "/products/rankflow", description: "Ongoing SEO for trades.", icon: "trendingUp" },
      { label: "SiteLaunch\u2122", href: "/products/sitelaunch", description: "High-converting websites.", icon: "layout" },
      { label: "WebCare\u2122", href: "/products/webcare", description: "Website maintenance & monitoring.", icon: "wrench" },
      { label: "WebFix\u2122", href: "/products/webfix", description: "One-time website fixes.", icon: "hammer" },
      { label: "AdFlow\u2122", href: "/products/adflow", description: "Managed ad campaigns.", icon: "target" },
    ],
  },
  {
    // Wave 14 \u2014 Free Tools navbar mega-menu unfold. The hub at
    // /free-tools stays canonical for SEO + full detail; the navbar item
    // unfolds inline to preview the 3 sub-categories so users can jump
    // straight to any tool. Pattern matches Linear / Stripe / BrightLocal:
    // discoverability inside the menu, depth on the hub page.
    label: "Free Tools",
    href: "/free-tools",
    subgroups: [
      {
        heading: "Local SEO Tools",
        hubAnchor: "/free-tools#local-seo",
        items: [
          { label: "Free Audit", href: "/tools/free-audit", icon: "shieldCheck" },
          { label: "Citation Checker", href: "/tools/citation-checker", icon: "search" },
          { label: "Local Rank Grid", href: "/tools/local-rank-grid", icon: "mapPinned" },
          { label: "Local Rank Tracker", href: "/tools/local-rank-tracker", icon: "trendingUp" },
          { label: "Local SERP Checker", href: "/tools/local-serp-checker", icon: "search" },
          { label: "Local Rankflux", href: "/tools/local-rankflux", icon: "trendingUp" },
          { label: "Google Review Link Gen", href: "/tools/google-review-link-generator", icon: "shieldCheck" },
        ],
      },
      {
        heading: "AI Content Tools",
        hubAnchor: "/free-tools#ai-content",
        items: [
          { label: "Plumbing Prompts", href: "/tools/plumbing-ai-content-prompts", icon: "wrench" },
          { label: "HVAC Prompts", href: "/tools/hvac-ai-content-prompts", icon: "fan" },
          { label: "Electrical Prompts", href: "/tools/electrical-ai-content-prompts", icon: "zap" },
          { label: "Roofing Prompts", href: "/tools/roofing-ai-content-prompts", icon: "home" },
          { label: "Landscaping Prompts", href: "/tools/landscaping-ai-content-prompts", icon: "trees" },
        ],
      },
      {
        heading: "Widgets",
        hubAnchor: "/free-tools#widgets",
        items: [
          { label: "Schema Generator", href: "/portal/free-tools/schema", icon: "fileText" },
          { label: "FAQ Widget", href: "/portal/free-tools/faq", icon: "messageSquare" },
          { label: "Hours Widget", href: "/portal/free-tools/hours", icon: "layout" },
          { label: "Trust Badges", href: "/portal/free-tools/trust-badges", icon: "shieldCheck" },
          { label: "Review Link", href: "/portal/free-tools/review-link", icon: "sparkles" },
          { label: "Callback Form", href: "/portal/free-tools/callback", icon: "phoneCall" },
          { label: "Service Area Map", href: "/portal/free-tools/service-area", icon: "mapPinned" },
        ],
      },
    ],
  },
  {
    label: "Solutions",
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
  },
  // Wave 11D D5 — top-level "Free Audit" entry removed; the audit now lives
  // as one entry inside the Free Tools hub (/free-tools, with sections for
  // Local SEO / AI Content / Widgets). The /tools/free-audit page itself
  // is unchanged.
  {
    // Shared "Templates" umbrella — two ready-to-use template types: the
    // QuoteQuick calculator gallery (/templates) and the AI receptionist
    // gallery (/ai-receptionists). Both are also surfaced in the portal +
    // admin so the naming stays consistent across all three surfaces.
    label: "Templates",
    href: "/templates",
    children: [
      { label: "Quote Calculators", href: "/templates", description: "Instant-quote calculator templates by trade.", icon: "calculator" },
      { label: "AI Receptionists", href: "/ai-receptionists", description: "Ready-made AI phone & chat receptionists by trade.", icon: "phoneCall" },
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
