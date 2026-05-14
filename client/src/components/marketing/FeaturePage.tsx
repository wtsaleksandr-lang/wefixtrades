import { useEffect, useState } from "react";
import { Link } from "wouter";
import { type LucideIcon, ChevronDown, ArrowRight, Check } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";

import { mkt, colors, shadows } from "@/theme/tokens";

const C = {
  navy: colors.brand.dark,
  sage: colors.accent.blue,
  sageDark: colors.accent.blueHover,
  sageLight: colors.accent.cyan,
  sageTint: colors.accent.blueTint,
  sageAccent: colors.accent.blueTint,
  blue: colors.accent.blue,
  blueTint: colors.accent.blueTint,
  purple: "#7C3AED",
  purpleTint: "#F5F3FF",
  pink: "#DB2777",
  pinkTint: "#FDF2F8",
  orange: colors.accent.orange,
  orangeTint: colors.accent.orangeTint,
  bg: mkt.bg,
  bgGray: colors.surface.muted,
  heading: colors.text.primary,
  body: colors.text.secondary,
  muted: colors.text.secondary,
  border: mkt.border,
  borderLight: mkt.borderLight,
};

const SHADOW = {
  card: shadows.card,
  hero: shadows.xl,
  md: shadows.md,
};

/* ─── Types ─────────────────────────────────────── */
export interface Benefit {
  icon: LucideIcon;
  title: string;
  body: string;
  color: string;
  bg: string;
}

export interface Step {
  num: string;
  title: string;
  body: string;
}

export interface FAQ {
  q: string;
  a: string;
}

export interface FeaturePageConfig {
  meta: { title: string };
  hero: {
    badge: string;
    badgeColor: string;
    headline: string;
    highlightedWords?: string[];
    sub: string;
    accentColor: string;
  };
  demo: {
    label: string;
    title: string;
    description: string;
    bullets: string[];
    bulletColor: string;
    mockup: () => JSX.Element;
  };
  benefits: Benefit[];
  steps: Step[];
  faqs: FAQ[];
  cta: {
    headline: string;
    sub: string;
  };
}

/* ─── FAQ Accordion ──────────────────────────────── */
function FAQItem({ q, a }: FAQ) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
        transition: "box-shadow 0.2s ease",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid={`faq-${q.substring(0, 20).toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 24px",
          background: open ? C.bgGray : C.bg,
          border: "none",
          cursor: "pointer",
          gap: 16,
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: C.heading, lineHeight: 1.4 }}>{q}</span>
        <ChevronDown
          size={18}
          color={C.muted}
          strokeWidth={1.5}
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 0.25s ease",
          }}
        />
      </button>
      {open && (
        <div style={{ padding: "0 24px 20px", background: C.bgGray }}>
          <p style={{ fontSize: 15, color: C.body, lineHeight: 1.7, margin: 0 }}>{a}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Main FeaturePage template ──────────────────── */
export default function FeaturePage({ config }: { config: FeaturePageConfig }) {
  useScrollReveal();

  useEffect(() => {
    document.title = config.meta.title;
  }, [config.meta.title]);

  const { hero, demo, benefits, steps, faqs, cta } = config;
  const Mockup = demo.mockup;

  /* Highlight certain words in the headline */
  const renderHeadline = () => {
    if (!hero.highlightedWords?.length) {
      return <>{hero.headline}</>;
    }
    let text = hero.headline;
    const parts: JSX.Element[] = [];
    let key = 0;

    hero.highlightedWords.forEach((word) => {
      const idx = text.indexOf(word);
      if (idx === -1) return;
      if (idx > 0) parts.push(<span key={key++}>{text.substring(0, idx)}</span>);
      parts.push(
        <span key={key++} style={{ color: "#6EE7B7" }}>
          {word}
        </span>
      );
      text = text.substring(idx + word.length);
    });
    if (text) parts.push(<span key={key++}>{text}</span>);
    return <>{parts}</>;
  };

  return (
    <MarketingLayout>
      <div style={{ overflowX: "hidden" }}>

        {/* ══════════════════════════════
            1. HERO
        ══════════════════════════════ */}
        <section
          data-testid="feature-hero"
          style={{
            background: `linear-gradient(160deg, ${C.navy} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "80px 28px 96px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Ambient orbs */}
          <div style={{ position: "absolute", top: -80, right: -60, width: 480, height: 480, borderRadius: "50%", background: `${hero.accentColor}14`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -80, left: -60, width: 360, height: 360, borderRadius: "50%", background: "rgba(47,107,255,0.07)", pointerEvents: "none" }} />

          <div
            className="feature-hero-grid"
            style={{
              maxWidth: 1200, margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 64, alignItems: "center",
            }}
          >
            {/* Left text */}
            <div>
              {/* Badge */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: `${hero.accentColor}25`,
                border: `1px solid ${hero.accentColor}50`,
                borderRadius: 20, padding: "5px 14px", marginBottom: 28,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#6EE7B7", letterSpacing: "0.02em" }}>
                  ✦ {hero.badge}
                </span>
              </div>

              <h1
                data-testid="feature-headline"
                style={{
                  fontSize: "clamp(32px, 3.8vw, 54px)",
                  fontWeight: 700, color: "#FFFFFF",
                  lineHeight: 1.1, letterSpacing: "-0.035em", marginBottom: 22,
                }}
              >
                {renderHeadline()}
              </h1>

              <p style={{
                fontSize: "clamp(15px, 1.7vw, 18px)",
                color: "rgba(255,255,255,0.6)", lineHeight: 1.65,
                marginBottom: 40, maxWidth: 480,
              }}>
                {hero.sub}
              </p>

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Link
                  href="/Wizard"
                  data-testid="feature-cta-start"
                  className="mkt-btn-primary"
                  style={{
                    padding: "13px 28px", borderRadius: 10,
                    background: hero.accentColor, color: "#FFFFFF",
                    fontSize: 15, fontWeight: 700, textDecoration: "none", display: "inline-block",
                  }}
                >
                  Start Free
                </Link>
                <Link
                  href="/demo"
                  data-testid="feature-cta-demo"
                  className="mkt-btn-ghost"
                  style={{
                    padding: "13px 24px", borderRadius: 10,
                    background: "transparent", color: "#FFFFFF",
                    fontSize: 15, fontWeight: 600, textDecoration: "none",
                    display: "inline-flex", alignItems: "center", gap: 8,
                    border: "1.5px solid rgba(255,255,255,0.28)",
                  }}
                >
                  View Demo
                </Link>
              </div>
            </div>

            {/* Right mockup */}
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
              <div className="mkt-float" style={{ width: "100%", maxWidth: 420, display: "flex", justifyContent: "flex-end" }}>
                <Mockup />
              </div>
            </div>
          </div>

          <style>{`
            @media (max-width: 820px) {
              .feature-hero-grid {
                grid-template-columns: 1fr !important;
                gap: 40px !important;
              }
              .feature-hero-grid > div:last-child {
                justify-content: center !important;
              }
            }
          `}</style>
        </section>

        {/* ══════════════════════════════
            2. VISUAL DEMO SECTION
        ══════════════════════════════ */}
        <section data-testid="feature-demo-section" style={{ background: C.bgGray, padding: "96px 28px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div
              className="feature-demo-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 80, alignItems: "center",
              }}
            >
              {/* Mockup */}
              <div data-reveal="fade-left" style={{ display: "flex", justifyContent: "center" }}>
                <Mockup />
              </div>

              {/* Text */}
              <div data-reveal="fade-right">
                <div style={{ fontSize: 11, fontWeight: 700, color: demo.bulletColor, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                  {demo.label}
                </div>
                <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 600, color: C.heading, letterSpacing: "-0.025em", marginBottom: 16, lineHeight: 1.15 }}>
                  {demo.title}
                </h2>
                <p style={{ fontSize: 16, color: C.body, lineHeight: 1.7, marginBottom: 28 }}>
                  {demo.description}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {demo.bullets.map((b) => (
                    <div key={b} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <Check size={16} color={demo.bulletColor} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 14.5, color: C.body, lineHeight: 1.5 }}>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <style>{`
              @media (max-width: 820px) {
                .feature-demo-grid {
                  grid-template-columns: 1fr !important;
                  gap: 40px !important;
                }
              }
            `}</style>
          </div>
        </section>

        {/* ══════════════════════════════
            3. BENEFITS GRID
        ══════════════════════════════ */}
        <section data-testid="feature-benefits-section" style={{ background: C.bg, padding: "96px 28px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 56 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                Key Benefits
              </div>
              <h2 style={{ fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 600, color: C.heading, letterSpacing: "-0.025em" }}>
                Why it makes a difference
              </h2>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(benefits.length, 4)}, 1fr)`,
                gap: 24,
              }}
              className="benefits-grid"
            >
              {benefits.map(({ icon: Icon, title, body, color, bg }, i) => (
                <div
                  key={title}
                  data-reveal="fade-up"
                  data-delay={String((i + 1) * 100)}
                  className="mkt-feature-card"
                  style={{
                    background: C.bg, border: `1px solid ${C.border}`,
                    borderRadius: 16, padding: "32px 24px", boxShadow: SHADOW.card,
                  }}
                >
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <Icon size={24} color={color} strokeWidth={1.5} />
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: C.heading, marginBottom: 10 }}>{title}</h3>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, margin: 0 }}>{body}</p>
                </div>
              ))}
            </div>
            <style>{`
              @media (max-width: 900px) { .benefits-grid { grid-template-columns: 1fr 1fr !important; } }
              @media (max-width: 540px) { .benefits-grid { grid-template-columns: 1fr !important; } }
            `}</style>
          </div>
        </section>

        {/* ══════════════════════════════
            4. HOW IT WORKS
        ══════════════════════════════ */}
        <section data-testid="feature-steps-section" style={{ background: C.bgGray, padding: "96px 28px" }}>
          <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
            <div data-reveal="fade-up" style={{ marginBottom: 64 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                How It Works
              </div>
              <h2 style={{ fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 600, color: C.heading, letterSpacing: "-0.025em" }}>
                Simple from day one
              </h2>
            </div>

            <div
              className="steps-grid"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
                gap: 8,
                position: "relative",
              }}
            >
              {/* Connecting line */}
              <div className="step-line" style={{
                position: "absolute", top: 31, left: "calc(100% / (2 * steps.length))",
                right: "calc(100% / (2 * steps.length))",
                height: 2,
                background: `linear-gradient(90deg, transparent, ${C.border}, transparent)`,
                pointerEvents: "none",
                zIndex: 0,
              }} />

              {steps.map(({ num, title, body }, i) => (
                <div
                  key={num}
                  data-testid={`step-${num}`}
                  data-reveal="fade-up"
                  data-delay={String(i * 150)}
                  style={{ padding: "0 12px", position: "relative", zIndex: 1 }}
                >
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%",
                    background: C.bg, border: `2px solid ${C.border}`,
                    boxShadow: `0 0 0 10px ${C.sageTint}, ${SHADOW.card}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 22px",
                    fontSize: 18, fontWeight: 800, color: C.sage,
                  }}>
                    {num}
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: C.heading, marginBottom: 8 }}>{title}</h3>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, margin: 0 }}>{body}</p>
                </div>
              ))}
            </div>
            <style>{`
              @media (max-width: 640px) {
                .steps-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
                .step-line { display: none !important; }
              }
            `}</style>
          </div>
        </section>

        {/* ══════════════════════════════
            5. FAQ
        ══════════════════════════════ */}
        <section data-testid="feature-faq-section" style={{ background: C.bg, padding: "96px 28px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
              <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>
                FAQ
              </div>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 600, color: C.heading, letterSpacing: "-0.025em" }}>
                Common questions
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-reveal="fade-up">
              {faqs.map((faq) => <FAQItem key={faq.q} {...faq} />)}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════
            6. CTA BAND
        ══════════════════════════════ */}
        <section
          data-testid="feature-cta-band"
          style={{
            background: `linear-gradient(135deg, ${C.sage} 0%, ${C.sageDark} 100%)`,
            padding: "112px 28px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 600, margin: "0 auto" }} data-reveal="scale">
            <h2 style={{ fontSize: "clamp(28px, 3.5vw, 46px)", fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.025em", marginBottom: 16, lineHeight: 1.1 }}>
              {cta.headline}
            </h2>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.68)", lineHeight: 1.65, marginBottom: 40, maxWidth: 460, margin: "0 auto 40px" }}>
              {cta.sub}
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href="/Wizard"
                data-testid="feature-cta-bottom"
                className="mkt-btn-primary"
                style={{
                  display: "inline-block", padding: "14px 34px", borderRadius: 14,
                  background: "#FFFFFF", color: C.sage, fontSize: 16, fontWeight: 700, textDecoration: "none",
                }}
              >
                Start Free
              </Link>
              <Link
                href="/contact"
                className="mkt-btn-ghost"
                style={{
                  display: "inline-block", padding: "14px 28px", borderRadius: 14,
                  background: "transparent", color: "#FFFFFF", fontSize: 15, fontWeight: 600,
                  textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.38)",
                }}
              >
                Talk to Sales
              </Link>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 22 }}>
              No credit card required · Live in 10 minutes · Cancel anytime
            </p>
          </div>
        </section>

      </div>
    </MarketingLayout>
  );
}
