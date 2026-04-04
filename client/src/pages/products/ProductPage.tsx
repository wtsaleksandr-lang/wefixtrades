import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Check, ChevronDown, ArrowRight, Phone, MessageSquare, MessagesSquare, RotateCcw, Star } from "lucide-react";
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
function PricingSection({ product, pricingIntro }: { product: ProductConfig; pricingIntro?: React.ReactNode }) {
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
          {pricingIntro ?? (
            <>
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
            </>
          )}
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

/* ---------- TradeLine: Section label helper ---------- */
function SectionLabel({ children }: { children: string }) {
  return (
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
      {children}
    </div>
  );
}

/* ---------- TradeLine: Problem Section ---------- */
function TradeLineProblemSection() {
  const stats = [
    "62% of calls to small service businesses go unanswered",
    "85% of those callers never try again",
    "Every missed call is potential revenue lost",
  ];

  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="tradeline-problem">
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>The problem</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 24,
          }}
        >
          Every missed call costs you money.
        </h2>
        <p
          style={{
            fontSize: 16,
            color: mkt.textMuted,
            lineHeight: 1.7,
            maxWidth: 560,
            margin: "0 auto 32px",
          }}
        >
          You're under a sink. On a roof. Elbow-deep in a panel. Your phone rings. You can't answer.
          <br /><br />
          That caller doesn't leave a voicemail. They call the next tradie on Google.
          <br /><br />
          That one missed call doesn't just cost you today — it costs repeat work, referrals, and future jobs.
        </p>

        <style>{`
          .tl-stat-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 32px;
          }
          @media (max-width: 640px) {
            .tl-stat-row { grid-template-columns: 1fr; }
          }
        `}</style>

        <div className="tl-stat-row" data-reveal="fade-up">
          {stats.map((stat) => (
            <div
              key={stat}
              style={{
                background: mkt.bg,
                border: `1px solid ${mkt.border}`,
                borderRadius: 14,
                padding: "20px 16px",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: mkt.textMuted, lineHeight: 1.5 }}>
                {stat}
              </span>
            </div>
          ))}
        </div>

        <p
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: mkt.text,
            lineHeight: 1.5,
          }}
        >
          You don't have a marketing problem. You have a missed-call problem.
        </p>
        <p
          style={{
            fontSize: 15,
            color: mkt.textMuted,
            lineHeight: 1.6,
            marginTop: 16,
          }}
        >
          Every day you wait is more missed calls — and more jobs going to someone else.
        </p>
      </div>
    </section>
  );
}

/* ---------- TradeLine: Solution Channels ---------- */
function TradeLineSolutionSection() {
  const channels = [
    { icon: Phone, title: "Phone Calls", desc: "AI answers in seconds. Takes details, gives estimates, captures leads." },
    { icon: MessageSquare, title: "SMS / Text", desc: "Missed call? Auto text-back keeps the conversation going." },
    { icon: MessagesSquare, title: "Website Chat", desc: "Chat widget on your site. Answers questions and captures leads around the clock." },
    { icon: RotateCcw, title: "Follow-Ups", desc: "Automated sequences that keep leads warm until they book." },
    { icon: Star, title: "Review Requests", desc: "After the job, TradeLine requests a Google review automatically." },
  ];

  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="tradeline-solution">
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>The fix</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 8,
          }}
        >
          TradeLine handles it — automatically.
        </h2>
        <p style={{ fontSize: 16, color: mkt.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
          One system. Every channel. 24/7.
        </p>
        <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text, marginBottom: 40, lineHeight: 1.5 }}>
          TradeLine doesn't just answer calls — it captures and converts every lead.
        </p>

        <style>{`
          .tl-channel-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 14px;
            text-align: left;
          }
          .tl-channel-card {
            background: ${mkt.surface};
            border: 1px solid ${mkt.border};
            border-radius: 14px;
            padding: 20px;
            transition: border-color 0.2s ease, transform 0.2s ease;
          }
          .tl-channel-card:hover {
            border-color: rgba(102,232,250,0.18);
            transform: translateY(-1px);
          }
        `}</style>

        <div className="tl-channel-grid">
          {channels.map((ch, i) => (
            <div key={ch.title} className="tl-channel-card" data-reveal="fade-up" data-delay={String(i * 60)}>
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: mkt.accentTint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ch.icon size={18} color={mkt.accent} strokeWidth={2} />
                </div>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: mkt.text, marginBottom: 6 }}>
                {ch.title}
              </h3>
              <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, margin: 0 }}>
                {ch.desc}
              </p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 14, color: mkt.textMuted, marginTop: 28, lineHeight: 1.6 }}>
          You stay in control — TradeLine follows your rules, pricing, and availability.
        </p>
      </div>
    </section>
  );
}

/* ---------- TradeLine: Multi-channel Comparison ---------- */
function TradeLineComparisonSection() {
  const rows = [
    { feature: "Phone calls", tradeline: true, typical: true },
    { feature: "SMS text-back", tradeline: true, typical: "Sometimes" },
    { feature: "Website chat", tradeline: true, typical: false },
    { feature: "Auto follow-ups", tradeline: true, typical: false },
    { feature: "Review requests", tradeline: true, typical: false },
    { feature: "Instant estimates", tradeline: true, typical: "Rarely" },
  ];

  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="tradeline-comparison">
      <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>Multi-channel</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 12,
          }}
        >
          Your competitors answer calls.{" "}
          <span style={{ color: mkt.accent }}>TradeLine answers everything.</span>
        </h2>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
          Most AI answering services handle phone calls only. TradeLine covers calls, texts, website chat, and follow-ups — one system, zero gaps.
        </p>
        <p style={{ fontSize: 14, fontWeight: 600, color: mkt.text, marginBottom: 36, lineHeight: 1.5 }}>
          Most answering services stop at phone calls. That's where you start losing leads.
        </p>

        <div
          style={{
            background: mkt.bg,
            border: `1px solid ${mkt.border}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${mkt.border}` }}>
                <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: 600, color: mkt.textMuted }}></th>
                <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 700, color: mkt.accent }}>TradeLine</th>
                <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, color: mkt.textMuted }}>Typical AI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} style={{ borderBottom: `1px solid ${mkt.border}` }}>
                  <td style={{ padding: "12px 16px", color: mkt.text, fontWeight: 500 }}>{row.feature}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    {row.tradeline === true ? (
                      <Check size={16} color={mkt.accent} strokeWidth={2.5} />
                    ) : (
                      <span style={{ color: mkt.textMuted }}>{String(row.tradeline)}</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    {row.typical === true ? (
                      <Check size={16} color={mkt.accent} strokeWidth={2.5} />
                    ) : row.typical === false ? (
                      <span style={{ color: mkt.textMuted, fontSize: 16 }}>—</span>
                    ) : (
                      <span style={{ color: mkt.textMuted, fontSize: 13 }}>{String(row.typical)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- TradeLine: Voicemail Objection ---------- */
function TradeLineVoicemailSection() {
  const bullets = [
    "Calls go unanswered",
    "Leads don\u2019t leave messages",
    "You call back too late",
    "Jobs go to competitors",
  ];

  return (
    <section style={{ background: mkt.bg, padding: "64px 28px" }} data-testid="tradeline-voicemail">
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>Reality check</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(22px, 2.8vw, 32px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 24,
          }}
        >
          Still relying on voicemail?
        </h2>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "0 auto 24px",
            maxWidth: 320,
            textAlign: "left",
          }}
        >
          {bullets.map((b) => (
            <li
              key={b}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 15,
                color: mkt.textMuted,
                lineHeight: 1.5,
                marginBottom: 10,
              }}
            >
              <span style={{ color: "rgba(255,100,100,0.7)", fontSize: 16, flexShrink: 0 }}>&times;</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 16, fontWeight: 600, color: mkt.text }}>
          That system doesn't work anymore.
        </p>
      </div>
    </section>
  );
}

/* ---------- TradeLine: Results / Proof ---------- */
function TradeLineResultsSection({ outcomes }: { outcomes: { title: string; desc: string }[] }) {
  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="tradeline-results">
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>Results</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 36,
          }}
        >
          What happens when you stop missing calls.
        </h2>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 0 }}>
          What TradeLine is designed to help you achieve:
        </p>

        <style>{`
          .tl-results-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 14px;
            text-align: left;
            margin-bottom: 32px;
          }
        `}</style>

        <div className="tl-results-grid">
          {outcomes.map((o, i) => (
            <div
              key={o.title}
              data-reveal="fade-up"
              data-delay={String(i * 60)}
              style={{
                background: mkt.surface,
                border: `1px solid ${mkt.border}`,
                borderRadius: 14,
                padding: "22px 18px",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: mkt.accent, marginBottom: 6 }}>
                {o.title}
              </h3>
              <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, margin: 0 }}>
                {o.desc}
              </p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text }}>
          Starter costs $97/mo. One booked job covers it.
        </p>
        <p style={{ fontSize: 14, color: mkt.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          Missing just one job per month costs more than TradeLine.
        </p>
      </div>
    </section>
  );
}

/* ---------- TradeLine: Built For Trades ---------- */
function TradeLineBuiltForSection({ trades }: { trades: string[] }) {
  return (
    <section style={{ background: mkt.bg, padding: "56px 28px" }} data-testid="tradeline-built-for">
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <p style={{ fontSize: 15, fontWeight: 600, color: mkt.textMuted, marginBottom: 20 }}>
          Built for businesses that can't afford to miss a call.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
          {trades.map((trade) => (
            <span
              key={trade}
              style={{
                padding: "6px 14px",
                borderRadius: 9999,
                border: `1px solid ${mkt.border}`,
                fontSize: 13,
                fontWeight: 500,
                color: mkt.textMuted,
                background: mkt.surface,
              }}
            >
              {trade}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 14, color: mkt.textMuted, marginTop: 16, margin: "16px auto 0", opacity: 0.75 }}>
          Designed for real job-site conditions — not office desks.
        </p>
      </div>
    </section>
  );
}

/* ---------- TradeLine: Risk Reversal ---------- */
function TradeLineRiskReversal() {
  return (
    <div
      style={{
        background: mkt.dark,
        padding: "0 28px 40px",
        textAlign: "center",
      }}
      data-reveal="fade-up"
    >
      <p
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: mkt.onDarkFaint,
          maxWidth: 600,
          margin: "0 auto",
          letterSpacing: "0.01em",
        }}
      >
        14-day free trial · No credit card required · No contracts · Cancel anytime
      </p>
    </div>
  );
}

/* ---------- TradeLine: Pricing intro override ---------- */
function TradeLinePricingIntro() {
  return (
    <>
      <SectionLabel>Pricing</SectionLabel>
      <h2
        style={{
          fontSize: "clamp(24px, 3vw, 36px)",
          fontWeight: 700,
          color: mkt.onDark,
          letterSpacing: "-0.025em",
          marginBottom: 8,
        }}
      >
        Simple pricing. No surprises.
      </h2>
      <p
        style={{
          fontSize: 15,
          color: mkt.onDarkFaint,
          maxWidth: 520,
          margin: "0 auto",
          lineHeight: 1.6,
        }}
      >
        Every plan includes AI call answering, SMS replies, missed-call auto-response, lead capture, and follow-ups. Pick the plan that matches your call volume.
      </p>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: mkt.onDarkMuted,
          marginTop: 12,
        }}
      >
        Start small. Upgrade anytime as your call volume grows.
      </p>
    </>
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

  const isTradeLine = product.slug === "tradeline";

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

          {isTradeLine ? (
            <>
              <div
                className="hero-enter"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: mkt.accent,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 12,
                  fontFamily: typography.fontFamily,
                }}
              >
                {product.name}
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
                Never Miss a Call Again —{" "}
                <span style={{ color: mkt.accent }}>Or Lose Another Job to a Competitor</span>
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
                AI that answers your calls and chats 24/7 — so you can stay on the tools.
                <br />
                <span style={{ fontSize: "clamp(13px, 1.5vw, 15px)", opacity: 0.75 }}>
                  Think of it as a 24/7 receptionist that never misses a call.
                </span>
              </p>
            </>
          ) : (
            <>
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
            </>
          )}

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

          {isTradeLine && (
            <div
              className="hero-enter"
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "6px 18px",
                marginTop: 24,
                fontSize: 13,
                fontWeight: 500,
                color: mkt.textMuted,
              }}
            >
              {[
                "Built for trades businesses",
                "Works while you\u2019re on the job",
                "24/7 lead capture",
                "No contracts \u00B7 Cancel anytime",
              ].map((item) => (
                <span key={item} style={{ whiteSpace: "nowrap" }}>{item}</span>
              ))}
            </div>
          )}
        </ProductHeroShell>

        {/* ── TradeLine: Built For + Problem + Solution (between hero and capabilities) ── */}
        {isTradeLine && (
          <>
            <TradeLineBuiltForSection trades={product.bestFor} />
            <TradeLineProblemSection />
            <TradeLineSolutionSection />

            {/* Mid-page CTA */}
            <div
              style={{ background: mkt.surface, textAlign: "center", padding: "48px 28px" }}
              data-reveal="fade-up"
            >
              <Link
                href="/Wizard"
                className="mkt-btn-primary"
                style={{
                  padding: "14px 32px",
                  borderRadius: 9999,
                  background: mkt.accent,
                  color: mkt.buttonText,
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Start Your Free Trial
              </Link>
              <p style={{ fontSize: 13, color: mkt.textMuted, marginTop: 12, opacity: 0.75 }}>
                Takes less than 15 minutes to set up
              </p>
            </div>
          </>
        )}

        {/* ── §2 CAPABILITIES / BENEFITS ── */}
        <CapabilitiesGrid items={product.highlights} />

        {/* ── §3 HOW IT WORKS ── */}
        <StepTimeline steps={product.howItWorks} />

        {isTradeLine && (
          <div style={{ background: mkt.surface, textAlign: "center", padding: "0 28px 48px" }} data-reveal="fade-up">
            <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text, maxWidth: 560, margin: "0 auto", lineHeight: 1.5 }}>
              Within minutes, your next missed call is answered automatically — and turned into a lead.
            </p>
          </div>
        )}

        {/* ── TradeLine: Multi-channel Comparison (after how-it-works) ── */}
        {isTradeLine && <TradeLineComparisonSection />}

        {/* ── TradeLine: Voicemail objection (after comparison) ── */}
        {isTradeLine && <TradeLineVoicemailSection />}

        {/* ── §4 SOCIAL PROOF ── */}
        <SurfaceSection overlap className="py-4">
          <ReviewsSection />
        </SurfaceSection>

        {/* ── TradeLine: Results / Proof (after reviews, before pricing) ── */}
        {isTradeLine && <TradeLineResultsSection outcomes={product.outcomes} />}

        {/* ── §5 PRICING (MANDATORY) ── */}
        <PricingSection product={product} pricingIntro={isTradeLine ? <TradeLinePricingIntro /> : undefined} />

        {/* ── TradeLine: Risk Reversal (below pricing) ── */}
        {isTradeLine && <TradeLineRiskReversal />}

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
        {isTradeLine ? (
          <CTASection
            heading="Stop Missing Calls. Start Winning More Jobs."
            subtext="Try TradeLine free for 14 days. No credit card. No contracts."
            ctaLabel="Start Your Free Trial"
            ctaHref="/Wizard"
          />
        ) : (
          <CTASection />
        )}

      </div>
    </MarketingLayout>
  );
}
