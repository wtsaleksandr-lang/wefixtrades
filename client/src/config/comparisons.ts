/**
 * Comparison data for each product's "vs alternatives" page.
 *
 * Competitor pricing is sourced from public pricing pages (as of 2026).
 * WeFixTrades pricing is derived from shared/pricing.ts.
 */

export interface CompetitorColumn {
  name: string;
  price: string;
}

export interface ComparisonRow {
  feature: string;
  /** true = check, false = cross, string = label */
  values: (boolean | string)[];
}

export interface WhyBullet {
  title: string;
  body: string;
}

export interface ComparisonData {
  slug: string;
  productName: string;
  heroTitle: string;
  heroSubtitle: string;
  seoTitle: string;
  seoDescription: string;
  weFixTradesPrice: string;
  competitors: CompetitorColumn[];
  rows: ComparisonRow[];
  whyBullets: WhyBullet[];
  savingsHighlight: string;
  ctaLabel: string;
  ctaHref: string;
  productPageHref: string;
}

export const COMPARISON_DATA: ComparisonData[] = [
  /* ──────────────────────────────────────────
     1. TradeLine
     ────────────────────────────────────────── */
  {
    slug: "tradeline",
    productName: "TradeLine",
    heroTitle: "TradeLine vs the Alternatives",
    heroSubtitle:
      "AI-powered call and chat answering built for trades. See how TradeLine compares to traditional answering services.",
    seoTitle: "TradeLine vs Ruby, Smith.ai, AnswerConnect | WeFixTrades",
    seoDescription:
      "Compare TradeLine to Ruby Receptionists, Smith.ai, and AnswerConnect. AI-powered 24/7 answering at a fraction of the cost.",
    weFixTradesPrice: "From $97/mo",
    competitors: [
      { name: "Ruby Receptionists", price: "$349–$999/mo" },
      { name: "Smith.ai", price: "$140–$700/mo" },
      { name: "AnswerConnect", price: "$325+/mo" },
    ],
    rows: [
      { feature: "24/7 availability", values: [true, true, true, true] },
      { feature: "AI-powered (not human operators)", values: [true, false, false, false] },
      { feature: "Instant quote generation", values: [true, false, false, false] },
      { feature: "Missed-call text-back", values: [true, false, "Add-on", false] },
      { feature: "SMS & chat replies", values: [true, "Add-on", true, "Add-on"] },
      { feature: "Lead capture & dashboard", values: [true, true, true, true] },
      { feature: "Automated follow-ups", values: [true, false, false, false] },
      { feature: "Custom-trained per trade", values: [true, false, false, false] },
      { feature: "Review request automation", values: [true, false, false, false] },
      { feature: "No per-call fees", values: [true, false, false, false] },
      { feature: "Built for trades businesses", values: [true, false, false, false] },
      { feature: "No contracts", values: [true, true, true, false] },
      { feature: "Setup time", values: ["Minutes", "Days", "Days", "Days"] },
    ],
    whyBullets: [
      {
        title: "AI handles calls, not humans",
        body: "Traditional answering services employ human operators who take messages. TradeLine is an AI employee that quotes, books, and follows up — automatically.",
      },
      {
        title: "A fraction of the cost",
        body: "Ruby charges $349–$999/mo for human receptionists. TradeLine starts at $97/mo with AI that never sleeps, never calls in sick, and never puts customers on hold.",
      },
      {
        title: "Custom-trained for your trade",
        body: "TradeLine learns your services, pricing, and service area. It gives accurate estimates on the first call — not generic messages.",
      },
      {
        title: "Missed calls become booked jobs",
        body: "Every missed call triggers an automatic text-back. Automated follow-ups keep leads warm until they book.",
      },
    ],
    savingsHighlight: "Save $250+/mo compared to Ruby Receptionists",
    ctaLabel: "Try TradeLine Free",
    ctaHref: "/pricing",
    productPageHref: "/products/tradeline",
  },

  /* ──────────────────────────────────────────
     2. QuoteQuick Pro
     ────────────────────────────────────────── */
  {
    slug: "quotequick",
    productName: "QuoteQuick Pro",
    heroTitle: "QuoteQuick Pro vs the Alternatives",
    heroSubtitle:
      "Instant, AI-powered quote calculators that turn website visitors into leads. See how we compare to manual quoting tools.",
    seoTitle: "QuoteQuick Pro vs Jobber, ServiceTitan, Housecall Pro | WeFixTrades",
    seoDescription:
      "Compare QuoteQuick Pro to Jobber, ServiceTitan, and Housecall Pro. AI-powered instant quotes, embeddable widget, no manual work.",
    weFixTradesPrice: "From $49/mo",
    competitors: [
      { name: "Jobber", price: "$30–$100/mo" },
      { name: "ServiceTitan", price: "$200+/mo" },
      { name: "Housecall Pro", price: "$49–$109/mo" },
    ],
    rows: [
      { feature: "Instant quote on website", values: [true, false, false, false] },
      { feature: "AI-powered pricing engine", values: [true, false, false, false] },
      { feature: "Embeddable widget (any site)", values: [true, false, false, false] },
      { feature: "Lead capture with every quote", values: [true, "Manual", "Manual", "Manual"] },
      { feature: "10 pricing formula types", values: [true, false, false, false] },
      { feature: "Online booking integration", values: [true, true, true, true] },
      { feature: "SMS + email follow-ups", values: [true, "Add-on", true, true] },
      { feature: "No manual work needed", values: [true, false, false, false] },
      { feature: "Custom branding", values: [true, true, true, true] },
      { feature: "Works alongside existing tools", values: [true, "Full platform", "Full platform", "Full platform"] },
      { feature: "No long-term contract", values: [true, true, false, true] },
      { feature: "Setup time", values: ["5 minutes", "Hours", "Hours+", "Hours"] },
    ],
    whyBullets: [
      {
        title: "Instant quotes, not manual estimates",
        body: "Jobber and Housecall Pro require you to manually create quotes. QuoteQuick generates accurate estimates automatically on your website — 24/7.",
      },
      {
        title: "Embed anywhere, no platform switch",
        body: "QuoteQuick is a widget that works on any website. You do not need to switch your entire business to a new platform.",
      },
      {
        title: "AI-powered accuracy",
        body: "10 pricing formula types (fixed, hourly, area-based, tiered, and more) with AI validation to catch configuration errors before you go live.",
      },
      {
        title: "Every quote becomes a lead",
        body: "Every visitor who gets a price submits their contact details. Automated follow-ups keep them engaged until they book.",
      },
    ],
    savingsHighlight: "Save $150+/mo compared to ServiceTitan",
    ctaLabel: "Start Free — 14 Days, No Card",
    ctaHref: "/wizard",
    productPageHref: "/products/quickquotepro",
  },

  /* ──────────────────────────────────────────
     3. MapGuard
     ────────────────────────────────────────── */
  {
    slug: "mapguard",
    productName: "MapGuard",
    heroTitle: "MapGuard vs the Alternatives",
    heroSubtitle:
      "Fully managed Google Business Profile monitoring and optimization. Not a DIY tool — we do the work for you.",
    seoTitle: "MapGuard vs BrightLocal, Yext, Moz Local | WeFixTrades",
    seoDescription:
      "Compare MapGuard to BrightLocal, Yext, and Moz Local. Active monitoring, automated fixes, trades-specific, and cheaper.",
    weFixTradesPrice: "From $99/mo",
    competitors: [
      { name: "BrightLocal", price: "$39–$79/mo" },
      { name: "Yext", price: "$199+/mo" },
      { name: "Synup", price: "$34.99/mo" },
    ],
    rows: [
      { feature: "Done-for-you management", values: [true, false, false, false] },
      { feature: "Weekly visibility monitoring", values: [true, true, true, true] },
      { feature: "Automated issue detection & fixes", values: [true, false, "Partial", false] },
      { feature: "Google Business posts created for you", values: [true, false, false, false] },
      { feature: "Competitor tracking", values: [true, true, true, "Add-on"] },
      { feature: "Profile optimization work", values: [true, false, false, false] },
      { feature: "Review response management", values: ["Pro plan", false, false, false] },
      { feature: "Monthly performance reports", values: [true, true, true, true] },
      { feature: "Trades-specific optimization", values: [true, false, false, false] },
      { feature: "No annual contract required", values: [true, false, false, true] },
      { feature: "Setup", values: ["We handle it", "Self-serve", "Self-serve", "Self-serve"] },
    ],
    whyBullets: [
      {
        title: "We do the work, not just report on it",
        body: "BrightLocal and Moz give you dashboards and tell you what to fix. MapGuard fixes it for you — optimization work is executed every month.",
      },
      {
        title: "Built for trades, not enterprise",
        body: "Yext costs $199+/mo and is built for multi-location chains. MapGuard is built for local trades businesses at a price that makes sense.",
      },
      {
        title: "Active monitoring with automated fixes",
        body: "When your ranking drops or your profile has an issue, we detect it and fix it — you do not need to check dashboards or file tickets.",
      },
      {
        title: "Google Business posts included",
        body: "Most tools leave posting to you. MapGuard creates and publishes Google Business posts every month to keep your profile active.",
      },
    ],
    savingsHighlight: "Save $100+/mo compared to Yext",
    ctaLabel: "Get Started with MapGuard",
    ctaHref: "/wizard",
    productPageHref: "/products/mapguard",
  },

  /* ──────────────────────────────────────────
     4. ReputationShield
     ────────────────────────────────────────── */
  {
    slug: "reputationshield",
    productName: "ReputationShield",
    heroTitle: "ReputationShield vs the Alternatives",
    heroSubtitle:
      "Automated review requests, private feedback shield, and AI response drafting. At a fraction of the price.",
    seoTitle: "ReputationShield vs Birdeye, Podium, NiceJob | WeFixTrades",
    seoDescription:
      "Compare ReputationShield to Birdeye, Podium, and NiceJob. AI-powered responses, automated SMS requests, trades-focused, from $79/mo.",
    weFixTradesPrice: "From $79/mo",
    competitors: [
      { name: "Birdeye", price: "$299+/mo" },
      { name: "Podium", price: "$399+/mo" },
      { name: "NiceJob", price: "$75/mo" },
    ],
    rows: [
      { feature: "Automated review requests (SMS + email)", values: [true, true, true, true] },
      { feature: "Private feedback shield", values: [true, false, false, true] },
      { feature: "AI-drafted review responses", values: [true, "Add-on", "Add-on", false] },
      { feature: "Post responses to Google directly", values: ["Scale plan", true, true, false] },
      { feature: "QR code for field collection", values: [true, false, false, false] },
      { feature: "Review widget for website", values: [true, true, true, true] },
      { feature: "Google + Facebook monitoring", values: [true, true, true, true] },
      { feature: "Low-rating instant alerts", values: [true, true, true, false] },
      { feature: "Monthly reputation reports", values: [true, true, true, true] },
      { feature: "Competitor review tracking", values: ["Scale plan", true, true, false] },
      { feature: "Trades-specific templates", values: [true, false, false, "Home services"] },
      { feature: "No annual contract", values: [true, false, false, true] },
      { feature: "Transparent pricing (no sales call)", values: [true, false, false, true] },
    ],
    whyBullets: [
      {
        title: "Same features, fraction of the price",
        body: "Birdeye starts at $299/mo and Podium at $399/mo. ReputationShield starts at $79/mo — with AI response drafting, private feedback shield, and QR codes included.",
      },
      {
        title: "AI responses that sound human",
        body: "Every review gets a professional, personalized AI-drafted response. Edit if you want, then post directly to Google on the Scale plan.",
      },
      {
        title: "The Shield catches complaints privately",
        body: "Unhappy customers see a private feedback form — not the Google review page. You get the complaint. Google does not. Fix it before it goes public.",
      },
      {
        title: "Built specifically for trades",
        body: "Templates, tone, and automation flows are built for plumbers, electricians, roofers, and HVAC technicians — not generic businesses.",
      },
    ],
    savingsHighlight: "Save $220+/mo compared to Birdeye",
    ctaLabel: "Start Getting Reviews — Free Trial",
    ctaHref: "/wizard",
    productPageHref: "/products/reputationshield",
  },

  /* ──────────────────────────────────────────
     5. SocialSync
     ────────────────────────────────────────── */
  {
    slug: "socialsync",
    productName: "SocialSync",
    heroTitle: "SocialSync vs the Alternatives",
    heroSubtitle:
      "AI-generated social media posts, done for you. Not a scheduling tool — we create and publish the content.",
    seoTitle: "SocialSync vs Hootsuite, Buffer, Sprout Social | WeFixTrades",
    seoDescription:
      "Compare SocialSync to Hootsuite, Buffer, and Sprout Social. AI generates posts automatically, done-for-you, trades-specific content.",
    weFixTradesPrice: "From $99/mo",
    competitors: [
      { name: "Hootsuite", price: "$49–$249/mo" },
      { name: "Buffer", price: "$6–$120/mo" },
      { name: "Sprout Social", price: "$249+/mo" },
    ],
    rows: [
      { feature: "AI generates posts for you", values: [true, false, false, false] },
      { feature: "Done-for-you (no work required)", values: [true, false, false, false] },
      { feature: "Trades-specific content", values: [true, false, false, false] },
      { feature: "Facebook + Instagram + Google", values: [true, true, true, true] },
      { feature: "Auto-scheduling & publishing", values: [true, true, true, true] },
      { feature: "AI-generated images", values: ["Growth+", false, false, false] },
      { feature: "Content calendar", values: [true, true, true, true] },
      { feature: "Quality-checked before publishing", values: [true, false, false, false] },
      { feature: "Analytics & reporting", values: [true, true, true, true] },
      { feature: "No content creation needed from you", values: [true, false, false, false] },
      { feature: "No annual contract", values: [true, false, true, false] },
      { feature: "Setup time", values: ["5 minutes", "30+ minutes", "30+ minutes", "60+ minutes"] },
    ],
    whyBullets: [
      {
        title: "We create the content, not just schedule it",
        body: "Hootsuite, Buffer, and Sprout Social are scheduling tools — you still need to create every post. SocialSync generates trades-specific content automatically.",
      },
      {
        title: "Zero time investment",
        body: "Connect your accounts, tell us about your business, and posts start going out. You never need to write, design, or schedule anything.",
      },
      {
        title: "Trades-specific, not generic",
        body: "Every post is written for your trade, your services, and your local area. Not generic business tips — real content about what you do.",
      },
      {
        title: "Cheaper than hiring someone",
        body: "A social media manager costs $500–$2,000/mo. Sprout Social alone is $249/mo and still requires you to create content. SocialSync starts at $99/mo, fully done for you.",
      },
    ],
    savingsHighlight: "Save $150+/mo compared to Sprout Social (and you still need to create content with Sprout)",
    ctaLabel: "Start SocialSync",
    ctaHref: "/wizard",
    productPageHref: "/products/socialsync",
  },

  /* ──────────────────────────────────────────
     6. RankFlow
     ────────────────────────────────────────── */
  {
    slug: "rankflow",
    productName: "RankFlow",
    heroTitle: "RankFlow vs the Alternatives",
    heroSubtitle:
      "Done-for-you local SEO. Not a dashboard full of charts — actual optimization work executed for you every month.",
    seoTitle: "RankFlow vs Semrush, Ahrefs, SE Ranking, SEO Agencies | WeFixTrades",
    seoDescription:
      "Compare RankFlow to Semrush, Ahrefs, and SEO agencies. Done-for-you SEO, AI-powered content, trades-specific, from $349/mo.",
    weFixTradesPrice: "From $349/mo",
    competitors: [
      { name: "Semrush", price: "$129–$499/mo" },
      { name: "Ahrefs", price: "$99–$999/mo" },
      { name: "SEO Agency", price: "$500–$2,000/mo" },
    ],
    rows: [
      { feature: "Done-for-you (not DIY tool)", values: [true, false, false, true] },
      { feature: "Keyword research & targeting", values: [true, true, true, true] },
      { feature: "On-page optimization executed", values: [true, false, false, true] },
      { feature: "SEO page creation", values: ["Growth+", false, false, true] },
      { feature: "Local citation building", values: ["Growth+", false, false, "Some"] },
      { feature: "Schema markup implementation", values: [true, false, false, "Some"] },
      { feature: "AI-powered content creation", values: [true, false, false, false] },
      { feature: "Progress dashboard", values: [true, true, true, "Varies"] },
      { feature: "Trades-specific optimization", values: [true, false, false, "Varies"] },
      { feature: "No long-term contract", values: [true, true, true, false] },
      { feature: "No SEO knowledge required", values: [true, false, false, true] },
      { feature: "Setup", values: ["We handle it", "Self-serve", "Self-serve", "Agency handles"] },
    ],
    whyBullets: [
      {
        title: "We do the SEO work, not just give you tools",
        body: "Semrush and Ahrefs are powerful tools — but you need to know SEO to use them. RankFlow executes the work for you every month.",
      },
      {
        title: "Fraction of agency cost",
        body: "A typical SEO agency charges $500–$2,000/mo with long contracts. RankFlow starts at $349/mo with no contract and transparent reporting.",
      },
      {
        title: "AI-powered content creation",
        body: "RankFlow creates SEO-optimized service and location pages that target your services and area — content that ranks, not generic filler.",
      },
      {
        title: "Built for local trades businesses",
        body: "Our optimization playbook is built for plumbers, electricians, HVAC, and roofers — not generic e-commerce or enterprise SEO.",
      },
    ],
    savingsHighlight: "Save $150+/mo vs agencies — with transparent reporting and no contracts",
    ctaLabel: "Get Started with RankFlow",
    ctaHref: "/wizard",
    productPageHref: "/products/rankflow",
  },

  /* ──────────────────────────────────────────
     7. SiteLaunch
     ────────────────────────────────────────── */
  {
    slug: "sitelaunch",
    productName: "SiteLaunch",
    heroTitle: "SiteLaunch vs the Alternatives",
    heroSubtitle:
      "A professional trade website built for you in 5 days. One-time fee, no monthly retainer, you own everything.",
    seoTitle: "SiteLaunch vs Squarespace, Wix, Freelancers, Agencies | WeFixTrades",
    seoDescription:
      "Compare SiteLaunch to Squarespace, Wix, freelancers, and agencies. One-time fee, 5-day delivery, built for trades businesses.",
    weFixTradesPrice: "$1,197 one-time",
    competitors: [
      { name: "Squarespace", price: "$16–$49/mo" },
      { name: "Freelancer", price: "$1,000–$5,000" },
      { name: "Web Agency", price: "$3,000–$10,000" },
    ],
    rows: [
      { feature: "Built for trades businesses", values: [true, false, false, "Varies"] },
      { feature: "Professional custom design", values: [true, "Templates", "Varies", true] },
      { feature: "Mobile-first & speed-optimized", values: [true, "Basic", "Varies", true] },
      { feature: "SEO structure built in", values: [true, "Basic", "Varies", "Usually"] },
      { feature: "Lead capture forms included", values: [true, "Add-on", "Extra cost", true] },
      { feature: "QuoteQuick calculator integration", values: [true, false, false, false] },
      { feature: "5-day delivery", values: [true, "DIY", "2–8 weeks", "4–16 weeks"] },
      { feature: "You own the website", values: [true, false, true, true] },
      { feature: "No monthly platform fee", values: [true, false, true, true] },
      { feature: "No design skills needed", values: [true, false, true, true] },
      { feature: "Revision round included", values: [true, "DIY", "Usually 1–2", "Usually 2–3"] },
    ],
    whyBullets: [
      {
        title: "One job pays for it",
        body: "At $1,197, one extra plumbing call-out, one HVAC repair, or one electrical job covers the cost. No ongoing platform fees eating into your profit.",
      },
      {
        title: "Done in 5 days, not 5 months",
        body: "Agencies take 4–16 weeks and charge $3,000–$10,000. Freelancers take 2–8 weeks and quality varies. SiteLaunch is live in 5 business days.",
      },
      {
        title: "Built to convert, not just look pretty",
        body: "Every SiteLaunch site includes lead capture forms, QuoteQuick integration, and SEO structure. It is built to generate enquiries, not just sit there.",
      },
      {
        title: "You own everything",
        body: "Unlike Squarespace or Wix, you own your website, your design, and your content. No platform lock-in, no monthly fees to keep your site online.",
      },
    ],
    savingsHighlight: "Save $2,000+ vs a web agency — delivered in 5 days, not 5 months",
    ctaLabel: "Get Your Website Built",
    ctaHref: "/wizard",
    productPageHref: "/products/sitelaunch",
  },

  /* ──────────────────────────────────────────
     8. WebCare
     ────────────────────────────────────────── */
  {
    slug: "webcare",
    productName: "WebCare",
    heroTitle: "WebCare vs the Alternatives",
    heroSubtitle:
      "Website maintenance done for you. Updates, security checks, monitoring, and content changes — handled every month.",
    seoTitle: "WebCare vs WP Buffs, GoWP, Sucuri, Maintainn | WeFixTrades",
    seoDescription:
      "Compare WebCare to WP Buffs, GoWP, Sucuri, and Maintainn. AI-powered monitoring, automated updates, trades-specific, from $79/mo.",
    weFixTradesPrice: "From $79/mo",
    competitors: [
      { name: "WP Buffs", price: "$67–$197/mo" },
      { name: "GoWP", price: "$29–$79/mo" },
      { name: "Maintainn", price: "$49–$149/mo" },
    ],
    rows: [
      { feature: "Software & security updates", values: [true, true, true, true] },
      { feature: "24/7 uptime monitoring", values: [true, true, true, true] },
      { feature: "Security & SSL health checks", values: [true, true, true, true] },
      { feature: "Content changes included", values: [true, "Add-on", false, "1/mo"] },
      { feature: "AI-powered monitoring", values: [true, false, false, false] },
      { feature: "Performance checks", values: ["Pro", true, false, true] },
      { feature: "Trades-specific focus", values: [true, false, false, false] },
      { feature: "Business info updates (hours, phone, etc.)", values: [true, "Add-on", false, "Add-on"] },
      { feature: "Priority support", values: ["Pro", true, false, true] },
      { feature: "No annual contract", values: [true, true, true, true] },
      { feature: "Security-only option", values: [false, false, false, false] },
      { feature: "Setup", values: ["We handle it", "Self-serve", "Self-serve", "Self-serve"] },
    ],
    whyBullets: [
      {
        title: "Content changes included, not extra",
        body: "Most maintenance services charge extra for content updates. WebCare includes 1–4 content changes per month depending on your plan.",
      },
      {
        title: "Trades-specific expertise",
        body: "We understand trades websites — seasonal promotions, service area updates, pricing changes, team photos. We know what matters to your customers.",
      },
      {
        title: "AI-powered monitoring",
        body: "Our monitoring catches issues before they affect your customers. Broken forms, slow pages, and security vulnerabilities are detected and fixed proactively.",
      },
      {
        title: "Simple, transparent pricing",
        body: "No confusing tiers with dozens of features you do not need. Two straightforward plans — Basic and Pro — with clear pricing and no hidden fees.",
      },
    ],
    savingsHighlight: "Save $68+/mo compared to WP Buffs — with content changes included",
    ctaLabel: "Get Started with WebCare",
    ctaHref: "/wizard",
    productPageHref: "/products/webcare",
  },

  /* ──────────────────────────────────────────
     9. WebFix
     ────────────────────────────────────────── */
  {
    slug: "webfix",
    productName: "WebFix",
    heroTitle: "WebFix vs the Alternatives",
    heroSubtitle:
      "One-time website fixes — speed, SEO, mobile, and security. Flat rate, before-and-after report, done in days.",
    seoTitle: "WebFix vs Fiverr, Codeable, WP Fix It, Agencies | WeFixTrades",
    seoDescription:
      "Compare WebFix to Fiverr freelancers, Codeable developers, WP Fix It, and agencies. Flat rate, comprehensive fixes, before/after report.",
    weFixTradesPrice: "$249 one-time",
    competitors: [
      { name: "Fiverr Freelancer", price: "$50–$500" },
      { name: "Codeable", price: "$70–$120/hr" },
      { name: "WP Fix It", price: "$49–$149/fix" },
    ],
    rows: [
      { feature: "Comprehensive fix (speed + SEO + mobile + security)", values: [true, false, false, false] },
      { feature: "Page speed optimization", values: [true, "Varies", true, true] },
      { feature: "Mobile responsiveness fixes", values: [true, "Varies", true, "Add-on"] },
      { feature: "SEO structure fixes", values: [true, "Varies", "Varies", false] },
      { feature: "Security hardening", values: [true, "Varies", true, "Add-on"] },
      { feature: "Broken link & 404 cleanup", values: [true, false, "Varies", "Add-on"] },
      { feature: "Contact form troubleshooting", values: [true, false, "Varies", "Add-on"] },
      { feature: "Before/after verification report", values: [true, false, false, false] },
      { feature: "Flat rate (no hourly surprises)", values: [true, "Varies", false, true] },
      { feature: "Trades-specific expertise", values: [true, false, false, false] },
      { feature: "Delivery time", values: ["5 days", "Varies", "24–48 hrs", "24–48 hrs"] },
    ],
    whyBullets: [
      {
        title: "Everything in one fix, one price",
        body: "Fiverr and WP Fix It charge per issue. WebFix covers speed, SEO, mobile, security, broken links, and forms — all for $249.",
      },
      {
        title: "No hourly rate surprises",
        body: "Codeable charges $70–$120/hr with no cap. A complex fix could cost $500–$1,000+. WebFix is a flat $249 regardless of how many issues we find.",
      },
      {
        title: "Before-and-after proof",
        body: "Every WebFix job includes a verification report showing measurable improvements in speed, SEO, mobile, and security scores. Not just promises — proof.",
      },
      {
        title: "Trades website expertise",
        body: "We fix trades websites every day. We know the common issues — slow galleries, broken contact forms, missing schema markup, poor mobile layouts — and we fix them all.",
      },
    ],
    savingsHighlight: "Everything fixed for $249 — vs $500+ on Codeable or multiple Fiverr gigs",
    ctaLabel: "Fix My Website",
    ctaHref: "/wizard",
    productPageHref: "/products/webfix",
  },
];

export function getComparisonBySlug(slug: string): ComparisonData | undefined {
  return COMPARISON_DATA.find((c) => c.slug === slug);
}
