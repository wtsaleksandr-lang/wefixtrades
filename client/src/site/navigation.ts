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

export type NavItem = {
  label: string;
  href: string;
  children?: NavItemChild[];
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
    // Wave 11D D5 \u2014 Free Tools hub as a TOP-LEVEL nav item. Single link
    // (no dropdown) \u2014 the 3 sub-categories (Local SEO / AI Content /
    // Widgets) are sections on /free-tools, not separate menus.
    label: "Free Tools",
    href: "/free-tools",
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
  { label: "Templates", href: "/templates" },
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
