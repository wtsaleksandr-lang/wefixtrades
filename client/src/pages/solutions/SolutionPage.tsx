import { useEffect } from "react";
import { useParams, Link } from "wouter";
import { Check, ArrowRight, Phone, Wrench, Zap, Home, Sparkles, Fan } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
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
];

function getSolutionBySlug(slug: string): SolutionConfig | undefined {
  return SOLUTIONS.find((s) => s.slug === slug);
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
      <div data-testid={`solution-page-${solution.slug}`}>

        <section
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "90px 28px 80px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
          data-testid="solution-hero"
        >
          <div style={{ position: "absolute", top: -80, right: -80, width: 420, height: 420, borderRadius: "50%", background: mkt.accentGlow, pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -60, left: -60, width: 300, height: 300, borderRadius: "50%", background: "rgba(47,107,255,0.08)", pointerEvents: "none" }} />

          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: mkt.accentGlow, border: `1px solid ${mkt.accent}`,
              borderRadius: 20, padding: "6px 18px", marginBottom: 28,
            }}>
              <HeroIcon size={16} color={mkt.onDark} strokeWidth={2} />
              <span style={{ fontSize: 12, fontWeight: 700, color: mkt.onDark, letterSpacing: "0.04em" }}>
                FOR {solution.trade.toUpperCase()}
              </span>
            </div>

            <h1
              data-testid="solution-headline"
              style={{
                fontSize: "clamp(32px, 4.5vw, 54px)",
                fontWeight: 700, color: mkt.onDark,
                lineHeight: 1.08, letterSpacing: "-0.035em",
                marginBottom: 20,
              }}
            >
              {solution.headline}
            </h1>

            <p style={{ fontSize: "clamp(16px, 1.8vw, 19px)", color: mkt.onDarkFaint, lineHeight: 1.65, maxWidth: 560, margin: "0 auto 40px" }}>
              {solution.subheadline}
            </p>

            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/pricing"
                data-testid="solution-cta-pricing"
                className="mkt-btn-primary"
                style={{ padding: "14px 32px", borderRadius: 9999, background: mkt.accent, color: mkt.onDark, fontSize: 15, fontWeight: 700, textDecoration: "none", display: "inline-block" }}
              >
                See Pricing
              </Link>
              <Link
                href="/demos"
                data-testid="solution-cta-demos"
                className="mkt-btn-ghost"
                style={{ padding: "14px 26px", borderRadius: 9999, background: "transparent", color: mkt.onDark, fontSize: 15, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, border: `1.5px solid ${mkt.onDarkBorder}` }}
              >
                Watch Demos
              </Link>
            </div>
          </div>
        </section>

        <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="solution-pain-points">
          <div style={{ maxWidth: 800, margin: "0 auto" }} data-reveal="fade-up">
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                Sound Familiar?
              </div>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em" }}>
                Common challenges for {solution.trade.toLowerCase()}
              </h2>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {solution.painPoints.map((p) => (
                <li
                  key={p}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    fontSize: 15, color: mkt.textMuted, lineHeight: 1.5,
                    padding: "14px 18px", background: mkt.surface,
                    borderRadius: 12, border: `1px solid ${mkt.border}`,
                  }}
                >
                  <span style={{ color: mkt.orange, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>&bull;</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="solution-outcomes">
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em" }}>
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
                    border: `1px solid ${mkt.border}`,
                    borderRadius: 16,
                    padding: "28px 16px",
                    boxShadow: shadows.card,
                  }}
                >
                  <div style={{ fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 700, color: mkt.accent, marginBottom: 8 }}>
                    {o.stat}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: mkt.textMuted, lineHeight: 1.4 }}>
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
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em" }}>
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
                      border: `1px solid ${mkt.border}`,
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
                    <h3 style={{ fontSize: 17, fontWeight: 700, color: mkt.text, marginBottom: 10, lineHeight: 1.3 }}>
                      {product.name}
                    </h3>
                    <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.6, margin: 0, flex: 1 }}>
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
    </MarketingLayout>
  );
}
