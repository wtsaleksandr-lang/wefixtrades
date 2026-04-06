import { useMemo, useState } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { usePageMeta } from "@/lib/usePageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { useFaqSchema } from "@/lib/useFaqSchema";
import TrustStrip from "@/components/marketing/TrustStrip";
import { Search, PhoneMissed, Calculator, ChevronRight, ChevronDown } from "lucide-react";

const TOOLS = [
  {
    href: "/tools/free-audit",
    icon: Search,
    title: "Google Business Audit",
    description:
      "Free instant audit of your Google Business Profile and website. See how you stack up against competitors in your area.",
  },
  {
    href: "/tools/missed-call-calculator",
    icon: PhoneMissed,
    title: "Missed Call Revenue Calculator",
    description:
      "Calculate how much revenue your trade business loses from missed calls every month — and how to recover it.",
  },
  {
    href: "/tools/quote-demo",
    icon: Calculator,
    title: "Instant Quote Demo",
    description:
      "Try our live quote calculator widget. See how instant quoting can convert more website visitors into booked jobs.",
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

  return (
    <MarketingLayout>
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "clamp(24px, 5vw, 40px) clamp(16px, 4vw, 24px) clamp(40px, 8vw, 80px)",
        }}
      >
        {/* Breadcrumb */}
        <nav
          aria-label="breadcrumb"
          style={{ fontSize: 14, color: "#6b7280", marginBottom: "clamp(16px, 3vw, 24px)" }}
        >
          <Link href="/" style={{ color: "#6b7280", textDecoration: "none" }}>
            Home
          </Link>
          <span style={{ margin: "0 8px" }}>/</span>
          <span style={{ color: "#111827" }}>Free Tools</span>
        </nav>

        <h1
          style={{
            fontSize: "clamp(28px, 5vw, 44px)",
            fontWeight: 900,
            letterSpacing: "-0.02em",
            color: "#111827",
            marginBottom: 10,
            lineHeight: 1.1,
          }}
        >
          Free Tools for Trade Businesses
        </h1>

        <p
          style={{
            fontSize: "clamp(15px, 2.5vw, 18px)",
            color: "#4b5563",
            maxWidth: 600,
            marginBottom: "clamp(28px, 5vw, 48px)",
            lineHeight: 1.6,
          }}
        >
          Everything you need to understand your online performance, calculate
          lost revenue, and see what instant quoting looks like — all free, no
          signup required.
        </p>

        {/* Tool Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "clamp(16px, 3vw, 24px)",
          }}
        >
          {TOOLS.map((tool) => (
            <Link key={tool.href} href={tool.href} style={{ textDecoration: "none" }}>
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  padding: "clamp(20px, 3vw, 28px)",
                  background: "#fff",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  transition: "box-shadow 0.2s, border-color 0.2s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 4px 24px rgba(0,0,0,0.08)";
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#3b82f6";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#e5e7eb";
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "#eff6ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <tool.icon size={20} color="#3b82f6" />
                </div>

                <h2 style={{ fontSize: "clamp(17px, 2.5vw, 20px)", fontWeight: 700, color: "#111827", margin: 0 }}>
                  {tool.title}
                </h2>

                <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: 0, flex: 1 }}>
                  {tool.description}
                </p>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#3b82f6",
                  }}
                >
                  Try it free <ChevronRight size={16} />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Trust Strip */}
        <TrustStrip theme="light" />

        {/* FAQ */}
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: "clamp(20px, 3vw, 26px)",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "clamp(16px, 3vw, 24px)",
              letterSpacing: "-0.01em",
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
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#fff",
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
                      color: "#111827",
                      lineHeight: 1.4,
                    }}
                  >
                    {item.question}
                    <ChevronDown
                      size={16}
                      color="#9ca3af"
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
                        color: "#6b7280",
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
    </MarketingLayout>
  );
}
