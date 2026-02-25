import { useState, useEffect } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Search, BookOpen, Zap, Settings, Bot, MessageSquare, Calendar, Globe, Code, ArrowRight, ChevronRight } from "lucide-react";

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

const DOC_CATEGORIES = [
  { label: "Getting Started", icon: Zap, id: "getting-started" },
  { label: "Calculator Setup", icon: Settings, id: "calculator-setup" },
  { label: "Pricing Logic", icon: BookOpen, id: "pricing-logic" },
  { label: "AI Employee", icon: Bot, id: "ai-employee" },
  { label: "SMS & WhatsApp", icon: MessageSquare, id: "sms-whatsapp" },
  { label: "Booking Engine", icon: Calendar, id: "booking-engine" },
  { label: "Embeds & Domains", icon: Globe, id: "embeds-domains" },
  { label: "API Reference", icon: Code, id: "api-reference" },
];

const DOC_CONTENT: Record<string, { title: string; description: string; articles: { title: string; status: string }[] }> = {
  "getting-started": {
    title: "Getting Started",
    description: "Everything you need to launch your first quote calculator and go live in under 10 minutes.",
    articles: [
      { title: "Create your first calculator", status: "Read More →" },
      { title: "Publishing your calculator page", status: "Read More →" },
      { title: "Embedding on your website", status: "Read More →" },
      { title: "Connecting your first lead notification", status: "Read More →" },
    ],
  },
  "calculator-setup": {
    title: "Calculator Setup",
    description: "Configure sliders, fields, and display options for your quote calculator.",
    articles: [
      { title: "Adding slider fields", status: "Read More →" },
      { title: "Configuring input types", status: "Read More →" },
      { title: "Setting up trade categories", status: "Read More →" },
      { title: "Template customisation guide", status: "Coming Soon" },
    ],
  },
  "pricing-logic": {
    title: "Pricing Logic",
    description: "Define your pricing formulas, rate sheets, and dynamic adjustments.",
    articles: [
      { title: "Formula families overview", status: "Read More →" },
      { title: "Setting base rates and multipliers", status: "Read More →" },
      { title: "Area-based pricing", status: "Read More →" },
      { title: "Package pricing tiers", status: "Coming Soon" },
    ],
  },
  "ai-employee": {
    title: "AI Employee",
    description: "Configure your AI agent's persona, knowledge base, and escalation rules.",
    articles: [
      { title: "AI Employee overview", status: "Read More →" },
      { title: "Training your AI with FAQs", status: "Read More →" },
      { title: "Setting up escalation rules", status: "Coming Soon" },
      { title: "Function calling and integrations", status: "Coming Soon" },
    ],
  },
  "sms-whatsapp": {
    title: "SMS & WhatsApp",
    description: "Set up two-way SMS/WhatsApp conversations powered by your AI employee.",
    articles: [
      { title: "Connecting your Twilio number", status: "Read More →" },
      { title: "Enabling WhatsApp", status: "Read More →" },
      { title: "Take Over mode", status: "Read More →" },
      { title: "Rate limiting and compliance", status: "Coming Soon" },
    ],
  },
  "booking-engine": {
    title: "Booking Engine",
    description: "Accept bookings and deposits directly from your calculator widget.",
    articles: [
      { title: "Setting up availability slots", status: "Read More →" },
      { title: "Connecting Stripe for deposits", status: "Read More →" },
      { title: "Booking confirmation emails", status: "Coming Soon" },
      { title: "Calendar integrations", status: "Coming Soon" },
    ],
  },
  "embeds-domains": {
    title: "Embeds & Domains",
    description: "Embed your calculator anywhere or use a custom domain for your hosted page.",
    articles: [
      { title: "Embed snippet guide", status: "Read More →" },
      { title: "Setting up a custom domain", status: "Read More →" },
      { title: "iframe vs JavaScript embed", status: "Read More →" },
      { title: "CNAME configuration", status: "Coming Soon" },
    ],
  },
  "api-reference": {
    title: "API Reference",
    description: "Integrate QuickQuotePro with your existing systems via our REST API.",
    articles: [
      { title: "Authentication & API keys", status: "Coming Soon" },
      { title: "Leads API", status: "Coming Soon" },
      { title: "Calculator API", status: "Coming Soon" },
      { title: "Webhooks", status: "Coming Soon" },
    ],
  },
};

const QUICKSTART_CARDS = [
  { title: "5-Minute Quickstart", description: "Launch a live calculator page for your trade business in 5 minutes flat.", icon: Zap },
  { title: "Embed on Any Website", description: "Add your calculator to WordPress, Wix, Webflow, or any custom site.", icon: Globe },
  { title: "AI Employee Setup", description: "Configure your AI chat agent to handle inquiries and estimate requests 24/7.", icon: Bot },
  { title: "Booking + Payments", description: "Accept deposits and bookings directly through your calculator widget.", icon: Calendar },
];

export default function DocsPage() {
  const [activeCategory, setActiveCategory] = useState("getting-started");
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    document.title = "Docs — QuickQuotePro";
  }, []);

  const activeDoc = DOC_CONTENT[activeCategory];

  return (
    <MarketingLayout>
      <div data-testid="docs-page" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* Page Header */}
        <div style={{ background: p.colors.navyBg, padding: "64px 24px 48px" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <h1 style={{ fontSize: 42, fontWeight: 800, color: "#FFFFFF", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
              Documentation
            </h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.7)", margin: "0 0 32px" }}>
              Everything you need to get up and running.
            </p>
            {/* Search Bar */}
            <div style={{ position: "relative" as const, maxWidth: 540 }}>
              <Search
                size={18}
                color="#9CA3AF"
                style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                data-testid="docs-search"
                type="text"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                placeholder="Search docs..."
                style={{
                  width: "100%",
                  padding: "12px 16px 12px 44px",
                  borderRadius: p.radius.sm,
                  border: "1.5px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.08)",
                  color: "#FFFFFF",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box" as const,
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>
        </div>

        {/* Quickstart Cards */}
        <div style={{ background: p.colors.lightBg, padding: "40px 24px", borderBottom: `1px solid ${p.colors.border}` }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: p.colors.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 16px" }}>
              QUICKSTART GUIDES
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 16,
            }}>
              {QUICKSTART_CARDS.map(({ title, description, icon: Icon }) => (
                <div
                  key={title}
                  style={{
                    background: p.colors.surface,
                    borderRadius: p.radius.md,
                    padding: "20px",
                    boxShadow: p.shadows.card,
                    border: `1px solid ${p.colors.border}`,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column" as const,
                    gap: 10,
                  }}
                >
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: p.radius.sm,
                    background: "rgba(45,106,79,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <Icon size={18} color={p.colors.accent} />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: p.colors.heading, marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 13, color: p.colors.muted, lineHeight: 1.55 }}>{description}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, color: p.colors.accent, fontSize: 13, fontWeight: 600 }}>
                    Read More <ArrowRight size={12} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Two-Column Layout: Sidebar + Content */}
        <div style={{ background: p.colors.surface }}>
          <div style={{
            maxWidth: 1120,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "240px 1fr",
            minHeight: 500,
          }}>
            {/* Sidebar */}
            <div
              data-testid="docs-sidebar"
              style={{
                borderRight: `1px solid ${p.colors.border}`,
                padding: "32px 0",
                position: "sticky" as const,
                top: 60,
                height: "calc(100vh - 60px)",
                overflowY: "auto",
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 700, color: p.colors.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 12px 20px" }}>
                CATEGORIES
              </p>
              {DOC_CATEGORIES.map(({ label, icon: Icon, id }) => (
                <button
                  key={id}
                  onClick={() => setActiveCategory(id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "9px 20px",
                    background: activeCategory === id ? "rgba(45,106,79,0.08)" : "transparent",
                    border: "none",
                    borderLeft: `3px solid ${activeCategory === id ? p.colors.accent : "transparent"}`,
                    cursor: "pointer",
                    textAlign: "left" as const,
                    transition: "all 0.15s ease",
                  }}
                >
                  <Icon size={15} color={activeCategory === id ? p.colors.accent : p.colors.muted} />
                  <span style={{
                    fontSize: 14,
                    fontWeight: activeCategory === id ? 600 : 400,
                    color: activeCategory === id ? p.colors.accent : p.colors.body,
                  }}>
                    {label}
                  </span>
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div data-testid="docs-content" style={{ padding: "40px 40px 60px" }}>
              {activeDoc && (
                <>
                  <h2 style={{ fontSize: 28, fontWeight: 800, color: p.colors.heading, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
                    {activeDoc.title}
                  </h2>
                  <p style={{ fontSize: 16, color: p.colors.muted, lineHeight: 1.65, margin: "0 0 36px" }}>
                    {activeDoc.description}
                  </p>

                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                    {activeDoc.articles.map(({ title, status }, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: p.colors.lightBg,
                          borderRadius: p.radius.sm,
                          padding: "18px 20px",
                          border: `1px solid ${p.colors.border}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <BookOpen size={15} color={p.colors.muted} />
                          <span style={{ fontSize: 15, fontWeight: 500, color: p.colors.body }}>{title}</span>
                        </div>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 13,
                          fontWeight: 600,
                          color: status === "Coming Soon" ? p.colors.muted : p.colors.accent,
                          flexShrink: 0,
                        }}>
                          {status === "Coming Soon" ? (
                            <span style={{
                              padding: "2px 8px",
                              borderRadius: p.radius.pill,
                              background: "#F3F4F6",
                              color: p.colors.muted,
                              fontSize: 11,
                              fontWeight: 600,
                            }}>
                              Coming Soon
                            </span>
                          ) : (
                            <>
                              Read More <ChevronRight size={13} />
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {activeCategory === "api-reference" && (
                    <div style={{
                      marginTop: 32,
                      padding: "24px",
                      borderRadius: p.radius.md,
                      background: p.colors.navyBg,
                      color: "#FFFFFF",
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#6EE7B7", marginBottom: 10 }}>API REFERENCE</div>
                      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, margin: "0 0 16px" }}>
                        The QuickQuotePro API is currently in private beta. Contact us to get early access.
                      </p>
                      <a
                        href="/contact"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 16px",
                          borderRadius: p.radius.sm,
                          background: p.colors.accent,
                          color: "#FFFFFF",
                          fontSize: 13,
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        Request API Access <ArrowRight size={12} />
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div style={{ background: p.colors.lightBg, padding: "60px 24px", borderTop: `1px solid ${p.colors.border}`, textAlign: "center" }}>
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <h3 style={{ fontSize: 24, fontWeight: 800, color: p.colors.heading, margin: "0 0 10px" }}>
              Can't find what you're looking for?
            </h3>
            <p style={{ fontSize: 16, color: p.colors.muted, margin: "0 0 24px" }}>
              Our support team is here to help. Usually responds within 2 hours.
            </p>
            <a
              href="/contact"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                borderRadius: p.radius.sm,
                background: p.colors.accent,
                color: "#FFFFFF",
                fontSize: 15,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
