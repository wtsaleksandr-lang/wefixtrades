import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Check, ChevronDown, ArrowRight, Play } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { mkt, shadows } from "@/theme/tokens";

const CAD_TO_USD = 1.35;

interface Tier {
  name: string;
  priceMonthly: number | null;
  priceOneTime: number | null;
  cadence: "/mo" | "one-time";
  includes: string[];
  highlighted?: boolean;
  badge?: string;
}

interface ProductGroup {
  id: string;
  family: string;
  description: string;
  tiers: Tier[];
}

const PRODUCT_GROUPS: ProductGroup[] = [
  {
    id: "tradeline",
    family: "TradeLine\u2122",
    description: "24/7 AI-powered lead handling ecosystem. Chat, voice, and DM capture for trades.",
    tiers: [
      {
        name: "AI ChatLine\u2122",
        priceMonthly: 149,
        priceOneTime: null,
        cadence: "/mo",
        includes: ["Website chat widget", "SMS lead capture", "Basic qualification flow", "Instant notifications"],
      },
      {
        name: "AI CallLine\u2122",
        priceMonthly: 199,
        priceOneTime: null,
        cadence: "/mo",
        includes: ["24/7 AI voice answering", "Call summary & transcript", "Lead capture", "SMS/email notifications"],
      },
      {
        name: "TradeLine\u2122 Complete",
        priceMonthly: 299,
        priceOneTime: null,
        cadence: "/mo",
        includes: ["ChatLine + CallLine", "Facebook & Instagram DMs", "Full lead capture system", "All channels unified"],
        highlighted: true,
        badge: "Best Value",
      },
    ],
  },
  {
    id: "mapguard",
    family: "MapGuard\u2122",
    description: "Google Business Profile optimization and ongoing local visibility growth.",
    tiers: [
      {
        name: "MapGuard Setup",
        priceMonthly: null,
        priceOneTime: 499,
        cadence: "one-time",
        includes: ["Profile cleanup & optimization", "Category & service tuning", "Description rewrite", "Photos & posts plan"],
      },
      {
        name: "MapGuard Ongoing",
        priceMonthly: 299,
        priceOneTime: null,
        cadence: "/mo",
        includes: ["Monthly GBP updates", "Review generation strategy", "Posts cadence", "Ranking monitoring"],
        highlighted: true,
        badge: "Popular",
      },
    ],
  },
  {
    id: "reputationshield",
    family: "ReputationShield\u2122",
    description: "Automated review requests, reputation monitoring, and trust building.",
    tiers: [
      {
        name: "ReputationShield",
        priceMonthly: 229,
        priceOneTime: null,
        cadence: "/mo",
        includes: ["Automated review requests", "Review response templates", "Reputation monitoring", "Negative review alerts", "Review widget for website"],
        highlighted: true,
      },
    ],
  },
  {
    id: "webboost",
    family: "WebBoost\u2122",
    description: "Website speed and SEO optimization that lifts your rankings and conversions.",
    tiers: [
      {
        name: "WebBoost Setup",
        priceMonthly: null,
        priceOneTime: 599,
        cadence: "one-time",
        includes: ["Full SEO + speed audit", "Fix key technical issues", "Optimize assets & images", "Re-test & deliver report"],
      },
      {
        name: "WebBoost Care",
        priceMonthly: 199,
        priceOneTime: null,
        cadence: "/mo",
        includes: ["Monthly performance checks", "Fix regressions", "Core Web Vitals green", "Light SEO upkeep"],
        highlighted: true,
        badge: "Popular",
      },
    ],
  },
  {
    id: "quotequick",
    family: "QuoteQuick Pro\u2122",
    description: "Instant quote calculators that turn website visitors into booked jobs.",
    tiers: [
      {
        name: "QuoteQuick Template",
        priceMonthly: 99,
        priceOneTime: null,
        cadence: "/mo",
        includes: ["Pre-built calculator templates", "Fast setup in minutes", "Mobile-ready design", "Lead capture built in"],
      },
      {
        name: "QuoteQuick Pro",
        priceMonthly: 129,
        priceOneTime: null,
        cadence: "/mo",
        includes: ["Unlimited calculators", "Custom branding", "Email follow-up sequences", "Analytics dashboard"],
        highlighted: true,
        badge: "Most Popular",
      },
      {
        name: "QuoteQuick Custom",
        priceMonthly: null,
        priceOneTime: 997,
        cadence: "one-time",
        includes: ["Your pricing logic built in", "Custom trade flow", "Higher conversion rate", "Full handoff & training"],
      },
    ],
  },
  {
    id: "socialsync",
    family: "SocialSync\u2122",
    description: "Social media management and automation for consistent brand presence.",
    tiers: [
      {
        name: "SocialSync",
        priceMonthly: 349,
        priceOneTime: null,
        cadence: "/mo",
        includes: ["Content creation & scheduling", "Facebook & Instagram management", "Lead-gen campaigns", "Branded templates", "Monthly analytics"],
        highlighted: true,
      },
    ],
  },
];

function formatMoney(amount: number, currency: "CAD" | "USD"): string {
  const symbol = currency === "USD" ? "US$" : "CA$";
  return `${symbol}${Math.round(amount).toLocaleString()}`;
}

function getAnnualPrice(monthly: number): number {
  return monthly * 10;
}

function getAnnualMonthlyEquiv(monthly: number): number {
  return Math.round((monthly * 10) / 12);
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${mkt.border}`, borderRadius: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid={`faq-toggle-${q.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`}
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
          textAlign: "left" as const,
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

const FAQS = [
  {
    q: "How does annual billing work?",
    a: "Annual plans are billed as 10 months upfront \u2014 you get 2 months free. Cancel anytime before renewal. No pro-rated refunds for annual plans, but you keep access until the period ends.",
  },
  {
    q: "Can I switch between CAD and USD?",
    a: "Yes. All prices are set in CAD. USD pricing is converted at a fixed 1.35 rate for simplicity and transparency. Your invoice will reflect the currency you choose at checkout.",
  },
  {
    q: "Are there setup fees?",
    a: "Some products like MapGuard Setup and WebBoost Setup are one-time services. Monthly subscription products do not have separate setup fees.",
  },
  {
    q: "Can I bundle multiple products?",
    a: "Absolutely. Many customers combine TradeLine with MapGuard and ReputationShield for a full growth stack. Contact us for bundle pricing.",
  },
  {
    q: "Is there a free trial?",
    a: "QuoteQuick Pro offers a free tier to get started. For other products, we offer a 14-day money-back guarantee so you can try risk-free.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards via Stripe. For annual plans or custom builds, we can also invoice via bank transfer.",
  },
];

export default function PricingNewPage() {
  useScrollReveal();
  const [annual, setAnnual] = useState(false);
  const [currency, setCurrency] = useState<"CAD" | "USD">("CAD");

  useEffect(() => {
    document.title = "Pricing \u2014 WeFixTrades | All Products & Services";
  }, []);

  const convertPrice = (cadAmount: number): number => {
    return currency === "USD" ? cadAmount / CAD_TO_USD : cadAmount;
  };

  return (
    <MarketingLayout>
      <div data-testid="pricing-new-page" style={{ overflowX: "hidden" }}>
        <section
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "80px 28px 96px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
          data-testid="pricing-new-hero"
        >
          <div style={{ position: "absolute", top: -80, right: -80, width: 420, height: 420, borderRadius: "50%", background: "rgba(74,124,111,0.1)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -60, left: -60, width: 320, height: 320, borderRadius: "50%", background: "rgba(37,99,235,0.07)", pointerEvents: "none" }} />

          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(74,124,111,0.25)", border: "1px solid rgba(74,124,111,0.4)",
              borderRadius: 20, padding: "5px 16px", marginBottom: 28,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6EE7B7", letterSpacing: "0.04em" }}>
                Transparent Pricing
              </span>
            </div>

            <h1
              data-testid="pricing-new-headline"
              style={{
                fontSize: "clamp(32px, 4vw, 52px)",
                fontWeight: 700, color: "#FFFFFF",
                lineHeight: 1.1, letterSpacing: "-0.035em",
                marginBottom: 20,
              }}
            >
              Every Product.{" "}
              <span style={{ color: "#6EE7B7" }}>Every Price.</span>{" "}
              No Surprises.
            </h1>

            <p style={{ fontSize: "clamp(16px, 1.8vw, 19px)", color: "rgba(255,255,255,0.6)", lineHeight: 1.65, marginBottom: 40, maxWidth: 560, margin: "0 auto 40px" }}>
              Fixed monthly rates. Annual saves 2 months. Pay in CAD or USD.
            </p>

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
                  <span style={{ fontSize: 14, fontWeight: annual ? 600 : 400, color: annual ? "#FFFFFF" : "rgba(255,255,255,0.5)", transition: "color 0.2s" }}>Annual</span>
                  <span style={{ background: mkt.accent, color: "#FFFFFF", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.04em" }}>
                    2 Months Free
                  </span>
                </div>
              </div>

              <div style={{ height: 24, width: 1, background: "rgba(255,255,255,0.2)" }} />

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  data-testid="toggle-cad"
                  onClick={() => setCurrency("CAD")}
                  style={{
                    padding: "6px 16px", borderRadius: 14,
                    border: "1.5px solid",
                    borderColor: currency === "CAD" ? "#FFFFFF" : "rgba(255,255,255,0.25)",
                    background: currency === "CAD" ? "rgba(255,255,255,0.15)" : "transparent",
                    color: currency === "CAD" ? "#FFFFFF" : "rgba(255,255,255,0.5)",
                    fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s ease",
                  }}
                >
                  CAD
                </button>
                <button
                  data-testid="toggle-usd"
                  onClick={() => setCurrency("USD")}
                  style={{
                    padding: "6px 16px", borderRadius: 14,
                    border: "1.5px solid",
                    borderColor: currency === "USD" ? "#FFFFFF" : "rgba(255,255,255,0.25)",
                    background: currency === "USD" ? "rgba(255,255,255,0.15)" : "transparent",
                    color: currency === "USD" ? "#FFFFFF" : "rgba(255,255,255,0.5)",
                    fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s ease",
                  }}
                >
                  USD
                </button>
                <span data-testid="fx-rate-label" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>
                  1 CAD \u2248 {(1 / CAD_TO_USD).toFixed(2)} USD
                </span>
              </div>
            </div>
          </div>
        </section>

        {PRODUCT_GROUPS.map((group, gi) => (
          <section
            key={group.id}
            data-testid={`pricing-group-${group.id}`}
            style={{
              background: gi % 2 === 0 ? mkt.bg : mkt.surface,
              padding: "72px 28px 80px",
            }}
          >
            <div style={{ maxWidth: 1180, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
                <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                  {group.family}
                </div>
                <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 12 }}>
                  {group.family}
                </h2>
                <p style={{ fontSize: 16, color: mkt.textMuted, maxWidth: 560, margin: "0 auto", lineHeight: 1.6 }}>
                  {group.description}
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))`,
                  gap: 20,
                  alignItems: "start",
                }}
              >
                {group.tiers.map((tier, ti) => {
                  const isHighlighted = !!tier.highlighted;
                  const isOneTime = tier.cadence === "one-time";
                  const basePrice = isOneTime ? tier.priceOneTime! : tier.priceMonthly!;

                  let displayPrice: number;
                  let cadenceLabel: string;
                  let savingsLine: string | null = null;

                  if (isOneTime) {
                    displayPrice = convertPrice(basePrice);
                    cadenceLabel = "one-time";
                  } else if (annual) {
                    const annualTotal = getAnnualPrice(basePrice);
                    displayPrice = convertPrice(annualTotal);
                    cadenceLabel = "/yr";
                    const monthlyEquiv = getAnnualMonthlyEquiv(basePrice);
                    savingsLine = `${formatMoney(convertPrice(monthlyEquiv), currency)}/mo \u2014 Save 2 months`;
                  } else {
                    displayPrice = convertPrice(basePrice);
                    cadenceLabel = "/mo";
                  }

                  return (
                    <div
                      key={tier.name}
                      data-testid={`tier-card-${group.id}-${ti}`}
                      data-reveal="fade-up"
                      data-delay={String((ti + 1) * 100)}
                      style={{
                        background: mkt.bg,
                        border: `${isHighlighted ? 2 : 1}px solid ${isHighlighted ? mkt.accent : mkt.border}`,
                        borderRadius: 20,
                        padding: "28px 24px",
                        position: "relative",
                        boxShadow: isHighlighted ? shadows.cardHover : shadows.card,
                        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
                      }}
                    >
                      {tier.badge && (
                        <div style={{
                          position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                          background: mkt.accent,
                          color: "#FFFFFF",
                          fontSize: 11, fontWeight: 700, padding: "4px 14px",
                          borderRadius: 20, whiteSpace: "nowrap" as const, letterSpacing: "0.04em",
                        }}>
                          {tier.badge}
                        </div>
                      )}

                      <div style={{ fontSize: 11, fontWeight: 700, color: mkt.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                        {tier.name}
                      </div>

                      <div>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: savingsLine ? 4 : 6 }}>
                          <span data-testid={`price-${group.id}-${ti}`} style={{ fontSize: 38, fontWeight: 700, color: mkt.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
                            {formatMoney(displayPrice, currency)}
                          </span>
                          <span style={{ fontSize: 14, color: mkt.textMuted, marginBottom: 4 }}>{cadenceLabel}</span>
                        </div>
                        {savingsLine && (
                          <div style={{ fontSize: 13, color: mkt.accent, fontWeight: 600, marginBottom: 6 }}>
                            {savingsLine}
                          </div>
                        )}
                      </div>

                      <Link
                        href="/Wizard"
                        data-testid={`button-cta-${group.id}-${ti}`}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "11px 0",
                          borderRadius: 14,
                          fontSize: 14,
                          fontWeight: 700,
                          textAlign: "center" as const,
                          textDecoration: "none",
                          marginBottom: 22,
                          marginTop: 16,
                          background: isHighlighted ? mkt.accent : "transparent",
                          color: isHighlighted ? "#FFFFFF" : mkt.textMuted,
                          border: isHighlighted ? "none" : `1.5px solid ${mkt.border}`,
                          transition: "background 0.2s ease, box-shadow 0.2s ease",
                        }}
                      >
                        {isOneTime ? "Get Started" : "Start Free"}
                      </Link>

                      <div style={{ borderTop: `1px solid ${mkt.borderLight}`, marginBottom: 18 }} />

                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                        {tier.includes.map((feat) => (
                          <li key={feat} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: mkt.textMuted, lineHeight: 1.4 }}>
                            <Check size={14} color={mkt.accent} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>

                      <Link
                        href={`/products/${group.id}`}
                        data-testid={`pricing-learn-more-${group.id}-${ti}`}
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
        ))}

        <section style={{ background: mkt.surface, padding: "96px 28px" }} data-testid="pricing-new-faq">
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 52 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: mkt.accent, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                FAQ
              </div>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 12 }}>
                Common Questions
              </h2>
              <p style={{ fontSize: 16, color: mkt.textMuted }}>
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
          data-testid="pricing-new-cta-band"
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
              Ready To Grow Your Trades Business?
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, marginBottom: 44, maxWidth: 480, margin: "0 auto 44px" }}>
              Pick the tools you need. Start free. Scale when you're ready.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/Wizard"
                data-testid="pricing-new-final-cta-start"
                style={{ display: "inline-block", padding: "15px 36px", borderRadius: 14, background: "#FFFFFF", color: mkt.accent, fontSize: 16, fontWeight: 700, textDecoration: "none" }}
              >
                Start Free
              </Link>
              <Link
                href="/demos"
                data-testid="pricing-new-final-cta-demo"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 28px", borderRadius: 14, background: "transparent", color: "#FFFFFF", fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.38)" }}
              >
                <Play size={13} fill="currentColor" /> View Demos
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
