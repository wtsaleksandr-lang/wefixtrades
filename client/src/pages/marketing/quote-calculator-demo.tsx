import { useState, useCallback } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import QuoteWidget from "@/components/quote-widget/QuoteWidget";
import { mkt, colors, shadows } from "@/theme/tokens";
import type { CalculatorData } from "@/components/quote-widget/types";
import {
  Wrench, SprayCan, Paintbrush, Zap, Home,
  ArrowRight, Clock, DollarSign, Smartphone, PhoneOff,
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
      },
    },
  },
];

const DARK = "#0d1514";
const CYAN = "#00D4C8";

const BENEFITS = [
  { icon: Clock, text: "Quotes delivered in seconds" },
  { icon: DollarSign, text: "Collect deposits upfront" },
  { icon: Smartphone, text: "Works on any device" },
];

/* ─── Page Component ─── */

export default function QuoteCalculatorDemo() {
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
              Try it yourself — this is exactly what your customers will see.
            </p>
          </div>

          {/* ─── Trade Selector ─── */}
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
            <Link href="/signup?product=quotequick" style={{ textDecoration: "none", display: "block", marginBottom: 16 }}>
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
                    Get QuoteQuick for Your Business
                  </div>
                  <div style={{
                    fontSize: 14,
                    color: "rgba(13,21,20,0.6)",
                    fontWeight: 500,
                  }}>
                    From $49/mo · Live in under 10 minutes · No code needed
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

            {/* Secondary: Talk to Us */}
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
                Talk to Us
              </div>
            </Link>

            {/* Cross-link */}
            <Link href="/tools/missed-call-calculator" style={{ textDecoration: "none", display: "block" }}>
              <div className="demo-crosslink" style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 20px",
                borderRadius: 14,
                border: `1px solid ${mkt.border}`,
                background: mkt.cardBg,
                cursor: "pointer",
                transition: "border-color 0.2s, background 0.2s",
              }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "rgba(239,68,68,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <PhoneOff size={18} color="#EF4444" strokeWidth={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 650, color: mkt.text }}>
                    Missed Call Revenue Calculator
                  </div>
                  <div style={{ fontSize: 13, color: mkt.textMuted }}>
                    See how much missed calls are costing you
                  </div>
                </div>
                <ArrowRight size={16} color={mkt.textFaint} />
              </div>
            </Link>
          </div>

        </div>
      </section>
    </MarketingLayout>
  );
}
