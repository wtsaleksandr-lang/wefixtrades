import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import {
  Zap,
  Calendar,
  Bot,
  MessageSquare,
  LayoutDashboard,
  Palette,
  type LucideIcon,
} from "lucide-react";

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

interface FeatureSection {
  id: string;
  icon: LucideIcon;
  title: string;
  bullets: string[];
  testId: string;
}

const featureSections: FeatureSection[] = [
  {
    id: "estimates",
    icon: Zap,
    title: "Estimate Engine",
    bullets: [
      "Formula-driven pricing for any trade",
      "10 supported pricing types (fixed, hourly, area-based, and more)",
      "AI-validated to catch errors and edge cases",
      "Instant results — no waiting, no phone calls",
    ],
    testId: "feature-section-estimates",
  },
  {
    id: "booking",
    icon: Calendar,
    title: "Booking Engine",
    bullets: [
      "Real-time slot availability, managed from your dashboard",
      "Deposit collection via Stripe — collect upfront automatically",
      "Double-booking prevention built in",
      "Confirmation emails sent to customer and business instantly",
    ],
    testId: "feature-section-booking",
  },
  {
    id: "ai",
    icon: Bot,
    title: "AI Employee — Chat & Voice",
    bullets: [
      "3 agent types: quote assistant, booking agent, general FAQ",
      "Function calling to fetch live pricing and availability",
      "Handles inquiries 24/7 across web chat, SMS, and WhatsApp",
      "Escalates to a real person when needed",
    ],
    testId: "feature-section-ai",
  },
  {
    id: "sms",
    icon: MessageSquare,
    title: "SMS & WhatsApp",
    bullets: [
      "Two-way conversations powered by Twilio",
      "AI replies automatically to inbound leads",
      "Take Over mode — jump in as a human any time",
      "Rate-limited safely to avoid spam classification",
    ],
    testId: "feature-section-sms",
  },
  {
    id: "dashboard",
    icon: LayoutDashboard,
    title: "Dashboard",
    bullets: [
      "8-section dashboard: leads, analytics, bookings, messages, follow-ups",
      "Live lead pipeline with status tracking",
      "Weekly summary reports delivered automatically",
      "Export leads to CSV for your CRM",
    ],
    testId: "feature-section-dashboard",
  },
  {
    id: "whitelabel",
    icon: Palette,
    title: "White-Label Ready",
    bullets: [
      "Custom domain — serve the calculator under your own URL",
      "Branded widget: your colors, your logo, no QuickQuote branding",
      "Resell to clients as your own product",
      "Per-client dashboards and reporting",
    ],
    testId: "feature-section-whitelabel",
  },
];

export default function ProductPage() {
  useEffect(() => {
    document.title = "Product — QuickQuotePro";
  }, []);

  return (
    <MarketingLayout>
      <div data-testid="product-page">
        {/* Page Header */}
        <section
          style={{
            background: `linear-gradient(135deg, ${p.colors.navy} 0%, ${p.colors.navyGradient} 100%)`,
            padding: "80px 24px 96px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <h1
              style={{
                fontSize: "clamp(32px, 4.5vw, 44px)",
                fontWeight: 800,
                color: "#FFFFFF",
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
                marginBottom: 16,
              }}
            >
              Everything a Trades Business Needs to Convert Leads
            </h1>
            <p
              style={{
                fontSize: 18,
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.6,
              }}
            >
              From instant estimates to AI employees — QuickQuotePro handles it all.
            </p>
          </div>
        </section>

        {/* Feature Sections */}
        {featureSections.map((section, index) => {
          const Icon = section.icon;
          const isLight = index % 2 === 0;
          const bgColor = isLight ? p.colors.surface : p.colors.pageBg;

          return (
            <section
              key={section.id}
              data-testid={section.testId}
              style={{
                background: bgColor,
                padding: "72px 24px",
              }}
            >
              <div
                style={{
                  maxWidth: 960,
                  margin: "0 auto",
                  display: "flex",
                  flexDirection: index % 2 === 0 ? "row" : "row-reverse",
                  alignItems: "center",
                  gap: 64,
                  flexWrap: "wrap",
                }}
              >
                {/* Icon / Visual side */}
                <div
                  style={{
                    flex: "0 0 auto",
                    width: 140,
                    height: 140,
                    borderRadius: p.radius.md,
                    background: "#F0F7F4",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={56} color={p.colors.accent} />
                </div>

                {/* Content side */}
                <div style={{ flex: 1, minWidth: 260 }}>
                  <h2
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: p.colors.heading,
                      marginBottom: 20,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {section.title}
                  </h2>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {section.bullets.map((bullet, i) => (
                      <li
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          marginBottom: 12,
                          fontSize: 15,
                          color: p.colors.body,
                          lineHeight: 1.6,
                        }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            marginTop: 3,
                            width: 18,
                            height: 18,
                            borderRadius: p.radius.pill,
                            background: p.colors.accent,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          );
        })}

        {/* Bottom CTA */}
        <section
          style={{
            background: p.colors.surface,
            padding: "80px 24px",
            textAlign: "center",
            borderTop: `1px solid ${p.colors.border}`,
          }}
        >
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <h2
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: p.colors.heading,
                marginBottom: 12,
              }}
            >
              Ready to build your calculator?
            </h2>
            <p
              style={{
                fontSize: 16,
                color: p.colors.muted,
                marginBottom: 32,
              }}
            >
              Takes 10 minutes. No code required. Free to start.
            </p>
            <Link
              href="/Wizard"
              style={{
                display: "inline-block",
                padding: "14px 36px",
                borderRadius: p.radius.sm,
                background: p.colors.accent,
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Start Building Your Calculator
            </Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
