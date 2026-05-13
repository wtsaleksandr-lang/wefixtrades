import { useMemo, useState } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { V7Hero, V7PageShell } from "@/components/marketing/v7";
import { usePageMeta } from "@/lib/usePageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { useFaqSchema } from "@/lib/useFaqSchema";
import { Search, PhoneMissed, Calculator, ChevronRight, ChevronDown } from "lucide-react";
import { mkt } from "@/theme/tokens";

const TOOLS = [
  {
    href: "/tools/free-audit",
    icon: Search,
    title: "Google Business Audit",
    description:
      "Free instant audit of your Google Business Profile and website. See how you stack up against competitors in your area.",
    tag: "Most popular",
  },
  {
    href: "/tools/missed-call-calculator",
    icon: PhoneMissed,
    title: "Missed Call Revenue Calculator",
    description:
      "Calculate how much revenue your trade business loses from missed calls every month — and how to recover it.",
    tag: null,
  },
  {
    href: "/tools/quote-demo",
    icon: Calculator,
    title: "Instant Quote Demo",
    description:
      "Try our live quote calculator widget. See how instant quoting can convert more website visitors into booked jobs.",
    tag: null,
  },
];

const FAQ_ITEMS = [
  {
    question: "Are these tools really free?",
    answer:
      "Yes — all tools are completely free with no signup required. We built them to help trade businesses understand their online performance and identify growth opportunities.",
  },
  {
    question: "Do I need to create an account?",
    answer:
      "No account needed. You can use any tool instantly. If you'd like a detailed report emailed to you, we'll just ask for your email at that point.",
  },
  {
    question: "How is my data used?",
    answer:
      "We don't sell your data. Business information is only used to generate your results. See our privacy policy for full details.",
  },
  {
    question: "Can I use these tools for any trade?",
    answer:
      "Yes — our tools support 25+ trade types including plumbing, HVAC, electrical, roofing, landscaping, cleaning, and many more.",
  },
];

const BASE = "https://wefixtrades.com";

export default function ToolsHub() {
  usePageMeta({
    title: "Free Tools for Trade Businesses | WeFixTrades",
    description:
      "Free marketing tools built for trade businesses: Google audit, missed call revenue calculator, and instant quote demo.",
    canonicalPath: "/tools",
  });

  const breadcrumbs = useMemo(
    () => [
      { name: "Home", url: `${BASE}/` },
      { name: "Free Tools", url: `${BASE}/tools` },
    ],
    [],
  );
  useBreadcrumbSchema(breadcrumbs);

  const faqSchemaItems = useMemo(
    () => FAQ_ITEMS.map((f) => ({ question: f.question, answer: f.answer })),
    [],
  );
  useFaqSchema(faqSchemaItems);

  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  return (
    <MarketingLayout>
      <V7PageShell>
        <V7Hero
          productName="Free Tools · No signup required"
          eyebrow="Try before you buy. No email walls."
          headline={<>Free tools for<br/><span style={{ color: mkt.accent }}>trade businesses.</span></>}
          sub="Understand your online performance, calculate lost revenue, and see what instant quoting looks like — all free, no signup."
        />
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "20px clamp(16px, 4vw, 24px) clamp(48px, 8vw, 96px)",
        }}
      >

        {/* Tool Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "clamp(16px, 3vw, 20px)",
            marginBottom: "clamp(48px, 8vw, 80px)",
          }}
        >
          {TOOLS.map((tool, i) => {
            const isHovered = hoveredCard === i;
            return (
              <Link key={tool.href} href={tool.href} style={{ textDecoration: "none" }}>
                <div
                  onMouseEnter={() => setHoveredCard(i)}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    border: `1px solid ${isHovered ? mkt.accent : mkt.border}`,
                    borderRadius: 16,
                    padding: "clamp(22px, 3vw, 28px)",
                    background: isHovered ? mkt.surfaceAlt : mkt.surface,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                    cursor: "pointer",
                    boxShadow: isHovered
                      ? `0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px ${mkt.accent}`
                      : "0 1px 3px rgba(0,0,0,0.12)",
                    transform: isHovered ? "translateY(-4px)" : "translateY(0)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {/* Tag */}
                  {tool.tag && (
                    <span
                      style={{
                        position: "absolute",
                        top: 14,
                        right: 14,
                        fontSize: 11,
                        fontWeight: 600,
                        color: mkt.accent,
                        background: mkt.accentTint,
                        padding: "3px 8px",
                        borderRadius: 6,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {tool.tag}
                    </span>
                  )}

                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: mkt.accentTint,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background 0.25s",
                      ...(isHovered ? { background: mkt.accentGlow } : {}),
                    }}
                  >
                    <tool.icon size={20} color={mkt.accent} />
                  </div>

                  <h2 style={{ fontSize: "clamp(17px, 2.5vw, 19px)", fontWeight: 700, color: mkt.onDark, margin: 0 }}>
                    {tool.title}
                  </h2>

                  <p style={{ fontSize: 14, color: mkt.onDarkMuted, lineHeight: 1.6, margin: 0, flex: 1 }}>
                    {tool.description}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 14,
                      fontWeight: 600,
                      color: mkt.accent,
                      transition: "gap 0.2s",
                      ...(isHovered ? { gap: 8 } : {}),
                    }}
                  >
                    Try it free <ChevronRight size={16} style={{ transition: "transform 0.2s", transform: isHovered ? "translateX(2px)" : "none" }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: "clamp(22px, 3vw, 28px)",
              fontWeight: 800,
              color: mkt.onDark,
              marginBottom: "clamp(16px, 3vw, 24px)",
              letterSpacing: "-0.02em",
            }}
          >
            Frequently asked questions
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {FAQ_ITEMS.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  style={{
                    border: `1px solid ${mkt.onDarkBorder}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: mkt.sectionLight,
                    transition: "border-color 0.2s",
                  }}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "14px 16px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      fontSize: 15,
                      fontWeight: 600,
                      color: mkt.onDark,
                      lineHeight: 1.4,
                    }}
                  >
                    {item.question}
                    <ChevronDown
                      size={16}
                      color={mkt.onDarkFaint}
                      style={{
                        flexShrink: 0,
                        transition: "transform 0.2s",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0)",
                      }}
                    />
                  </button>
                  {isOpen && (
                    <div
                      style={{
                        padding: "0 16px 14px",
                        fontSize: 14,
                        color: mkt.onDarkMuted,
                        lineHeight: 1.65,
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
      </div>
      </V7PageShell>
    </MarketingLayout>
  );
}
