import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Check, Minus, ChevronDown, ArrowRight, Play } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { PRODUCTS, YEARLY_DISCOUNT_PCT, getYearlyPrice, getYearlyMonthlyEquivalent, mergeProductsWithDb, type Product, type DbProductOverride } from "@/config/pricing";
import { fetchFxRate, getFallbackRate, convert, formatMoney } from "@/lib/fx";
import { FAQS } from "@/config/pricingPlans";
import { mkt, colors, shadows } from "@/theme/tokens";

const PRICING_TO_PRODUCT_SLUG: Record<string, string> = {
  "quickquotepro": "quickquotepro",
  "booking": "booking-addon",
  "ai-chat": "ai-chat",
  "ai-voice": "ai-voice",
  "webcare": "webcare",
  "mapguard": "mapguard",
  "socialsync": "socialsync",
  "reputationshield": "reputationshield",
  "sitelaunch": "sitelaunch",
};


const CATEGORY_LABELS: Record<string, string> = {
  core: "Core Tools",
  ai: "AI Employees",
  growth: "Growth Services",
};

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${mkt.onDarkBorder}`, borderRadius: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "18px 22px",
          background: open ? mkt.sectionLight : mkt.bg,
          border: "none",
          cursor: "pointer",
          gap: 16,
          textAlign: "left" as const,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: mkt.onDark, lineHeight: 1.4 }}>{q}</span>
        <ChevronDown size={17} color={mkt.onDarkMuted} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.22s ease" }} />
      </button>
      {open && (
        <div style={{ padding: "0 22px 18px", background: mkt.sectionLight }}>
          <p style={{ fontSize: 15, color: mkt.onDarkMuted, lineHeight: 1.7, margin: 0 }}>{a}</p>
        </div>
      )}
    </div>
  );
}

function PriceDisplay({
  product,
  annual,
  currency,
  fxRate,
}: {
  product: Product;
  annual: boolean;
  currency: "CAD" | "USD";
  fxRate: number;
}) {
  if (product.billingType === "one_time" && product.oneTime !== null) {
    const amount = currency === "USD" ? convert(product.oneTime, fxRate) : product.oneTime;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 6 }}>
          <span data-testid={`price-${product.id}`} style={{ fontSize: 38, fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.02em", lineHeight: 1 }}>
            {formatMoney(amount, currency)}
          </span>
        </div>
        <div style={{ fontSize: 13, color: mkt.onDarkMuted, fontWeight: 500 }}>one-time</div>
      </div>
    );
  }

  if (product.monthly === null) return null;

  const monthlyCAD = product.monthly;

  if (annual) {
    const yearlyCAD = getYearlyPrice(monthlyCAD);
    const yearlyDisplay = currency === "USD" ? convert(yearlyCAD, fxRate) : yearlyCAD;
    const monthlyEquivCAD = getYearlyMonthlyEquivalent(monthlyCAD);
    const monthlyEquivDisplay = currency === "USD" ? convert(monthlyEquivCAD, fxRate) : monthlyEquivCAD;
    return (
      <div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 4 }}>
          <span data-testid={`price-${product.id}`} style={{ fontSize: 38, fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.02em", lineHeight: 1 }}>
            {formatMoney(yearlyDisplay, currency)}
          </span>
          <span style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 4 }}>/yr</span>
        </div>
        <div style={{ fontSize: 13, color: mkt.accent, fontWeight: 600 }}>
          {formatMoney(monthlyEquivDisplay, currency)}/mo — Save {Math.round(YEARLY_DISCOUNT_PCT * 100)}%
        </div>
      </div>
    );
  }

  const monthlyDisplay = currency === "USD" ? convert(monthlyCAD, fxRate) : monthlyCAD;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 6 }}>
        <span data-testid={`price-${product.id}`} style={{ fontSize: 38, fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.02em", lineHeight: 1 }}>
          {formatMoney(monthlyDisplay, currency)}
        </span>
        <span style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 4 }}>/mo</span>
      </div>
    </div>
  );
}

function SetupFee({ product, currency, fxRate }: { product: Product; currency: "CAD" | "USD"; fxRate: number }) {
  if (product.setup === null) return null;
  const amount = currency === "USD" ? convert(product.setup, fxRate) : product.setup;
  return (
    <div data-testid={`setup-fee-${product.id}`} style={{ fontSize: 12, fontWeight: 600, color: mkt.warning, background: "#FEF3C7", padding: "4px 12px", borderRadius: 20, display: "inline-block", marginBottom: 8 }}>
      Setup: {formatMoney(amount, currency)} one-time
    </div>
  );
}

export default function PricingPage() {
  useScrollReveal();
  const [annual, setAnnual] = useState(false);
  const [currency, setCurrency] = useState<"CAD" | "USD">("CAD");
  const [fxRate, setFxRate] = useState(getFallbackRate());
  const [fxLoaded, setFxLoaded] = useState(false);

  // Q28g3: fetch DB overrides for admin-edited copy/tiers/features.
  // Render the hardcoded PRODUCTS immediately; swap in merged data when the
  // fetch resolves. If the endpoint is unreachable, the page silently keeps
  // the hardcoded list — pricing never breaks on a backend hiccup.
  const [dbOverrides, setDbOverrides] = useState<DbProductOverride[] | null>(null);
  useEffect(() => {
    fetch("/api/public/pricing", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d) => setDbOverrides(d.products ?? []))
      .catch(() => { /* fall back silently to hardcoded PRODUCTS */ });
  }, []);
  const products = useMemo(
    () => (dbOverrides ? mergeProductsWithDb(PRODUCTS, dbOverrides) : PRODUCTS),
    [dbOverrides],
  );

  useEffect(() => {
    document.title = "Pricing — WeFixTrades | Services & Tools For Every Trades Business";
  }, []);

  useEffect(() => {
    fetchFxRate().then((rate) => {
      setFxRate(rate);
      setFxLoaded(true);
    });
  }, []);

  const categories = ["core", "ai", "growth"] as const;

  return (
    <MarketingLayout>
      <div data-testid="pricing-page" style={{ overflowX: "hidden" }}>

        <section
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "80px 28px 96px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
          data-testid="pricing-hero"
        >
          <div style={{ position: "absolute", top: -80, right: -80, width: 420, height: 420, borderRadius: "50%", background: "rgba(47,107,255,0.08)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -60, left: -60, width: 320, height: 320, borderRadius: "50%", background: "rgba(47,107,255,0.07)", pointerEvents: "none" }} />

          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(47,107,255,0.20)", border: "1px solid rgba(47,107,255,0.35)",
              borderRadius: 20, padding: "5px 16px", marginBottom: 28,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6EE7B7", letterSpacing: "0.04em" }}>
                Simple, Transparent Pricing
              </span>
            </div>

            <h1
              data-testid="pricing-headline"
              style={{
                fontSize: "clamp(32px, 4vw, 52px)",
                fontWeight: 700, color: "#FFFFFF",
                lineHeight: 1.1, letterSpacing: "-0.035em",
                marginBottom: 20,
              }}
            >
              Pricing That Scales From{" "}
              <span style={{ color: "#6EE7B7" }}>One Tool</span>{" "}
              To Full Automation
            </h1>

            <p style={{ fontSize: "clamp(16px, 1.8vw, 19px)", color: "rgba(255,255,255,0.6)", lineHeight: 1.65, marginBottom: 40, maxWidth: 560, margin: "0 auto 40px" }}>
              Fixed monthly rates. No price ranges. No hidden fees. Pay in CAD or USD.
            </p>

            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 44 }}>
              <Link
                href="/Wizard"
                data-testid="pricing-cta-start"
                className="mkt-btn-primary"
                style={{ padding: "13px 30px", fontSize: 15, textDecoration: "none", display: "inline-block" }}
              >
                Start Free
              </Link>
              <Link
                href="/demo"
                data-testid="pricing-cta-demo"
                className="mkt-btn-ghost"
                style={{ padding: "13px 24px", borderRadius: 14, background: "transparent", color: "#FFFFFF", fontSize: 15, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, border: "1.5px solid rgba(255,255,255,0.28)" }}
              >
                <Play size={13} fill="currentColor" /> View Demo
              </Link>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 14, fontWeight: annual ? 400 : 600, color: annual ? "rgba(255,255,255,0.5)" : "#FFFFFF", transition: "color 0.2s" }}>Monthly</span>
                <button
                  data-testid="toggle-annual"
                  onClick={() => setAnnual((a) => !a)}
                  aria-label="Toggle annual pricing"
                  style={{
                    position: "relative", width: 52, height: 28, borderRadius: 14,
                    background: annual ? mkt.accent : "rgba(255,255,255,0.18)",
                    border: "none", cursor: "pointer",
                    transition: "background 0.25s ease", flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: "absolute", top: 3,
                    left: annual ? 27 : 3,
                    width: 22, height: 22, borderRadius: "50%",
                    background: "#FFFFFF",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                    transition: "left 0.25s ease",
                  }} />
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: annual ? 600 : 400, color: annual ? "#FFFFFF" : "rgba(255,255,255,0.5)", transition: "color 0.2s" }}>Yearly</span>
                  <span style={{ background: mkt.accent, color: "#FFFFFF", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.04em" }}>
                    Save {Math.round(YEARLY_DISCOUNT_PCT * 100)}%
                  </span>
                </div>
              </div>

              <div style={{ height: 24, width: 1, background: "rgba(255,255,255,0.2)" }} />

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  data-testid="toggle-cad"
                  onClick={() => setCurrency("CAD")}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 14,
                    border: "1.5px solid",
                    borderColor: currency === "CAD" ? "#FFFFFF" : "rgba(255,255,255,0.25)",
                    background: currency === "CAD" ? "rgba(255,255,255,0.15)" : "transparent",
                    color: currency === "CAD" ? "#FFFFFF" : "rgba(255,255,255,0.5)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  CAD
                </button>
                <button
                  data-testid="toggle-usd"
                  onClick={() => setCurrency("USD")}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 14,
                    border: "1.5px solid",
                    borderColor: currency === "USD" ? "#FFFFFF" : "rgba(255,255,255,0.25)",
                    background: currency === "USD" ? "rgba(255,255,255,0.15)" : "transparent",
                    color: currency === "USD" ? "#FFFFFF" : "rgba(255,255,255,0.5)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  USD
                </button>
                <span data-testid="fx-rate-label" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>
                  1 CAD = {fxRate.toFixed(4)} USD{fxLoaded ? "" : " (est.)"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {categories.map((cat) => {
          const catProducts = products.filter((p) => p.category === cat);
          if (catProducts.length === 0) return null;

          return (
            <section
              key={cat}
              data-testid={`pricing-category-${cat}`}
              style={{ background: cat === "ai" ? mkt.sectionLight : mkt.bg, padding: "72px 28px 80px" }}
            >
              <div style={{ maxWidth: 1180, margin: "0 auto" }}>
                <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
                  <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                    {CATEGORY_LABELS[cat]}
                  </div>
                  <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em" }}>
                    {cat === "core" && "Essential Tools"}
                    {cat === "ai" && "AI-Powered Employees"}
                    {cat === "growth" && "Growth & Marketing Services"}
                  </h2>
                </div>

                <div
                  className="pricing-grid"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))`,
                    gap: 20,
                    alignItems: "start",
                  }}
                >
                  {catProducts.map((product, idx) => {
                    const isHighlighted = product.id === "quickquotepro" || product.id === "ai-voice";

                    return (
                      <div
                        key={product.id}
                        data-testid={`product-card-${product.id}`}
                        data-reveal="fade-up"
                        data-delay={String((idx + 1) * 100)}
                        className="mkt-feature-card"
                        style={{
                          background: mkt.bg,
                          border: `${isHighlighted ? 2 : 1}px solid ${isHighlighted ? mkt.accent : mkt.onDarkBorder}`,
                          borderRadius: 20,
                          padding: "28px 24px",
                          position: "relative",
                          boxShadow: isHighlighted ? shadows.cardHover : shadows.card,
                          transition: "border-color 0.3s ease, box-shadow 0.3s ease",
                        }}
                      >
                        {product.badge && (
                          <div style={{
                            position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                            background: product.id === "quickquotepro" ? mkt.accent : product.id === "ai-voice" ? mkt.warning : mkt.sectionLight,
                            color: product.id === "quickquotepro" || product.id === "ai-voice" ? "#FFFFFF" : mkt.onDarkMuted,
                            fontSize: 11, fontWeight: 700, padding: "4px 14px",
                            borderRadius: 20, whiteSpace: "nowrap" as const, letterSpacing: "0.04em",
                          }}>
                            {product.badge}
                          </div>
                        )}

                        <div style={{ fontSize: 11, fontWeight: 700, color: mkt.onDarkMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                          {product.name}
                        </div>

                        <PriceDisplay product={product} annual={annual} currency={currency} fxRate={fxRate} />

                        <SetupFee product={product} currency={currency} fxRate={fxRate} />

                        <div style={{ fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.5, marginBottom: 22, marginTop: 8 }}>
                          {product.tagline}
                        </div>

                        <Link
                          href="/Wizard"
                          data-testid={`button-cta-${product.id}`}
                          className="mkt-btn-primary"
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "11px 0",
                            fontSize: 14,
                            textAlign: "center" as const,
                            textDecoration: "none",
                            marginBottom: 22,
                            background: isHighlighted ? mkt.ctaBg : "transparent",
                            color: isHighlighted ? mkt.ctaText : mkt.onDarkMuted,
                            border: isHighlighted ? "none" : `1.5px solid ${mkt.onDarkBorder}`,
                          }}
                        >
                          {product.billingType === "one_time" ? "Get Started" : "Start Free"}
                        </Link>

                        <div style={{ borderTop: `1px solid ${mkt.borderLight}`, marginBottom: 18 }} />

                        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                          {product.features.map((feat) => (
                            <li key={feat} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.4 }}>
                              <Check size={14} color={mkt.accent} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>

                        <Link
                          href={`/products/${PRICING_TO_PRODUCT_SLUG[product.id] || product.id}`}
                          data-testid={`pricing-learn-more-${product.id}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: mkt.accent, textDecoration: "none", marginTop: 16 }}
                        >
                          Learn more <ArrowRight size={13} />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}

        <section style={{ background: mkt.sectionLight, padding: "96px 28px" }} data-testid="pricing-faq">
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 52 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                FAQ
              </div>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.onDark, letterSpacing: "-0.025em", marginBottom: 12 }}>
                Everything you need to know
              </h2>
              <p style={{ fontSize: 16, color: mkt.onDarkMuted }}>
                Still have questions? <Link href="/contact" style={{ color: mkt.accent, fontWeight: 600, textDecoration: "none" }}>Chat with us</Link>
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-reveal="fade-up">
              {FAQS.map((faq) => (
                <FAQItem key={faq.q} {...faq} />
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
            padding: "112px 28px",
            textAlign: "center",
          }}
          data-testid="pricing-cta-band"
        >
          <div style={{ maxWidth: 640, margin: "0 auto" }} data-reveal="scale">
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 36 }}>
              {["No credit card required", "Cancel anytime", "Fixed monthly rates"].map((b) => (
                <span key={b} style={{ fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)", padding: "5px 14px", borderRadius: 20 }}>
                  {b}
                </span>
              ))}
            </div>

            <h2 style={{ fontSize: "clamp(28px, 3.5vw, 46px)", fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.025em", marginBottom: 16, lineHeight: 1.1 }}>
              Start Free And Publish Your First Quote Tool Today
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, marginBottom: 44, maxWidth: 480, margin: "0 auto 44px" }}>
              Turn quotes into booked jobs. Match your real pricing style. Join thousands of trades businesses already growing with WeFixTrades.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/Wizard"
                data-testid="pricing-final-cta-start"
                className="mkt-btn-primary"
                style={{ display: "inline-block", padding: "15px 36px", borderRadius: 14, background: "#FFFFFF", color: mkt.accent, fontSize: 16, fontWeight: 700, textDecoration: "none" }}
              >
                Start Free
              </Link>
              <Link
                href="/demo"
                data-testid="pricing-final-cta-demo"
                className="mkt-btn-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 28px", borderRadius: 14, background: "transparent", color: "#FFFFFF", fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.38)" }}
              >
                <Play size={13} fill="currentColor" /> View Demo
              </Link>
            </div>
          </div>
        </section>

      </div>
    </MarketingLayout>
  );
}
