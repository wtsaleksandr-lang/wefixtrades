import { useMemo } from "react";
import { Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { usePageMeta } from "@/lib/usePageMeta";
import { useBreadcrumbSchema } from "@/lib/useBreadcrumbSchema";
import { Search, PhoneMissed, Calculator, ChevronRight } from "lucide-react";

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

  return (
    <MarketingLayout>
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "40px 24px 80px",
        }}
      >
        {/* Breadcrumb */}
        <nav
          aria-label="breadcrumb"
          style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}
        >
          <Link href="/" style={{ color: "#6b7280", textDecoration: "none" }}>
            Home
          </Link>
          <span style={{ margin: "0 8px" }}>/</span>
          <span style={{ color: "#111827" }}>Free Tools</span>
        </nav>

        <h1
          style={{
            fontSize: "clamp(30px, 5vw, 44px)",
            fontWeight: 900,
            letterSpacing: "-0.02em",
            color: "#111827",
            marginBottom: 12,
            lineHeight: 1.1,
          }}
        >
          Free Tools for Trade Businesses
        </h1>

        <p
          style={{
            fontSize: 18,
            color: "#4b5563",
            maxWidth: 600,
            marginBottom: 48,
            lineHeight: 1.6,
          }}
        >
          Everything you need to understand your online performance, calculate
          lost revenue, and see what instant quoting looks like — all free, no
          signup required.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 24,
          }}
        >
          {TOOLS.map((tool) => (
            <Link key={tool.href} href={tool.href} style={{ textDecoration: "none" }}>
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  padding: 28,
                  background: "#fff",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  transition: "box-shadow 0.2s, border-color 0.2s",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 4px 24px rgba(0,0,0,0.08)";
                  (e.currentTarget as HTMLDivElement).style.borderColor =
                    "#3b82f6";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                  (e.currentTarget as HTMLDivElement).style.borderColor =
                    "#e5e7eb";
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: "#eff6ff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <tool.icon size={22} color="#3b82f6" />
                </div>

                <h2
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#111827",
                    margin: 0,
                  }}
                >
                  {tool.title}
                </h2>

                <p
                  style={{
                    fontSize: 15,
                    color: "#6b7280",
                    lineHeight: 1.6,
                    margin: 0,
                    flex: 1,
                  }}
                >
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
      </div>
    </MarketingLayout>
  );
}
