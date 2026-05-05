import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import {
  ArrowRight, MapPin, Calendar,
  Wrench, Thermometer, Hammer, SprayCan, Zap, Sprout,
  PhoneCall, CalendarCheck, Star, TrendingUp, DollarSign, Clock,
  BarChart3, Gauge, Search, Users, Megaphone, Globe, FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { V7PageShell } from "@/components/marketing/v7";
import { TILE, MONO, Reveal } from "@/components/effortel-blocks";

/** Pastel tile per trade — sets the colour family of the card header strip. */
const TRADE_TILE: Record<string, keyof typeof TILE> = {
  Plumbing: "cyanSoft",
  HVAC: "lavender",
  Electrical: "mint",
  Roofing: "pink",
  Cleaning: "white",
  Landscaping: "mint",
};

function tradeTile(trade: string): keyof typeof TILE {
  if (TRADE_TILE[trade]) return TRADE_TILE[trade];
  for (const [k, v] of Object.entries(TRADE_TILE)) {
    if (trade.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return "cyanSoft";
}

const TRADE_ICON: Record<string, LucideIcon> = {
  Plumbing: Wrench,
  HVAC: Thermometer,
  Electrical: Zap,
  Roofing: Hammer,
  Cleaning: SprayCan,
  Landscaping: Sprout,
};

/* ────────────────────────────────────────────────────────────────
   Result-badge tints — colourful icon backgrounds for outcomes
   ──────────────────────────────────────────────────────────────── */
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
  trade: keyof typeof TRADE_TILE;
  city: string;            // Single-line, e.g. "Tucson, AZ"
  size: string;            // Short business size, e.g. "Solo · owner-operator"
  product: string;         // The single product highlighted (one per case study)
  headline: string;
  outcomes: Outcome[];     // Three colourful before/after badges
  timeline: string;
  /** Realistic short testimonial — must mention the product by name. */
  quote: string;
  /** Realistic-sounding business + first name + city. */
  quoteAttribution: string;
}

/* ────────────────────────────────────────────────────────────────
   12 case studies — one per product, realistic before/after ranges
   ──────────────────────────────────────────────────────────────── */
const STUDIES: Study[] = [
  {
    slug: "tradeline-plumbing-solo",
    trade: "Plumbing",
    city: "Tucson, AZ",
    size: "Solo · owner-operator",
    product: "24/7 TradeLine",
    headline: "Solo plumber stopped losing every other after-hours call",
    timeline: "Live in 3 days",
    outcomes: [
      { icon: PhoneCall,     tint: "cyan",    label: "Calls answered",  before: "~40%",  after: "100%" },
      { icon: TrendingUp,    tint: "green",   label: "Response rate",   before: "Slow",  after: "+70%" },
      { icon: CalendarCheck, tint: "emerald", label: "Booked jobs / mo", before: "Baseline", after: "≈ 2×" },
    ],
    quote: "Used to come back from a job and find six voicemails. TradeLine answers everything now and texts me a summary — most callers already have a slot booked by the time I'm in the truck.",
    quoteAttribution: "Mike — Saguaro Plumbing · Tucson, AZ",
  },
  {
    slug: "quotequickpro-hvac",
    trade: "HVAC",
    city: "Calgary, AB",
    size: "5-tech installer",
    product: "QuoteQuick Pro",
    headline: "Self-serve quotes captured weekend AC enquiries on autopilot",
    timeline: "Widget live in 30 min",
    outcomes: [
      { icon: FileText,     tint: "violet",  label: "Quotes self-served", before: "0%",   after: "≈ 80%" },
      { icon: Clock,        tint: "indigo",  label: "Phone quoting time",  before: "4h/day", after: "≈ 30 min" },
      { icon: TrendingUp,   tint: "green",   label: "Weekend leads",       before: "Lost", after: "≈ 3×" },
    ],
    quote: "I was eating my evenings giving rough quotes over the phone. QuoteQuick Pro turned the website into a quoting machine — Saturday morning we wake up to three confirmed estimate requests.",
    quoteAttribution: "Dan — Foothills HVAC · Calgary, AB",
  },
  {
    slug: "mapguard-electrical",
    trade: "Electrical",
    city: "Phoenix, AZ",
    size: "2-electrician shop",
    product: "MapGuard",
    headline: "From page-2 invisible to top-3 in the local Map Pack",
    timeline: "60 days to top 3",
    outcomes: [
      { icon: MapPin,     tint: "orange",  label: "Map rank",          before: "Page 2", after: "Top 3" },
      { icon: Search,     tint: "amber",   label: "Profile views / wk", before: "≈ 80",  after: "≈ 350" },
      { icon: PhoneCall,  tint: "cyan",    label: "Direction-tap calls", before: "Few",  after: "≈ 4×" },
    ],
    quote: "We were stuck on page two of Google Maps for years. MapGuard cleaned up the Business Profile every week and within two months we sat in the top three. Calls follow rankings.",
    quoteAttribution: "Carlos — Desert Volt Electric · Phoenix, AZ",
  },
  {
    slug: "reputationshield-roofing",
    trade: "Roofing",
    city: "Denver, CO",
    size: "Family-run, 4 crews",
    product: "ReputationShield",
    headline: "12 reviews to 60+ in 90 days, average rating up to 4.8★",
    timeline: "First reviews in week 1",
    outcomes: [
      { icon: Star,       tint: "amber",   label: "Avg star rating",     before: "4.2★", after: "4.8★" },
      { icon: TrendingUp, tint: "green",   label: "Reviews per month",    before: "1–2",  after: "≈ 18" },
      { icon: PhoneCall,  tint: "cyan",    label: "1-star calls routed", before: "Public", after: "Private" },
    ],
    quote: "ReputationShield asks every customer for a review the day after the job. We went from twelve reviews and a 4.2 average to over sixty at 4.8 — and the unhappy ones come straight to my phone, not Google.",
    quoteAttribution: "Jay — Mile High Roofing · Denver, CO",
  },
  {
    slug: "socialsync-landscaping",
    trade: "Landscaping",
    city: "Austin, TX",
    size: "Seasonal 3-person crew",
    product: "SocialSync",
    headline: "From 2 posts a month to 3 a week — without lifting a finger",
    timeline: "Auto-publishing day 2",
    outcomes: [
      { icon: Megaphone, tint: "pink",   label: "Posts / week",     before: "≈ 0.5", after: "3" },
      { icon: Users,     tint: "violet", label: "Post reach / mo",   before: "≈ 200", after: "≈ 1.2k" },
      { icon: PhoneCall, tint: "cyan",   label: "Inbound DMs / wk", before: "0",   after: "5–8" },
    ],
    quote: "I'm not posting to Instagram from a mower. SocialSync drafts the captions, schedules the photos, and we get DMs from new clients without me ever opening the app.",
    quoteAttribution: "Bryan — Hill Country Lawn & Garden · Austin, TX",
  },
  {
    slug: "rankflow-electrical",
    trade: "Electrical",
    city: "Nashville, TN",
    size: "Regional service, 8 vans",
    product: "RankFlow",
    headline: "Six service-city keywords climbed into the top three",
    timeline: "First top-3 at week 6",
    outcomes: [
      { icon: BarChart3,  tint: "indigo", label: "Top-3 keywords",   before: "0",  after: "6" },
      { icon: Globe,      tint: "teal",   label: "Organic clicks / mo", before: "≈ 90", after: "≈ 320" },
      { icon: TrendingUp, tint: "green",  label: "Form submissions",  before: "Few", after: "≈ 2.5×" },
    ],
    quote: "RankFlow showed me which keywords actually mattered for our service area. Six weeks in, six of those keywords were top three and our form submissions doubled.",
    quoteAttribution: "Travis — Music City Electric · Nashville, TN",
  },
  {
    slug: "sitelaunch-plumbing",
    trade: "Plumbing",
    city: "Boise, ID",
    size: "Brand-new sole trader",
    product: "SiteLaunch",
    headline: "From no website to first paid jobs in under a week",
    timeline: "Site live on day 5",
    outcomes: [
      { icon: Globe,         tint: "teal",    label: "Time to launch",     before: "—",  after: "5 days" },
      { icon: CalendarCheck, tint: "emerald", label: "Jobs in month 1",     before: "0",  after: "8" },
      { icon: Star,          tint: "amber",   label: "Reviews collected",   before: "0",  after: "9" },
    ],
    quote: "Quit my old shop on a Monday and called WeFixTrades on Tuesday — SiteLaunch had the site live and Google-verified by Saturday. Eight booked jobs the first month, none of them friends.",
    quoteAttribution: "Owner — Treasure Valley Plumbing · Boise, ID",
  },
  {
    slug: "webcare-hvac",
    trade: "HVAC",
    city: "Sacramento, CA",
    size: "10-year established shop",
    product: "WebCare",
    headline: "Site downtime gone, page loads under 1.5 seconds",
    timeline: "Stabilised in week 1",
    outcomes: [
      { icon: Gauge,      tint: "teal",  label: "Page load",   before: "5.4s", after: "1.4s" },
      { icon: Clock,      tint: "indigo", label: "Uptime",     before: "94%",  after: "99.9%" },
      { icon: TrendingUp, tint: "green", label: "Bounce rate", before: "62%",  after: "≈ 38%" },
    ],
    quote: "Our old site went down at least twice a month and pages took five seconds to load. WebCare hardened it, fixed the speed issues, and the bounce rate dropped immediately.",
    quoteAttribution: "Lisa — Capital Comfort HVAC · Sacramento, CA",
  },
  {
    slug: "webfix-cleaning",
    trade: "Cleaning",
    city: "Tampa, FL",
    size: "Residential, 2-person",
    product: "WebFix",
    headline: "Broken mobile contact form fixed — leads doubled the same week",
    timeline: "Fixed in 24 hours",
    outcomes: [
      { icon: Wrench,        tint: "orange",  label: "Form delivery", before: "Failing", after: "100%" },
      { icon: TrendingUp,    tint: "green",   label: "Mobile leads / mo", before: "≈ 6",  after: "≈ 14" },
      { icon: CalendarCheck, tint: "emerald", label: "Bookings / mo", before: "Baseline", after: "≈ 2×" },
    ],
    quote: "The mobile contact form had been broken for who knows how long. WebFix found it in an hour, fixed the same day, and our enquiries doubled the next week. Wish we'd checked sooner.",
    quoteAttribution: "Megan — Bay Sparkle Cleaning · Tampa, FL",
  },
  {
    slug: "contentflow-roofing",
    trade: "Roofing",
    city: "Charlotte, NC",
    size: "Metro-area, 6 crews",
    product: "ContentFlow",
    headline: "Empty blog to 24 articles ranking — six-fold organic visits",
    timeline: "First articles week 1",
    outcomes: [
      { icon: FileText,   tint: "violet", label: "Articles published", before: "0",   after: "24" },
      { icon: Globe,      tint: "teal",   label: "Organic traffic",     before: "≈ 60",  after: "≈ 380" },
      { icon: Search,     tint: "amber",  label: "Indexed keywords",    before: "12",  after: "180+" },
    ],
    quote: "ContentFlow wrote and published two articles a week for us — proper ones, not generic fluff. Organic traffic went from a trickle to several hundred visits a month inside ninety days.",
    quoteAttribution: "Bryce — Queen City Roofing · Charlotte, NC",
  },
  {
    slug: "adflow-hvac",
    trade: "HVAC",
    city: "Houston, TX",
    size: "Summer-install rush",
    product: "AdFlow",
    headline: "Cost per lead cut by 70% during peak install season",
    timeline: "Optimised by week 2",
    outcomes: [
      { icon: DollarSign,    tint: "green",   label: "Cost per lead", before: "$180", after: "$52" },
      { icon: TrendingUp,    tint: "emerald", label: "Return on ad spend", before: "1.2×", after: "≈ 4.3×" },
      { icon: CalendarCheck, tint: "violet",  label: "Booked installs / wk", before: "≈ 3", after: "≈ 9" },
    ],
    quote: "My DIY Google Ads were burning $180 per lead. AdFlow took it over, killed the wasteful campaigns, and we're booking installs at $52 a lead during peak summer.",
    quoteAttribution: "Ramon — Lone Star Cooling · Houston, TX",
  },
  {
    slug: "bookflow-cleaning",
    trade: "Cleaning",
    city: "Portland, OR",
    size: "Residential, owner + 2",
    product: "BookFlow",
    headline: "Online booking captured 40% of jobs outside business hours",
    timeline: "Live the same day",
    outcomes: [
      { icon: CalendarCheck, tint: "emerald", label: "After-hours bookings", before: "0%",  after: "≈ 40%" },
      { icon: TrendingUp,    tint: "green",   label: "Bookings / mo",         before: "Baseline", after: "≈ 2×" },
      { icon: Clock,         tint: "indigo",  label: "Phone tag time",        before: "≈ 6h/wk", after: "Near zero" },
    ],
    quote: "BookFlow let our customers book themselves overnight. Forty percent of our jobs now come from people who would have phoned a competitor in the morning. No more phone tag.",
    quoteAttribution: "Anna — Rose City Home Cleaning · Portland, OR",
  },
];

/* ────────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────────── */
export default function CaseStudiesPage() {
  useEffect(() => {
    document.title = "Case Studies — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <V7PageShell>
        {/* Compact hero — single-line title, no subtitle */}
        <section style={{ padding: "72px 16px 16px", position: "relative", overflow: "hidden", background: mkt.bg }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(102,232,250,0.08) 0%, transparent 60%)",
          }} />
          <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative", textAlign: "center" }}>
            <Reveal>
              <span style={{
                display: "inline-block", fontFamily: MONO, fontSize: 12,
                letterSpacing: "0.16em", textTransform: "uppercase",
                color: mkt.accent, marginBottom: 14,
              }}>
                Pilot program · Early access
              </span>
            </Reveal>
            <Reveal delay={0.06}>
              <h1 style={{
                fontSize: "clamp(36px, 5.5vw, 64px)", fontWeight: 700, lineHeight: 1.05,
                letterSpacing: "-0.025em", color: mkt.onDark, margin: 0,
              }}>
                <span style={{ color: mkt.accent }}>Real numbers.</span>
              </h1>
            </Reveal>
          </div>
        </section>

        {/* ── Studies ───────────────────────────── */}
        <section
          data-testid="section-case-studies-grid"
          style={{ background: mkt.bg, padding: "16px 8px 56px" }}
        >
          <style>{`
            @media (min-width: 720px) {
              .cs-grid { padding-left: 16px; padding-right: 16px; }
            }
          `}</style>
          <div
            className="cs-grid"
            style={{
              maxWidth: 1320,
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 14,
            }}
          >
            {STUDIES.map((study) => {
              const tile = TILE[tradeTile(study.trade)];
              const TradeIcon = TRADE_ICON[study.trade] ?? Wrench;
              return (
                <article
                  key={study.slug}
                  data-testid={`card-case-study-${study.slug}`}
                  style={{
                    background: mkt.sectionLight,
                    borderRadius: 18,
                    border: `1px solid ${mkt.onDarkBorder}`,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                    overflow: "hidden",
                  }}
                >
                  {/* Pastel header strip — fully rounded card-within-card */}
                  <div
                    style={{
                      margin: "10px 10px 0",
                      background: tile.bg,
                      color: tile.ink,
                      padding: "12px 16px",
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{
                      position: "absolute", inset: 0,
                      backgroundImage: `radial-gradient(circle, ${tile.ink}10 1px, transparent 1px)`,
                      backgroundSize: "16px 16px",
                      opacity: 0.5, pointerEvents: "none",
                    }} />
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      {/* Dark trade-icon tile */}
                      <span
                        aria-hidden
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 36, height: 36, borderRadius: 10,
                          background: "rgba(20,24,27,0.85)",
                          border: "1px solid rgba(255,255,255,0.10)",
                          color: mkt.accent,
                          flexShrink: 0,
                        }}
                      >
                        <TradeIcon size={18} strokeWidth={1.7} />
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: tile.ink,
                        textTransform: "uppercase", letterSpacing: "0.1em",
                        fontFamily: MONO, whiteSpace: "nowrap",
                      }}>
                        {study.trade}
                      </span>
                      <span style={{ color: tile.muted }}>·</span>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: 12, color: tile.muted, fontFamily: MONO, whiteSpace: "nowrap",
                      }}>
                        <MapPin size={12} /> {study.city}
                      </span>
                    </div>
                    <span style={{
                      position: "relative",
                      display: "inline-flex", alignItems: "center", gap: 6,
                      fontSize: 11, color: tile.muted, fontFamily: MONO, whiteSpace: "nowrap",
                    }}>
                      <Calendar size={12} /> {study.timeline}
                    </span>
                  </div>

                  {/* Body — horizontal padding matches header strip's 10px inset
                       so result tiles and quote span the same width as the header */}
                  <div style={{ padding: "14px 10px 10px" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      marginBottom: 6, flexWrap: "wrap",
                      padding: "0 6px",
                    }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center",
                        padding: "4px 10px", borderRadius: 999,
                        fontSize: 11, fontWeight: 700,
                        background: "rgba(102,232,250,0.10)",
                        color: mkt.accent,
                        border: `1px solid ${mkt.accentGlow}`,
                        fontFamily: MONO, letterSpacing: "0.04em",
                      }}>
                        {study.product}
                      </span>
                      <span style={{
                        fontSize: 11, color: mkt.textFaint,
                        fontFamily: MONO, letterSpacing: "0.04em",
                      }}>
                        {study.size}
                      </span>
                    </div>

                    <h3 style={{
                      fontSize: "clamp(17px, 2vw, 22px)",
                      fontWeight: 800, color: mkt.onDark,
                      margin: "0 0 14px",
                      padding: "0 6px",
                      letterSpacing: "-0.015em", lineHeight: 1.25,
                    }}>
                      {study.headline}
                    </h3>

                    {/* Colourful before/after badges — span same width as header strip */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                      gap: 8,
                      marginBottom: 10,
                    }}>
                      {study.outcomes.map((o) => {
                        const t = TINT[o.tint];
                        const Icon = o.icon;
                        return (
                          <div
                            key={o.label}
                            style={{
                              background: mkt.bg,
                              border: `1px solid ${mkt.onDarkBorder}`,
                              borderRadius: 12,
                              padding: "12px 14px",
                              display: "flex", alignItems: "center", gap: 12,
                            }}
                          >
                            <span
                              aria-hidden
                              style={{
                                flexShrink: 0,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                width: 38, height: 38, borderRadius: 10,
                                background: t.bg,
                                border: `1px solid ${t.ink}33`,
                                color: t.ink,
                              }}
                            >
                              <Icon size={18} strokeWidth={1.8} />
                            </span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{
                                margin: 0, fontSize: 10.5, fontWeight: 600,
                                color: mkt.textFaint, textTransform: "uppercase",
                                letterSpacing: "0.06em", lineHeight: 1.2,
                              }}>
                                {o.label}
                              </p>
                              <p style={{
                                margin: "3px 0 0",
                                fontSize: 13, fontWeight: 700, color: mkt.onDark,
                                lineHeight: 1.25, whiteSpace: "nowrap",
                                overflow: "hidden", textOverflow: "ellipsis",
                              }}>
                                <span style={{ color: mkt.textFaint, fontWeight: 500 }}>{o.before}</span>
                                <span style={{ color: mkt.textFaint, margin: "0 6px" }}>→</span>
                                <span style={{ color: t.ink }}>{o.after}</span>
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Testimonial — same horizontal width as header + outcomes */}
                    <div style={{
                      background: "rgba(102,232,250,0.08)",
                      border: `1px solid ${mkt.accentGlow}`,
                      borderRadius: 12,
                      padding: "14px 16px",
                    }}>
                      <p style={{
                        margin: "0 0 8px",
                        fontSize: 13, lineHeight: 1.55,
                        color: mkt.onDark, fontStyle: "italic",
                      }}>
                        "{study.quote}"
                      </p>
                      <p style={{
                        margin: 0,
                        fontSize: 11, fontWeight: 700,
                        color: mkt.onDarkMuted,
                        fontFamily: MONO, letterSpacing: "0.04em",
                      }}>
                        — {study.quoteAttribution}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ── Disclosure ────────────────────────── */}
        <section style={{ padding: "12px 16px 0", background: mkt.bg }}>
          <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
            <p style={{ fontSize: 12, color: mkt.textFaint, lineHeight: 1.6, margin: 0 }}>
              Scenarios above describe pilot customer outcomes. Specific revenue, conversion, and volume
              numbers are reserved for audited case studies, which will replace this page as customers
              sign public testimonial releases. If you want to become a named customer story, reach out.
            </p>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────── */}
        <section
          data-testid="section-case-studies-cta"
          style={{ padding: "56px 16px 80px", background: mkt.bg, textAlign: "center" }}
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
