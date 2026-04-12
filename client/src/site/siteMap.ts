// Navigation types and data are defined in @/site/navigation.ts (single source of truth).
// Re-export for any code that was importing NavItem from this file.
export type { NavItem } from "./navigation";
export { NAV_LINKS } from "./navigation";

export const DEMOS = [
  { label: "Demo Center", href: "/demos" },
  { label: "TradeLine Demo", href: "/demos/tradeline" },
  { label: "QuoteQuick Demo", href: "/demos/quotequick" },
];

export const FOOTER_LINKS = {
  Product: [
    { label: "24/7 TradeLine\u2122", href: "/products/tradeline" },
    { label: "QuoteQuick Pro\u2122", href: "/products/quickquotepro" },
    { label: "MapGuard\u2122", href: "/products/mapguard" },
    { label: "ReputationShield\u2122", href: "/products/reputationshield" },
    { label: "SocialSync\u2122", href: "/products/socialsync" },
    { label: "SiteLaunch\u2122", href: "/products/sitelaunch" },
    { label: "WebCare\u2122", href: "/products/webcare" },
  ],
  Solutions: [
    { label: "For Plumbers", href: "/solutions/for-plumbers" },
    { label: "For HVAC", href: "/solutions/for-hvac" },
    { label: "For Electricians", href: "/solutions/for-electricians" },
    { label: "For Roofers", href: "/solutions/for-roofers" },
    { label: "For Cleaners", href: "/solutions/for-cleaners" },
  ],
  Resources: [
    { label: "Pricing", href: "/pricing" },
    { label: "Demo Center", href: "/demos" },
    { label: "Docs", href: "/docs" },
    { label: "Blog", href: "/blog" },
    { label: "Case Studies", href: "/case-studies" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
} as const;

/** Legal links shown in the footer bottom bar */
export const FOOTER_LEGAL_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
] as const;

export type ProductConfig = {
  slug: string;
  name: string;
  tagline: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  icon: string;
  bullets: string[];
  pricing?: { name: string; priceUsd: number; cadence: "/mo" | "one-time"; includes: string[] }[];
};

export const PRODUCTS: ProductConfig[] = [
  { slug: "tradeline", name: "24/7 TradeLine™", tagline: "24/7 lead handling for busy trades.", primaryCtaLabel: "Start Free", primaryCtaHref: "/signup", secondaryCtaLabel: "View Live Demo", secondaryCtaHref: "/demo", icon: "workflow", bullets: ["AI call + chat answering", "Instant estimates", "Auto follow-ups", "Review requests"] },
  { slug: "quickquotepro", name: "QuoteQuick Pro™", tagline: "Instant quote calculators for trades.", primaryCtaLabel: "Start Free", primaryCtaHref: "/signup", secondaryCtaLabel: "View Live Demo", secondaryCtaHref: "/demo/quotequick", icon: "calculator", bullets: ["Instant estimates", "Lead capture", "Trade-specific logic", "Embed anywhere"] },
  { slug: "mapguard", name: "MapGuard™", tagline: "Google Business Profile optimization.", primaryCtaLabel: "Start Free", primaryCtaHref: "/signup", secondaryCtaLabel: "See Pricing", secondaryCtaHref: "/pricing", icon: "map", bullets: ["Rank higher locally", "Fix profile gaps", "Improve reviews & CTR", "Ongoing updates"] },
  { slug: "reputationshield", name: "ReputationShield™", tagline: "Reviews + reputation automation.", primaryCtaLabel: "Start Free", primaryCtaHref: "/signup", secondaryCtaLabel: "See Pricing", secondaryCtaHref: "/pricing", icon: "shield", bullets: ["Review requests", "Response guidance", "Reputation monitoring", "Trust boost"] },
  { slug: "rankflow", name: "RankFlow™", tagline: "Ongoing SEO for trades.", primaryCtaLabel: "See Pricing", primaryCtaHref: "/pricing", secondaryCtaLabel: "Learn More", secondaryCtaHref: "/products/rankflow", icon: "rocket", bullets: ["Keyword targeting", "Content creation", "Ranking reports", "Local SEO"] },
  { slug: "adflow", name: "AdFlow™", tagline: "Done-for-you ad campaigns.", primaryCtaLabel: "See Pricing", primaryCtaHref: "/pricing", secondaryCtaLabel: "Learn More", secondaryCtaHref: "/products/adflow", icon: "target", bullets: ["Google & Facebook ads", "Targeted to homeowners", "Budget optimization", "Clear ROI reporting"] },
  { slug: "socialsync", name: "SocialSync™", tagline: "Social media management + automation.", primaryCtaLabel: "See Pricing", primaryCtaHref: "/pricing", secondaryCtaLabel: "Examples", secondaryCtaHref: "/case-studies", icon: "share", bullets: ["Consistent posting", "Brand consistency", "Automation setup", "Basic analytics"] },
  { slug: "sitelaunch", name: "SiteLaunch™", tagline: "High-converting websites for trades.", primaryCtaLabel: "See Pricing", primaryCtaHref: "/pricing", secondaryCtaLabel: "Examples", secondaryCtaHref: "/case-studies", icon: "layout", bullets: ["Fast, clean pages", "Conversion focused", "Mobile-first", "SEO-ready"] },
  { slug: "webcare", name: "WebCare™", tagline: "Ongoing website maintenance.", primaryCtaLabel: "Start", primaryCtaHref: "/pricing", secondaryCtaLabel: "See what's included", secondaryCtaHref: "/products/webcare", icon: "refresh", bullets: ["Monthly updates", "Security patches", "Uptime monitoring", "Content changes"] },
];
