import { useEffect } from "react";
import { useParams, Link } from "wouter";
import { Check, ArrowRight, Phone, Wrench, Zap, Home, Sparkles, Fan, Trees, Bug, Warehouse, KeyRound, PaintBucket, Hammer, Building2 } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { V7Hero, V7PageShell } from "@/components/marketing/v7";
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
      { name: "QuoteQuick Pro\u2122", icon: "calculator", desc: "Instant drain / pipe repair estimates.", href: "/products/quotequick" },
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
      { name: "AI CallLine\u2122", icon: "phone", desc: "Never miss an emergency HVAC call again.", href: "/products/ai-callline" },
      { name: "QuoteQuick Pro\u2122", icon: "calculator", desc: "Instant AC / furnace install estimates.", href: "/products/quotequick" },
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
      { name: "QuoteQuick Pro\u2122", icon: "calculator", desc: "Instant panel / EV charger estimates.", href: "/products/quotequick" },
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
      { name: "AI ChatLine\u2122", icon: "message", desc: "Capture storm-damage leads 24/7.", href: "/products/ai-chatline" },
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
      { name: "QuoteQuick Pro\u2122", icon: "calculator", desc: "Instant cleaning estimates by sq ft.", href: "/products/quotequick" },
      { name: "AI ChatLine\u2122", icon: "message", desc: "Chat widget that books jobs automatically.", href: "/products/ai-chatline" },
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
      { name: "QuoteQuick Pro™", icon: "calculator", desc: "Instant lawn-care + landscaping estimates by sq ft.", href: "/products/quickquotepro" },
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
      { name: "QuoteQuick Pro™", icon: "calculator", desc: "Per-room pricing + recurring service tiers.", href: "/products/quickquotepro" },
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
      { name: "QuoteQuick Pro™", icon: "calculator", desc: "Tiered pricing for spring / opener / panel jobs.", href: "/products/quickquotepro" },
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
      { name: "QuoteQuick Pro™", icon: "calculator", desc: "Quick estimates for lockout / rekey / install.", href: "/products/quickquotepro" },
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
      { name: "QuoteQuick Pro™", icon: "calculator", desc: "Instant ballpark estimates by room / sq ft.", href: "/products/quickquotepro" },
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
      { name: "QuoteQuick Pro™", icon: "calculator", desc: "Tiered quoting for kitchens, baths, additions.", href: "/products/quickquotepro" },
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
      { name: "QuoteQuick Pro™", icon: "calculator", desc: "Tiered ballpark quoting for custom jobs.", href: "/products/quickquotepro" },
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

  useEffect(() => {
    if (solution) {
      document.title = `Solutions for ${solution.trade} | WeFixTrades`;
      const metaDesc = document.querySelector('meta[name="description"]');
      const content = solution.subheadline;
      if (metaDesc) {
        metaDesc.setAttribute("content", content);
      } else {
        const meta = document.createElement("meta");
        meta.name = "description";
        meta.content = content;
        document.head.appendChild(meta);
      }
    }
  }, [solution]);

  if (!solution) return <NotFound />;

  const HeroIcon = solution.heroIcon;

  return (
    <MarketingLayout>
      <V7PageShell>
      <div data-testid={`solution-page-${solution.slug}`}>
        <V7Hero
          productName={`For ${solution.trade}`}
          headline={solution.headline}
          sub={solution.subheadline}
          ctas={[
            { label: "See Pricing", href: "/pricing" },
            { label: "Watch Demos", href: "/demos" },
          ]}
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
                      <IconBadge name={product.icon} size={22} />
                    </div>
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: mkt.onDark, marginBottom: 10, lineHeight: 1.3 }}>
                      {product.name}
                    </h3>
                    <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, margin: 0, flex: 1 }}>
                      {product.desc}
                    </p>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: mkt.accent, marginTop: 16 }}>
                      Learn more <ArrowRight size={13} />
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
                href="/Wizard"
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
