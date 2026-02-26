import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Check } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { PRODUCT_PAGES, CATEGORY_LABELS, type ProductCategory } from "@/config/products";

const C = {
  navy: "#0B1F3A",
  sage: "#4A7C6F",
  heading: "#111111",
  body: "#444444",
  muted: "#6B6B6B",
  border: "#E5E5E3",
  bg: "#FFFFFF",
  surface: "#F7F7F6",
};

const CATEGORIES: { key: ProductCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "core", label: "Core Tools" },
  { key: "ai", label: "AI Employees" },
  { key: "growth", label: "Growth Services" },
];

export default function ProductIndex() {
  useScrollReveal();
  const [filter, setFilter] = useState<ProductCategory | "all">("all");

  useEffect(() => {
    document.title = "Products & Services — WeFixTrades | Tools for Trades Businesses";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", "Explore WeFixTrades products and services: instant quote calculators, AI employees, booking, SEO, social media, reputation management, and more.");
    }
  }, []);

  const filtered = filter === "all" ? PRODUCT_PAGES : PRODUCT_PAGES.filter((p) => p.category === filter);

  return (
    <MarketingLayout>
      <div data-testid="product-index-page">

        <section
          style={{
            background: `linear-gradient(160deg, ${C.navy} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "80px 28px 72px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: -80, right: -80, width: 420, height: 420, borderRadius: "50%", background: "rgba(74,124,111,0.1)", pointerEvents: "none" }} />

          <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
            <h1
              data-testid="product-index-headline"
              style={{
                fontSize: "clamp(32px, 4vw, 52px)",
                fontWeight: 700, color: "#FFFFFF",
                lineHeight: 1.1, letterSpacing: "-0.035em",
                marginBottom: 20,
              }}
            >
              Products & Services
            </h1>
            <p style={{ fontSize: "clamp(16px, 1.8vw, 19px)", color: "rgba(255,255,255,0.6)", lineHeight: 1.65, maxWidth: 540, margin: "0 auto" }}>
              Everything you need to generate leads, automate follow-ups, and grow your trades business.
            </p>
          </div>
        </section>

        <section style={{ background: C.bg, padding: "48px 28px 72px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto" }}>

            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 48 }} data-testid="category-filters">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  data-testid={`filter-${cat.key}`}
                  onClick={() => setFilter(cat.key)}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 9999,
                    border: `1.5px solid ${filter === cat.key ? C.sage : C.border}`,
                    background: filter === cat.key ? "#EFF5F2" : "transparent",
                    color: filter === cat.key ? C.sage : C.muted,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div
              className="products-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}
            >
              {filtered.map((product, idx) => (
                <Link
                  key={product.slug}
                  href={`/product/${product.slug}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    data-testid={`product-index-card-${product.slug}`}
                    data-reveal="fade-up"
                    data-delay={String(Math.min((idx + 1) * 80, 400))}
                    className="mkt-feature-card"
                    style={{
                      background: C.bg,
                      border: `1px solid ${C.border}`,
                      borderRadius: 18,
                      padding: "28px 24px",
                      cursor: "pointer",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      transition: "border-color 0.3s ease, box-shadow 0.3s ease",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.sage, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                      {CATEGORY_LABELS[product.category]}
                    </div>

                    <h3 style={{ fontSize: 20, fontWeight: 700, color: C.heading, marginBottom: 6, letterSpacing: "-0.01em" }}>
                      {product.name}
                    </h3>
                    <p style={{ fontSize: 14, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
                      {product.shortTagline}
                    </p>

                    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                      {product.highlights.slice(0, 3).map((h) => (
                        <li key={h} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: C.body, lineHeight: 1.4 }}>
                          <Check size={14} color={C.sage} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>

                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.sage, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        Learn more <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <style>{`@media (max-width: 700px) { .products-grid { grid-template-columns: 1fr !important; } }`}</style>
          </div>
        </section>

      </div>
    </MarketingLayout>
  );
}
