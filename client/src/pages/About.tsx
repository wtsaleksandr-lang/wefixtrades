import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows } from "@/theme/tokens";
import { Target, Users, Zap, Shield } from "lucide-react";

const VALUES = [
  { title: "Built for Trades", description: "Every feature is purpose-built for contractors, plumbers, electricians, roofers, and home-service pros.", icon: Target },
  { title: "Customer-First", description: "We measure our success by yours. Real support, real humans, real results.", icon: Users },
  { title: "Speed to Value", description: "Get up and running in minutes, not months. No IT department required.", icon: Zap },
  { title: "Trust & Transparency", description: "No hidden fees, no lock-in contracts. Cancel any time.", icon: Shield },
];

export default function AboutPage() {
  useEffect(() => {
    document.title = "About Us — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <div
        data-testid="section-about-hero"
        style={{
          background: `linear-gradient(135deg, ${mkt.dark}, ${mkt.darkHover})`,
          padding: "100px 24px 60px",
          textAlign: "center",
        }}
      >
        <h1
          data-testid="text-about-title"
          style={{
            fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 700,
            color: mkt.onDark,
            margin: "0 0 16px",
            letterSpacing: "-0.025em",
          }}
        >
          About WeFixTrades
        </h1>
        <p
          data-testid="text-about-subtitle"
          style={{ fontSize: 18, color: mkt.onDarkMuted, margin: 0, maxWidth: 600, marginInline: "auto" }}
        >
          We help home-service businesses grow online with tools that actually work — built by people who understand the trades.
        </p>
      </div>

      <section
        data-testid="section-about-mission"
        style={{ background: mkt.surface, padding: "60px 24px" }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: mkt.text, margin: "0 0 16px", letterSpacing: "-0.02em" }}>
            Our Mission
          </h2>
          <p style={{ fontSize: 16, color: mkt.textMuted, lineHeight: 1.65, margin: 0 }}>
            Most digital marketing platforms are built for agencies and enterprise brands. WeFixTrades exists because tradespeople deserve software that speaks their language — fast quotes, real leads, and measurable growth without the complexity. We're on a mission to give every trades business the same digital advantage that the big franchises have.
          </p>
        </div>
      </section>

      <section
        data-testid="section-about-values"
        style={{ padding: "60px 24px" }}
      >
        <h2 style={{ fontSize: "clamp(24px, 4vw, 32px)", fontWeight: 700, color: mkt.text, margin: "0 0 32px", textAlign: "center", letterSpacing: "-0.02em" }}>
          What We Stand For
        </h2>
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 24,
          }}
        >
          {VALUES.map((v) => {
            const Icon = v.icon;
            return (
              <div
                key={v.title}
                data-testid={`card-value-${v.title.toLowerCase().replace(/\s+/g, "-")}`}
                style={{
                  background: mkt.bg,
                  borderRadius: 16,
                  padding: "32px 28px",
                  boxShadow: shadows.card,
                  border: `1px solid ${mkt.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: mkt.accentTint,
                    color: mkt.accent,
                  }}
                >
                  <Icon size={24} strokeWidth={1.8} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 650, color: mkt.text, margin: 0 }}>{v.title}</h3>
                <p style={{ fontSize: 14, color: mkt.textMuted, margin: 0, lineHeight: 1.55 }}>{v.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section
        data-testid="section-about-cta"
        style={{ padding: "40px 24px 60px", textAlign: "center" }}
      >
        <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: mkt.text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          Ready to grow your business?
        </h2>
        <p style={{ fontSize: 16, color: mkt.textMuted, margin: "0 0 28px" }}>
          Join hundreds of trades businesses already using WeFixTrades.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="/Wizard"
            data-testid="link-about-get-started"
            style={{
              display: "inline-block",
              padding: "12px 28px",
              borderRadius: 14,
              background: mkt.dark,
              color: mkt.onDark,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Get Started Free
          </Link>
          <Link
            href="/contact"
            data-testid="link-about-contact"
            style={{
              display: "inline-block",
              padding: "12px 28px",
              borderRadius: 14,
              background: "transparent",
              color: mkt.text,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              border: `1px solid ${mkt.border}`,
            }}
          >
            Talk to Us
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
