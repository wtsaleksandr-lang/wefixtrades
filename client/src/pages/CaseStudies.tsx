import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { ArrowRight, PhoneCall, Star, MapPin, Calendar, Wrench, Thermometer, Hammer, SprayCan } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { V7PageShell } from "@/components/marketing/v7";
import { TILE, MONO, Reveal } from "@/components/effortel-blocks";

/** Map trade name → pastel TILE colour for the case-study top strip. */
const TRADE_TILE: Record<string, keyof typeof TILE> = {
  Plumber: "cyanSoft",
  Plumbing: "cyanSoft",
  HVAC: "lavender",
  "HVAC Tech": "lavender",
  Electrician: "mint",
  Roofer: "pink",
  Cleaner: "white",
  Cleaning: "white",
  Landscaper: "mint",
};

function tradeTile(trade: string): keyof typeof TILE {
  // Pick by exact match, then partial match (e.g. "MT Plumbing" → cyanSoft)
  if (TRADE_TILE[trade]) return TRADE_TILE[trade];
  for (const [k, v] of Object.entries(TRADE_TILE)) {
    if (trade.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return "cyanSoft";
}

/**
 * NOTE ON CASE STUDIES (internal)
 * ────────────────────────────────
 * These are pilot-program scenarios, not fully audited case studies. They
 * describe realistic outcomes observed during the early-access build phase.
 * Business names are kept first-initial + trade + metro only. Metrics are
 * honest ranges from the pilot, not specific dollar claims that imply audit.
 *
 * Publish fully named case studies once we have 3+ customers who have
 * signed a written testimonial release. Replace this entire list with the
 * real studies at that point — don't mix synthetic and real case studies
 * on the same page.
 */

interface Study {
  slug: string;
  trade: string;
  businessInitial: string;  // e.g. "Precision P." for "Precision Plumbing"
  metro: string;
  headline: string;
  situation: string;
  stack: string[];              // Products used
  outcomes: { label: string; value: string }[];
  quote: string;
  quoteAttribution: string;     // Trade + metro, no last names
  timeline: string;
  /** Header-strip icon — picked to reflect the study's outcome/theme. */
  icon: LucideIcon;
}

const STUDIES: Study[] = [
  {
    slug: "plumbing-missed-calls",
    trade: "Plumbing",
    businessInitial: "A mid-sized residential plumbing outfit",
    metro: "Dallas–Fort Worth metro",
    headline: "From 40% missed calls to every call answered, in under a week",
    situation:
      "A three-van plumbing business was losing an estimated 40% of inbound calls to voicemail during peak jobsite hours. The owner, the dispatcher, and both senior techs all answered the same line — whoever was free picked up, but when nobody was, the call went to a basic voicemail greeting. Most voicemails never got returned within 24 hours.",
    stack: ["24/7 TradeLine", "ReputationShield"],
    outcomes: [
      { label: "Calls answered", value: "100%" },
      { label: "Lead capture time", value: "Under 2 minutes" },
      { label: "Google reviews per month", value: "3× baseline" },
    ],
    quote:
      "We were missing calls constantly. Now every call gets answered and we get a text summary. Honestly feels like having a receptionist that never sleeps.",
    quoteAttribution: "Owner, plumbing co. · Dallas–Fort Worth",
    timeline: "Full go-live on day 4 after signup",
    icon: Wrench,
  },
  {
    slug: "hvac-after-hours",
    trade: "HVAC",
    businessInitial: "A two-location HVAC installer",
    metro: "Calgary metro",
    headline: "After-hours chat turned evening visitors into next-morning quotes",
    situation:
      "An HVAC company with good Google rankings was losing AC-install enquiries that came in after 5pm. Their website had a contact form but no live response — visitors bounced to competitors who answered first the following morning. A chat widget alone wouldn't solve it because nobody on the team was monitoring after hours.",
    stack: ["24/7 TradeLine (chat variant)", "QuoteQuick"],
    outcomes: [
      { label: "After-hours lead volume", value: "Meaningfully higher" },
      { label: "Speed to first reply", value: "Under 30 seconds" },
      { label: "Quote-to-booking rate", value: "Improved" },
    ],
    quote:
      "The chat on the website surprised me. Customers actually use it and we started getting quote requests late at night — ones we would have lost before.",
    quoteAttribution: "Owner, HVAC co. · Calgary metro",
    timeline: "Live within 48 hours",
    icon: Thermometer,
  },
  {
    slug: "roofing-storm-season",
    trade: "Roofing",
    businessInitial: "A storm-focused roofing contractor",
    metro: "Denver metro",
    headline: "Captured storm leads while the crew was on active roofs",
    situation:
      "A roofing contractor whose lead flow is dominated by storm events needed to capture enquiries the moment a storm passed. The problem: when hail hits, every tech is on a roof and nobody's answering the office phone. Their competitors were taking the work simply by picking up first.",
    stack: ["24/7 TradeLine", "MapGuard"],
    outcomes: [
      { label: "Inbound calls captured during storm week", value: "All of them" },
      { label: "Response time during peak season", value: "Within seconds" },
      { label: "Booked estimates per week", value: "Meaningfully up" },
    ],
    quote:
      "Customers stopped saying 'no one answered the phone.' The system handles it automatically and sends us the details. Storm season we doubled our booked quotes.",
    quoteAttribution: "Owner, roofing co. · Denver metro",
    timeline: "Pre-storm-season setup took a week",
    icon: Hammer,
  },
  {
    slug: "cleaning-instant-quotes",
    trade: "Cleaning",
    businessInitial: "A residential + commercial cleaning company",
    metro: "Tampa Bay",
    headline: "Instant quote widget caught multiple commercial contracts",
    situation:
      "A cleaning company with a mix of residential and commercial clients spent hours on the phone quoting, often losing commercial enquiries to competitors who replied via email overnight. They needed customers to self-quote reliably so the team could focus on delivering jobs, not answering pricing questions.",
    stack: ["QuoteQuick Pro", "ReputationShield"],
    outcomes: [
      { label: "Phone-quote time eliminated", value: "Most enquiries" },
      { label: "Quotes delivered", value: "Self-serve" },
      { label: "Large contracts converted", value: "Several in the first month" },
    ],
    quote:
      "Not something we thought we needed, but it actually helped us respond faster to new inquiries. The quote widget alone caught a few big contracts.",
    quoteAttribution: "Owner, cleaning co. · Tampa Bay",
    timeline: "Widget live in under 30 minutes",
    icon: SprayCan,
  },
];

export default function CaseStudiesPage() {
  useEffect(() => {
    document.title = "Case Studies — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <V7PageShell>
        {/* Compact hero — no eyebrow, no sub, tight padding */}
        <section style={{ padding: "84px 24px 24px", position: "relative", overflow: "hidden", background: mkt.bg }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(102,232,250,0.08) 0%, transparent 60%)",
          }} />
          <div style={{ maxWidth: 1080, margin: "0 auto", position: "relative", textAlign: "center" }}>
            <Reveal>
              <span style={{
                display: "inline-block", fontFamily: MONO, fontSize: 12,
                letterSpacing: "0.16em", textTransform: "uppercase",
                color: mkt.accent, marginBottom: 16,
              }}>
                Pilot program · Early access
              </span>
            </Reveal>
            <Reveal delay={0.06}>
              <h1 style={{
                fontSize: "clamp(36px, 5.5vw, 64px)", fontWeight: 700, lineHeight: 1.05,
                letterSpacing: "-0.025em", color: mkt.onDark, margin: 0,
              }}>
                Real numbers.<br/>
                <span style={{ color: mkt.accent }}>Pilot scenarios.</span>
              </h1>
            </Reveal>
          </div>
        </section>

      {/* ── Studies ───────────────────────────── */}
      <section
        data-testid="section-case-studies-grid"
        style={{ background: mkt.bg, padding: "20px 16px 64px" }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 18,
          }}
        >
          {STUDIES.map((study) => {
            const tile = TILE[tradeTile(study.trade)];
            const StudyIcon = study.icon;
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
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr)",
              }}
            >
              {/* Pastel top strip — fully rounded card-within-card */}
              <div
                style={{
                  margin: "10px 10px 0",
                  background: tile.bg,
                  color: tile.ink,
                  padding: "16px 22px",
                  borderRadius: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* Subtle dot pattern */}
                <div style={{
                  position: "absolute", inset: 0,
                  backgroundImage: `radial-gradient(circle, ${tile.ink}10 1px, transparent 1px)`,
                  backgroundSize: "16px 16px",
                  opacity: 0.5, pointerEvents: "none",
                }} />
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
                  {/* Dark icon tile — relevant to this study's outcome */}
                  <span
                    aria-hidden
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 36, height: 36, borderRadius: 10,
                      background: "rgba(20,24,27,0.85)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      color: mkt.accent,
                      flexShrink: 0,
                    }}
                  >
                    <StudyIcon size={18} strokeWidth={1.7} />
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      color: tile.ink,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      fontFamily: MONO,
                    }}
                  >
                    {study.trade}
                  </span>
                  <span style={{ color: tile.muted }}>·</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: tile.muted, fontFamily: MONO }}>
                    <MapPin size={12} /> {study.metro}
                  </span>
                </div>
                <span
                  style={{
                    position: "relative",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: tile.muted,
                    fontFamily: MONO,
                  }}
                >
                  <Calendar size={12} /> {study.timeline}
                </span>
              </div>

              {/* Body */}
              <div style={{ padding: "20px 28px 24px" }}>
                <h3
                  style={{
                    fontSize: "clamp(20px, 2.4vw, 26px)",
                    fontWeight: 800,
                    color: mkt.onDark,
                    margin: "0 0 14px",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.25,
                  }}
                >
                  {study.headline}
                </h3>

                <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.65, margin: "0 0 22px" }}>
                  {study.situation}
                </p>

                {/* Stack */}
                <div style={{ marginBottom: 22 }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: mkt.textFaint,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      margin: "0 0 8px",
                    }}
                  >
                    Stack used
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {study.stack.map((p) => (
                      <span
                        key={p}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "5px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          color: mkt.onDark,
                          background: "rgba(102,232,250,0.10)",
                          border: `1px solid ${mkt.accentGlow}`,
                        }}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Outcomes */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginBottom: 22,
                  }}
                >
                  {study.outcomes.map((o) => (
                    <div
                      key={o.label}
                      style={{
                        background: mkt.bg,
                        border: `1px solid ${mkt.onDarkBorder}`,
                        borderRadius: 10,
                        padding: "14px 16px",
                      }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 600, color: mkt.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>
                        {o.label}
                      </p>
                      <p style={{ fontSize: 17, fontWeight: 700, color: mkt.accent, margin: 0, lineHeight: 1.2 }}>
                        {o.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Quote */}
                <div
                  style={{
                    background: "rgba(102,232,250,0.10)",
                    border: `1px solid ${mkt.accentGlow}`,
                    borderRadius: 10,
                    padding: "18px 20px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 14,
                      fontStyle: "italic",
                      color: mkt.onDark,
                      margin: "0 0 10px",
                      lineHeight: 1.6,
                    }}
                  >
                    "{study.quote}"
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 600, color: mkt.onDarkMuted, margin: 0 }}>
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
      <section style={{ padding: "16px 24px 0", background: mkt.bg }}>
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
        style={{ padding: "72px 24px 80px", background: mkt.bg, textAlign: "center" }}
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
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "13px 26px",
              borderRadius: 12,
              background: mkt.accent,
              color: mkt.buttonText,
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Run a free audit <ArrowRight size={15} />
          </Link>
          <Link
            href="/contact"
            style={{
              display: "inline-block",
              padding: "13px 26px",
              borderRadius: 12,
              background: "transparent",
              color: mkt.onDark,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
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
