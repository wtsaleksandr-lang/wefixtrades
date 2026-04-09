import {
  TRADELINE, QUOTEQUICK, WEBCARE, MAPGUARD, SITELAUNCH,
  REPUTATIONSHIELD, SOCIALSYNC, RANKFLOW, ADFLOW, WEBFIX,
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
    related: ["rankflow", "webcare", "reputationshield"],
  },
  {
    slug: "webcare",
    name: "WebCare",
    shortTagline: "We handle your website. You handle your business.",
    seoTitle: "WebCare — Website Maintenance for Trades Businesses | WeFixTrades",
    seoDescription: "We keep your website updated, secure, and working — so you never have to think about it. Built for trades businesses. No contracts.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Your website stays updated and working — we handle it every month",
      "Security patches and backups applied automatically",
      "Your business info, hours, and services always stay current",
      "Small content changes handled for you — just send us a message",
      "24/7 uptime monitoring — if your site goes down, we know first",
    ],
    outcomes: [
      { title: "Fewer website problems", desc: "Updates, patches, and backups happen automatically. You don't get surprised by a broken site." },
      { title: "Better first impression", desc: "Customers always see a professional, working website with accurate info." },
      { title: "Fewer missed leads", desc: "Broken forms, outdated pages, and slow load times cost real enquiries. WebCare keeps everything running." },
      { title: "Less time wasted", desc: "No more chasing developers or trying to fix things yourself. We handle it." },
    ],
    howItWorks: [
      { title: "We review your site", desc: "We check your website for outdated info, broken elements, and security issues. No technical work on your end." },
      { title: "We take care of it every month", desc: "Updates, patches, backups, and content changes — handled. You get a simple summary of what we did." },
      { title: "You reach out when you need changes", desc: "New phone number? Updated hours? Seasonal promotion? Just message us and we'll take care of it." },
    ],
    bestFor: ["Plumbers", "Electricians", "HVAC Technicians", "Roofers", "Cleaners", "General Contractors", "Landscapers", "Painters"],
    visuals: [
      { title: "Maintenance Dashboard", desc: "See all updates, security patches, and content changes at a glance." },
      { title: "Uptime Monitor", desc: "Real-time uptime tracking with historical availability data." },
      { title: "Content Updates", desc: "Request and track content changes through a simple interface." },
    ],
    faq: [
      { q: "Do I need WordPress knowledge or anything technical?", a: "No. We handle everything. You don't need to log in, update anything, or learn any tools." },
      { q: "What happens if I want changes to my website?", a: "Just message us. Depending on your plan, you get 1\u20134 content changes per month included. Need more? We'll quote it." },
      { q: "Do I still own my website?", a: "Yes, 100%. Your site, your domain, your content. We maintain it for you \u2014 we don't own any of it." },
      { q: "What happens if I cancel?", a: "Your website stays yours. We hand everything over cleanly \u2014 no penalties, no lockout, no data held hostage." },
      { q: "Is this only for WordPress sites?", a: "WordPress is our primary focus, but we can maintain most website platforms. If you're not sure, just ask." },
      { q: "What kind of updates are included?", a: "Security patches, plugin and theme updates, content changes (text, images, hours, pricing), and performance checks." },
      { q: "How quickly do you respond to requests?", a: "Basic plan: within 2 business days. Pro plan: within 24 hours for priority requests." },
    ],
    pricingSection: buildPricingSection(WEBCARE, "No contracts. Cancel anytime."),
    related: ["rankflow", "mapguard", "sitelaunch"],
  },
  {
    slug: "sitelaunch",
    name: "SiteLaunch\u2122",
    shortTagline: "Professional Trade Website in 5 Days",
    seoTitle: "SiteLaunch\u2122 \u2014 Professional Trade Website in 5 Days | WeFixTrades",
    seoDescription: "Get a professional, mobile-first trade website with built-in lead capture \u2014 custom designed, SEO-ready, and live in 5 business days. You own it. No contracts.",
    category: "core",
    heroVisualType: "website",
    primaryCTA: { label: "Get Your Website Built", href: "/Wizard" },
    secondaryCTA: { label: "See What\u2019s Included", href: "#sitelaunch-included" },
    highlights: [
      "Mobile-first design \u2014 Most of your customers will find you on their phone. Your site works perfectly on every screen.",
      "Speed optimized \u2014 Fast-loading pages mean fewer visitors bouncing before they contact you.",
      "SEO-ready structure \u2014 Built so Google can find you. Proper headings, meta tags, and local SEO foundations.",
      "Lead capture built in \u2014 Contact forms plus optional QuoteQuick embed so visitors become real enquiries.",
      "Branded to your business \u2014 Your logo, your colors, your services. Not a cookie-cutter template.",
      "Delivered in 5 business days \u2014 Not 10 weeks. Not 16 weeks. Five business days from kickoff to live.",
    ],
    outcomes: [
      { title: "More calls and enquiries", desc: "A site built to convert visitors into leads \u2014 not just look pretty." },
      { title: "Stronger first impression", desc: "Customers check your website before they call. Look established from day one." },
      { title: "Higher conversion", desc: "Built-in lead capture and clear calls to action turn more visitors into paying jobs." },
      { title: "One job covers the cost", desc: "One extra plumbing call-out, one HVAC repair, one electrical job \u2014 and SiteLaunch has paid for itself." },
    ],
    howItWorks: [
      { title: "Tell us about your business", desc: "Share your services, service area, branding, and photos. Takes about 15 minutes." },
      { title: "We design and build it", desc: "Our team builds your custom website \u2014 mobile-first, SEO-ready, with lead capture baked in." },
      { title: "You go live in 5 days", desc: "Review it, request tweaks, and launch. No long agency timelines. No waiting months." },
    ],
    bestFor: ["Plumbers", "Electricians", "HVAC Technicians", "Roofers", "Cleaners", "Landscapers", "Painters", "General Contractors"],
    visuals: [
      { title: "Custom Design", desc: "Unique design that reflects your brand \u2014 not a generic template." },
      { title: "Mobile View", desc: "Looks great on phones, tablets, and desktops." },
      { title: "Built-in Lead Capture", desc: "Contact forms and optional QuoteQuick calculator integrated from day one." },
    ],
    faq: [
      { q: "Do I own the website?", a: "Yes. You own the website, the design, and the content. It\u2019s yours. If you ever leave, you take it with you." },
      { q: "How fast is delivery really?", a: "5 business days from the time we have your content and branding details. Most clients go live within a week of signing up." },
      { q: "What do I need to provide?", a: "Your logo, photos of your work (if available), service descriptions, service area, and contact info. We handle everything else." },
      { q: "Can I request changes after launch?", a: "Yes. We include a revision round before launch. After that, you can manage it yourself or add WebCare for ongoing updates." },
      { q: "Is SEO included?", a: "Yes. Every SiteLaunch site is built with SEO-ready structure \u2014 proper headings, meta tags, image optimization, and local SEO foundations. For ongoing SEO work, check out RankFlow." },
      { q: "What happens after launch?", a: "Your site is live and yours. You can manage it, or add our optional WebCare plan for ongoing maintenance, updates, and support." },
      { q: "Do I need hosting?", a: "Hosting is separate and typically costs $10\u201320/month. We\u2019ll recommend the best option and set it up for you." },
      { q: "Can I add QuoteQuick later?", a: "Yes. QuoteQuick can be added anytime \u2014 it\u2019s a standalone tool that embeds into any website. SiteLaunch sites come pre-wired for it." },
    ],
    pricingSection: buildPricingSection(SITELAUNCH, "One-time build fee. No contracts. No monthly retainers unless you want optional support."),
    related: ["quickquotepro", "rankflow", "webcare"],
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
    related: ["reputationshield", "mapguard", "rankflow"],
  },
  {
    slug: "reputationshield",
    name: "ReputationShield\u2122",
    shortTagline: "Done-For-You Review & Reputation Management",
    seoTitle: "ReputationShield\u2122 \u2014 Get More 5-Star Reviews | WeFixTrades",
    seoDescription: "Get more 5-star reviews without lifting a finger. Automated review requests, AI-powered responses, negative review alerts, and a reputation dashboard.",
    category: "reputation",
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
      { title: "AI-Powered Responses", desc: "Every review gets a professional, personalized response \u2014 posted automatically for positive reviews." },
      { title: "Your Reputation Dashboard", desc: "See your review count, rating trend, response rate, and request results in your client portal." },
    ],
    faq: [
      { q: "Do I need to do anything?", a: "No. Review requests go out automatically after completed jobs. Positive reviews get replied to instantly. Negative reviews are flagged and handled by our team." },
      { q: "How do you respond to reviews?", a: "AI generates personalized, professional responses matching your business tone. Positive reviews are replied to automatically. Negative reviews get a carefully drafted response reviewed before posting." },
      { q: "Will this help me get more reviews?", a: "Yes. Automated SMS and email requests after every job significantly increase the number of reviews you receive. We track which requests lead to reviews." },
      { q: "What if I get a bad review?", a: "You get an instant alert. We draft a calm, professional response. Risky reviews are escalated for human attention \u2014 never auto-replied." },
    ],
    pricingSection: buildPricingSection(REPUTATIONSHIELD, "Currently works with Google Business Profile. More platforms coming soon."),
    related: ["mapguard", "socialsync", "tradeline"],
  },
  {
    slug: "rankflow",
    name: "RankFlow\u2122",
    shortTagline: "Ongoing SEO for Trades",
    seoTitle: "RankFlow\u2122 — SEO That Brings Consistent Leads | WeFixTrades",
    seoDescription: "Ongoing SEO built for trades businesses. Keyword targeting, content creation, and monthly ranking reports that bring consistent traffic and leads.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "Start Growing Organically", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Keyword research targeting your services and service area",
      "On-page SEO optimization for every key page",
      "Content creation that ranks for what customers search",
      "Google Search Console monitoring and fixes",
      "Monthly ranking reports with clear progress tracking",
    ],
    outcomes: [
      { title: "More organic traffic", desc: "Rank higher for the searches your customers are making." },
      { title: "Consistent leads", desc: "SEO builds a steady pipeline that doesn\u2019t depend on ads." },
      { title: "Lower cost per lead", desc: "Organic traffic costs nothing per click \u2014 the value compounds." },
    ],
    howItWorks: [
      { title: "We audit your site", desc: "Find what\u2019s holding you back and where the biggest opportunities are." },
      { title: "We optimize and build", desc: "Fix technical issues, optimize pages, and create content that ranks." },
      { title: "You see the results", desc: "Monthly reports show ranking improvements and traffic growth." },
    ],
    bestFor: ["Plumbers", "HVAC", "Electricians", "Roofers", "Cleaners", "Landscapers", "Contractors"],
    visuals: [
      { title: "Ranking Dashboard", desc: "Track your keyword positions and organic traffic growth." },
      { title: "Content Calendar", desc: "See upcoming content planned to boost your rankings." },
      { title: "Competitor Analysis", desc: "Know where you stand vs. competitors in your area." },
    ],
    faq: [
      { q: "How long until I see results?", a: "Most clients see ranking improvements within 60\u201390 days. SEO is a long-term strategy \u2014 results compound over time." },
      { q: "Do you write the content?", a: "Yes. On Growth and Pro plans, we create SEO-optimized pages targeting your services and service area." },
      { q: "Will this work for my area?", a: "Yes. We focus on local SEO so you rank for searches in your specific service area." },
      { q: "Can I see what you\u2019re doing?", a: "Absolutely. You get monthly reports showing rankings, traffic, and exactly what work was done." },
    ],
    pricingSection: buildPricingSection(RANKFLOW),
    related: ["mapguard", "rankflow", "adflow"],
  },
  {
    slug: "adflow",
    name: "AdFlow\u2122",
    shortTagline: "Done-for-You Ads",
    seoTitle: "AdFlow\u2122 — Ads That Bring Leads Fast | WeFixTrades",
    seoDescription: "Done-for-you Google and Facebook ads built for trades businesses. We handle everything \u2014 setup, targeting, optimization, and reporting.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "Start Getting Leads", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Google Ads campaigns targeting homeowners who need your services",
      "Facebook & Instagram ads to reach local customers",
      "Ad copy and creative designed for trades",
      "Budget optimization so every dollar works harder",
      "Clear reporting on leads, cost per lead, and ROI",
    ],
    outcomes: [
      { title: "Leads fast", desc: "Start getting calls and form submissions within days, not months." },
      { title: "Targeted reach", desc: "Your ads show to homeowners actively searching for your services." },
      { title: "Clear ROI", desc: "Know exactly how much you\u2019re spending and what you\u2019re getting back." },
    ],
    howItWorks: [
      { title: "We set up your campaigns", desc: "Research, targeting, ad copy, and landing page optimization \u2014 all handled." },
      { title: "We optimize daily", desc: "We monitor and adjust bids, targeting, and creative to maximize leads." },
      { title: "You get the leads", desc: "Calls, form submissions, and booking requests come directly to you." },
    ],
    bestFor: ["Plumbers", "HVAC", "Electricians", "Roofers", "Cleaners", "Landscapers", "Contractors"],
    visuals: [
      { title: "Campaign Dashboard", desc: "See your active campaigns, spend, and lead count at a glance." },
      { title: "Lead Tracking", desc: "Every call and form submission tracked back to your ads." },
      { title: "Performance Reports", desc: "Weekly and monthly reports showing ROI and optimization opportunities." },
    ],
    faq: [
      { q: "Do I need to manage anything?", a: "No. We handle everything \u2014 setup, optimization, and reporting. You just answer the leads." },
      { q: "How much should I budget for ads?", a: "We recommend starting with $500\u2013$1,500/month in ad spend (separate from management fee). We\u2019ll help you find the right budget." },
      { q: "How fast will I see results?", a: "Most clients see leads within the first week. We optimize continuously to improve results." },
      { q: "Which platforms do you use?", a: "Google Ads on all plans. Growth adds Facebook, and Pro adds Instagram and video ads." },
    ],
    pricingSection: buildPricingSection(ADFLOW),
    related: ["rankflow", "tradeline", "quotequick"],
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
