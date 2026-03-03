import { Link } from "wouter";
import { ArrowRight, Play } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { IconBadge } from "@/components/IconBadge";
import { DEMOS } from "@/site/siteMap";
import { mkt, shadows } from "@/theme/tokens";

const DEMO_CARDS = [
  {
    slug: "ai-chatline",
    title: "AI ChatLine",
    desc: "See how AI ChatLine handles website visitors and SMS leads 24/7 — qualifying, capturing, and notifying in real time.",
    icon: "message",
    href: "/demos/ai-chatline",
  },
  {
    slug: "ai-callline",
    title: "AI CallLine",
    desc: "Experience the AI voice agent answering calls, capturing caller details, and sending you instant summaries.",
    icon: "phone",
    href: "/demos/ai-callline",
  },
  {
    slug: "quotequick",
    title: "QuoteQuick Pro",
    desc: "Try an interactive quote calculator that lets homeowners get instant estimates right on your website.",
    icon: "calculator",
    href: "/demos/quotequick",
  },
  {
    slug: "tradeline-complete",
    title: "TradeLine Complete",
    desc: "See Chat + Voice + DMs working together as a unified lead capture system built for busy trades.",
    icon: "workflow",
    href: "/demos/tradeline-complete",
  },
];

export default function DemoCenter() {
  return (
    <MarketingLayout>
      <div data-testid="demo-center-page">
        <section
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "100px 28px 80px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
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

          <div style={{ maxWidth: 680, margin: "0 auto", position: "relative" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: mkt.accentGlow,
                border: `1px solid ${mkt.accent}`,
                borderRadius: 20,
                padding: "5px 16px",
                marginBottom: 24,
              }}
            >
              <Play size={12} color={mkt.onDark} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: mkt.onDark,
                  letterSpacing: "0.04em",
                }}
              >
                INTERACTIVE DEMOS
              </span>
            </div>

            <h1
              data-testid="text-demo-center-title"
              style={{
                fontSize: "clamp(34px, 4.5vw, 56px)",
                fontWeight: 700,
                color: mkt.onDark,
                lineHeight: 1.08,
                letterSpacing: "-0.035em",
                marginBottom: 20,
              }}
            >
              Demo Center
            </h1>

            <p
              style={{
                fontSize: "clamp(16px, 1.8vw, 19px)",
                color: mkt.onDarkFaint,
                lineHeight: 1.65,
                maxWidth: 520,
                margin: "0 auto",
              }}
            >
              See our products in action. Try interactive demos and discover how
              WeFixTrades tools help you capture more leads and grow your business.
            </p>
          </div>
        </section>

        <section style={{ background: mkt.bg, padding: "72px 28px" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <div
              className="demo-cards-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 20,
              }}
            >
              {DEMO_CARDS.map((demo) => (
                <Link
                  key={demo.slug}
                  href={demo.href}
                  style={{ textDecoration: "none", color: "inherit" }}
                  data-testid={`link-demo-card-${demo.slug}`}
                >
                  <div
                    style={{
                      background: mkt.bg,
                      border: `1px solid ${mkt.border}`,
                      borderRadius: 16,
                      padding: "28px 24px",
                      cursor: "pointer",
                      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = mkt.accent;
                      (e.currentTarget as HTMLElement).style.boxShadow = shadows.cardHover;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = mkt.border;
                      (e.currentTarget as HTMLElement).style.boxShadow = "none";
                    }}
                  >
                    <div style={{ marginBottom: 16 }}>
                      <IconBadge name={demo.icon} size={22} />
                    </div>
                    <h3
                      data-testid={`text-demo-title-${demo.slug}`}
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: mkt.text,
                        marginBottom: 10,
                        lineHeight: 1.3,
                      }}
                    >
                      {demo.title}
                    </h3>
                    <p
                      style={{
                        fontSize: 15,
                        color: mkt.textMuted,
                        lineHeight: 1.65,
                        margin: 0,
                        flex: 1,
                      }}
                    >
                      {demo.desc}
                    </p>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 14,
                        fontWeight: 700,
                        color: mkt.accent,
                        marginTop: 20,
                      }}
                    >
                      Try Demo <ArrowRight size={14} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <style>{`@media (max-width: 700px) { .demo-cards-grid { grid-template-columns: 1fr !important; } }`}</style>
          </div>
        </section>

        <section
          style={{
            background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentHover} 100%)`,
            padding: "72px 28px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <h2
              style={{
                fontSize: "clamp(24px, 3vw, 36px)",
                fontWeight: 700,
                color: mkt.onDark,
                letterSpacing: "-0.025em",
                marginBottom: 16,
                lineHeight: 1.12,
              }}
            >
              Ready to see results?
            </h2>
            <p
              style={{
                fontSize: 16,
                color: mkt.onDarkMuted,
                lineHeight: 1.65,
                marginBottom: 32,
              }}
            >
              Start your free trial today. No credit card required.
            </p>
            <div
              style={{
                display: "flex",
                gap: 14,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Link
                href="/Wizard"
                data-testid="button-demo-center-cta"
                style={{
                  display: "inline-block",
                  padding: "14px 32px",
                  borderRadius: 9999,
                  background: mkt.onDark,
                  color: mkt.accent,
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Start Free Trial
              </Link>
              <Link
                href="/pricing"
                data-testid="link-demo-center-pricing"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "14px 24px",
                  borderRadius: 9999,
                  background: "transparent",
                  color: mkt.onDark,
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  border: `1.5px solid ${mkt.onDarkBorder}`,
                }}
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
