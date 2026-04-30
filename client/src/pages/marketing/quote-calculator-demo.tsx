import { useState, useCallback, useMemo } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import QuoteWidget from "@/components/quote-widget/QuoteWidget";
import { mkt, colors, shadows } from "@/theme/tokens";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { usePageMeta } from "@/lib/usePageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import InfoTooltip from "@/components/marketing/InfoTooltip";
import NextStepSuggestions from "@/components/marketing/NextStepSuggestions";
import TrustStrip from "@/components/marketing/TrustStrip";
import type { CalculatorData } from "@/components/quote-widget/types";
import {
  Wrench, SprayCan, Paintbrush, Zap, Home, Search,
  ArrowRight, Clock, DollarSign, Smartphone, ChevronDown,
} from "lucide-react";

/* ─── Trade Definitions ─── */

interface TradeConfig {
  key: string;
  label: string;
  icon: typeof Wrench;
  color: string;
  calculator: CalculatorData;
}

const TRADES: TradeConfig[] = [
  {
    key: "plumbing",
    label: "Plumbing",
    icon: Wrench,
    color: "#3B82F6",
    calculator: {
      id: 0,
      slug: "demo-plumbing",
      business_name: "Metro Plumbing Co.",
      tagline: "Fast & reliable plumbing quotes",
      primary_color: "#3B82F6",
      pricing_config: {
        pricingType: "base_plus_rate",
        unitName: "fixture",
        baseFee: 89,
        rate: 65,
        travelFee: 25,
        addOns: [
          { id: "emergency", label: "Emergency / Same-Day", type: "fixed" as const, amount: 75 },
          { id: "camera", label: "Camera Inspection", type: "fixed" as const, amount: 120 },
          { id: "warranty", label: "Extended Warranty (2yr)", type: "pct" as const, amount: 15 },
        ],
      },
      calculator_settings: {
        ui_template: { template_id: "multi_step_progressive" },
        calculator_type: "estimate_only",
        lead_form: { fields: { name: true, email: true, phone: true }, cta_text: "Get My Quote" },
        serviceTypes: [
          { value: "drain_cleaning", label: "Drain cleaning" },
          { value: "leak_repair", label: "Leak repair" },
          { value: "toilet_install", label: "Toilet installation" },
          { value: "water_heater", label: "Water heater service" },
        ],
      },
    },
  },
  {
    key: "cleaning",
    label: "Cleaning",
    icon: SprayCan,
    color: "#10B981",
    calculator: {
      id: 0,
      slug: "demo-cleaning",
      business_name: "Sparkle Cleaning",
      tagline: "Instant cleaning estimates",
      primary_color: "#10B981",
      pricing_config: {
        pricingType: "tiered_packages",
        tierMode: "fixed" as const,
        tiers: [
          { label: "Standard Clean", price: 149 },
          { label: "Deep Clean", price: 249 },
          { label: "Move-out Clean", price: 399 },
        ],
        addOns: [
          { id: "oven", label: "Oven & Range", type: "fixed" as const, amount: 45 },
          { id: "fridge", label: "Inside Fridge", type: "fixed" as const, amount: 35 },
          { id: "windows", label: "Interior Windows", type: "fixed" as const, amount: 60 },
        ],
      },
      calculator_settings: {
        ui_template: { template_id: "multi_step_progressive" },
        calculator_type: "estimate_only",
        lead_form: { fields: { name: true, email: true, phone: true }, cta_text: "Book Now" },
        serviceTypes: [
          { value: "standard_clean", label: "Standard cleaning" },
          { value: "deep_clean", label: "Deep cleaning" },
          { value: "moveout_clean", label: "Move-out cleaning" },
          { value: "office_clean", label: "Office cleaning" },
        ],
      },
    },
  },
  {
    key: "painting",
    label: "Painting",
    icon: Paintbrush,
    color: "#F59E0B",
    calculator: {
      id: 0,
      slug: "demo-painting",
      business_name: "ProCoat Painters",
      tagline: "Interior & exterior estimates",
      primary_color: "#F59E0B",
      pricing_config: {
        pricingType: "per_sqft",
        unitName: "sq ft" as const,
        rate: 3.5,
        baseFee: 150,
        addOns: [
          { id: "primer", label: "Extra Primer Coat", type: "pct" as const, amount: 20 },
          { id: "trim", label: "Trim & Baseboards", type: "fixed" as const, amount: 200 },
          { id: "ceiling", label: "Ceiling Painting", type: "fixed" as const, amount: 175 },
        ],
      },
      calculator_settings: {
        ui_template: { template_id: "multi_step_progressive" },
        calculator_type: "estimate_only",
        lead_form: { fields: { name: true, email: true, phone: true }, cta_text: "Get Estimate" },
        serviceTypes: [
          { value: "interior_painting", label: "Interior painting" },
          { value: "exterior_painting", label: "Exterior painting" },
          { value: "cabinet_painting", label: "Cabinet painting" },
          { value: "touchup", label: "Touch-up service" },
        ],
      },
    },
  },
  {
    key: "electrical",
    label: "Electrical",
    icon: Zap,
    color: "#8B5CF6",
    calculator: {
      id: 0,
      slug: "demo-electrical",
      business_name: "Volt Electric",
      tagline: "Licensed electrical quotes",
      primary_color: "#8B5CF6",
      pricing_config: {
        pricingType: "hourly",
        unitName: "hour" as const,
        rate: 95,
        baseFee: 75,
        travelFee: 30,
        addOns: [
          { id: "panel", label: "Panel Inspection", type: "fixed" as const, amount: 85 },
          { id: "permits", label: "Permit Filing", type: "fixed" as const, amount: 120 },
        ],
      },
      calculator_settings: {
        ui_template: { template_id: "multi_step_progressive" },
        calculator_type: "estimate_only",
        lead_form: { fields: { name: true, email: true, phone: true }, cta_text: "Get My Quote" },
        serviceTypes: [
          { value: "light_fixture", label: "Light fixture installation" },
          { value: "panel_upgrade", label: "Panel upgrade" },
          { value: "outlet_repair", label: "Outlet repair" },
          { value: "ev_charger", label: "EV charger install" },
        ],
      },
    },
  },
  {
    key: "roofing",
    label: "Roofing",
    icon: Home,
    color: "#EF4444",
    calculator: {
      id: 0,
      slug: "demo-roofing",
      business_name: "Ridge Roofing",
      tagline: "Transparent roofing pricing",
      primary_color: "#EF4444",
      pricing_config: {
        pricingType: "per_sqft",
        unitName: "sq ft" as const,
        rate: 8.5,
        baseFee: 500,
        difficultyTiers: [
          { id: "standard", label: "Single Story", multiplier: 1 },
          { id: "two-story", label: "Two Story", multiplier: 1.3 },
          { id: "steep", label: "Steep Pitch", multiplier: 1.6 },
        ],
        addOns: [
          { id: "gutter", label: "Gutter Replacement", type: "fixed" as const, amount: 650 },
          { id: "flashing", label: "Flashing Repair", type: "fixed" as const, amount: 275 },
        ],
      },
      calculator_settings: {
        ui_template: { template_id: "multi_step_progressive" },
        calculator_type: "estimate_only",
        lead_form: { fields: { name: true, email: true, phone: true }, cta_text: "Get Estimate" },
        serviceTypes: [
          { value: "roof_inspection", label: "Roof inspection" },
          { value: "roof_repair", label: "Roof repair" },
          { value: "shingle_replace", label: "Shingle replacement" },
          { value: "gutter_service", label: "Gutter service" },
        ],
      },
    },
  },
];

const DARK = "#0d1514";
const CYAN = "#00D4C8";

const BENEFITS = [
  { icon: Clock, text: "Instant prices, 24/7" },
  { icon: DollarSign, text: "Every quote captures a lead" },
  { icon: Smartphone, text: "Works on any device" },
  { icon: Zap, text: "No platform switch needed" },
];

/* ─── Page Component ─── */

const BASE = "https://wefixtrades.com";

export default function QuoteCalculatorDemo() {
  usePageMeta({
    title: "Instant Quote Demo | WeFixTrades",
    description: "Try the live QuoteQuick demo. See how your customers get instant prices on your website for plumbing, cleaning, electrical, painting, and more. Free 14-day trial.",
    canonicalPath: "/tools/quote-demo",
  });

  const breadcrumbs = useMemo(() => [
    { name: "Home", url: `${BASE}/` },
    { name: "Free Tools", url: `${BASE}/tools` },
    { name: "Instant Quote Demo", url: `${BASE}/tools/quote-demo` },
  ], []);
  useBreadcrumbSchema(breadcrumbs);

  const [selectedTrade, setSelectedTrade] = useState(TRADES[0].key);

  const activeTrade = TRADES.find((t) => t.key === selectedTrade)!;

  const handleSelect = useCallback((key: string) => {
    setSelectedTrade(key);
  }, []);

  return (
    <MarketingLayout>
      <style>{`
        .trade-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: 12px;
          border: 1.5px solid ${mkt.border};
          background: transparent;
          color: ${mkt.textMuted};
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
          white-space: nowrap;
        }
        .trade-btn:hover {
          border-color: rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.04);
          color: ${mkt.text};
        }
        .trade-btn.active {
          border-color: var(--active-color);
          background: color-mix(in srgb, var(--active-color) 12%, transparent);
          color: var(--active-color);
        }
        @media (max-width: 480px) {
          .trade-btn { padding: 8px 14px; font-size: 13px; gap: 6px; }
        }
        .demo-cta-wrap {
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
        .demo-cta-wrap:hover {
          border-color: rgba(0,0,0,0.45) !important;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }
        .demo-cta-text {
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .demo-cta-wrap:hover .demo-cta-text {
          transform: translateX(8px);
        }
        .demo-arrow-track {
          display: flex;
          width: 104px;
          transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .demo-cta-wrap:hover .demo-arrow-track {
          transform: translateX(-52px);
        }
        .widget-fade-in {
          animation: widgetFadeIn 0.35s ease-out;
        }
        @keyframes widgetFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .demo-crosslink:hover {
          border-color: rgba(255,255,255,0.12) !important;
          background: rgba(255,255,255,0.06) !important;
        }
      `}</style>

      <section style={{
        background: mkt.bg,
        minHeight: "100vh",
        padding: "clamp(100px, 12vw, 140px) clamp(16px, 5vw, 40px) clamp(48px, 8vw, 80px)",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>

          {/* Breadcrumb */}
          <nav aria-label="breadcrumb" style={{ fontSize: 13, color: mkt.textMuted, marginBottom: 16 }}>
            <Link href="/" style={{ color: mkt.textMuted, textDecoration: "none" }}>Home</Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <Link href="/tools" style={{ color: mkt.textMuted, textDecoration: "none" }}>Free Tools</Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <span style={{ color: mkt.text }}>Instant Quote Demo</span>
          </nav>

          {/* ─── Headline ─── */}
          <div style={{ textAlign: "center", marginBottom: "clamp(28px, 4vw, 40px)" }}>
            <h1 style={{
              fontSize: "clamp(28px, 5vw, 40px)",
              fontWeight: 700,
              color: colors.effortel.n300,
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              margin: "0 0 14px",
            }}>
              Let your customers get{" "}
              <span style={{ color: mkt.accent }}>instant quotes</span> on your website
            </h1>
            <p style={{
              fontSize: "clamp(15px, 2vw, 17px)",
              color: mkt.textMuted,
              lineHeight: 1.55,
              margin: 0,
              maxWidth: 480,
              marginLeft: "auto",
              marginRight: "auto",
            }}>
              Try it yourself — this is what your customers see. Live in 5 minutes, no code needed.
            </p>
          </div>

          {/* ─── Trade Selector ─── */}
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: mkt.textMuted, display: "inline-flex", alignItems: "center" }}>
              Select a trade to preview
              <InfoTooltip text="Each trade shows a realistic quote calculator configured with typical pricing for that service type. Try switching between trades to see how the widget adapts." />
            </span>
          </div>
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "center",
            marginBottom: "clamp(24px, 4vw, 36px)",
          }}>
            {TRADES.map((trade) => {
              const Icon = trade.icon;
              const isActive = trade.key === selectedTrade;
              return (
                <button
                  key={trade.key}
                  className={`trade-btn${isActive ? " active" : ""}`}
                  style={{ "--active-color": trade.color } as React.CSSProperties}
                  onClick={() => handleSelect(trade.key)}
                >
                  <Icon size={16} strokeWidth={2} />
                  {trade.label}
                </button>
              );
            })}
          </div>

          {/* ─── Live Widget (centered) ─── */}
          <div style={{ maxWidth: 576, margin: "0 auto" }}>
            <div
              key={selectedTrade}
              className="widget-fade-in"
              style={{ marginBottom: "clamp(32px, 5vw, 48px)" }}
            >
              <QuoteWidget
                calculator={activeTrade.calculator}
                isEmbed={false}
              />
            </div>
          </div>

          {/* ─── Benefits ─── */}
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: "clamp(16px, 4vw, 32px)",
            flexWrap: "wrap",
            marginBottom: "clamp(28px, 4vw, 40px)",
          }}>
            {BENEFITS.map((b) => {
              const Icon = b.icon;
              return (
                <div key={b.text} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: mkt.accentTint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Icon size={14} color={mkt.accent} strokeWidth={2} />
                  </div>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: mkt.text,
                  }}>
                    {b.text}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ─── CTA ─── */}
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <Link href="/wizard" style={{ textDecoration: "none", display: "block", marginBottom: 16 }}>
              <div className="demo-cta-wrap" style={{
                background: CYAN,
                borderRadius: 16,
                border: "2px solid transparent",
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
              }}>
                <div className="demo-cta-text" style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "clamp(17px, 2.5vw, 20px)",
                    fontWeight: 700,
                    color: DARK,
                    lineHeight: 1.2,
                    marginBottom: 4,
                  }}>
                    Start Your 14-Day Free Trial
                  </div>
                  <div style={{
                    fontSize: 14,
                    color: "rgba(13,21,20,0.6)",
                    fontWeight: 500,
                  }}>
                    No credit card required · Live in 5 minutes · From $49/mo
                  </div>
                </div>
                <div style={{
                  width: 52,
                  height: 52,
                  background: DARK,
                  borderRadius: 10,
                  overflow: "hidden",
                  flexShrink: 0,
                }}>
                  <div className="demo-arrow-track" style={{ height: 52 }}>
                    {[0, 1].map((i) => (
                      <div key={i} style={{
                        width: 52,
                        height: 52,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                        <ArrowRight size={18} color="white" strokeWidth={2.2} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Link>

            {/* Secondary: TradeLine Demo */}
            <Link href="/demo" style={{ textDecoration: "none", display: "block", marginBottom: 32 }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "12px 20px", borderRadius: 14,
                border: `1px solid ${mkt.border}`, background: "transparent",
                cursor: "pointer", transition: "border-color 0.2s, background 0.2s",
                fontSize: 14, fontWeight: 600, color: mkt.textMuted,
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = mkt.border;
                  e.currentTarget.style.background = "transparent";
                }}
              >
                Try TradeLine 24/7 Demo
              </div>
            </Link>

          </div>

          {/* ─── Static SEO Content ─── */}
          <TradeDescriptions />

          {/* ─── Cross-tool suggestions ─── */}
          <div style={{ maxWidth: 640, margin: "clamp(32px, 5vw, 48px) auto 0" }}>
            <NextStepSuggestions context="demo" theme="dark" />
          </div>

          {/* ─── Trust Strip ─── */}
          <TrustStrip theme="dark" />

          {/* ─── FAQ ─── */}
          <DemoFaqSection />

        </div>
      </section>
    </MarketingLayout>
  );
}

/* ═══ Static Trade Descriptions (crawlable) ═══ */

const TRADE_SECTIONS = [
  {
    heading: "Instant Quote Calculator for Plumbing Businesses",
    text: "Plumbing customers often need help fast — a leaking pipe or clogged drain won't wait. With an instant quote calculator on your website, they can see pricing for common jobs like fixture replacements, drain clearing, or emergency calls without picking up the phone. Every quote captures their name, email, and phone number so you can follow up directly.",
  },
  {
    heading: "Instant Quote Calculator for Cleaning Services",
    text: "Cleaning clients want to know what a standard clean, deep clean, or move-out clean will cost before they book. A quote calculator lets them select their service type, choose add-ons like oven cleaning or window washing, and see a price instantly. You get the lead with all their selections — ready to confirm and schedule.",
  },
  {
    heading: "Instant Quote Calculator for Painting Contractors",
    text: "Painting estimates depend on square footage, surface prep, and the number of coats. An online calculator lets homeowners enter their room size and see a ballpark price in seconds. This filters out tire-kickers and sends you qualified leads who already understand your pricing range.",
  },
  {
    heading: "Instant Quote Calculator for Electricians",
    text: "Electrical work is priced by the hour plus materials. A quote tool lets customers describe their job — panel upgrades, outlet installations, or rewiring — and get an estimate based on your actual rates. Leads arrive with the scope already defined, saving you time on every follow-up call.",
  },
  {
    heading: "Instant Quote Calculator for Roofing Companies",
    text: "Roofing jobs are high-value and competitive. Homeowners comparing roofers want pricing transparency. A calculator that factors in roof size, pitch, and materials gives them confidence in your numbers — and gives you a qualified lead with project details before you ever get on the phone.",
  },
];

function TradeDescriptions() {
  const [activeIdx, setActiveIdx] = useState(0);

  return (
    <div style={{
      maxWidth: 640,
      margin: "0 auto",
      paddingTop: "clamp(40px, 6vw, 64px)",
      borderTop: `1px solid ${mkt.border}`,
      marginTop: "clamp(40px, 6vw, 64px)",
    }}>
      <h2 style={{
        fontSize: "clamp(18px, 2.5vw, 22px)",
        fontWeight: 700,
        color: colors.effortel.n300,
        lineHeight: 1.2,
        letterSpacing: "-0.01em",
        margin: "0 0 16px",
        textAlign: "center",
      }}>
        Instant Quote Calculator by Trade
      </h2>

      {/* Tab buttons */}
      <div style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        justifyContent: "center",
        marginBottom: 20,
      }}>
        {TRADE_SECTIONS.map((section, i) => {
          const isActive = i === activeIdx;
          const shortLabel = section.heading.replace("Instant Quote Calculator for ", "");
          return (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              style={{
                padding: "7px 14px",
                borderRadius: 9999,
                border: `1px solid ${isActive ? "rgba(102,232,250,0.3)" : mkt.border}`,
                background: isActive ? "rgba(102,232,250,0.08)" : "transparent",
                color: isActive ? mkt.accent : mkt.textMuted,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {shortLabel}
            </button>
          );
        })}
      </div>

      {/* Active tab content */}
      <div style={{
        background: mkt.cardBg,
        border: `1px solid ${mkt.cardBorder}`,
        borderRadius: 14,
        padding: "20px 22px",
      }}>
        <h3 style={{
          fontSize: 16,
          fontWeight: 700,
          color: colors.effortel.n300,
          lineHeight: 1.3,
          margin: "0 0 8px",
        }}>
          {TRADE_SECTIONS[activeIdx].heading}
        </h3>
        <p style={{
          fontSize: 14,
          color: mkt.textMuted,
          lineHeight: 1.7,
          margin: 0,
        }}>
          {TRADE_SECTIONS[activeIdx].text}
        </p>
      </div>

      {/* Hidden SEO text — all trade descriptions remain in DOM for crawlers */}
      <div style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }} aria-hidden="true">
        {TRADE_SECTIONS.map((section, i) => (
          <div key={i}>
            <h2>{section.heading}</h2>
            <p>{section.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ FAQ Section ═══ */

const DEMO_FAQ_ITEMS = [
  {
    question: "How accurate are the quotes?",
    answer: "Quotes are calculated from pricing rules you define — base fees, hourly rates, per-sqft pricing, add-ons, and modifiers. The customer sees numbers based on your actual rates, so accuracy is in your control.",
  },
  {
    question: "Can I customize the pricing and questions?",
    answer: "Yes. QuoteQuick supports 10 pricing options including hourly rates, per square foot, tiered packages, and service call + hourly. You can add custom extras, job complexity levels, travel fees, and after-hours surcharges.",
  },
  {
    question: "Does it work on mobile?",
    answer: "Yes. The quote widget is fully responsive and optimized for mobile. Customers can complete the entire flow — from selecting options to submitting their details — on any device.",
  },
  {
    question: "How are leads delivered?",
    answer: "When a customer submits a quote, you receive an email with their name, email, phone number, quote amount, and all their selections. Leads also appear in your dashboard for easy follow-up.",
  },
  {
    question: "How do I add it to my website?",
    answer: "You embed a single line of code on any page. It works with WordPress, Wix, Squarespace, and any platform that supports HTML. No developer needed — setup takes under 10 minutes.",
  },
  {
    question: "Is there a free trial?",
    answer: "You can try the full demo on this page to see exactly how it works. Plans start at $49/mo with no contracts — cancel anytime.",
  },
];

function DemoFaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const faqSchemaItems = useMemo(() => DEMO_FAQ_ITEMS.map(f => ({ question: f.question, answer: f.answer })), []);
  useFaqSchema(faqSchemaItems);

  return (
    <div style={{
      maxWidth: 640,
      margin: "0 auto",
      paddingTop: "clamp(32px, 5vw, 48px)",
      borderTop: `1px solid ${mkt.border}`,
      marginTop: "clamp(32px, 5vw, 48px)",
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: mkt.accent,
        letterSpacing: "0.12em",
        textTransform: "uppercase" as const,
        marginBottom: 14,
        textAlign: "center",
      }}>
        FAQ
      </div>
      <h2 style={{
        fontSize: "clamp(22px, 3vw, 30px)",
        fontWeight: 700,
        color: colors.effortel.n300,
        letterSpacing: "-0.025em",
        lineHeight: 1.15,
        margin: "0 0 24px",
        textAlign: "center",
      }}>
        Frequently Asked Questions
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {DEMO_FAQ_ITEMS.map((item, i) => {
          const isOpen = openIdx === i;
          return (
            <div key={i} style={{
              border: `1px solid ${mkt.border}`,
              borderRadius: 14,
              overflow: "hidden",
              transition: "border-color 0.2s ease",
            }}>
              <button
                onClick={() => setOpenIdx(isOpen ? null : i)}
                aria-expanded={isOpen}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "18px 22px",
                  background: isOpen ? mkt.surface : "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: mkt.text,
                  fontSize: 15,
                  fontWeight: 600,
                  textAlign: "left",
                  lineHeight: 1.4,
                  transition: "background 0.2s ease",
                }}
              >
                <span>{item.question}</span>
                <ChevronDown
                  size={17}
                  color={mkt.textFaint}
                  style={{
                    flexShrink: 0,
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                />
              </button>

              {isOpen && (
                <div style={{
                  padding: "0 22px 18px",
                  fontSize: 14,
                  color: mkt.textMuted,
                  lineHeight: 1.7,
                }}>
                  {item.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══ Audit Callout ═══ */

function AuditCallout() {
  return (
    <div style={{
      maxWidth: 640,
      margin: "0 auto",
      marginTop: "clamp(32px, 5vw, 48px)",
      paddingTop: "clamp(24px, 4vw, 36px)",
      borderTop: `1px solid ${mkt.border}`,
    }}>
      <div style={{
        fontSize: "clamp(16px, 2.2vw, 18px)",
        fontWeight: 700,
        color: colors.effortel.n300,
        marginBottom: 8,
      }}>
        Before you install a quote tool, check this
      </div>
      <p style={{
        fontSize: 14,
        color: mkt.textMuted,
        lineHeight: 1.7,
        margin: "0 0 14px",
      }}>
        A quote calculator only works if customers can find your website. Run a
        free audit to check your Google Business Profile and website health first —
        then add QuoteQuick to convert the traffic you're already getting.
      </p>
      <Link href="/tools/free-audit" style={{ textDecoration: "none", display: "inline-block" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 16px", borderRadius: 12,
          border: `1px solid ${mkt.border}`, background: mkt.cardBg,
          cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
          fontSize: 13, fontWeight: 650, color: mkt.text,
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = mkt.border; e.currentTarget.style.background = mkt.cardBg; }}
        >
          <Search size={14} color={mkt.accent} strokeWidth={1.8} />
          Run Free Audit
          <ArrowRight size={13} color={mkt.textFaint} />
        </div>
      </Link>
    </div>
  );
}
