import { useState, useMemo, useRef } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, colors } from "@/theme/tokens";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { PageMeta } from "@/components/seo/PageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import NextStepSuggestions from "@/components/marketing/NextStepSuggestions";
import TrustStrip from "@/components/marketing/TrustStrip";
import { ArrowRight, Play, ChevronDown } from "lucide-react";

/* ─── Page constants ─── */

const BASE = "https://wefixtrades.com";
const DEMO_VIDEO_PATH = "/videos/quotequick-demo-loop.mp4";

/* ─── Page Component ─── */
//
// Wave 51 (2026-05-27): This page was a "live demo" mounting a real
// QuoteWidget pre-seeded with a Junk Removal preset. Alex's direction:
// the wizard itself is the free trial, so the embedded widget on this
// page is misleading (it's not what visitors actually get when they
// click "Try"). Restructured into a product TOUR — video placeholder
// at top with badge slots Alex will populate, single CTA below pointing
// to /wizard. URL preserved for SEO.
export default function QuoteCalculatorDemo() {
  const breadcrumbs = useMemo(
    () => [
      { name: "Home", url: `${BASE}/` },
      { name: "QuoteQuick", url: `${BASE}/products/quickquotepro` },
      { name: "How it works", url: `${BASE}/products/quickquotepro/demo` },
    ],
    [],
  );
  useBreadcrumbSchema(breadcrumbs);

  // BE-3 — graceful video degradation. The MP4 file is dropped in by Alex
  // post-PR (see PR body). Until it exists, the <video> element emits an
  // error event and we swap in a black placeholder with a play-icon overlay
  // so the page still looks intentional.
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <MarketingLayout>
      <PageMeta
        title="See how QuoteQuick works | WeFixTrades"
        description="Watch a 60-second tour of QuoteQuick — the online quote calculator that captures leads and bookings while you sleep."
        canonical="/products/quickquotepro/demo"
        keywords={["quotequick tour", "quote calculator tour", "how quotequick works"]}
      />
      <style>{`
        /* Wave 51 — tour badge slots. Hidden by default; Alex will toggle
           via inline style override once copy lands and video timings are
           known. Fade hooks pre-wired so the eventual reveal is a 1-line
           change (display:flex + add .is-visible). */
        .tour-badge {
          position: absolute;
          display: none;
          align-items: center;
          padding: 8px 12px;
          min-width: 120px;
          max-width: 160px;
          background: rgba(13, 21, 20, 0.78);
          color: rgba(255, 255, 255, 1);
          font-size: 12px;
          font-weight: 600;
          line-height: 1.25;
          border-radius: 999px;
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 280ms ease, transform 280ms ease;
          pointer-events: none;
          z-index: 2;
        }
        .tour-badge.is-visible {
          display: inline-flex;
          opacity: 1;
          transform: translateY(0);
        }
        .tour-badge--tl { top: 12px; left: 12px; }
        .tour-badge--tr { top: 12px; right: 12px; }
        .tour-badge--bl { bottom: 12px; left: 12px; }
        .tour-badge--br { bottom: 12px; right: 12px; }

        .tour-cta {
          transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
        }
        .tour-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 30px rgba(13, 60, 252, 0.28);
          filter: brightness(1.04);
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
            <span style={{ color: mkt.text }}>How it works</span>
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
              See how <span style={{ color: mkt.accent }}>QuoteQuick</span> works
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
              A 60-second tour of what your customers see — then build your own
              for free.
            </p>
          </div>

          {/* ─── Looped video (16:9, centered) with badge overlay slots ─── */}
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto clamp(20px, 3vw, 28px)",
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

              {/* Wave 51 — Tour badge slots. 4 positioned overlays Alex will
                  populate with copy + timed reveal once the actual MP4 is in
                  place. CSS in <style> above handles positioning + fade hooks.
                  To activate any badge: add className="tour-badge is-visible"
                  and drop copy between the tags. */}
              {/* TODO Alex: fill copy + show */}
              <div
                className="tour-badge tour-badge--tl"
                data-testid="tour-badge-1"
                aria-hidden="true"
              />
              {/* TODO Alex: fill copy + show */}
              <div
                className="tour-badge tour-badge--tr"
                data-testid="tour-badge-2"
                aria-hidden="true"
              />
              {/* TODO Alex: fill copy + show */}
              <div
                className="tour-badge tour-badge--bl"
                data-testid="tour-badge-3"
                aria-hidden="true"
              />
              {/* TODO Alex: fill copy + show */}
              <div
                className="tour-badge tour-badge--br"
                data-testid="tour-badge-4"
                aria-hidden="true"
              />
            </div>
            <p
              style={{
                fontSize: 13,
                color: mkt.onDarkMuted,
                textAlign: "center",
                margin: "10px 0 0",
              }}
            >
              60-second tour of the customer experience
            </p>
          </div>

          {/* ─── Primary CTA: send to wizard ─── */}
          <div style={{ textAlign: "center" }}>
            <Link
              href="/wizard"
              className="tour-cta"
              data-testid="tour-cta-wizard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 28px",
                borderRadius: 12,
                background: mkt.accent,
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                textDecoration: "none",
                margin: "24px auto 0",
              }}
            >
              Try the wizard yourself <ArrowRight size={20} />
            </Link>
            <p
              style={{
                fontSize: 13,
                color: mkt.onDarkMuted,
                margin: "10px 0 0",
              }}
            >
              Free · No signup · 60 seconds to build yours
            </p>
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
          {/* Wave 51 — kept. FAQ items are operational (accuracy, mobile,
              lead delivery, embed, trial) and frame OUTCOMES rather than
              the product-page feature list, so not duplicate content. */}
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
