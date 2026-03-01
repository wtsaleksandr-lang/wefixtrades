import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Check, ChevronDown, ArrowRight } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { getProductBySlug, PRODUCT_PAGES, type ProductPage as ProductConfig } from "@/config/products";
import NotFound from "@/pages/not-found";
import { mkt, colors, shadows } from "@/theme/tokens";

function FAQAccordion({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${mkt.border}`, borderRadius: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid={`faq-toggle`}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 22px", background: open ? mkt.surface : mkt.bg, border: "none", cursor: "pointer", gap: 16, textAlign: "left" as const,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: mkt.text, lineHeight: 1.4 }}>{q}</span>
        <ChevronDown size={17} color={mkt.textMuted} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.22s ease" }} />
      </button>
      {open && (
        <div style={{ padding: "0 22px 18px", background: mkt.surface }}>
          <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.7, margin: 0 }}>{a}</p>
        </div>
      )}
    </div>
  );
}

export default function ProductPageRoute() {
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
      let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = `https://quickquotepro.com/product/${product.slug}`;
    }
  }, [product]);

  if (!product) return <NotFound />;

  const relatedProducts = product.related
    .map((slug) => PRODUCT_PAGES.find((p) => p.slug === slug))
    .filter(Boolean) as ProductConfig[];

  return (
    <MarketingLayout>
      <div data-testid={`product-page-${product.slug}`}>

        <section
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "80px 28px 72px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
          data-testid="product-hero"
        >
          <div style={{ position: "absolute", top: -80, right: -80, width: 420, height: 420, borderRadius: "50%", background: mkt.accentGlow, pointerEvents: "none" }} />

          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: mkt.accentGlow, border: `1px solid ${mkt.accent}`,
              borderRadius: 20, padding: "5px 16px", marginBottom: 24,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: mkt.onDark, letterSpacing: "0.04em" }}>
                {product.shortTagline}
              </span>
            </div>

            <h1
              data-testid="product-name"
              style={{
                fontSize: "clamp(34px, 4.5vw, 56px)",
                fontWeight: 700, color: mkt.onDark,
                lineHeight: 1.08, letterSpacing: "-0.035em",
                marginBottom: 20,
              }}
            >
              {product.name}
            </h1>

            <p style={{ fontSize: "clamp(16px, 1.8vw, 19px)", color: mkt.onDarkFaint, lineHeight: 1.65, maxWidth: 540, margin: "0 auto 36px" }}>
              {product.seoDescription}
            </p>

            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}>
              <Link
                href={product.primaryCTA.href}
                data-testid="product-cta-primary"
                className="mkt-btn-primary"
                style={{ padding: "13px 30px", borderRadius: 9999, background: mkt.accent, color: mkt.onDark, fontSize: 15, fontWeight: 700, textDecoration: "none", display: "inline-block" }}
              >
                {product.primaryCTA.label}
              </Link>
              {product.secondaryCTA && (
                <Link
                  href={product.secondaryCTA.href}
                  data-testid="product-cta-secondary"
                  className="mkt-btn-ghost"
                  style={{ padding: "13px 24px", borderRadius: 9999, background: "transparent", color: mkt.onDark, fontSize: 15, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, border: `1.5px solid ${mkt.onDarkBorder}` }}
                >
                  {product.secondaryCTA.label}
                </Link>
              )}
            </div>

            <p style={{ fontSize: 13, color: mkt.onDarkFaint, margin: 0 }}>
              Built for trades. Fast to launch.
            </p>
          </div>
        </section>

        <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="product-highlights">
          <div style={{ maxWidth: 800, margin: "0 auto" }} data-reveal="fade-up">
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 12 }}>
                What you get
              </h2>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              {product.highlights.map((h) => (
                <li key={h} style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 15, color: mkt.textMuted, lineHeight: 1.5, padding: "12px 16px", background: mkt.surface, borderRadius: 12, border: `1px solid ${mkt.border}` }}>
                  <Check size={18} color={mkt.accent} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="product-outcomes">
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em" }}>
                What it does for your business
              </h2>
            </div>
            <div className="outcomes-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
              {product.outcomes.map((o, i) => (
                <div
                  key={o.title}
                  data-reveal="fade-up"
                  data-delay={String((i + 1) * 100)}
                  className="mkt-feature-card"
                  style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 18, padding: "28px 24px", boxShadow: shadows.card }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: mkt.accentTint, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, fontSize: 20, fontWeight: 700, color: mkt.accent }}>
                    {i + 1}
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: mkt.text, marginBottom: 10, lineHeight: 1.3 }}>{o.title}</h3>
                  <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.65, margin: 0 }}>{o.desc}</p>
                </div>
              ))}
            </div>
            <style>{`@media (max-width: 760px) { .outcomes-grid { grid-template-columns: 1fr !important; } }`}</style>
          </div>
        </section>

        <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="product-how-it-works">
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                How It Works
              </div>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em" }}>
                Three simple steps
              </h2>
            </div>
            <div className="steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, position: "relative" }}>
              <div style={{ position: "absolute", top: 28, left: "17%", right: "17%", height: 2, background: mkt.border, zIndex: 0 }} />
              {product.howItWorks.map((step, i) => (
                <div key={step.title} data-reveal="fade-up" data-delay={String((i + 1) * 150)} style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%", background: mkt.accent, color: mkt.onDark,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 22, fontWeight: 700, margin: "0 auto 20px",
                    boxShadow: shadows.lg,
                  }}>
                    {i + 1}
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: mkt.text, marginBottom: 10 }}>{step.title}</h3>
                  <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.6, margin: 0, maxWidth: 260, marginLeft: "auto", marginRight: "auto" }}>{step.desc}</p>
                </div>
              ))}
            </div>
            <style>{`@media (max-width: 700px) { .steps-grid { grid-template-columns: 1fr !important; } .steps-grid > div:first-child ~ div::before { display: none; } }`}</style>
          </div>
        </section>

        <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="product-visuals">
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em" }}>
                See it in action
              </h2>
            </div>
            <div className="visuals-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
              {product.visuals.map((v, i) => (
                <div
                  key={v.title}
                  data-reveal="fade-up"
                  data-delay={String((i + 1) * 100)}
                  style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 16, overflow: "hidden" }}
                >
                  <div style={{
                    height: 180,
                    background: `linear-gradient(135deg, ${mkt.surface} 0%, ${mkt.borderLight} 50%, ${mkt.surface} 100%)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: mkt.textMuted, fontSize: 13, fontWeight: 500,
                  }}>
                    Screenshot coming soon
                  </div>
                  <div style={{ padding: "20px 22px" }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: mkt.text, marginBottom: 8 }}>{v.title}</h3>
                    <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.6, margin: 0 }}>{v.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="product-best-for">
          <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
            <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 28 }}>
              Best for
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {product.bestFor.map((b) => (
                <span
                  key={b}
                  style={{
                    padding: "8px 20px", borderRadius: 9999,
                    background: mkt.accentTint, color: mkt.accent,
                    fontSize: 14, fontWeight: 600,
                    border: `1px solid ${mkt.border}`,
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        </section>

        {product.faq.length > 0 && (
          <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="product-faq">
            <div style={{ maxWidth: 780, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 40 }} data-reveal="fade-up">
                <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 12 }}>
                  Frequently asked questions
                </h2>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-reveal="fade-up">
                {product.faq.map((f) => (
                  <FAQAccordion key={f.q} {...f} />
                ))}
              </div>
            </div>
          </section>
        )}

        {product.pricingSection && (
          <section
            style={{
              background: `linear-gradient(180deg, ${mkt.darkHover} 0%, ${mkt.dark} 100%)`,
              padding: "80px 28px",
            }}
            data-testid="product-pricing"
          >
            <div style={{ maxWidth: 1080, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
                <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em", marginBottom: 12 }}>
                  Simple, transparent pricing
                </h2>
              </div>
              <div
                className="pricing-plans-grid"
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}
                data-reveal="fade-up"
              >
                {product.pricingSection.plans.map((plan) => (
                  <div
                    key={plan.name}
                    data-testid={`pricing-plan-${plan.name.toLowerCase()}`}
                    style={{
                      background: plan.highlighted ? mkt.accentGlow : mkt.onDarkBorder,
                      border: plan.highlighted ? `2px solid ${mkt.accent}` : `1px solid ${mkt.onDarkBorder}`,
                      borderRadius: 16,
                      padding: "32px 24px",
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {plan.badge && (
                      <div style={{
                        position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                        background: mkt.accent, color: mkt.onDark, fontSize: 11, fontWeight: 700,
                        padding: "4px 14px", borderRadius: 9999, letterSpacing: "0.04em", whiteSpace: "nowrap",
                      }}>
                        {plan.badge}
                      </div>
                    )}
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: mkt.onDark, marginBottom: 8 }}>{plan.name}</h3>
                    <div style={{ marginBottom: 20 }}>
                      <span style={{ fontSize: 36, fontWeight: 700, color: mkt.onDark }}>{plan.price}</span>
                      <span style={{ fontSize: 14, color: mkt.onDarkFaint }}>{plan.period}</span>
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1 }}>
                      {plan.features.map((f) => (
                        <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.5, marginBottom: 10 }}>
                          <Check size={15} color={mkt.accent} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/Wizard"
                      data-testid={`pricing-cta-${plan.name.toLowerCase()}`}
                      style={{
                        display: "block", textAlign: "center",
                        marginTop: 20, padding: "12px 20px", borderRadius: 9999,
                        background: plan.highlighted ? mkt.accent : mkt.onDarkBorder,
                        color: mkt.onDark, fontSize: 14, fontWeight: 700,
                        textDecoration: "none",
                        border: plan.highlighted ? "none" : `1px solid ${mkt.onDarkBorder}`,
                      }}
                    >
                      Get Started
                    </Link>
                  </div>
                ))}
              </div>
              {product.pricingSection.note && (
                <p style={{ textAlign: "center", fontSize: 13, color: mkt.onDarkFaint, marginTop: 24 }}>
                  {product.pricingSection.note}
                </p>
              )}
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
            <h2 style={{ fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em", marginBottom: 16, lineHeight: 1.1 }}>
              Ready to get started with {product.name}?
            </h2>
            <p style={{ fontSize: 16, color: mkt.onDarkMuted, lineHeight: 1.65, marginBottom: 36, maxWidth: 460, margin: "0 auto 36px" }}>
              {product.shortTagline}. Built for trades. Fast to launch.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href={product.primaryCTA.href}
                data-testid="product-bottom-cta-primary"
                className="mkt-btn-primary"
                style={{ display: "inline-block", padding: "15px 36px", borderRadius: 9999, background: mkt.onDark, color: mkt.accent, fontSize: 16, fontWeight: 700, textDecoration: "none" }}
              >
                {product.primaryCTA.label}
              </Link>
              {product.secondaryCTA && (
                <Link
                  href={product.secondaryCTA.href}
                  data-testid="product-bottom-cta-secondary"
                  className="mkt-btn-ghost"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 28px", borderRadius: 9999, background: "transparent", color: mkt.onDark, fontSize: 15, fontWeight: 600, textDecoration: "none", border: `1.5px solid ${mkt.onDarkBorder}` }}
                >
                  {product.secondaryCTA.label}
                </Link>
              )}
            </div>
          </div>
        </section>

        {relatedProducts.length > 0 && (
          <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="product-related">
            <div style={{ maxWidth: 1080, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 40 }} data-reveal="fade-up">
                <h2 style={{ fontSize: "clamp(22px, 2.5vw, 32px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em" }}>
                  Related products
                </h2>
              </div>
              <div className="related-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
                {relatedProducts.map((rp) => (
                  <Link
                    key={rp.slug}
                    href={`/product/${rp.slug}`}
                    data-testid={`related-${rp.slug}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      className="mkt-feature-card"
                      style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 16, padding: "24px 22px", cursor: "pointer", transition: "border-color 0.3s ease" }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                        {rp.shortTagline}
                      </div>
                      <h3 style={{ fontSize: 18, fontWeight: 700, color: mkt.text, marginBottom: 8 }}>{rp.name}</h3>
                      <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.5, marginBottom: 14 }}>{rp.highlights[0]}</p>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: mkt.accent }}>
                        Learn more <ArrowRight size={13} />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

      </div>
    </MarketingLayout>
  );
}
