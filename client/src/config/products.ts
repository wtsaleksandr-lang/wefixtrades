export type ProductCategory = "core" | "ai" | "growth";

export interface ProductPage {
  slug: string;
  name: string;
  shortTagline: string;
  seoTitle: string;
  seoDescription: string;
  category: ProductCategory;
  primaryCTA: { label: string; href: string };
  secondaryCTA?: { label: string; href: string };
  highlights: string[];
  outcomes: { title: string; desc: string }[];
  howItWorks: { title: string; desc: string }[];
  bestFor: string[];
  visuals: { title: string; desc: string; image?: string }[];
  faq: { q: string; a: string }[];
  related: string[];
}

export const PRODUCT_PAGES: ProductPage[] = [
  {
    slug: "quickquotepro",
    name: "QuickQuotePro",
    shortTagline: "Instant Quote Calculator",
    seoTitle: "QuickQuotePro — Instant Quote Calculator for Trades | WeFixTrades",
    seoDescription: "Give website visitors instant estimates with QuickQuotePro. Embeddable quote calculator that captures leads, supports 10 pricing formulas, and integrates with booking.",
    category: "core",
    primaryCTA: { label: "Start Free", href: "/Wizard" },
    secondaryCTA: { label: "View Demo", href: "/demo" },
    highlights: [
      "Embed on any website in under 5 minutes",
      "10 pricing formula types — flat rate, per-unit, tiered, and more",
      "Real-time estimate generation with lead capture",
      "Custom branding and white-label options",
      "Built-in analytics dashboard",
    ],
    outcomes: [
      { title: "More Leads", desc: "Capture 3x more leads by giving visitors instant estimates instead of generic contact forms." },
      { title: "Fewer Phone Calls", desc: "Reduce tire-kicker calls by letting your calculator pre-qualify leads with real pricing." },
      { title: "Faster Quoting", desc: "Eliminate manual quote spreadsheets. Your calculator handles pricing logic 24/7." },
    ],
    howItWorks: [
      { title: "Build Your Calculator", desc: "Use the step-by-step wizard to configure your trade, pricing formulas, and lead capture fields." },
      { title: "Embed or Share", desc: "Get a hosted link, embed script, iframe code, or pop-up button for your website." },
      { title: "Capture Leads", desc: "Visitors get instant estimates. You get their contact info, quote details, and follow-up automation." },
    ],
    bestFor: ["Plumbers", "Electricians", "Concrete contractors", "Cleaning services", "Landscapers"],
    visuals: [
      { title: "Calculator Widget", desc: "Clean, mobile-responsive calculator that matches your brand colors." },
      { title: "Lead Dashboard", desc: "See every estimate, lead, and conversion in one place." },
      { title: "Embed Options", desc: "Script, iframe, button, or hosted page — deploy however you want." },
    ],
    faq: [
      { q: "How long does setup take?", a: "Most users build and publish their first calculator in under 15 minutes using the step-by-step wizard." },
      { q: "Can I customize the look and feel?", a: "Yes. You can match your brand colors, add your logo, choose from 6 templates, and use custom CSS on Pro plans." },
      { q: "What pricing formulas are supported?", a: "10 formula types including flat rate, per-unit, area-based, tiered, time-based, package, and more." },
      { q: "Is there a free plan?", a: "Yes. The free plan includes 1 calculator, 50 leads/month, and a hosted quote page." },
    ],
    related: ["booking-addon", "ai-chat", "sitelaunch"],
  },
  {
    slug: "booking-addon",
    name: "Booking + Calendar",
    shortTagline: "Booking & Deposits Add-On",
    seoTitle: "Booking & Calendar Integration — Online Scheduling for Trades | WeFixTrades",
    seoDescription: "Let customers book and pay deposits directly from your quote calculator. Integrates with Stripe, prevents double-booking, sends automatic confirmations.",
    category: "core",
    primaryCTA: { label: "Start Free", href: "/Wizard" },
    secondaryCTA: { label: "View Demo", href: "/demo" },
    highlights: [
      "Customers book directly after seeing their estimate",
      "Stripe deposit collection built in",
      "Automatic confirmation emails to both parties",
      "Availability calendar with slot management",
      "Double-booking prevention",
    ],
    outcomes: [
      { title: "Higher Conversion", desc: "Customers who see a price and can book immediately convert at 2x the rate of those who have to call." },
      { title: "Fewer No-Shows", desc: "Deposits reduce no-shows by 60%. Customers have skin in the game before you show up." },
      { title: "Less Admin", desc: "Stop managing bookings via phone, text, and email. One calendar, one system." },
    ],
    howItWorks: [
      { title: "Enable Booking", desc: "Toggle booking on in your calculator settings and connect your Stripe account." },
      { title: "Set Availability", desc: "Define your working hours, slot durations, buffer times, and blackout dates." },
      { title: "Collect Deposits", desc: "Customers pick a slot, pay a deposit, and both parties get instant confirmation." },
    ],
    bestFor: ["Service businesses", "Trades with on-site visits", "Contractors", "Cleaning companies", "Handyman services"],
    visuals: [
      { title: "Booking Calendar", desc: "Clean weekly calendar view with available time slots." },
      { title: "Deposit Checkout", desc: "Stripe-powered checkout flow embedded in your calculator." },
      { title: "Confirmation Email", desc: "Branded confirmation sent to both you and the customer." },
    ],
    faq: [
      { q: "Do I need a Stripe account?", a: "Yes. Stripe Connect Express is used for deposits. Setup takes about 5 minutes and funds go directly to your bank." },
      { q: "Can I set different availability per day?", a: "Yes. You can set unique hours for each day of the week plus blackout dates for holidays." },
      { q: "What happens if I need to cancel a booking?", a: "You can cancel from the dashboard. The customer is notified automatically. Refund handling is managed through Stripe." },
    ],
    related: ["quickquotepro", "ai-chat", "webcare"],
  },
  {
    slug: "ai-chat",
    name: "AI Employee (Chat)",
    shortTagline: "24/7 Lead Assistant Chat",
    seoTitle: "AI Chat Employee — 24/7 Lead Qualification & Booking | WeFixTrades",
    seoDescription: "AI-powered chat assistant that engages website visitors, qualifies leads, generates estimates, and books jobs around the clock. No coding required.",
    category: "ai",
    primaryCTA: { label: "Start Free", href: "/Wizard" },
    secondaryCTA: { label: "View Demo", href: "/demo" },
    highlights: [
      "24/7 website chat widget — never miss a lead",
      "Generates real estimates using your pricing formulas",
      "Qualifies leads with natural conversation",
      "Books appointments directly into your calendar",
      "Hands off to you via SMS/WhatsApp when needed",
    ],
    outcomes: [
      { title: "Never Miss a Lead", desc: "68% of website visitors leave without engaging. AI Chat captures them 24/7, even at 2 AM." },
      { title: "Instant Responses", desc: "Respond to every inquiry in under 3 seconds. No more lost leads waiting for a callback." },
      { title: "Qualified Leads Only", desc: "AI pre-qualifies leads by asking the right questions before they reach your phone." },
    ],
    howItWorks: [
      { title: "Train Your AI", desc: "Tell the AI about your services, pricing, and service area. It learns your business in minutes." },
      { title: "Deploy the Widget", desc: "Add the chat widget to your website with a single script tag." },
      { title: "Engage & Convert", desc: "AI chats with visitors, generates estimates, captures contact info, and books jobs." },
    ],
    bestFor: ["High-traffic trade websites", "After-hours lead capture", "Multi-service businesses", "Teams without a receptionist"],
    visuals: [
      { title: "Chat Widget", desc: "Branded chat bubble that sits on your website, ready to engage visitors." },
      { title: "Conversation Flow", desc: "Natural AI conversations that qualify leads and generate estimates." },
      { title: "Lead Handoff", desc: "Seamless notification when AI captures a hot lead or books an appointment." },
    ],
    faq: [
      { q: "Can the AI give accurate estimates?", a: "Yes. It uses the same pricing formulas from your QuickQuotePro calculator to generate real estimates." },
      { q: "What if the AI can't answer a question?", a: "It gracefully hands off to you via SMS or WhatsApp with full conversation context." },
      { q: "Does it work on mobile?", a: "Yes. The chat widget is fully responsive and works on all devices." },
    ],
    related: ["ai-voice", "quickquotepro", "booking-addon"],
  },
  {
    slug: "ai-voice",
    name: "AI Employee (Voice)",
    shortTagline: "24/7 Lead Assistant Voice",
    seoTitle: "AI Voice Employee — 24/7 Phone Answering for Trades | WeFixTrades",
    seoDescription: "AI voice assistant that answers calls, qualifies leads, generates estimates, and books appointments. Never miss a call again — even on the job site.",
    category: "ai",
    primaryCTA: { label: "Start Free", href: "/Wizard" },
    secondaryCTA: { label: "View Demo", href: "/demo" },
    highlights: [
      "Answers inbound calls 24/7 with natural voice",
      "Qualifies callers and captures lead information",
      "Schedules appointments directly into your calendar",
      "Call recording and transcripts for every conversation",
      "Routes urgent calls to your mobile instantly",
    ],
    outcomes: [
      { title: "Answer Every Call", desc: "85% of callers who reach voicemail never call back. AI Voice answers every single call." },
      { title: "Stay On the Job", desc: "Stop climbing off ladders to answer your phone. AI handles calls while you work." },
      { title: "Professional Image", desc: "Sound like a company with a full-time receptionist — even if you're a one-person operation." },
    ],
    howItWorks: [
      { title: "Set Up Your AI", desc: "Configure your services, pricing, service area, and business hours. AI learns your voice and style." },
      { title: "Forward Your Calls", desc: "Forward your business line to AI Voice, or use it as your primary number." },
      { title: "Review & Follow Up", desc: "Get transcripts, lead details, and booked appointments — all in your dashboard." },
    ],
    bestFor: ["Solo tradespeople", "Field workers", "After-hours coverage", "Businesses without a receptionist", "High call volume trades"],
    visuals: [
      { title: "Call Dashboard", desc: "See every call, transcript, and lead captured by your AI voice assistant." },
      { title: "Natural Conversations", desc: "AI handles complex questions with natural, professional voice responses." },
      { title: "Instant Alerts", desc: "Get SMS notifications for hot leads and urgent calls." },
    ],
    faq: [
      { q: "Does it sound robotic?", a: "No. AI Voice uses advanced natural language processing for human-like conversations. Most callers can't tell the difference." },
      { q: "Can it handle multiple calls at once?", a: "Yes. Unlike a human receptionist, AI Voice can handle unlimited simultaneous calls." },
      { q: "What if someone wants to speak to a real person?", a: "AI Voice can transfer urgent calls to your mobile immediately, with full context." },
    ],
    related: ["ai-chat", "quickquotepro", "reputationshield"],
  },
  {
    slug: "mapguard",
    name: "MapGuard",
    shortTagline: "Google Business Profile Optimization",
    seoTitle: "MapGuard — Google Maps & GBP Optimization for Trades | WeFixTrades",
    seoDescription: "Get found by local customers on Google Maps. GBP optimization, citation building, review strategy, and local ranking monitoring for trades businesses.",
    category: "growth",
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
    related: ["webboost", "webcare", "reputationshield"],
  },
  {
    slug: "webboost",
    name: "WebBoost",
    shortTagline: "Website SEO & Speed Optimization",
    seoTitle: "WebBoost — Website SEO & Speed Optimization for Trades | WeFixTrades",
    seoDescription: "Rank higher on Google with fast-loading, optimized pages. Technical SEO audits, speed optimization, keyword targeting, and monthly performance reports.",
    category: "growth",
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
    related: ["mapguard", "sitelaunch", "webcare"],
  },
  {
    slug: "webcare",
    name: "WebCare",
    shortTagline: "Website + GBP Maintenance",
    seoTitle: "WebCare — Website & Google Maps Maintenance for Trades | WeFixTrades",
    seoDescription: "Keep your website and Google Business Profile updated, secure, and performing. Monthly maintenance, content updates, uptime monitoring, and security patches.",
    category: "growth",
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
    related: ["webboost", "mapguard", "sitelaunch"],
  },
  {
    slug: "sitelaunch",
    name: "SiteLaunch",
    shortTagline: "Website Built From Scratch",
    seoTitle: "SiteLaunch — Professional Trade Website in 5 Days | WeFixTrades",
    seoDescription: "Get a professional, mobile-responsive trade website with your QuickQuote calculator built in. Custom design, SEO-ready, delivered in 5 business days.",
    category: "core",
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
    related: ["quickquotepro", "webboost", "webcare"],
  },
  {
    slug: "socialsync",
    name: "SocialSync",
    shortTagline: "Social Media Management + Automation",
    seoTitle: "SocialSync — Social Media Management for Trades | WeFixTrades",
    seoDescription: "Consistent posting, branded content, and lead-gen campaigns on Facebook and Instagram. Social media management designed for trades businesses.",
    category: "growth",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Content creation and scheduling",
      "Facebook and Instagram management",
      "Lead generation campaigns",
      "Branded post templates",
      "Monthly analytics and performance reports",
    ],
    outcomes: [
      { title: "Consistent Presence", desc: "Never go weeks without posting again. Your social profiles stay active and professional." },
      { title: "More Leads", desc: "Targeted campaigns on Facebook and Instagram bring new customers to your business." },
      { title: "Brand Authority", desc: "Regular, professional content builds trust and keeps you top-of-mind in your market." },
    ],
    howItWorks: [
      { title: "Strategy Session", desc: "We learn your business, audience, and goals to create a tailored social media strategy." },
      { title: "Content & Scheduling", desc: "We create branded content and schedule posts across your social platforms." },
      { title: "Campaigns & Reporting", desc: "We run lead-gen campaigns and provide monthly reports on reach, engagement, and leads." },
    ],
    bestFor: ["Trades wanting social presence", "Businesses without marketing staff", "Local service companies", "Trades in competitive markets"],
    visuals: [
      { title: "Content Calendar", desc: "See your planned posts across all platforms for the month ahead." },
      { title: "Branded Templates", desc: "Professional post templates customized to your brand." },
      { title: "Performance Report", desc: "Monthly breakdown of reach, engagement, and leads generated." },
    ],
    faq: [
      { q: "Which platforms do you manage?", a: "We focus on Facebook and Instagram as they deliver the best ROI for trades businesses. LinkedIn and Google Posts available on request." },
      { q: "Do I need to provide content?", a: "Photos of your work help, but we can create content using stock images and your branding if needed." },
      { q: "How many posts per month?", a: "Standard plans include 12-16 posts per month across platforms, plus stories and engagement." },
    ],
    related: ["reputationshield", "mapguard", "webboost"],
  },
  {
    slug: "reputationshield",
    name: "ReputationShield",
    shortTagline: "Reviews & Reputation Management",
    seoTitle: "ReputationShield — Review & Reputation Management for Trades | WeFixTrades",
    seoDescription: "Automated review requests, response templates, reputation monitoring, and negative review alerts. Protect and grow your online reputation.",
    category: "growth",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See Pricing", href: "/pricing" },
    highlights: [
      "Automated review request campaigns",
      "AI-powered response templates",
      "Reputation monitoring across platforms",
      "Negative review alerts and escalation",
      "Review widget for your website",
    ],
    outcomes: [
      { title: "More 5-Star Reviews", desc: "Automated requests make it easy for happy customers to leave reviews — increasing your count monthly." },
      { title: "Damage Control", desc: "Instant alerts for negative reviews let you respond quickly before they impact your reputation." },
      { title: "Social Proof", desc: "Display your best reviews on your website to build trust with new visitors." },
    ],
    howItWorks: [
      { title: "Connect Platforms", desc: "We connect your Google, Facebook, and other review platforms for centralized monitoring." },
      { title: "Automate Requests", desc: "After every job, automated emails/SMS ask happy customers to leave a review." },
      { title: "Monitor & Respond", desc: "We monitor all reviews, alert you to negatives, and help craft professional responses." },
    ],
    bestFor: ["Trades wanting more reviews", "Businesses with few online reviews", "Companies managing reputation", "Multi-location businesses"],
    visuals: [
      { title: "Review Dashboard", desc: "See all your reviews from every platform in one place." },
      { title: "Automated Requests", desc: "Configure when and how review requests are sent to customers." },
      { title: "Website Widget", desc: "Display your best reviews directly on your website." },
    ],
    faq: [
      { q: "Can you remove negative reviews?", a: "We can't remove legitimate reviews, but we help you respond professionally and generate more positive reviews to improve your overall rating." },
      { q: "Which review platforms do you monitor?", a: "Google, Facebook, Yelp, and HomeStars. Additional platforms can be added on request." },
      { q: "How are review requests sent?", a: "Via email or SMS after a job is completed. You can customize the timing and message." },
    ],
    related: ["mapguard", "socialsync", "ai-chat"],
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
