import { Link } from "wouter";
import { ArrowRight, MapPin } from "lucide-react";
import { mkt } from "@/theme/tokens";
import MapMockup from "./MapMockup";
import ProfileChecker from "./ProfileChecker";
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
      {/* Top-right ambient glow */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(13,60,252,0.06) 0%, transparent 70%)",
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
        className="mapguard-hero-grid"
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
            <MapPin size={14} color={mkt.accent} />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: mkt.accent,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Google Maps Optimization
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
            Get More Calls From Google
            <br />
            <span style={{ color: mkt.accent }}>— Without Running Ads</span>
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
            MapGuard sets up, fixes, and manages your Google Business Profile
            so you show up when customers search "near me" — and stay there.
          </p>

          {/* Quick bullets */}
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              "Show up when customers search nearby",
              "Get more calls without paying for ads",
              "Fully done-for-you — we handle everything",
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

          {/* Profile Checker */}
          <div style={{ position: "relative", marginBottom: 28 }}>
            <ProfileChecker />
          </div>

          {/* CTAs */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Link
              href="/pricing"
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
                boxShadow: "0 0 24px rgba(13,60,252,0.2)",
                transition: "box-shadow 0.3s ease, transform 0.2s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = "0 0 40px rgba(13,60,252,0.35)";
                el.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.boxShadow = "0 0 24px rgba(13,60,252,0.2)";
                el.style.transform = "translateY(0)";
              }}
            >
              Get Your Free GBP Audit
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/pricing"
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
            >
              See Pricing
            </Link>
          </div>
        </div>

        {/* Right: Map Visual */}
        <div
          data-reveal="fade-left"
          data-delay="200"
          style={{ display: "flex", justifyContent: "center" }}
        >
          <MapMockup />
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .mapguard-hero-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
        }
      `}</style>
    </section>
  );
}
