import { useParams, Link } from "wouter";
import { ArrowLeft, Play, ArrowRight } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { IconBadge } from "@/components/IconBadge";
import { PRODUCTS } from "@/site/siteMap";
import NotFound from "@/pages/not-found";
import { mkt, shadows } from "@/theme/tokens";

const DEMO_CONFIGS: Record<
  string,
  { title: string; desc: string; icon: string; productSlug: string; features: string[] }
> = {
  "ai-chatline": {
    title: "AI ChatLine Demo",
    desc: "Experience how AI ChatLine captures website visitors and SMS leads around the clock. Watch the chat widget qualify prospects, collect contact info, and send you instant notifications.",
    icon: "message",
    productSlug: "ai-chatline",
    features: [
      "Live chat widget simulation",
      "SMS lead capture flow",
      "Instant qualification questions",
      "Real-time notification preview",
    ],
  },
  "ai-callline": {
    title: "AI CallLine Demo",
    desc: "Hear how AI CallLine answers calls, captures caller details, and delivers instant summaries so you never miss a lead — even at 2 AM.",
    icon: "phone",
    productSlug: "ai-callline",
    features: [
      "AI voice greeting simulation",
      "Caller info capture flow",
      "Call summary preview",
      "Notification delivery demo",
    ],
  },
  quotequick: {
    title: "QuoteQuick Demo",
    desc: "Try an interactive quote calculator. See how homeowners get instant estimates on your website, boosting engagement and capturing qualified leads.",
    icon: "calculator",
    productSlug: "quotequick",
    features: [
      "Interactive calculator widget",
      "Dynamic pricing logic",
      "Lead capture form",
      "Mobile-responsive design",
    ],
  },
  "tradeline-complete": {
    title: "TradeLine Complete Demo",
    desc: "See Chat + Voice + DMs working together as a single unified lead engine. Every channel covered, every lead captured.",
    icon: "workflow",
    productSlug: "tradeline-complete",
    features: [
      "Multi-channel lead flow",
      "Unified inbox preview",
      "Auto follow-up sequences",
      "Real-time lead dashboard",
    ],
  },
};

export default function DemoPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const demo = DEMO_CONFIGS[slug];

  if (!demo) return <NotFound />;

  const product = PRODUCTS.find((p) => p.slug === demo.productSlug);

  return (
    <MarketingLayout>
      <div data-testid={`demo-page-${slug}`}>
        <section
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "100px 28px 72px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -80,
              left: -80,
              width: 380,
              height: 380,
              borderRadius: "50%",
              background: mkt.accentGlow,
              pointerEvents: "none",
            }}
          />

          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
            <Link
              href="/demos"
              data-testid="link-back-to-demos"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: mkt.onDarkFaint,
                textDecoration: "none",
                marginBottom: 28,
              }}
            >
              <ArrowLeft size={14} />
              Back to Demo Center
            </Link>

            <div style={{ marginBottom: 20 }}>
              <IconBadge name={demo.icon} size={24} />
            </div>

            <h1
              data-testid="text-demo-title"
              style={{
                fontSize: "clamp(30px, 4vw, 48px)",
                fontWeight: 700,
                color: mkt.onDark,
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                marginBottom: 18,
              }}
            >
              {demo.title}
            </h1>

            <p
              style={{
                fontSize: "clamp(15px, 1.6vw, 18px)",
                color: mkt.onDarkFaint,
                lineHeight: 1.65,
                maxWidth: 560,
                marginBottom: 32,
              }}
            >
              {demo.desc}
            </p>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Link
                href="/wizard"
                data-testid="button-demo-start-free"
                style={{
                  display: "inline-block",
                  padding: "13px 28px",
                  borderRadius: 9999,
                  background: mkt.accent,
                  color: mkt.onDark,
                  fontSize: 15,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Start Free Trial
              </Link>
              {product && (
                <Link
                  href={`/products/${product.slug}`}
                  data-testid="link-demo-view-product"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "13px 24px",
                    borderRadius: 9999,
                    background: "transparent",
                    color: mkt.onDark,
                    fontSize: 15,
                    fontWeight: 600,
                    textDecoration: "none",
                    border: `1.5px solid ${mkt.onDarkBorder}`,
                  }}
                >
                  View Product Details
                </Link>
              )}
            </div>
          </div>
        </section>

        <section style={{ background: mkt.bg, padding: "72px 28px" }}>
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <div
              style={{
                background: mkt.surface,
                border: `1px solid ${mkt.border}`,
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <div
                data-testid="demo-personalized-card"
                style={{
                  minHeight: 400,
                  background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 60%, #1a3550 100%)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 20,
                  padding: "48px 32px",
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 18,
                    background: "rgba(13,60,252,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Play size={32} color={mkt.accent} />
                </div>
                <h3
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: mkt.onDark,
                    margin: 0,
                    textAlign: "center",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Schedule a Personalized Demo
                </h3>
                <p
                  style={{
                    fontSize: 15,
                    color: mkt.onDarkFaint,
                    maxWidth: 400,
                    textAlign: "center",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  See exactly how {demo.title} handles real conversations, captures leads,
                  and fits into your daily workflow. Our team will walk you through
                  a live demo tailored to your trade.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", width: "100%", maxWidth: 320, marginTop: 4 }}>
                  <a
                    href="/book"
                    data-testid="button-demo-book-call"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      width: "100%",
                      padding: "14px 28px",
                      borderRadius: 12,
                      background: mkt.accent,
                      color: mkt.dark,
                      fontSize: 15,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Book a Free Demo Call
                    <ArrowRight size={16} />
                  </a>
                  <span style={{ fontSize: 12, color: mkt.onDarkFaint }}>
                    No commitment. 15 minutes. See it live.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ background: mkt.surface, padding: "72px 28px" }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <h2
              style={{
                fontSize: "clamp(22px, 2.5vw, 32px)",
                fontWeight: 700,
                color: mkt.text,
                letterSpacing: "-0.025em",
                marginBottom: 28,
                textAlign: "center",
              }}
            >
              What you'll see in this demo
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 14,
              }}
            >
              {demo.features.map((f, i) => (
                <div
                  key={f}
                  data-testid={`text-demo-feature-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 18px",
                    background: mkt.bg,
                    border: `1px solid ${mkt.border}`,
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 500,
                    color: mkt.text,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: mkt.accentTint,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 700,
                      color: mkt.accent,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  {f}
                </div>
              ))}
            </div>
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
              Want a personalized walkthrough?
            </h2>
            <p
              style={{
                fontSize: 16,
                color: mkt.onDarkMuted,
                lineHeight: 1.65,
                marginBottom: 32,
              }}
            >
              Our team can show you exactly how {product?.name || demo.title} works
              for your trade. No commitment required.
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
                href="/contact"
                data-testid="button-demo-contact"
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
                Book a Walkthrough
              </Link>
              <Link
                href="/wizard"
                data-testid="button-demo-try-free"
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
                Start Free Trial <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
