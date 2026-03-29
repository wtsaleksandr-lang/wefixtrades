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
  | "building2";

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
 */
export const NAV_MOBILE_BREAKPOINT = 900;

export const NAV_LINKS: NavItem[] = [
  {
    label: "Products",
    href: "/products/assistants",
    children: [
      { label: "TradeLine\u2122 (Overview)", href: "/products/assistants", description: "24/7 lead handling ecosystem.", icon: "workflow" },
      { label: "AI ChatLine\u2122", href: "/products/ai-chat", description: "Website + SMS chat handling.", icon: "messageSquare" },
      { label: "AI CallLine\u2122", href: "/products/ai-voice", description: "24/7 voice answering.", icon: "phoneCall" },
      { label: "TradeLine\u2122 Complete", href: "/products/tradeline-complete", description: "Chat + Voice + DMs.", icon: "layers" },
      { label: "QuoteQuick Pro\u2122", href: "/products/quickquotepro", description: "Instant quotes on your site.", icon: "calculator" },
      { label: "MapGuard\u2122", href: "/products/mapguard", description: "Google Maps optimization.", icon: "mapPinned" },
      { label: "ReputationShield\u2122", href: "/products/reputationshield", description: "Reviews + reputation.", icon: "shieldCheck" },
      { label: "WebBoost\u2122", href: "/products/webboost", description: "Speed + SEO optimization.", icon: "rocket" },
      { label: "SocialSync\u2122", href: "/products/socialsync", description: "Social media automation.", icon: "share2" },
      { label: "SiteLaunch\u2122", href: "/products/sitelaunch", description: "High-converting websites.", icon: "layout" },
      { label: "Fix & Optimize\u2122", href: "/products/fix-and-optimize", description: "Quick improvements package.", icon: "sparkles" },
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
  {
    label: "Tools",
    href: "/tools/missed-call-calculator",
    children: [
      { label: "Missed Call Calculator", href: "/tools/missed-call-calculator", description: "See revenue lost to missed calls.", icon: "calculator" },
      { label: "Quote Calculator Demo", href: "/tools/quote-demo", description: "Try instant quote generation.", icon: "zap" },
      { label: "Free Website Audit", href: "/tools/free-audit", description: "Google Maps & speed audit.", icon: "search" },
    ],
  },
  { label: "Templates", href: "/templates" },
  { label: "Plans", href: "/plans" },
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
