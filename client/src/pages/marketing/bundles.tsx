import { useEffect, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

export default function BundlesPage() {
  useEffect(() => {
    document.title = "Bundles — QuickQuotePro + WeFixTrades";
  }, []);

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const s = {
    pageHeader: {
      background: "linear-gradient(135deg, #0B1F3A, #1A3A5C)",
      padding: "80px 24px 60px",
      textAlign: "center" as const,
    },
    pageHeaderH1: {
      fontSize: "clamp(32px, 5vw, 48px)",
      fontWeight: 800,
      color: "#FFFFFF",
      margin: "0 0 16px",
      letterSpacing: "-0.02em",
    },
    pageHeaderSub: {
      fontSize: 18,
      color: "rgba(255,255,255,0.7)",
      margin: 0,
    },
    bundlesSection: {
      background: "#F7F8FA",
      padding: "60px 24px",
    },
    bundlesGrid: {
      maxWidth: 900,
      margin: "0 auto",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
      gap: 28,
      alignItems: "start",
    },
    bundleCard: {
      background: "#FFFFFF",
      borderRadius: 12,
      padding: "36px 32px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 1px 8px rgba(0,0,0,0.04)",
      border: "1px solid #E5E7EB",
    },
    bundleCardHighlighted: {
      border: "2px solid #2D6A4F",
      boxShadow: "0 4px 24px rgba(45,106,79,0.15)",
    },
    badge: {
      display: "inline-block",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
      padding: "4px 12px",
      borderRadius: 999,
      marginBottom: 20,
    },
    bundleName: {
      fontSize: 24,
      fontWeight: 800,
      color: "#111827",
      margin: "0 0 4px",
      letterSpacing: "-0.01em",
    },
    bundlePrice: {
      fontSize: 36,
      fontWeight: 800,
      color: "#111827",
      letterSpacing: "-0.02em",
      lineHeight: 1,
      margin: "8px 0 4px",
    },
    bundlePricePeriod: {
      fontSize: 14,
      color: "#6B7280",
      margin: "0 0 24px",
    },
    savingBadge: {
      display: "inline-block",
      background: "#F0F7F4",
      color: "#2D6A4F",
      fontSize: 13,
      fontWeight: 700,
      padding: "4px 12px",
      borderRadius: 999,
      marginBottom: 24,
    },
    divider: {
      height: 1,
      background: "#F3F4F6",
      margin: "0 0 20px",
    },
    includesLabel: {
      fontSize: 12,
      fontWeight: 700,
      color: "#9CA3AF",
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      marginBottom: 16,
    },
    featureList: {
      listStyle: "none",
      padding: 0,
      margin: "0 0 28px",
    },
    featureItem: {
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      fontSize: 14,
      color: "#374151",
      lineHeight: 1.5,
      marginBottom: 12,
    },
    ctaBtn: {
      display: "block",
      width: "100%",
      padding: "13px 0",
      borderRadius: 8,
      background: "#2D6A4F",
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: 700,
      textAlign: "center" as const,
      border: "none",
      cursor: "pointer",
      transition: "background 0.15s ease",
    },
    faqSection: {
      background: "#FFFFFF",
      padding: "60px 24px",
    },
    faqWrap: {
      maxWidth: 720,
      margin: "0 auto",
    },
    faqTitle: {
      fontSize: 28,
      fontWeight: 700,
      color: "#111827",
      margin: "0 0 32px",
      textAlign: "center" as const,
    },
    faqItem: {
      borderBottom: "1px solid #F3F4F6",
    },
    faqQuestion: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "20px 0",
      cursor: "pointer",
      gap: 16,
      background: "none",
      border: "none",
      width: "100%",
      textAlign: "left" as const,
    },
    faqQuestionText: {
      fontSize: 16,
      fontWeight: 600,
      color: "#111827",
      flex: 1,
    },
    faqAnswer: {
      fontSize: 14,
      color: "#6B7280",
      lineHeight: 1.7,
      paddingBottom: 20,
    },
  };

  const growthIncludes = [
    "QuickQuotePro Starter",
    "Google Maps Optimization",
    "Reputation Management",
    "Monthly performance report",
  ];

  const autopilotIncludes = [
    "QuickQuotePro Pro + AI Employee",
    "Google Maps Optimization",
    "Website SEO + Speed",
    "Reputation Management",
    "Social Media Automation",
    "Done-For-You AI Training",
    "Monthly strategy call",
  ];

  const faqs = [
    {
      q: "How long does setup take?",
      a: "Most businesses are live within 5 business days. Our onboarding team handles the heavy lifting — from setting up your calculator to configuring your AI employee. You just fill out a short intake form.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. All monthly plans are cancel-anytime with no lock-in. For annual plans, we offer a prorated refund within the first 30 days.",
    },
    {
      q: "Are there any long-term contracts?",
      a: "No long-term contracts required. We believe in earning your business every month. Monthly plans run month-to-month. Annual plans are prepaid but include a 30-day money-back guarantee.",
    },
    {
      q: "What does the onboarding process look like?",
      a: "After signing up, you'll be assigned a dedicated onboarding specialist. They'll guide you through a 30-minute kickoff call, help configure your calculator and AI employee, and ensure everything is live and converting before they hand you off.",
    },
  ];

  return (
    <MarketingLayout>
      <div data-testid="bundles-page">
        <div style={s.pageHeader}>
          <h1 style={s.pageHeaderH1}>Get the Full System</h1>
          <p style={s.pageHeaderSub}>Combine software + done-for-you services for maximum results.</p>
        </div>

        <div style={s.bundlesSection}>
          <div style={s.bundlesGrid}>
            <div style={s.bundleCard} data-testid="bundle-growth">
              <span style={{ ...s.badge, background: "#EFF6FF", color: "#2563EB" }}>
                Best for growing businesses
              </span>
              <h2 style={s.bundleName}>Growth Bundle</h2>
              <div style={s.bundlePrice}>
                $349
                <span style={{ fontSize: 16, fontWeight: 500, color: "#6B7280" }}>/mo</span>
              </div>
              <p style={s.bundlePricePeriod}>Everything you need to grow locally</p>
              <span style={s.savingBadge}>Save $149/mo vs buying separately</span>
              <div style={s.divider} />
              <p style={s.includesLabel}>Includes</p>
              <ul style={s.featureList}>
                {growthIncludes.map(f => (
                  <li key={f} style={s.featureItem}>
                    <Check size={16} color="#4A7C6F" strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button style={s.ctaBtn} data-testid="button-get-started-growth">
                Get Started
              </button>
            </div>

            <div style={{ ...s.bundleCard, ...s.bundleCardHighlighted }} data-testid="bundle-autopilot">
              <span style={{ ...s.badge, background: "#0B1F3A", color: "#FFFFFF" }}>
                Hands-free growth
              </span>
              <h2 style={s.bundleName}>Autopilot System</h2>
              <div style={s.bundlePrice}>
                $599
                <span style={{ fontSize: 16, fontWeight: 500, color: "#6B7280" }}>/mo</span>
              </div>
              <p style={s.bundlePricePeriod}>Full-stack growth on autopilot</p>
              <span style={s.savingBadge}>Save $348/mo vs buying separately</span>
              <div style={s.divider} />
              <p style={s.includesLabel}>Includes</p>
              <ul style={s.featureList}>
                {autopilotIncludes.map(f => (
                  <li key={f} style={s.featureItem}>
                    <Check size={16} color="#4A7C6F" strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button style={s.ctaBtn} data-testid="button-get-started-autopilot">
                Get Started
              </button>
            </div>
          </div>
        </div>

        <div style={s.faqSection}>
          <div style={s.faqWrap}>
            <h2 style={s.faqTitle}>Frequently Asked Questions</h2>
            {faqs.map((faq, i) => (
              <div key={i} style={s.faqItem}>
                <button
                  style={s.faqQuestion}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  data-testid={`faq-item-${i}`}
                >
                  <span style={s.faqQuestionText}>{faq.q}</span>
                  {openFaq === i ? (
                    <ChevronUp size={18} color="#6B7280" strokeWidth={1.5} />
                  ) : (
                    <ChevronDown size={18} color="#6B7280" strokeWidth={1.5} />
                  )}
                </button>
                {openFaq === i && (
                  <p style={s.faqAnswer}>{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
