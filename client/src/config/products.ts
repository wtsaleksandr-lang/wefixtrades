import {
  TRADELINE, QUOTEQUICK, WEBBOOST, MAPGUARD, SITELAUNCH,
  REPUTATIONSHIELD, SOCIALSYNC,
  formatPrice, type ProductDef, type Tier,
} from "@shared/pricing";

/** Build a pricingSection from the canonical pricing data */
function buildPricingSection(product: ProductDef, note?: string) {
  return {
    plans: product.tiers.map((t: Tier) => ({
      name: t.name,
      price: formatPrice(t.price),
      period: t.billingPeriod === "monthly" ? "/mo" : " one-time",
      features: t.features,
      ...(t.badge ? { badge: t.badge } : {}),
      ...(t.highlighted ? { highlighted: true } : {}),
    })),
    note,
  };
}

export type ProductCategory = "core" | "ai" | "growth";

export type HeroVisualVariant = "calculator" | "chat" | "voice" | "dashboard" | "website" | "social" | "reviews";

export interface ProductPage {
  slug: string;
  name: string;
  shortTagline: string;
  seoTitle: string;
  seoDescription: string;
  category: ProductCategory;
  heroVisualType: HeroVisualVariant;
  primaryCTA: { label: string; href: string };
  secondaryCTA?: { label: string; href: string };
  highlights: string[];
  outcomes: { title: string; desc: string }[];
  howItWorks: { title: string; desc: string }[];
  bestFor: string[];
  visuals: { title: string; desc: string; image?: string }[];
  faq: { q: string; a: string }[];
  pricingSection: { plans: { name: string; price: string; period: string; features: string[]; badge?: string; highlighted?: boolean }[]; note?: string };
  related: string[];
}

export const PRODUCT_PAGES: ProductPage[] = [
  {
    slug: "tradeline",
    name: "24/7 TradeLine\u2122",
    shortTagline: "Always-On Lead Handling",
    seoTitle: "24/7 TradeLine\u2122 — Never Miss a Lead Again | WeFixTrades",
    seoDescription: "Your always-on lead handling system. TradeLine answers calls and chats 24/7, provides instant estimates, books jobs, sends follow-ups, and requests reviews — automatically.",
    category: "ai",
    heroVisualType: "chat",
    primaryCTA: { label: "Try Free for 14 Days", href: "/Wizard" },
    secondaryCTA: { label: "See It in Action", href: "/demo" },
    highlights: [
      "24/7 call and chat answering \u2014 AI picks up every call, day or night. No voicemail.",
      "Instant estimates \u2014 Quotes callers using your pricing formulas.",
      "Missed-call text-back \u2014 Texts the caller back automatically when you can\u2019t answer.",
      "After-hours intake \u2014 Captures enquiries while you sleep. Details in your dashboard by morning.",
      "Auto follow-ups \u2014 Confirmations, reminders, and nurture sequences. Leads don\u2019t go cold.",
      "Review requests \u2014 Asks customers for Google reviews after completed jobs.",
    ],
    outcomes: [
      { title: "Fewer missed calls", desc: "AI answers every call. Leads don\u2019t slip through." },
      { title: "Faster quoting", desc: "Instant estimates keep callers from shopping around." },
      { title: "More channels covered", desc: "Calls, texts, and chat handled in one system." },
      { title: "Stronger reviews", desc: "Automated requests help grow your online reputation." },
    ],
    howItWorks: [
      { title: "Configure your business", desc: "Add your services, pricing, service area, and hours. TradeLine learns how you operate." },
      { title: "Deploy on your site and phone", desc: "Add the chat widget to your website. Forward calls to your TradeLine number." },
      { title: "See every lead in one place", desc: "Calls, texts, and chats land in your dashboard with transcripts and follow-up status." },
    ],
    bestFor: ["Plumbers", "HVAC Technicians", "Electricians", "Roofers", "Cleaners", "Landscapers", "Painters", "General Contractors"],
    visuals: [
      { title: "Chat Widget", desc: "Branded chat bubble on your website, ready to engage visitors 24/7." },
      { title: "Call Dashboard", desc: "Every call transcript, lead detail, and booked appointment in one place." },
      { title: "Follow-up Automation", desc: "Configure automatic SMS, email, and review request sequences." },
    ],
    faq: [
      { q: "How does after-hours intake work?", a: "TradeLine stays on 24/7. When someone calls or chats outside your hours, it captures their details, gives an estimate if possible, and queues the lead for you." },
      { q: "Can it give accurate estimates?", a: "Yes. You configure your pricing formulas \u2014 flat rate, per-unit, tiered, hourly. TradeLine quotes using your actual numbers." },
      { q: "What if someone wants to speak to a real person?", a: "TradeLine can transfer the caller to you or your team. If you\u2019re unavailable, it takes a message and texts you." },
      { q: "What channels does it cover?", a: "Phone calls, SMS, and website chat. One dashboard shows everything." },
      { q: "How is this different from a regular answering service?", a: "Answering services take messages. TradeLine takes action \u2014 quotes, lead capture, follow-ups, and review requests. At a fraction of the cost." },
      { q: "How long does setup take?", a: "Most businesses are live in minutes. Add your services, pricing, and hours. Deploy the widget and forward your calls." },
      { q: "Can I cancel anytime?", a: "Yes. No contracts. No cancellation fees." },
    ],
    pricingSection: buildPricingSection(TRADELINE, "Overage: $0.15/min after included minutes."),
    related: ["quickquotepro", "reputationshield"],
  },
  {
    slug: "quickquotepro",
    name: "QuoteQuick Pro\u2122",
    shortTagline: "Customer Self-Quoting for Trades",
    seoTitle: "QuoteQuick Pro\u2122 \u2014 Instant Quote Calculator for Trades | WeFixTrades",
    seoDescription: "Stop losing leads to a contact form. Give customers instant prices on your website using your real service rates \u2014 and capture every lead automatically.",
    category: "core",
    heroVisualType: "calculator",
    primaryCTA: { label: "Start Free for 14 Days", href: "/Wizard" },
    secondaryCTA: { label: "See It in Action", href: "/demo" },
    highlights: [
      "Instant estimates, 24/7 \u2014 Customers get prices immediately \u2014 even when you\u2019re on a job.",
      "Your pricing logic \u2014 Flat-rate, per-unit, tiered, formulas \u2014 use the way you already price work.",
      "Lead capture built in \u2014 Every quote becomes a real lead with contact details.",
      "Embed anywhere \u2014 One script tag works on almost any website.",
      "Branded to your business \u2014 Your logo, colors, services, and tone.",
      "Update once \u2014 Change pricing in your dashboard and every embed updates.",
    ],
    outcomes: [
      { title: "More leads", desc: "Visitors stay on your site instead of leaving." },
      { title: "Faster conversions", desc: "People who get a price faster are less likely to shop around." },
      { title: "Higher ticket size", desc: "Optional add-ons and upgrades increase average job value." },
      { title: "Less manual quoting", desc: "You stop wasting time on basic quote requests." },
    ],
    howItWorks: [
      { title: "Add your services and pricing", desc: "Set your formulas, service options, and upsells." },
      { title: "Embed it on your site", desc: "Paste one line of code into your website." },
      { title: "Start capturing leads", desc: "Customers price the job themselves and you get the lead instantly." },
    ],
    bestFor: ["Plumbers", "HVAC Technicians", "Electricians", "Cleaners", "Landscapers", "Painters", "Contractors"],
    visuals: [
      { title: "Quote Widget", desc: "Branded calculator on your website. Customers estimate their job in seconds." },
      { title: "Lead Dashboard", desc: "Every estimate, lead detail, and follow-up status in one place." },
      { title: "Embed Options", desc: "Script tag, iframe, button, or hosted page \u2014 deploy however you want." },
    ],
    faq: [
      { q: "How accurate are the quotes?", a: "They\u2019re based on the pricing rules you configure. You set the formulas, service options, and rates. QuoteQuick calculates using your actual numbers." },
      { q: "Do I need coding skills?", a: "No. You configure everything through a visual wizard. Embedding is one line of code you paste into your site." },
      { q: "Can I customize the pricing logic?", a: "Fully. Flat rate, per-unit, area-based, tiered, time-based, package, formula-based, and more." },
      { q: "Will it work on my website?", a: "Yes. WordPress, Wix, Squarespace, Webflow, Shopify, or plain HTML. If your site supports a script tag, it works." },
      { q: "Can customers book after getting a quote?", a: "Yes. On supported plans, customers can book and pay a deposit directly after receiving their estimate." },
      { q: "What if I want to change pricing later?", a: "Update it once in your dashboard and it updates on every embedded widget automatically." },
    ],
    pricingSection: buildPricingSection(QUOTEQUICK),
    related: ["sitelaunch", "reputationshield"],
  },
  {
    slug: "mapguard",
    name: "MapGuard",
    shortTagline: "Google Business Profile Optimization",
    seoTitle: "MapGuard — Google Maps & GBP Optimization for Trades | WeFixTrades",
    seoDescription: "Get found by local customers on Google Maps. GBP optimization, citation building, review strategy, and local ranking monitoring for trades businesses.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Full Google Business Profile optimization",
      "Citation building and cleanup across 50+ directories",
      "Review generation strategy and templates",
      "Local ranking monitoring and competitor analysis",
      "Monthly performance reports",
    ],
    outcomes: [
      { title: "Rank in Map Pack", desc: "Appear in Google's local 3-pack where 46% of all searches have local intent." },
      { title: "More Reviews", desc: "Automated review requests increase your star rating and review count month over month." },
      { title: "Beat Competitors", desc: "Monitor competitor rankings and adjust strategy to stay ahead in your service area." },
    ],
    howItWorks: [
      { title: "Audit & Optimize", desc: "We audit your Google Business Profile and optimize every field for maximum visibility." },
      { title: "Build Citations", desc: "We create and clean up your business listings across 50+ local directories." },
      { title: "Monitor & Report", desc: "Monthly reports show ranking changes, review growth, and actionable next steps." },
    ],
    bestFor: ["Local service businesses", "Multi-location trades", "New businesses building visibility", "Trades in competitive markets"],
    visuals: [
      { title: "GBP Dashboard", desc: "See your Google Business Profile performance at a glance." },
      { title: "Ranking Tracker", desc: "Monitor your position in Google Maps for key search terms." },
      { title: "Citation Report", desc: "Track all your business listings across directories." },
    ],
    faq: [
      { q: "How long until I see results?", a: "Most clients see ranking improvements within 30-60 days. Citation building effects compound over 3-6 months." },
      { q: "Do you manage my Google reviews?", a: "We set up automated review request campaigns and provide response templates. You approve responses before they go live." },
      { q: "What if I have multiple locations?", a: "Each location gets its own optimized profile. Multi-location packages are available at a discount." },
    ],
    pricingSection: buildPricingSection(MAPGUARD, "Setup fee required for new clients."),
    related: ["webboost", "webcare", "reputationshield"],
  },
  {
    slug: "webboost",
    name: "WebBoost",
    shortTagline: "Website SEO & Speed Optimization",
    seoTitle: "WebBoost — Website SEO & Speed Optimization for Trades | WeFixTrades",
    seoDescription: "Rank higher on Google with fast-loading, optimized pages. Technical SEO audits, speed optimization, keyword targeting, and monthly performance reports.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Complete technical SEO audit and fixes",
      "Page speed optimization for Core Web Vitals",
      "Keyword research and on-page targeting",
      "Monthly ranking and traffic reports",
      "Schema markup for local business",
    ],
    outcomes: [
      { title: "Higher Rankings", desc: "Climb Google search results for the keywords your customers actually use." },
      { title: "Faster Website", desc: "A 1-second delay in page load reduces conversions by 7%. We make your site fast." },
      { title: "More Organic Traffic", desc: "Stop paying for every click. SEO brings free, compounding traffic month over month." },
    ],
    howItWorks: [
      { title: "SEO Audit", desc: "We crawl your entire site and identify technical issues, content gaps, and speed bottlenecks." },
      { title: "Optimize & Fix", desc: "We fix technical issues, optimize content, improve page speed, and add schema markup." },
      { title: "Track & Report", desc: "Monthly reports show keyword rankings, traffic growth, and speed improvements." },
    ],
    bestFor: ["Trades with a website", "Businesses relying on Google search", "Companies wanting organic growth", "Sites with slow load times"],
    visuals: [
      { title: "SEO Dashboard", desc: "Track keyword rankings, traffic, and Core Web Vitals scores." },
      { title: "Speed Report", desc: "Before and after page speed scores showing measurable improvement." },
      { title: "Ranking Progress", desc: "Monthly keyword position tracking across your target terms." },
    ],
    faq: [
      { q: "Do I need a website already?", a: "Yes. WebBoost optimizes an existing website. If you need a new site, check out SiteLaunch first." },
      { q: "How is this different from MapGuard?", a: "WebBoost focuses on your website's organic search rankings. MapGuard focuses on Google Maps/GBP visibility. They work best together." },
      { q: "Will I see ranking improvements?", a: "Most clients see measurable ranking improvements within 60-90 days. SEO is a long-term strategy that compounds." },
    ],
    pricingSection: buildPricingSection(WEBBOOST, "Setup fee required for new clients."),
    related: ["mapguard", "sitelaunch", "webcare"],
  },
  {
    slug: "webcare",
    name: "WebCare",
    shortTagline: "Website + GBP Maintenance",
    seoTitle: "WebCare — Website & Google Maps Maintenance for Trades | WeFixTrades",
    seoDescription: "Keep your website and Google Business Profile updated, secure, and performing. Monthly maintenance, content updates, uptime monitoring, and security patches.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Monthly website updates and content changes",
      "Security monitoring and patch management",
      "Google Maps profile maintenance",
      "Uptime monitoring with instant alerts",
      "2 content updates per month included",
    ],
    outcomes: [
      { title: "Always Current", desc: "Your website and Google profile stay accurate with current hours, services, and pricing." },
      { title: "Always Secure", desc: "Security patches and updates applied monthly. No vulnerable plugins or outdated software." },
      { title: "Always Online", desc: "24/7 uptime monitoring with instant alerts if your site goes down." },
    ],
    howItWorks: [
      { title: "Initial Audit", desc: "We review your website and Google profile for outdated info, security issues, and broken elements." },
      { title: "Monthly Maintenance", desc: "Every month we update content, apply security patches, and maintain your Google profile." },
      { title: "Monitoring & Support", desc: "24/7 uptime monitoring and priority support whenever you need changes." },
    ],
    bestFor: ["Businesses without a webmaster", "Trades wanting hands-off maintenance", "Sites built by someone else", "Multi-platform businesses"],
    visuals: [
      { title: "Maintenance Dashboard", desc: "See all updates, security patches, and content changes at a glance." },
      { title: "Uptime Monitor", desc: "Real-time uptime tracking with historical availability data." },
      { title: "Content Updates", desc: "Request and track content changes through a simple interface." },
    ],
    faq: [
      { q: "What counts as a content update?", a: "Text changes, image swaps, new service additions, price updates, or seasonal promotions. Each update is one change request." },
      { q: "Do you host my website?", a: "We maintain whatever hosting you're on. If you need hosting recommendations, we can help with that too." },
      { q: "Can I request urgent changes?", a: "Yes. Priority support means urgent requests are handled within 24 hours." },
    ],
    pricingSection: buildPricingSection(WEBBOOST, "Setup fee required for new clients."),
    related: ["webboost", "mapguard", "sitelaunch"],
  },
  {
    slug: "sitelaunch",
    name: "SiteLaunch",
    shortTagline: "Website Built From Scratch",
    seoTitle: "SiteLaunch — Professional Trade Website in 5 Days | WeFixTrades",
    seoDescription: "Get a professional, mobile-responsive trade website with your QuickQuote calculator built in. Custom design, SEO-ready, delivered in 5 business days.",
    category: "core",
    heroVisualType: "website",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Custom design tailored to your trade",
      "Mobile-responsive on all devices",
      "QuickQuote calculator built in",
      "SEO-ready structure from day one",
      "Delivered in 5 business days",
    ],
    outcomes: [
      { title: "Professional Presence", desc: "Look like an established business with a custom website — not a DIY template." },
      { title: "Ready to Convert", desc: "Your calculator, booking, and lead capture are built in from day one." },
      { title: "Fast Launch", desc: "Go from nothing to a live, professional website in just 5 business days." },
    ],
    howItWorks: [
      { title: "Discovery Call", desc: "We learn about your business, services, and design preferences in a 30-minute call." },
      { title: "Design & Build", desc: "Our team designs and builds your custom website with your branding and content." },
      { title: "Review & Launch", desc: "You review the site, request changes, and we launch it — all within 5 business days." },
    ],
    bestFor: ["New businesses", "Trades without a website", "Businesses with outdated sites", "Anyone wanting a professional upgrade"],
    visuals: [
      { title: "Custom Design", desc: "Unique design that reflects your brand — not a generic template." },
      { title: "Mobile View", desc: "Looks great on phones, tablets, and desktops." },
      { title: "Built-in Calculator", desc: "Your QuickQuote calculator integrated seamlessly into the design." },
    ],
    faq: [
      { q: "What do I need to provide?", a: "Your logo, photos of your work (if available), service descriptions, and contact info. We handle everything else." },
      { q: "Can I edit the site after launch?", a: "Yes. We build on platforms you can manage, or you can add WebCare for ongoing maintenance." },
      { q: "Is hosting included?", a: "We recommend hosting options and can set it up for you. Hosting costs are separate and typically $10-20/month." },
    ],
    pricingSection: buildPricingSection(SITELAUNCH, "Auto-converts to paid plans after 14-day trial."),
    related: ["quickquotepro", "webboost", "webcare"],
  },
  {
    slug: "socialsync",
    name: "SocialSync\u2122",
    shortTagline: "Done-For-You Social Media Posting",
    seoTitle: "SocialSync\u2122 \u2014 Social Media Posting for Trades | WeFixTrades",
    seoDescription: "Stay active online without doing it yourself. We create and post content across Facebook, Instagram, and Google \u2014 so you stay visible and trusted.",
    category: "growth",
    heroVisualType: "social",
    primaryCTA: { label: "Start SocialSync", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Stay visible online without thinking about it",
      "Build trust before customers call you",
      "Look active and professional every week",
      "Stay ahead of competitors who don\u2019t post",
      "Turn job photos into content",
      "Everything handled for you",
    ],
    outcomes: [
      { title: "More trust", desc: "Customers choose businesses that look active." },
      { title: "More calls", desc: "Visibility leads to more inbound work." },
      { title: "Better presence", desc: "Your business looks established and reliable." },
    ],
    howItWorks: [
      { title: "We learn your business", desc: "Tell us about your services and service area. We take it from there." },
      { title: "We create and post content", desc: "Professional posts go out across Facebook, Instagram, and Google every week." },
      { title: "You stay visible", desc: "Your business always looks active, trusted, and current \u2014 without you doing a thing." },
    ],
    bestFor: ["Plumbers", "HVAC Technicians", "Electricians", "Roofers", "Cleaners", "Landscapers", "Painters", "Contractors"],
    visuals: [
      { title: "Content Examples", desc: "Professional posts featuring your work, services, and brand." },
      { title: "Consistent Schedule", desc: "Posts go out every week across all your platforms." },
      { title: "Multi-Platform", desc: "Facebook, Instagram, and Google Business Profile \u2014 all covered." },
    ],
    faq: [
      { q: "Do I need to create content?", a: "No. We handle everything \u2014 writing, design, and posting. You just keep doing your work." },
      { q: "Where do you post?", a: "Facebook, Instagram, and Google Business Profile. All three are included." },
      { q: "Do I need to log into anything?", a: "No. We manage everything for you. No dashboards, no scheduling tools, no logins." },
      { q: "Can I send you photos from my jobs?", a: "Yes. Send us photos anytime and we\u2019ll turn them into professional posts." },
    ],
    pricingSection: buildPricingSection(SOCIALSYNC, "Ad spend for campaigns is billed separately."),
    related: ["reputationshield", "mapguard", "webboost"],
  },
  {
    slug: "reputationshield",
    name: "ReputationShield\u2122",
    shortTagline: "Done-For-You Review Management",
    seoTitle: "ReputationShield\u2122 \u2014 Get More 5-Star Reviews | WeFixTrades",
    seoDescription: "Get more 5-star reviews without lifting a finger. We send review requests, respond to every review, and build your reputation automatically.",
    category: "growth",
    heroVisualType: "reviews",
    primaryCTA: { label: "Start Getting More Reviews", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "More reviews \u2192 higher ranking on Google",
      "Higher rating \u2192 more customers choose you",
      "Faster growth without ads",
      "Stronger trust before the first call",
      "No time wasted chasing reviews",
      "Everything handled for you",
    ],
    outcomes: [
      { title: "More calls", desc: "People choose businesses with more reviews." },
      { title: "Higher conversion", desc: "Customers trust you before calling." },
      { title: "Better ranking", desc: "More reviews = stronger Google visibility." },
    ],
    howItWorks: [
      { title: "We start collecting reviews", desc: "Automatic requests go out after every job \u2014 SMS, email, or both." },
      { title: "We respond to every review", desc: "Positive or negative \u2014 every review gets a professional response from our team." },
      { title: "Your reputation grows", desc: "More reviews, better rating, stronger visibility. Month after month." },
    ],
    bestFor: ["Plumbers", "HVAC Technicians", "Electricians", "Roofers", "Cleaners", "Landscapers", "Painters", "Contractors"],
    visuals: [
      { title: "Review Growth", desc: "Watch your review count and rating improve month over month." },
      { title: "Response Management", desc: "Every review responded to professionally \u2014 by us, not a bot." },
      { title: "Reputation Dashboard", desc: "See your progress across Google, Facebook, and more." },
    ],
    faq: [
      { q: "Do I need to do anything?", a: "No. We handle everything \u2014 sending requests, responding to reviews, monitoring your reputation. You just keep doing great work." },
      { q: "Do you actually respond to reviews?", a: "Yes. Every single review \u2014 positive or negative \u2014 gets a professional, personalized response written and posted by our team." },
      { q: "Will this help me get more reviews?", a: "Yes. Consistent, well-timed requests after every job significantly increase the number of reviews you receive." },
      { q: "What if I get a bad review?", a: "We respond professionally and promptly. We also help identify patterns so you can address issues before they become public reviews." },
    ],
    pricingSection: buildPricingSection(REPUTATIONSHIELD, "Works with Google, Facebook, Yelp, and HomeStars."),
    related: ["mapguard", "socialsync", "tradeline"],
  },
];

export function getProductBySlug(slug: string): ProductPage | undefined {
  return PRODUCT_PAGES.find((p) => p.slug === slug);
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  core: "Core Tools",
  ai: "AI Employees",
  growth: "Growth Services",
};
