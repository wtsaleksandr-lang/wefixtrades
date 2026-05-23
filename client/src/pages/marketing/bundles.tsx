import { useEffect, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import CheckoutIntakeModal from "@/components/marketing/CheckoutIntakeModal";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { mkt, colors, shadows } from "@/theme/tokens";
import {
  BUNDLE_STARTER, BUNDLE_GROWTH, BUNDLE_PRO,
  formatPrice, bundleSavings, type BundleDef,
} from "@/config/pricing";

/** Bundle currently being checked out (modal target), or null when modal is closed. */
type ActiveBundle = {
  id: string;
  name: string;
  priceLabel: string;
  items: string[];
} | null;

export default function BundlesPage() {
  useEffect(() => {
    document.title = "Bundles — QuoteQuick + WeFixTrades";
  }, []);

  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeBundle, setActiveBundle] = useState<ActiveBundle>(null);

  const openCheckout = (bundle: BundleDef) => {
    setActiveBundle({
      id: bundle.id,
      name: bundle.name,
      priceLabel: `${formatPrice(bundle.price)}/mo`,
      items: bundle.includes.map((i) => i.tierId),
    });
  };

  const s = {
    pageHeader: {
      background: `linear-gradient(135deg, ${mkt.dark}, ${mkt.darkHover})`,
      padding: "80px 24px 60px",
      textAlign: "center" as const,
    },
    pageHeaderH1: {
      fontSize: "clamp(32px, 5vw, 48px)",
      fontWeight: 700,
      color: mkt.onDark,
      margin: "0 0 16px",
      letterSpacing: "-0.025em",
    },
    pageHeaderSub: {
      fontSize: 18,
      color: mkt.onDarkMuted,
      margin: 0,
    },
    bundlesSection: {
      background: mkt.sectionLight,
      padding: "60px 24px",
    },
    bundlesGrid: {
      maxWidth: 1100,
      margin: "0 auto",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
      gap: 24,
      alignItems: "start",
    },
    bundleCard: {
      background: mkt.bg,
      borderRadius: 16,
      padding: "36px 32px",
      boxShadow: shadows.card,
      border: `1px solid ${mkt.onDarkBorder}`,
    },
    bundleCardHighlighted: {
      border: `2px solid ${mkt.accent}`,
      boxShadow: shadows.cardHover,
    },
    badge: {
      display: "inline-block",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
      padding: "4px 12px",
      borderRadius: 14,
      marginBottom: 20,
    },
    bundleName: {
      fontSize: 24,
      fontWeight: 700,
      color: mkt.onDark,
      margin: "0 0 4px",
      letterSpacing: "-0.01em",
    },
    bundlePrice: {
      fontSize: 36,
      fontWeight: 700,
      color: mkt.onDark,
      letterSpacing: "-0.02em",
      lineHeight: 1,
      margin: "8px 0 4px",
    },
    bundlePricePeriod: {
      fontSize: 14,
      color: mkt.onDarkMuted,
      margin: "0 0 24px",
    },
    savingBadge: {
      display: "inline-block",
      background: mkt.accentTint,
      color: mkt.accent,
      fontSize: 13,
      fontWeight: 700,
      padding: "4px 12px",
      borderRadius: 14,
      marginBottom: 24,
    },
    divider: {
      height: 1,
      background: mkt.borderLight,
      margin: "0 0 20px",
    },
    includesLabel: {
      fontSize: 12,
      fontWeight: 700,
      color: mkt.onDarkMuted,
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
      color: mkt.onDarkMuted,
      lineHeight: 1.5,
      marginBottom: 12,
    },
    ctaBtn: {
      display: "block",
      width: "100%",
      padding: "13px 0",
      borderRadius: 10,
      background: mkt.ctaBg,
      color: mkt.ctaText,
      fontSize: 15,
      fontWeight: 500,
      textAlign: "center" as const,
      border: "none",
      cursor: "pointer",
      transition: "background 0.22s ease, transform 0.15s ease",
    },
    faqSection: {
      background: mkt.bg,
      padding: "60px 24px",
    },
    faqWrap: {
      maxWidth: 720,
      margin: "0 auto",
    },
    faqTitle: {
      fontSize: 28,
      fontWeight: 700,
      color: mkt.onDark,
      margin: "0 0 32px",
      textAlign: "center" as const,
    },
    faqItem: {
      borderBottom: `1px solid ${mkt.borderLight}`,
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
      color: mkt.onDark,
      flex: 1,
    },
    faqAnswer: {
      fontSize: 14,
      color: mkt.onDarkMuted,
      lineHeight: 1.7,
      paddingBottom: 20,
    },
  };

  const bundleToIncludes = (b: BundleDef) =>
    b.includes.map(i => `${i.label} (${formatPrice(i.value)}/mo value)`);

  const starterIncludes = bundleToIncludes(BUNDLE_STARTER);
  const growthIncludes = bundleToIncludes(BUNDLE_GROWTH);
  const proIncludes = bundleToIncludes(BUNDLE_PRO);

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
      <div data-theme="light" data-testid="bundles-page">
        <div style={s.pageHeader}>
          <h1 style={s.pageHeaderH1}>Get the Full System</h1>
          <p style={s.pageHeaderSub}>Combine software + done-for-you services for maximum results.</p>
        </div>

        <div style={s.bundlesSection}>
          <div style={s.bundlesGrid}>
            <div style={s.bundleCard} data-testid="bundle-starter">
              <span style={{ ...s.badge, background: "#EAF1FF", color: "#0d3cfc" }}>
                Best value starter
              </span>
              <h2 style={s.bundleName}>Starter System</h2>
              <div style={s.bundlePrice}>
                {formatPrice(BUNDLE_STARTER.price)}
                <span style={{ fontSize: 16, fontWeight: 500, color: "#6B7280" }}>/mo</span>
              </div>
              <p style={s.bundlePricePeriod}>{BUNDLE_STARTER.tagline}</p>
              <span style={s.savingBadge}>Save {formatPrice(bundleSavings(BUNDLE_STARTER))}/mo vs buying separately</span>
              <div style={s.divider} />
              <p style={s.includesLabel}>Includes</p>
              <ul style={s.featureList}>
                {starterIncludes.map(f => (
                  <li key={f} style={s.featureItem}>
                    <Check size={16} color={mkt.accent} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                style={s.ctaBtn}
                data-testid="button-get-started-starter"
                onClick={() => openCheckout(BUNDLE_STARTER)}
              >
                Get Started
              </button>
            </div>

            <div style={{ ...s.bundleCard, ...s.bundleCardHighlighted }} data-testid="bundle-growth">
              <span style={{ ...s.badge, background: "#0B1F3A", color: "#FFFFFF" }}>
                Most Popular
              </span>
              <h2 style={s.bundleName}>Growth System</h2>
              <div style={s.bundlePrice}>
                {formatPrice(BUNDLE_GROWTH.price)}
                <span style={{ fontSize: 16, fontWeight: 500, color: "#6B7280" }}>/mo</span>
              </div>
              <p style={s.bundlePricePeriod}>{BUNDLE_GROWTH.tagline}</p>
              <span style={s.savingBadge}>Save {formatPrice(bundleSavings(BUNDLE_GROWTH))}/mo vs buying separately</span>
              <div style={s.divider} />
              <p style={s.includesLabel}>Includes</p>
              <ul style={s.featureList}>
                {growthIncludes.map(f => (
                  <li key={f} style={s.featureItem}>
                    <Check size={16} color={mkt.accent} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                style={s.ctaBtn}
                data-testid="button-get-started-growth"
                onClick={() => openCheckout(BUNDLE_GROWTH)}
              >
                Get Started
              </button>
            </div>

            <div style={s.bundleCard} data-testid="bundle-pro">
              <span style={{ ...s.badge, background: "#F59E0B", color: "#FFFFFF" }}>
                Hands-free growth
              </span>
              <h2 style={s.bundleName}>Pro System</h2>
              <div style={s.bundlePrice}>
                {formatPrice(BUNDLE_PRO.price)}
                <span style={{ fontSize: 16, fontWeight: 500, color: "#6B7280" }}>/mo</span>
              </div>
              <p style={s.bundlePricePeriod}>{BUNDLE_PRO.tagline}</p>
              <span style={s.savingBadge}>Save {formatPrice(bundleSavings(BUNDLE_PRO))}/mo vs buying separately</span>
              <div style={s.divider} />
              <p style={s.includesLabel}>Includes</p>
              <ul style={s.featureList}>
                {proIncludes.map(f => (
                  <li key={f} style={s.featureItem}>
                    <Check size={16} color={mkt.accent} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                style={s.ctaBtn}
                data-testid="button-get-started-pro"
                onClick={() => openCheckout(BUNDLE_PRO)}
              >
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
                    <ChevronUp size={20} color="#6B7280" strokeWidth={1.5} />
                  ) : (
                    <ChevronDown size={20} color="#6B7280" strokeWidth={1.5} />
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

      <CheckoutIntakeModal
        open={!!activeBundle}
        onClose={() => setActiveBundle(null)}
        items={activeBundle?.items ?? []}
        bundleId={activeBundle?.id}
        bundleName={activeBundle?.name}
        priceLabel={activeBundle?.priceLabel}
      />
    </MarketingLayout>
  );
}
