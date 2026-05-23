import { useEffect } from "react";
import { Link } from "wouter";
import { Check, ArrowRight } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { IconBadge } from "@/components/IconBadge";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { mkt, shadows } from "@/theme/tokens";
import type { ProductConfig } from "@/site/siteMap";

export default function ProductPageTemplate({ product }: { product: ProductConfig }) {
  useScrollReveal();

  useEffect(() => {
    document.title = `${product.name} — WeFixTrades`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", product.tagline);
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = product.tagline;
      document.head.appendChild(meta);
    }
  }, [product]);

  return (
    <MarketingLayout>
      <div data-testid={`product-page-${product.slug}`}>

        <section
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "100px 28px 80px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
          data-testid="product-hero"
        >
          <div
            style={{
              position: "absolute",
              top: -80,
              right: -80,
              width: 420,
              height: 420,
              borderRadius: "50%",
              background: mkt.accentGlow,
              pointerEvents: "none",
            }}
          />

          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
              <IconBadge name={product.icon} size={24} />
            </div>

            <h1
              data-testid="product-name"
              style={{
                fontSize: "clamp(34px, 4.5vw, 56px)",
                fontWeight: 700,
                color: mkt.onDark,
                lineHeight: 1.08,
                letterSpacing: "-0.035em",
                marginBottom: 20,
              }}
            >
              {product.name}
            </h1>

            <p
              data-testid="product-tagline"
              style={{
                fontSize: "clamp(16px, 1.8vw, 19px)",
                color: mkt.onDarkFaint,
                lineHeight: 1.65,
                maxWidth: 540,
                margin: "0 auto 36px",
              }}
            >
              {product.tagline}
            </p>

            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href={product.primaryCtaHref}
                data-testid="product-cta-primary"
                className="mkt-btn-primary"
                style={{
                  padding: "13px 30px",
                  borderRadius: 9999,
                  background: mkt.accent,
                  color: mkt.onDark,
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                {product.primaryCtaLabel}
              </Link>
              <Link
                href={product.secondaryCtaHref}
                data-testid="product-cta-secondary"
                className="mkt-btn-ghost"
                style={{
                  padding: "13px 24px",
                  borderRadius: 9999,
                  background: "transparent",
                  color: mkt.onDark,
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1.5px solid ${mkt.onDarkBorder}`,
                }}
              >
                {product.secondaryCtaLabel}
              </Link>
            </div>
          </div>
        </section>

        <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="product-bullets">
          <div style={{ maxWidth: 800, margin: "0 auto" }} data-reveal="fade-up">
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <h2
                style={{
                  fontSize: "clamp(24px, 3vw, 36px)",
                  fontWeight: 700,
                  color: mkt.text,
                  letterSpacing: "-0.025em",
                  marginBottom: 12,
                }}
              >
                What you get
              </h2>
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 16,
              }}
            >
              {product.bullets.map((b) => (
                <li
                  key={b}
                  data-testid={`bullet-item`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    fontSize: 15,
                    color: mkt.textMuted,
                    lineHeight: 1.5,
                    padding: "12px 16px",
                    background: mkt.surface,
                    borderRadius: 12,
                    border: `1px solid ${mkt.border}`,
                  }}
                >
                  <Check size={20} color={mkt.accent} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {product.pricing && product.pricing.length > 0 && (
          <section
            style={{
              background: `linear-gradient(180deg, ${mkt.darkHover} 0%, ${mkt.dark} 100%)`,
              padding: "80px 28px",
            }}
            data-testid="product-pricing"
          >
            <div style={{ maxWidth: 1080, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
                <h2
                  style={{
                    fontSize: "clamp(24px, 3vw, 36px)",
                    fontWeight: 700,
                    color: mkt.onDark,
                    letterSpacing: "-0.025em",
                    marginBottom: 12,
                  }}
                >
                  Simple, transparent pricing
                </h2>
              </div>
              <div
                className="pricing-cards-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`,
                  gap: 20,
                }}
                data-reveal="fade-up"
              >
                {product.pricing.map((plan, idx) => (
                  <div
                    key={plan.name}
                    data-testid={`pricing-card-${plan.name.toLowerCase().replace(/\s+/g, "-")}`}
                    style={{
                      background: idx === 0 && product.pricing!.length > 1
                        ? mkt.accentGlow
                        : mkt.onDarkBorder,
                      border: idx === 0 && product.pricing!.length > 1
                        ? `2px solid ${mkt.accent}`
                        : `1px solid ${mkt.onDarkBorder}`,
                      borderRadius: 16,
                      padding: "32px 24px",
                      display: "flex",
                      flexDirection: "column" as const,
                    }}
                  >
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: mkt.onDark, marginBottom: 8 }}>
                      {plan.name}
                    </h3>
                    <div style={{ marginBottom: 20 }}>
                      <span style={{ fontSize: 36, fontWeight: 700, color: mkt.onDark }}>
                        ${plan.priceUsd}
                      </span>
                      <span style={{ fontSize: 14, color: mkt.onDarkFaint }}>
                        {plan.cadence}
                      </span>
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1 }}>
                      {plan.includes.map((f) => (
                        <li
                          key={f}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            fontSize: 14,
                            color: mkt.onDarkMuted,
                            lineHeight: 1.5,
                            marginBottom: 10,
                          }}
                        >
                          <Check size={16} color={mkt.accent} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={product.primaryCtaHref}
                      data-testid={`pricing-cta-${plan.name.toLowerCase().replace(/\s+/g, "-")}`}
                      style={{
                        display: "block",
                        textAlign: "center" as const,
                        marginTop: 20,
                        padding: "12px 20px",
                        borderRadius: 9999,
                        background: idx === 0 && product.pricing!.length > 1 ? mkt.accent : mkt.onDarkBorder,
                        color: mkt.onDark,
                        fontSize: 14,
                        fontWeight: 700,
                        textDecoration: "none",
                        border: idx === 0 && product.pricing!.length > 1 ? "none" : `1px solid ${mkt.onDarkBorder}`,
                      }}
                    >
                      Get Started
                    </Link>
                  </div>
                ))}
              </div>
              <style>{`@media (max-width: 700px) { .pricing-cards-grid { grid-template-columns: 1fr !important; } }`}</style>
            </div>
          </section>
        )}

        <section
          style={{
            background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
            padding: "80px 28px",
            textAlign: "center",
          }}
          data-testid="product-bottom-cta"
        >
          <div style={{ maxWidth: 600, margin: "0 auto" }} data-reveal="scale">
            <h2
              style={{
                fontSize: "clamp(26px, 3.5vw, 42px)",
                fontWeight: 700,
                color: mkt.onDark,
                letterSpacing: "-0.025em",
                marginBottom: 16,
                lineHeight: 1.1,
              }}
            >
              Ready to get started with {product.name}?
            </h2>
            <p
              style={{
                fontSize: 16,
                color: mkt.onDarkMuted,
                lineHeight: 1.65,
                marginBottom: 36,
                maxWidth: 460,
                margin: "0 auto 36px",
              }}
            >
              {product.tagline}
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href={product.primaryCtaHref}
                data-testid="product-bottom-cta-primary"
                className="mkt-btn-primary"
                style={{
                  display: "inline-block",
                  padding: "15px 36px",
                  borderRadius: 9999,
                  background: mkt.onDark,
                  color: mkt.accent,
                  fontSize: 16,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                {product.primaryCtaLabel}
              </Link>
              <Link
                href={product.secondaryCtaHref}
                data-testid="product-bottom-cta-secondary"
                className="mkt-btn-ghost"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "15px 28px",
                  borderRadius: 9999,
                  background: "transparent",
                  color: mkt.onDark,
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  border: `1.5px solid ${mkt.onDarkBorder}`,
                }}
              >
                {product.secondaryCtaLabel} <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

      </div>
    </MarketingLayout>
  );
}
