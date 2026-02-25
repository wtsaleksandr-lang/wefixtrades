import { useEffect, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Check, Minus } from "lucide-react";

export default function PricingPage() {
  useEffect(() => {
    document.title = "Pricing — QuickQuotePro";
  }, []);

  const [annual, setAnnual] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  const s = {
    pageHeader: {
      background: "linear-gradient(135deg, #0B1F3A, #1A3A5C)",
      padding: "80px 24px 60px",
      textAlign: "center" as const,
    },
    pageHeaderBadge: {
      display: "inline-block",
      background: "rgba(45,106,79,0.25)",
      color: "#6EE7B7",
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
      padding: "4px 14px",
      borderRadius: 999,
      marginBottom: 20,
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
    toggleRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      marginTop: 32,
    },
    toggleLabel: {
      fontSize: 15,
      fontWeight: 500,
      color: "rgba(255,255,255,0.8)",
    },
    toggleSwitch: {
      position: "relative" as const,
      width: 52,
      height: 28,
      borderRadius: 999,
      background: annual ? "#2D6A4F" : "rgba(255,255,255,0.2)",
      cursor: "pointer",
      border: "none",
      transition: "background 0.2s ease",
      flexShrink: 0,
    },
    toggleKnob: {
      position: "absolute" as const,
      top: 3,
      left: annual ? 27 : 3,
      width: 22,
      height: 22,
      borderRadius: "50%",
      background: "#FFFFFF",
      transition: "left 0.2s ease",
      boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
    },
    saveBadge: {
      background: "#2D6A4F",
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 999,
      letterSpacing: "0.04em",
    },
    tiersSection: {
      background: "#F7F8FA",
      padding: "60px 24px",
    },
    tiersGrid: {
      maxWidth: 1120,
      margin: "0 auto",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      gap: 24,
      alignItems: "start",
    },
    tierCard: {
      background: "#FFFFFF",
      borderRadius: 12,
      padding: "32px 28px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 1px 8px rgba(0,0,0,0.04)",
      border: "1px solid #E5E7EB",
      position: "relative" as const,
    },
    tierCardHighlighted: {
      border: "2px solid #2D6A4F",
      boxShadow: "0 4px 20px rgba(45,106,79,0.15)",
    },
    tierBadge: {
      display: "inline-block",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase" as const,
      padding: "3px 10px",
      borderRadius: 999,
      marginBottom: 16,
    },
    tierName: {
      fontSize: 13,
      fontWeight: 800,
      color: "#9CA3AF",
      letterSpacing: "0.1em",
      textTransform: "uppercase" as const,
      margin: "0 0 4px",
    },
    tierPrice: {
      fontSize: 40,
      fontWeight: 800,
      color: "#111827",
      letterSpacing: "-0.02em",
      margin: "4px 0 2px",
      lineHeight: 1,
    },
    tierPricePeriod: {
      fontSize: 14,
      color: "#6B7280",
      margin: "0 0 8px",
    },
    tierTagline: {
      fontSize: 14,
      color: "#6B7280",
      margin: "0 0 24px",
      lineHeight: 1.5,
    },
    tierDivider: {
      height: 1,
      background: "#F3F4F6",
      margin: "0 0 20px",
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
      marginBottom: 10,
    },
    ctaBtn: {
      display: "block",
      width: "100%",
      padding: "11px 0",
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 600,
      textAlign: "center" as const,
      textDecoration: "none",
      cursor: "pointer",
      border: "none",
      transition: "background 0.15s ease",
    },
    ctaBtnPrimary: {
      background: "#2D6A4F",
      color: "#FFFFFF",
    },
    ctaBtnOutline: {
      background: "transparent",
      color: "#2D6A4F",
      border: "1.5px solid #2D6A4F",
    },
    comparisonSection: {
      background: "#FFFFFF",
      padding: "40px 24px 60px",
    },
    comparisonTable: {
      maxWidth: 900,
      margin: "0 auto",
      borderCollapse: "collapse" as const,
      width: "100%",
    },
    tableHeader: {
      background: "#F7F8FA",
      fontSize: 13,
      fontWeight: 700,
      color: "#374151",
      padding: "12px 16px",
      textAlign: "left" as const,
      borderBottom: "2px solid #E5E7EB",
    },
    tableCell: {
      padding: "12px 16px",
      fontSize: 14,
      color: "#374151",
      borderBottom: "1px solid #F3F4F6",
    },
    tableCellCenter: {
      textAlign: "center" as const,
      padding: "12px 16px",
      fontSize: 14,
      color: "#374151",
      borderBottom: "1px solid #F3F4F6",
    },
    noteText: {
      textAlign: "center" as const,
      fontSize: 14,
      color: "#6B7280",
      marginTop: 32,
    },
    toggleCompareBtn: {
      display: "block",
      margin: "24px auto 0",
      background: "none",
      border: "none",
      color: "#2D6A4F",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      textDecoration: "underline",
    },
  };

  const tiers = [
    {
      id: "free",
      name: "Free",
      price: { monthly: 0, annual: 0 },
      badge: "Get Started",
      badgeStyle: { background: "#F3F4F6", color: "#374151" },
      tagline: "Try it out",
      features: [
        "1 calculator",
        "Hosted page",
        "Basic lead capture",
        "50 leads/mo",
        "QuickQuote branding",
      ],
      cta: "Start Free",
      ctaStyle: "outline",
      highlighted: false,
    },
    {
      id: "starter",
      name: "Starter",
      price: { monthly: 99, annual: 79 },
      badge: "Most Popular",
      badgeStyle: { background: "#EFF6FF", color: "#2563EB" },
      tagline: "For busy sole traders",
      features: [
        "1 calculator",
        "Custom branding",
        "Email follow-ups",
        "500 leads/mo",
        "CSV export",
        "Embed snippet",
      ],
      cta: "Start Free Trial",
      ctaStyle: "primary",
      highlighted: false,
    },
    {
      id: "pro",
      name: "Pro",
      price: { monthly: 199, annual: 159 },
      badge: "Best Value",
      badgeStyle: { background: "#F0F7F4", color: "#2D6A4F" },
      tagline: "For growing businesses",
      features: [
        "3 calculators",
        "AI Employee (chat + SMS)",
        "Booking + deposits",
        "WhatsApp integration",
        "Remove branding",
        "Custom domain",
        "2,000 leads/mo",
      ],
      cta: "Start Free Trial",
      ctaStyle: "primary",
      highlighted: true,
    },
    {
      id: "elite",
      name: "Elite",
      price: { monthly: 299, annual: 239 },
      badge: "Enterprise",
      badgeStyle: { background: "#0B1F3A", color: "#FFFFFF" },
      tagline: "For agencies & multi-location",
      features: [
        "Unlimited calculators",
        "White-label",
        "Priority support",
        "API access",
        "Done-For-You onboarding",
        "Unlimited leads",
      ],
      cta: "Contact Sales",
      ctaStyle: "outline",
      highlighted: false,
    },
  ];

  const comparisonRows = [
    { feature: "Quote Calculator", free: true, starter: true, pro: true, elite: true },
    { feature: "Lead Capture", free: true, starter: true, pro: true, elite: true },
    { feature: "Email Follow-up", free: false, starter: true, pro: true, elite: true },
    { feature: "Booking + Deposits", free: false, starter: false, pro: true, elite: true },
    { feature: "AI Employee", free: false, starter: false, pro: true, elite: true },
    { feature: "SMS / WhatsApp", free: false, starter: false, pro: "Pro+", elite: true },
    { feature: "Custom Domain", free: false, starter: false, pro: true, elite: true },
    { feature: "White-Label", free: false, starter: false, pro: false, elite: true },
    { feature: "API Access", free: false, starter: false, pro: false, elite: true },
  ];

  const renderCell = (val: boolean | string) => {
    if (val === true) return <Check size={16} color="#2D6A4F" />;
    if (val === false) return <Minus size={16} color="#D1D5DB" />;
    return <span style={{ fontSize: 12, fontWeight: 700, color: "#2563EB" }}>{val}</span>;
  };

  return (
    <MarketingLayout>
      <div data-testid="pricing-page">
        <div style={s.pageHeader}>
          <h1 style={s.pageHeaderH1}>Simple, transparent pricing</h1>
          <p style={s.pageHeaderSub}>Start free. No credit card required.</p>
          <div style={s.toggleRow}>
            <span style={s.toggleLabel}>Monthly</span>
            <button
              style={s.toggleSwitch}
              onClick={() => setAnnual(a => !a)}
              aria-label="Toggle annual pricing"
              data-testid="toggle-annual"
            >
              <div style={s.toggleKnob} />
            </button>
            <span style={s.toggleLabel}>Annual</span>
            <span style={s.saveBadge}>Save 20%</span>
          </div>
        </div>

        <div style={s.tiersSection}>
          <div style={s.tiersGrid}>
            {tiers.map(tier => (
              <div
                key={tier.id}
                style={{ ...s.tierCard, ...(tier.highlighted ? s.tierCardHighlighted : {}) }}
                data-testid={`tier-${tier.id}`}
              >
                <span style={{ ...s.tierBadge, ...tier.badgeStyle }}>{tier.badge}</span>
                <p style={s.tierName}>{tier.name}</p>
                <div style={s.tierPrice}>
                  ${annual ? tier.price.annual : tier.price.monthly}
                  <span style={{ fontSize: 16, fontWeight: 500, color: "#6B7280" }}>/mo</span>
                </div>
                {annual && tier.price.annual !== tier.price.monthly && (
                  <p style={{ fontSize: 12, color: "#2D6A4F", fontWeight: 600, margin: "2px 0 8px" }}>
                    billed annually
                  </p>
                )}
                <p style={s.tierTagline}>{tier.tagline}</p>
                <div style={s.tierDivider} />
                <ul style={s.featureList}>
                  {tier.features.map(f => (
                    <li key={f} style={s.featureItem}>
                      <Check size={15} color="#2D6A4F" style={{ flexShrink: 0, marginTop: 2 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  style={{
                    ...s.ctaBtn,
                    ...(tier.ctaStyle === "primary" ? s.ctaBtnPrimary : s.ctaBtnOutline),
                  }}
                  data-testid={`button-cta-${tier.id}`}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>

          <button
            style={s.toggleCompareBtn}
            onClick={() => setShowComparison(v => !v)}
          >
            {showComparison ? "Hide comparison" : "View full comparison ▾"}
          </button>
        </div>

        {showComparison && (
          <div style={s.comparisonSection}>
            <div style={{ maxWidth: 900, margin: "0 auto" }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 24, textAlign: "center" }}>
                Feature comparison
              </h2>
              <div style={{ overflowX: "auto" }}>
                <table style={s.comparisonTable} data-testid="comparison-table">
                  <thead>
                    <tr>
                      <th style={s.tableHeader}>Feature</th>
                      <th style={{ ...s.tableHeader, textAlign: "center" }}>Free</th>
                      <th style={{ ...s.tableHeader, textAlign: "center" }}>Starter</th>
                      <th style={{ ...s.tableHeader, textAlign: "center" }}>Pro</th>
                      <th style={{ ...s.tableHeader, textAlign: "center" }}>Elite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map(row => (
                      <tr key={row.feature}>
                        <td style={s.tableCell}>{row.feature}</td>
                        <td style={s.tableCellCenter}>{renderCell(row.free)}</td>
                        <td style={s.tableCellCenter}>{renderCell(row.starter)}</td>
                        <td style={s.tableCellCenter}>{renderCell(row.pro)}</td>
                        <td style={s.tableCellCenter}>{renderCell(row.elite)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p style={s.noteText}>
              All plans include a 14-day free trial of AI Employee features.
            </p>
          </div>
        )}

        {!showComparison && (
          <div style={{ background: "#FFFFFF", padding: "20px 24px 40px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "#6B7280" }}>
              All plans include a 14-day free trial of AI Employee features.
            </p>
          </div>
        )}
      </div>
    </MarketingLayout>
  );
}
