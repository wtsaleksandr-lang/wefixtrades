import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Check, ChevronDown, ArrowRight } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import ProductHeroShell from "@/components/marketing/ProductHeroShell";
import ProductCategoryChip from "@/components/marketing/ProductCategoryChip";
import ProductVisualPreview from "@/components/marketing/ProductVisualPreview";
import CapabilitiesGrid from "@/components/marketing/CapabilitiesGrid";
import StepTimeline from "@/components/marketing/StepTimeline";
import ReviewsSection from "@/components/home/ReviewsSection";
import CTASection from "@/components/marketing/CTASection";
import { SurfaceSection } from "@/components/marketing/SurfaceSection";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { getProductBySlug, PRODUCT_PAGES, CATEGORY_LABELS, type ProductPage as ProductConfig } from "@/config/products";
import NotFound from "@/pages/not-found";
import { mkt, shadows, typography } from "@/theme/tokens";

/* ---------- FAQ Accordion ---------- */
function FAQAccordion({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: `1px solid ${mkt.border}`,
        borderRadius: 14,
        overflow: "hidden",
        transition: "border-color 0.2s ease",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid="faq-toggle"
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "18px 22px",
          background: open ? mkt.surface : mkt.bg,
          border: "none",
          cursor: "pointer",
          gap: 16,
          textAlign: "left",
          transition: "background 0.2s ease",
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: mkt.text,
            lineHeight: 1.4,
          }}
        >
          {q}
        </span>
        <ChevronDown
          size={17}
          color={mkt.textMuted}
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.22s ease",
          }}
        />
      </button>
      <div
        style={{
          maxHeight: open ? 400 : 0,
          overflow: "hidden",
          transition: "max-height 0.35s ease",
        }}
      >
        <div style={{ padding: "0 22px 18px", background: mkt.surface }}>
          <p
            style={{
              fontSize: 15,
              color: mkt.textMuted,
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Pricing Section ---------- */
function PricingSection({ product }: { product: ProductConfig }) {
  const { pricingSection } = product;

  return (
    <section
      style={{
        background: `linear-gradient(180deg, ${mkt.darkHover} 0%, ${mkt.dark} 100%)`,
        padding: "80px 28px",
      }}
      data-testid="product-pricing"
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div
          style={{ textAlign: "center", marginBottom: 48 }}
          data-reveal="fade-up"
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: mkt.accent,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Pricing
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              fontWeight: 700,
              color: mkt.onDark,
              letterSpacing: "-0.025em",
              marginBottom: 8,
            }}
          >
            Simple, transparent pricing
          </h2>
          <p
            style={{
              fontSize: 15,
              color: mkt.onDarkFaint,
              maxWidth: 420,
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            No hidden fees. No custom quotes. Pick a plan and get started today.
          </p>
        </div>

        <style>{`
          .pricing-grid-new {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 20px;
          }
          .pricing-card-new {
            transition: transform 0.25s ease, box-shadow 0.25s ease;
          }
          .pricing-card-new:hover {
            transform: translateY(-4px);
            box-shadow: 0 20px 50px rgba(0,0,0,0.2);
          }
          @media (max-width: 700px) {
            .pricing-grid-new { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div className="pricing-grid-new" data-reveal="fade-up">
          {pricingSection.plans.map((plan) => (
            <div
              key={plan.name}
              className="pricing-card-new"
              data-testid={`pricing-plan-${plan.name.toLowerCase().replace(/\s+/g, "-")}`}
              style={{
                background: plan.highlighted
                  ? mkt.accentGlow
                  : "rgba(255,255,255,0.04)",
                border: plan.highlighted
                  ? `2px solid ${mkt.accent}`
                  : `1px solid ${mkt.onDarkBorder}`,
                borderRadius: 18,
                padding: "32px 24px",
                position: "relative",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {plan.badge && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: mkt.accent,
                    color: mkt.buttonText,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 14px",
                    borderRadius: 9999,
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {plan.badge}
                </div>
              )}

              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: mkt.onDark,
                  marginBottom: 8,
                }}
              >
                {plan.name}
              </h3>

              <div style={{ marginBottom: 20 }}>
                <span
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: mkt.onDark,
                  }}
                >
                  {plan.price}
                </span>
                <span
                  style={{ fontSize: 14, color: mkt.onDarkFaint }}
                >
                  {plan.period}
                </span>
              </div>

              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  flex: 1,
                }}
              >
                {plan.features.map((f) => (
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
                    <Check
                      size={15}
                      color={mkt.accent}
                      strokeWidth={2.5}
                      style={{ flexShrink: 0, marginTop: 3 }}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={product.primaryCTA.href}
                data-testid={`pricing-cta-${plan.name.toLowerCase().replace(/\s+/g, "-")}`}
                style={{
                  display: "block",
                  textAlign: "center",
                  marginTop: 20,
                  padding: "13px 20px",
                  borderRadius: 9999,
                  background: plan.highlighted
                    ? mkt.accent
                    : "rgba(255,255,255,0.08)",
                  color: plan.highlighted
                    ? mkt.buttonText
                    : mkt.onDark,
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: "none",
                  border: plan.highlighted
                    ? "none"
                    : `1px solid ${mkt.onDarkBorder}`,
                  transition: "background 0.2s ease, transform 0.2s ease",
                }}
              >
                {plan.highlighted ? "Get started" : "Choose plan"}
              </Link>
            </div>
          ))}
        </div>

        {pricingSection.note && (
          <p
            style={{
              textAlign: "center",
              fontSize: 13,
              color: mkt.onDarkFaint,
              marginTop: 24,
            }}
          >
            {pricingSection.note}
          </p>
        )}
      </div>
    </section>
  );
}

/* ---------- Main Product Page ---------- */
export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const product = getProductBySlug(params.slug || "");

  useScrollReveal();

  useEffect(() => {
    if (product) {
      document.title = product.seoTitle;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute("content", product.seoDescription);
      } else {
        const meta = document.createElement("meta");
        meta.name = "description";
        meta.content = product.seoDescription;
        document.head.appendChild(meta);
      }
      let canonical = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement | null;
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = `https://wefixtrades.com/products/${product.slug}`;
    }
  }, [product]);

  if (!product) return <NotFound />;

  const relatedProducts = product.related
    .map((slug) => PRODUCT_PAGES.find((p) => p.slug === slug))
    .filter(Boolean) as ProductConfig[];

  return (
    <MarketingLayout>
      <div data-testid={`product-page-${product.slug}`}>

        {/* ── §1 HERO SHELL (merged with visual) ── */}
        <ProductHeroShell
          visual={<ProductVisualPreview variant={product.heroVisualType} />}
        >
          <div style={{ marginBottom: 20 }}>
            <ProductCategoryChip category={product.category} />
          </div>

          <h1
            className="hero-enter"
            data-testid="product-name"
            style={{
              fontSize: "clamp(32px, 4.5vw, 52px)",
              fontWeight: 700,
              color: mkt.text,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              marginBottom: 18,
              fontFamily: typography.fontFamily,
            }}
          >
            {product.name}
          </h1>

          <p
            className="hero-enter"
            data-testid="product-tagline"
            style={{
              fontSize: "clamp(15px, 1.8vw, 18px)",
              color: mkt.textMuted,
              lineHeight: 1.65,
              maxWidth: 540,
              margin: "0 auto 32px",
              fontFamily: typography.fontFamily,
            }}
          >
            {product.seoDescription}
          </p>

          <div
            className="hero-enter"
            style={{
              display: "flex",
              gap: 14,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              href={product.primaryCTA.href}
              data-testid="product-cta-primary"
              className="mkt-btn-primary"
              style={{
                padding: "13px 30px",
                borderRadius: 9999,
                background: mkt.accent,
                color: mkt.buttonText,
                fontSize: 15,
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              {product.primaryCTA.label}
            </Link>
            {product.secondaryCTA && (
              <Link
                href={product.secondaryCTA.href}
                data-testid="product-cta-secondary"
                className="mkt-btn-ghost"
                style={{
                  padding: "13px 24px",
                  borderRadius: 9999,
                  background: "transparent",
                  color: mkt.text,
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1.5px solid ${mkt.border}`,
                }}
              >
                {product.secondaryCTA.label}
              </Link>
            )}
          </div>
        </ProductHeroShell>

        {/* ── §2 CAPABILITIES / BENEFITS ── */}
        <CapabilitiesGrid items={product.highlights} />

        {/* ── §3 HOW IT WORKS ── */}
        <StepTimeline steps={product.howItWorks} />

        {/* ── §4 SOCIAL PROOF ── */}
        <SurfaceSection overlap className="py-4">
          <ReviewsSection />
        </SurfaceSection>

        {/* ── §5 PRICING (MANDATORY) ── */}
        <PricingSection product={product} />

        {/* ── §6 FAQ ── */}
        {product.faq.length > 0 && (
          <section
            style={{ background: mkt.bg, padding: "72px 28px" }}
            data-testid="product-faq"
          >
            <div style={{ maxWidth: 780, margin: "0 auto" }}>
              <div
                style={{ textAlign: "center", marginBottom: 40 }}
                data-reveal="fade-up"
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: mkt.accent,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    marginBottom: 14,
                  }}
                >
                  FAQ
                </div>
                <h2
                  style={{
                    fontSize: "clamp(24px, 3vw, 36px)",
                    fontWeight: 700,
                    color: mkt.text,
                    letterSpacing: "-0.025em",
                    margin: 0,
                  }}
                >
                  Frequently asked questions
                </h2>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
                data-reveal="fade-up"
              >
                {product.faq.map((f) => (
                  <FAQAccordion key={f.q} {...f} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── §7 CTA ── */}
        <CTASection />

      </div>
    </MarketingLayout>
  );
}
