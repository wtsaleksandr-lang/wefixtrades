import { useEffect } from "react";
import { Check } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, typography } from "@/theme/tokens";

const FONT = typography.fontFamily;

export default function CheckoutSuccess() {
  useEffect(() => {
    document.title = "Payment Successful — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 24px" }}>
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          {/* Success icon */}
          <div style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(16,185,129,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
          }}>
            <Check size={32} color="#10B981" strokeWidth={2.5} />
          </div>

          <h1 style={{
            fontSize: 32,
            fontWeight: 800,
            color: mkt.onDark,
            fontFamily: FONT,
            letterSpacing: "-0.02em",
            margin: "0 0 12px",
          }}>
            You're all set!
          </h1>

          <p style={{
            fontSize: 16,
            color: mkt.text,
            lineHeight: 1.6,
            margin: "0 0 24px",
          }}>
            Your payment was successful. We're setting up your services now.
            You'll receive an onboarding email shortly with next steps.
          </p>

          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: "20px 24px",
            textAlign: "left",
            marginBottom: 32,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: mkt.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
              What happens next
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "We'll send you an onboarding form to collect a few details",
                "Our team begins setup within 24 hours",
                "You'll receive progress updates as we go",
              ].map(text => (
                <li key={text} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: mkt.text, lineHeight: 1.5 }}>
                  <Check size={14} color={mkt.accent} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 3 }} />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 28px",
              borderRadius: 12,
              background: mkt.accent,
              color: mkt.dark,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: FONT,
              textDecoration: "none",
              transition: "all 0.2s ease",
            }}
          >
            Back to Home
          </a>
        </div>
      </div>
    </MarketingLayout>
  );
}
