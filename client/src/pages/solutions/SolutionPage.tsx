import { useParams, Link } from "wouter";
import {
  ArrowRight, Wrench, Zap, Home, Sparkles, Fan, Trees, Bug, Warehouse, KeyRound,
  PaintBucket, Hammer, Building2,
  // Wave 16 — long-tail trade icons.
  Ruler, Package, Flame, Square, RectangleHorizontal, Grid3x3, DoorOpen, LayoutGrid,
  Fence, LayoutDashboard, Building, CloudRain, Layers, Biohazard, Truck,
  Waves, Container, Sun, Grid2x2, TreeDeciduous, Droplet, ShieldCheck, Pipette,
  AppWindow, WashingMachine, Trash2,
} from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { PageMeta } from "@/components/seo/PageMeta";
import { V7PageShell } from "@/components/marketing/v7";
import SplitHero from "@/components/marketing/SplitHero";
import { TradeHeroAnimation } from "@/components/marketing/heroAnimations/registry";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { IconBadge } from "@/components/IconBadge";
import NotFound from "@/pages/not-found";
import { mkt, shadows } from "@/theme/tokens";
import type { LucideIcon } from "lucide-react";

type SolutionConfig = {
  slug: string;
  trade: string;
  headline: string;
  subheadline: string;
  heroIcon: LucideIcon;
  painPoints: string[];
  recommendedStack: {
    name: string;
    icon: string;
    desc: string;
    href: string;
  }[];
  outcomes: { stat: string; label: string }[];
  testimonialPlaceholder: string;
};

const SOLUTIONS: SolutionConfig[] = [
  {
    slug: "for-plumbers",
    trade: "Plumbers",
    headline: "Win more plumbing leads on autopilot",
    subheadline: "Stop missing calls. Automate quotes, reviews, and follow-ups so you can focus on the job site.",
    heroIcon: Wrench,
    painPoints: [
      "Missed calls while on a job",
      "Manual quoting takes hours",
      "Not enough Google reviews",
      "Website doesn't convert visitors",
      "No time for social media",
    ],
    recommendedStack: [
      { name: "TradeLine\u2122 Complete", icon: "layers", desc: "AI handles calls, chats & DMs 24/7.", href: "/products/tradeline-complete" },
      { name: "MapGuard\u2122", icon: "map", desc: "Rank #1 for local plumbing searches.", href: "/products/mapguard" },
      { name: "QuoteQuick\u2122", icon: "calculator", desc: "Instant drain / pipe repair estimates.", href: "/products/quotequick" },
      { name: "ReputationShield\u2122", icon: "shield", desc: "Auto-request 5-star reviews after every job.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "3x", label: "More leads captured" },
      { stat: "24/7", label: "AI answering service" },
      { stat: "80%", label: "Faster quoting" },
      { stat: "4.9", label: "Average star rating" },
    ],
    testimonialPlaceholder: "Since switching to WeFixTrades, we book 3x more drain jobs without hiring extra office staff.",
  },
  {
    slug: "for-hvac",
    trade: "HVAC",
    headline: "Book more HVAC service calls automatically",
    subheadline: "AI answers after-hours calls, quotes AC installs instantly, and keeps your Google profile dominating local search.",
    heroIcon: Fan,
    painPoints: [
      "After-hours emergency calls go to voicemail",
      "Seasonal demand spikes overwhelm staff",
      "Competing with big franchise brands online",
      "Slow follow-up loses hot leads",
      "Quoting installs takes too long",
    ],
    recommendedStack: [
      { name: "TradeLine\u2122 Voice", icon: "phone", desc: "Never miss an emergency HVAC call again.", href: "/products/tradeline" },
      { name: "QuoteQuick\u2122", icon: "calculator", desc: "Instant AC / furnace install estimates.", href: "/products/quotequick" },
      { name: "MapGuard\u2122", icon: "map", desc: "Outrank franchise competitors locally.", href: "/products/mapguard" },
      { name: "RankFlow\u2122", icon: "rocket", desc: "Rank higher = more organic leads.", href: "/products/rankflow" },
    ],
    outcomes: [
      { stat: "0", label: "Missed after-hours calls" },
      { stat: "2x", label: "Install quotes per day" },
      { stat: "Top 3", label: "Google Maps ranking" },
      { stat: "60%", label: "Faster speed-to-lead" },
    ],
    testimonialPlaceholder: "CallLine picked up a $12K AC install lead at 10 PM on a Saturday. That one call paid for the whole year.",
  },
  {
    slug: "for-electricians",
    trade: "Electricians",
    headline: "Automate quotes & follow-ups for electrical work",
    subheadline: "From panel upgrades to EV charger installs, capture every lead and close faster with AI-powered automation.",
    heroIcon: Zap,
    painPoints: [
      "Leads slip through during busy weeks",
      "Manual quote spreadsheets are error-prone",
      "Low online visibility vs larger firms",
      "No review request system",
      "Website looks outdated",
    ],
    recommendedStack: [
      { name: "TradeLine\u2122 Complete", icon: "layers", desc: "AI chat + voice + DMs for every channel.", href: "/products/tradeline-complete" },
      { name: "QuoteQuick\u2122", icon: "calculator", desc: "Instant panel / EV charger estimates.", href: "/products/quotequick" },
      { name: "SiteLaunch\u2122", icon: "layout", desc: "Modern site that converts visitors.", href: "/products/sitelaunch" },
      { name: "ReputationShield\u2122", icon: "shield", desc: "Build trust with automated review requests.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "5x", label: "More online reviews" },
      { stat: "40%", label: "Higher close rate" },
      { stat: "90%", label: "Leads responded < 2 min" },
      { stat: "$0", label: "Extra admin staff needed" },
    ],
    testimonialPlaceholder: "QuoteQuick handles our panel upgrade pricing so accurately, customers just book online without calling.",
  },
  {
    slug: "for-roofers",
    trade: "Roofers",
    headline: "Boost visibility & conversions for roofing jobs",
    subheadline: "Dominate local search, capture storm-damage leads instantly, and automate follow-ups that close big-ticket jobs.",
    heroIcon: Home,
    painPoints: [
      "Seasonal lead droughts",
      "Storm chasers crowding the market",
      "Big-ticket quotes need fast turnaround",
      "Hard to stand out in Maps",
      "No system for review collection",
    ],
    recommendedStack: [
      { name: "MapGuard\u2122", icon: "map", desc: "Own the local map pack for roofing.", href: "/products/mapguard" },
      { name: "TradeLine\u2122 Chat", icon: "message", desc: "Capture storm-damage leads 24/7.", href: "/products/tradeline" },
      { name: "ReputationShield\u2122", icon: "shield", desc: "Stack 5-star reviews to beat competitors.", href: "/products/reputationshield" },
      { name: "SocialSync\u2122", icon: "share", desc: "Post project photos on autopilot.", href: "/products/socialsync" },
    ],
    outcomes: [
      { stat: "2x", label: "More roof inspection leads" },
      { stat: "#1", label: "Map pack positioning" },
      { stat: "50+", label: "New reviews per quarter" },
      { stat: "35%", label: "Higher average ticket" },
    ],
    testimonialPlaceholder: "After a hail storm, ChatLine captured 47 leads in one weekend while my crew was on roofs.",
  },
  {
    slug: "for-cleaners",
    trade: "Cleaners",
    headline: "Get booked on autopilot for cleaning jobs",
    subheadline: "Instant quotes, AI chat booking, and reputation management that keeps your schedule full without cold calling.",
    heroIcon: Sparkles,
    painPoints: [
      "Inconsistent booking volume",
      "Price shoppers need instant answers",
      "Hard to build trust without reviews",
      "No time to manage social media",
      "Website doesn't capture leads",
    ],
    recommendedStack: [
      { name: "QuoteQuick\u2122", icon: "calculator", desc: "Instant cleaning estimates by sq ft.", href: "/products/quotequick" },
      { name: "TradeLine\u2122 Chat", icon: "message", desc: "Chat widget that books jobs automatically.", href: "/products/tradeline" },
      { name: "ReputationShield\u2122", icon: "shield", desc: "Build trust with automated 5-star reviews.", href: "/products/reputationshield" },
      { name: "SocialSync\u2122", icon: "share", desc: "Before/after posts on autopilot.", href: "/products/socialsync" },
    ],
    outcomes: [
      { stat: "3x", label: "More weekly bookings" },
      { stat: "< 30s", label: "Quote delivery time" },
      { stat: "4.8", label: "Average review rating" },
      { stat: "70%", label: "Less admin time" },
    ],
    testimonialPlaceholder: "QuoteQuick lets customers price their own deep clean in seconds. Our booking rate doubled overnight.",
  },
  {
    slug: "for-landscapers",
    trade: "Landscapers",
    headline: "Capture more local landscaping jobs",
    subheadline: "Instant lawn-care + maintenance quotes, automated scheduling, and Google rankings that pull in seasonal work all year.",
    heroIcon: Trees,
    painPoints: [
      "Seasonal demand spikes overwhelm the office",
      "Quoting square-footage jobs by hand wastes time",
      "Customers go with whoever quotes first",
      "Reviews trickle in instead of pouring in",
      "Hard to stay top-of-mind off-season",
    ],
    recommendedStack: [
      { name: "QuoteQuick™", icon: "calculator", desc: "Instant lawn-care + landscaping estimates by sq ft.", href: "/products/quickquotepro" },
      { name: "TradeLine™", icon: "phone", desc: "AI answers seasonal call surges 24/7.", href: "/products/tradeline" },
      { name: "SocialSync™", icon: "share", desc: "Before/after photos posted weekly on autopilot.", href: "/products/socialsync" },
      { name: "ReputationShield™", icon: "shield", desc: "Auto-request reviews after every cut.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "2.5x", label: "Quote-to-book rate" },
      { stat: "< 1 min", label: "Average quote turnaround" },
      { stat: "+62%", label: "Repeat seasonal bookings" },
      { stat: "4.8", label: "Average review rating" },
    ],
    testimonialPlaceholder: "We doubled our spring sign-ups without hiring an extra office person. The AI handles every weekend call.",
  },
  {
    slug: "for-pest-control",
    trade: "Pest Control",
    headline: "Respond faster to new pest-control leads",
    subheadline: "Customers want it gone TODAY. AI answers, quotes, and books — even when your techs are knee-deep in a callout.",
    heroIcon: Bug,
    painPoints: [
      "Emergency callouts go to voicemail",
      "Quoting per-room infestations slows everything",
      "Customer gives up if you don't reply within 10 min",
      "Recurring contract reminders fall through cracks",
      "Hard to prove visible results",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Instant pickup for emergency pest calls 24/7.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-room pricing + recurring service tiers.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Recurring contract reminders, automated.", href: "/products/bookflow" },
      { name: "ReputationShield™", icon: "shield", desc: "Before/after-treatment review requests.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "0", label: "Missed emergency calls" },
      { stat: "< 5 min", label: "Speed-to-lead" },
      { stat: "92%", label: "Recurring contract retention" },
      { stat: "+3x", label: "Online review velocity" },
    ],
    testimonialPlaceholder: "Last week TradeLine booked a same-day cockroach job at 11 PM. We'd have lost it to voicemail every other year.",
  },
  {
    slug: "for-garage-door",
    trade: "Garage Door",
    headline: "Turn urgent garage-door calls into bookings",
    subheadline: "When their door is stuck open at midnight, the first responder wins. AI picks up, quotes, dispatches.",
    heroIcon: Warehouse,
    painPoints: [
      "After-hours emergencies are pure profit — but you sleep",
      "Hard to quote spring vs opener vs panel without seeing it",
      "Customers shop 3-4 companies before booking",
      "No way to fill mid-day cancellations fast",
      "Local SEO is dominated by the franchises",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "AI answers + dispatches emergencies 24/7.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Tiered pricing for spring / opener / panel jobs.", href: "/products/quickquotepro" },
      { name: "MapGuard™", icon: "map", desc: "Outrank franchise garage-door brands locally.", href: "/products/mapguard" },
      { name: "RankFlow™", icon: "rocket", desc: "Climb 'garage door near me' rankings.", href: "/products/rankflow" },
    ],
    outcomes: [
      { stat: "3x", label: "Captured after-hours leads" },
      { stat: "< 2 min", label: "Quote turnaround" },
      { stat: "Top 3", label: "Local Maps rank" },
      { stat: "+48%", label: "Same-day bookings" },
    ],
    testimonialPlaceholder: "TradeLine booked a $1,400 broken-spring job at 2 AM Sunday. Three weekends a month covers our entire stack.",
  },
  {
    slug: "for-locksmiths",
    trade: "Locksmiths",
    headline: "Convert high-intent locksmith searches",
    subheadline: "Locked out, lost keys, broken deadbolt — they search, click the first listing, and call. Be the first listing AND the call gets answered.",
    heroIcon: KeyRound,
    painPoints: [
      "100% of locksmith searches are emergencies",
      "Voicemail = the customer calls the next listing",
      "Pricing varies wildly by job — no time to consult a sheet",
      "Trust signals matter: scammer brands have hurt the industry",
      "Hard to dominate Google Maps in a saturated category",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Sub-30s pickup on every emergency call.", href: "/products/tradeline" },
      { name: "MapGuard™", icon: "map", desc: "Stay top-3 in Google Maps locksmith search.", href: "/products/mapguard" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Quick estimates for lockout / rekey / install.", href: "/products/quickquotepro" },
      { name: "ReputationShield™", icon: "shield", desc: "Stack 5-star reviews to outshine scammer brands.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "< 30s", label: "Avg pick-up time" },
      { stat: "Top 3", label: "Local Maps rank" },
      { stat: "4.9★", label: "Avg review rating" },
      { stat: "+85%", label: "Captured emergency calls" },
    ],
    testimonialPlaceholder: "Voicemail is the death of a locksmith business. TradeLine literally doubled our after-hours revenue.",
  },
  {
    slug: "for-painters",
    trade: "Painters",
    headline: "Generate more painting estimate requests",
    subheadline: "Drive more interior + exterior estimate requests, qualify them automatically, and stack 5-star portfolio reviews.",
    heroIcon: PaintBucket,
    painPoints: [
      "Estimate requests pile up faster than you can visit",
      "Tire-kickers waste your time vs serious buyers",
      "Hard to show before/after photos without a real website",
      "Review requests get forgotten after the project ends",
      "Slow follow-up = lost to the next painter",
    ],
    recommendedStack: [
      { name: "QuoteQuick™", icon: "calculator", desc: "Instant ballpark estimates by room / sq ft.", href: "/products/quickquotepro" },
      { name: "SiteLaunch™", icon: "layout", desc: "Portfolio-first website that converts.", href: "/products/sitelaunch" },
      { name: "SocialSync™", icon: "share", desc: "Before/after photos auto-posted weekly.", href: "/products/socialsync" },
      { name: "ReputationShield™", icon: "shield", desc: "Auto-request reviews the day after final coat.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "3x", label: "Qualified estimate requests" },
      { stat: "< 1 min", label: "Quote turnaround" },
      { stat: "+72%", label: "Review request conversion" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Our website went from a vanity URL to a lead machine. QuoteQuick filters tire-kickers so we only visit serious buyers.",
  },
  {
    slug: "for-remodelers",
    trade: "Remodelers",
    headline: "Turn remodel inquiries into booked projects",
    subheadline: "Big-ticket projects need polish: a beautiful site, fast quoting, and authority content that signals trust before the consult.",
    heroIcon: Hammer,
    painPoints: [
      "$50K+ projects need authority — agency website helps but costs $20K",
      "Customers compare 3-5 contractors over weeks",
      "Manual quoting big bathroom/kitchen remodels takes days",
      "Without ongoing content, you don't build long-term trust",
      "Reviews are critical at this price point",
    ],
    recommendedStack: [
      { name: "SiteLaunch™", icon: "layout", desc: "Premium portfolio site live in 5–7 days.", href: "/products/sitelaunch" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Tiered quoting for kitchens, baths, additions.", href: "/products/quickquotepro" },
      { name: "ContentFlow™", icon: "sparkles", desc: "Authority articles drafted monthly.", href: "/products/contentflow" },
      { name: "ReputationShield™", icon: "shield", desc: "Stack reviews that justify the price tag.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "+45%", label: "Consult-booking rate" },
      { stat: "5–7 days", label: "Site to live" },
      { stat: "$28K", label: "Avg project value won" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Our site looks like a $50K agency build. We've closed $180K of remodels in our first month live.",
  },
  {
    slug: "for-general-contractors",
    trade: "General Contractors",
    headline: "Organize leads & follow-ups for GC work",
    subheadline: "Multi-trade, multi-stage projects — managed in one inbox. AI qualifies leads, books consults, and never lets a follow-up slip.",
    heroIcon: Building2,
    painPoints: [
      "Leads come from too many channels (calls, forms, referrals, DMs)",
      "Follow-ups slip through the cracks during busy weeks",
      "No single source of truth for active opportunities",
      "Quoting custom-build jobs is a 2-day exercise",
      "Hard to maintain SEO authority vs single-trade specialists",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "All inbound channels in one inbox + AI triage.", href: "/products/tradeline" },
      { name: "BookFlow™", icon: "layers", desc: "Schedule consults + recurring project check-ins.", href: "/products/bookflow" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Tiered ballpark quoting for custom jobs.", href: "/products/quickquotepro" },
      { name: "RankFlow™", icon: "rocket", desc: "Stay visible against single-trade competitors.", href: "/products/rankflow" },
    ],
    outcomes: [
      { stat: "0", label: "Leads dropped during busy weeks" },
      { stat: "+58%", label: "Consult-booking rate" },
      { stat: "5×", label: "More qualified leads" },
      { stat: "Top 3", label: "Local Maps rank" },
    ],
    testimonialPlaceholder: "We were losing 2-3 leads a week to slow follow-up. Now AI catches every one and books the consult before I'm back in the truck.",
  },

  /* ─── Wave 16 — long-tail trade solution pages ─────────────────
     Each entry is intentionally compact: shared product stack with
     trade-flavored copy, pulled from the NICHE_CARDS bullet research. */

  {
    slug: "for-carpenters",
    trade: "Carpenters",
    headline: "Win more finish-carpentry and remodel jobs",
    subheadline: "Sort framing from finish work, capture measurements before the visit, and quote built-ins faster than the next bid.",
    heroIcon: Ruler,
    painPoints: [
      "Mixed jobs (framing vs trim vs repair) need different crews",
      "Quoting custom built-ins by hand takes hours",
      "Weekend remodelers go to whoever answers first",
      "Hard to flag load-bearing work without seeing photos",
      "Reviews trickle in slower than the work goes out",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Sorts framing, finish, and repair to the right crew.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Instant ballpark for built-ins, trim, and repairs.", href: "/products/quickquotepro" },
      { name: "ReputationShield™", icon: "shield", desc: "Auto-request reviews after every project wraps.", href: "/products/reputationshield" },
      { name: "MapGuard™", icon: "map", desc: "Rank for 'carpenter near me' locally.", href: "/products/mapguard" },
    ],
    outcomes: [
      { stat: "2.4x", label: "More qualified estimate requests" },
      { stat: "< 2 min", label: "Quote turnaround" },
      { stat: "4.9★", label: "Avg review rating" },
      { stat: "+38%", label: "Repeat-client bookings" },
    ],
    testimonialPlaceholder: "QuoteQuick prices built-ins by linear foot — we book the deposit before another carpenter even calls back.",
  },
  {
    slug: "for-cabinet-installers",
    trade: "Cabinet Installers",
    headline: "Book cabinet measures and installs on autopilot",
    subheadline: "Filter design-only shoppers from real buyers, capture scope before the site visit, and protect install-day calendar.",
    heroIcon: Package,
    painPoints: [
      "Showroom shoppers tie up estimators with no intent to buy",
      "Bath vs kitchen vs built-in scope changes the whole quote",
      "Install dates depend on countertops + appliances being ready",
      "Hard to coordinate measure → template → install in one calendar",
      "Reviews after install drive most premium-line referrals",
    ],
    recommendedStack: [
      { name: "QuoteQuick™", icon: "calculator", desc: "Linear-foot pricing by finish tier.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Coordinates measure, template, and install.", href: "/products/bookflow" },
      { name: "TradeLine™", icon: "phone", desc: "Pre-qualifies showroom appointments.", href: "/products/tradeline" },
      { name: "ReputationShield™", icon: "shield", desc: "Premium-line review requests post-install.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "+52%", label: "Serious-buyer ratio" },
      { stat: "< 1 day", label: "Quote turnaround" },
      { stat: "0", label: "Calendar double-bookings" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Showroom traffic is finally qualified — only people with budgets and timelines book a measure.",
  },
  {
    slug: "for-chimney-sweeps",
    trade: "Chimney Sweeps",
    headline: "Lock in pre-season sweeps before the rush hits",
    subheadline: "Book chimney cleanings and inspections by neighborhood, flag safety calls fast, and stay top-3 on Google Maps.",
    heroIcon: Flame,
    painPoints: [
      "Pre-season demand spikes faster than you can answer the phone",
      "Creosote and animal-intrusion calls need urgent triage",
      "Level 2 inspections (home sales, post-fire) are high-margin",
      "Hard to dominate Google Maps for 'chimney sweep near me'",
      "Reviews drive 80% of homeowner-trust decisions",
    ],
    recommendedStack: [
      { name: "MapGuard™", icon: "map", desc: "Top-3 for 'chimney sweep near me' year-round.", href: "/products/mapguard" },
      { name: "TradeLine™", icon: "phone", desc: "Triages safety calls before the truck rolls.", href: "/products/tradeline" },
      { name: "BookFlow™", icon: "layers", desc: "Pre-season routes by neighborhood.", href: "/products/bookflow" },
      { name: "ReputationShield™", icon: "shield", desc: "Stack reviews to beat scammer brands.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "Top 3", label: "Local Maps rank" },
      { stat: "+62%", label: "Pre-season bookings" },
      { stat: "< 30s", label: "Emergency triage time" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "September booked solid by July. Pre-season demand used to be feast or famine — now it's a steady route.",
  },
  {
    slug: "for-concrete",
    trade: "Concrete Contractors",
    headline: "Quote driveways, slabs, and patios in one call",
    subheadline: "Qualify decorative vs structural pours, capture access constraints, and reschedule pours around the weather automatically.",
    heroIcon: Square,
    painPoints: [
      "Driveway, slab, and decorative pours need different pricing",
      "Weather-sensitive jobs need rolling reschedules",
      "Access constraints (slope, gates, neighbors) change cost a lot",
      "Commercial vs residential routes to wrong estimator",
      "Free-measure visits eat crew lead time",
    ],
    recommendedStack: [
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-sq-ft pricing for slabs, drives, patios.", href: "/products/quickquotepro" },
      { name: "TradeLine™", icon: "phone", desc: "Captures access + weather constraints up front.", href: "/products/tradeline" },
      { name: "BookFlow™", icon: "layers", desc: "Reschedules pours around the forecast.", href: "/products/bookflow" },
      { name: "MapGuard™", icon: "map", desc: "Rank for 'concrete contractor near me'.", href: "/products/mapguard" },
    ],
    outcomes: [
      { stat: "< 5 min", label: "Quote turnaround" },
      { stat: "+34%", label: "Same-week pour rate" },
      { stat: "0", label: "Pours rained out and lost" },
      { stat: "Top 3", label: "Local Maps rank" },
    ],
    testimonialPlaceholder: "QuoteQuick prices a 320 sq ft driveway in 30 seconds. Customers don't shop us against three other companies anymore.",
  },
  {
    slug: "for-countertop-installers",
    trade: "Countertop Installers",
    headline: "Coordinate template + install around cabinet readiness",
    subheadline: "Qualify granite vs quartz vs laminate scope, route slab selections to your showroom, and lock install dates clean.",
    heroIcon: RectangleHorizontal,
    painPoints: [
      "Granite vs quartz vs laminate radically changes price",
      "Install can't happen until cabinets are 100% ready",
      "Seam, overhang, and clearance prep needs to reach homeowner",
      "Slab-selection appointments waste time without qualification",
      "Reviews after install drive the next 3 referrals",
    ],
    recommendedStack: [
      { name: "QuoteQuick™", icon: "calculator", desc: "Linear-foot pricing by material + edge profile.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Coordinates template ↔ install around cabinets.", href: "/products/bookflow" },
      { name: "TradeLine™", icon: "phone", desc: "Pre-qualifies slab-selection appointments.", href: "/products/tradeline" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews requested after install sign-off.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "+45%", label: "Showroom conversion" },
      { stat: "< 2 min", label: "Quote turnaround" },
      { stat: "0", label: "Install day delays" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Cabinet installer signs off — template is on the calendar by lunch. Install runs like clockwork.",
  },
  {
    slug: "for-deck-builders",
    trade: "Deck Builders",
    headline: "Book deck consults without overloading the calendar",
    subheadline: "Qualify composite vs pressure-treated, flag permits and HOAs early, and let spring estimates fill from inspiration links.",
    heroIcon: Grid3x3,
    painPoints: [
      "Spring rush overwhelms estimators in 2 weeks",
      "Permits + HOA review can stall a project for months",
      "Composite vs PT vs hardwood is a 3x price spread",
      "Customers shop 4-5 contractors over weeks",
      "Reviews + photos drive 70% of close rate",
    ],
    recommendedStack: [
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-sq-ft pricing by material tier.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Spring routes balanced across estimators.", href: "/products/bookflow" },
      { name: "SocialSync™", icon: "share", desc: "Auto-posts finished decks for inspiration.", href: "/products/socialsync" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after final sign-off.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "2.6x", label: "Spring estimate volume" },
      { stat: "+48%", label: "Composite upsell rate" },
      { stat: "< 1 day", label: "Quote turnaround" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Our spring season went from chaos to a routable map of measures by Tuesday morning every week.",
  },
  {
    slug: "for-door-installers",
    trade: "Door Installers",
    headline: "Quote entry, patio, and storm doors in one intake",
    subheadline: "Triage security emergencies same-day, send product brochures pre-visit, and route to the right installer's calendar.",
    heroIcon: DoorOpen,
    painPoints: [
      "Entry vs patio vs interior vs storm radically different pricing",
      "Security emergencies need same-day response",
      "Rough opening + swing direction missing = wasted visit",
      "Customers picking style is faster with brochures up front",
      "Installer-route density saves hours of windshield time",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Triages security emergencies in seconds.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Pricing tiers for entry, patio, interior, storm.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Routes measures by installer + neighborhood.", href: "/products/bookflow" },
      { name: "ContentFlow™", icon: "sparkles", desc: "Auto-sends style brochures pre-visit.", href: "/products/contentflow" },
    ],
    outcomes: [
      { stat: "30 min", label: "Avg install time" },
      { stat: "+58%", label: "Same-day security calls" },
      { stat: "< 1 min", label: "Quote turnaround" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Front door swap by 4 PM same-day. Customers can't believe we showed up that fast.",
  },
  {
    slug: "for-drywall",
    trade: "Drywall Contractors",
    headline: "Patch and finish jobs booked without site visits",
    subheadline: "Photos do the qualifying — patch vs full-room vs new-construction routed to the right crew with the right tools.",
    heroIcon: LayoutGrid,
    painPoints: [
      "Patch vs full-room vs new-construction need different crews",
      "Water-damage patches need fast-track drying coordination",
      "Texture-match is impossible without photos up front",
      "Dust-containment expectations shock homeowners post-job",
      "Hangers and finishers schedule on separate calendars",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Photo intake during the call, no site visit.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-sq-ft pricing for patch / full-room / texture.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Aligns hangers + finishers on one schedule.", href: "/products/bookflow" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after final sand + prime.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "2x", label: "Same-day patches booked" },
      { stat: "$180", label: "Flat-rate patch price" },
      { stat: "0", label: "Crew-mismatch redos" },
      { stat: "4.8★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Photos in the call, quote in the call, booked in the call. Three drywall jobs before I finish lunch.",
  },
  {
    slug: "for-fencing",
    trade: "Fencing Contractors",
    headline: "Quote linear footage and book installs before the rain",
    subheadline: "Qualify wood vs vinyl vs aluminum scope, flag HOAs and surveys, and pack installer routes by density.",
    heroIcon: Fence,
    painPoints: [
      "Wood vs vinyl vs chain-link vs aluminum needs different prep",
      "HOA + permit + survey requirements slow projects",
      "Linear footage by hand wastes 30 minutes per call",
      "Pool-code and dog-fence jobs need specialty installers",
      "Spring demand outpaces installer route density",
    ],
    recommendedStack: [
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-foot pricing across all materials.", href: "/products/quickquotepro" },
      { name: "TradeLine™", icon: "phone", desc: "Captures HOA + permit needs in the intake.", href: "/products/tradeline" },
      { name: "BookFlow™", icon: "layers", desc: "Routes installers by neighborhood + style.", href: "/products/bookflow" },
      { name: "MapGuard™", icon: "map", desc: "Rank for 'fence company near me'.", href: "/products/mapguard" },
    ],
    outcomes: [
      { stat: "< 2 min", label: "Quote turnaround" },
      { stat: "+72%", label: "Spring route fill" },
      { stat: "Top 3", label: "Local Maps rank" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "180 ft of vinyl quoted on the call. Booked, deposited, installed all in the same week.",
  },
  {
    slug: "for-flooring",
    trade: "Flooring Contractors",
    headline: "Win more LVP, hardwood, and tile install jobs",
    subheadline: "Showroom + in-home consults to the right product expert, subfloor + moisture flags up front, prep checklists pre-install.",
    heroIcon: LayoutDashboard,
    painPoints: [
      "Hardwood vs LVP vs tile vs carpet split estimator focus",
      "Subfloor + moisture surprises blow up install day",
      "Showroom shoppers need different consult flow than in-home",
      "Pet stain history changes the whole scope",
      "Furniture-out prep is the #1 install-day pain",
    ],
    recommendedStack: [
      { name: "QuoteQuick™", icon: "calculator", desc: "Pricing by material + subfloor condition.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Routes showroom vs in-home to right expert.", href: "/products/bookflow" },
      { name: "TradeLine™", icon: "phone", desc: "Flags subfloor + pet history during intake.", href: "/products/tradeline" },
      { name: "SiteLaunch™", icon: "layout", desc: "Portfolio site that converts browsers.", href: "/products/sitelaunch" },
    ],
    outcomes: [
      { stat: "2.2x", label: "Showroom-to-quote rate" },
      { stat: "0", label: "Install-day subfloor surprises" },
      { stat: "< 1 day", label: "Quote turnaround" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "480 sq ft of LVP — quoted Wed, installed Sat. Subfloor check happens in the intake, not on demo day.",
  },
  {
    slug: "for-foundation-repair",
    trade: "Foundation Repair",
    headline: "Get found first when foundations are cracking",
    subheadline: "Triage active settlement as priority, capture photos and history in the intake, and expedite pre-sale inspection reports.",
    heroIcon: Building,
    painPoints: [
      "Active settlement = panic = customer calls 5 companies",
      "Crack patterns + photos before visit save hours",
      "Pre-sale inspections need expedited reporting",
      "Insurance-driven jobs need adjuster coordination",
      "Top-3 on Maps captures urgent searches first",
    ],
    recommendedStack: [
      { name: "MapGuard™", icon: "map", desc: "Top-3 for 'foundation repair near me'.", href: "/products/mapguard" },
      { name: "TradeLine™", icon: "phone", desc: "Triages urgent settlement calls instantly.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Inspection booking + ballpark pricing.", href: "/products/quickquotepro" },
      { name: "ContentFlow™", icon: "sparkles", desc: "Authority content for pre-sale buyers.", href: "/products/contentflow" },
    ],
    outcomes: [
      { stat: "Top 3", label: "Local Maps rank" },
      { stat: "+82%", label: "Same-day inspections" },
      { stat: "< 30s", label: "Triage time" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "We're the first listing when someone Googles 'foundation crack settling'. That call would have gone to anyone two years ago.",
  },
  {
    slug: "for-gutter-services",
    trade: "Gutter Services",
    headline: "Pack seasonal routes before the leaves drop",
    subheadline: "Cleaning + repair + new-install in one intake, neighborhood route clustering, before-storm reminders.",
    heroIcon: CloudRain,
    painPoints: [
      "Seasonal demand spikes 4x in October",
      "Cleaning vs repair vs install needs different pricing",
      "Ice-dam and overflow damage urgent in winter",
      "Route inefficiency burns hours of windshield time",
      "Customers forget until water is in the basement",
    ],
    recommendedStack: [
      { name: "BookFlow™", icon: "layers", desc: "Routes cleaning by neighborhood density.", href: "/products/bookflow" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-foot pricing across services.", href: "/products/quickquotepro" },
      { name: "TradeLine™", icon: "phone", desc: "Pre-storm reminder campaigns.", href: "/products/tradeline" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after seasonal route close-outs.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "+88%", label: "Fall route density" },
      { stat: "< 1 min", label: "Quote turnaround" },
      { stat: "0", label: "Pre-storm scrambles" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "October went from chaos to a packed Google calendar. Pre-storm reminders book a third of our route every year.",
  },
  {
    slug: "for-insulation",
    trade: "Insulation Contractors",
    headline: "Sell attic + wall + crawlspace jobs with rebate clarity",
    subheadline: "Qualify retrofit vs new-construction, flag rebate eligibility up front, and book energy assessments tightly routed.",
    heroIcon: Layers,
    painPoints: [
      "Attic vs wall vs crawlspace radically different scope",
      "Rebate and tax-credit eligibility is the close-trigger",
      "Energy-audit history isn't asked early enough",
      "New-construction vs retrofit needs different crews",
      "Blower-door tech schedule is a bottleneck",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Captures audit + rebate info during intake.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-sq-ft pricing by R-value target.", href: "/products/quickquotepro" },
      { name: "ContentFlow™", icon: "sparkles", desc: "Authority articles on rebates + credits.", href: "/products/contentflow" },
      { name: "BookFlow™", icon: "layers", desc: "Routes blower-door tech efficiently.", href: "/products/bookflow" },
    ],
    outcomes: [
      { stat: "+62%", label: "Rebate-driven closes" },
      { stat: "< 5 min", label: "Quote turnaround" },
      { stat: "R-49", label: "Avg attic upsell" },
      { stat: "4.8★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Rebate-eligibility check during the intake. Close rate doubled when customers see the net price.",
  },
  {
    slug: "for-masonry",
    trade: "Masonry Contractors",
    headline: "Sell tuckpointing, repair, and restoration with photos",
    subheadline: "Photo-driven qualification, weather-aware scheduling, and clean repair-vs-rebuild pricing tiers.",
    heroIcon: Layers,
    painPoints: [
      "Brick vs stone vs block vs chimney = different specialists",
      "Photos of cracks + spalling + joints needed before visit",
      "Structural and chimney-cap work needs senior review",
      "Weather windows for restoration are narrow",
      "Small repairs get lost behind full-rebuild quotes",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Photo-intake during the call.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Repair vs rebuild pricing tiers.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Weather-aware restoration scheduling.", href: "/products/bookflow" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after restoration sign-off.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "+44%", label: "Photo-driven closes" },
      { stat: "< 5 min", label: "Quote turnaround" },
      { stat: "0", label: "Weather-blown jobs" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Tuckpointing photos in the call. We quote a $4,800 job by the time we'd normally just be driving out for an estimate.",
  },
  {
    slug: "for-mold-remediation",
    trade: "Mold Remediation",
    headline: "Respond fast when mold turns into a health emergency",
    subheadline: "Triage active mold as urgent, coordinate testing + containment + remediation in one intake, capture adjuster info early.",
    heroIcon: Biohazard,
    painPoints: [
      "Active mold = panic = customer needs answer in minutes",
      "Testing → containment → remediation = 3 sub-trades",
      "Square footage + water source needed up front",
      "Insurance-claim adjuster info often missing",
      "Spores spread fast without do-not-disturb guidance",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Triages urgent mold calls 24/7.", href: "/products/tradeline" },
      { name: "BookFlow™", icon: "layers", desc: "Coordinates testing + containment + reno.", href: "/products/bookflow" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-sq-ft pricing by category of growth.", href: "/products/quickquotepro" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after clearance test pass.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "< 30s", label: "Emergency triage time" },
      { stat: "+68%", label: "Insurance-coordinated jobs" },
      { stat: "2 days", label: "Avg clear-by-time" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Active mold + insurance claim + remediation crew dispatched in 14 minutes. That call would have gone to a chain a year ago.",
  },
  {
    slug: "for-moving-services",
    trade: "Moving Services",
    headline: "Book local and long-distance moves without phone tag",
    subheadline: "Bedroom count + stairs + specialty items in one intake, pack/load/unload calendar coordination, prep checklists pre-move.",
    heroIcon: Truck,
    painPoints: [
      "Local vs long-distance vs labor-only = different pricing",
      "Stairs + specialty items (piano, safes) miss the estimate",
      "Pack + load + unload spread across calendars",
      "Customers forget to box things or block the truck",
      "Reviews drive 80% of move-out-season bookings",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Bedroom + stairs + specialty intake.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-hour + flat-rate moving tiers.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Coordinates pack / load / unload days.", href: "/products/bookflow" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after move-out completion.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "+58%", label: "Saturday route fill" },
      { stat: "< 5 min", label: "Quote turnaround" },
      { stat: "0", label: "Specialty-item surprises" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "3BR + stairs + piano quoted in the call. The customer hangs up with a deposit paid before the next mover even calls back.",
  },
  {
    slug: "for-pool-service",
    trade: "Pool Service",
    headline: "Lock in recurring pool routes that pay year-round",
    subheadline: "Open + close + weekly service in one intake, equipment history captured up front, seasonal reminders before customers forget.",
    heroIcon: Waves,
    painPoints: [
      "Opening + closing + weekly service mix on the same call",
      "Green-pool emergencies are high-margin priority work",
      "Equipment brand history changes troubleshooting time",
      "Seasonal customers forget to book opens until June",
      "Route density makes or breaks margin",
    ],
    recommendedStack: [
      { name: "BookFlow™", icon: "layers", desc: "Recurring routes by neighborhood + pool type.", href: "/products/bookflow" },
      { name: "TradeLine™", icon: "phone", desc: "Captures equipment + chemistry up front.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Opening, closing, weekly pricing tiers.", href: "/products/quickquotepro" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after green-to-clean turnarounds.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "92%", label: "Recurring retention" },
      { stat: "+74%", label: "Pre-season opens booked" },
      { stat: "< 5 min", label: "Quote turnaround" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "May routes booked in February. Green-pool calls get answered before the customer even posts on Facebook.",
  },
  {
    slug: "for-septic-services",
    trade: "Septic Services",
    headline: "Pump, repair, and inspect on a route — not a panic",
    subheadline: "Triage backups as urgent, capture tank size and last-pump date up front, route routine pumps by neighborhood.",
    heroIcon: Container,
    painPoints: [
      "Backups + overflows need urgent same-day response",
      "Tank size + last-pump date drives all pricing",
      "Locate-the-lid guidance saves 20 min per visit",
      "Inspection + repair + new-install needs different crews",
      "Recurring pump reminders fall through cracks",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Triages backups + captures tank history.", href: "/products/tradeline" },
      { name: "BookFlow™", icon: "layers", desc: "Routes pumps by neighborhood density.", href: "/products/bookflow" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Pricing by tank size + access difficulty.", href: "/products/quickquotepro" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after pump + inspection.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "+64%", label: "Recurring pump compliance" },
      { stat: "< 30s", label: "Backup triage time" },
      { stat: "$385", label: "Avg pump price clarity" },
      { stat: "4.8★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Backup at 11 PM Sunday — triaged, dispatched, pumped before sunrise. That's a $385 job no voicemail would have caught.",
  },
  {
    slug: "for-siding",
    trade: "Siding Contractors",
    headline: "Lead 'siding near me' searches in your zip code",
    subheadline: "Vinyl + fiber-cement + metal scope qualification, storm-damage insurance coordination, weather-window scheduling.",
    heroIcon: Building2,
    painPoints: [
      "Vinyl vs fiber-cement vs metal = 3x price spread",
      "Storm damage spikes need adjuster coordination",
      "Trim + soffit + fascia hidden cost surprises",
      "Weather-window scheduling is brittle",
      "Local Maps competition is fierce",
    ],
    recommendedStack: [
      { name: "MapGuard™", icon: "map", desc: "Top-3 for 'siding near me'.", href: "/products/mapguard" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-sq-ft pricing by material.", href: "/products/quickquotepro" },
      { name: "TradeLine™", icon: "phone", desc: "Storm-damage adjuster intake.", href: "/products/tradeline" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after install sign-off.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "Top 3", label: "Local Maps rank" },
      { stat: "+52%", label: "Storm-job capture" },
      { stat: "< 1 day", label: "Quote turnaround" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "After hail, the first six calls all picked up. We used to lose half to voicemail — now they're booked.",
  },
  {
    slug: "for-solar",
    trade: "Solar Installers",
    headline: "Qualify solar buyers before the design consult",
    subheadline: "Roof age + shading + utility bill in one call, satellite-based design pre-visit, financing + credits explained early.",
    heroIcon: Sun,
    painPoints: [
      "Tire-kickers eat design-consult capacity",
      "Roof age + shading + tilt = whole-system viability",
      "Tax credits + financing close-trigger is hidden too deep",
      "Battery + EV + re-roof bundles need design review",
      "Utility bill is the close-the-deal data point",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Roof + shading + utility intake.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-kW pricing with credit + finance math.", href: "/products/quickquotepro" },
      { name: "ContentFlow™", icon: "sparkles", desc: "Authority articles on credits + ROI.", href: "/products/contentflow" },
      { name: "BookFlow™", icon: "layers", desc: "Design consults with qualified buyers only.", href: "/products/bookflow" },
    ],
    outcomes: [
      { stat: "+88%", label: "Consult-to-close rate" },
      { stat: "8 kW", label: "Avg system size" },
      { stat: "< 1 day", label: "Quote turnaround" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Tire-kickers filtered out before they ever see a designer. Close rate doubled when we only show up for real buyers.",
  },
  {
    slug: "for-tile-installers",
    trade: "Tile Installers",
    headline: "Book bathroom and backsplash tile jobs on the call",
    subheadline: "Floor + shower + backsplash + outdoor scope sorted up front, plumbing/demo coordination tight, material prep guidance.",
    heroIcon: Grid2x2,
    painPoints: [
      "Floor vs shower vs backsplash = different waterproofing",
      "Substrate + waterproofing surprises blow up installs",
      "Large-format + mosaic + natural stone need specialty crews",
      "Plumbing-demo readiness gates the install start",
      "Material-pickup ownership confusion wastes a day",
    ],
    recommendedStack: [
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-sq-ft pricing by tile + substrate.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Plumbing + demo coordination calendar.", href: "/products/bookflow" },
      { name: "TradeLine™", icon: "phone", desc: "Substrate + waterproof intake.", href: "/products/tradeline" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after install sign-off.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "+42%", label: "Same-week installs" },
      { stat: "< 5 min", label: "Quote turnaround" },
      { stat: "0", label: "Substrate redos" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "42 sq ft of porcelain quoted in 4 minutes. Customers stop shopping after they hear how clean our scope is.",
  },
  {
    slug: "for-tree-service",
    trade: "Tree Service",
    headline: "Get hazard calls before the next company even rings",
    subheadline: "Storm-down + hazard prioritized, AI prune planning from photos, permit + protected-species flags up front.",
    heroIcon: TreeDeciduous,
    painPoints: [
      "Storm-down = urgent + multiple competing companies",
      "Photos save the estimator a windshield trip",
      "Permit + protected-species concerns derail jobs",
      "Crew + chipper + crane have different schedules",
      "Stump grind upsell often forgotten",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Hazard triage 24/7.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Photo-based pricing + stump upsell.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Crew + chipper + crane calendar.", href: "/products/bookflow" },
      { name: "MapGuard™", icon: "map", desc: "Top-3 for 'tree service near me'.", href: "/products/mapguard" },
    ],
    outcomes: [
      { stat: "Top 3", label: "Local Maps rank" },
      { stat: "+88%", label: "Storm-call capture" },
      { stat: "< 30s", label: "Triage time" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Storm Sunday — phone never stopped. Every call answered, 12 jobs on the books by Monday morning.",
  },
  {
    slug: "for-water-damage-restoration",
    trade: "Water Damage Restoration",
    headline: "Be the first crew on-site when water is rising",
    subheadline: "24/7 triage, insurance-claim coordination, mitigation → demo → reconstruction in one handoff.",
    heroIcon: Droplet,
    painPoints: [
      "Active flooding = customer calls 5 companies at once",
      "Insurance-claim handoff has 6 moving parts",
      "Mitigation + demo + recon = 3 sub-phases",
      "Cat 1/2/3 water needs different containment",
      "Shut-off + safety guidance saves real damage",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "24/7 active-flood triage.", href: "/products/tradeline" },
      { name: "BookFlow™", icon: "layers", desc: "Mitigation → demo → recon handoff.", href: "/products/bookflow" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after final clearance.", href: "/products/reputationshield" },
      { name: "MapGuard™", icon: "map", desc: "Top-3 for 'water damage near me'.", href: "/products/mapguard" },
    ],
    outcomes: [
      { stat: "< 60s", label: "Pick-up time" },
      { stat: "Top 3", label: "Local Maps rank" },
      { stat: "+72%", label: "Insurance-coordinated jobs" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Burst pipe at 2 AM. Triaged + crew rolling in 12 min. That's a $14K dry-out we'd have lost to voicemail every other year.",
  },
  {
    slug: "for-waterproofing",
    trade: "Waterproofing Contractors",
    headline: "Sell basement and crawlspace waterproofing year-round",
    subheadline: "Water-entry mapping in the intake, sump + storm history captured up front, dry-out guidance pre-visit.",
    heroIcon: ShieldCheck,
    painPoints: [
      "Basement vs crawlspace vs foundation = different scope",
      "Water entry points need to be mapped pre-visit",
      "Sump + storm history is a 5-question intake",
      "Structural + mold-adjacent jobs need combined estimates",
      "Customers wait until water is already inside",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Maps entry points + sump status in intake.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-foot pricing for interior + exterior.", href: "/products/quickquotepro" },
      { name: "ContentFlow™", icon: "sparkles", desc: "Authority articles on basement water.", href: "/products/contentflow" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after seal + warranty.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "25-yr", label: "Warranty close-trigger" },
      { stat: "< 1 day", label: "Quote turnaround" },
      { stat: "+58%", label: "Combined-scope upsell" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Sealed + transferable warranty. Customer signed a $6,400 contract before our specialist even walked the basement.",
  },
  {
    slug: "for-well-water",
    trade: "Well Water Services",
    headline: "Restore water fast when the pump fails",
    subheadline: "Same-day priority for no-water calls, well-type + depth + symptoms in the intake, contamination alerts to the right tech.",
    heroIcon: Pipette,
    painPoints: [
      "No-water = customer panics + calls 4 companies",
      "Well type + depth + symptoms drives diagnosis",
      "Pressure-tank vs pump vs softener = different techs",
      "Contamination results need urgent treatment",
      "Conserve-water guidance saves customer + their well",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Same-day no-water triage.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Pump + tank + softener pricing tiers.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Routes pump + tank + softener techs.", href: "/products/bookflow" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after pressure restored.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "60 psi", label: "Avg restored pressure" },
      { stat: "< 5 min", label: "Quote turnaround" },
      { stat: "Same-day", label: "Emergency dispatch" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "No water at 6 AM, new pump installed by 11 AM. Same-day saves the customer + earns the review.",
  },
  {
    slug: "for-window-installers",
    trade: "Window Installers",
    headline: "Quote and install ENERGY-STAR windows by the home",
    subheadline: "Full-frame + insert + storm scope qualification, rebate + tax-credit eligibility, route measures by installer density.",
    heroIcon: AppWindow,
    painPoints: [
      "Full-frame vs insert vs storm = 2x price spread",
      "Rebate + tax-credit clarity is the close trigger",
      "Historic-district + HOA jobs need office review",
      "Window-count + style sells in the intake",
      "Installer route density saves a week per month",
    ],
    recommendedStack: [
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-window pricing by style + frame.", href: "/products/quickquotepro" },
      { name: "TradeLine™", icon: "phone", desc: "Rebate + HOA intake during the call.", href: "/products/tradeline" },
      { name: "BookFlow™", icon: "layers", desc: "Routes measures by installer + zip.", href: "/products/bookflow" },
      { name: "ContentFlow™", icon: "sparkles", desc: "Authority articles on rebates + ROI.", href: "/products/contentflow" },
    ],
    outcomes: [
      { stat: "+58%", label: "Rebate-driven closes" },
      { stat: "8 windows", label: "Avg job size" },
      { stat: "< 1 day", label: "Quote turnaround" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "ENERGY STAR + tax credit math during intake. Customer signs the deposit before we leave the driveway.",
  },
  {
    slug: "for-appliance-repair",
    trade: "Appliance Repair",
    headline: "Diagnose, dispatch, and fix appliances same-day",
    subheadline: "Make + model + error code in one intake, in-warranty vs out routing, 2-hour arrival windows with ETA texts.",
    heroIcon: WashingMachine,
    painPoints: [
      "Wrong part on the truck = second visit + lost margin",
      "In-warranty vs out-of-warranty pricing is different",
      "Same-day no-cool fridge calls are urgent",
      "2-hour arrival windows are the customer ask",
      "Photos of nameplates save the diagnostic time",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Make + model + error-code intake.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Diagnostic + parts modifier pricing.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "2-hour arrival windows + ETA texts.", href: "/products/bookflow" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after fix sign-off.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "0", label: "Wrong-part return trips" },
      { stat: "< 5 min", label: "Quote turnaround" },
      { stat: "$185", label: "Avg diagnostic price" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Fridge nameplate photo in the call, parts on the truck, fixed in one trip. That's a 5-star review every time.",
  },
  {
    slug: "for-junk-removal",
    trade: "Junk Removal",
    headline: "Quote by volume and book same-day pickups",
    subheadline: "Photos during the call, same-day route optimization, hazardous + e-waste pricing baked in.",
    heroIcon: Trash2,
    painPoints: [
      "Volume + item type photos save hours of estimating",
      "Hazardous + e-waste + mattress need disposal fees",
      "Stairs + elevator + gate code matters on arrival",
      "Same-day vs next-day pricing tiers blur",
      "Half-truck vs full-truck = 2x price spread",
    ],
    recommendedStack: [
      { name: "TradeLine™", icon: "phone", desc: "Photo + access-note intake.", href: "/products/tradeline" },
      { name: "QuoteQuick™", icon: "calculator", desc: "Per-volume + hazardous-fee pricing.", href: "/products/quickquotepro" },
      { name: "BookFlow™", icon: "layers", desc: "Same-day route optimization.", href: "/products/bookflow" },
      { name: "ReputationShield™", icon: "shield", desc: "Reviews after cleared yard.", href: "/products/reputationshield" },
    ],
    outcomes: [
      { stat: "< 5 min", label: "Quote turnaround" },
      { stat: "+72%", label: "Same-day bookings" },
      { stat: "$385", label: "Avg half-truck price" },
      { stat: "4.9★", label: "Avg review rating" },
    ],
    testimonialPlaceholder: "Photos in the call, quote in the call, hauled by noon. We win every same-day search now.",
  },
];

function getSolutionBySlug(slug: string): SolutionConfig | undefined {
  // Try direct match first ("for-plumbers"), then with the "for-" prefix
  // ("plumbers" → "for-plumbers") so legacy / shorter URLs still resolve.
  const direct = SOLUTIONS.find((s) => s.slug === slug);
  if (direct) return direct;
  if (!slug.startsWith("for-")) {
    return SOLUTIONS.find((s) => s.slug === `for-${slug}`);
  }
  return undefined;
}

export default function SolutionPage() {
  const params = useParams<{ slug: string }>();
  const solution = getSolutionBySlug(params.slug || "");

  useScrollReveal();

  if (!solution) return <NotFound />;

  return (
    <MarketingLayout>
      <PageMeta
        title={`Solutions for ${solution.trade}`}
        description={solution.subheadline}
        canonical={`/solutions/${solution.slug}`}
      />
      <V7PageShell>
      <div data-testid={`solution-page-${solution.slug}`}>
        {/* Wave 13 — split-layout hero with per-trade animated visual.
            Chip is FOR {TRADE} in white, title lifted, tagline removed,
            subtitle kept to one line. Trade slug routes the registry to
            the correct animation; unknown trades get the generic fallback. */}
        <SplitHero
          chip={`For ${solution.trade}`.toUpperCase()}
          title={solution.headline}
          subtitle={solution.subheadline}
          ctaPrimary={{ label: "See Pricing", href: "/pricing" }}
          ctaSecondary={{ label: "Watch Demos", href: "/demos" }}
          animation={<TradeHeroAnimation slug={solution.slug} />}
        />

        <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="solution-pain-points">
          <div style={{ maxWidth: 800, margin: "0 auto" }} data-reveal="fade-up">
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                Sound Familiar?
              </div>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em" }}>
                Common challenges for {solution.trade.toLowerCase()}
              </h2>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {solution.painPoints.map((p) => (
                <li
                  key={p}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.5,
                    padding: "14px 18px", background: mkt.sectionLight,
                    borderRadius: 12, border: `1px solid ${mkt.onDarkBorder}`,
                  }}
                >
                  <span style={{ color: mkt.orange, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>&bull;</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="solution-outcomes">
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em" }}>
                Results you can expect
              </h2>
            </div>
            <div
              className="solution-stats-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}
              data-reveal="fade-up"
            >
              {solution.outcomes.map((o) => (
                <div
                  key={o.label}
                  style={{
                    textAlign: "center",
                    background: mkt.bg,
                    border: `1px solid ${mkt.onDarkBorder}`,
                    borderRadius: 16,
                    padding: "28px 16px",
                    boxShadow: shadows.card,
                  }}
                >
                  <div style={{ fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 700, color: mkt.accent, marginBottom: 8 }}>
                    {o.stat}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: mkt.onDarkMuted, lineHeight: 1.4 }}>
                    {o.label}
                  </div>
                </div>
              ))}
            </div>
            <style>{`@media (max-width: 700px) { .solution-stats-grid { grid-template-columns: repeat(2, 1fr) !important; } }`}</style>
          </div>
        </section>

        <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="solution-stack">
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                Recommended Stack
              </div>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em" }}>
                The perfect toolkit for {solution.trade.toLowerCase()}
              </h2>
            </div>
            <div
              className="solution-stack-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}
            >
              {solution.recommendedStack.map((product, i) => (
                <Link
                  key={product.name}
                  href={product.href}
                  style={{ textDecoration: "none", color: "inherit" }}
                  data-testid={`solution-product-${i}`}
                >
                  <div
                    data-reveal="fade-up"
                    data-delay={String((i + 1) * 100)}
                    className="mkt-feature-card"
                    style={{
                      background: mkt.bg,
                      border: `1px solid ${mkt.onDarkBorder}`,
                      borderRadius: 18,
                      padding: "28px 24px",
                      cursor: "pointer",
                      boxShadow: shadows.card,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      transition: "border-color 0.3s ease, box-shadow 0.3s ease",
                    }}
                  >
                    <div style={{ marginBottom: 16 }}>
                      <IconBadge name={product.icon} size={24} />
                    </div>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: mkt.onDark, marginBottom: 10, lineHeight: 1.3 }}>
                      {product.name}
                    </h3>
                    <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, margin: 0, flex: 1 }}>
                      {product.desc}
                    </p>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: mkt.accent, marginTop: 16 }}>
                      Learn more <ArrowRight size={14} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            background: `linear-gradient(180deg, ${mkt.darkHover} 0%, ${mkt.dark} 100%)`,
            padding: "64px 28px",
          }}
          data-testid="solution-outcome-example"
        >
          <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: mkt.accent,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                margin: "0 0 14px",
              }}
            >
              Sample outcome · {solution.trade}
            </p>
            <p style={{ fontSize: "clamp(17px, 2vw, 22px)", color: mkt.onDark, lineHeight: 1.6, fontWeight: 500, margin: "0 0 18px" }}>
              {solution.testimonialPlaceholder}
            </p>
            <p style={{ fontSize: 13, color: mkt.onDarkFaint, margin: 0, lineHeight: 1.6, maxWidth: 520, marginInline: "auto" }}>
              Illustrative scenario built from the workflow above. We publish real customer stories
              with full names once we have their written consent.
            </p>
          </div>
        </section>

        <section
          style={{
            background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
            padding: "80px 28px",
            textAlign: "center",
          }}
          data-testid="solution-bottom-cta"
        >
          <div style={{ maxWidth: 600, margin: "0 auto" }} data-reveal="scale">
            <h2 style={{ fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em", marginBottom: 16, lineHeight: 1.1 }}>
              Ready to grow your {solution.trade.toLowerCase()} business?
            </h2>
            <p style={{ fontSize: 16, color: mkt.onDarkMuted, lineHeight: 1.65, marginBottom: 36, maxWidth: 460, margin: "0 auto 36px" }}>
              Join hundreds of trades businesses using WeFixTrades to win more jobs on autopilot.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/wizard"
                data-testid="solution-bottom-cta-start"
                className="mkt-btn-primary"
                style={{ display: "inline-block", padding: "15px 36px", borderRadius: 9999, background: mkt.onDark, color: mkt.accent, fontSize: 16, fontWeight: 700, textDecoration: "none" }}
              >
                Start Free
              </Link>
              <Link
                href="/pricing"
                data-testid="solution-bottom-cta-pricing"
                className="mkt-btn-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 28px", borderRadius: 9999, background: "transparent", color: mkt.onDark, fontSize: 15, fontWeight: 600, textDecoration: "none", border: `1.5px solid ${mkt.onDarkBorder}` }}
              >
                See Pricing
              </Link>
            </div>
          </div>
        </section>

      </div>
      </V7PageShell>
    </MarketingLayout>
  );
}
