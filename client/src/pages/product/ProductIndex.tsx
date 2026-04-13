import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Phone, MessageSquare, Clock, Star, Globe, Shield, Share2 } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { mkt, colors, shadows } from "@/theme/tokens";

const PRIMARY_PRODUCTS = [
  {
    slug: "quickquote",
    name: "QuoteQuick Pro",
    tagline: "Instant quotes + booking on your website",
    outcomes: [
      "Visitors get real estimates in seconds — no phone tag",
      "Built-in booking & deposits turn quotes into jobs",
      "Lead capture runs 24/7 on autopilot",
    ],
    cta: "See details & pricing",
    href: "/products/quickquote",
    icon: Clock,
  },
  {
    slug: "assistants",
    name: "24/7 Assistants",
    tagline: "Call + chat answering, follow-ups & review requests",
    outcomes: [
      "Every call and chat answered — even at 2 AM",
      "Automatic follow-ups keep leads warm",
      "Review requests sent after every completed job",
    ],
    cta: "See details & pricing",
    href: "/products/assistants",
    icon: Phone,
  },
];

const ADDONS = [
  {
    slug: "visibility",
    name: "Visibility Bundle",
    desc: "Maps, website SEO, and local ranking — handled for you.",
    href: "/solutions/visibility",
    icon: Globe,
  },
  {
    slug: "reputationshield",
    name: "ReputationShield",
    desc: "Automated review requests, monitoring, and alerts.",
    href: "/products/reputationshield",
    icon: Shield,
  },
  {
    slug: "socialsync",
    name: "SocialSync",
    desc: "Consistent posting and lead-gen on Facebook & Instagram.",
    href: "/products/socialsync",
    icon: Share2,
  },
];

export default function ProductIndex() {
  useScrollReveal();

  useEffect(() => {
    document.title = "Products & Services — WeFixTrades | Tools for Trades Businesses";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", "Explore WeFixTrades products: instant quote calculators, 24/7 answering assistants, booking, follow-ups, visibility, and reputation management.");
    }
  }, []);

  return (
    <MarketingLayout>
      <div data-testid="product-index-page">

        <section
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "80px 28px 72px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: -80, right: -80, width: 420, height: 420, borderRadius: "50%", background: mkt.accentGlow, pointerEvents: "none" }} />

          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
            <h1
              data-testid="product-index-headline"
              style={{
                fontSize: "clamp(32px, 4vw, 52px)",
                fontWeight: 700, color: mkt.onDark,
                lineHeight: 1.1, letterSpacing: "-0.035em",
                marginBottom: 20,
              }}
            >
              Pick what you need
            </h1>
            <p style={{ fontSize: "clamp(16px, 1.8vw, 19px)", color: mkt.onDarkFaint, lineHeight: 1.65, maxWidth: 540, margin: "0 auto" }}>
              Two core products. Optional add-ons. No contracts.
            </p>
          </div>
        </section>

        <section style={{ background: mkt.bg, padding: "48px 28px 72px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>

            <div
              className="primary-products-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24, marginBottom: 56 }}
            >
              {PRIMARY_PRODUCTS.map((product, idx) => {
                const Icon = product.icon;
                return (
                  <Link
                    key={product.slug}
                    href={product.href}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      data-testid={`product-primary-card-${product.slug}`}
                      data-reveal="fade-up"
                      data-delay={String((idx + 1) * 100)}
                      className="mkt-feature-card"
                      style={{
                        background: mkt.bg,
                        border: `1.5px solid ${mkt.border}`,
                        borderRadius: 18,
                        padding: "32px 28px",
                        cursor: "pointer",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: mkt.accentTint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon size={22} color={mkt.accent} strokeWidth={2} />
                        </div>
                        <div>
                          <h2 style={{ fontSize: 22, fontWeight: 700, color: mkt.text, letterSpacing: "-0.01em", margin: 0 }}>
                            {product.name}
                          </h2>
                        </div>
                      </div>

                      <p style={{ fontSize: 15, color: mkt.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
                        {product.tagline}
                      </p>

                      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                        {product.outcomes.map((outcome) => (
                          <li key={outcome} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: mkt.textMuted, lineHeight: 1.45 }}>
                            <Check size={15} color={mkt.accent} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
                            <span>{outcome}</span>
                          </li>
                        ))}
                      </ul>

                      <div style={{ borderTop: `1px solid ${mkt.border}`, paddingTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span data-testid={`link-product-${product.slug}`} style={{ fontSize: 15, fontWeight: 700, color: mkt.accent, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          {product.cta} <ArrowRight size={15} />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div style={{ marginBottom: 28 }}>
              <h3
                data-testid="addons-heading"
                style={{ fontSize: 18, fontWeight: 700, color: mkt.text, letterSpacing: "-0.01em", marginBottom: 4 }}
              >
                Optional add-ons
              </h3>
              <p style={{ fontSize: 14, color: mkt.textMuted, margin: 0 }}>
                Layer on visibility and reputation services when you're ready.
              </p>
            </div>

            <div
              className="addons-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}
            >
              {ADDONS.map((addon, idx) => {
                const Icon = addon.icon;
                return (
                  <Link
                    key={addon.slug}
                    href={addon.href}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      data-testid={`product-addon-card-${addon.slug}`}
                      data-reveal="fade-up"
                      data-delay={String(Math.min((idx + 1) * 80, 300))}
                      className="mkt-feature-card"
                      style={{
                        background: mkt.surface,
                        border: `1px solid ${mkt.border}`,
                        borderRadius: 14,
                        padding: "22px 20px",
                        cursor: "pointer",
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <Icon size={18} color={mkt.accent} strokeWidth={2} />
                        <h4 style={{ fontSize: 16, fontWeight: 700, color: mkt.text, margin: 0 }}>
                          {addon.name}
                        </h4>
                      </div>

                      <p style={{ fontSize: 13, color: mkt.textMuted, lineHeight: 1.5, marginBottom: 14, flex: 1 }}>
                        {addon.desc}
                      </p>

                      <span data-testid={`link-addon-${addon.slug}`} style={{ fontSize: 13, fontWeight: 700, color: mkt.accent, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        Learn more <ArrowRight size={13} />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            <style>{`
              @media (max-width: 700px) {
                .primary-products-grid { grid-template-columns: 1fr !important; }
                .addons-grid { grid-template-columns: 1fr !important; }
              }
            `}</style>
          </div>
        </section>

      </div>
    </MarketingLayout>
  );
}
