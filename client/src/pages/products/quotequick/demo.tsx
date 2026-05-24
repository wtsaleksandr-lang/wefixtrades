import { useState, useMemo, useRef } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import QuoteWidget from "@/components/quote-widget/QuoteWidget";
import CalculatorLauncher from "@/components/quote-widget/CalculatorLauncher";
import { mkt, colors } from "@/theme/tokens";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { PageMeta } from "@/components/seo/PageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import NextStepSuggestions from "@/components/marketing/NextStepSuggestions";
import TrustStrip from "@/components/marketing/TrustStrip";
import type { CalculatorData } from "@/components/quote-widget/types";
import {
  getTemplatePreset,
  toAdvancedConfig,
  type BusinessProfile,
} from "@shared/templatePresets";
import {
  ArrowRight, Play, ChevronDown, MessageSquare, LayoutGrid,
} from "lucide-react";

/* ─── Page constants ─── */

const DARK = "#0d1514";
const CYAN = "#0d3cfc";
const BASE = "https://wefixtrades.com";
const DEMO_VIDEO_PATH = "/videos/quotequick-demo-loop.mp4";

/* ─── Pre-seeded sample business profile (Junk Removal) ─── */

const SAMPLE_BUSINESS_PROFILE: BusinessProfile = {
  googleRating: 4.8,
  googleReviewCount: 234,
  yearsInBusiness: 12,
  licenseNumber: "Sample - Demo Only",
  insuredAmount: "Insured up to $2M",
  serviceArea: "Phoenix Metro",
};

/**
 * Build the demo `CalculatorData` from the real `junk_removal_quote` preset.
 *
 * Alex's 2026-05-21 decision: the tool IS the demo. Mount the REAL widget
 * (`QuoteWidget` → `AdvancedCalculator` via `calculator_settings.advanced`),
 * pre-seeded with the Junk Removal template — it ships range pricing + the
 * BD-2a-style overrides already, so visitors see the full multi-step + sticky
 * shell + range pricing + trust signals on first paint.
 */
function buildDemoCalculator(): CalculatorData {
  const preset = getTemplatePreset("junk_removal_quote");
  if (!preset) {
    // Guarded fallback — preset is shipped in shared/templatePresets.ts, so
    // this branch is effectively dead, but we keep `pricing_config` honest.
    return {
      id: 0,
      slug: "demo-junk-removal",
      business_name: "Acme Junk Removal",
      pricing_config: null,
    };
  }
  const advanced = {
    ...toAdvancedConfig(preset),
    businessProfile: SAMPLE_BUSINESS_PROFILE,
  };
  return {
    id: 0,
    slug: "demo-junk-removal",
    business_name: "Acme Junk Removal",
    tagline: "Same-day pickup · We load, haul, sweep up",
    primary_color: "#fb923c",
    // `advanced` config bypasses the legacy pricing-family flow, so the
    // raw pricing_config is unused — pass null and let the widget code-path
    // for `isAdvanced = true` take over.
    pricing_config: null,
    calculator_settings: {
      advanced,
    },
  };
}

/* ─── Page Component ─── */

export default function QuoteCalculatorDemo() {
  // Title + meta tags handled by <PageMeta> below.

  const breadcrumbs = useMemo(
    () => [
      { name: "Home", url: `${BASE}/` },
      { name: "QuoteQuick", url: `${BASE}/products/quickquotepro` },
      { name: "Live Demo", url: `${BASE}/products/quickquotepro/demo` },
    ],
    [],
  );
  useBreadcrumbSchema(breadcrumbs);

  const demoCalculator = useMemo(() => buildDemoCalculator(), []);

  // BE-3 — graceful video degradation. The MP4 file is dropped in by Alex
  // post-PR (see PR body). Until it exists, the <video> element emits an
  // error event and we swap in a black placeholder with a play-icon overlay
  // so the page still looks intentional.
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // P1 UX (2026-05-22) — "Try floating mode" toggle. Lets prospective
  // customers see the embedded widget AND the BD-3m floating launcher
  // experience without going through the wizard. Defaults to inline;
  // clicking "Floating launcher" hides the embed and mounts a real
  // CalculatorLauncher fixed-positioned in the bottom-right of the page
  // viewport. The launcher's open/close + fold/unfold animation come
  // from the component itself (same 400ms two-phase chain that ships in
  // production for paying customers).
  const [demoMode, setDemoMode] = useState<'inline' | 'floating'>('inline');

  return (
    <MarketingLayout>
      <PageMeta
        title="See QuoteQuick in action — live demo"
        description="The actual QuoteQuick calculator your customers will use. No signup needed — try the real widget with sample junk-removal pricing."
        canonical="/products/quickquotepro/demo"
        keywords={["quotequick demo", "quote calculator demo"]}
      />
      <style>{`
        .demo-cta-wrap {
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
        .demo-cta-wrap:hover {
          border-color: rgba(0,0,0,0.45) !important;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }
        .demo-cta-text {
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .demo-cta-wrap:hover .demo-cta-text {
          transform: translateX(8px);
        }
        .demo-arrow-track {
          display: flex;
          width: 104px;
          transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .demo-cta-wrap:hover .demo-arrow-track {
          transform: translateX(-52px);
        }
      `}</style>

      <section data-theme="light"
        style={{
          background: mkt.bg,
          minHeight: "100vh",
          padding:
            "clamp(100px, 12vw, 140px) clamp(16px, 5vw, 40px) clamp(48px, 8vw, 80px)",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {/* Breadcrumb */}
          <nav
            aria-label="breadcrumb"
            style={{
              fontSize: 13,
              color: mkt.onDarkMuted,
              marginBottom: 16,
            }}
          >
            <Link
              href="/"
              style={{ color: mkt.onDarkMuted, textDecoration: "none" }}
            >
              Home
            </Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <Link
              href="/products/quickquotepro"
              style={{ color: mkt.onDarkMuted, textDecoration: "none" }}
            >
              QuoteQuick
            </Link>
            <span style={{ margin: "0 6px" }}>/</span>
            <span style={{ color: mkt.text }}>Live Demo</span>
          </nav>

          {/* BI-1 — link to anonymous AI demo. Sits above the headline so
              visitors who landed here looking for a quick "AI builds it"
              option see the cross-link before scrolling. */}
          <Link
            href="/products/quickquotepro/build-with-ai"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 16px",
              marginBottom: "clamp(20px, 3vw, 28px)",
              borderRadius: 12,
              background: "rgba(13,60,252,0.08)",
              border: "1px solid rgba(13,60,252,0.35)",
              color: mkt.onDark,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.01em",
            }}
          >
            <span style={{ color: mkt.onDark }}>
              Or — let AI build your calculator from a photo of your invoice
            </span>
            <ArrowRight size={16} strokeWidth={2} color={mkt.accent} />
          </Link>

          {/* ─── Headline ─── */}
          <div
            style={{
              textAlign: "center",
              marginBottom: "clamp(24px, 4vw, 32px)",
            }}
          >
            <h1
              style={{
                fontSize: "clamp(28px, 5vw, 40px)",
                fontWeight: 700,
                color: colors.effortel.n300,
                lineHeight: 1.1,
                letterSpacing: "-0.025em",
                margin: "0 0 14px",
              }}
            >
              See <span style={{ color: mkt.accent }}>QuoteQuick</span> in
              action
            </h1>
            <p
              style={{
                fontSize: "clamp(15px, 2vw, 17px)",
                color: mkt.onDarkMuted,
                lineHeight: 1.55,
                margin: 0,
                maxWidth: 520,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              The actual calculator your customers will use. No signup needed
              to try it.
            </p>
          </div>

          {/* ─── Looped video (16:9, centered) ─── */}
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto clamp(32px, 5vw, 48px)",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                paddingBottom: "56.25%", // 16:9
                borderRadius: 14,
                overflow: "hidden",
                background: "#000",
                border: `1px solid ${mkt.onDarkBorder}`,
              }}
            >
              {!videoFailed && (
                <video
                  ref={videoRef}
                  src={DEMO_VIDEO_PATH}
                  autoPlay
                  loop
                  muted
                  playsInline
                  onError={() => setVideoFailed(true)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              )}
              {videoFailed && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  aria-hidden="true"
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 9999,
                      background: "rgba(255,255,255,0.10)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Play size={24} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                  </div>
                </div>
              )}
            </div>
            <p
              style={{
                fontSize: 13,
                color: mkt.onDarkMuted,
                textAlign: "center",
                margin: "10px 0 0",
              }}
            >
              60-second look — or scroll down to try it live
            </p>
          </div>

          {/* ─── Live widget caption ─── */}
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: mkt.accent,
              textAlign: "center",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              margin: "0 0 12px",
            }}
          >
            This is a real, working calculator — try it
          </p>

          {/* P1 UX (2026-05-22) — "View inline | View as floating launcher"
           *  toggle. Lets visitors see the floating-launcher mode in action
           *  on this demo page without having to build a calculator first.
           *
           *  Inline mode (default): the embedded QuoteWidget renders below.
           *  Floating mode: the embed is hidden and a CalculatorLauncher
           *  is mounted fixed-positioned in the bottom-right of the page
           *  viewport. The launcher uses the same 400ms two-phase fold/
           *  unfold animation that ships in production. */}
          <div
            className="demo-mode-toggle"
            role="group"
            aria-label="Choose how the calculator is displayed"
            data-testid="demo-mode-toggle"
            style={{
              display: "inline-flex",
              alignSelf: "center",
              margin: "0 auto 18px",
              padding: 4,
              borderRadius: 999,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${mkt.onDarkBorder}`,
              gap: 2,
            }}
          >
            <button
              type="button"
              onClick={() => setDemoMode('inline')}
              aria-pressed={demoMode === 'inline'}
              data-testid="demo-mode-inline"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                background: demoMode === 'inline' ? mkt.accent : "transparent",
                color: demoMode === 'inline' ? "#fff" : mkt.onDarkMuted,
                transition: "background 0.18s ease, color 0.18s ease",
              }}
            >
              <LayoutGrid size={14} aria-hidden="true" />
              View inline
            </button>
            <button
              type="button"
              onClick={() => setDemoMode('floating')}
              aria-pressed={demoMode === 'floating'}
              data-testid="demo-mode-floating"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                background: demoMode === 'floating' ? mkt.accent : "transparent",
                color: demoMode === 'floating' ? "#fff" : mkt.onDarkMuted,
                transition: "background 0.18s ease, color 0.18s ease",
              }}
            >
              <MessageSquare size={14} aria-hidden="true" />
              View as floating launcher
            </button>
          </div>
          {demoMode === 'floating' && (
            <p
              style={{
                fontSize: 12.5,
                color: mkt.onDarkMuted,
                textAlign: "center",
                margin: "-6px 0 14px",
              }}
              data-testid="demo-mode-floating-hint"
            >
              Look at the bottom-right of the page — click the bubble to expand.
            </p>
          )}

          {/* ─── Live Widget (real AdvancedCalculator instance) ─── */}
          <div style={{ maxWidth: 780, margin: "0 auto" }}>
            {demoMode === 'inline' && (
              <div style={{ marginBottom: "clamp(28px, 4vw, 40px)" }}>
                <QuoteWidget calculator={demoCalculator} isEmbed={false} />
              </div>
            )}
            {demoMode === 'floating' && (
              <div
                style={{
                  marginBottom: "clamp(28px, 4vw, 40px)",
                  padding: "clamp(48px, 8vw, 80px) 24px",
                  borderRadius: 16,
                  border: `1px dashed ${mkt.onDarkBorder}`,
                  background: "rgba(255,255,255,0.02)",
                  textAlign: "center",
                  color: mkt.onDarkMuted,
                  fontSize: 14,
                }}
                data-testid="demo-floating-placeholder"
              >
                The calculator is now docked as a floating bubble in the
                bottom-right corner of the page. Click it to expand.
              </div>
            )}
          </div>

          {/* P1 UX (2026-05-22) — Floating launcher mount. Lives outside the
           *  scrolling content so the bubble + expanded panel are fixed to
           *  the viewport (the launcher itself uses position:fixed). Only
           *  mounted when demoMode === 'floating' so it doesn't paint over
           *  the inline preview. */}
          {demoMode === 'floating' && (
            <CalculatorLauncher
              calculatorId="demo-junk-removal"
              config={{ enabled: true, position: 'bottom-right' }}
              proTierUnlocked={false}
              accent={mkt.accent}
            >
              <QuoteWidget calculator={demoCalculator} isEmbed={false} />
            </CalculatorLauncher>
          )}

          {/* ─── CTA ─── */}
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <Link
              href="/products/quickquotepro"
              style={{
                textDecoration: "none",
                display: "block",
                marginBottom: 16,
              }}
            >
              <div
                className="demo-cta-wrap"
                style={{
                  background: CYAN,
                  borderRadius: 16,
                  border: "2px solid transparent",
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                <div className="demo-cta-text" style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: "clamp(17px, 2.5vw, 20px)",
                      fontWeight: 700,
                      color: DARK,
                      lineHeight: 1.2,
                      marginBottom: 4,
                    }}
                  >
                    Build your own in 5 minutes
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: "rgba(13,21,20,0.6)",
                      fontWeight: 500,
                    }}
                  >
                    No credit card required · Live in 5 minutes · Free + from $29/mo
                  </div>
                </div>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    background: DARK,
                    borderRadius: 10,
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  <div className="demo-arrow-track" style={{ height: 52 }}>
                    {[0, 1].map((i) => (
                      <div
                        key={i}
                        style={{
                          width: 52,
                          height: 52,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <ArrowRight size={20} color="white" strokeWidth={2.2} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          </div>

          {/* ─── Cross-tool suggestions ─── */}
          <div
            style={{
              maxWidth: 640,
              margin: "clamp(32px, 5vw, 48px) auto 0",
            }}
          >
            <NextStepSuggestions context="demo" theme="dark" />
          </div>

          {/* ─── Trust Strip ─── */}
          <TrustStrip theme="dark" />

          {/* ─── FAQ ─── */}
          <DemoFaqSection />
        </div>
      </section>
    </MarketingLayout>
  );
}

/* ═══ FAQ Section ═══ */

const DEMO_FAQ_ITEMS = [
  {
    question: "How accurate are the quotes?",
    answer:
      "Quotes are calculated from pricing rules you define — base fees, hourly rates, per-sqft pricing, add-ons, and modifiers. The customer sees numbers based on your actual rates, so accuracy is in your control.",
  },
  {
    question: "Can I customize the pricing and questions?",
    answer:
      "Yes. QuoteQuick supports 10 pricing options including hourly rates, per square foot, tiered packages, and service call + hourly. You can add custom extras, job complexity levels, travel fees, and after-hours surcharges.",
  },
  {
    question: "Does it work on mobile?",
    answer:
      "Yes. The quote widget is fully responsive and optimized for mobile. Customers can complete the entire flow — from selecting options to submitting their details — on any device.",
  },
  {
    question: "How are leads delivered?",
    answer:
      "When a customer submits a quote, you receive an email with their name, email, phone number, quote amount, and all their selections. Leads also appear in your dashboard for easy follow-up.",
  },
  {
    question: "How do I add it to my website?",
    answer:
      "You embed a single line of code on any page. It works with WordPress, Wix, Squarespace, and any platform that supports HTML. No developer needed — setup takes under 10 minutes.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes — QuoteQuick has a Free forever plan. Try the full demo on this page to see exactly how it works. Paid plans start at $29/mo (Pro removes the WeFixTrades badge + adds custom domain & SMS). No contracts — cancel anytime.",
  },
];

function DemoFaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const faqSchemaItems = useMemo(
    () =>
      DEMO_FAQ_ITEMS.map((f) => ({
        question: f.question,
        answer: f.answer,
      })),
    [],
  );
  useFaqSchema(faqSchemaItems);

  return (
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        paddingTop: "clamp(32px, 5vw, 48px)",
        borderTop: `1px solid ${mkt.onDarkBorder}`,
        marginTop: "clamp(32px, 5vw, 48px)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: mkt.accent,
          letterSpacing: "0.12em",
          textTransform: "uppercase" as const,
          marginBottom: 14,
          textAlign: "center",
        }}
      >
        FAQ
      </div>
      <h2
        style={{
          fontSize: "clamp(22px, 3vw, 30px)",
          fontWeight: 700,
          color: colors.effortel.n300,
          letterSpacing: "-0.025em",
          lineHeight: 1.15,
          margin: "0 0 24px",
          textAlign: "center",
        }}
      >
        Frequently Asked Questions
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {DEMO_FAQ_ITEMS.map((item, i) => {
          const isOpen = openIdx === i;
          return (
            <div
              key={i}
              style={{
                border: `1px solid ${mkt.onDarkBorder}`,
                borderRadius: 14,
                overflow: "hidden",
                transition: "border-color 0.2s ease",
              }}
            >
              <button
                onClick={() => setOpenIdx(isOpen ? null : i)}
                aria-expanded={isOpen}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "18px 22px",
                  background: isOpen ? mkt.surface : "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: mkt.onDark,
                  fontSize: 15,
                  fontWeight: 600,
                  textAlign: "left",
                  lineHeight: 1.4,
                  transition: "background 0.2s ease",
                }}
              >
                <span>{item.question}</span>
                <ChevronDown
                  size={17}
                  color={mkt.onDarkFaint}
                  style={{
                    flexShrink: 0,
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                />
              </button>

              {isOpen && (
                <div
                  style={{
                    padding: "0 22px 18px",
                    fontSize: 14,
                    color: mkt.onDarkMuted,
                    lineHeight: 1.7,
                  }}
                >
                  {item.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
