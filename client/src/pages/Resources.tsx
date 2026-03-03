import { useEffect } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, shadows } from "@/theme/tokens";
import { BookOpen, FileText, Video, Headphones, ArrowRight } from "lucide-react";

const RESOURCE_CATEGORIES = [
  {
    title: "Documentation",
    description: "Step-by-step setup guides, API references, and integration walkthroughs for every product.",
    icon: FileText,
    href: "/docs",
    cta: "Browse Docs",
  },
  {
    title: "Video Tutorials",
    description: "Short, focused videos showing you how to configure calculators, embed widgets, and optimize workflows.",
    icon: Video,
    href: "/docs",
    cta: "Watch Now",
  },
  {
    title: "Knowledge Base",
    description: "Answers to common questions about billing, integrations, customization, and best practices.",
    icon: BookOpen,
    href: "/docs/troubleshooting",
    cta: "Search Articles",
  },
  {
    title: "Webinars & Events",
    description: "Live sessions and recordings covering digital marketing strategy for trades businesses.",
    icon: Headphones,
    href: "/contact",
    cta: "Register",
  },
];

export default function ResourcesPage() {
  useEffect(() => {
    document.title = "Resources — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <div
        data-testid="section-resources-hero"
        style={{
          background: `linear-gradient(135deg, ${mkt.dark}, ${mkt.darkHover})`,
          padding: "100px 24px 60px",
          textAlign: "center",
        }}
      >
        <h1
          data-testid="text-resources-title"
          style={{
            fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 700,
            color: mkt.onDark,
            margin: "0 0 16px",
            letterSpacing: "-0.025em",
          }}
        >
          Resources
        </h1>
        <p
          data-testid="text-resources-subtitle"
          style={{ fontSize: 18, color: mkt.onDarkMuted, margin: 0, maxWidth: 560, marginInline: "auto" }}
        >
          Guides, tutorials, and tools to help you get the most out of WeFixTrades.
        </p>
      </div>

      <section
        data-testid="section-resources-grid"
        style={{ background: mkt.surface, padding: "60px 24px" }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 24,
          }}
        >
          {RESOURCE_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.title}
                data-testid={`card-resource-${cat.title.toLowerCase().replace(/\s+/g, "-")}`}
                style={{
                  background: mkt.bg,
                  borderRadius: 16,
                  padding: "32px 28px",
                  boxShadow: shadows.card,
                  border: `1px solid ${mkt.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: mkt.accentTint,
                    color: mkt.accent,
                  }}
                >
                  <Icon size={24} strokeWidth={1.8} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 650, color: mkt.text, margin: 0 }}>{cat.title}</h3>
                <p style={{ fontSize: 14, color: mkt.textMuted, margin: 0, lineHeight: 1.55, flex: 1 }}>
                  {cat.description}
                </p>
                <Link
                  href={cat.href}
                  data-testid={`link-resource-${cat.title.toLowerCase().replace(/\s+/g, "-")}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 14,
                    fontWeight: 600,
                    color: mkt.accent,
                    textDecoration: "none",
                  }}
                >
                  {cat.cta} <ArrowRight size={14} />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section
        data-testid="section-resources-cta"
        style={{ padding: "60px 24px", textAlign: "center" }}
      >
        <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: mkt.text, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          Can't find what you need?
        </h2>
        <p style={{ fontSize: 16, color: mkt.textMuted, margin: "0 0 28px", maxWidth: 480, marginInline: "auto" }}>
          Our team is here to help. Reach out and we'll get you sorted.
        </p>
        <Link
          href="/contact"
          data-testid="link-resources-contact"
          style={{
            display: "inline-block",
            padding: "12px 28px",
            borderRadius: 14,
            background: mkt.dark,
            color: mkt.onDark,
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Contact Support
        </Link>
      </section>
    </MarketingLayout>
  );
}
