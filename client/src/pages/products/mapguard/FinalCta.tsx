import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { mkt } from "@/theme/tokens";
import { HEADING_FONT, BODY_FONT, GLOW_CYAN_STRONG, SECTION_PAD } from "./styles";

export default function FinalCta() {
  return (
    <section
      style={{
        ...SECTION_PAD,
        position: "relative",
        overflow: "hidden",
        textAlign: "center",
        background: mkt.dark,
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(13,60,252,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        data-reveal="scale"
        style={{ maxWidth: 600, margin: "0 auto", position: "relative" }}
      >
        <h2
          style={{
            fontFamily: HEADING_FONT,
            fontSize: "clamp(28px, 4vw, 44px)",
            fontWeight: 800,
            color: mkt.onDark,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            marginBottom: 16,
          }}
        >
          Let Us Manage{" "}
          <span style={{ color: mkt.accent }}>Your Google Visibility.</span>
        </h2>

        <p
          style={{
            fontFamily: BODY_FONT,
            fontSize: 16,
            color: mkt.textMuted,
            lineHeight: 1.65,
            maxWidth: 460,
            margin: "0 auto 36px",
          }}
        >
          Get a free audit of your Google Business Profile and see exactly where you stand.
          <br />
          <span style={{ fontSize: 14, opacity: 0.8 }}>
            We'll show you what's holding you back — and handle the fix for you.
          </span>
        </p>

        <Link
          href="/pricing"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 40px",
            borderRadius: 14,
            background: mkt.accent,
            color: mkt.dark,
            fontSize: 16,
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: GLOW_CYAN_STRONG,
            transition: "box-shadow 0.3s ease, transform 0.2s ease",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.boxShadow = "0 0 50px rgba(13,60,252,0.4), 0 0 80px rgba(13,60,252,0.15)";
            el.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.boxShadow = GLOW_CYAN_STRONG;
            el.style.transform = "translateY(0)";
          }}
        >
          Get My Free GBP Audit
          <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}
