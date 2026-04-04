import { Link } from "wouter";
import { ArrowRight, Calculator, ChevronDown } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLASS } from "./styles";

export default function HeroSection() {
  return (
    <section
      style={{
        background: `linear-gradient(160deg, ${mkt.dark} 0%, #0a1a1f 55%, #0f2028 100%)`,
        padding: "120px 24px 80px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(102,232,250,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 60,
          alignItems: "center",
        }}
        className="qq-hero-grid"
      >
        {/* Left: Copy */}
        <div data-reveal="fade-right">
          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              ...GLASS,
              borderRadius: 999,
              marginBottom: 24,
            }}
          >
            <Calculator size={14} color={mkt.accent} />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: mkt.accent,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Instant Quote Calculator
            </span>
          </div>

          <h1
            style={{
              fontFamily: HEADING_FONT,
              fontSize: "clamp(34px, 5vw, 54px)",
              fontWeight: 800,
              color: mkt.onDark,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              marginBottom: 20,
            }}
          >
            Turn Website Visitors Into Leads{" "}
            <span style={{ color: mkt.accent }}>With Instant Quotes</span>
          </h1>

          <p
            style={{
              fontFamily: BODY_FONT,
              fontSize: "clamp(15px, 1.6vw, 18px)",
              color: mkt.textMuted,
              lineHeight: 1.7,
              marginBottom: 28,
              maxWidth: 480,
            }}
          >
            Your customers get prices in seconds. You get every lead — name,
            email, phone, and quote amount — sent straight to your inbox.
          </p>

          {/* Bullets */}
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              "Customers get prices in seconds",
              "Every quote becomes a lead sent to you",
              "Works on any website",
              "Built for local trades",
            ].map((b) => (
              <li
                key={b}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 14,
                  color: mkt.onDarkMuted,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: mkt.accent,
                    flexShrink: 0,
                  }}
                />
                {b}
              </li>
            ))}
          </ul>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Link
              href="/signup?product=quotequick"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 28px",
                borderRadius: 12,
                background: mkt.accent,
                color: mkt.dark,
                fontSize: 15,
                fontWeight: 700,
                textDecoration: "none",
                boxShadow: "0 0 24px rgba(102,232,250,0.2)",
                transition: "box-shadow 0.3s ease, transform 0.2s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = "0 0 40px rgba(102,232,250,0.35)";
                el.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = "0 0 24px rgba(102,232,250,0.2)";
                el.style.transform = "translateY(0)";
              }}
            >
              Get QuoteQuick — From $49/mo
              <ArrowRight size={16} />
            </Link>
            <a
              href="#qq-demo"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 24px",
                borderRadius: 12,
                background: "transparent",
                color: mkt.onDark,
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                border: `1.5px solid ${mkt.border}`,
                transition: "border-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.2)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = mkt.border;
              }}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("qq-demo")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Try the Live Demo
              <ChevronDown size={16} />
            </a>
          </div>
        </div>

        {/* Right: Visual */}
        <div
          data-reveal="fade-left"
          data-delay="200"
          style={{ display: "flex", justifyContent: "center" }}
        >
          <div style={{
            ...GLASS,
            padding: "32px 24px",
            width: "100%",
            maxWidth: 360,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧮</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: mkt.accent, fontFamily: "'Inter', monospace", marginBottom: 8 }}>
              $414.00
            </div>
            <div style={{ fontSize: 13, color: mkt.textFaint, marginBottom: 20 }}>Your Estimate</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Base Fee", amount: "$89.00" },
                { label: "2 fixtures × $65", amount: "$130.00" },
                { label: "Emergency", amount: "$75.00" },
                { label: "Camera Inspection", amount: "$120.00" },
              ].map((line) => (
                <div key={line.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: mkt.textMuted }}>
                  <span>{line.label}</span>
                  <span style={{ fontWeight: 600, color: mkt.onDark }}>{line.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .qq-hero-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
        }
      `}</style>
    </section>
  );
}
