import { useState, useCallback } from "react";
import QuoteWidget from "@/components/quote-widget/QuoteWidget";
import { mkt } from "@/theme/tokens";
import { Wrench, SprayCan, Paintbrush, Zap, Home } from "lucide-react";
import { BODY_FONT, sectionHeading, sectionSub, SECTION_PAD, MAX_W } from "./styles";
import type { CalculatorData } from "@/components/quote-widget/types";

const TRADES: Array<{
  key: string;
  label: string;
  icon: typeof Wrench;
  color: string;
  calculator: CalculatorData;
}> = [
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
];

export default function DemoSection() {
  const [selected, setSelected] = useState(TRADES[0].key);
  const active = TRADES.find((t) => t.key === selected)!;

  const handleSelect = useCallback((key: string) => setSelected(key), []);

  return (
    <section id="qq-demo" style={{ ...SECTION_PAD, background: mkt.bg }}>
      <div style={MAX_W}>
        <div style={{ textAlign: "center", marginBottom: 40 }} data-reveal="fade-up">
          <h2 style={sectionHeading}>
            Try It <span style={{ color: mkt.accent }}>Yourself</span>
          </h2>
          <p style={sectionSub}>
            This is exactly what your customers will see on your website.
          </p>
        </div>

        {/* Trade switcher */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            marginBottom: 28,
            flexWrap: "wrap",
          }}
          data-reveal="fade-up"
          data-delay="100"
        >
          {TRADES.map((trade) => {
            const Icon = trade.icon;
            const isActive = trade.key === selected;
            return (
              <button
                key={trade.key}
                onClick={() => handleSelect(trade.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: `1.5px solid ${isActive ? trade.color : mkt.border}`,
                  background: isActive ? `${trade.color}18` : "transparent",
                  color: isActive ? trade.color : mkt.textMuted,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: BODY_FONT,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  whiteSpace: "nowrap",
                }}
              >
                <Icon size={14} strokeWidth={2} />
                {trade.label}
              </button>
            );
          })}
        </div>

        {/* Widget */}
        <div
          style={{ maxWidth: 520, margin: "0 auto" }}
          data-reveal="fade-up"
          data-delay="200"
        >
          <div key={selected}>
            <QuoteWidget calculator={active.calculator} isEmbed={false} />
          </div>
        </div>
      </div>
    </section>
  );
}
