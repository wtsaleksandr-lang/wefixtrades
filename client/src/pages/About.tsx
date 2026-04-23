import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows } from "@/theme/tokens";
import { Target, Users, Zap, Shield, Hammer, Clock } from "lucide-react";

const VALUES = [
  {
    title: "Built for the jobsite, not the boardroom",
    description: "Every feature is designed around one reality: trades owners are on site, in the van, or up a ladder. The software has to work in 30 seconds or it doesn't work at all.",
    icon: Hammer,
  },
  {
    title: "Done-for-you, not DIY",
    description: "We install, configure, and operate the tools for you. Setup fees, monthly service, and a real human you can reach. If you wanted a DIY tool, you'd be on Wix.",
    icon: Users,
  },
  {
    title: "Outcomes over features",
    description: "We don't ship features — we ship results. More booked jobs, faster quotes, five-star reviews, and recovered missed calls. If a tool isn't moving those numbers, we rebuild it or remove it.",
    icon: Target,
  },
  {
    title: "Fixed pricing, no lock-in",
    description: "Flat monthly rates, no setup fees buried in contracts, no annual lock-ins. Cancel any month with no penalty. The trust comes from the work, not a legal clause.",
    icon: Shield,
  },
];

const HOW_WE_WORK = [
  {
    step: "01",
    title: "You tell us about your business",
    body: "A 3-minute onboarding form captures what you do, who you serve, and how you price. We do the rest.",
    icon: Clock,
  },
  {
    step: "02",
    title: "We configure and launch",
    body: "Our team sets up your calculators, AI phone agent, Google Business profile, review automation — whatever you signed up for. You approve before anything goes live.",
    icon: Zap,
  },
  {
    step: "03",
    title: "You see the results",
    body: "Leads land in your inbox. Missed calls get answered. Reviews roll in. Monthly reports show what's working. You stay focused on the work that pays.",
    icon: Target,
  },
];

export default function AboutPage() {
  useEffect(() => {
    document.title = "About — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      {/* ── Hero ────────────────────────────────────────────── */}
      <div
        data-testid="section-about-hero"
        style={{
          background: `linear-gradient(135deg, ${mkt.dark}, ${mkt.darkHover})`,
          padding: "100px 24px 72px",
        }}
      >
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: mkt.accent,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              margin: "0 0 16px",
            }}
          >
            About WeFixTrades
          </p>
          <h1
            data-testid="text-about-title"
            style={{
              fontSize: "clamp(32px, 5vw, 52px)",
              fontWeight: 800,
              color: mkt.onDark,
              margin: "0 0 20px",
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
            }}
          >
            The growth team that trades businesses can't afford to hire — and shouldn't need to.
          </h1>
          <p
            data-testid="text-about-subtitle"
            style={{
              fontSize: 18,
              color: mkt.onDarkMuted,
              margin: 0,
              maxWidth: 680,
              marginInline: "auto",
              lineHeight: 1.6,
            }}
          >
            WeFixTrades is the operating system behind the marketing, quoting, and
            customer-handling work that most trades owners either skip or overpay an agency to do.
          </p>
        </div>
      </div>

      {/* ── Why we exist ─────────────────────────────────────── */}
      <section
        data-testid="section-about-why"
        style={{ background: mkt.surface, padding: "72px 24px" }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: mkt.accent,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              margin: "0 0 14px",
            }}
          >
            Why we exist
          </p>
          <h2
            style={{
              fontSize: "clamp(26px, 4vw, 36px)",
              fontWeight: 700,
              color: mkt.text,
              margin: "0 0 24px",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            Most trades owners are losing work they'll never know about.
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 16, color: mkt.textMuted, lineHeight: 1.7, margin: 0 }}>
              Customers call while you're mid-job and leave voicemail. They ask for a quote on a
              Sunday evening and go with whoever replies first on Monday morning. They leave a
              five-star review in their head and never actually post it.
            </p>
            <p style={{ fontSize: 16, color: mkt.textMuted, lineHeight: 1.7, margin: 0 }}>
              The big franchises solve this with a ten-person office team, a CRM built by a vendor
              nobody's ever heard of, and a marketing agency on retainer. That's not realistic for
              a three-van plumbing outfit. Neither is expecting one owner to somehow learn SEO,
              Google ads, and call automation between jobs.
            </p>
            <p style={{ fontSize: 16, color: mkt.textMuted, lineHeight: 1.7, margin: 0 }}>
              WeFixTrades is built around a simple trade: you pay a fixed monthly fee, and we
              replace the pieces of the back office that should be running without you. Instant
              quotes, AI answering missed calls, Google profile management, review automation,
              monthly SEO work — delivered as a service, not a toolkit you have to learn.
            </p>
          </div>
        </div>
      </section>

      {/* ── What we stand for ────────────────────────────────── */}
      <section
        data-testid="section-about-values"
        style={{ padding: "72px 24px", background: mkt.bg }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 48px" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: mkt.accent, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px" }}>
              What we stand for
            </p>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 700, color: mkt.text, margin: 0, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              Four things we won't compromise on.
            </h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 20,
            }}
          >
            {VALUES.map((v) => {
              const Icon = v.icon;
              return (
                <div
                  key={v.title}
                  data-testid={`card-value-${v.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`}
                  style={{
                    background: mkt.surface,
                    borderRadius: 16,
                    padding: "28px 26px",
                    boxShadow: shadows.card,
                    border: `1px solid ${mkt.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: mkt.accentTint,
                      color: mkt.accent,
                    }}
                  >
                    <Icon size={22} strokeWidth={1.8} />
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: mkt.text, margin: 0, lineHeight: 1.3 }}>
                    {v.title}
                  </h3>
                  <p style={{ fontSize: 14, color: mkt.textMuted, margin: 0, lineHeight: 1.6 }}>
                    {v.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How we work ──────────────────────────────────────── */}
      <section
        data-testid="section-about-how-we-work"
        style={{ padding: "72px 24px", background: mkt.surface }}
      >
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 48px" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: mkt.accent, textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px" }}>
              How we work
            </p>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 700, color: mkt.text, margin: "0 0 12px", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              Three steps. No agency runaround.
            </h2>
            <p style={{ fontSize: 16, color: mkt.textMuted, margin: 0, lineHeight: 1.6 }}>
              We don't do discovery calls, strategy decks, or quarterly reviews. We do the work and
              show you what changed.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {HOW_WE_WORK.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.step}
                  style={{
                    background: mkt.bg,
                    borderRadius: 16,
                    padding: "28px 26px",
                    border: `1px solid ${mkt.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: mkt.accent, letterSpacing: "0.08em" }}>
                      {step.step}
                    </span>
                    <Icon size={18} color={mkt.textMuted} strokeWidth={1.6} />
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: mkt.text, margin: 0, lineHeight: 1.3 }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: 14, color: mkt.textMuted, margin: 0, lineHeight: 1.6 }}>
                    {step.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section
        data-testid="section-about-cta"
        style={{ padding: "72px 24px", background: mkt.bg, textAlign: "center" }}
      >
        <h2 style={{ fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 700, color: mkt.text, margin: "0 0 14px", letterSpacing: "-0.02em" }}>
          See what we'd do for your business.
        </h2>
        <p style={{ fontSize: 16, color: mkt.textMuted, margin: "0 0 32px", maxWidth: 560, marginInline: "auto", lineHeight: 1.6 }}>
          Run our free audit — we'll show you exactly which missed calls, slow quotes, and unclaimed
          reviews are costing you work right now. No pitch, no pressure.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="/tools/free-audit"
            data-testid="link-about-get-started"
            style={{
              display: "inline-block",
              padding: "14px 28px",
              borderRadius: 12,
              background: mkt.accent,
              color: mkt.buttonText,
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Run a free audit
          </Link>
          <Link
            href="/contact"
            data-testid="link-about-contact"
            style={{
              display: "inline-block",
              padding: "14px 28px",
              borderRadius: 12,
              background: "transparent",
              color: mkt.text,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              border: `1px solid ${mkt.border}`,
            }}
          >
            Talk to our team
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
