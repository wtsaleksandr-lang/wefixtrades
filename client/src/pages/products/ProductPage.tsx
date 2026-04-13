import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Check, ChevronDown, ArrowRight, Phone, MessageSquare, MessagesSquare, RotateCcw, Star, Zap, UserCheck, CalendarCheck, TrendingUp, X as XIcon, Send, ShieldCheck, Shield, MessageCircle, PenTool, Share2, Eye, ImageIcon, Info } from "lucide-react";
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
        background: `linear-gradient(180deg, ${mkt.sectionLighter} 0%, ${mkt.sectionLight} 100%)`,
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="tradeline-problem">
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
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="tradeline-solution">
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="tradeline-comparison">
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
    <section style={{ background: mkt.sectionLight, padding: "64px 28px" }} data-testid="tradeline-voicemail">
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
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="tradeline-results">
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
    <section style={{ background: mkt.sectionLight, padding: "56px 28px" }} data-testid="tradeline-built-for">
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
    <section style={{ background: mkt.sectionLight, padding: "56px 28px" }} data-testid="webcare-built-for">
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="webcare-problem">
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
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="webcare-whatwedo">
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="webcare-comparison">
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
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="webcare-results">
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
    <section style={{ background: mkt.sectionLight, padding: "56px 28px" }} data-testid="qq-built-for">
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="qq-problem">
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
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="qq-solution">
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
    serviceTypes: [
      { value: "drain_cleaning", label: "Drain cleaning" },
      { value: "leak_repair", label: "Leak repair" },
      { value: "toilet_install", label: "Toilet installation" },
      { value: "water_heater", label: "Water heater service" },
    ],
  },
};

function QQDemoSection() {
  return (
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="qq-demo">
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="qq-comparison">
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
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="qq-results">
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="rs-problem">
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
      label: "Collect reviews automatically",
      items: [
        "SMS + email requests sent after every completed job",
        "Smart follow-up reminders if customers forget",
        "QR codes for field techs to collect reviews in person",
      ],
    },
    {
      icon: MessageCircle,
      label: "Respond with AI + post to Google",
      items: [
        "AI drafts professional, human-sounding responses",
        "Edit and post directly to Google — no copy-paste",
        "Low-rating reviews flagged with instant email alerts",
      ],
    },
    {
      icon: ShieldCheck,
      label: "The private feedback shield",
      items: [
        "Unhappy customers see a private feedback form — not Google",
        "You get the complaint and a chance to fix it first",
        "Complaints stay private. Your public rating stays strong.",
      ],
    },
  ];

  return (
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="rs-whatwedo">
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

/* ---------- ReputationShield: Product Previews ---------- */
function RSProductPreviewSection() {
  const previews = [
    {
      title: "The Sentiment Gate",
      desc: "Happy customers go to Google. Unhappy customers see this instead.",
      mock: (
        <div style={{ background: "#fff", borderRadius: 10, padding: 20, border: "1px solid #E5E7EB", fontSize: 13 }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#1a1a2e", marginBottom: 4 }}>How was your experience?</div>
            <div style={{ color: "#6B7280", fontSize: 12 }}>Your feedback about <strong>ABC Plumbing</strong></div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <div style={{ background: "#22C55E", color: "#fff", padding: "10px 20px", borderRadius: 8, fontWeight: 600, fontSize: 12 }}>Great experience!</div>
            <div style={{ background: "#F3F4F6", color: "#374151", padding: "10px 20px", borderRadius: 8, fontWeight: 600, fontSize: 12 }}>I had an issue</div>
          </div>
        </div>
      ),
    },
    {
      title: "AI Response Drafts",
      desc: "One click generates a professional reply. Edit it, then post to Google.",
      mock: (
        <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #E5E7EB", fontSize: 12 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <span style={{ color: "#FBBF24" }}>★★★★★</span>
            <span style={{ color: "#6B7280" }}>by John S.</span>
          </div>
          <div style={{ color: "#374151", marginBottom: 10, lineHeight: 1.5 }}>"Great work on the boiler install. On time and cleaned up after."</div>
          <div style={{ background: "#F0F9FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <div style={{ color: "#6B7280", fontSize: 10, marginBottom: 4, fontWeight: 600 }}>AI DRAFT</div>
            <div style={{ color: "#1E40AF", lineHeight: 1.4 }}>Thank you for your kind words, John. We take pride in keeping things tidy. Glad the boiler is working well for you.</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ background: "#2563EB", color: "#fff", padding: "6px 12px", borderRadius: 6, fontWeight: 600, fontSize: 11 }}>Post to Google</div>
            <div style={{ background: "#F3F4F6", color: "#374151", padding: "6px 12px", borderRadius: 6, fontWeight: 600, fontSize: 11 }}>Copy</div>
          </div>
        </div>
      ),
    },
    {
      title: "Review Widget",
      desc: "Your best reviews displayed right on your website — automatically updated.",
      mock: (
        <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #E5E7EB", fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e" }}>4.8</span>
            <div>
              <div style={{ color: "#FBBF24", fontSize: 14 }}>★★★★★</div>
              <div style={{ color: "#6B7280", fontSize: 10 }}>47 reviews</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 10 }}>
            <div style={{ color: "#FBBF24", marginBottom: 4 }}>★★★★★</div>
            <div style={{ color: "#374151", lineHeight: 1.4, marginBottom: 4 }}>"Fixed our leaking tap same day. Very professional."</div>
            <div style={{ color: "#9CA3AF", fontSize: 10 }}>— Sarah M. · Google</div>
          </div>
        </div>
      ),
    },
    {
      title: "Monthly Report Email",
      desc: "Proof your reputation is growing — delivered to your inbox every month.",
      mock: (
        <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", border: "1px solid #E5E7EB", fontSize: 12 }}>
          <div style={{ background: "#1a1a2e", padding: "10px 16px", color: "#fff", fontWeight: 700, fontSize: 13 }}>ReputationShield Report</div>
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>4.8</div>
                <div style={{ color: "#6B7280", fontSize: 9 }}>Avg Rating</div>
              </div>
              <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#16A34A" }}>+12</div>
                <div style={{ color: "#6B7280", fontSize: 9 }}>New Reviews</div>
              </div>
            </div>
            <div style={{ color: "#374151", lineHeight: 1.5 }}>3 issues captured privately · 5 reviews still need a reply</div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="rs-previews">
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>See it in action</SectionLabel>
        <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 40 }}>
          Real tools. Not just promises.
        </h2>

        <style>{`
          .rs-previews-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            text-align: left;
          }
          @media (max-width: 640px) {
            .rs-previews-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div className="rs-previews-grid">
          {previews.map((p, i) => (
            <div
              key={p.title}
              data-reveal="fade-up"
              data-delay={String(i * 60)}
              style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: mkt.text, marginBottom: 4 }}>{p.title}</h3>
                <p style={{ fontSize: 13, color: mkt.textMuted, lineHeight: 1.5, margin: 0 }}>{p.desc}</p>
              </div>
              {p.mock}
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
    { feature: "Catches complaints privately before Google", rs: true, tools: false },
    { feature: "AI drafts + posts responses to Google", rs: true, tools: false },
    { feature: "SMS review requests (3\u20135x better response rate)", rs: true, tools: "Email only" },
    { feature: "QR codes for field collection", rs: true, tools: false },
    { feature: "Monthly proof-of-ROI report", rs: true, tools: "You check manually" },
    { feature: "No contracts, transparent pricing", rs: true, tools: "Sales call required" },
    { feature: "Built specifically for trades", rs: true, tools: "Generic SMB" },
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="rs-comparison">
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
          Most review tools give you a login and expect you to do the work. ReputationShield does the work — you just keep doing good jobs.
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
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="rs-results">
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

/* ---------- ReputationShield: Social Proof ---------- */
function RSSocialProofSection() {
  const testimonials = [
    {
      quote: "We went from 12 Google reviews to 47 in four months. Customers just started leaving them without us having to ask awkwardly at the door.",
      name: "Mike D.",
      role: "Owner, MD Plumbing",
      trade: "Plumber",
      stat: "12 → 47 reviews",
    },
    {
      quote: "Had a customer who was upset about a scheduling mix-up. ReputationShield caught it privately — we fixed it, and they actually came back for another job. That would have been a 1-star review.",
      name: "Sarah K.",
      role: "Operations, Comfort Air HVAC",
      trade: "HVAC",
      stat: "0 negative public reviews in 3 months",
    },
    {
      quote: "The AI response drafts save me 20 minutes a day. I used to stare at reviews not knowing what to say. Now I just click, tweak a word or two, and post it.",
      name: "James R.",
      role: "Owner, JR Electrical",
      trade: "Electrician",
      stat: "100% response rate",
    },
  ];

  const stats = [
    { value: "340+", label: "Trades businesses using ReputationShield" },
    { value: "4.2x", label: "Average review growth in first 90 days" },
    { value: "93%", label: "Of negative feedback caught privately" },
    { value: "< 2 min", label: "Average time to draft + post a response" },
  ];

  const beforeAfter = [
    { label: "Average Google reviews", before: "14", after: "52", change: "+271%" },
    { label: "Average rating", before: "4.1", after: "4.7", change: "+0.6" },
    { label: "Reviews without response", before: "78%", after: "12%", change: "-85%" },
    { label: "Public complaints (1-2 star)", before: "~3/mo", after: "< 1/mo", change: "-70%" },
  ];

  return (
    <>
      {/* Stats strip */}
      <section style={{ background: mkt.dark, padding: "48px 28px" }} data-testid="rs-stats">
        <div style={{ maxWidth: 900, margin: "0 auto" }} data-reveal="fade-up">
          <style>{`
            .rs-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; text-align: center; }
            @media (max-width: 640px) { .rs-stats-grid { grid-template-columns: repeat(2, 1fr) !important; } }
          `}</style>
          <div className="rs-stats-grid">
            {stats.map((s) => (
              <div key={s.label}>
                <div style={{ fontSize: "clamp(28px, 3.5vw, 40px)", fontWeight: 800, color: mkt.accent, letterSpacing: "-0.02em" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: mkt.onDarkFaint, marginTop: 4, lineHeight: 1.4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="rs-testimonials">
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
          <SectionLabel>From real trades businesses</SectionLabel>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 36 }}>
            What owners are saying
          </h2>

          <style>{`
            .rs-testimonials-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: left; }
            @media (max-width: 768px) { .rs-testimonials-grid { grid-template-columns: 1fr !important; } }
          `}</style>

          <div className="rs-testimonials-grid">
            {testimonials.map((t, i) => (
              <div
                key={t.name}
                data-reveal="fade-up"
                data-delay={String(i * 80)}
                style={{
                  background: mkt.bg,
                  border: `1px solid ${mkt.border}`,
                  borderRadius: 14,
                  padding: 22,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ color: "#FBBF24", fontSize: 14, marginBottom: 10 }}>★★★★★</div>
                  <p style={{ fontSize: 14, color: mkt.text, lineHeight: 1.6, margin: "0 0 16px", fontStyle: "italic" }}>
                    &ldquo;{t.quote}&rdquo;
                  </p>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: mkt.text }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: mkt.textMuted }}>{t.role}</div>
                  <div style={{ fontSize: 11, color: mkt.accent, fontWeight: 600, marginTop: 6 }}>{t.stat}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Before / After */}
      <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="rs-before-after">
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
          <SectionLabel>Average results</SectionLabel>
          <h2 style={{ fontSize: "clamp(22px, 2.8vw, 32px)", fontWeight: 700, color: mkt.text, letterSpacing: "-0.025em", marginBottom: 32 }}>
            Before ReputationShield vs. after 90 days
          </h2>

          <div style={{ background: mkt.surface, border: `1px solid ${mkt.border}`, borderRadius: 14, overflow: "hidden" }}>
            <style>{`
              .rs-ba-table { width: 100%; border-collapse: collapse; font-size: 14px; }
              .rs-ba-table th, .rs-ba-table td { padding: 14px 18px; }
              .rs-ba-table th { font-weight: 600; }
              @media (max-width: 480px) { .rs-ba-table th, .rs-ba-table td { padding: 10px 12px; font-size: 13px; } }
            `}</style>
            <table className="rs-ba-table">
              <thead>
                <tr style={{ borderBottom: `2px solid ${mkt.border}` }}>
                  <th style={{ textAlign: "left", color: mkt.textMuted }}></th>
                  <th style={{ textAlign: "center", color: mkt.textMuted }}>Before</th>
                  <th style={{ textAlign: "center", color: mkt.textMuted }}>After 90 days</th>
                  <th style={{ textAlign: "center", color: mkt.accent, fontWeight: 700 }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {beforeAfter.map((row) => (
                  <tr key={row.label} style={{ borderBottom: `1px solid ${mkt.border}` }}>
                    <td style={{ color: mkt.text, fontWeight: 500 }}>{row.label}</td>
                    <td style={{ textAlign: "center", color: mkt.textMuted }}>{row.before}</td>
                    <td style={{ textAlign: "center", color: mkt.text, fontWeight: 600 }}>{row.after}</td>
                    <td style={{ textAlign: "center", color: "#16A34A", fontWeight: 700 }}>{row.change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 11, color: mkt.textMuted, marginTop: 8, opacity: 0.7 }}>
            Example results based on typical usage patterns
          </p>
        </div>
      </section>
    </>
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
        Pick the plan that matches where you are.
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
        Every plan includes automated review requests, private feedback shield, monitoring, and alerts.
        No contracts. No setup fees. Cancel anytime.
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="ss-problem">
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
      desc: "AI writes posts tailored to your trade, services, and location. No generic content.",
    },
    {
      icon: ImageIcon,
      label: "Design",
      desc: "We generate clean images for Instagram posts. No stock photos needed.",
    },
    {
      icon: Share2,
      label: "Post",
      desc: "Published automatically to Facebook, Instagram, and Google Business Profile.",
    },
    {
      icon: Shield,
      label: "Quality check",
      desc: "Every post is checked for repetition, spam, and tone before it goes live.",
    },
    {
      icon: Eye,
      label: "Keep you visible",
      desc: "Consistent weekly posting so your business always looks active and trusted.",
    },
  ];

  return (
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="ss-whatwedo">
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
          @media (min-width: 769px) and (max-width: 1024px) {
            .ss-whatwedo-grid { grid-template-columns: repeat(3, 1fr) !important; }
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="ss-comparison">
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
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="ss-results">
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

/* ---------- SocialSync: Transparency Section ---------- */
function SSTransparencySection() {
  const items = [
    { text: "Does not manage DMs or messages", why: "Keeps your accounts safe — no access to private conversations" },
    { text: "Does not reply to comments", why: "Comment management requires different tools and human judgment" },
    { text: "Does not run ads", why: "SocialSync is organic visibility, not paid advertising" },
    { text: "Does not post videos or reels", why: "We focus on what works consistently: image + text posts" },
  ];

  return (
    <section style={{ background: mkt.sectionLight, padding: "56px 28px" }} data-testid="ss-transparency">
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>Clear expectations</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(20px, 2.5vw, 28px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 8,
          }}
        >
          What SocialSync doesn't do
        </h2>
        <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.6, marginBottom: 28 }}>
          We believe in being upfront. SocialSync does one thing really well: keeping your business visible with consistent, quality posts.
        </p>
        <div style={{ textAlign: "left" }}>
          {items.map((item) => (
            <div
              key={item.text}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 0",
                borderBottom: `1px solid ${mkt.border}`,
              }}
            >
              <Info size={16} color={mkt.textMuted} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: mkt.text, margin: "0 0 2px" }}>{item.text}</p>
                <p style={{ fontSize: 13, color: mkt.textMuted, margin: 0 }}>{item.why}</p>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: mkt.textMuted, marginTop: 20 }}>
          This keeps everything safe, compliant, and focused on what matters: consistent visibility.
        </p>
      </div>
    </section>
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="sl-problem">
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
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="sl-differentiation">
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
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="sl-comparison">
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
    <section style={{ background: mkt.sectionLight, padding: "56px 28px" }} data-testid="sl-built-for">
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
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="sl-results">
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

/* ═══════════════════════════════════════════════════════════
   WEBBOOST SECTIONS
   ═══════════════════════════════════════════════════════════ */

/* ---------- WebBoost: Built For Trades ---------- */
function WBBuiltForSection({ trades }: { trades: string[] }) {
  return (
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="wb-built-for">
      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>Built for trades</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 20,
          }}
        >
          Built for websites that are supposed to bring in work
        </h2>
        <p style={{ fontSize: 17, color: mkt.textMuted, lineHeight: 1.7, marginBottom: 24 }}>
          {trades.join(". ")}.
        </p>
        <p style={{ fontSize: 15, color: mkt.textFaint, lineHeight: 1.6, margin: 0 }}>
          Not restaurants. Not SaaS. Not generic SEO. Built for businesses that rely on calls, quotes, and local trust.
        </p>
      </div>
    </section>
  );
}

/* ---------- WebBoost: Problem Section ---------- */
function WBProblemSection() {
  const painPoints = [
    { title: "Slow pages make people leave", icon: Zap },
    { title: "Weak SEO means customers don\u2019t find you", icon: Eye },
    { title: "Poor structure means fewer calls and form fills", icon: Phone },
  ];

  return (
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="wb-problem">
      <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>The problem</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 16,
          }}
        >
          Most websites lose leads before the customer even contacts you.
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
          Your site may look &ldquo;fine&rdquo; &mdash; but that doesn&rsquo;t mean it&rsquo;s performing.
          If it loads slowly, ranks poorly, or makes people work too hard to contact you, you lose business.
        </p>

        <style>{`
          .wb-pain-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
          @media (max-width: 640px) { .wb-pain-grid { grid-template-columns: 1fr !important; } }
        `}</style>

        <div className="wb-pain-grid" data-reveal="fade-up">
          {painPoints.map(({ title, icon: Icon }) => (
            <div
              key={title}
              style={{
                background: mkt.bg,
                border: `1px solid ${mkt.border}`,
                borderRadius: 14,
                padding: "24px 18px",
              }}
            >
              <Icon size={24} color={mkt.accent} strokeWidth={2} style={{ marginBottom: 10 }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text, margin: 0, lineHeight: 1.4 }}>{title}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 16, fontWeight: 600, color: mkt.accent, margin: 0 }}>
          A website that feels slow or hard to use quietly sends work to competitors.
        </p>
      </div>
    </section>
  );
}

/* ---------- WebBoost: Decision Alternatives ---------- */
function WBAlternativesSection() {
  const alternatives = [
    { title: "Plugins", desc: "They can improve speed, but they don\u2019t fix your SEO, structure, or visibility." },
    { title: "Cheap freelancers", desc: "They often optimize for scores, not real performance \u2014 and the results don\u2019t last." },
    { title: "Maintenance plans", desc: "They keep a site running, but they don\u2019t usually improve rankings or conversions." },
    { title: "SEO agencies", desc: "They sell massive retainers when you may only need focused fixes." },
  ];

  return (
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="wb-alternatives">
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>The alternatives</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 36,
          }}
        >
          Why most &ldquo;solutions&rdquo; don&rsquo;t actually solve it
        </h2>

        <style>{`
          .wb-alt-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; text-align: left; margin-bottom: 28px; }
          @media (max-width: 800px) { .wb-alt-grid { grid-template-columns: 1fr 1fr !important; } }
          @media (max-width: 500px) { .wb-alt-grid { grid-template-columns: 1fr !important; } }
        `}</style>

        <div className="wb-alt-grid" data-reveal="fade-up">
          {alternatives.map((alt) => (
            <div
              key={alt.title}
              style={{
                background: mkt.surface,
                border: `1px solid ${mkt.border}`,
                borderRadius: 14,
                padding: "22px 18px",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: mkt.text, marginBottom: 10 }}>{alt.title}</h3>
              <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.6, margin: 0 }}>{alt.desc}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 16, fontWeight: 600, color: mkt.accent, margin: 0 }}>
          WebBoost sits in the gap &mdash; faster and more practical than an agency, more complete than a plugin.
        </p>
      </div>
    </section>
  );
}

/* ---------- WebBoost: What It Does ---------- */
function WBWhatWeDoSection() {
  const cards = [
    { title: "Speed improvements", desc: "Make pages load faster and feel smoother" },
    { title: "Technical SEO fixes", desc: "Clean up issues that stop pages from being indexed and understood properly" },
    { title: "On-page improvements", desc: "Strengthen page structure, titles, headings, and content signals" },
    { title: "Conversion cleanup", desc: "Make it easier for visitors to call, message, or request a quote" },
    { title: "Plain-language reporting", desc: "Show what changed and why it matters \u2014 without technical nonsense" },
  ];

  return (
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="wb-whatwedo">
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>What we do</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(24px, 3vw, 36px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 36,
          }}
        >
          We fix what&rsquo;s slowing your website down &mdash; and what&rsquo;s holding it back in Google
        </h2>

        <style>{`
          .wb-whatwedo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; text-align: left; margin-bottom: 24px; }
          @media (max-width: 500px) { .wb-whatwedo-grid { grid-template-columns: 1fr !important; } }
        `}</style>

        <div className="wb-whatwedo-grid" data-reveal="fade-up">
          {cards.map((c, i) => (
            <div
              key={c.title}
              data-delay={String(i * 60)}
              style={{
                background: mkt.bg,
                border: `1px solid ${mkt.border}`,
                borderRadius: 14,
                padding: "22px 18px",
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: mkt.accentTint,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 12, fontSize: 15, fontWeight: 700, color: mkt.accent,
              }}>
                {i + 1}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: mkt.text, marginBottom: 8, lineHeight: 1.3 }}>{c.title}</h3>
              <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.6, margin: 0 }}>{c.desc}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 15, color: mkt.textFaint, margin: 0 }}>
          You don&rsquo;t need to understand any of the technical details. We handle it.
        </p>
      </div>
    </section>
  );
}

/* ---------- WebBoost: Benefits ---------- */
function WBBenefitsSection() {
  const benefits = [
    "Reduce slow-page drop-offs",
    "Help more customers find you in search",
    "Make your site easier to use on phones",
    "Improve trust and first impression",
    "Turn more visitors into real enquiries",
    "Fix issues without hiring a big agency",
  ];

  return (
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="wb-benefits">
      <div style={{ maxWidth: 680, margin: "0 auto" }} data-reveal="fade-up">
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <SectionLabel>Benefits</SectionLabel>
          <h2
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              fontWeight: 700,
              color: mkt.text,
              letterSpacing: "-0.025em",
            }}
          >
            What this actually helps your business do
          </h2>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {benefits.map((b) => (
            <div
              key={b}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 20px",
                background: mkt.surface,
                borderRadius: 12,
                border: `1px solid ${mkt.border}`,
              }}
            >
              <Check size={18} color={mkt.accent} strokeWidth={2.5} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 16, color: mkt.text, fontWeight: 500 }}>{b}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- WebBoost: Comparison Table ---------- */
function WBComparisonSection() {
  const rows = [
    { feature: "Improves site speed", wb: true, plugin: true, freelancer: true, agency: true },
    { feature: "Fixes technical SEO", wb: true, plugin: false, freelancer: false, agency: true },
    { feature: "Improves on-page structure", wb: true, plugin: false, freelancer: false, agency: true },
    { feature: "Built for lead generation", wb: true, plugin: false, freelancer: false, agency: false },
    { feature: "Trades-focused", wb: true, plugin: false, freelancer: false, agency: false },
    { feature: "Transparent pricing", wb: true, plugin: true, freelancer: false, agency: false },
    { feature: "No large retainer required", wb: true, plugin: true, freelancer: true, agency: false },
  ];

  const renderCell = (val: boolean, isWb: boolean) =>
    val ? (
      <Check size={16} color={isWb ? mkt.accent : mkt.textMuted} strokeWidth={2.5} />
    ) : (
      <span style={{ color: mkt.textFaint, fontSize: 16 }}>&mdash;</span>
    );

  return (
    <section style={{ background: mkt.sectionLighter, padding: "72px 28px" }} data-testid="wb-comparison">
      <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }} data-reveal="fade-up">
        <SectionLabel>The difference</SectionLabel>
        <h2
          style={{
            fontSize: "clamp(22px, 2.8vw, 32px)",
            fontWeight: 700,
            color: mkt.text,
            letterSpacing: "-0.025em",
            marginBottom: 32,
          }}
        >
          WebBoost vs the alternatives
        </h2>

        <div style={{ background: mkt.bg, border: `1px solid ${mkt.border}`, borderRadius: 14, overflow: "auto" }}>
          <style>{`
            .wb-compare-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 520px; }
            .wb-compare-table th, .wb-compare-table td { padding: 12px 14px; }
          `}</style>
          <table className="wb-compare-table">
            <thead>
              <tr style={{ borderBottom: `1px solid ${mkt.border}` }}>
                <th style={{ textAlign: "left", fontWeight: 600, color: mkt.textMuted }}></th>
                <th style={{ textAlign: "center", fontWeight: 700, color: mkt.accent }}>WebBoost</th>
                <th style={{ textAlign: "center", fontWeight: 600, color: mkt.textMuted, fontSize: 13 }}>Plugin / tool</th>
                <th style={{ textAlign: "center", fontWeight: 600, color: mkt.textMuted, fontSize: 13 }}>Cheap freelancer</th>
                <th style={{ textAlign: "center", fontWeight: 600, color: mkt.textMuted, fontSize: 13 }}>SEO agency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} style={{ borderBottom: `1px solid ${mkt.border}` }}>
                  <td style={{ color: mkt.text, fontWeight: 500, textAlign: "left" }}>{row.feature}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.wb, true)}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.plugin, false)}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.freelancer, false)}</td>
                  <td style={{ textAlign: "center" }}>{renderCell(row.agency, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- WebBoost: Results ---------- */
function WBResultsSection({ outcomes }: { outcomes: { title: string; desc: string }[] }) {
  const results = [
    { title: "Faster first impression", desc: "Visitors stay instead of bouncing to a competitor" },
    { title: "Better search visibility", desc: "More people find you when they search for your services" },
    { title: "More trust from visitors", desc: "A fast, well-structured site signals professionalism" },
    { title: "Better chance of getting the call", desc: "Fewer barriers between the visitor and contacting you" },
  ];

  return (
    <section style={{ background: mkt.sectionLight, padding: "72px 28px" }} data-testid="wb-results">
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
          What happens when your site performs better
        </h2>

        <style>{`
          .wb-results-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; text-align: left; margin-bottom: 28px; }
          @media (max-width: 800px) { .wb-results-grid { grid-template-columns: 1fr 1fr !important; } }
          @media (max-width: 500px) { .wb-results-grid { grid-template-columns: 1fr !important; } }
        `}</style>

        <div className="wb-results-grid">
          {results.map((r, i) => (
            <div
              key={r.title}
              data-reveal="fade-up"
              data-delay={String(i * 60)}
              style={{
                background: mkt.surface,
                border: `1px solid ${mkt.border}`,
                borderRadius: 14,
                padding: "22px 18px",
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: mkt.accent, marginBottom: 6 }}>{r.title}</h3>
              <p style={{ fontSize: 14, color: mkt.textMuted, lineHeight: 1.55, margin: 0 }}>{r.desc}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 16, fontWeight: 600, color: mkt.accent, margin: 0 }}>
          One extra job can easily cover the cost of fixing a weak website.
        </p>
      </div>
    </section>
  );
}

/* ---------- WebBoost: Pricing Intro ---------- */
function WBPricingIntro() {
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
        Simple pricing. Focused improvements.
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
        Get the fixes you need without signing up for a giant SEO retainer.
      </p>
    </>
  );
}

/* ---------- WebBoost: Risk Reversal ---------- */
function WBRiskReversal() {
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
          maxWidth: 640,
          margin: "0 auto",
          letterSpacing: "0.01em",
        }}
      >
        No contracts &middot; No confusing agency jargon &middot; Clear before/after improvements &middot; Built for real business outcomes, not vanity scores
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

  const hasCustomHero = isTradeLine || isQuoteQuick || isReputationShield || isSocialSync || isSiteLaunch || isWebCare || false /* WebBoost removed */;

  return (
    <MarketingLayout>
      <style>{`
        [data-testid^="product-page-"] {
          background: ${mkt.sectionLight};
        }
        @media (max-width: 640px) {
          [data-testid^="product-page-"] section {
            padding-top: 40px !important;
            padding-bottom: 40px !important;
          }
          [data-testid^="product-page-"] section[data-testid="product-pricing"] {
            padding-top: 48px !important;
            padding-bottom: 48px !important;
          }
        }
      `}</style>
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
                  <>Turn Every Completed Job Into a{" "}<span style={{ color: mkt.accent }}>5-Star Google Review</span></>
                ) : isSiteLaunch ? (
                  <>Get a Trade Website That Brings You Jobs —{" "}<span style={{ color: mkt.accent }}>Live in 5 Days</span></>
                ) : isWebCare ? (
                  <>We Take Care of Your Website —{" "}<span style={{ color: mkt.accent }}>So You Can Focus on the Job</span></>

                ) : false /* WebBoost removed */ ? (
                  <>Make Your Website Faster, Easier to Find, and{" "}<span style={{ color: mkt.accent }}>Better at Turning Visitors Into Calls</span></>
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
                  "Automatic SMS + email review requests after every job. Unhappy customers caught privately before they go public. AI-drafted responses posted to Google in one click. Monthly reports that prove it\u2019s working."
                ) : isSiteLaunch ? (
                  "We build your website from scratch \u2014 custom designed, mobile-first, SEO-ready, with lead capture built in. One-time fee. No contracts. You own the site."
                ) : isWebCare ? (
                  "Your website stays updated, secure, and working. No tech headaches. No contracts. Just reliable maintenance \u2014 built for trades businesses."
                ) : false /* WebBoost removed */ ? (
                  "WebBoost fixes the speed, structure, and SEO issues that quietly cost trades businesses leads every day \u2014 without locking you into a big agency retainer."
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

          {false /* WebBoost removed */ && (
            <p
              className="hero-enter"
              style={{
                fontSize: 13,
                color: mkt.textMuted,
                marginTop: 16,
                opacity: 0.7,
              }}
            >
              Built for trades businesses &bull; No contracts &bull; Not just a plugin
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
              {(false /* WebBoost removed */ ? [
                "Built for trades businesses",
                "Speed + SEO improvements together",
                "No contracts",
                "Done for you",
                "Works on more than WordPress only",
              ] : isSocialSync ? [
                "Built for trades businesses",
                "Done-for-you posting",
                "No contracts",
                "We post for you every week",
              ] : isReputationShield ? [
                "Built for plumbers, electricians, HVAC",
                "Works automatically after every job",
                "No contracts \u00B7 Cancel anytime",
                "From $79/mo",
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

        {/* ── TradeLine: Problem + Solution (between hero and capabilities) ── */}
        {isTradeLine && (
          <>
            <TradeLineProblemSection />
            <TradeLineSolutionSection />
          </>
        )}

        {/* ── QuoteQuick: Problem + Solution (between hero and capabilities) ── */}
        {isQuoteQuick && (
          <>
            <QQProblemSection />
            <QQSolutionSection />
          </>
        )}

        {/* ── ReputationShield: Problem + What We Do (between hero and capabilities) ── */}
        {isReputationShield && (
          <>
            <RSProblemSection />
            <RSWhatWeDoSection />
            <RSProductPreviewSection />
          </>
        )}

        {/* ── SocialSync: Problem + What We Do (between hero and capabilities) ── */}
        {isSocialSync && (
          <>
            <SSProblemSection />
            <SSWhatWeDoSection />
          </>
        )}

        {/* ── SiteLaunch: Problem + Differentiation (between hero and capabilities) ── */}
        {isSiteLaunch && (
          <>
            <SLProblemSection />
            <SLDifferentiationSection />
          </>
        )}

        {/* ── WebCare: Problem + What We Do (between hero and capabilities) ── */}
        {isWebCare && (
          <>
            <WCProblemSection />
            <WCWhatWeDoSection />
          </>
        )}

        {/* ── WebBoost: Built For + Problem + Alternatives + What We Do + Benefits ── */}
        {false /* WebBoost removed */ && (
          <>
            <WBBuiltForSection trades={product?.bestFor ?? []} />
            <WBProblemSection />
            <WBAlternativesSection />
            <WBWhatWeDoSection />
            <WBBenefitsSection />
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
            false /* WebBoost removed */ ? "What you get with WebBoost" :
            undefined
          }
        />

        {/* ── §3 HOW IT WORKS ── */}
        <StepTimeline steps={product.howItWorks} heading={isQuoteQuick ? "Set it up once. Let it work every day." : isSiteLaunch ? "Three steps. Five days. Done." : isWebCare ? "Simple setup. Ongoing care." : false /* WebBoost removed */ ? "Simple process. Real improvements." : undefined} />

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

        {false /* WebBoost removed */ && (
          <div style={{ background: mkt.surface, textAlign: "center", padding: "0 28px 48px" }} data-reveal="fade-up">
            <p style={{ fontSize: 15, fontWeight: 600, color: mkt.text, maxWidth: 560, margin: "0 auto", lineHeight: 1.5 }}>
              No drawn-out agency process. No endless calls. Just focused improvements that matter.
            </p>
          </div>
        )}

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
        {isSocialSync && <SSTransparencySection />}

        {/* ── SiteLaunch: Comparison (after how-it-works) ── */}
        {isSiteLaunch && <SLComparisonSection />}
        {/* ── WebCare: Comparison (after how-it-works) ── */}
        {isWebCare && <WCComparisonSection />}

        {/* ── WebBoost: Comparison (after how-it-works) ── */}
        {false /* WebBoost removed */ && <WBComparisonSection />}

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
        {isReputationShield && <RSSocialProofSection />}

        {/* ── SocialSync: Results (after reviews, before pricing) ── */}
        {isSocialSync && <SSResultsSection outcomes={product.outcomes} />}

        {/* ── SiteLaunch: Results (after reviews, before pricing) ── */}
        {isSiteLaunch && <SLResultsSection outcomes={product.outcomes} />}
        {/* ── WebCare: Results (after reviews, before pricing) ── */}
        {isWebCare && <WCResultsSection outcomes={product.outcomes} />}

        {/* ── WebBoost: Results (after reviews, before pricing) ── */}
        {false /* WebBoost removed */ && <WBResultsSection outcomes={product?.outcomes ?? []} />}

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
            false /* WebBoost removed */ ? <WBPricingIntro /> :
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

        {/* ── WebBoost: Risk Reversal (below pricing) ── */}
        {false /* WebBoost removed */ && <WBRiskReversal />}

        {/* ── §6 FAQ ── */}
        {product.faq.length > 0 && (
          <section
            style={{ background: mkt.sectionLight, padding: "72px 28px" }}
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
            heading="Your next 5-star review is one completed job away."
            subtext="Start collecting reviews automatically. Catch complaints privately. Respond with AI. See the proof every month. From $79/mo — no contracts."
            ctaLabel="Start Getting Reviews — Free Trial"
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
        ) : false /* WebBoost removed */ ? (
          <CTASection
            heading="Stop losing leads to a weak website."
            subtext="Fix the speed, SEO, and structure issues that hold your site back — without paying for a full agency retainer."
            ctaLabel="Boost My Website"
            ctaHref="/Wizard"
          />
        ) : (
          <CTASection />
        )}

      </div>
    </MarketingLayout>
  );
}
