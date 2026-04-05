import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Check, ChevronDown, ArrowRight, Phone, MessageSquare, MessagesSquare, RotateCcw, Star, Zap, UserCheck, CalendarCheck, TrendingUp, X as XIcon, Send, ShieldCheck, MessageCircle, PenTool, Share2, Eye } from "lucide-react";
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
import QuoteWidget from "@/components/quote-widget/QuoteWidget";
import type { CalculatorData } from "@/components/quote-widget/types";

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

/* ============================================================
   WEBCARE CUSTOM SECTIONS
   ============================================================ */

/* ---------- WebCare: Built For Trades ---------- */
function WCBuiltForSection({ trades }: { trades: string[] }) {
  return (
    <section style={{ background: mkt.bg, padding: "56px 28px" }} data-testid="webcare-built-for">
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <p style={{ fontSize: 15, fontWeight: 600, color: mkt.textMuted, marginBottom: 20 }}>
          Built for businesses that spend their day on job sites — not behind a desk.
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
          Your website should work as hard as you do — without needing your attention.
        </p>
      </div>
    </section>
  );
}

/* ---------- WebCare: Problem Section ---------- */
function WCProblemSection() {
  const pains = [
    "Outdated info, broken forms, and slow pages quietly cost you leads",
    "Most maintenance companies speak in jargon and assume you understand the tech",
    "A website that isn't working properly doesn't just look bad — it loses real business",
  ];

  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="webcare-problem">
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
          Your website shouldn't be another job on your list.
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
          You're busy running jobs, managing crews, and keeping customers happy.
          <br /><br />
          The last thing you need is to worry about whether your website is up to date, loading properly, or showing the right phone number.
          <br /><br />
          But when your site breaks or falls behind, you don't hear about it — your customers just move on.
        </p>

        <style>{`
          .wc-pain-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 32px;
          }
          @media (max-width: 640px) {
            .wc-pain-row { grid-template-columns: 1fr; }
          }
        `}</style>

        <div className="wc-pain-row" data-reveal="fade-up">
          {pains.map((pain) => (
            <div
              key={pain}
              style={{
                background: mkt.bg,
                border: `1px solid ${mkt.border}`,
                borderRadius: 14,
                padding: "20px 16px",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: mkt.textMuted, lineHeight: 1.5 }}>
                {pain}
              </span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 17, fontWeight: 600, color: mkt.text, lineHeight: 1.5 }}>
          You didn't start a trades business to manage a website.
        </p>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, marginTop: 16 }}>
          That's exactly why WebCare exists.
        </p>
      </div>
    </section>
  );
}

/* ---------- WebCare: What We Do Section ---------- */
function WCWhatWeDoSection() {
  const items = [
    { icon: ShieldCheck, title: "Keeps your site updated", desc: "Security patches, software updates, and backups — all handled." },
    { icon: Eye, title: "Keeps it working", desc: "We monitor your site 24/7. If something breaks, we fix it." },
    { icon: PenTool, title: "Keeps your info current", desc: "Hours changed? New service area? Updated pricing? Just tell us." },
    { icon: Zap, title: "Handles small changes", desc: "Text edits, image swaps, seasonal updates — included in your plan." },
    { icon: MessageCircle, title: "Protects against common problems", desc: "Malware, outdated plugins, expired SSL — we catch it before it causes issues." },
  ];

  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="webcare-whatwedo">
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>What WebCare does</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 8,
          }}
        >
          We just take care of it.
        </h2>
        <p style={{ fontSize: 16, color: mkt.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
          Here's what that actually means for your business:
        </p>

        <style>{`
          .wc-card-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 14px;
            text-align: left;
          }
          .wc-card {
            background: ${mkt.surface};
            border: 1px solid ${mkt.border};
            border-radius: 14px;
            padding: 20px;
            transition: border-color 0.2s ease, transform 0.2s ease;
          }
          .wc-card:hover {
            border-color: rgba(102,232,250,0.18);
            transform: translateY(-1px);
          }
        `}</style>

        <div className="wc-card-grid">
          {items.map((item, i) => (
            <div key={item.title} className="wc-card" data-reveal="fade-up" data-delay={String(i * 60)}>
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
                  <item.icon size={18} color={mkt.accent} strokeWidth={2} />
                </div>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: mkt.text, marginBottom: 6 }}>
                {item.title}
              </h3>
              <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, margin: 0 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 14, color: mkt.textMuted, marginTop: 28, lineHeight: 1.6 }}>
          You don't need WordPress knowledge, logins, or technical skills. We handle it.
        </p>
      </div>
    </section>
  );
}

/* ---------- WebCare: Comparison Table ---------- */
function WCComparisonSection() {
  const rows = [
    { feature: "Built specifically for trades", webcare: true, generic: false },
    { feature: "Plain-English support (no jargon)", webcare: true, generic: false },
    { feature: "You own your site — always", webcare: true, generic: "Varies" },
    { feature: "Content edits included", webcare: true, generic: "Limited" },
    { feature: "No technical knowledge needed", webcare: true, generic: false },
    { feature: "No contracts or lock-in", webcare: true, generic: "Varies" },
  ];

  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="webcare-comparison">
      <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>How we compare</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 12,
          }}
        >
          WebCare vs generic website maintenance.
        </h2>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 36 }}>
          Most maintenance plans are built for developers and agencies. WebCare is built for trades businesses that want simple, reliable website care.
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
                <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 700, color: mkt.accent }}>WebCare</th>
                <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, color: mkt.textMuted }}>Generic Plans</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} style={{ borderBottom: `1px solid ${mkt.border}` }}>
                  <td style={{ padding: "12px 16px", color: mkt.text, fontWeight: 500 }}>{row.feature}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    {row.webcare === true ? (
                      <Check size={16} color={mkt.accent} strokeWidth={2.5} />
                    ) : (
                      <span style={{ color: mkt.textMuted }}>{String(row.webcare)}</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    {row.generic === true ? (
                      <Check size={16} color={mkt.accent} strokeWidth={2.5} />
                    ) : row.generic === false ? (
                      <span style={{ color: mkt.textMuted, fontSize: 16 }}>—</span>
                    ) : (
                      <span style={{ color: mkt.textMuted, fontSize: 13 }}>{String(row.generic)}</span>
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

/* ---------- WebCare: Results / Value Section ---------- */
function WCResultsSection({ outcomes }: { outcomes: { title: string; desc: string }[] }) {
  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="webcare-results">
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
          What happens when your website just works.
        </h2>

        <style>{`
          .wc-results-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 14px;
            text-align: left;
            margin-bottom: 32px;
          }
        `}</style>

        <div className="wc-results-grid">
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
          Pro costs $129/mo. One enquiry from a working website covers it.
        </p>
        <p style={{ fontSize: 14, color: mkt.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          A broken contact form, outdated hours, or slow homepage costs more than you think.
        </p>
      </div>
    </section>
  );
}

/* ---------- WebCare: Pricing Intro ---------- */
function WCPricingIntro() {
  return (
    <>
      <p
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: mkt.onDark,
          marginBottom: 6,
        }}
      >
        Simple pricing. No contracts. No surprises.
      </p>
      <p
        style={{
          fontSize: 15,
          color: mkt.onDarkMuted,
          maxWidth: 520,
          margin: "0 auto 32px",
          lineHeight: 1.6,
        }}
      >
        Pick the plan that fits. Scale up or cancel anytime — your website stays yours either way.
      </p>
    </>
  );
}

/* ---------- WebCare: Risk Reversal ---------- */
function WCRiskReversal() {
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
        No contracts · Cancel anytime · Your website stays yours · Fast support when you need changes
      </p>
    </div>
  );
}

/* ---------- QuoteQuick: Built For Trades ---------- */
function QQBuiltForSection({ trades }: { trades: string[] }) {
  return (
    <section style={{ background: mkt.bg, padding: "56px 28px" }} data-testid="qq-built-for">
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>Built for trades</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(22px, 2.8vw, 32px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 12,
          }}
        >
          Built for trades — not generic calculators.
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 16 }}>
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
        <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
          QuoteQuick uses real-world pricing logic for service businesses — not generic "price calculator" templates made for marketers.
        </p>
        <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text }}>
          Your customers want a price now. Not a callback later.
        </p>
      </div>
    </section>
  );
}

/* ---------- QuoteQuick: Problem Section ---------- */
function QQProblemSection() {
  const stats = [
    "The first business to respond usually wins",
    "Customers who don\u2019t get a price fast enough keep shopping",
    "Slow quoting creates lost leads, wasted traffic, and manual follow-up",
  ];

  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="qq-problem">
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
          Contact forms don't convert.
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
          A customer lands on your website.
          <br />They want a price.
          <br /><br />
          Instead, they see:
          <br /><strong style={{ color: mkt.text }}>"Fill out this form and we'll get back to you."</strong>
          <br /><br />
          They leave. They call the next business.
        </p>

        <style>{`
          .qq-stat-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 32px;
          }
          @media (max-width: 640px) {
            .qq-stat-row { grid-template-columns: 1fr; }
          }
        `}</style>

        <div className="qq-stat-row" data-reveal="fade-up">
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

        <p style={{ fontSize: 16, fontWeight: 600, color: mkt.text, lineHeight: 1.5 }}>
          You're not losing traffic.
          <br />You're losing customers who didn't get a price fast enough.
        </p>
        <p style={{ fontSize: 15, color: mkt.textMuted, marginTop: 16, lineHeight: 1.6 }}>
          Every day you wait is more missed leads — and more jobs going somewhere else.
        </p>
      </div>
    </section>
  );
}

/* ---------- QuoteQuick: Solution Section ---------- */
function QQSolutionSection() {
  const cards = [
    { icon: Zap, title: "Instant estimates", desc: "Customers get a price in seconds — 24/7." },
    { icon: UserCheck, title: "Lead capture", desc: "Every quote collects name, phone, email, and job details." },
    { icon: CalendarCheck, title: "Optional booking", desc: "Let customers book right after the estimate." },
    { icon: TrendingUp, title: "Upsells built in", desc: "Add optional upgrades and services inside the quote flow." },
  ];

  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="qq-solution">
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
          Let customers price their job instantly.
        </h2>
        <p style={{ fontSize: 16, color: mkt.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
          QuoteQuick turns your website into a self-serve quoting tool.
        </p>
        <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text, marginBottom: 40, lineHeight: 1.5 }}>
          More than a contact form. Less hassle than quoting software.
        </p>

        <style>{`
          .qq-solution-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 14px;
            text-align: left;
          }
          .qq-solution-card {
            background: ${mkt.surface};
            border: 1px solid ${mkt.border};
            border-radius: 14px;
            padding: 22px;
            transition: border-color 0.2s ease, transform 0.2s ease;
          }
          .qq-solution-card:hover {
            border-color: rgba(102,232,250,0.18);
            transform: translateY(-1px);
          }
        `}</style>

        <div className="qq-solution-grid">
          {cards.map((c, i) => (
            <div key={c.title} className="qq-solution-card" data-reveal="fade-up" data-delay={String(i * 60)}>
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
                  <c.icon size={18} color={mkt.accent} strokeWidth={2} />
                </div>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: mkt.text, marginBottom: 6 }}>
                {c.title}
              </h3>
              <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, margin: 0 }}>
                {c.desc}
              </p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 14, color: mkt.textMuted, marginTop: 28, lineHeight: 1.6 }}>
          You stay in control — QuoteQuick follows your pricing, your services, and your rules.
        </p>
      </div>
    </section>
  );
}

/* ---------- QuoteQuick: Live Demo Section ---------- */
const QQ_DEMO_CALCULATOR: CalculatorData = {
  id: 0,
  slug: "demo-plumbing",
  business_name: "Metro Plumbing Co.",
  tagline: "Fast & reliable plumbing quotes",
  primary_color: "#3B82F6",
  pricing_config: {
    pricingType: "base_plus_rate",
    unitName: "fixture",
    baseFee: 89,
    rate: 65,
    travelFee: 25,
    addOns: [
      { id: "emergency", label: "Emergency / Same-Day", type: "fixed" as const, amount: 75 },
      { id: "camera", label: "Camera Inspection", type: "fixed" as const, amount: 120 },
      { id: "warranty", label: "Extended Warranty (2yr)", type: "pct" as const, amount: 15 },
    ],
  },
  calculator_settings: {
    ui_template: { template_id: "multi_step_progressive" },
    calculator_type: "estimate_only",
    lead_form: { fields: { name: true, email: true, phone: true }, cta_text: "Get My Quote" },
  },
};

function QQDemoSection() {
  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="qq-demo">
      <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>Live preview</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(22px, 2.8vw, 32px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 32,
          }}
        >
          See how it works.
        </h2>
        <p style={{ fontSize: 15, color: mkt.textMuted, marginBottom: 32, marginTop: -16, lineHeight: 1.6 }}>
          This is exactly what your customer sees on your website.
        </p>

        {/* Live QuoteWidget demo */}
        <div
          style={{
            background: mkt.bg,
            border: `2px solid ${mkt.border}`,
            borderRadius: 18,
            padding: "24px 16px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse at 50% 0%, rgba(102,232,250,0.04) 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <QuoteWidget calculator={QQ_DEMO_CALCULATOR} />
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Link
            href="/demo"
            className="mkt-btn-ghost"
            style={{
              padding: "10px 22px",
              borderRadius: 9999,
              background: "transparent",
              color: mkt.text,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              border: `1.5px solid ${mkt.border}`,
            }}
          >
            Try more trades in the full demo
          </Link>
          <p style={{ fontSize: 13, color: mkt.textMuted, opacity: 0.7 }}>
            If a customer can use a contact form, they can use this.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------- QuoteQuick: Comparison Table ---------- */
function QQComparisonSection() {
  const rows = [
    { feature: "Instant pricing", qq: true, form: false, generic: true, fsm: "Sometimes" },
    { feature: "Trades-specific logic", qq: true, form: false, generic: false, fsm: true },
    { feature: "Embeddable", qq: true, form: true, generic: true, fsm: false },
    { feature: "Standalone tool", qq: true, form: true, generic: true, fsm: false },
    { feature: "Optional booking", qq: true, form: false, generic: "Sometimes", fsm: true },
    { feature: "Affordable", qq: true, form: true, generic: true, fsm: false },
  ];

  const renderCell = (val: boolean | string) =>
    val === true ? (
      <Check size={16} color={mkt.accent} strokeWidth={2.5} />
    ) : val === false ? (
      <span style={{ color: mkt.textMuted, fontSize: 16 }}>—</span>
    ) : (
      <span style={{ color: mkt.textMuted, fontSize: 13 }}>{String(val)}</span>
    );

  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="qq-comparison">
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>Why QuoteQuick</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(22px, 2.8vw, 32px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 12,
          }}
        >
          Why QuoteQuick is different.
        </h2>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 32 }}>
          Most tools force you to choose between cheap and generic — or powerful and expensive.
          QuoteQuick gives you both speed and trade-specific logic.
        </p>

        <div
          style={{
            background: mkt.bg,
            border: `1px solid ${mkt.border}`,
            borderRadius: 14,
            overflow: "auto",
          }}
        >
          <style>{`
            .qq-compare-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 520px; }
            .qq-compare-table th, .qq-compare-table td { padding: 12px 14px; }
          `}</style>
          <table className="qq-compare-table">
            <thead>
              <tr style={{ borderBottom: `1px solid ${mkt.border}` }}>
                <th style={{ textAlign: "left", fontWeight: 600, color: mkt.textMuted }}></th>
                <th style={{ textAlign: "center", fontWeight: 700, color: mkt.accent }}>QuoteQuick</th>
                <th style={{ textAlign: "center", fontWeight: 600, color: mkt.textMuted }}>Contact Form</th>
                <th style={{ textAlign: "center", fontWeight: 600, color: mkt.textMuted }}>Generic Calc</th>
                <th style={{ textAlign: "center", fontWeight: 600, color: mkt.textMuted }}>FSM Software</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} style={{ borderBottom: `1px solid ${mkt.border}` }}>
                  <td style={{ color: mkt.text, fontWeight: 500 }}>{row.feature}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.qq)}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.form)}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.generic)}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.fsm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: 14, fontWeight: 600, color: mkt.text, marginTop: 24, lineHeight: 1.5 }}>
          If your website still makes people wait for a callback, you're losing leads you already paid to get.
        </p>
      </div>
    </section>
  );
}

/* ---------- QuoteQuick: Results Section ---------- */
function QQResultsSection({ outcomes }: { outcomes: { title: string; desc: string }[] }) {
  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="qq-results">
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
          What changes when you add instant pricing.
        </h2>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 0 }}>
          What QuoteQuick is designed to help you achieve:
        </p>

        <style>{`
          .qq-results-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 14px;
            text-align: left;
          }
        `}</style>

        <div className="qq-results-grid">
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

        <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text, marginTop: 28 }}>
          One extra booked job can cover your month. Everything after that is upside.
        </p>
      </div>
    </section>
  );
}

/* ---------- QuoteQuick: Pricing Intro ---------- */
function QQPricingIntro() {
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
        Simple, transparent pricing.
      </h2>
      <p
        style={{
          fontSize: 15,
          color: mkt.onDarkFaint,
          maxWidth: 480,
          margin: "0 auto",
          lineHeight: 1.6,
        }}
      >
        Start free. Upgrade when you're ready.
      </p>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: mkt.onDarkMuted,
          marginTop: 12,
        }}
      >
        Start with the plan that fits your business now. Upgrade anytime later.
      </p>
    </>
  );
}

/* ---------- QuoteQuick: Risk Reversal ---------- */
function QQRiskReversal() {
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

/* ---------- ReputationShield: Problem Section ---------- */
function RSProblemSection() {
  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="rs-problem">
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
          Most customers won't leave a review — unless you ask.
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
          You finish a job. Customer is happy. They say "thanks."
          <br /><br />
          But they never leave a review.
          <br /><br />
          Meanwhile, your competitor has 80+ reviews and shows up above you.
        </p>
        <p style={{ fontSize: 17, fontWeight: 600, color: mkt.text, lineHeight: 1.5 }}>
          Better reputation = more calls. It's that simple.
        </p>
        <p style={{ fontSize: 15, color: mkt.textMuted, marginTop: 16, lineHeight: 1.6 }}>
          Every happy customer who leaves without reviewing is a missed chance to strengthen your reputation.
        </p>
      </div>
    </section>
  );
}

/* ---------- ReputationShield: What We Do ---------- */
function RSWhatWeDoSection() {
  const blocks = [
    {
      icon: Send,
      label: "Get more reviews",
      items: [
        "Automatic SMS/email requests",
        "Sent at the right moment",
        "No manual follow-up needed",
      ],
    },
    {
      icon: MessageCircle,
      label: "Respond to every review",
      items: [
        "We write and post responses for you",
        "Positive or negative \u2014 handled professionally",
        "You don\u2019t have to touch a thing",
      ],
    },
    {
      icon: ShieldCheck,
      label: "Protect your reputation",
      items: [
        "Catch issues early",
        "Improve customer experience",
        "Prevent bad reviews before they happen",
      ],
    },
  ];

  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="rs-whatwedo">
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>What we do</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 40,
          }}
        >
          We handle your reviews — start to finish.
        </h2>

        <style>{`
          .rs-whatwedo-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
            text-align: left;
          }
          .rs-whatwedo-card {
            background: ${mkt.surface};
            border: 1px solid ${mkt.border};
            border-radius: 14px;
            padding: 24px;
            transition: border-color 0.2s ease, transform 0.2s ease;
          }
          .rs-whatwedo-card:hover {
            border-color: rgba(102,232,250,0.18);
            transform: translateY(-1px);
          }
          @media (max-width: 768px) {
            .rs-whatwedo-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div className="rs-whatwedo-grid">
          {blocks.map((b, i) => (
            <div key={b.label} className="rs-whatwedo-card" data-reveal="fade-up" data-delay={String(i * 80)}>
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: mkt.accentTint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <b.icon size={20} color={mkt.accent} strokeWidth={2} />
                </div>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: mkt.accent, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {b.label}
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {b.items.map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: mkt.textMuted, lineHeight: 1.5 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: mkt.accent, flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- ReputationShield: Comparison ---------- */
function RSComparisonSection() {
  const rows = [
    { feature: "We do the work", rs: true, tools: false },
    { feature: "Responses written for you", rs: true, tools: false },
    { feature: "No setup or learning", rs: true, tools: false },
    { feature: "Works after every job", rs: true, tools: "You configure" },
    { feature: "Built for trades", rs: true, tools: false },
  ];

  const renderCell = (val: boolean | string) =>
    val === true ? (
      <Check size={16} color={mkt.accent} strokeWidth={2.5} />
    ) : val === false ? (
      <span style={{ color: mkt.textMuted, fontSize: 16 }}>\u2014</span>
    ) : (
      <span style={{ color: mkt.textMuted, fontSize: 13 }}>{String(val)}</span>
    );

  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="rs-comparison">
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>The difference</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(22px, 2.8vw, 32px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 12,
          }}
        >
          This isn't another dashboard you have to manage.
        </h2>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 32 }}>
          Most review tools still expect you to do the work. ReputationShield is a service — we handle it for you.
        </p>
        <p style={{ fontSize: 14, fontWeight: 600, color: mkt.text, marginBottom: 32, marginTop: -16, lineHeight: 1.5 }}>
          Most review tools give you another dashboard to manage. ReputationShield gives you results without extra work.
        </p>

        <div
          style={{
            background: mkt.bg,
            border: `1px solid ${mkt.border}`,
            borderRadius: 14,
            overflow: "auto",
          }}
        >
          <style>{`
            .rs-compare-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 380px; }
            .rs-compare-table th, .rs-compare-table td { padding: 12px 16px; }
          `}</style>
          <table className="rs-compare-table">
            <thead>
              <tr style={{ borderBottom: `1px solid ${mkt.border}` }}>
                <th style={{ textAlign: "left", fontWeight: 600, color: mkt.textMuted }}></th>
                <th style={{ textAlign: "center", fontWeight: 700, color: mkt.accent }}>ReputationShield</th>
                <th style={{ textAlign: "center", fontWeight: 600, color: mkt.textMuted }}>Typical Tools</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} style={{ borderBottom: `1px solid ${mkt.border}` }}>
                  <td style={{ color: mkt.text, fontWeight: 500 }}>{row.feature}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.rs)}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.tools)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- ReputationShield: Results ---------- */
function RSResultsSection({ outcomes }: { outcomes: { title: string; desc: string }[] }) {
  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="rs-results">
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
          What happens when your reputation improves.
        </h2>

        <style>{`
          .rs-results-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
            text-align: left;
            margin-bottom: 28px;
          }
          @media (max-width: 640px) {
            .rs-results-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div className="rs-results-grid">
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
          A few extra jobs per month can easily cover the cost.
        </p>
        <p style={{ fontSize: 14, color: mkt.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          More strong reviews help you stand out in Google before customers ever call.
        </p>
      </div>
    </section>
  );
}

/* ---------- ReputationShield: Pricing Intro ---------- */
function RSPricingIntro() {
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
        Simple monthly pricing.
      </h2>
      <p
        style={{
          fontSize: 15,
          color: mkt.onDarkFaint,
          maxWidth: 480,
          margin: "0 auto",
          lineHeight: 1.6,
        }}
      >
        No contracts. Cancel anytime. No hidden fees.
      </p>
    </>
  );
}

/* ---------- ReputationShield: Risk Reversal ---------- */
function RSRiskReversal() {
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
        No contracts \u00B7 Cancel anytime \u00B7 No setup fees \u00B7 We handle everything
      </p>
    </div>
  );
}

/* ---------- SocialSync: Problem Section ---------- */
function SSProblemSection() {
  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="ss-problem">
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
          Most trades businesses go silent online.
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
          You finish jobs every day.
          <br /><br />
          But your social media? Empty. Outdated. Forgotten.
          <br /><br />
          Customers check your profile before calling — and see nothing.
          <br /><br />
          Meanwhile, your competitors look active and trusted.
        </p>
        <p style={{ fontSize: 17, fontWeight: 600, color: mkt.text, lineHeight: 1.5 }}>
          No activity = lost trust = fewer calls.
        </p>
      </div>
    </section>
  );
}

/* ---------- SocialSync: What We Do ---------- */
function SSWhatWeDoSection() {
  const blocks = [
    {
      icon: PenTool,
      label: "Create",
      desc: "We turn your services and job work into clean, professional posts.",
    },
    {
      icon: Share2,
      label: "Post",
      desc: "We publish consistently across Facebook, Instagram, and Google.",
    },
    {
      icon: Eye,
      label: "Keep you active",
      desc: "Your business always looks current, busy, and trusted.",
    },
  ];

  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="ss-whatwedo">
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>What we do</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 40,
          }}
        >
          We handle your content — start to finish.
        </h2>

        <style>{`
          .ss-whatwedo-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
            text-align: left;
          }
          .ss-whatwedo-card {
            background: ${mkt.surface};
            border: 1px solid ${mkt.border};
            border-radius: 14px;
            padding: 24px;
            transition: border-color 0.2s ease, transform 0.2s ease;
          }
          .ss-whatwedo-card:hover {
            border-color: rgba(102,232,250,0.18);
            transform: translateY(-1px);
          }
          @media (max-width: 768px) {
            .ss-whatwedo-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div className="ss-whatwedo-grid">
          {blocks.map((b, i) => (
            <div key={b.label} className="ss-whatwedo-card" data-reveal="fade-up" data-delay={String(i * 80)}>
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: mkt.accentTint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <b.icon size={20} color={mkt.accent} strokeWidth={2} />
                </div>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: mkt.accent, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {b.label}
              </h3>
              <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, margin: 0 }}>
                {b.desc}
              </p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 14, color: mkt.textMuted, marginTop: 24, lineHeight: 1.6 }}>
          You don't need to log in, write posts, or manage anything.
        </p>
      </div>
    </section>
  );
}

/* ---------- SocialSync: Comparison ---------- */
function SSComparisonSection() {
  const rows = [
    { feature: "We do the posting", ss: true, others: false },
    { feature: "No dashboard to manage", ss: true, others: false },
    { feature: "No learning curve", ss: true, others: false },
    { feature: "Affordable monthly pricing", ss: true, others: "Often $750+/mo" },
    { feature: "Consistent weekly posts", ss: true, others: "If you remember" },
    { feature: "Built for trades", ss: true, others: false },
  ];

  const renderCell = (val: boolean | string) =>
    val === true ? (
      <Check size={16} color={mkt.accent} strokeWidth={2.5} />
    ) : val === false ? (
      <span style={{ color: mkt.textMuted, fontSize: 16 }}>\u2014</span>
    ) : (
      <span style={{ color: mkt.textMuted, fontSize: 13 }}>{String(val)}</span>
    );

  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="ss-comparison">
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>The difference</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(22px, 2.8vw, 32px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 12,
          }}
        >
          Not another social media tool or expensive agency.
        </h2>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 32 }}>
          SocialSync is a service — we create and post content for you at a price that makes sense.
        </p>

        <div style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 14, overflow: "auto" }}>
          <style>{`
            .ss-compare-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 380px; }
            .ss-compare-table th, .ss-compare-table td { padding: 12px 16px; }
          `}</style>
          <table className="ss-compare-table">
            <thead>
              <tr style={{ borderBottom: `1px solid ${mkt.border}` }}>
                <th style={{ textAlign: "left", fontWeight: 600, color: mkt.textMuted }}></th>
                <th style={{ textAlign: "center", fontWeight: 700, color: mkt.accent }}>SocialSync</th>
                <th style={{ textAlign: "center", fontWeight: 600, color: mkt.textMuted }}>Agencies / Tools</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} style={{ borderBottom: `1px solid ${mkt.border}` }}>
                  <td style={{ color: mkt.text, fontWeight: 500 }}>{row.feature}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.ss)}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.others)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- SocialSync: Results ---------- */
function SSResultsSection({ outcomes }: { outcomes: { title: string; desc: string }[] }) {
  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="ss-results">
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
          What happens when you stay active.
        </h2>

        <style>{`
          .ss-results-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
            text-align: left;
            margin-bottom: 28px;
          }
          @media (max-width: 640px) {
            .ss-results-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div className="ss-results-grid">
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
          A few extra jobs per month can easily cover the cost.
        </p>
      </div>
    </section>
  );
}

/* ---------- SocialSync: Pricing Intro ---------- */
function SSPricingIntro() {
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
        Simple monthly plans.
      </h2>
      <p
        style={{
          fontSize: 15,
          color: mkt.onDarkFaint,
          maxWidth: 480,
          margin: "0 auto",
          lineHeight: 1.6,
        }}
      >
        No contracts. Cancel anytime. No hidden fees.
      </p>
    </>
  );
}

/* ---------- SocialSync: Risk Reversal ---------- */
function SSRiskReversal() {
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
        No contracts \u00B7 Cancel anytime \u00B7 We handle everything \u00B7 Posts go out every week
      </p>
    </div>
  );
}

/* ---------- SiteLaunch: Problem Section ---------- */
function SLProblemSection() {
  const painPoints = [
    "DIY builders look cheap — and they take hours you don't have",
    "Agencies charge thousands and take months to deliver",
    "Most websites have a contact form and nothing else",
  ];

  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="sl-problem">
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
          Your website should bring in jobs. Most don't.
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
          You're busy running jobs. You don't have time to learn WordPress or wait 3 months for an agency to build something you can't even edit.
          <br /><br />
          Meanwhile, customers Google your trade, land on your website, see something that looks like it was built in 2015 — and call the next person instead.
          <br /><br />
          A website that doesn't convert visitors into calls is costing you money every single day.
        </p>

        <style>{`
          .sl-pain-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 32px;
          }
          @media (max-width: 640px) {
            .sl-pain-row { grid-template-columns: 1fr; }
          }
        `}</style>

        <div className="sl-pain-row" data-reveal="fade-up">
          {painPoints.map((point) => (
            <div
              key={point}
              style={{
                background: mkt.bg,
                border: `1px solid ${mkt.border}`,
                borderRadius: 14,
                padding: "20px 16px",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: mkt.textMuted, lineHeight: 1.5 }}>
                {point}
              </span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 17, fontWeight: 600, color: mkt.text, lineHeight: 1.5 }}>
          You don't need a fancier template. You need a website that actually works.
        </p>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, marginTop: 16 }}>
          One that loads fast, looks professional, and turns visitors into real enquiries — without you lifting a finger.
        </p>
      </div>
    </section>
  );
}

/* ---------- SiteLaunch: Differentiation Section ---------- */
function SLDifferentiationSection() {
  const points = [
    { icon: Zap, title: "5-day delivery", desc: "Not 10 weeks. Not 16 weeks. Your website is designed, built, and live in 5 business days." },
    { icon: ShieldCheck, title: "You own the website", desc: "No proprietary platforms. No agency lock-in. The site is yours — take it anywhere." },
    { icon: UserCheck, title: "One-time build", desc: "Pay once. No monthly retainers, no hidden agency fees. Optional support if you want it." },
    { icon: TrendingUp, title: "Lead capture ready", desc: "Contact forms plus optional QuoteQuick calculator — so visitors become enquiries, not bounces." },
  ];

  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="sl-differentiation">
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>Why SiteLaunch</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 8,
          }}
        >
          Not a DIY builder.{" "}
          <span style={{ color: mkt.accent }}>Not an overpriced agency.</span>
        </h2>
        <p style={{ fontSize: 16, color: mkt.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
          SiteLaunch is a done-for-you website, built specifically for trades businesses.
        </p>
        <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text, marginBottom: 40, lineHeight: 1.5 }}>
          Fast. Affordable. Yours to keep.
        </p>

        <style>{`
          .sl-diff-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 14px;
            text-align: left;
          }
          .sl-diff-card {
            background: ${mkt.surface};
            border: 1px solid ${mkt.border};
            border-radius: 14px;
            padding: 22px;
            transition: border-color 0.2s ease, transform 0.2s ease;
          }
          .sl-diff-card:hover {
            border-color: rgba(102,232,250,0.18);
            transform: translateY(-1px);
          }
        `}</style>

        <div className="sl-diff-grid">
          {points.map((pt, i) => (
            <div key={pt.title} className="sl-diff-card" data-reveal="fade-up" data-delay={String(i * 60)}>
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
                  <pt.icon size={18} color={mkt.accent} strokeWidth={2} />
                </div>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: mkt.text, marginBottom: 6 }}>
                {pt.title}
              </h3>
              <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, margin: 0 }}>
                {pt.desc}
              </p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 14, color: mkt.textMuted, marginTop: 28, lineHeight: 1.6 }}>
          Built for trades. Not restaurants. Not e-commerce. Not generic "local businesses."
        </p>
      </div>
    </section>
  );
}

/* ---------- SiteLaunch: Comparison Section ---------- */
function SLComparisonSection() {
  const rows: { feature: string; sl: string | boolean; diy: string | boolean; agency: string | boolean }[] = [
    { feature: "Time to launch", sl: "5 business days", diy: "Weeks (you build it)", agency: "10\u201316 weeks" },
    { feature: "Upfront cost", sl: "One-time fee", diy: "$0", agency: "$3,000\u2013$10,000+" },
    { feature: "Ongoing cost", sl: "None required", diy: "$12\u201330/mo", agency: "$500\u2013$3,000+/mo" },
    { feature: "You own the site", sl: true, diy: "Platform-dependent", agency: "Often not" },
    { feature: "Lead capture built in", sl: "Forms + QuoteQuick", diy: "Basic forms only", agency: "Varies" },
    { feature: "Work required from you", sl: "15 min onboarding", diy: "Hours of your time", agency: "Weeks of meetings" },
    { feature: "Contract required", sl: "None", diy: "Monthly subscription", agency: "6\u201312 month contracts" },
  ];

  return (
    <section style={{ background: mkt.surface, padding: "72px 28px" }} data-testid="sl-comparison">
      <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>How it compares</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 12,
          }}
        >
          SiteLaunch vs DIY builders vs agencies
        </h2>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 36 }}>
          There are two options out there: build it yourself for cheap, or pay an agency a fortune. SiteLaunch is the middle ground that didn't exist before.
        </p>

        <div
          style={{
            background: mkt.bg,
            border: `1px solid ${mkt.border}`,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <style>{`
            @media (max-width: 640px) {
              .sl-comp-table { font-size: 12px !important; }
              .sl-comp-table th, .sl-comp-table td { padding: 10px 8px !important; }
            }
          `}</style>
          <table className="sl-comp-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${mkt.border}` }}>
                <th style={{ padding: "14px 16px", textAlign: "left", fontWeight: 600, color: mkt.textMuted }}></th>
                <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 700, color: mkt.accent }}>SiteLaunch</th>
                <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, color: mkt.textMuted }}>DIY Builder</th>
                <th style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, color: mkt.textMuted }}>Agency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} style={{ borderBottom: `1px solid ${mkt.border}` }}>
                  <td style={{ padding: "12px 16px", color: mkt.text, fontWeight: 500 }}>{row.feature}</td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    {row.sl === true ? (
                      <Check size={16} color={mkt.accent} strokeWidth={2.5} />
                    ) : (
                      <span style={{ color: mkt.accent, fontWeight: 600, fontSize: 13 }}>{row.sl}</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    {row.diy === false ? (
                      <span style={{ color: mkt.textMuted, fontSize: 16 }}>&mdash;</span>
                    ) : (
                      <span style={{ color: mkt.textMuted, fontSize: 13 }}>{String(row.diy)}</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    {row.agency === false ? (
                      <span style={{ color: mkt.textMuted, fontSize: 16 }}>&mdash;</span>
                    ) : (
                      <span style={{ color: mkt.textMuted, fontSize: 13 }}>{String(row.agency)}</span>
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

/* ---------- SiteLaunch: Built For Trades ---------- */
function SLBuiltForSection({ trades }: { trades: string[] }) {
  return (
    <section style={{ background: mkt.bg, padding: "56px 28px" }} data-testid="sl-built-for">
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>Built for trades</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(22px, 2.8vw, 32px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 12,
          }}
        >
          Built for trades — not generic "local businesses."
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 16 }}>
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
        <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
          Every SiteLaunch website is structured for how trades businesses actually get customers — service pages, areas served, clear calls to action, and lead capture that works.
        </p>
        <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text }}>
          Not restaurants. Not e-commerce. Not generic brand sites.
        </p>
      </div>
    </section>
  );
}

/* ---------- SiteLaunch: Results Section ---------- */
function SLResultsSection({ outcomes }: { outcomes: { title: string; desc: string }[] }) {
  return (
    <section style={{ background: mkt.bg, padding: "72px 28px" }} data-testid="sl-results">
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
          A website that pays for itself.
        </h2>
        <p style={{ fontSize: 15, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 0 }}>
          What SiteLaunch is designed to help you achieve:
        </p>

        <style>{`
          .sl-results-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 14px;
            text-align: left;
            margin-bottom: 32px;
          }
        `}</style>

        <div className="sl-results-grid">
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
          SiteLaunch costs less than most agencies charge for a single meeting.
        </p>
        <p style={{ fontSize: 14, color: mkt.textMuted, marginTop: 8, lineHeight: 1.5 }}>
          One extra job from your new website covers the entire build.
        </p>
      </div>
    </section>
  );
}

/* ---------- SiteLaunch: Pricing Intro ---------- */
function SLPricingIntro() {
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
        One price. No surprises. No contracts.
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
        One-time build fee. You own the website. Optional monthly maintenance if you want hands-off support — cancel anytime.
      </p>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: mkt.onDarkMuted,
          marginTop: 12,
        }}
      >
        No hidden agency retainers. No long-term contracts. No platform lock-in.
      </p>
    </>
  );
}

/* ---------- SiteLaunch: Risk Reversal ---------- */
function SLRiskReversal() {
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
        You own the website &middot; No contracts &middot; 14-day free trial of TradeLine + QuoteQuick included &middot; Live in 5 days
      </p>
    </div>
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
  const isQuoteQuick = product.slug === "quickquotepro";
  const isReputationShield = product.slug === "reputationshield";
  const isSocialSync = product.slug === "socialsync";
  const isSiteLaunch = product.slug === "sitelaunch";
  const isWebCare = product.slug === "webcare";
  const hasCustomHero = isTradeLine || isQuoteQuick || isReputationShield || isSocialSync || isSiteLaunch || isWebCare;

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

          {hasCustomHero ? (
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
                {isTradeLine ? (
                  <>Never Miss a Call Again —{" "}<span style={{ color: mkt.accent }}>Or Lose Another Job to a Competitor</span></>
                ) : isQuoteQuick ? (
                  <>Stop Losing Leads to a{" "}<span style={{ color: mkt.accent }}>Contact Form.</span></>
                ) : isReputationShield ? (
                  <>Get More 5-Star Reviews —{" "}<span style={{ color: mkt.accent }}>Without Lifting a Finger</span></>
                ) : isSiteLaunch ? (
                  <>Get a Trade Website That Brings You Jobs —{" "}<span style={{ color: mkt.accent }}>Live in 5 Days</span></>
                ) : isWebCare ? (
                  <>We Take Care of Your Website —{" "}<span style={{ color: mkt.accent }}>So You Can Focus on the Job</span></>

                ) : (
                  <>Stay Active Online —{" "}<span style={{ color: mkt.accent }}>Without Doing It Yourself</span></>
                )}
              </h1>
              <p
                className="hero-enter"
                data-testid="product-tagline"
                style={{
                  fontSize: "clamp(15px, 1.8vw, 18px)",
                  color: mkt.textMuted,
                  lineHeight: 1.65,
                  maxWidth: 560,
                  margin: "0 auto 32px",
                  fontFamily: typography.fontFamily,
                }}
              >
                {isTradeLine ? (
                  <>
                    AI that answers your calls and chats 24/7 — so you can stay on the tools.
                    <br />
                    <span style={{ fontSize: "clamp(13px, 1.5vw, 15px)", opacity: 0.75 }}>
                      Think of it as a 24/7 receptionist that never misses a call.
                    </span>
                  </>
                ) : isQuoteQuick ? (
                  "Give customers an instant price on your website using your real service rates \u2014 and capture every lead automatically. No callbacks. No quoting delays."
                ) : isReputationShield ? (
                  "ReputationShield sends review requests, responds to every review, and builds your reputation automatically \u2014 so customers trust you before they even call."
                ) : isSiteLaunch ? (
                  "We build your website from scratch \u2014 custom designed, mobile-first, SEO-ready, with lead capture built in. One-time fee. No contracts. You own the site."
                ) : isWebCare ? (
                  "Your website stays updated, secure, and working. No tech headaches. No contracts. Just reliable maintenance \u2014 built for trades businesses."
                ) : (
                  "SocialSync creates and posts content for your business across Facebook, Instagram, and Google \u2014 so you stay visible, trusted, and top of mind without lifting a finger."
                )}
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

          {isQuoteQuick && (
            <p
              className="hero-enter"
              style={{
                fontSize: 13,
                color: mkt.textMuted,
                marginTop: 16,
                opacity: 0.7,
              }}
            >
              No coding required &bull; Works on any website &bull; Cancel anytime
            </p>
          )}

          {hasCustomHero && (
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
              {(isSocialSync ? [
                "Built for trades businesses",
                "Done-for-you posting",
                "No contracts",
                "We post for you every week",
              ] : isReputationShield ? [
                "Built for trades businesses",
                "Done-for-you (we handle everything)",
                "No contracts",
                "Works automatically after every job",
              ] : isQuoteQuick ? [
                "Built for trades businesses",
                "Works on WordPress, Wix, Squarespace, Webflow, or plain HTML",
                "No developer needed",
                "Live in under 15 minutes",
                "Standalone tool \u2014 no bloated software required",
              ] : isSiteLaunch ? [
                "Built for trades businesses",
                "Live in 5 business days",
                "You own the website",
                "No contracts",
                "Optional ongoing support",
              ] : isWebCare ? [
                "Built for trades businesses",
                "We handle all updates",
                "No contracts",
                "Fast support when you need changes",
                "You keep full ownership of your site",
              ] : [
                "Built for trades businesses",
                "Works while you\u2019re on the job",
                "24/7 lead capture",
                "No contracts \u00B7 Cancel anytime",
              ]).map((item) => (
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

        {/* ── QuoteQuick: Built For + Problem + Solution + Demo (between hero and capabilities) ── */}
        {isQuoteQuick && (
          <>
            <QQBuiltForSection trades={product.bestFor} />
            <QQProblemSection />
            <QQSolutionSection />
          </>
        )}

        {/* ── ReputationShield: Problem + What We Do (between hero and capabilities) ── */}
        {isReputationShield && (
          <>
            <RSProblemSection />
            <RSWhatWeDoSection />
          </>
        )}

        {/* ── SocialSync: Problem + What We Do (between hero and capabilities) ── */}
        {isSocialSync && (
          <>
            <SSProblemSection />
            <SSWhatWeDoSection />
          </>
        )}

        {/* ── SiteLaunch: Built For + Problem + Differentiation (between hero and capabilities) ── */}
        {isSiteLaunch && (
          <>
            <SLBuiltForSection trades={product.bestFor} />
            <SLProblemSection />
            <SLDifferentiationSection />
          </>
        )}

        {/* ── WebCare: Built For + Problem + What We Do (between hero and capabilities) ── */}
        {isWebCare && (
          <>
            <WCBuiltForSection trades={product.bestFor} />
            <WCProblemSection />
            <WCWhatWeDoSection />
          </>
        )}

        {/* ── §2 CAPABILITIES / BENEFITS ── */}
        <CapabilitiesGrid
          items={product.highlights}
          sectionId={isSiteLaunch ? "sitelaunch-included" : undefined}
          heading={
            isQuoteQuick ? "Everything you need to capture more leads" :
            isReputationShield ? "What this actually does for your business" :
            isSocialSync ? "What this actually does for your business" :
            isSiteLaunch ? "What\u2019s included in every SiteLaunch build" :
            isWebCare ? "What's included in your plan" :
            undefined
          }
        />

        {/* ── §3 HOW IT WORKS ── */}
        <StepTimeline steps={product.howItWorks} heading={isQuoteQuick ? "Set it up once. Let it work every day." : isSiteLaunch ? "Three steps. Five days. Done." : isWebCare ? "Simple setup. Ongoing care." : undefined} />

        {isTradeLine && (
          <div style={{ background: mkt.surface, textAlign: "center", padding: "0 28px 48px" }} data-reveal="fade-up">
            <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text, maxWidth: 560, margin: "0 auto", lineHeight: 1.5 }}>
              Within minutes, your next missed call is answered automatically — and turned into a lead.
            </p>
          </div>
        )}

        {isQuoteQuick && (
          <div style={{ background: mkt.surface, textAlign: "center", padding: "0 28px 48px" }} data-reveal="fade-up">
            <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text, maxWidth: 560, margin: "0 auto", lineHeight: 1.5 }}>
              Most businesses are live in under 15 minutes.
            </p>
            <p style={{ fontSize: 14, color: mkt.textMuted, maxWidth: 560, margin: "12px auto 0", lineHeight: 1.5 }}>
              Your next website visitor can become your next quote request — without waiting for a callback.
            </p>
          </div>
        )}

        {isSiteLaunch && (
          <div style={{ background: mkt.surface, textAlign: "center", padding: "0 28px 48px" }} data-reveal="fade-up">
            <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text, maxWidth: 560, margin: "0 auto", lineHeight: 1.5 }}>
              No long agency timelines. No weekends spent dragging boxes around a template. We handle the build — you keep running your business.
            </p>
          </div>
        )}

        {/* ── TradeLine: Multi-channel Comparison (after how-it-works) ── */}
        {isTradeLine && <TradeLineComparisonSection />}

        {/* ── TradeLine: Voicemail objection (after comparison) ── */}
        {isTradeLine && <TradeLineVoicemailSection />}

        {/* ── QuoteQuick: Demo + Comparison (after how-it-works) ── */}
        {isQuoteQuick && (
          <>
            <QQDemoSection />
            <QQComparisonSection />
          </>
        )}

        {/* ── ReputationShield: Comparison (after how-it-works) ── */}
        {isReputationShield && <RSComparisonSection />}

        {/* ── SocialSync: Comparison (after how-it-works) ── */}
        {isSocialSync && <SSComparisonSection />}

        {/* ── SiteLaunch: Comparison (after how-it-works) ── */}
        {isSiteLaunch && <SLComparisonSection />}
        {/* ── WebCare: Comparison (after how-it-works) ── */}
        {isWebCare && <WCComparisonSection />}

        {/* ── §4 SOCIAL PROOF ── */}
        <SurfaceSection overlap className="py-4">
          <ReviewsSection />
        </SurfaceSection>

        {/* ── TradeLine: Results / Proof (after reviews, before pricing) ── */}
        {isTradeLine && <TradeLineResultsSection outcomes={product.outcomes} />}

        {/* ── QuoteQuick: Results (after reviews, before pricing) ── */}
        {isQuoteQuick && <QQResultsSection outcomes={product.outcomes} />}

        {/* ── ReputationShield: Results (after reviews, before pricing) ── */}
        {isReputationShield && <RSResultsSection outcomes={product.outcomes} />}

        {/* ── SocialSync: Results (after reviews, before pricing) ── */}
        {isSocialSync && <SSResultsSection outcomes={product.outcomes} />}

        {/* ── SiteLaunch: Results (after reviews, before pricing) ── */}
        {isSiteLaunch && <SLResultsSection outcomes={product.outcomes} />}
        {/* ── WebCare: Results (after reviews, before pricing) ── */}
        {isWebCare && <WCResultsSection outcomes={product.outcomes} />}

        {/* ── §5 PRICING (MANDATORY) ── */}
        <PricingSection
          product={product}
          pricingIntro={
            isTradeLine ? <TradeLinePricingIntro /> :
            isQuoteQuick ? <QQPricingIntro /> :
            isReputationShield ? <RSPricingIntro /> :
            isSocialSync ? <SSPricingIntro /> :
            isSiteLaunch ? <SLPricingIntro /> :
            isWebCare ? <WCPricingIntro /> :
            undefined
          }
        />

        {/* ── TradeLine: Risk Reversal (below pricing) ── */}
        {isTradeLine && <TradeLineRiskReversal />}

        {/* ── QuoteQuick: Risk Reversal (below pricing) ── */}
        {isQuoteQuick && <QQRiskReversal />}

        {/* ── ReputationShield: Risk Reversal (below pricing) ── */}
        {isReputationShield && <RSRiskReversal />}

        {/* ── SocialSync: Risk Reversal (below pricing) ── */}
        {isSocialSync && <SSRiskReversal />}

        {/* ── SiteLaunch: Risk Reversal (below pricing) ── */}
        {isSiteLaunch && <SLRiskReversal />}
        {/* ── WebCare: Risk Reversal (below pricing) ── */}
        {isWebCare && <WCRiskReversal />}

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
        ) : isQuoteQuick ? (
          <CTASection
            heading="Stop losing leads to slow quotes."
            subtext="Give your customers instant pricing — and turn more website visitors into real quote requests."
            ctaLabel="Start Your Free Trial"
            ctaHref="/Wizard"
          />
        ) : isReputationShield ? (
          <CTASection
            heading="Start building your reputation today."
            subtext="More reviews. Better rating. More calls. Start now and turn completed jobs into more trust, more reviews, and more calls."
            ctaLabel="Start ReputationShield"
            ctaHref="/Wizard"
          />
        ) : isSocialSync ? (
          <CTASection
            heading="Stay active without doing the work."
            subtext="Keep your business visible, trusted, and growing."
            ctaLabel="Start SocialSync"
            ctaHref="/Wizard"
          />
        ) : isSiteLaunch ? (
          <CTASection
            heading="Get your new website live in 5 days."
            subtext="Custom built for your trade. You own it. No contracts. One extra job covers the cost."
            ctaLabel="Get Your Website Built"
            ctaHref="/Wizard"
          />
        ) : isWebCare ? (
          <CTASection
            heading="Stop worrying about your website."
            subtext="Let us handle the upkeep — so you can stay focused on the work that matters. No contracts. No tech headaches. Just reliable maintenance built for trades."
            ctaLabel="Get Started with WebCare"
            ctaHref="/Wizard"
          />
        ) : (
          <CTASection />
        )}

      </div>
    </MarketingLayout>
  );
}
