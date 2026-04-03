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
    slug: "quickquote",
    name: "QuickQuotePro",
    shortTagline: "Instant quotes on your website",
    seoTitle: "QuickQuotePro — Instant Quote Calculator for Trades | WeFixTrades",
    seoDescription: "Embed an instant quote calculator on your website. Capture more leads, support 10 pricing formulas, custom branding, and go live in under 10 minutes.",
    category: "core",
    heroVisualType: "calculator",
    primaryCTA: { label: "Try Free", href: "/Wizard" },
    secondaryCTA: { label: "Try Demo", href: "/demo" },
    highlights: [
      "Give visitors instant estimates — no forms, no waiting",
      "Built-in lead capture on every quote",
      "10 pricing formulas — flat rate, per-unit, tiered, and more",
      "Custom branding, colors, and logo",
      "Embed anywhere — website, hosted page, or pop-up",
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
    bestFor: ["Plumbers", "Electricians", "Contractors", "Cleaning Services", "Landscapers"],
    visuals: [
      { title: "Calculator Widget", desc: "Clean, mobile-responsive calculator that matches your brand colors." },
      { title: "Lead Dashboard", desc: "See every estimate, lead, and conversion in one place." },
      { title: "Embed Options", desc: "Script, iframe, button, or hosted page — deploy however you want." },
    ],
    faq: [
      { q: "How long does setup take?", a: "Most users build and publish their first calculator in under 10 minutes using the step-by-step wizard." },
      { q: "Can I customize the look and feel?", a: "Yes. Match your brand colors, add your logo, choose from 6 templates, and use custom CSS on Pro plans." },
      { q: "What pricing formulas are supported?", a: "10 formula types including flat rate, per-unit, area-based, tiered, time-based, package, and more." },
      { q: "Is there a free plan?", a: "Yes. The free plan includes 1 calculator, 50 leads/month, and a hosted quote page." },
      { q: "Can I connect booking and deposits?", a: "Yes. Enable the Booking add-on to let customers book and pay a deposit directly after receiving their estimate." },
    ],
    pricingSection: {
      plans: [
        { name: "Starter", price: "$49", period: "/mo", features: ["Basic calculator", "Lead capture", "Hosted quote page", "Embed on your site"] },
        { name: "Pro", price: "$79", period: "/mo", features: ["Advanced logic", "Custom styling", "Booking integration", "Lead capture + storage", "Analytics dashboard"], highlighted: true, badge: "Most Popular" },
      ],
      note: "Both plans include embed on any site.",
    },
    related: ["booking-addon", "ai-chat"],
  },
  {
    slug: "tradeline",
    name: "24/7 TradeLine\u2122",
    shortTagline: "Always-On Lead Handling",
    seoTitle: "24/7 TradeLine\u2122 — Never Miss a Lead Again | WeFixTrades",
    seoDescription: "Your always-on lead handling system. TradeLine answers calls and chats 24/7, provides instant estimates, books jobs, sends follow-ups, and requests reviews — automatically.",
    category: "ai",
    heroVisualType: "chat",
    primaryCTA: { label: "Try Free", href: "/Wizard" },
    secondaryCTA: { label: "Try Demo", href: "/demo" },
    highlights: [
      "24/7 call and chat answering — never miss a lead",
      "Instant estimates using your pricing formulas",
      "After-hours intake captures every enquiry",
      "Auto follow-ups and booking confirmations",
      "Automated review requests after completed jobs",
    ],
    outcomes: [
      { title: "Never Miss a Lead", desc: "Every call and chat is answered instantly — even at 2 AM, weekends, or when you're on the job." },
      { title: "Auto Follow-ups Convert More Jobs", desc: "Automated SMS, email, and WhatsApp follow-ups keep leads warm and book more jobs without extra effort." },
      { title: "Build Your Reputation", desc: "Automated review requests go out after every completed job, steadily growing your online reputation." },
    ],
    howItWorks: [
      { title: "Set Up Your System", desc: "Configure your services, pricing, service area, and business hours. TradeLine learns your business in minutes." },
      { title: "Deploy on Site & Phone", desc: "Add the chat widget to your website and forward calls to your TradeLine number." },
      { title: "Review Leads & Jobs", desc: "See every lead, conversation transcript, and booked job in your dashboard." },
    ],
    bestFor: ["Solo Tradespeople", "After-hours Coverage", "Multi-service Businesses", "High Call Volume Trades"],
    visuals: [
      { title: "Chat Widget", desc: "Branded chat bubble on your website, ready to engage visitors 24/7." },
      { title: "Call Dashboard", desc: "Every call transcript, lead detail, and booked appointment in one place." },
      { title: "Follow-up Automation", desc: "Configure automatic SMS, email, and review request sequences." },
    ],
    faq: [
      { q: "How does after-hours intake work?", a: "When you're unavailable, TradeLine answers calls and chats, collects job details, provides an estimate, and sends you a summary to review in the morning." },
      { q: "Can it give accurate estimates?", a: "Yes. It uses the same pricing formulas from your QuickQuotePro calculator to generate real estimates in real time." },
      { q: "What if someone wants to speak to a real person?", a: "TradeLine can transfer urgent calls to your mobile immediately, with full conversation context included." },
      { q: "What channels does it cover?", a: "Phone calls, website chat, SMS, and WhatsApp — all handled by one system with one conversation history." },
      { q: "Can I control follow-up messages?", a: "Yes. You set the timing, channel (SMS, email, WhatsApp), and content of every automated follow-up and review request." },
    ],
    pricingSection: {
      plans: [
        { name: "Starter", price: "$97", period: "/mo", features: ["200 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"] },
        { name: "Pro", price: "$197", period: "/mo", features: ["600 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"], highlighted: true, badge: "Most Popular" },
        { name: "Premium", price: "$347", period: "/mo", features: ["1500 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"] },
      ],
      note: "Overage: $0.15/min after included usage.",
    },
    related: ["quickquotepro", "reputationshield"],
  },
  {
    slug: "assistants",
    name: "24/7 Assistants",
    shortTagline: "24/7 Answering System",
    seoTitle: "24/7 Assistants — Automated Answering for Trades | WeFixTrades",
    seoDescription: "Never miss a lead again. Our 24/7 assistants answer calls and chats, provide instant estimates, book jobs, send follow-ups, and request reviews — automatically.",
    category: "ai",
    heroVisualType: "chat",
    primaryCTA: { label: "Try Free", href: "/Wizard" },
    secondaryCTA: { label: "Try Demo", href: "/demo" },
    highlights: [
      "24/7 call and chat answering — never miss a lead",
      "Instant estimates using your pricing formulas",
      "After-hours intake captures every enquiry",
      "Auto follow-ups and booking confirmations",
      "Automated review requests after completed jobs",
    ],
    outcomes: [
      { title: "Never Miss a Lead", desc: "Every call and chat is answered instantly — even at 2 AM, weekends, or when you're on the job." },
      { title: "Auto Follow-ups Convert More Jobs", desc: "Automated SMS, email, and WhatsApp follow-ups keep leads warm and book more jobs without extra effort." },
      { title: "Build Your Reputation", desc: "Automated review requests go out after every completed job, steadily growing your online reputation." },
    ],
    howItWorks: [
      { title: "Set Up Your Assistant", desc: "Configure your services, pricing, service area, and business hours. Your assistant learns your business in minutes." },
      { title: "Deploy on Site & Phone", desc: "Add the chat widget to your website and forward calls to your assistant number." },
      { title: "Review Leads & Jobs", desc: "See every lead, conversation transcript, and booked job in your dashboard." },
    ],
    bestFor: ["Solo Tradespeople", "After-hours Coverage", "Multi-service Businesses", "High Call Volume Trades"],
    visuals: [
      { title: "Chat Widget", desc: "Branded chat bubble on your website, ready to engage visitors 24/7." },
      { title: "Call Dashboard", desc: "Every call transcript, lead detail, and booked appointment in one place." },
      { title: "Follow-up Automation", desc: "Configure automatic SMS, email, and review request sequences." },
    ],
    faq: [
      { q: "How does after-hours intake work?", a: "When you're unavailable, the assistant answers calls and chats, collects job details, provides an estimate, and sends you a summary to review in the morning." },
      { q: "Can the assistant give accurate estimates?", a: "Yes. It uses the same pricing formulas from your QuickQuotePro calculator to generate real estimates in real time." },
      { q: "What if someone wants to speak to a real person?", a: "The assistant can transfer urgent calls to your mobile immediately, with full conversation context included." },
      { q: "How does the technology work?", a: "Our assistants use AI technology to understand natural language, answer questions about your services, and handle conversations just like a trained receptionist would." },
      { q: "Can I control follow-up messages?", a: "Yes. You set the timing, channel (SMS, email, WhatsApp), and content of every automated follow-up and review request." },
    ],
    pricingSection: {
      plans: [
        { name: "Starter", price: "$97", period: "/mo", features: ["200 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"] },
        { name: "Pro", price: "$197", period: "/mo", features: ["600 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"], highlighted: true, badge: "Most Popular" },
        { name: "Premium", price: "$347", period: "/mo", features: ["1500 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"] },
      ],
      note: "Overage: $0.15/min after included usage.",
    },
    related: ["quickquotepro", "reputationshield"],
  },
  {
    slug: "quickquotepro",
    name: "QuickQuotePro",
    shortTagline: "Instant Quote Calculator",
    seoTitle: "QuickQuotePro — Instant Quote Calculator for Trades | WeFixTrades",
    seoDescription: "Give website visitors instant estimates with QuickQuotePro. Embeddable quote calculator that captures leads, supports 10 pricing formulas, and integrates with booking.",
    category: "core",
    heroVisualType: "calculator",
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
    pricingSection: {
      plans: [
        { name: "Starter", price: "$49", period: "/mo", features: ["Basic calculator", "Lead capture", "Hosted quote page", "Embed on your site"] },
        { name: "Pro", price: "$79", period: "/mo", features: ["Advanced logic", "Custom styling", "Booking integration", "Lead capture + storage", "Analytics dashboard"], highlighted: true, badge: "Most Popular" },
      ],
      note: "Both plans include embed on any site.",
    },
    related: ["booking-addon", "ai-chat", "sitelaunch"],
  },
  {
    slug: "booking-addon",
    name: "Booking + Calendar",
    shortTagline: "Booking & Deposits Add-On",
    seoTitle: "Booking & Calendar Integration — Online Scheduling for Trades | WeFixTrades",
    seoDescription: "Let customers book and pay deposits directly from your quote calculator. Integrates with Stripe, prevents double-booking, sends automatic confirmations.",
    category: "core",
    heroVisualType: "calculator",
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
    pricingSection: {
      plans: [
        { name: "Starter", price: "$49", period: "/mo", features: ["Calendar integration", "Email confirmations", "5 bookings/month", "Basic availability"] },
        { name: "Pro", price: "$99", period: "/mo", features: ["Unlimited bookings", "Stripe deposits", "SMS confirmations", "Buffer times", "Blackout dates"], highlighted: true, badge: "Most Popular" },
      ],
      note: "Stripe processing fees apply to deposits.",
    },
    related: ["quickquotepro", "ai-chat", "webcare"],
  },
  {
    slug: "ai-chat",
    name: "AI Employee (Chat)",
    shortTagline: "24/7 Lead Assistant Chat",
    seoTitle: "AI Chat Employee — 24/7 Lead Qualification & Booking | WeFixTrades",
    seoDescription: "AI-powered chat assistant that engages website visitors, qualifies leads, generates estimates, and books jobs around the clock. No coding required.",
    category: "ai",
    heroVisualType: "chat",
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
    pricingSection: {
      plans: [
        { name: "Starter", price: "$97", period: "/mo", features: ["200 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"] },
        { name: "Pro", price: "$197", period: "/mo", features: ["600 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"], highlighted: true, badge: "Most Popular" },
        { name: "Premium", price: "$347", period: "/mo", features: ["1500 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"] },
      ],
      note: "Overage: $0.15/min after included usage.",
    },
    related: ["ai-voice", "quickquotepro", "booking-addon"],
  },
  {
    slug: "ai-voice",
    name: "AI Employee (Voice)",
    shortTagline: "24/7 Lead Assistant Voice",
    seoTitle: "AI Voice Employee — 24/7 Phone Answering for Trades | WeFixTrades",
    seoDescription: "AI voice assistant that answers calls, qualifies leads, generates estimates, and books appointments. Never miss a call again — even on the job site.",
    category: "ai",
    heroVisualType: "voice",
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
    pricingSection: {
      plans: [
        { name: "Starter", price: "$97", period: "/mo", features: ["200 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"] },
        { name: "Pro", price: "$197", period: "/mo", features: ["600 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"], highlighted: true, badge: "Most Popular" },
        { name: "Premium", price: "$347", period: "/mo", features: ["1500 minutes included", "AI answering", "SMS replies", "Missed call auto-response", "Follow-ups"] },
      ],
      note: "Overage: $0.15/min after included usage.",
    },
    related: ["ai-chat", "quickquotepro", "reputationshield"],
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
    pricingSection: {
      plans: [
        { name: "Setup", price: "$397", period: " one-time", features: ["Full profile audit & rebuild", "Category & service area optimisation", "Description & keyword tuning", "Photos & posts launch plan"] },
        { name: "Basic", price: "$99", period: "/mo", features: ["2 posts/month", "Profile monitoring", "Monthly ranking report"] },
        { name: "Pro", price: "$149", period: "/mo", features: ["4 posts/month", "Review responses", "Optimization", "Competitor analysis", "Priority support"], highlighted: true, badge: "Most Popular" },
      ],
      note: "Setup fee required for new clients.",
    },
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
    pricingSection: {
      plans: [
        { name: "Setup", price: "$349", period: " one-time", features: ["Full PageSpeed audit", "Core Web Vitals fixes", "Image & asset optimisation", "Before/after speed report"] },
        { name: "Basic", price: "$79", period: "/mo", features: ["Monitoring", "Updates", "Monthly performance report"] },
        { name: "Pro", price: "$129", period: "/mo", features: ["SEO fixes", "Optimization", "Core Web Vitals monitoring", "Monthly reports", "Priority support"], highlighted: true, badge: "Most Popular" },
      ],
      note: "Setup fee required for new clients.",
    },
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
    pricingSection: {
      plans: [
        { name: "Basic", price: "$79", period: "/mo", features: ["Monitoring", "Updates", "Uptime monitoring", "Email support"] },
        { name: "Pro", price: "$129", period: "/mo", features: ["SEO fixes", "Optimization", "Speed monitoring", "Priority support", "Plugin updates"], highlighted: true, badge: "Most Popular" },
      ],
      note: "Additional content changes available at $25/each.",
    },
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
    pricingSection: {
      plans: [
        { name: "SiteLaunch", price: "$1,197", period: " one-time", features: ["5–7 page custom website", "Mobile optimization", "Speed optimization", "Basic SEO", "Contact forms", "QuoteQuick embed", "BONUS: 14-day trial of TradeLine Starter + QuoteQuick Pro"], highlighted: true, badge: "All Inclusive" },
      ],
      note: "Auto-converts to paid plans after 14-day trial.",
    },
    related: ["quickquotepro", "webboost", "webcare"],
  },
  {
    slug: "socialsync",
    name: "SocialSync",
    shortTagline: "Social Media Management + Automation",
    seoTitle: "SocialSync — Social Media Management for Trades | WeFixTrades",
    seoDescription: "Consistent posting, branded content, and lead-gen campaigns on Facebook and Instagram. Social media management designed for trades businesses.",
    category: "growth",
    heroVisualType: "social",
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
    pricingSection: {
      plans: [
        { name: "Starter", price: "$99", period: "/mo", features: ["Content creation & scheduling", "1 platform", "Branded templates", "Monthly report"] },
        { name: "Growth", price: "$149", period: "/mo", features: ["2 platforms", "Lead-gen campaigns", "Stories + Reels", "Engagement management"], highlighted: true, badge: "Most Popular" },
        { name: "Pro", price: "$199", period: "/mo", features: ["Full management", "All platforms", "Lead-gen campaigns", "Stories + Reels", "Engagement management", "Bi-weekly reports"] },
      ],
      note: "Ad spend for campaigns is billed separately.",
    },
    related: ["reputationshield", "mapguard", "webboost"],
  },
  {
    slug: "reputationshield",
    name: "ReputationShield",
    shortTagline: "Reviews & Reputation Management",
    seoTitle: "ReputationShield — Review & Reputation Management for Trades | WeFixTrades",
    seoDescription: "Automated review requests, response templates, reputation monitoring, and negative review alerts. Protect and grow your online reputation.",
    category: "growth",
    heroVisualType: "reviews",
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
    pricingSection: {
      plans: [
        { name: "Basic", price: "$79", period: "/mo", features: ["Review monitoring", "Google + Facebook", "Review request emails", "Monthly report"] },
        { name: "Pro", price: "$129", period: "/mo", features: ["All platforms", "SMS + email requests", "AI response templates", "Negative review alerts", "Website review widget"], highlighted: true, badge: "Most Popular" },
        { name: "Premium", price: "$179", period: "/mo", features: ["All Pro features", "Priority support", "Advanced analytics", "Custom escalation rules"] },
      ],
      note: "Works with Google, Facebook, Yelp, and HomeStars.",
    },
    related: ["mapguard", "socialsync", "ai-chat"],
  },
  {
    slug: "tradeline-complete",
    name: "TradeLine\u2122 Complete",
    shortTagline: "Chat + Voice + DMs",
    seoTitle: "TradeLine Complete — Chat, Voice & DM Answering for Trades | WeFixTrades",
    seoDescription: "The full 24/7 lead handling system. AI answers website chats, phone calls, and social media DMs — so you never miss a lead, even off the clock.",
    category: "ai",
    heroVisualType: "chat",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See Demo", href: "/demo" },
    highlights: [
      "24/7 website chat answering with AI",
      "24/7 voice call answering with natural AI",
      "Facebook and Instagram DM handling",
      "Unified lead dashboard for all channels",
      "Auto follow-ups via SMS, email, and WhatsApp",
      "Booking integration and calendar sync",
    ],
    outcomes: [
      { title: "Never Miss a Lead", desc: "Every chat, call, and DM is answered instantly — 24/7, across every channel." },
      { title: "One Dashboard", desc: "All conversations from chat, phone, and social in one place. No tab switching." },
      { title: "More Booked Jobs", desc: "Automated follow-ups and booking keep leads warm and convert more enquiries into jobs." },
    ],
    howItWorks: [
      { title: "Connect Channels", desc: "Add the chat widget, forward your phone number, and link your social accounts." },
      { title: "Train Your AI", desc: "Tell the AI about your services, pricing, and service area. It learns in minutes." },
      { title: "Watch Leads Roll In", desc: "AI handles conversations across all channels. You review leads and booked jobs in your dashboard." },
    ],
    bestFor: ["Busy trades teams", "Multi-channel businesses", "After-hours coverage", "High-volume enquiries"],
    visuals: [
      { title: "Unified Inbox", desc: "See chats, calls, and DMs in one timeline view." },
      { title: "AI Conversations", desc: "Natural AI responses across chat, voice, and social." },
      { title: "Lead Pipeline", desc: "Track every lead from first contact to booked job." },
    ],
    faq: [
      { q: "What channels does TradeLine Complete cover?", a: "Website chat, phone calls, Facebook Messenger, and Instagram DMs — all from one dashboard." },
      { q: "Can the AI handle all channels simultaneously?", a: "Yes. Unlike a human receptionist, the AI handles unlimited simultaneous conversations across all channels." },
      { q: "Is this different from buying ChatLine and CallLine separately?", a: "TradeLine Complete includes both plus social DM handling and a unified dashboard. It's also more cost-effective than buying each separately." },
    ],
    pricingSection: {
      plans: [
        { name: "Starter", price: "$249", period: "/mo", features: ["Chat + Voice answering", "100 conversations/month", "Lead dashboard", "Email notifications", "Basic follow-ups"] },
        { name: "Pro", price: "$399", period: "/mo", features: ["All channels (Chat + Voice + DMs)", "Unlimited conversations", "SMS + WhatsApp follow-ups", "Calendar booking", "Priority support"], highlighted: true, badge: "Most Popular" },
      ],
      note: "Per-minute call rates apply. Social DM channels require connected accounts.",
    },
    related: ["ai-chat", "ai-voice", "quickquotepro"],
  },
  {
    slug: "fix-and-optimize",
    name: "Fix & Optimize\u2122",
    shortTagline: "Quick Improvements Package",
    seoTitle: "Fix & Optimize — Website & Google Profile Cleanup for Trades | WeFixTrades",
    seoDescription: "Fast, one-time cleanup of your website and Google Business Profile. Fix speed issues, broken pages, outdated info, and SEO basics — done in days, not months.",
    category: "growth",
    heroVisualType: "dashboard",
    primaryCTA: { label: "Get Started", href: "/Wizard" },
    secondaryCTA: { label: "See What's Included", href: "#capabilities" },
    highlights: [
      "Website speed optimization and cleanup",
      "Google Business Profile audit and fixes",
      "Broken links and page error repair",
      "Basic on-page SEO corrections",
      "Mobile responsiveness fixes",
      "Fast turnaround — typically 3-5 business days",
    ],
    outcomes: [
      { title: "Faster Website", desc: "Speed improvements that directly impact your Google ranking and visitor experience." },
      { title: "Accurate Listings", desc: "Your Google profile shows the right hours, services, and contact info — no more outdated data." },
      { title: "Quick Wins", desc: "Get measurable improvements without a long-term commitment or ongoing costs." },
    ],
    howItWorks: [
      { title: "We Audit", desc: "We scan your website and Google profile for issues — speed, SEO, accuracy, and mobile problems." },
      { title: "We Fix", desc: "Our team resolves the critical issues identified in the audit. No fluff, just fixes." },
      { title: "We Report", desc: "You get a before/after report showing exactly what was fixed and the measurable improvements." },
    ],
    bestFor: ["Trades with existing websites", "Businesses with outdated Google profiles", "Anyone wanting quick results", "Pre-launch cleanup"],
    visuals: [
      { title: "Audit Report", desc: "Detailed breakdown of issues found and fixes applied." },
      { title: "Speed Improvement", desc: "Before and after page speed scores." },
      { title: "Google Profile", desc: "Optimized business profile with accurate information." },
    ],
    faq: [
      { q: "Is this a one-time service?", a: "Yes. Fix & Optimize is a one-time cleanup. For ongoing maintenance, check out WebCare." },
      { q: "How long does it take?", a: "Most projects are completed within 3-5 business days." },
      { q: "Do I need to provide access?", a: "Yes. We'll need access to your website admin panel and Google Business Profile." },
      { q: "What if I need ongoing help after?", a: "We recommend WebCare for monthly maintenance or WebBoost for ongoing SEO work." },
    ],
    pricingSection: {
      plans: [
        { name: "Standard", price: "$399", period: " one-time", features: ["Website speed audit + fixes", "Google Business Profile cleanup", "Broken link repair", "Basic SEO corrections", "Before/after report"] },
        { name: "Pro", price: "$699", period: " one-time", features: ["Everything in Standard", "Mobile optimization", "Schema markup setup", "Content review", "Priority turnaround (2-3 days)", "30-min strategy call"], highlighted: true, badge: "Best Value" },
      ],
      note: "One-time payment. No recurring fees.",
    },
    related: ["webboost", "webcare", "mapguard"],
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
