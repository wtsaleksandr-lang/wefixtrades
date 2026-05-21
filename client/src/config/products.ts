import {
  TRADELINE, QUOTEQUICK, WEBCARE, MAPGUARD, SITELAUNCH,
  REPUTATIONSHIELD, SOCIALSYNC, RANKFLOW, WEBFIX, ADFLOW, CONTENTFLOW,
  formatPrice, type ProductDef, type Tier,
} from "@shared/pricing";

/**
 * Build a pricingSection from the canonical pricing data.
 *
 * `opts.checkout` opts a product into per-tier checkout: each tier
 * card's button opens CheckoutIntakeModal pre-loaded with that tier's
 * SKU instead of the generic primaryCTA link. The tier SKU (`t.id`,
 * e.g. "reputationshield-pro") is always attached so this can be
 * flipped on per product without further config changes.
 */
function buildPricingSection(
  product: ProductDef,
  note?: string,
  opts?: { checkout?: boolean },
) {
  return {
    plans: product.tiers.map((t: Tier) => ({
      sku: t.id,
      name: t.name,
      price: formatPrice(t.price),
      period: t.billingPeriod === "monthly" ? "/mo" : " one-time",
      features: t.features,
      ...(t.badge ? { badge: t.badge } : {}),
      ...(t.highlighted ? { highlighted: true } : {}),
    })),
    note,
    ...(opts?.checkout ? { checkoutEnabled: true } : {}),
  };
}

export type ProductCategory = "core" | "ai" | "growth" | "reputation";

export type HeroVisualVariant = "calculator" | "chat" | "voice" | "dashboard" | "website" | "social" | "reviews";

export interface ProductPage {
  slug: string;
  name: string;
  shortTagline: string;
  seoTitle: string;
  seoDescription: string;
  category: ProductCategory;
  heroVisualType: HeroVisualVariant;
  /**
   * Wave W-AN-2 — when true, the product is rendered with a "Coming
   * Soon" banner + waitlist form instead of normal CTAs and pricing
   * buttons. Used for products blocked on platform approvals
   * (SocialSync, ReputationShield, MapGuard) that can't ship at the
   * 2026-07-15 launch. SEO indexing is unaffected.
   */
  comingSoon?: boolean;
  primaryCTA: { label: string; href: string };
  secondaryCTA?: { label: string; href: string };
  highlights: string[];
  outcomes: { title: string; desc: string }[];
  howItWorks: { title: string; desc: string }[];
  bestFor: string[];
  visuals: { title: string; desc: string; image?: string }[];
  faq: { q: string; a: string }[];
  pricingSection: { plans: { sku?: string; name: string; price: string; period: string; features: string[]; badge?: string; highlighted?: boolean }[]; note?: string; checkoutEnabled?: boolean };
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
    primaryCTA: { label: "Get Started", href: "/pricing" },
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
    pricingSection: buildPricingSection(TRADELINE, "Overage: $0.15/min after included minutes.", { checkout: true }),
    related: ["quickquotepro", "reputationshield"],
  },
  {
    // P3 fix (2026-05-20): brand-name unification. The product shipped with
    // three different names showing in the wild \u2014 "QuoteQuick" (wizard
    // wordmark), "QUOTEQUICK PRO" (product page kicker, from this `name`),
    // and `quickquotepro` (URL slug + id). Canonical name is now
    // **QuoteQuick** (drops the Pro suffix and the trademark, matches the
    // wizard wordmark and the broader site copy). The URL slug stays
    // `quickquotepro` intentionally \u2014 changing it breaks SEO and existing
    // inbound links. So user-visible everything-says-QuoteQuick + URL
    // unchanged.
    slug: "quickquotepro",
    name: "QuoteQuick",
    shortTagline: "Instant quotes on your website. Qualified leads in your inbox.",
    seoTitle: "QuoteQuick \u2014 Instant Quote Calculator for Trades | WeFixTrades",
    seoDescription: "Your customers get instant prices on your website. You get qualified leads with every quote. Live in 5 minutes. No platform switch. Free for 14 days.",
    category: "core",
    heroVisualType: "calculator",
    primaryCTA: { label: "Start Free \u2014 14 Days, No Card", href: "/Wizard" },
    secondaryCTA: { label: "Try a Live Demo", href: "/tools/quote-demo" },
    highlights: [
      "Customers get instant prices, 24/7 \u2014 even when you\u2019re on a job site.",
      "Every quote becomes a lead \u2014 name, email, phone captured automatically.",
      "Live in 5 minutes \u2014 pick your trade, set your rates, embed one line of code.",
      "Works with your current tools \u2014 no platform switch required. Works alongside Jobber, HCP, or anything else.",
      "Booking + follow-up included \u2014 customers can book and you get automated email/SMS follow-ups. No add-on fees.",
      "Update once, everywhere \u2014 change pricing in your dashboard and every embed updates instantly.",
    ],
    outcomes: [
      { title: "More leads from your website", desc: "Visitors who get a price are 3\u00d7 more likely to submit their details than those who see a contact form." },
      { title: "Faster conversions", desc: "Instant pricing keeps customers on your site instead of calling your competitors." },
      { title: "Higher average job value", desc: "Add-ons and package tiers increase upsell without any extra effort." },
      { title: "Less time on basic quotes", desc: "Stop answering \u2018how much?\u2019 calls. Let the widget handle the first conversation." },
    ],
    howItWorks: [
      { title: "Pick your trade, set your rates", desc: "Choose from 10 pricing models. Our AI helps configure your rates in minutes." },
      { title: "Embed on your website", desc: "Paste one line of code. Works on WordPress, Wix, Squarespace, Shopify, or any site." },
      { title: "Leads start coming in", desc: "Every quote captures contact details and triggers instant email/SMS notifications." },
    ],
    bestFor: ["Plumbers", "HVAC Technicians", "Electricians", "Cleaners", "Landscapers", "Painters", "Roofers", "Contractors"],
    visuals: [
      { title: "Quote Widget", desc: "A branded calculator on your website. Customers estimate their job in seconds." },
      { title: "Lead Dashboard", desc: "Every quote, lead detail, and follow-up status in one place." },
      { title: "Embed Options", desc: "Inline widget, popup button, or hosted page \u2014 deploy however you want." },
    ],
    faq: [
      { q: "How accurate are the quotes?", a: "They use the pricing rules you set \u2014 your rates, your formulas, your add-ons. QuoteQuick calculates using your actual numbers." },
      { q: "Do I need coding skills?", a: "No. Everything is configured through a visual wizard. Embedding is one line of code you paste into your site." },
      { q: "Will it work on my website?", a: "Yes. WordPress, Wix, Squarespace, Webflow, Shopify, or plain HTML. If your site supports a script tag, it works." },
      { q: "I already use Jobber / Housecall Pro. Do I need to switch?", a: "No. QuoteQuick works alongside whatever you already use. Leads come to your email and dashboard \u2014 no platform switch needed." },
      { q: "Is booking included?", a: "Yes, on the Pro plan. Customers can book an appointment and pay a deposit directly after receiving their estimate." },
      { q: "Can I try it before paying?", a: "Yes. 14-day free trial, no credit card required. Build your calculator and see it work before you commit." },
    ],
    pricingSection: buildPricingSection(QUOTEQUICK, "14-day free trial. No credit card required."),
    related: ["tradeline", "sitelaunch"],
  },
  {
    slug: "mapguard",
    name: "MapGuard",
    shortTagline: "Fully Managed Google Maps Visibility",
    seoTitle: "MapGuard — Managed Google Maps Visibility Service for Trades | WeFixTrades",
    seoDescription: "We manage your Google Maps presence for you. Profile optimization, weekly monitoring, issue fixing, and monthly reporting for trades businesses.",
    category: "growth",
    heroVisualType: "dashboard",
    // W-AN-2 — blocked on GBP API verification + 60-day GBP account-age window.
    comingSoon: true,
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Full Google Business Profile optimization and rebuild",
      "Weekly visibility monitoring with automatic issue detection",
      "Ongoing optimization work executed for you every month",
      "Competitor tracking and ranking adjustments",
      "Monthly performance reports showing real progress",
    ],
    outcomes: [
      { title: "Rank in Map Pack", desc: "We optimize your profile so you appear in Google's local results where customers are searching." },
      { title: "Issues Fixed For You", desc: "Ranking drops, profile problems, and review issues are handled by our team — not just flagged." },
      { title: "Stay Ahead of Competitors", desc: "We track competitors in your area and adjust your strategy to maintain your position." },
    ],
    howItWorks: [
      { title: "We Audit & Rebuild", desc: "We run a full audit of your Google Business Profile and optimize every field for maximum visibility." },
      { title: "We Monitor Weekly", desc: "Our system scans your rankings, competitors, and profile accuracy every week." },
      { title: "We Fix & Improve", desc: "Our team executes optimization work every month — you receive a report showing what changed." },
    ],
    bestFor: ["Local service businesses", "Multi-location trades", "Trades in competitive areas", "Businesses that want hands-off Google management"],
    visuals: [
      { title: "Visibility Dashboard", desc: "See your Google Maps performance and score at a glance." },
      { title: "Ranking Tracker", desc: "Monitor your position in Google Maps for key search terms." },
      { title: "Monthly Report", desc: "Clear reports showing score changes, improvements, and next steps." },
    ],
    faq: [
      { q: "How long until I see results?", a: "Most clients see measurable improvement within 30-60 days. Each month builds on the last as our optimization work compounds." },
      { q: "Do I need to do anything?", a: "No. We handle everything — setup, optimization, monitoring, and reporting. You just receive your monthly progress report." },
      { q: "What's the difference between plans?", a: "Higher plans include more optimization work each month, which means faster improvements. Pro also adds review management and competitor tracking." },
    ],
    pricingSection: buildPricingSection(MAPGUARD, "Setup fee required for new clients."),
    related: ["rankflow", "webcare", "reputationshield"],
  },
  {
    slug: "webcare",
    name: "WebCare",
    shortTagline: "We handle your website. You handle your business.",
    seoTitle: "WebCare — Website Maintenance for Trades Businesses | WeFixTrades",
    seoDescription: "Automated website health monitoring, uptime checks, security scanning, and CMS patch management. Built for trades businesses. No contracts.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Your website stays updated and working — we handle it every month",
      "Security patches and SSL health checks applied automatically",
      "Your business info, hours, and services always stay current",
      "Small content changes handled for you — just send us a message",
      "24/7 uptime monitoring — if your site goes down, we know first",
    ],
    outcomes: [
      { title: "Fewer website problems", desc: "Updates, patches, and security checks happen automatically. You don't get surprised by a broken site." },
      { title: "Better first impression", desc: "Customers always see a professional, working website with accurate info." },
      { title: "Fewer missed leads", desc: "Broken forms, outdated pages, and slow load times cost real enquiries. WebCare keeps everything running." },
      { title: "Less time wasted", desc: "No more chasing developers or trying to fix things yourself. We handle it." },
    ],
    howItWorks: [
      { title: "We review your site", desc: "We check your website for outdated info, broken elements, and security issues. No technical work on your end." },
      { title: "We take care of it every month", desc: "Updates, patches, security checks, and content changes — handled. You get a simple summary of what we did." },
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
    primaryCTA: { label: "Get Your Website Built", href: "#pricing" },
    secondaryCTA: { label: "See What\u2019s Included", href: "#pricing" },
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
    pricingSection: buildPricingSection(SITELAUNCH, "One-time build fee. No contracts. No monthly retainers unless you want optional support.", { checkout: true }),
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
    // W-AN-2 \u2014 blocked on Meta App Review.
    comingSoon: true,
    primaryCTA: { label: "Start SocialSync", href: "/Wizard" },
    secondaryCTA: { label: "Try Free Demo", href: "/demos/socialsync" },
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
      { q: "Do I need to write anything?", a: "No. AI generates all content based on your trade, services, and location. Every post is quality-checked before publishing." },
      { q: "Where do you post?", a: "Facebook, Instagram, and Google Business Profile. Posts are formatted specifically for each platform." },
      { q: "Do you reply to comments or DMs?", a: "No. SocialSync handles posting only \u2014 not messaging or comment management. This keeps your accounts safe." },
      { q: "Can I edit posts before they go live?", a: "Your admin team can review, edit, or reject any post before it publishes. Autopilot mode handles everything automatically." },
      { q: "How long does setup take?", a: "About 5 minutes. Connect your accounts, tell us about your business, and we start generating content." },
      { q: "What platforms are supported?", a: "Facebook, Instagram, and Google Business Profile. LinkedIn support is planned for the future." },
    ],
    pricingSection: buildPricingSection(SOCIALSYNC, "No contracts. Cancel anytime. Posts start within 24 hours of setup."),
    related: ["reputationshield", "mapguard", "rankflow"],
  },
  {
    slug: "reputationshield",
    name: "ReputationShield\u2122",
    shortTagline: "Automated Review Growth + Reputation Protection",
    seoTitle: "ReputationShield\u2122 \u2014 Turn Completed Jobs Into 5-Star Reviews | WeFixTrades",
    seoDescription: "Automated review requests, private feedback shield, AI responses, and Google posting. Built for plumbers, electricians, and trades businesses. From $79/mo.",
    category: "reputation",
    heroVisualType: "reviews",
    // W-AN-2 \u2014 blocked on Meta App Review (for Facebook review pull/response).
    comingSoon: true,
    primaryCTA: { label: "Start Getting Reviews \u2014 Free Trial", href: "/Wizard" },
    secondaryCTA: { label: "Try Free Demo", href: "/demos/reputationshield" },
    highlights: [
      "Customers get a friendly SMS or email after every job \u2014 automatically",
      "Unhappy customers tell you privately instead of posting a 1-star review",
      "Your best reviews show up on your website with our review widget",
      "AI drafts professional responses you can post to Google in one click",
      "Monthly reports prove your reputation is growing \u2014 delivered to your inbox",
      "QR codes let techs collect reviews in person, right after the job",
    ],
    outcomes: [
      { title: "More 5-star reviews, automatically", desc: "Every completed job triggers a friendly SMS or email. Smart reminders follow up. QR codes let techs collect reviews on-site. No awkward asking." },
      { title: "Fewer public complaints", desc: "Unhappy customers see a private feedback form \u2014 not the Google review page. You get the complaint. Google doesn\u2019t. You fix it before it goes public." },
      { title: "Respond faster than your competitors", desc: "AI drafts professional replies in seconds. Edit if you want, then post directly to Google. Low-rating alerts notify you instantly so you can respond the same day." },
    ],
    howItWorks: [
      { title: "You finish a job", desc: "Your customer gets a friendly text asking about their experience. No awkward conversations. It just happens." },
      { title: "The shield decides", desc: "Happy? They go straight to Google or Facebook to leave a review. Unhappy? They tell you privately first \u2014 not the internet." },
      { title: "Your reputation grows", desc: "More reviews. Better responses. Monthly reports in your inbox. A widget on your website showing your best reviews to every visitor." },
    ],
    bestFor: ["Plumbers", "HVAC Technicians", "Electricians", "Roofers", "Cleaners", "Landscapers", "Painters", "General Contractors"],
    visuals: [
      { title: "The Shield in Action", desc: "When a customer is unhappy, they see a private feedback form \u2014 not the Google review page. You get the complaint. Google doesn\u2019t." },
      { title: "AI Response Drafts", desc: "Click \u201cDraft Response\u201d and get a professional, human-sounding reply in seconds. Edit it, then post it directly to Google." },
      { title: "Your Reputation Dashboard", desc: "Total reviews, average rating, new this month, reviews needing replies, private feedback captured \u2014 all in one place." },
    ],
    faq: [
      { q: "Do I need to do anything after setup?", a: "Almost nothing. Review requests go out automatically after every job. You can also send them manually or hand customers a QR code. AI drafts responses for you. Reports arrive in your inbox." },
      { q: "What is the \u201cshield\u201d?", a: "When a customer has a bad experience, they see a private feedback form instead of being sent to Google. You get the complaint and a chance to make it right \u2014 before it becomes a public 1-star review." },
      { q: "How do review requests get sent?", a: "By SMS or email, automatically after each completed job. SMS is the default because it gets 3\u20135x more responses. You can also generate QR codes for in-person collection." },
      { q: "How do you respond to reviews?", a: "AI generates personalized, professional responses matching your business tone. Positive reviews are replied to automatically. Negative reviews get a carefully drafted response reviewed before posting." },
      { q: "Can I respond to reviews from here?", a: "Yes. AI drafts a professional response based on the review text and your business type. On the Pro plan you can edit and copy it. On Premium, you can post it directly to Google with one click." },
      { q: "Will this help me get more reviews?", a: "Yes. Automated SMS and email requests after every job significantly increase the number of reviews you receive. We track which requests lead to reviews." },
      { q: "What if I get a bad review anyway?", a: "You\u2019ll get an instant email alert. AI drafts a calm, professional response. You can post it quickly \u2014 fast responses show future customers you care." },
      { q: "How is this different from Podium or NiceJob?", a: "ReputationShield is built specifically for trades businesses, costs a fraction of Podium ($399+/mo), and includes AI response drafting that NiceJob doesn\u2019t offer. No contracts, no sales calls, transparent pricing." },
    ],
    pricingSection: buildPricingSection(REPUTATIONSHIELD, "Works with Google and Facebook. No contracts. Cancel anytime.", { checkout: true }),
    related: ["mapguard", "socialsync", "tradeline"],
  },
  {
    slug: "rankflow",
    name: "RankFlow\u2122",
    shortTagline: "Done-for-You Local SEO",
    seoTitle: "RankFlow\u2122 — Done-for-You Local SEO for Trades | WeFixTrades",
    seoDescription: "Done-for-you local SEO for trades businesses. We handle keyword targeting, page optimization, local listings, and monthly progress reporting so you can focus on jobs.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "Try Free SEO Check", href: "/demos/rankflow" },
    highlights: [
      "Keyword research targeting your services and service area",
      "On-page optimization \u2014 titles, descriptions, and page structure",
      "SEO page creation for your services and locations (Growth+)",
      "Local citation and directory building to strengthen visibility",
      "Monthly progress dashboard so you always know what was done",
    ],
    outcomes: [
      { title: "Better local visibility", desc: "Show up when customers in your area search for your services." },
      { title: "Steady organic growth", desc: "SEO improvements compound \u2014 each month builds on the last." },
      { title: "Zero guesswork", desc: "Your dashboard shows exactly what was done and what\u2019s coming next." },
    ],
    howItWorks: [
      { title: "We set up your profile", desc: "Tell us your services, service area, and website \u2014 we handle the rest." },
      { title: "We work every month", desc: "Each month we optimize pages, build listings, and improve your local SEO." },
      { title: "You track progress", desc: "Your dashboard shows completed work, tasks in progress, and what\u2019s next." },
    ],
    bestFor: ["Plumbers", "HVAC", "Electricians", "Roofers", "Cleaners", "Landscapers", "Contractors"],
    visuals: [
      { title: "Progress Dashboard", desc: "See completed work, tasks in progress, and monthly SEO improvements." },
      { title: "Work Breakdown", desc: "Clear visibility into pages created, listings built, and optimizations made." },
      { title: "Monthly Reports", desc: "Simple progress reports delivered to your dashboard every month." },
    ],
    faq: [
      { q: "Is this a done-for-you service?", a: "Yes. We handle all the SEO work \u2014 you don\u2019t need to know SEO or do anything technical. Just give us access and we\u2019ll take care of it." },
      { q: "What kind of work do you do each month?", a: "Depending on your plan: keyword targeting, title and meta optimization, SEO page creation, local citation building, internal linking, and schema markup improvements." },
      { q: "Do I need to know SEO?", a: "Not at all. That\u2019s why RankFlow exists. We do the work, you see the results in your dashboard." },
      { q: "Do you guarantee rankings?", a: "No honest SEO provider can guarantee specific rankings. What we guarantee is consistent, trackable work every month that improves your local visibility over time." },
      { q: "How long until I see results?", a: "Most clients see measurable improvements within 60\u201390 days. SEO is a long-term strategy \u2014 each month builds on the last." },
      { q: "Do you build backlinks?", a: "We build local citations and directory listings which create quality local links. On Growth and Pro plans, we also expand your local directory presence." },
      { q: "Do I get a dashboard?", a: "Yes. Every client gets a dashboard showing completed work, in-progress tasks, and monthly progress metrics." },
      { q: "Do I need to give website access?", a: "For the best results, yes. We need CMS access to implement optimizations. If that\u2019s not possible, we\u2019ll work with what\u2019s available." },
      { q: "Do you write the content?", a: "Yes. On Growth and Pro plans, we create SEO-optimized service and location pages targeting your services and area." },
    ],
    pricingSection: buildPricingSection(RANKFLOW),
    related: ["mapguard", "socialsync"],
  },
  {
    slug: "webfix",
    name: "WebFix™",
    shortTagline: "One-Time Website Speed, SEO & Structure Fixes",
    seoTitle: "WebFix™ — One-Time Website Fixes for Trades Businesses | WeFixTrades",
    seoDescription: "Speed optimization, mobile responsiveness, SEO structure fixes, and security hardening — delivered in one focused sprint. Built for trades businesses. One-time fee, no subscription.",
    category: "core",
    heroVisualType: "website",
    primaryCTA: { label: "Fix My Website", href: "/Wizard" },
    secondaryCTA: { label: "See What’s Included", href: "#webfix-included" },
    highlights: [
      "Page-speed audit + Core Web Vitals fixes by our specialists — faster load times mean fewer bounced visitors and better Google rankings.",
      "Mobile-responsiveness audit + fixes for every phone, tablet, and desktop — handled by our team on your CMS.",
      "SEO structure audit + fixes — headings, meta tags, schema, and alt text implemented by hand so Google can actually find you.",
      "Security audit + hardening: SSL, plugin cleanup, vulnerability patching — done by our specialists, not a script.",
      "Broken link + 404 cleanup — every dead link and error page found in the audit and fixed by our team.",
      "Contact form + CTA troubleshooting — we test and repair your lead-capture forms by hand.",
    ],
    outcomes: [
      { title: "Faster website", desc: "Core Web Vitals improvements that directly impact your Google ranking and visitor experience." },
      { title: "More leads from existing traffic", desc: "Fix the hidden problems that cause visitors to leave before they contact you." },
      { title: "Better mobile experience", desc: "Most local searches happen on phones. Your site needs to work flawlessly on every screen." },
      { title: "Stronger SEO foundation", desc: "Proper structure makes every future SEO effort more effective." },
    ],
    howItWorks: [
      { title: "We audit your website", desc: "A thorough scan of speed, SEO structure, mobile experience, security, and broken elements. You get a clear report of every issue found." },
      { title: "We build a fix plan", desc: "We prioritize the fixes by impact — speed and lead capture issues first, then SEO and structure improvements." },
      { title: "We implement the fixes", desc: "Our team works through every item on the plan. No waiting weeks — most sites are fixed within 5 business days." },
      { title: "You get a verification report", desc: "Before-and-after scores for speed, SEO, mobile, and security. Proof of improvement, not just promises." },
    ],
    bestFor: ["Plumbers", "Electricians", "HVAC Technicians", "Roofers", "Cleaners", "Landscapers", "Painters", "General Contractors"],
    visuals: [
      { title: "Speed Audit", desc: "Core Web Vitals analysis showing exactly where your site is slow and what we fix." },
      { title: "SEO Structure Report", desc: "Heading hierarchy, meta tags, image optimization, and schema markup assessment." },
      { title: "Before & After", desc: "Clear performance comparison showing measurable improvements after our fixes." },
    ],
    faq: [
      { q: "How long does the fix take?", a: "Most websites are fully fixed within 5 business days. Complex sites with many pages may take up to 7 days. You’ll get progress updates throughout." },
      { q: "Do I need to give you website access?", a: "Yes. We need CMS/hosting access to implement the fixes. We’ll walk you through it if needed — takes about 2 minutes." },
      { q: "What if my site has problems you can’t fix?", a: "The initial audit identifies everything. If we find issues outside the scope (like a full redesign), we’ll tell you upfront before any work begins." },
      { q: "Is this a one-time fee or a subscription?", a: "One-time fee. You pay once, we fix your site, and you’re done. No recurring charges. If you want ongoing maintenance afterward, check out WebCare." },
      { q: "Will this help my Google rankings?", a: "Yes. Faster page speed, proper meta tags, mobile responsiveness, and clean structure are all direct Google ranking factors. You should see improvement within weeks." },
      { q: "Do I own the changes?", a: "Absolutely. Everything we fix stays on your website. It’s your site, your content, your improvements." },
      { q: "What CMS or platforms do you support?", a: "Our specialists handle WordPress, Wix, Squarespace, Shopify, and Webflow using your CMS login. We run an automated audit first, then our team makes the fixes by hand — no AI guessing on your site." },
    ],
    pricingSection: buildPricingSection(WEBFIX, "One-time fee. No subscription. No hidden costs."),
    related: ["webcare", "rankflow", "sitelaunch"],
  },
  {
    slug: "contentflow",
    name: "ContentFlow",
    shortTagline: "AI-Powered Content Creation & Multi-Channel Publishing",
    seoTitle: "ContentFlow — AI Content Engine for Trades Businesses | WeFixTrades",
    seoDescription: "AI-generated articles, social media posts, and Google Business Profile content — matched to your brand voice and published across all your channels automatically.",
    category: "growth",
    heroVisualType: "social",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See How It Works", href: "#contentflow-how" },
    highlights: [
      "AI article generation — Blog posts, service pages, and local content written in your brand voice.",
      "Social media posts — Facebook, Instagram, and Google Business posts created and scheduled automatically.",
      "Google Business Profile posts — Keep your GBP active with regular local posts that boost visibility.",
      "Brand voice matching — AI learns your tone, terminology, and style so content sounds like you.",
      "Multi-channel publishing — One content engine feeds every platform. No copy-pasting between tools.",
      "Quality-checked before publishing — Every piece is reviewed for accuracy, tone, and relevance before it goes live.",
    ],
    outcomes: [
      { title: "Consistent online presence", desc: "Fresh content goes out every week across all your channels without you lifting a finger." },
      { title: "Better local SEO", desc: "Regular articles and GBP posts signal to Google that your business is active and relevant." },
      { title: "More trust before the first call", desc: "Customers who see helpful content are more likely to choose you over a competitor with an empty blog." },
      { title: "Zero time investment", desc: "No writing, no scheduling, no platform switching. ContentFlow handles it all." },
    ],
    howItWorks: [
      { title: "Build your brand profile", desc: "Tell us about your business, services, service area, and the tone you want. AI uses this as the foundation for all content." },
      { title: "AI drafts your content", desc: "Articles, social posts, and GBP updates are generated on a regular schedule — all matched to your brand voice." },
      { title: "Review and approve", desc: "Preview every piece before it goes live. Approve, request changes, or let autopilot handle everything." },
      { title: "Auto-publish across channels", desc: "Approved content is published to your blog, Facebook, Instagram, and Google Business Profile automatically." },
    ],
    bestFor: ["Plumbers", "Electricians", "HVAC Technicians", "Roofers", "Cleaners", "Landscapers", "Painters", "General Contractors"],
    visuals: [
      { title: "Content Calendar", desc: "See your upcoming posts, articles, and GBP updates in one organized view." },
      { title: "Brand Voice Editor", desc: "Fine-tune how your AI-generated content sounds — friendly, professional, or direct." },
      { title: "Multi-Channel Dashboard", desc: "Track what’s been published, what’s pending approval, and what’s coming next." },
    ],
    faq: [
      { q: "Do I need to write anything?", a: "No. AI generates all content based on your brand profile, services, and location. You just review and approve — or turn on autopilot and let it run." },
      { q: "What platforms does ContentFlow publish to?", a: "Facebook, Instagram, Google Business Profile, and your website blog. All from one system." },
      { q: "How does the AI know what to write about?", a: "It uses your brand profile, service descriptions, service area, and industry knowledge to generate relevant, helpful content. Topics rotate automatically so you never repeat." },
      { q: "Can I edit content before it goes live?", a: "Yes. Every piece is available for review. You can edit text, approve as-is, or reject and request a rewrite." },
      { q: "What if I don’t like the tone?", a: "You can adjust your brand voice settings at any time. Choose between friendly, professional, or direct — and add any specific phrases or terminology you prefer." },
      { q: "How is this different from SocialSync?", a: "SocialSync focuses specifically on social media posting. ContentFlow is a standalone content engine that produces articles, social posts, and GBP updates together — you can buy it on its own, no SocialSync subscription required. The two work well together but neither needs the other." },
      { q: "How much content do I get?", a: "It depends on your plan: Creator includes 12 pieces per month, Studio 40, and Agency 120 — a mix of articles, social posts, and GBP updates." },
    ],
    pricingSection: buildPricingSection(CONTENTFLOW, "Standalone plans — no SocialSync or RankFlow subscription required. No contracts. Cancel anytime.", { checkout: true }),
    related: ["socialsync", "rankflow", "mapguard"],
  },
  {
    slug: "adflow",
    name: "AdFlow™",
    shortTagline: "Done-for-you ad campaigns, managed by our agency partners",
    seoTitle: "AdFlow™ — Managed Ad Campaigns for Trades | WeFixTrades",
    seoDescription: "Done-for-you Google and Meta ad campaigns, managed by our agency partners. Monthly performance reports, transparent pricing, ad spend funded separately. From $399/mo.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Agency-managed campaigns — Our partner agency handles setup, targeting, creative, and ongoing optimization.",
      "Monthly performance reports — Clear reports delivered to your inbox showing leads, spend, and cost per lead.",
      "Ad spend funded separately — You pay the ad platforms directly. Our fee covers management only.",
      "Multi-platform reach — Google Ads, Facebook, and Instagram campaigns depending on your plan.",
      "No long-term contracts — Cancel anytime. Your ad accounts stay yours.",
      "WeFixTrades manages the relationship — We coordinate with the agency so you don’t have to.",
    ],
    outcomes: [
      { title: "More leads, faster", desc: "Paid ads deliver leads while SEO and organic strategies build over time." },
      { title: "Transparent reporting", desc: "Monthly reports show exactly what was spent and what it generated." },
      { title: "Professional campaign management", desc: "Experienced agency partners handle the complexity of ad platforms." },
    ],
    howItWorks: [
      { title: "Tell us your goals", desc: "Share your services, service area, budget, and what you want to advertise. We brief the agency." },
      { title: "Agency builds your campaigns", desc: "Our partner agency sets up your ad accounts, creates ads, and launches campaigns on your chosen platforms." },
      { title: "Monthly reports delivered", desc: "Every month you receive a performance report showing impressions, clicks, leads, spend, and cost per lead." },
    ],
    bestFor: ["Plumbers", "Electricians", "HVAC Technicians", "Roofers", "Cleaners", "Landscapers", "Painters", "General Contractors"],
    visuals: [
      { title: "Performance Report", desc: "Monthly email report with KPIs: leads, spend, cost per lead, and click-through rate." },
      { title: "Campaign Management", desc: "Agency handles targeting, creative, bid management, and optimization." },
      { title: "Multi-Platform Reach", desc: "Google Ads, Facebook, and Instagram campaigns managed together." },
    ],
    faq: [
      { q: "Who manages the ads?", a: "Our agency partner handles all campaign setup, optimization, and reporting. WeFixTrades manages the relationship and ensures quality." },
      { q: "Do I pay for ad spend separately?", a: "Yes. Our monthly fee covers campaign management. Ad spend is paid directly to the ad platforms (Google, Meta) by you. This keeps costs transparent." },
      { q: "How much should I budget for ad spend?", a: "Most trades businesses see results with $500–$2,000/month in ad spend. Your agency partner will recommend a budget based on your goals and area." },
      { q: "What platforms do you advertise on?", a: "Starter: Google Ads. Growth: Google + Facebook. Pro: Google + Facebook + Instagram, plus video ads." },
      { q: "How do I see my results?", a: "You receive a monthly performance report via email showing impressions, clicks, leads, total spend, and cost per lead." },
      { q: "Can I cancel anytime?", a: "Yes. No long-term contracts. Your ad accounts and data stay yours if you cancel." },
      { q: "How quickly will I see leads?", a: "Paid ads can generate leads within days of launch. Most clients see meaningful results within the first 2–4 weeks." },
    ],
    pricingSection: buildPricingSection(ADFLOW, "Ad spend is funded separately — you pay the ad platforms directly."),
    related: ["tradeline", "rankflow", "mapguard"],
  },
  {
    slug: "bookflow",
    name: "BookFlow",
    shortTagline: "Simple Online Booking for Trades",
    seoTitle: "BookFlow — Online Booking for Trades Businesses | WeFixTrades",
    seoDescription: "Let customers book appointments directly from your website, quote widget, or AI assistant. Simple, mobile-first booking built for plumbers, electricians, and trades businesses. $5.89/mo.",
    category: "core",
    heroVisualType: "dashboard",
    primaryCTA: { label: "Get Started", href: "/pricing" },
    secondaryCTA: { label: "See How It Works", href: "#bookflow-how" },
    highlights: [
      "Customers book online 24/7 — no phone tag, no back-and-forth texts.",
      "Mobile-first booking page — your customers book from their phone in 30 seconds.",
      "Automatic confirmations — email and SMS confirmation sent instantly.",
      "Works with TradeLine and QuoteQuick — your AI assistant can book directly.",
      "Working hours and services — control when you're available and what you offer.",
      "No external calendar needed — bookings stored right in your dashboard.",
    ],
    outcomes: [
      { title: "Fewer missed leads", desc: "Customers book when they're ready — even at 10 PM on a Saturday." },
      { title: "Less time scheduling", desc: "Stop texting back and forth to find a time. Let them pick from your availability." },
      { title: "More organized days", desc: "See all your appointments in one place with buffer time built in." },
    ],
    howItWorks: [
      { title: "Set your availability", desc: "Choose your working hours, services, and appointment duration. Takes 2 minutes." },
      { title: "Share your booking link", desc: "Add it to your website, email signature, or social profiles. Or let TradeLine book for you." },
      { title: "Get notified instantly", desc: "New bookings trigger email and SMS notifications. Customer gets a confirmation automatically." },
    ],
    bestFor: ["Plumbers", "Electricians", "HVAC Technicians", "Roofers", "Cleaners", "Landscapers", "Painters", "General Contractors"],
    visuals: [
      { title: "Booking Page", desc: "A clean, branded booking page your customers will actually use." },
      { title: "Appointment Dashboard", desc: "See upcoming bookings, customer details, and appointment history." },
      { title: "Instant Notifications", desc: "Email and SMS alerts the moment a new booking comes in." },
    ],
    faq: [
      { q: "Do I need a calendar app?", a: "No. BookFlow stores everything in your WeFixTrades dashboard. No Google Calendar or Calendly needed." },
      { q: "Can I control when customers can book?", a: "Yes. Set your working hours for each day of the week. Add buffer time between appointments." },
      { q: "How does this work with TradeLine?", a: "If you have TradeLine, your AI assistant can check your BookFlow availability and book appointments during calls and chats." },
      { q: "What if I need to cancel?", a: "You can cancel or reschedule from your dashboard. Customers can also cancel from their confirmation email." },
      { q: "How much does it cost?", a: "$5.89/month. No setup fees. No contracts. Cancel anytime." },
    ],
    pricingSection: {
      plans: [
        {
          name: "BookFlow",
          price: "$5.89",
          period: "/mo",
          features: [
            "Public booking page with your brand",
            "Working hours and service configuration",
            "Automatic email and SMS confirmations",
            "Buffer time between appointments",
            "Customer self-service cancellation",
            "QuoteQuick and TradeLine integration",
          ],
        },
      ],
      note: "No setup fees. No contracts. Cancel anytime.",
    },
    related: ["tradeline", "quickquotepro"],
  },
];

export function getProductBySlug(slug: string): ProductPage | undefined {
  return PRODUCT_PAGES.find((p) => p.slug === slug);
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  core: "Core Tools",
  ai: "AI Employees",
  growth: "Growth Services",
  reputation: "Reputation",
};
