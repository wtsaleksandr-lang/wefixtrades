import { useState, useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { ArrowRight } from "lucide-react";

const p = {
  colors: {
    accent: "#2D6A4F",
    accentDark: "#1B4332",
    navyBg: "#0B1F3A",
    lightBg: "#F7F8FA",
    surface: "#FFFFFF",
    heading: "#111827",
    body: "#374151",
    muted: "#6B7280",
    border: "#E5E7EB",
    blue: "#2563EB",
  },
  shadows: {
    card: "0 1px 3px rgba(0,0,0,0.05), 0 1px 8px rgba(0,0,0,0.04)",
  },
  radius: { sm: "8px", md: "12px", pill: "999px" },
};

const TEMPLATES = [
  {
    id: "classic-single",
    name: "Classic Single",
    description: "The proven single-page layout. Clean, fast, converts well.",
    tag: "Single Page",
    recommended: "Plumbing, Electrical, General",
    testid: "template-card-classic-single",
  },
  {
    id: "two-column",
    name: "Two Column",
    description: "Sticky summary sidebar keeps the estimate visible as customers fill in details.",
    tag: "Single Page",
    recommended: "Cleaning, Landscaping",
    testid: "template-card-two-column",
  },
  {
    id: "multi-step",
    name: "Multi-Step Progressive",
    description: "Step-by-step with progress bar. Feels like a premium experience.",
    tag: "Multi-Step",
    recommended: "HVAC, Roofing, Flooring",
    testid: "template-card-multi-step",
  },
  {
    id: "package-selector",
    name: "Package Selector",
    description: "Tiered package cards. Perfect for service businesses with clear tiers.",
    tag: "Package Cards",
    recommended: "Photography, Consulting",
    testid: "template-card-package-selector",
  },
  {
    id: "range-leadgate",
    name: "Range + Lead Gate",
    description: "Shows a price range to intrigue, then captures the lead before the exact quote.",
    tag: "Single Page",
    recommended: "High-value jobs",
    testid: "template-card-range-leadgate",
  },
  {
    id: "estimate-book",
    name: "Estimate Then Book",
    description: "Estimate first, then immediate booking CTA. Highest conversion for booking-first businesses.",
    tag: "Multi-Step",
    recommended: "Any booking-enabled trade",
    testid: "template-card-estimate-book",
  },
];

const ALL_TAGS = ["All", "Single Page", "Multi-Step", "Package Cards"];

const tagColors: Record<string, string> = {
  "Single Page": "#EFF6FF",
  "Multi-Step": "#F0FDF4",
  "Package Cards": "#FFF7ED",
};
const tagTextColors: Record<string, string> = {
  "Single Page": "#2563EB",
  "Multi-Step": "#2D6A4F",
  "Package Cards": "#EA580C",
};

export default function TemplatesPage() {
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    document.title = "Calculator Templates — QuickQuotePro";
  }, []);

  const filtered = activeFilter === "All" ? TEMPLATES : TEMPLATES.filter(t => t.tag === activeFilter);

  return (
    <MarketingLayout>
      <div data-testid="templates-page" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* Page Header */}
        <div style={{ background: p.colors.navyBg, padding: "80px 24px 64px" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto", textAlign: "center" }}>
            <div style={{
              display: "inline-block",
              background: "rgba(45,106,79,0.3)",
              color: "#6EE7B7",
              padding: "4px 14px",
              borderRadius: p.radius.pill,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}>
              6 Templates Available
            </div>
            <h1 style={{ fontSize: 42, fontWeight: 800, color: "#FFFFFF", margin: "0 0 16px", lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              6 High-Converting Calculator Templates
            </h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", margin: 0, maxWidth: 540, marginLeft: "auto", marginRight: "auto" }}>
              Pick a template, customise your pricing logic, and go live in minutes.
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ background: p.colors.surface, borderBottom: `1px solid ${p.colors.border}`, position: "sticky", top: 60, zIndex: 10 }}>
          <div style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 24px", display: "flex", gap: 8, flexWrap: "wrap" as const }}>
            {ALL_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveFilter(tag)}
                data-testid={`filter-${tag.toLowerCase().replace(/\s+/g, "-")}`}
                style={{
                  padding: "6px 16px",
                  borderRadius: p.radius.pill,
                  border: `1.5px solid ${activeFilter === tag ? p.colors.accent : p.colors.border}`,
                  background: activeFilter === tag ? p.colors.accent : "transparent",
                  color: activeFilter === tag ? "#FFFFFF" : p.colors.body,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Template Grid */}
        <div style={{ background: p.colors.lightBg, padding: "56px 24px 80px" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 24,
            }}>
              {filtered.map(template => (
                <div
                  key={template.id}
                  data-testid={template.testid}
                  style={{
                    background: p.colors.surface,
                    borderRadius: p.radius.md,
                    boxShadow: p.shadows.card,
                    border: `1px solid ${p.colors.border}`,
                    overflow: "hidden",
                  }}
                >
                  {/* Mock Screenshot Placeholder */}
                  <div style={{
                    height: 180,
                    background: "linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}>
                    <div style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "column" as const,
                      gap: 8,
                    }}>
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: p.radius.sm,
                        background: "rgba(255,255,255,0.7)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}>
                        <div style={{ width: 24, height: 3, background: "#9CA3AF", borderRadius: 2, marginBottom: 4 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#6B7280" }}>{template.name}</span>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div style={{ padding: "20px 24px 24px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: p.colors.heading, margin: 0 }}>
                        {template.name}
                      </h3>
                      <span style={{
                        flexShrink: 0,
                        padding: "2px 10px",
                        borderRadius: p.radius.pill,
                        fontSize: 11,
                        fontWeight: 600,
                        background: tagColors[template.tag] || "#F3F4F6",
                        color: tagTextColors[template.tag] || p.colors.muted,
                      }}>
                        {template.tag}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, color: p.colors.muted, lineHeight: 1.6, margin: "0 0 14px" }}>
                      {template.description}
                    </p>
                    <p style={{ fontSize: 12, color: p.colors.muted, margin: "0 0 18px" }}>
                      <strong style={{ color: p.colors.body }}>Recommended for:</strong> {template.recommended}
                    </p>
                    <Link
                      href="/Wizard"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "8px 16px",
                        borderRadius: p.radius.sm,
                        background: p.colors.accent,
                        color: "#FFFFFF",
                        fontSize: 14,
                        fontWeight: 600,
                        textDecoration: "none",
                        transition: "background 0.15s ease",
                      }}
                    >
                      Use This Template <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Band */}
        <div style={{ background: "linear-gradient(135deg, #2D6A4F, #1B4332)", padding: "64px 24px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: "#FFFFFF", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              Not sure which template to use?
            </h2>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.8)", margin: "0 0 32px" }}>
              Our wizard will recommend the best one for your trade and pricing model.
            </p>
            <Link
              href="/Wizard"
              style={{
                display: "inline-block",
                padding: "14px 32px",
                borderRadius: p.radius.sm,
                background: "#FFFFFF",
                color: p.colors.accent,
                fontSize: 16,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Get a Recommendation
            </Link>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
