import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Check, Minus, ChevronDown, ArrowRight, Play } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { PLANS, COMPARISON_ROWS, FAQS } from "@/config/pricingPlans";

/* ─── Design tokens ─────────────────────────────── */
const C = {
  navy: "#0B1F3A",
  sage: "#2D6A4F",
  sageDark: "#1B4332",
  sageLight: "#40916C",
  sageTint: "#F0F7F4",
  sageAccent: "#D1FAE5",
  blue: "#2563EB",
  gold: "#F59E0B",
  bg: "#FFFFFF",
  bgGray: "#F8FAFC",
  heading: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
};

const SHADOW = {
  card: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)",
  featured: "0 8px 40px rgba(45,106,79,0.18)",
  gold: "0 8px 40px rgba(245,158,11,0.15)",
};

/* ─── FAQ Accordion item ─────────────────────────── */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "18px 22px",
          background: open ? C.bgGray : C.bg,
          border: "none",
          cursor: "pointer",
          gap: 16,
          textAlign: "left" as const,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: C.heading, lineHeight: 1.4 }}>{q}</span>
        <ChevronDown size={17} color={C.muted} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.22s ease" }} />
      </button>
      {open && (
        <div style={{ padding: "0 22px 18px", background: C.bgGray }}>
          <p style={{ fontSize: 15, color: C.body, lineHeight: 1.7, margin: 0 }}>{a}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Cell renderer for comparison table ────────── */
function Cell({ val }: { val: boolean | string }) {
  if (val === true) return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.sageTint, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Check size={13} color={C.sage} strokeWidth={2.5} />
      </div>
    </div>
  );
  if (val === false) return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <Minus size={16} color="#CBD5E1" />
    </div>
  );
  return <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: C.blue, whiteSpace: "nowrap" as const }}>{val}</div>;
}

/* ─── Main component ────────────────────────────── */
export default function PricingPage() {
  useScrollReveal();
  const [annual, setAnnual] = useState(false);

  useEffect(() => {
    document.title = "Pricing — QuickQuotePro | Plans For Every Trades Business";
  }, []);

  return (
    <MarketingLayout>
      <div data-testid="pricing-page" style={{ overflowX: "hidden" }}>

        {/* ══════════════════════════════════════════
            A. HERO
        ══════════════════════════════════════════ */}
        <section
          style={{
            background: `linear-gradient(160deg, ${C.navy} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "80px 28px 96px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
          data-testid="pricing-hero"
        >
          <div style={{ position: "absolute", top: -80, right: -80, width: 420, height: 420, borderRadius: "50%", background: "rgba(45,106,79,0.1)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -60, left: -60, width: 320, height: 320, borderRadius: "50%", background: "rgba(37,99,235,0.07)", pointerEvents: "none" }} />

          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(45,106,79,0.25)", border: "1px solid rgba(45,106,79,0.4)",
              borderRadius: 20, padding: "5px 16px", marginBottom: 28,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6EE7B7", letterSpacing: "0.04em" }}>
                ✦ Simple, Transparent Pricing
              </span>
            </div>

            <h1
              data-testid="pricing-headline"
              style={{
                fontSize: "clamp(32px, 4vw, 52px)",
                fontWeight: 800, color: "#FFFFFF",
                lineHeight: 1.1, letterSpacing: "-0.03em",
                marginBottom: 20,
              }}
            >
              Pricing That Scales From{" "}
              <span style={{ color: "#6EE7B7" }}>One Tool</span>{" "}
              To Full Automation
            </h1>

            <p style={{ fontSize: "clamp(16px, 1.8vw, 19px)", color: "rgba(255,255,255,0.6)", lineHeight: 1.65, marginBottom: 40, maxWidth: 560, margin: "0 auto 40px" }}>
              Start simple. Upgrade when you want booking, SMS, AI employee, and custom domain.
            </p>

            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 44 }}>
              <Link
                href="/Wizard"
                data-testid="pricing-cta-start"
                className="mkt-btn-primary"
                style={{ padding: "13px 30px", borderRadius: 10, background: C.sage, color: "#FFFFFF", fontSize: 15, fontWeight: 700, textDecoration: "none", display: "inline-block" }}
              >
                Start Free
              </Link>
              <Link
                href="/demo"
                data-testid="pricing-cta-demo"
                className="mkt-btn-ghost"
                style={{ padding: "13px 24px", borderRadius: 10, background: "transparent", color: "#FFFFFF", fontSize: 15, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8, border: "1.5px solid rgba(255,255,255,0.28)" }}
              >
                <Play size={13} fill="currentColor" /> View Demo
              </Link>
            </div>

            {/* Monthly / Annual toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <span style={{ fontSize: 14, fontWeight: annual ? 400 : 600, color: annual ? "rgba(255,255,255,0.5)" : "#FFFFFF", transition: "color 0.2s" }}>Monthly</span>
              <button
                data-testid="toggle-annual"
                onClick={() => setAnnual((a) => !a)}
                aria-label="Toggle annual pricing"
                style={{
                  position: "relative", width: 52, height: 28, borderRadius: 999,
                  background: annual ? C.sage : "rgba(255,255,255,0.18)",
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
                <span style={{ background: C.sage, color: "#FFFFFF", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.04em" }}>
                  Save 20%
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            B. PLAN CARDS
        ══════════════════════════════════════════ */}
        <section style={{ background: C.bgGray, padding: "72px 28px 80px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>
            <div
              className="plans-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, alignItems: "start" }}
            >
              {PLANS.map((plan) => {
                const price = annual ? plan.price.annual : plan.price.monthly;
                const isPro = plan.id === "pro";
                const isElite = plan.id === "elite";

                return (
                  <div
                    key={plan.id}
                    data-testid={`tier-${plan.id}`}
                    data-reveal="fade-up"
                    data-delay={plan.id === "free" ? "100" : plan.id === "starter" ? "200" : plan.id === "pro" ? "300" : "400"}
                    style={{
                      background: C.bg,
                      border: `${isPro ? 2 : 1}px solid ${plan.accentBorder}`,
                      borderRadius: 20,
                      padding: "28px 24px",
                      position: "relative",
                      boxShadow: isPro ? SHADOW.featured : isElite ? SHADOW.gold : SHADOW.card,
                      ...(isPro ? { marginTop: -12 } : {}),
                    }}
                  >
                    {/* Badge */}
                    {plan.badge && (
                      <div style={{
                        position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
                        background: plan.badgeBg, color: plan.badgeColor,
                        fontSize: 11, fontWeight: 700, padding: "4px 14px",
                        borderRadius: 20, whiteSpace: "nowrap" as const, letterSpacing: "0.04em",
                      }}>
                        {plan.badge}
                      </div>
                    )}

                    {/* Plan name */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 10 }}>
                      {plan.name}
                    </div>

                    {/* Price */}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, marginBottom: 6 }}>
                      <span style={{ fontSize: 42, fontWeight: 800, color: C.heading, letterSpacing: "-0.02em", lineHeight: 1 }}>
                        ${price}
                      </span>
                      <span style={{ fontSize: 14, color: C.muted, marginBottom: 6 }}>/mo</span>
                    </div>

                    {annual && price !== plan.price.monthly && (
                      <div style={{ fontSize: 12, color: C.sage, fontWeight: 600, marginBottom: 8 }}>
                        ${plan.price.monthly * 12 - plan.price.annual * 12} saved this year
                      </div>
                    )}

                    {/* Tagline */}
                    <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 22, minHeight: 40 }}>
                      {plan.tagline}
                    </div>

                    {/* CTA */}
                    <Link
                      href={plan.id === "free" ? "/Wizard" : "/Wizard"}
                      data-testid={`button-cta-${plan.id}`}
                      className="mkt-btn-primary"
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "11px 0",
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 700,
                        textAlign: "center" as const,
                        textDecoration: "none",
                        marginBottom: 22,
                        ...(plan.ctaStyle === "primary"
                          ? { background: C.sage, color: "#FFFFFF" }
                          : { background: "transparent", color: isPro ? C.sage : C.body, border: `1.5px solid ${isPro ? C.sage : C.border}` }),
                      }}
                    >
                      {plan.cta}
                    </Link>

                    {/* Divider */}
                    <div style={{ borderTop: `1px solid ${C.borderLight}`, marginBottom: 18 }} />

                    {/* Feature list */}
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                      {plan.features.map(({ label, included }) => (
                        <li key={label} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: included === false ? C.muted : C.body, lineHeight: 1.4 }}>
                          {included === false ? (
                            <Minus size={14} color="#CBD5E1" style={{ flexShrink: 0, marginTop: 1 }} />
                          ) : (
                            <Check size={14} color={C.sage} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 1 }} />
                          )}
                          <span>
                            {label}
                            {typeof included === "string" && included !== "true" && (
                              <span style={{ fontSize: 11, fontWeight: 600, color: C.blue, marginLeft: 6 }}>
                                {included}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <p style={{ textAlign: "center", fontSize: 13, color: C.muted, marginTop: 32 }}>
              All plans include a 14-day free trial of AI Employee. No credit card required to start.
            </p>
          </div>

          <style>{`
            @media (max-width: 900px) { .plans-grid { grid-template-columns: 1fr 1fr !important; } }
            @media (max-width: 560px) { .plans-grid { grid-template-columns: 1fr !important; } }
          `}</style>
        </section>

        {/* ══════════════════════════════════════════
            C. FEATURE COMPARISON TABLE
        ══════════════════════════════════════════ */}
        <section style={{ background: C.bg, padding: "96px 28px" }} data-testid="comparison-section">
          <div style={{ maxWidth: 1040, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 52 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                Full Comparison
              </div>
              <h2 style={{ fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 800, color: C.heading, letterSpacing: "-0.02em", marginBottom: 12 }}>
                Everything side by side
              </h2>
              <p style={{ fontSize: 16, color: C.muted, maxWidth: 440, margin: "0 auto" }}>
                Compare every feature across all plans before you decide.
              </p>
            </div>

            {/* Sticky header */}
            <div style={{ overflowX: "auto", borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: SHADOW.card }} data-reveal="fade-up">
              <table data-testid="comparison-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "16px 20px", fontSize: 13, fontWeight: 700, color: C.muted, textAlign: "left", background: C.bgGray, borderBottom: `2px solid ${C.border}`, width: "36%" }}>
                      Feature
                    </th>
                    {PLANS.map((plan) => (
                      <th
                        key={plan.id}
                        style={{
                          padding: "16px 12px", textAlign: "center", background: plan.highlighted ? `${C.sage}08` : C.bgGray,
                          borderBottom: `2px solid ${plan.highlighted ? C.sage : C.border}`,
                          borderLeft: `1px solid ${C.borderLight}`,
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, color: plan.highlighted ? C.sage : C.heading, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {plan.name}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: plan.highlighted ? C.sage : C.heading, marginTop: 4 }}>
                          ${annual ? plan.price.annual : plan.price.monthly}
                          <span style={{ fontSize: 11, fontWeight: 400, color: C.muted }}>/mo</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, i) => {
                    if (row.category) {
                      return (
                        <tr key={`cat-${row.category}`}>
                          <td
                            colSpan={5}
                            style={{
                              padding: "12px 20px 8px",
                              fontSize: 11,
                              fontWeight: 800,
                              color: C.sage,
                              textTransform: "uppercase",
                              letterSpacing: "0.1em",
                              background: `${C.sage}06`,
                              borderTop: i > 0 ? `1px solid ${C.border}` : "none",
                              borderBottom: `1px solid ${C.borderLight}`,
                            }}
                          >
                            {row.category}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={row.feature} style={{ background: i % 2 === 0 ? C.bg : C.bgGray }}>
                        <td style={{ padding: "13px 20px", fontSize: 14, color: C.body, borderBottom: `1px solid ${C.borderLight}`, fontWeight: 500 }}>
                          {row.feature}
                        </td>
                        {(["free", "starter", "pro", "elite"] as const).map((planId) => {
                          const plan = PLANS.find((p) => p.id === planId)!;
                          return (
                            <td
                              key={planId}
                              style={{
                                padding: "13px 12px",
                                borderBottom: `1px solid ${C.borderLight}`,
                                borderLeft: `1px solid ${C.borderLight}`,
                                background: plan.highlighted ? `${C.sage}04` : "transparent",
                              }}
                            >
                              <Cell val={row[planId]} />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            D. DECISION HELPER
        ══════════════════════════════════════════ */}
        <section style={{ background: C.bgGray, padding: "80px 28px" }} data-testid="decision-helper">
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                Not Sure?
              </div>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, color: C.heading, letterSpacing: "-0.02em" }}>
                Which plan is right for you?
              </h2>
            </div>

            <div
              className="decision-grid"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}
            >
              {[
                {
                  emoji: "💡",
                  title: "I just need estimates",
                  body: "You want a professional quote calculator on your website that captures leads and removes phone tag.",
                  plan: "Starter",
                  planColor: C.blue,
                  planId: "starter",
                  bullets: ["1 calculator", "Custom branding", "500 leads/mo", "Email follow-ups"],
                  delay: "100",
                },
                {
                  emoji: "📅",
                  title: "I want booking + follow-ups",
                  body: "You want customers to book and pay a deposit, with SMS and WhatsApp follow-ups for cold leads.",
                  plan: "Pro",
                  planColor: C.sage,
                  planId: "pro",
                  bullets: ["3 calculators", "Booking + Stripe deposits", "SMS & WhatsApp AI", "Custom domain"],
                  delay: "200",
                },
                {
                  emoji: "🤖",
                  title: "I want full autopilot + AI",
                  body: "You want everything automated — AI employee, unlimited calculators, white-label, agency-ready.",
                  plan: "Elite",
                  planColor: C.gold,
                  planId: "elite",
                  bullets: ["Unlimited calculators", "White-label", "AI across all channels", "Priority support"],
                  delay: "300",
                },
              ].map(({ emoji, title, body, plan, planColor, planId, bullets, delay }) => (
                <div
                  key={title}
                  data-reveal="fade-up"
                  data-delay={delay}
                  className="mkt-feature-card"
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 18, padding: "28px 24px", boxShadow: SHADOW.card }}
                >
                  <div style={{ fontSize: 32, marginBottom: 16 }}>{emoji}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: C.heading, marginBottom: 10, lineHeight: 1.3 }}>{title}</h3>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 20 }}>{body}</p>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 22px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {bullets.map((b) => (
                      <li key={b} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.body }}>
                        <Check size={13} color={planColor} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 18 }}>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Recommended plan</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: planColor }}>{plan}</span>
                      <Link
                        href="/Wizard"
                        data-testid={`decision-cta-${planId}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: planColor, textDecoration: "none" }}
                      >
                        Get started <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <style>{`
              @media (max-width: 820px) { .decision-grid { grid-template-columns: 1fr !important; } }
            `}</style>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            E. FAQ
        ══════════════════════════════════════════ */}
        <section style={{ background: C.bg, padding: "96px 28px" }} data-testid="pricing-faq">
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 52 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                FAQ
              </div>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, color: C.heading, letterSpacing: "-0.02em", marginBottom: 12 }}>
                Everything you need to know
              </h2>
              <p style={{ fontSize: 16, color: C.muted }}>
                Still have questions? <Link href="/contact" style={{ color: C.sage, fontWeight: 600, textDecoration: "none" }}>Chat with us →</Link>
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-reveal="fade-up">
              {FAQS.map((faq) => (
                <FAQItem key={faq.q} {...faq} />
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            F. FINAL CTA
        ══════════════════════════════════════════ */}
        <section
          style={{
            background: `linear-gradient(135deg, ${C.sage} 0%, ${C.sageDark} 100%)`,
            padding: "112px 28px",
            textAlign: "center",
          }}
          data-testid="pricing-cta-band"
        >
          <div style={{ maxWidth: 640, margin: "0 auto" }} data-reveal="scale">
            {/* Mini trust badges */}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 36 }}>
              {["No credit card required", "14-day AI trial on all plans", "Cancel anytime"].map((b) => (
                <span key={b} style={{ fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)", padding: "5px 14px", borderRadius: 20 }}>
                  ✓ {b}
                </span>
              ))}
            </div>

            <h2 style={{ fontSize: "clamp(28px, 3.5vw, 46px)", fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.02em", marginBottom: 16, lineHeight: 1.1 }}>
              Start Free And Publish Your First Quote Tool Today
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, marginBottom: 44, maxWidth: 480, margin: "0 auto 44px" }}>
              Turn quotes into booked jobs. Match your real pricing style. Reduce price objections. Join thousands of trades businesses already on QuickQuotePro.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/Wizard"
                data-testid="pricing-final-cta-start"
                className="mkt-btn-primary"
                style={{ display: "inline-block", padding: "15px 36px", borderRadius: 10, background: "#FFFFFF", color: C.sage, fontSize: 16, fontWeight: 800, textDecoration: "none" }}
              >
                Start Free
              </Link>
              <Link
                href="/demo"
                data-testid="pricing-final-cta-demo"
                className="mkt-btn-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "15px 28px", borderRadius: 10, background: "transparent", color: "#FFFFFF", fontSize: 15, fontWeight: 600, textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.38)" }}
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
