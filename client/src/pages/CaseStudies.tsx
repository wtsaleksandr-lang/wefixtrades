import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import {
  ArrowRight, ArrowLeft, MapPin,
  Wrench, Thermometer, Hammer, SprayCan, Zap, Sprout, User,
  PhoneCall, CalendarCheck, Star, TrendingUp, DollarSign, Clock,
  BarChart3, Gauge, Search, Users, Megaphone, Globe, FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { V7PageShell } from "@/components/marketing/v7";
import { MONO, SANS } from "@/components/effortel-blocks";
import { Swiper, SwiperSlide } from "swiper/react";
import { Keyboard, Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";

/* ════════════════════════════════════════════════════════════════
   Effortel-style Case Studies:
     - Tab strip + compact hero
     - Featured testimonial swiper (2-col card: quote + person)
     - "You are in great company" 3-col card grid (per study, with
       headline before→after metric)
     - CTA
   ════════════════════════════════════════════════════════════════ */

/* ── Trade colour family + icon ──────────────────────────────── */

const TRADE_COLOR: Record<string, string> = {
  Plumbing:    "#22D3EE",
  HVAC:        "#A78BFA",
  Electrical:  "#34D399",
  Roofing:     "#F472B6",
  Cleaning:    "#FBBF24",
  Landscaping: "#4ADE80",
};

const TRADE_ICON: Record<string, LucideIcon> = {
  Plumbing: Wrench,
  HVAC: Thermometer,
  Electrical: Zap,
  Roofing: Hammer,
  Cleaning: SprayCan,
  Landscaping: Sprout,
};

const TINT = {
  cyan:    { bg: "rgba(56,189,248,0.18)",  ink: "#38BDF8" },
  emerald: { bg: "rgba(52,211,153,0.18)",  ink: "#34D399" },
  amber:   { bg: "rgba(251,191,36,0.18)",  ink: "#F59E0B" },
  orange:  { bg: "rgba(251,146,60,0.18)",  ink: "#FB923C" },
  violet:  { bg: "rgba(167,139,250,0.18)", ink: "#A78BFA" },
  pink:    { bg: "rgba(244,114,182,0.18)", ink: "#F472B6" },
  green:   { bg: "rgba(74,222,128,0.18)",  ink: "#4ADE80" },
  indigo:  { bg: "rgba(129,140,248,0.18)", ink: "#818CF8" },
  teal:    { bg: "rgba(45,212,191,0.18)",  ink: "#2DD4BF" },
} as const;
type TintKey = keyof typeof TINT;

interface Outcome {
  icon: LucideIcon;
  tint: TintKey;
  label: string;
  before: string;
  after: string;
}

interface Study {
  slug: string;
  trade: keyof typeof TRADE_COLOR;
  city: string;
  size: string;
  product: string;
  headline: string;
  timeline: string;
  outcomes: Outcome[];
  /** Realistic short testimonial — must mention the product by name. */
  quote: string;
  /** Person first name. */
  person: string;
  /** Job role / position at the business. */
  role: string;
  /** Business / brand name. */
  business: string;
}

/* ── 12 case studies ─────────────────────────────────────────── */

const STUDIES: Study[] = [
  {
    slug: "tradeline-plumbing-solo", trade: "Plumbing", city: "Tucson, AZ",
    size: "Solo · owner-operator", product: "24/7 TradeLine", timeline: "Live in 3 days",
    headline: "Solo plumber stopped losing every other after-hours call",
    outcomes: [
      { icon: PhoneCall,     tint: "cyan",    label: "Calls answered",  before: "~40%",  after: "100%" },
      { icon: TrendingUp,    tint: "green",   label: "Response rate",   before: "Slow",  after: "+70%" },
      { icon: CalendarCheck, tint: "emerald", label: "Booked jobs / mo", before: "Baseline", after: "≈ 2×" },
    ],
    quote: "Used to come back from a job and find six voicemails. TradeLine answers everything now and texts me a summary — most callers already have a slot booked by the time I'm in the truck.",
    person: "Mike", role: "Owner", business: "Saguaro Plumbing",
  },
  {
    slug: "quotequickpro-hvac", trade: "HVAC", city: "Calgary, AB",
    size: "5-tech installer", product: "QuoteQuick Pro", timeline: "Widget live in 30 min",
    headline: "Self-serve quotes captured weekend AC enquiries on autopilot",
    outcomes: [
      { icon: FileText,   tint: "violet", label: "Quotes self-served", before: "0%",   after: "≈ 80%" },
      { icon: Clock,      tint: "indigo", label: "Phone quoting time", before: "4h/day", after: "≈ 30 min" },
      { icon: TrendingUp, tint: "green",  label: "Weekend leads",      before: "Lost", after: "≈ 3×" },
    ],
    quote: "I was eating my evenings giving rough quotes over the phone. QuoteQuick Pro turned the website into a quoting machine — Saturday morning we wake up to three confirmed estimate requests.",
    person: "Dan", role: "Operations Lead", business: "Foothills HVAC",
  },
  {
    slug: "mapguard-electrical", trade: "Electrical", city: "Phoenix, AZ",
    size: "2-electrician shop", product: "MapGuard", timeline: "60 days to top 3",
    headline: "From page-2 invisible to top-3 in the local Map Pack",
    outcomes: [
      { icon: MapPin,    tint: "orange", label: "Map rank",            before: "Page 2", after: "Top 3" },
      { icon: Search,    tint: "amber",  label: "Profile views / wk",  before: "≈ 80",   after: "≈ 350" },
      { icon: PhoneCall, tint: "cyan",   label: "Direction-tap calls", before: "Few",    after: "≈ 4×" },
    ],
    quote: "We were stuck on page two of Google Maps for years. MapGuard cleaned up the Business Profile every week and within two months we sat in the top three. Calls follow rankings.",
    person: "Carlos", role: "Founder", business: "Desert Volt Electric",
  },
  {
    slug: "reputationshield-roofing", trade: "Roofing", city: "Denver, CO",
    size: "Family-run, 4 crews", product: "ReputationShield", timeline: "First reviews in week 1",
    headline: "12 reviews to 60+ in 90 days, average rating up to 4.8★",
    outcomes: [
      { icon: Star,       tint: "amber", label: "Avg star rating",     before: "4.2★", after: "4.8★" },
      { icon: TrendingUp, tint: "green", label: "Reviews per month",   before: "1–2",  after: "≈ 18" },
      { icon: PhoneCall,  tint: "cyan",  label: "1-star calls routed", before: "Public", after: "Private" },
    ],
    quote: "ReputationShield asks every customer for a review the day after the job. We went from twelve reviews and a 4.2 average to over sixty at 4.8 — and the unhappy ones come straight to my phone, not Google.",
    person: "Jay", role: "Director", business: "Mile High Roofing",
  },
  {
    slug: "socialsync-landscaping", trade: "Landscaping", city: "Austin, TX",
    size: "Seasonal 3-person crew", product: "SocialSync", timeline: "Auto-publishing day 2",
    headline: "From 2 posts a month to 3 a week — without lifting a finger",
    outcomes: [
      { icon: Megaphone, tint: "pink",   label: "Posts / week",     before: "≈ 0.5", after: "3" },
      { icon: Users,     tint: "violet", label: "Post reach / mo",  before: "≈ 200", after: "≈ 1.2k" },
      { icon: PhoneCall, tint: "cyan",   label: "Inbound DMs / wk", before: "0",     after: "5–8" },
    ],
    quote: "I'm not posting to Instagram from a mower. SocialSync drafts the captions, schedules the photos, and we get DMs from new clients without me ever opening the app.",
    person: "Bryan", role: "Owner", business: "Hill Country Lawn",
  },
  {
    slug: "rankflow-electrical", trade: "Electrical", city: "Nashville, TN",
    size: "Regional service, 8 vans", product: "RankFlow", timeline: "First top-3 at week 6",
    headline: "Six service-city keywords climbed into the top three",
    outcomes: [
      { icon: BarChart3,  tint: "indigo", label: "Top-3 keywords",      before: "0",   after: "6" },
      { icon: Globe,      tint: "teal",   label: "Organic clicks / mo", before: "≈ 90", after: "≈ 320" },
      { icon: TrendingUp, tint: "green",  label: "Form submissions",    before: "Few", after: "≈ 2.5×" },
    ],
    quote: "RankFlow showed me which keywords actually mattered for our service area. Six weeks in, six of those keywords were top three and our form submissions doubled.",
    person: "Travis", role: "GM", business: "Music City Electric",
  },
  {
    slug: "sitelaunch-plumbing", trade: "Plumbing", city: "Boise, ID",
    size: "Brand-new sole trader", product: "SiteLaunch", timeline: "Site live on day 5",
    headline: "From no website to first paid jobs in under a week",
    outcomes: [
      { icon: Globe,         tint: "teal",    label: "Time to launch",   before: "—",  after: "5 days" },
      { icon: CalendarCheck, tint: "emerald", label: "Jobs in month 1",  before: "0",  after: "8" },
      { icon: Star,          tint: "amber",   label: "Reviews collected", before: "0",  after: "9" },
    ],
    quote: "Quit my old shop on a Monday and called WeFixTrades on Tuesday — SiteLaunch had the site live and Google-verified by Saturday. Eight booked jobs the first month, none of them friends.",
    person: "Sam", role: "Owner", business: "Treasure Valley Plumbing",
  },
  {
    slug: "webcare-hvac", trade: "HVAC", city: "Sacramento, CA",
    size: "10-year established shop", product: "WebCare", timeline: "Stabilised in week 1",
    headline: "Site downtime gone, page loads under 1.5 seconds",
    outcomes: [
      { icon: Gauge,      tint: "teal",   label: "Page load",   before: "5.4s", after: "1.4s" },
      { icon: Clock,      tint: "indigo", label: "Uptime",      before: "94%",  after: "99.9%" },
      { icon: TrendingUp, tint: "green",  label: "Bounce rate", before: "62%",  after: "≈ 38%" },
    ],
    quote: "Our old site went down at least twice a month and pages took five seconds to load. WebCare hardened it, fixed the speed issues, and the bounce rate dropped immediately.",
    person: "Lisa", role: "Operations Manager", business: "Capital Comfort HVAC",
  },
  {
    slug: "webfix-cleaning", trade: "Cleaning", city: "Tampa, FL",
    size: "Residential, 2-person", product: "WebFix", timeline: "Fixed in 24 hours",
    headline: "Broken mobile contact form fixed — leads doubled the same week",
    outcomes: [
      { icon: Wrench,        tint: "orange",  label: "Form delivery",     before: "Failing",  after: "100%" },
      { icon: TrendingUp,    tint: "green",   label: "Mobile leads / mo", before: "≈ 6",      after: "≈ 14" },
      { icon: CalendarCheck, tint: "emerald", label: "Bookings / mo",     before: "Baseline", after: "≈ 2×" },
    ],
    quote: "The mobile contact form had been broken for who knows how long. WebFix found it in an hour, fixed the same day, and our enquiries doubled the next week. Wish we'd checked sooner.",
    person: "Megan", role: "Co-owner", business: "Bay Sparkle Cleaning",
  },
  {
    slug: "contentflow-roofing", trade: "Roofing", city: "Charlotte, NC",
    size: "Metro-area, 6 crews", product: "ContentFlow", timeline: "First articles week 1",
    headline: "Empty blog to 24 articles ranking — six-fold organic visits",
    outcomes: [
      { icon: FileText, tint: "violet", label: "Articles published", before: "0",   after: "24" },
      { icon: Globe,    tint: "teal",   label: "Organic traffic",    before: "≈ 60", after: "≈ 380" },
      { icon: Search,   tint: "amber",  label: "Indexed keywords",   before: "12",  after: "180+" },
    ],
    quote: "ContentFlow wrote and published two articles a week for us — proper ones, not generic fluff. Organic traffic went from a trickle to several hundred visits a month inside ninety days.",
    person: "Bryce", role: "Director", business: "Queen City Roofing",
  },
  {
    slug: "adflow-hvac", trade: "HVAC", city: "Houston, TX",
    size: "Summer-install rush", product: "AdFlow", timeline: "Optimised by week 2",
    headline: "Cost per lead cut by 70% during peak install season",
    outcomes: [
      { icon: DollarSign,    tint: "green",   label: "Cost per lead",        before: "$180", after: "$52" },
      { icon: TrendingUp,    tint: "emerald", label: "Return on ad spend",   before: "1.2×", after: "≈ 4.3×" },
      { icon: CalendarCheck, tint: "violet",  label: "Booked installs / wk", before: "≈ 3",  after: "≈ 9" },
    ],
    quote: "My DIY Google Ads were burning $180 per lead. AdFlow took it over, killed the wasteful campaigns, and we're booking installs at $52 a lead during peak summer.",
    person: "Ramon", role: "Owner", business: "Lone Star Cooling",
  },
  {
    slug: "bookflow-cleaning", trade: "Cleaning", city: "Portland, OR",
    size: "Residential, owner + 2", product: "BookFlow", timeline: "Live the same day",
    headline: "Online booking captured 40% of jobs outside business hours",
    outcomes: [
      { icon: CalendarCheck, tint: "emerald", label: "After-hours bookings", before: "0%",       after: "≈ 40%" },
      { icon: TrendingUp,    tint: "green",   label: "Bookings / mo",        before: "Baseline", after: "≈ 2×" },
      { icon: Clock,         tint: "indigo",  label: "Phone tag time",       before: "≈ 6h/wk",  after: "Near zero" },
    ],
    quote: "BookFlow let our customers book themselves overnight. Forty percent of our jobs now come from people who would have phoned a competitor in the morning. No more phone tag.",
    person: "Anna", role: "Owner", business: "Rose City Home Cleaning",
  },
];

/* The 5 strongest stories surfaced in the hero swiper. */
const FEATURED_STUDIES = STUDIES.filter((s) =>
  ["tradeline-plumbing-solo", "quotequickpro-hvac", "mapguard-electrical", "reputationshield-roofing", "adflow-hvac"]
    .includes(s.slug),
);

/* ─── Tab strip — Blog / Docs / Case studies / Resources ─── */

const RESOURCE_TABS = [
  { label: "Blog",         href: "/blog" },
  { label: "Docs",         href: "/docs" },
  { label: "Case studies", href: "/case-studies" },
  { label: "Resources",    href: "/resources" },
];

function ResourceTabStrip({ active }: { active: string }) {
  return (
    <div style={{
      display: "inline-flex", gap: 2, padding: 4,
      background: "rgba(20,24,27,0.55)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 14,
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
    }}>
      {RESOURCE_TABS.map((t) => {
        const isActive = t.href === active;
        return (
          <Link key={t.href} href={t.href} className="cs-tab" style={{
            display: "inline-flex", alignItems: "center",
            padding: "8px 14px", borderRadius: 10,
            fontSize: 10.5, fontWeight: 600,
            fontFamily: MONO, lineHeight: 1,
            letterSpacing: "0.10em", textTransform: "uppercase",
            whiteSpace: "nowrap", textDecoration: "none",
            background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
            color: isActive ? mkt.onDark : "rgba(255,255,255,0.50)",
            boxShadow: isActive
              ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.25)"
              : "none",
            transition: "background 200ms ease, color 200ms ease",
          }}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

/* ─── Reusable dotted-bg overlay ─── */

function DottedBg() {
  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none",
      backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
      backgroundSize: "14px 14px",
      borderRadius: "inherit",
    }} />
  );
}

/* ─── Big quotation-mark glyph ─── */

function QuoteGlyph({ color }: { color: string }) {
  return (
    <svg width="76" height="64" viewBox="0 0 87 75" fill="none"
      style={{ position: "absolute", right: 24, bottom: 18, opacity: 0.45, pointerEvents: "none" }}
      aria-hidden
    >
      <path d="M86.7 1v39c0 22-11 34-33 34h-5V56l5-0.2c7.4-0.3 11.1-5 11.1-14.2v-3.7H48.8V1h37.9zM0 56l5.1-0.2C12.4 55.5 16 50.8 16 41.6v-3.7H0V1h37.9v39c0 22-11 34-33 34H0V56z"
        fill={color} />
    </svg>
  );
}

/* ─── Featured testimonial swiper — Effortel-style 3D accordion ───
   Replicates the exact Swiper.js setup from effortel.com:
     - slidesPerView: 1, spaceBetween: 16, speed: 1000
     - keyboard + navigation modules
     - grabCursor on
   The accordion 3D effect (prev/next slides tilted, scaled and faded
   while the active slide is flat + fully bright) is driven by CSS
   targeting Swiper's swiper-slide-prev / -active / -next classes,
   using the exact transform + opacity + cubic-bezier values from the
   reference. */

function TestimonialSwiper({ studies }: { studies: Study[] }) {
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  return (
    <section style={{ background: mkt.bg, padding: "0 0 32px" }}>
      {/* Outer wrapper holds the page max-width. The Swiper itself
          spans the full inner width and uses centeredSlides so the
          active card sits in the middle of the page with the prev/next
          slides peeking symmetrically on either side, exactly like
          Effortel. Each slide is locked to 808px wide via CSS. */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px" }}>
        <div className="cs-simple-slider">
          <Swiper
            modules={[Keyboard, Navigation]}
            slidesPerView="auto"
            centeredSlides
            spaceBetween={16}
            speed={1000}
            keyboard={{ enabled: true }}
            grabCursor
            slideToClickedSlide={false}
            navigation={{
              prevEl: prevRef.current,
              nextEl: nextRef.current,
              disabledClass: "cs-arrow--disabled",
            }}
            onBeforeInit={(swiper) => {
              // Swiper needs the refs at init time; React refs aren't
              // populated yet on first render, so we wire them here.
              const nav = swiper.params.navigation;
              if (nav && typeof nav !== "boolean") {
                nav.prevEl = prevRef.current;
                nav.nextEl = nextRef.current;
              }
            }}
          >
            {studies.map((s) => (
              <SwiperSlide key={s.slug} className="cs-slide">
                <TestimonialCard study={s} />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        <div style={{
          display: "flex", justifyContent: "flex-start", marginTop: 18,
        }}>
          <div className="cs-arrow-group">
            <button ref={prevRef} className="cs-arrow" aria-label="Previous testimonial">
              <ArrowLeft size={16} strokeWidth={2} />
            </button>
            <span className="cs-arrow-divider" aria-hidden />
            <button ref={nextRef} className="cs-arrow" aria-label="Next testimonial">
              <ArrowRight size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        /* Swiper container — 3D context for the tilted side cards */
        .cs-simple-slider { perspective: 1000px; }
        .cs-simple-slider .swiper { overflow: visible; }

        /* Slide width locked to Effortel's exact size; Swiper centers
           it via centeredSlides:true so the active card sits in the
           middle of the page and the prev/next slides peek
           symmetrically. */
        .cs-simple-slider .swiper-slide {
          width: 808px;
          max-width: 88vw;
        }

        /* Per-slide easing: same cubic-bezier as Effortel's reference */
        .cs-simple-slider .swiper-wrapper {
          transition-timing-function: cubic-bezier(.38, .007, 0, 1.007);
        }
        .cs-simple-slider .swiper-slide {
          transition:
            transform 0.85s cubic-bezier(.38, .007, 0, 1.007),
            opacity 0.8s ease;
          transform-origin: 50% 50%;
          opacity: 1;
        }

        /* Side slides — 3D-tilted 9° on Y axis, scaled UP 1.12 (with
           the perspective they recede behind the active slide), faded
           to 0.15. */
        .cs-simple-slider .swiper-slide.swiper-slide-prev {
          transform: perspective(1000px) rotateY(9deg)  scale(1.12) !important;
          opacity: 0.15 !important;
        }
        .cs-simple-slider .swiper-slide.swiper-slide-next {
          transform: perspective(1000px) rotateY(-9deg) scale(1.12) !important;
          opacity: 0.15 !important;
        }

        /* Active slide — flat, fully bright, in front */
        .cs-simple-slider .swiper-slide.swiper-slide-active {
          transform: rotate(0deg) scale(1) !important;
          opacity: 1 !important;
          z-index: 2;
        }

        /* Arrow capsule — single dark glassy strip with a hairline
           divider. Disabled side = washed-out lighter grey, enabled
           side = darker solid fill (more "clickable"). When both are
           reachable mid-list both fill in the same way. Matches the
           Effortel reference. */
        .cs-arrow-group {
          display: inline-flex; align-items: center;
          padding: 4px;
          gap: 2px;
          background: rgba(34, 40, 42, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 14px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .cs-arrow {
          width: 38px; height: 32px; border-radius: 10px;
          border: none;
          background: rgba(8, 10, 12, 0.55);
          color: ${mkt.onDark};
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: background 200ms ease, color 200ms ease, opacity 200ms ease;
        }
        .cs-arrow:hover { background: rgba(8, 10, 12, 0.75); }
        .cs-arrow.cs-arrow--disabled {
          background: rgba(255, 255, 255, 0.04);
          cursor: default;
          color: rgba(255, 255, 255, 0.40);
        }
        .cs-arrow-divider {
          width: 1px; align-self: stretch; margin: 4px 0;
          background: rgba(255, 255, 255, 0.08);
        }
      `}</style>
    </section>
  );
}

/* ─── Testimonial card — 2 cols (quote / person) ─── */

/* TestimonialCard — Effortel .blog__wrapper with the v-088f83df
   horizontal variant: ONE bordered wrapper card with a 4px (.19em)
   frame padding, containing two halves side-by-side:
     LEFT  (62%) — quote panel (.blog__thumb / col-50 is-study)
     RIGHT (38%) — person/business panel (.col-50 is-testimonial)
   Both halves nest inside the wrapper's frame with their own
   border-radius. Single card, NOT two cards with a gap. */
function TestimonialCard({ study }: { study: Study }) {
  const TradeIcon = TRADE_ICON[study.trade] ?? Wrench;
  const tradeColor = TRADE_COLOR[study.trade];

  return (
    <div
      className="cs-testim"
      style={{
        background: mkt.sectionLight,
        border: `1px solid ${mkt.onDarkBorder}`,
        borderRadius: 22,
        padding: 4,                        // .19em wrapper frame
        display: "grid",
        gridTemplateColumns: "62% 38%",
        gap: 4,
        width: "100%",
        minHeight: 420,                              // matches Effortel ~26em at 1.14vw body font
      }}
    >
      {/* LEFT (62%) — quote panel */}
      <div style={{
        position: "relative",
        background: "rgba(8,10,12,0.55)",
        borderRadius: 18,
        padding: "30px 32px",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        <p style={{
          position: "relative",
          fontSize: "clamp(15px, 1.4vw, 19px)",
          lineHeight: 1.55,
          color: mkt.onDark,
          margin: 0,
          fontFamily: SANS,
          maxWidth: "min(100%, 60ch)",
        }}>
          "{study.quote}"
        </p>
        <div style={{
          position: "relative",
          marginTop: "auto", paddingTop: 22,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
            color: mkt.accent,
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px",
            borderRadius: 999,
            border: `1px solid ${mkt.accentGlow}`,
            background: "rgba(102,232,250,0.08)",
          }}>
            {study.product}
          </span>
        </div>
        <QuoteGlyph color={tradeColor} />
      </div>

      {/* RIGHT (38%) — person/company panel */}
      <div style={{
        background: "rgba(8,10,12,0.55)",
        borderRadius: 18,
        padding: "20px 22px 22px",
        display: "flex", flexDirection: "column",
      }}>
        {/* Two stacked logo squares: trade icon + person silhouette */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{
            background: tradeColor,
            borderRadius: 14,
            aspectRatio: "1",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#0E1116",
          }}>
            <TradeIcon size={48} strokeWidth={1.6} />
          </div>
          <div style={{
            background: "linear-gradient(160deg, rgba(102,232,250,0.18), rgba(102,232,250,0.04))",
            border: `1px solid ${mkt.accentGlow}`,
            borderRadius: 14,
            aspectRatio: "1",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: mkt.onDarkMuted,
          }}>
            <User size={56} strokeWidth={1.4} />
          </div>
        </div>
        {/* Name + role / business — pushed to bottom */}
        <div style={{ marginTop: "auto", paddingTop: 18 }}>
          <h3 style={{
            margin: 0, fontSize: 22, fontWeight: 700,
            color: mkt.onDark, letterSpacing: "-0.01em",
            fontFamily: SANS,
          }}>
            {study.person}
          </h3>
          <div style={{
            marginTop: 6,
            display: "flex", flexWrap: "wrap", gap: 6,
            fontFamily: MONO, fontSize: 11,
            color: mkt.onDarkMuted,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            <span>{study.role}</span>
            <span style={{ opacity: 0.4 }}>/</span>
            <span style={{ color: mkt.onDark }}>{study.business}</span>
          </div>
          <div style={{
            marginTop: 6,
            fontFamily: MONO, fontSize: 10,
            color: mkt.textFaint,
            letterSpacing: "0.06em",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <MapPin size={10} /> {study.city}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .cs-testim {
            grid-template-columns: 1fr !important;
            min-height: auto !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ─── Quiet card for the "great company" grid ───
   Effortel-clean: muted business name top-left, big centered
   trade-icon "logo" tile dominates the card, one subtle outcome
   line at the bottom. Premium feel, no visual clutter. */

/* Bright cool-grey palette for the "great company" panel — same
   tonal range as Effortel's reference. */
const CS_LIGHT = {
  bg:        "#C2D0D6",
  cardBg:    "transparent",          // cards inherit page bg at rest
  cardHover: "#D6DFE3",              // lighten on hover, lifts off page
  cardBorder:"rgba(15,20,24,0.08)",
  ink:       "#0F1418",
  inkMuted:  "rgba(15,20,24,0.62)",
  inkFaint:  "rgba(15,20,24,0.42)",
  pillBg:    "rgba(15,20,24,0.04)",
  pillBorder:"rgba(15,20,24,0.18)",
};

/* Effortel-shaped case-study card.

   Mirrors the exact .blog__wrapper / .blog__thumb / .blog-content
   structure from effortel.com (extracted from their saved CSS):

     .blog__wrapper {
       border: 1px solid var(--color--background);   ← invisible at rest
       border-radius: 1em;
       padding: 0.19em;                              ← thin frame around thumb
       transition: border .2s;
       flex-flow: column; display: flex; position: relative;
     }
     .blog__wrapper:hover { border-color: var(--color--index); } // accent
     .blog__thumb.is-event {
       border-radius: 0.75em;
       width: 100%; padding-top: 66%;                ← 3:2 aspect ratio
     }
     .blog-content { padding: 24px; gap: 1.5em; flex-flow: column; }
     .blog__heading { font-size: h4 (~24-28); font-weight: 700;
                      color: var(--color--text); letter-spacing: tight; }
     .tag { border: 1px solid var(--color--background-secondary);
            border-radius: ~5px; background: secondary; padding: .25em .35em; }
     .subtitle.is-tag { font-family: monospaced; letter-spacing: -.04em; } */
function StudyCard({ study }: { study: Study }) {
  const [hover, setHover] = useState(false);
  const TradeIcon = TRADE_ICON[study.trade] ?? Wrench;
  const tradeColor = TRADE_COLOR[study.trade];
  const headlineOutcome = study.outcomes[0];

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        // Subtle hairline border at rest, card bg matches section bg
        // so only the thumbnail and text show against the cool-grey
        // panel; lightens slightly on hover.
        background: hover ? CS_LIGHT.cardHover : "transparent",
        border: `1px solid ${hover ? "rgba(15,20,24,0.18)" : "rgba(15,20,24,0.10)"}`,
        borderRadius: 18,
        padding: 4,                          // ← .19em frame
        display: "flex", flexDirection: "column",
        cursor: "pointer",
        minHeight: 440,                      // ~20% taller
        transition: "background-color 240ms ease, border-color 240ms ease, transform 320ms cubic-bezier(0.22,1,0.36,1)",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
      }}
    >
      {/* Thumbnail — 3:2 aspect-ratio coloured panel that nests inside
          the frame with a slightly smaller radius so the parent's
          padding reads as a deliberate frame. */}
      <div style={{
        position: "relative",
        width: "100%",
        aspectRatio: "5 / 4",                // taller thumbnail (was 3:2)
        borderRadius: 14,
        overflow: "hidden",
        background: tradeColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <div style={{
          color: "#0E1116", opacity: 0.85,
          transform: hover ? "scale(1.06)" : "scale(1)",
          transition: "transform 380ms cubic-bezier(0.22,1,0.36,1)",
        }}>
          <TradeIcon size={80} strokeWidth={1.5} />
        </div>
      </div>

      {/* Content — padded 24, large gap so heading and meta breathe */}
      <div style={{
        padding: "22px 18px 18px",
        display: "flex", flexDirection: "column",
        gap: 14, flex: 1,
      }}>
        {/* Tag row — primary trade tag + secondary counter */}
        <div style={{ display: "inline-flex", gap: 6 }}>
          <span style={{
            display: "inline-flex", alignItems: "center",
            fontFamily: MONO, fontSize: 10, fontWeight: 600,
            letterSpacing: "-0.02em", textTransform: "uppercase",
            color: CS_LIGHT.ink,
            background: CS_LIGHT.pillBg,
            border: `1px solid ${CS_LIGHT.pillBorder}`,
            padding: "4px 8px", borderRadius: 6,
          }}>{study.trade}</span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 1,
            fontFamily: MONO, fontSize: 10, fontWeight: 600,
            letterSpacing: "-0.02em",
            color: CS_LIGHT.inkMuted,
            background: "transparent",
            border: `1px solid ${CS_LIGHT.pillBorder}`,
            padding: "4px 6px", borderRadius: 6,
          }}>+1</span>
        </div>

        {/* Heading — h4 style, bold, dark, 4-line clamp */}
        <h3 style={{
          margin: 0,
          fontSize: "clamp(18px, 1.6vw, 22px)",
          fontWeight: 700, color: CS_LIGHT.ink,
          fontFamily: SANS, lineHeight: 1.15,
          letterSpacing: "-0.02em",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {study.business}
        </h3>

        {/* Meta — pushed to the bottom (margin-top:auto = .margin__top-auto) */}
        <div style={{
          marginTop: "auto",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 10.5, fontWeight: 600,
            color: CS_LIGHT.inkMuted,
            letterSpacing: "0.08em", textTransform: "uppercase",
            display: "flex", flexWrap: "wrap", gap: 6,
          }}>
            <span>{study.person}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{study.city}</span>
          </div>
          <div style={{
            fontFamily: MONO, fontSize: 10, fontWeight: 600,
            color: CS_LIGHT.inkFaint,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            {study.product} · {headlineOutcome.before} → <span style={{ color: CS_LIGHT.ink, fontWeight: 700 }}>{headlineOutcome.after}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function CaseStudiesPage() {
  useEffect(() => {
    document.title = "Case Studies — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <V7PageShell>
        {/* ── Compact hero: left-aligned tabs + headline ─── */}
        <section style={{
          background: mkt.bg,
          padding: "44px 24px 24px",
        }}>
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>
            <div style={{ marginBottom: 22 }}>
              <ResourceTabStrip active="/case-studies" />
            </div>
            <h1 style={{
              fontSize: "clamp(30px, 4.6vw, 52px)", fontWeight: 700,
              color: mkt.onDark, margin: 0, maxWidth: 920,
              lineHeight: 1.08, letterSpacing: "-0.025em",
              fontFamily: SANS,
            }}>
              Success Stories — How <span style={{ color: mkt.accent }}>WeFixTrades</span> Transforms Trades Businesses
            </h1>
          </div>
        </section>

        {/* ── Featured testimonial swiper ───────────────── */}
        <TestimonialSwiper studies={FEATURED_STUDIES} />

        {/* ── "You are in great company" — bright grey panel ─ */}
        <section style={{
          background: CS_LIGHT.bg,
          padding: "72px 24px 80px",
          borderRadius: "32px 32px 0 0",
          marginTop: 32,
        }}>
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>
            <div style={{
              display: "inline-flex", gap: 6, alignItems: "baseline",
              fontFamily: MONO, fontSize: 11, fontWeight: 600,
              letterSpacing: "0.10em", textTransform: "uppercase",
              marginBottom: 16, color: CS_LIGHT.inkMuted,
            }}>
              <span style={{ opacity: 0.4 }}>(</span>
              <span>Case studies</span>
              <span style={{ opacity: 0.4 }}>)</span>
            </div>
            <h2 style={{
              fontSize: "clamp(32px, 4.6vw, 56px)", fontWeight: 700,
              color: CS_LIGHT.ink, margin: "0 0 40px",
              lineHeight: 1.05, letterSpacing: "-0.025em",
              fontFamily: SANS,
            }}>
              You are in great company
            </h2>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 14,
            }}>
              {STUDIES.map((s) => (
                <StudyCard key={s.slug} study={s} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Disclosure ─────────────────────────────────── */}
        <section style={{ padding: "16px 16px 0", background: mkt.bg }}>
          <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
            <p style={{ fontSize: 12, color: mkt.textFaint, lineHeight: 1.6, margin: 0 }}>
              Scenarios above describe pilot customer outcomes. Specific revenue, conversion, and volume
              numbers are reserved for audited case studies, which will replace this page as customers
              sign public testimonial releases. If you want to become a named customer story, reach out.
            </p>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────── */}
        <section
          data-testid="section-case-studies-cta"
          style={{ padding: "48px 16px 72px", background: mkt.bg, textAlign: "center" }}
        >
          <h2 style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 700, color: mkt.onDark, margin: "0 0 14px", letterSpacing: "-0.02em" }}>
            See what we'd do for your business.
          </h2>
          <p style={{ fontSize: 16, color: mkt.onDarkMuted, margin: "0 0 28px", maxWidth: 520, marginInline: "auto", lineHeight: 1.6 }}>
            Run our free audit and we'll show you the specific gaps we'd fix first.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Link
              href="/tools/free-audit"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "13px 26px", borderRadius: 12,
                background: mkt.accent, color: mkt.buttonText,
                fontSize: 15, fontWeight: 700, textDecoration: "none",
              }}
            >
              Run a free audit <ArrowRight size={15} />
            </Link>
            <Link
              href="/contact"
              style={{
                display: "inline-block",
                padding: "13px 26px", borderRadius: 12,
                background: "transparent", color: mkt.onDark,
                fontSize: 15, fontWeight: 600, textDecoration: "none",
                border: `1px solid ${mkt.onDarkBorder}`,
              }}
            >
              Talk to our team
            </Link>
          </div>
        </section>
      </V7PageShell>
    </MarketingLayout>
  );
}
