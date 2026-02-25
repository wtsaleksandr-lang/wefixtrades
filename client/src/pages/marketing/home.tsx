import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Zap, Calendar, Bot, MessageSquare } from "lucide-react";

const p = {
  colors: {
    accent: "#2D6A4F",
    accentDark: "#1B4332",
    blue: "#2563EB",
    navy: "#0B1F3A",
    navyGradient: "#1A3A5C",
    pageBg: "#F7F8FA",
    surface: "#FFFFFF",
    heading: "#111827",
    body: "#374151",
    muted: "#6B7280",
    border: "#E5E7EB",
  },
  shadows: {
    card: "0 1px 3px rgba(0,0,0,0.05), 0 1px 8px rgba(0,0,0,0.04)",
  },
  radius: {
    sm: "8px",
    md: "12px",
    pill: "999px",
  },
};

const featureCards = [
  {
    id: "quotes",
    icon: Zap,
    title: "Instant Quote Engine",
    body: "Customers get accurate estimates in seconds, no phone tag.",
    testId: "feature-card-quotes",
  },
  {
    id: "booking",
    icon: Calendar,
    title: "Booking + Deposits",
    body: "Turn estimates into bookings. Collect deposits automatically.",
    testId: "feature-card-booking",
  },
  {
    id: "ai",
    icon: Bot,
    title: "AI Chat & Voice",
    body: "Your AI employee handles inquiries 24/7 across web, SMS, WhatsApp.",
    testId: "feature-card-ai",
  },
  {
    id: "sms",
    icon: MessageSquare,
    title: "SMS Follow-ups",
    body: "Automated follow-up sequences that convert cold leads.",
    testId: "feature-card-sms",
  },
];

const steps = [
  {
    num: 1,
    title: "Pick a Template",
    body: "Choose from 6 high-converting calculator layouts for your trade.",
    testId: "step-1",
  },
  {
    num: 2,
    title: "Set Your Pricing Logic",
    body: "Define your rates. Our AI validates and optimises them.",
    testId: "step-2",
  },
  {
    num: 3,
    title: "Publish & Embed",
    body: "Get an instant hosted page or embed snippet for your website.",
    testId: "step-3",
  },
];

export default function HomePage() {
  useEffect(() => {
    document.title = "QuickQuotePro — Estimates, Booking & AI for Trades";
  }, []);

  return (
    <MarketingLayout>
      {/* Section 1 — Hero */}
      <section
        data-testid="hero-section"
        style={{
          background: `linear-gradient(135deg, ${p.colors.navy} 0%, ${p.colors.navyGradient} 100%)`,
          padding: "80px 24px 96px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div
            style={{
              display: "inline-block",
              marginBottom: 24,
              padding: "6px 16px",
              borderRadius: p.radius.pill,
              background: p.colors.accent,
              color: "#FFFFFF",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            New: AI Employee with SMS &amp; WhatsApp
          </div>

          <h1
            data-testid="hero-headline"
            style={{
              fontSize: "clamp(36px, 5vw, 48px)",
              fontWeight: 800,
              color: "#FFFFFF",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              marginBottom: 20,
            }}
          >
            Turn Website Visitors Into Booked Jobs Automatically
          </h1>

          <p
            style={{
              fontSize: 20,
              color: "rgba(255,255,255,0.72)",
              lineHeight: 1.6,
              marginBottom: 36,
            }}
          >
            Instant estimates. Smart booking. AI employees — built for trades.
          </p>

          <div
            style={{
              display: "flex",
              gap: 14,
              justifyContent: "center",
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <Link
              href="/Wizard"
              data-testid="button-start-free-hero"
              style={{
                padding: "14px 32px",
                borderRadius: p.radius.sm,
                background: p.colors.accent,
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Start Free
            </Link>
            <Link
              href="/demo"
              data-testid="button-view-demo-hero"
              style={{
                padding: "14px 32px",
                borderRadius: p.radius.sm,
                background: "transparent",
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: 600,
                textDecoration: "none",
                border: "2px solid rgba(255,255,255,0.55)",
                display: "inline-block",
              }}
            >
              View Demo
            </Link>
          </div>

          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
            No credit card required. Live in 10 minutes.
          </p>
        </div>
      </section>

      {/* Section 2 — Core Feature Blocks */}
      <section
        data-testid="features-section"
        style={{
          background: p.colors.surface,
          padding: "80px 24px",
        }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 24,
            }}
          >
            {featureCards.map(({ icon: Icon, title, body, testId }) => (
              <div
                key={testId}
                data-testid={testId}
                style={{
                  background: p.colors.surface,
                  borderRadius: p.radius.md,
                  boxShadow: p.shadows.card,
                  border: `1px solid ${p.colors.border}`,
                  padding: "28px 24px",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: p.radius.pill,
                    background: "#F0F7F4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                  }}
                >
                  <Icon size={20} color={p.colors.accent} />
                </div>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: p.colors.heading,
                    marginBottom: 8,
                  }}
                >
                  {title}
                </h3>
                <p style={{ fontSize: 14, color: p.colors.muted, lineHeight: 1.6 }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3 — How It Works */}
      <section
        data-testid="how-it-works-section"
        style={{
          background: p.colors.pageBg,
          padding: "80px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: p.colors.accent,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            HOW IT WORKS
          </div>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: p.colors.heading,
              marginBottom: 56,
              letterSpacing: "-0.01em",
            }}
          >
            Live in under 10 minutes
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 32,
            }}
          >
            {steps.map(({ num, title, body, testId }) => (
              <div key={testId} data-testid={testId} style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: p.radius.pill,
                    background: p.colors.accent,
                    color: "#FFFFFF",
                    fontSize: 20,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  {num}
                </div>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: p.colors.heading,
                    marginBottom: 8,
                  }}
                >
                  {title}
                </h3>
                <p style={{ fontSize: 14, color: p.colors.muted, lineHeight: 1.6 }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4 — CTA Band */}
      <section
        data-testid="cta-band"
        style={{
          background: "linear-gradient(135deg, #2D6A4F, #1B4332)",
          padding: "80px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#FFFFFF",
              marginBottom: 12,
              letterSpacing: "-0.01em",
            }}
          >
            Ready to get more booked jobs?
          </h2>
          <p
            style={{
              fontSize: 17,
              color: "rgba(255,255,255,0.8)",
              marginBottom: 32,
            }}
          >
            Join trades businesses already using QuickQuotePro.
          </p>
          <Link
            href="/Wizard"
            data-testid="button-start-free-cta"
            style={{
              display: "inline-block",
              padding: "14px 36px",
              borderRadius: p.radius.sm,
              background: "#FFFFFF",
              color: p.colors.accent,
              fontSize: 16,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Start Free Trial
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
