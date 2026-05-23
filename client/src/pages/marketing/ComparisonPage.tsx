import { useEffect } from "react";
import { useParams, Link } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { mkt, shadows } from "@/theme/tokens";
import { getComparisonBySlug, type ComparisonData } from "@/config/comparisons";
import { ArrowRight, CheckCircle2, X as XIcon, Shield } from "lucide-react";
import NotFound from "@/pages/not-found";

/* ─── Cell renderer ─── */
function CellValue({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <CheckCircle2 size={18} color="#34D399" strokeWidth={2} />
      </span>
    );
  }
  if (value === false) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <XIcon size={16} color={mkt.onDarkFaint} strokeWidth={2} />
      </span>
    );
  }
  return (
    <span style={{ fontSize: 13, color: mkt.onDarkMuted, fontWeight: 500 }}>
      {value}
    </span>
  );
}

/* ─── Comparison Table ─── */
function ComparisonTable({ data }: { data: ComparisonData }) {
  const colCount = data.competitors.length + 2; // feature + us + competitors
  return (
    <div data-theme="light"
      style={{
        background: mkt.sectionLight,
        border: `1px solid ${mkt.onDarkBorder}`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: shadows.card,
      }}
    >
      {/* Mobile scroll hint */}
      <p
        style={{
          fontSize: 11,
          color: mkt.onDarkFaint,
          padding: "8px 16px 0",
          margin: 0,
          display: "none",
        }}
        className="compare-scroll-hint"
      >
        Scroll right to see all columns
      </p>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
            minWidth: colCount * 160,
          }}
        >
          <thead>
            <tr style={{ borderBottom: `2px solid ${mkt.onDarkBorder}` }}>
              <th
                style={{
                  textAlign: "left",
                  padding: "16px 20px",
                  color: mkt.onDarkMuted,
                  fontWeight: 500,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                Feature
              </th>
              <th
                style={{
                  textAlign: "center",
                  padding: "16px 20px",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  fontSize: 14,
                  background: "rgba(13,60,252,0.10)",
                  borderLeft: `2px solid ${mkt.accent}`,
                  borderRight: `2px solid ${mkt.accent}`,
                  minWidth: 160,
                  whiteSpace: "nowrap",
                }}
              >
                <div style={{ marginBottom: 4 }}>{data.productName}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: mkt.accent }}>
                  {data.weFixTradesPrice}
                </div>
              </th>
              {data.competitors.map((c) => (
                <th
                  key={c.name}
                  style={{
                    textAlign: "center",
                    padding: "16px 20px",
                    color: mkt.onDarkMuted,
                    fontWeight: 600,
                    fontSize: 13,
                    minWidth: 140,
                    whiteSpace: "nowrap",
                  }}
                >
                  <div style={{ marginBottom: 4 }}>{c.name}</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: mkt.onDarkFaint }}>
                    {c.price}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: `1px solid ${mkt.onDarkBorder}`,
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <td
                  style={{
                    padding: "14px 20px",
                    color: mkt.onDark,
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  {row.feature}
                </td>
                <td
                  style={{
                    padding: "14px 20px",
                    textAlign: "center",
                    background: "rgba(13,60,252,0.04)",
                    borderLeft: "2px solid rgba(13,60,252,0.15)",
                    borderRight: "2px solid rgba(13,60,252,0.15)",
                  }}
                >
                  <CellValue value={row.values[0]} />
                </td>
                {row.values.slice(1).map((val, j) => (
                  <td
                    key={j}
                    style={{ padding: "14px 20px", textAlign: "center" }}
                  >
                    <CellValue value={val} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function ComparisonPage() {
  const params = useParams<{ slug: string }>();
  const data = getComparisonBySlug(params.slug ?? "");

  useScrollReveal();

  useEffect(() => {
    if (data) {
      document.title = data.seoTitle;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute("content", data.seoDescription);
      } else {
        const m = document.createElement("meta");
        m.name = "description";
        m.content = data.seoDescription;
        document.head.appendChild(m);
      }
    }
  }, [data]);

  if (!data) return <NotFound />;

  return (
    <MarketingLayout>
      <div data-theme="dark" style={{ overflowX: "hidden" }}>

        {/* ═══════════════════════════════════
            HERO
        ═══════════════════════════════════ */}
        <section
          style={{
            background: `linear-gradient(160deg, ${mkt.dark} 0%, #0F2744 55%, #1a3550 100%)`,
            padding: "80px 28px 72px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Background circles */}
          <div
            style={{
              position: "absolute",
              top: -120,
              right: -80,
              width: 500,
              height: 500,
              borderRadius: "50%",
              background: "rgba(13,60,252,0.06)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -100,
              left: -60,
              width: 400,
              height: 400,
              borderRadius: "50%",
              background: "rgba(13,60,252,0.05)",
              pointerEvents: "none",
            }}
          />

          <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center", position: "relative" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(13,60,252,0.12)",
                border: "1px solid rgba(13,60,252,0.25)",
                borderRadius: 20,
                padding: "5px 14px",
                marginBottom: 28,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: mkt.accent,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Comparison
              </span>
            </div>

            <h1
              style={{
                fontSize: "clamp(30px, 4vw, 52px)",
                fontWeight: 700,
                color: "#FFFFFF",
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                marginBottom: 20,
              }}
            >
              {data.heroTitle}
            </h1>

            <p
              style={{
                fontSize: "clamp(16px, 1.8vw, 19px)",
                color: "rgba(255,255,255,0.6)",
                lineHeight: 1.65,
                maxWidth: 600,
                margin: "0 auto 32px",
              }}
            >
              {data.heroSubtitle}
            </p>

            {/* Savings highlight */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(52,211,153,0.12)",
                border: "1px solid rgba(52,211,153,0.25)",
                borderRadius: 12,
                padding: "10px 20px",
              }}
            >
              <Shield size={16} color="#34D399" strokeWidth={2} />
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#34D399",
                }}
              >
                {data.savingsHighlight}
              </span>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════
            COMPARISON TABLE
        ═══════════════════════════════════ */}
        <section style={{ background: mkt.bg, padding: "64px 20px 80px" }}>
          <div style={{ maxWidth: 960, margin: "0 auto" }} data-reveal="fade-up">
            <ComparisonTable data={data} />
          </div>
        </section>

        {/* ═══════════════════════════════════
            WHY TRADES CHOOSE
        ═══════════════════════════════════ */}
        <section style={{ background: mkt.sectionLight, padding: "80px 28px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }} data-reveal="fade-up">
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
                Why {data.productName}
              </div>
              <h2
                style={{
                  fontSize: "clamp(24px, 3vw, 36px)",
                  fontWeight: 600,
                  color: mkt.onDark,
                  letterSpacing: "-0.025em",
                  marginBottom: 14,
                  lineHeight: 1.15,
                }}
              >
                Why trades businesses choose {data.productName}
              </h2>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 20,
              }}
            >
              {data.whyBullets.map((bullet, i) => (
                <div
                  key={i}
                  data-reveal="fade-up"
                  data-delay={String(i * 100)}
                  style={{
                    background: mkt.sectionLight,
                    border: `1px solid ${mkt.onDarkBorder}`,
                    borderRadius: 16,
                    padding: "28px 24px",
                    boxShadow: shadows.card,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: "rgba(13,60,252,0.10)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 16,
                      fontSize: 16,
                      fontWeight: 800,
                      color: mkt.accent,
                    }}
                  >
                    {i + 1}
                  </div>
                  <h3
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: mkt.onDark,
                      marginBottom: 8,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {bullet.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 14.5,
                      color: mkt.onDarkMuted,
                      lineHeight: 1.65,
                      margin: 0,
                    }}
                  >
                    {bullet.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════
            CTA
        ═══════════════════════════════════ */}
        <section
          style={{
            background: `linear-gradient(135deg, ${mkt.accent} 0%, ${mkt.accentDark} 100%)`,
            padding: "96px 28px",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 640, margin: "0 auto" }} data-reveal="scale">
            <h2
              style={{
                fontSize: "clamp(26px, 3.5vw, 44px)",
                fontWeight: 700,
                color: mkt.dark,
                letterSpacing: "-0.025em",
                marginBottom: 16,
                lineHeight: 1.1,
              }}
            >
              Ready to switch to {data.productName}?
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "rgba(0,0,0,0.55)",
                lineHeight: 1.65,
                marginBottom: 36,
                maxWidth: 480,
                margin: "0 auto 36px",
              }}
            >
              No contracts. No sales calls. Start today and see the difference.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href={data.ctaHref}
                style={{
                  display: "inline-block",
                  padding: "15px 32px",
                  borderRadius: 12,
                  background: mkt.dark,
                  color: "#FFFFFF",
                  fontSize: 16,
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: shadows.button,
                }}
              >
                {data.ctaLabel}
              </Link>
              <Link
                href={data.productPageHref}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "15px 28px",
                  borderRadius: 12,
                  background: "transparent",
                  color: mkt.dark,
                  fontSize: 16,
                  fontWeight: 600,
                  textDecoration: "none",
                  border: "2px solid rgba(0,0,0,0.2)",
                }}
              >
                See Full Product Details
                <ArrowRight size={16} strokeWidth={2} />
              </Link>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "rgba(0,0,0,0.35)",
                marginTop: 24,
              }}
            >
              No credit card required . Cancel anytime
            </p>
          </div>
        </section>

        {/* Responsive styles */}
        <style>{`
          @media (max-width: 700px) {
            .compare-scroll-hint { display: block !important; }
          }
        `}</style>
      </div>
    </MarketingLayout>
  );
}
