import { Settings2, Layers, Bot, Code2, RefreshCcw } from "lucide-react";
import FeaturePage, { type FeaturePageConfig } from "@/components/marketing/FeaturePage";
import { mkt, colors, shadows } from "@/theme/tokens";

/* ── Mockup ──────────────────────────────────── */
function EngineMockup() {
  const formulaTypes = [
    { name: "Area-Based (m²)", active: true, example: "Base $200 + $45/m²" },
    { name: "Hourly Rate", active: false, example: "$95/hr · Min 2hrs" },
    { name: "Tiered Range", active: false, example: "0–10m² · 10–30m² · 30m²+" },
    { name: "Package Select", active: false, example: "Basic · Standard · Premium" },
  ];

  return (
    <div data-theme="light"
      style={{
        background: mkt.bg,
        border: `1px solid ${mkt.onDarkBorder}`,
        borderRadius: 20,
        padding: 26,
        width: "100%",
        maxWidth: 400,
        boxShadow: shadows.xl,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${mkt.borderLight}` }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F5F3FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Settings2 size={18} color={"#7C3AED"} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: mkt.text }}>Pricing Formula Builder</div>
          <div style={{ fontSize: 11, color: mkt.onDarkMuted }}>10 formula types available</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, background: "rgba(13,60,252,0.10)", color: mkt.accent, padding: "3px 10px", borderRadius: 20 }}>AI Validated ✓</div>
      </div>

      {/* Formula type selector */}
      <div style={{ fontSize: 11, fontWeight: 700, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Pricing Model</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {formulaTypes.map(({ name, active, example }) => (
          <div key={name} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 14px", borderRadius: 10,
            background: active ? "#F5F3FF" : mkt.surface,
            border: `1.5px solid ${active ? "#7C3AED" : mkt.border}`,
            cursor: "pointer",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: active ? "#7C3AED" : mkt.border, border: `2px solid ${active ? "#7C3AED" : mkt.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#FFFFFF" }} />}
              </div>
              <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? "#7C3AED" : mkt.text }}>{name}</span>
            </div>
            <span style={{ fontSize: 11, color: mkt.onDarkMuted }}>{example}</span>
          </div>
        ))}
      </div>

      {/* Formula parameters */}
      <div style={{ fontSize: 11, fontWeight: 700, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Parameters</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {[
          { label: "Base Rate", val: "$200.00" },
          { label: "Per m² rate", val: "$45.00" },
          { label: "Minimum charge", val: "$350.00" },
        ].map(({ label, val }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: mkt.onDarkMuted }}>{label}</span>
            <div style={{ background: mkt.sectionLight, border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, color: mkt.text }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Preview */}
      <div style={{ background: "#F5F3FF", borderRadius: 12, padding: "14px 18px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: mkt.onDarkMuted, marginBottom: 6 }}>Formula Preview — 12m²</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#7C3AED", fontFamily: "monospace" }}>
          $200 + (12 × $45) = <span style={{ color: "#6D28D9" }}>$740</span>
        </div>
        <div style={{ fontSize: 11, color: mkt.onDarkMuted, marginTop: 4 }}>Output range: $666 – $814 (±10%)</div>
      </div>
    </div>
  );
}

const config: FeaturePageConfig = {
  meta: { title: "Calculator Engine — QuoteQuick Pro | Build a Pricing Calculator for Any Trade" },
  hero: {
    badge: "Calculator Engine",
    badgeColor: "#7C3AED",
    headline: "Build a Pricing Calculator for Any Trade, Any Job",
    highlightedWords: ["Any Trade", "Any Job"],
    sub: "10 flexible pricing formula types, AI-validated configuration, and instant results — built for the complexity of real-world trades pricing.",
    accentColor: "#7C3AED",
  },
  demo: {
    label: "Formula Builder",
    title: "A pricing engine built for how trades actually work",
    description: "Most quote tools force you into a fixed template. QuoteQuick Pro gives you 10 formula families — from simple hourly rates to complex area-based pricing with tiered ranges, addons, and conditional logic. Then AI validates your configuration before it goes live.",
    bullets: [
      "10 formula types: fixed, hourly, area, tiered, package, base+addon, and more",
      "Multiple pricing inputs per calculator (size, grade, extras, room count)",
      "AI validates your formula against real-world scenarios before publishing",
      "Configurable output range (e.g. ±10%) to account for real-world variation",
    ],
    bulletColor: "#7C3AED",
    mockup: EngineMockup,
  },
  benefits: [
    {
      icon: Settings2,
      title: "10 Formula Types",
      body: "Every pricing model a trades business needs — from simple per-hour rates to complex multi-variable formulas with conditional pricing logic.",
      color: "#7C3AED", bg: "#F5F3FF",
    },
    {
      icon: Bot,
      title: "AI-Validated Before Live",
      body: "Run 3 test scenarios before publishing. AI compares your formula output against your expected pricing and flags anything that looks wrong.",
      color: mkt.accent, bg: mkt.accentTint,
    },
    {
      icon: Layers,
      title: "Multi-Input Calculators",
      body: "Combine room size, job complexity, finish grade, extras, and more — all feeding into a single accurate estimate for the customer.",
      color: colors.accent.blue, bg: colors.accent.blueTint,
    },
    {
      icon: Code2,
      title: "Embed Anywhere",
      body: "A single script tag or iframe embeds your calculator on any website. Works with WordPress, Wix, Squarespace, Webflow, and custom HTML.",
      color: mkt.orange, bg: mkt.orangeTint,
    },
  ],
  steps: [
    { num: "01", title: "Choose a Formula Type", body: "Select from 10 pricing formula families. The wizard guides you through configuration with plain-English prompts — no maths or coding required." },
    { num: "02", title: "Set Inputs & Parameters", body: "Define what customers enter (room size, number of rooms, job type) and how each input affects the final price. Preview the formula in real time." },
    { num: "03", title: "Validate & Publish", body: "Run the AI test gate: enter 3 scenarios and compare the output against what you'd actually charge. Publish when the accuracy score hits 80%+." },
  ],
  faqs: [
    { q: "What formula types are supported?", a: "We support 10 formula families: Fixed Price, Hourly Rate, Area-Based (m²), Per-Item/Room, Tiered Ranges, Base + Addon, Percentage Markup, Package Selector, Range Only, and Custom Combination formulas." },
    { q: "What is the AI test gate?", a: "Before publishing, you enter 3 real job scenarios (small, typical, large) and compare the calculator's output against what you would actually charge. AI reviews the accuracy and gives you a score. A score of 80%+ unlocks publishing." },
    { q: "Can I have multiple calculators?", a: "Yes. The number of calculators depends on your plan — Free (1), Starter (1), Pro (3), Elite (unlimited). Each calculator can have a different formula, template, and branding." },
    { q: "Can I update pricing after going live?", a: "Yes, anytime. Changes are reflected in all future estimates immediately. Old estimates retain their original price if you've set a validity period." },
    { q: "What trades are supported?", a: "All of them. The engine is trade-agnostic — it works for plumbing, roofing, cleaning, electrical, landscaping, painting, flooring, photography, pet services, and any other service business." },
  ],
  cta: {
    headline: "Build Your Pricing Calculator in 10 Minutes",
    sub: "No coding. No maths. Just fill in your pricing — and let the engine handle everything else.",
  },
};

export default function CalculatorEnginePage() {
  return <FeaturePage config={config} />;
}
