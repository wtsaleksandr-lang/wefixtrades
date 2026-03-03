import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows } from "@/theme/tokens";
import { TrendingUp, ArrowRight } from "lucide-react";

const PLACEHOLDER_STUDIES = [
  { title: "How a Plumbing Company 3x'd Online Leads in 90 Days", trade: "Plumbing", metric: "3x Leads", slug: "plumbing-leads" },
  { title: "Roofing Firm Cuts Quote Turnaround from 48 Hours to 5 Minutes", trade: "Roofing", metric: "5 min Quotes", slug: "roofing-quotes" },
  { title: "Electrician Goes from Zero to 50 Google Reviews in 60 Days", trade: "Electrical", metric: "50 Reviews", slug: "electrician-reviews" },
  { title: "HVAC Business Doubles Revenue with Automated Follow-Ups", trade: "HVAC", metric: "2x Revenue", slug: "hvac-revenue" },
];

export default function CaseStudiesPage() {
  useEffect(() => {
    document.title = "Case Studies — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <div
        data-testid="section-case-studies-hero"
        style={{
          background: `linear-gradient(135deg, ${mkt.dark}, ${mkt.darkHover})`,
          padding: "100px 24px 60px",
          textAlign: "center",
        }}
      >
        <h1
          data-testid="text-case-studies-title"
          style={{
            fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 700,
            color: mkt.onDark,
            margin: "0 0 16px",
            letterSpacing: "-0.025em",
          }}
        >
          Case Studies
        </h1>
        <p
          data-testid="text-case-studies-subtitle"
          style={{ fontSize: 18, color: mkt.onDarkMuted, margin: 0, maxWidth: 600, marginInline: "auto" }}
        >
          Real results from real trades businesses using WeFixTrades.
        </p>
      </div>

      <section
        data-testid="section-case-studies-grid"
        style={{ background: mkt.surface, padding: "60px 24px" }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
          }}
        >
          {PLACEHOLDER_STUDIES.map((study) => (
            <div
              key={study.slug}
              data-testid={`card-case-study-${study.slug}`}
              style={{
                background: mkt.bg,
                borderRadius: 16,
                boxShadow: shadows.card,
                border: `1px solid ${mkt.border}`,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  height: 140,
                  borderRadius: "16px 16px 0 0",
                  background: `linear-gradient(135deg, ${mkt.dark}, ${mkt.darkHover})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                <TrendingUp size={24} strokeWidth={1.8} style={{ color: mkt.onDarkMuted }} />
                <span style={{ fontSize: 22, fontWeight: 700, color: mkt.onDark }}>{study.metric}</span>
              </div>
              <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 700,
                    color: mkt.accent,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {study.trade}
                </span>
                <h3 style={{ fontSize: 17, fontWeight: 650, color: mkt.text, margin: 0, lineHeight: 1.3 }}>{study.title}</h3>
                <div style={{ flex: 1 }} />
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    color: mkt.accent,
                    marginTop: 8,
                  }}
                >
                  Read Full Story <ArrowRight size={13} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        data-testid="section-case-studies-cta"
        style={{ padding: "60px 24px", textAlign: "center" }}
      >
        <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: mkt.text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          Want results like these?
        </h2>
        <p style={{ fontSize: 16, color: mkt.textMuted, margin: "0 0 28px", maxWidth: 480, marginInline: "auto" }}>
          Start your free trial and see the difference in weeks, not months.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="/Wizard"
            data-testid="link-case-studies-get-started"
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
            Start Free Trial
          </Link>
          <Link
            href="/contact"
            data-testid="link-case-studies-contact"
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
            Talk to Sales
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
