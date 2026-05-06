import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import {
  ArrowRight, ArrowLeft, ArrowUpRight, MapPin,
  Wrench, Thermometer, Hammer, SprayCan, Zap, Sprout, User,
  PhoneCall, CalendarCheck, Star, TrendingUp, DollarSign, Clock,
  BarChart3, Gauge, Search, Users, Megaphone, Globe, FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { V7PageShell } from "@/components/marketing/v7";
import { MONO, SANS } from "@/components/effortel-blocks";

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
      display: "inline-flex", gap: 4, padding: 4,
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${mkt.onDarkBorder}`,
      borderRadius: 999,
    }}>
      {RESOURCE_TABS.map((t) => {
        const isActive = t.href === active;
        return (
          <Link key={t.href} href={t.href} style={{
            display: "inline-flex", alignItems: "center",
            padding: "8px 18px", borderRadius: 999,
            fontSize: 13, fontWeight: 600,
            fontFamily: SANS, lineHeight: 1,
            whiteSpace: "nowrap", textDecoration: "none",
            background: isActive ? mkt.onDark : "transparent",
            color: isActive ? mkt.dark : mkt.onDarkMuted,
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

/* ─── Featured testimonial swiper ─── */

function TestimonialSwiper({ studies }: { studies: Study[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const updateButtons = () => {
    const el = ref.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  };

  useEffect(() => {
    updateButtons();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", updateButtons, { passive: true });
    window.addEventListener("resize", updateButtons);
    return () => {
      el.removeEventListener("scroll", updateButtons);
      window.removeEventListener("resize", updateButtons);
    };
  }, []);

  const scrollByCard = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = (card?.offsetWidth ?? 1000) + 16;
    el.scrollBy({ left: step * dir, behavior: "smooth" });
  };

  return (
    <section style={{ background: mkt.bg, padding: "0 0 32px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div
          ref={ref}
          className="cs-hide-scrollbar"
          style={{
            display: "flex", gap: 16,
            overflowX: "auto", overflowY: "hidden",
            scrollSnapType: "x mandatory",
            scrollPadding: "0 24px",
            padding: "8px 24px",
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {studies.map((s) => (
            <div
              key={s.slug}
              data-card
              style={{
                flex: "0 0 auto",
                width: "min(1040px, 92vw)",
                scrollSnapAlign: "start",
              }}
            >
              <TestimonialCard study={s} />
            </div>
          ))}
        </div>

        <div style={{
          display: "flex", justifyContent: "center", gap: 12, marginTop: 16,
        }}>
          <button
            onClick={() => scrollByCard(-1)}
            disabled={!canPrev}
            aria-label="Previous testimonial"
            style={arrowButton(canPrev)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={() => scrollByCard(1)}
            disabled={!canNext}
            aria-label="Next testimonial"
            style={arrowButton(canNext)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
      <style>{`.cs-hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
    </section>
  );
}

const arrowButton = (enabled: boolean): React.CSSProperties => ({
  width: 44, height: 44, borderRadius: "50%",
  border: `1px solid ${mkt.onDarkBorder}`,
  background: "rgba(255,255,255,0.04)",
  color: enabled ? mkt.onDark : mkt.onDarkMuted,
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: enabled ? "pointer" : "default",
  opacity: enabled ? 1 : 0.4,
  transition: "background 200ms ease, opacity 200ms ease",
});

/* ─── Testimonial card — 2 cols (quote / person) ─── */

function TestimonialCard({ study }: { study: Study }) {
  const TradeIcon = TRADE_ICON[study.trade] ?? Wrench;
  const tradeColor = TRADE_COLOR[study.trade];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr)",
      gap: 14,
      width: "100%",
      minHeight: 340,
    }} className="cs-testim">
      {/* Left col — quote card with dotted-bg */}
      <div style={{
        position: "relative",
        background: mkt.sectionLight,
        border: `1px solid ${mkt.onDarkBorder}`,
        borderRadius: 18,
        padding: "26px 30px",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        <DottedBg />
        <p style={{
          position: "relative",
          fontSize: "clamp(15px, 1.6vw, 19px)",
          lineHeight: 1.55,
          color: mkt.onDark,
          margin: 0,
          fontFamily: SANS,
          maxWidth: "min(100%, 56ch)",
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

      {/* Right col — person/company card */}
      <div style={{
        background: mkt.sectionLight,
        border: `1px solid ${mkt.onDarkBorder}`,
        borderRadius: 18,
        padding: 14,
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        {/* Two stacked logo squares: trade icon + person initial */}
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
        {/* Name + role / business */}
        <div>
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
          .cs-testim { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

/* ─── Compact metric card for the "great company" grid ─── */

function StudyCard({ study }: { study: Study }) {
  const [hover, setHover] = useState(false);
  const TradeIcon = TRADE_ICON[study.trade] ?? Wrench;
  const tradeColor = TRADE_COLOR[study.trade];
  const headlineOutcome = study.outcomes[0];
  const t = TINT[headlineOutcome.tint];

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        background: mkt.sectionLight,
        border: `1px solid ${hover ? "rgba(102,232,250,0.45)" : mkt.onDarkBorder}`,
        borderRadius: 18,
        padding: "22px 22px 24px",
        display: "flex", flexDirection: "column",
        gap: 18,
        minHeight: 260,
        transition: "transform 320ms cubic-bezier(0.22,1,0.36,1), border-color 320ms ease, box-shadow 320ms ease",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hover ? "0 18px 40px rgba(0,0,0,0.32)" : "0 0 0 rgba(0,0,0,0)",
        overflow: "hidden",
      }}
    >
      <DottedBg />

      {/* Header row: trade name + arrow */}
      <header style={{
        position: "relative",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <h3 style={{
          margin: 0, fontSize: 22, fontWeight: 700,
          color: mkt.onDark, letterSpacing: "-0.01em",
          fontFamily: SANS,
        }}>
          {study.business}
        </h3>
        <span style={{
          width: 30, height: 30, borderRadius: 8,
          background: hover ? mkt.accent : "rgba(255,255,255,0.06)",
          color: hover ? mkt.dark : mkt.onDarkMuted,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: "background 220ms ease, color 220ms ease",
        }}>
          <ArrowUpRight size={16} strokeWidth={2.2} />
        </span>
      </header>

      {/* Headline metric — before → after */}
      <div style={{ position: "relative", flex: 1 }}>
        <p style={{
          margin: 0,
          fontFamily: MONO, fontSize: 10, fontWeight: 700,
          color: t.ink, textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          {headlineOutcome.label}
        </p>
        <p style={{
          margin: "8px 0 0",
          fontSize: "clamp(22px, 2.6vw, 28px)",
          fontWeight: 800, color: mkt.onDark, lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}>
          <span style={{ color: mkt.textFaint, fontWeight: 500 }}>{headlineOutcome.before}</span>
          <span style={{ color: mkt.textFaint, margin: "0 10px" }}>→</span>
          <span style={{ color: t.ink }}>{headlineOutcome.after}</span>
        </p>
        <p style={{
          margin: "10px 0 0",
          fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.5,
          fontFamily: SANS, maxWidth: "32ch",
        }}>
          {study.headline}
        </p>
      </div>

      {/* Footer row: trade icon "logo" + product pill + city */}
      <footer style={{
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, paddingTop: 14,
        borderTop: `1px solid ${mkt.onDarkBorder}`,
      }}>
        <span style={{
          width: 42, height: 42, borderRadius: 10,
          background: tradeColor, color: "#0E1116",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <TradeIcon size={22} strokeWidth={1.7} />
        </span>
        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <span style={{
            fontFamily: MONO, fontSize: 10, fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
            color: mkt.accent,
            padding: "4px 10px", borderRadius: 999,
            border: `1px solid ${mkt.accentGlow}`,
            background: "rgba(102,232,250,0.08)",
            whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
            maxWidth: "100%",
          }}>
            {study.product}
          </span>
          <span style={{
            fontFamily: MONO, fontSize: 10,
            color: mkt.textFaint, letterSpacing: "0.06em",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}>
            <MapPin size={10} /> {study.city}
          </span>
        </div>
      </footer>
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
        {/* ── Compact hero: tabs + headline ─────────────── */}
        <section style={{
          background: mkt.bg,
          padding: "44px 24px 18px",
          textAlign: "center",
        }}>
          <div style={{ marginBottom: 18 }}>
            <ResourceTabStrip active="/case-studies" />
          </div>
          <h1 style={{
            fontSize: "clamp(30px, 4.6vw, 52px)", fontWeight: 700,
            color: mkt.onDark, margin: "0 auto", maxWidth: 920,
            lineHeight: 1.08, letterSpacing: "-0.025em",
            fontFamily: SANS,
          }}>
            Success Stories — How <span style={{ color: mkt.accent }}>WeFixTrades</span> Transforms Trades Businesses
          </h1>
        </section>

        {/* ── Featured testimonial swiper ───────────────── */}
        <TestimonialSwiper studies={FEATURED_STUDIES} />

        {/* ── "You are in great company" grid ───────────── */}
        <section style={{ background: mkt.bg, padding: "32px 24px 56px" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>
            <div style={{
              display: "inline-flex", gap: 6, alignItems: "baseline",
              fontFamily: MONO, fontSize: 11, fontWeight: 600,
              letterSpacing: "0.08em", textTransform: "uppercase",
              marginBottom: 12,
            }}>
              <span style={{ opacity: 0.3, color: mkt.onDarkMuted }}>(</span>
              <span style={{ color: mkt.onDarkMuted }}>Case studies</span>
              <span style={{ opacity: 0.3, color: mkt.onDarkMuted }}>)</span>
            </div>
            <h2 style={{
              fontSize: "clamp(28px, 4.2vw, 48px)", fontWeight: 700,
              color: mkt.onDark, margin: "0 0 28px",
              lineHeight: 1.1, letterSpacing: "-0.02em",
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
        <section style={{ padding: "8px 16px 0", background: mkt.bg }}>
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
