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
    pricingSection: buildPricingSection(TRADELINE, "Overage: $0.15/min after included minutes."),
    related: ["quickquotepro", "reputationshield"],
  },
  {
    slug: "quickquotepro",
    name: "QuoteQuick Pro\u2122",
    shortTagline: "Instant quotes on your website. Qualified leads in your inbox.",
    seoTitle: "QuoteQuick Pro\u2122 \u2014 Instant Quote Calculator for Trades | WeFixTrades",
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
    primaryCTA: { label: "Run a Free Audit", href: "/tools/free-audit" },
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
    seoDescription: "We keep your website updated, secure, and working — so you never have to think about it. Built for trades businesses. No contracts.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "See Pricing", href: "/pricing" },
    secondaryCTA: { label: "Talk to Us", href: "/contact" },
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
    primaryCTA: { label: "See Pricing", href: "/pricing" },
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
    primaryCTA: { label: "See Pricing", href: "/pricing" },
    secondaryCTA: { label: "Talk to Us", href: "/contact" },
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
    primaryCTA: { label: "See Pricing", href: "/pricing" },
    secondaryCTA: { label: "Compare Plans", href: "#pricing" },
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
      { q: "Can I respond to reviews from here?", a: "Yes. AI drafts a professional response based on the review text and your business type. On the Pro plan you can edit and copy it. On Scale, you can post it directly to Google with one click." },
      { q: "Will this help me get more reviews?", a: "Yes. Automated SMS and email requests after every job significantly increase the number of reviews you receive. We track which requests lead to reviews." },
      { q: "What if I get a bad review anyway?", a: "You\u2019ll get an instant email alert. AI drafts a calm, professional response. You can post it quickly \u2014 fast responses show future customers you care." },
      { q: "How is this different from Podium or NiceJob?", a: "ReputationShield is built specifically for trades businesses, costs a fraction of Podium ($399+/mo), and includes AI response drafting that NiceJob doesn\u2019t offer. No contracts, no sales calls, transparent pricing." },
    ],
    pricingSection: buildPricingSection(REPUTATIONSHIELD, "Works with Google and Facebook. No contracts. Cancel anytime."),
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
    primaryCTA: { label: "Run a Free Audit", href: "/tools/free-audit" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
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
    related: ["mapguard", "adflow"],
  },
  {
    slug: "adflow",
    name: "AdFlow\u2122",
    shortTagline: "Done-for-You Ads",
    seoTitle: "AdFlow\u2122 — Ads That Bring Leads Fast | WeFixTrades",
    seoDescription: "Done-for-you Google and Facebook ads built for trades businesses. We handle everything \u2014 setup, targeting, optimization, and reporting.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "See Pricing", href: "/pricing" },
    secondaryCTA: { label: "Talk to Us", href: "/contact" },
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
  reputation: "Reputation",
};
