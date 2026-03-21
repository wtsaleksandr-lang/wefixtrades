export type NavItem = {
  label: string;
  href?: string;
  children?: { label: string; href: string; desc?: string; icon?: string }[];
};

export const TOP_NAV: NavItem[] = [
  {
    label: "Products",
    children: [
      { label: "TradeLine™", href: "/products/assistants", desc: "24/7 lead handling ecosystem.", icon: "workflow" },
      { label: "AI ChatLine™", href: "/products/ai-chat", desc: "Website + SMS AI chat handling.", icon: "message" },
      { label: "AI CallLine™", href: "/products/ai-voice", desc: "24/7 AI voice answering.", icon: "phone" },
      { label: "TradeLine™ Complete", href: "/products/tradeline-complete", desc: "Chat + Voice + DMs.", icon: "layers" },

      { label: "MapGuard™", href: "/products/mapguard", desc: "Google Maps optimization.", icon: "map" },

      { label: "ReputationShield™", href: "/products/reputationshield", desc: "Reviews + reputation automation.", icon: "shield" },
      { label: "SiteLaunch™", href: "/products/sitelaunch", desc: "High-converting website builds.", icon: "layout" },
      { label: "WebBoost™", href: "/products/webboost", desc: "Website speed + SEO optimization.", icon: "rocket" },
      { label: "Fix & Optimize™", href: "/products/fix-and-optimize", desc: "Quick improvements package.", icon: "sparkle" },

      { label: "QuoteQuick Pro™", href: "/products/quickquotepro", desc: "Instant quotes on your site.", icon: "calculator" },

      { label: "SocialSync™", href: "/products/socialsync", desc: "Social management automation.", icon: "share" },
    ],
  },
  {
    label: "Solutions",
    children: [
      { label: "For Plumbers", href: "/solutions/for-plumbers", desc: "Win more plumbing leads.", icon: "pipe" },
      { label: "For HVAC", href: "/solutions/for-hvac", desc: "Book HVAC service calls.", icon: "fan" },
      { label: "For Electricians", href: "/solutions/for-electricians", desc: "Automate quotes & follow-ups.", icon: "zap" },
      { label: "For Roofers", href: "/solutions/for-roofers", desc: "Boost visibility & conversions.", icon: "home" },
      { label: "For Cleaners", href: "/solutions/for-cleaners", desc: "Get booked on autopilot.", icon: "sparkles" },
    ],
  },
  { label: "Templates", href: "/templates" },
  { label: "Plans", href: "/plans" },
  {
    label: "Resources",
    children: [
      { label: "Demo Center", href: "/demos", desc: "Try live demos.", icon: "play" },
      { label: "Docs", href: "/docs", desc: "Guides & references.", icon: "file" },
      { label: "Blog", href: "/blog", desc: "Tips & updates.", icon: "pen" },
      { label: "Case Studies", href: "/case-studies", desc: "Customer success stories.", icon: "trophy" },
    ],
  },
];

export const DEMOS = [
  { label: "Demo Center", href: "/demos" },
  { label: "AI ChatLine Demo", href: "/demos/ai-chatline" },
  { label: "AI CallLine Demo", href: "/demos/ai-callline" },
  { label: "QuoteQuick Demo", href: "/demos/quotequick" },
  { label: "TradeLine Complete Demo", href: "/demos/tradeline-complete" },
];

export const FOOTER_LINKS = {
  Product: [
    { label: "TradeLine™", href: "/products/tradeline" },
    { label: "QuoteQuick Pro™", href: "/products/quotequick" },
    { label: "MapGuard™", href: "/products/mapguard" },
    { label: "ReputationShield™", href: "/products/reputationshield" },
    { label: "WebBoost™", href: "/products/webboost" },
    { label: "SocialSync™", href: "/products/socialsync" },
    { label: "SiteLaunch™", href: "/products/sitelaunch" },
    { label: "Fix & Optimize™", href: "/products/fix-and-optimize" },
  ],
  Solutions: [
    { label: "For Plumbers", href: "/solutions/for-plumbers" },
    { label: "For HVAC", href: "/solutions/for-hvac" },
    { label: "For Electricians", href: "/solutions/for-electricians" },
    { label: "For Roofers", href: "/solutions/for-roofers" },
    { label: "For Cleaners", href: "/solutions/for-cleaners" },
  ],
  Resources: [
    { label: "Plans", href: "/plans" },
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
  {
    slug: "tradeline",
    name: "TradeLine™",
    tagline: "24/7 lead handling ecosystem for busy trades.",
    primaryCtaLabel: "Start Free",
    primaryCtaHref: "/signup",
    secondaryCtaLabel: "View Live Demo",
    secondaryCtaHref: "/demo/tradeline-complete",
    icon: "workflow",
    bullets: ["AI Chat + SMS capture", "AI voice answering", "DM handling (FB/IG)", "Instant follow-ups + summaries"],
    pricing: [
      { name: "AI ChatLine™", priceUsd: 149, cadence: "/mo", includes: ["Website chat", "SMS lead capture", "Basic qualification", "Instant notifications"] },
      { name: "AI CallLine™", priceUsd: 199, cadence: "/mo", includes: ["24/7 voice answering", "Call summary", "Lead capture", "SMS/email notifications"] },
      { name: "TradeLine™ Complete", priceUsd: 299, cadence: "/mo", includes: ["ChatLine + CallLine", "FB/IG DMs", "Full lead capture system", "All channels unified"] },
    ],
  },
  {
    slug: "ai-chatline",
    name: "AI ChatLine™",
    tagline: "Website + SMS AI chat handling that turns visitors into booked jobs.",
    primaryCtaLabel: "Start Free",
    primaryCtaHref: "/signup",
    secondaryCtaLabel: "View Live Demo",
    secondaryCtaHref: "/demo/ai-chatline",
    icon: "message",
    bullets: ["On-site chat widget", "SMS lead capture", "Qualification flow", "Instant notifications"],
    pricing: [{ name: "ChatLine", priceUsd: 149, cadence: "/mo", includes: ["Website chat", "SMS capture", "Basic qualification", "Notifications"] }],
  },
  {
    slug: "ai-callline",
    name: "AI CallLine™",
    tagline: "24/7 AI voice answering that never misses a call.",
    primaryCtaLabel: "Start Free",
    primaryCtaHref: "/signup",
    secondaryCtaLabel: "View Live Demo",
    secondaryCtaHref: "/demo/ai-callline",
    icon: "phone",
    bullets: ["Answer every call", "Capture name/need/address", "Call summary", "SMS/email notification"],
    pricing: [{ name: "CallLine", priceUsd: 199, cadence: "/mo", includes: ["24/7 answering", "Summaries", "Lead capture", "Notifications"] }],
  },
  {
    slug: "tradeline-complete",
    name: "TradeLine™ Complete",
    tagline: "Chat + Voice + DMs. The full lead engine.",
    primaryCtaLabel: "Start Free",
    primaryCtaHref: "/signup",
    secondaryCtaLabel: "View Live Demo",
    secondaryCtaHref: "/demo/tradeline-complete",
    icon: "layers",
    bullets: ["Chat + Voice + FB/IG DMs", "Unified capture", "Auto follow-ups", "Built for trades"],
    pricing: [{ name: "Complete", priceUsd: 299, cadence: "/mo", includes: ["ChatLine", "CallLine", "DMs", "Unified lead capture"] }],
  },
  {
    slug: "mapguard",
    name: "MapGuard™",
    tagline: "Google Business Profile optimization + ongoing growth.",
    primaryCtaLabel: "Start Free",
    primaryCtaHref: "/signup",
    secondaryCtaLabel: "See Pricing",
    secondaryCtaHref: "/pricing",
    icon: "map",
    bullets: ["Rank higher locally", "Fix profile gaps", "Improve reviews & CTR", "Ongoing updates"],
  },
  { slug: "mapguard-setup", name: "MapGuard Setup", tagline: "One-time optimization sprint.", primaryCtaLabel: "Start", primaryCtaHref: "/pricing", secondaryCtaLabel: "Talk to us", secondaryCtaHref: "/contact", icon: "wrench", bullets: ["Profile cleanup", "Category tuning", "Services & description", "Photos & posts plan"] },
  { slug: "mapguard-ongoing", name: "MapGuard Ongoing", tagline: "Monthly maintenance & growth.", primaryCtaLabel: "Start", primaryCtaHref: "/pricing", secondaryCtaLabel: "See what's included", secondaryCtaHref: "/products/mapguard", icon: "refresh", bullets: ["Monthly updates", "Review strategy", "Posts cadence", "Ongoing tracking"] },
  { slug: "reputationshield", name: "ReputationShield™", tagline: "Reviews + reputation automation for more trust.", primaryCtaLabel: "Start Free", primaryCtaHref: "/signup", secondaryCtaLabel: "See Pricing", secondaryCtaHref: "/pricing", icon: "shield", bullets: ["Review requests", "Response guidance", "Reputation monitoring", "Trust boost"] },
  { slug: "sitelaunch", name: "SiteLaunch™", tagline: "High-converting websites for trades.", primaryCtaLabel: "See Pricing", primaryCtaHref: "/pricing", secondaryCtaLabel: "Examples", secondaryCtaHref: "/case-studies", icon: "layout", bullets: ["Fast, clean pages", "Conversion focused", "Mobile-first", "SEO-ready"] },
  { slug: "webboost", name: "WebBoost™", tagline: "Speed + SEO improvements that lift conversions.", primaryCtaLabel: "Start", primaryCtaHref: "/pricing", secondaryCtaLabel: "Run Free Audit", secondaryCtaHref: "/free-audit", icon: "rocket", bullets: ["PageSpeed improvements", "Technical SEO fixes", "Core Web Vitals", "Conversion tuning"] },
  { slug: "webboost-setup", name: "WebBoost Setup", tagline: "One-time speed/SEO upgrade.", primaryCtaLabel: "Start", primaryCtaHref: "/pricing", secondaryCtaLabel: "Run Free Audit", secondaryCtaHref: "/free-audit", icon: "wrench", bullets: ["Audit + plan", "Fix key issues", "Optimize assets", "Re-test"] },
  { slug: "webboost-care", name: "WebBoost Care", tagline: "Ongoing performance maintenance.", primaryCtaLabel: "Start", primaryCtaHref: "/pricing", secondaryCtaLabel: "See what's included", secondaryCtaHref: "/products/webboost", icon: "refresh", bullets: ["Monthly checks", "Fix regressions", "Keep CWV green", "Light SEO upkeep"] },
  { slug: "quotequick", name: "QuoteQuick Pro™", tagline: "Instant quote calculators for trades.", primaryCtaLabel: "Start Free", primaryCtaHref: "/signup", secondaryCtaLabel: "View Live Demo", secondaryCtaHref: "/demo/quotequick", icon: "calculator", bullets: ["Instant estimates", "Lead capture", "Trade templates", "Custom options"] },
  { slug: "quotequick-template", name: "QuoteQuick Template", tagline: "Launch quickly with proven templates.", primaryCtaLabel: "Start", primaryCtaHref: "/pricing", secondaryCtaLabel: "View Demo", secondaryCtaHref: "/demo/quotequick", icon: "file", bullets: ["Pre-built forms", "Fast setup", "Mobile ready", "Good-looking UI"] },
  { slug: "quotequick-custom", name: "QuoteQuick Custom", tagline: "Custom calculator designed for your service.", primaryCtaLabel: "Request Build", primaryCtaHref: "/request?service=QuoteQuick", secondaryCtaLabel: "View Demo", secondaryCtaHref: "/demo/quotequick", icon: "code", bullets: ["Your pricing logic", "Your trade flow", "Better conversions", "Full handoff"] },
  { slug: "socialsync", name: "SocialSync™", tagline: "Social media management + automation.", primaryCtaLabel: "See Pricing", primaryCtaHref: "/pricing", secondaryCtaLabel: "Examples", secondaryCtaHref: "/case-studies", icon: "share", bullets: ["Consistent posting", "Brand consistency", "Automation setup", "Basic analytics"] },
  { slug: "fix-and-optimize", name: "Fix & Optimize™", tagline: "Quick wins for website + GBP.", primaryCtaLabel: "Start", primaryCtaHref: "/request?service=FixOptimize", secondaryCtaLabel: "See Pricing", secondaryCtaHref: "/pricing", icon: "sparkle", bullets: ["Quick improvements", "Remove friction", "Higher trust", "Better conversion"] },
];
