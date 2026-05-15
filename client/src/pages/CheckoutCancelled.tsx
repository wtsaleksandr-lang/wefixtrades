import { useEffect } from "react";
import { X, ArrowRight } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, typography } from "@/theme/tokens";

const FONT = typography.fontFamily;

export default function CheckoutCancelled() {
  useEffect(() => {
    document.title = "Checkout Cancelled — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ maxWidth: 480, textAlign: "center" }}>

          {/* Icon */}
          <div style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}>
            <X size={28} color={mkt.onDarkMuted} strokeWidth={2} />
          </div>

          <h1 style={{
            fontSize: "clamp(22px, 4vw, 28px)",
            fontWeight: 800,
            color: mkt.onDark,
            fontFamily: FONT,
            letterSpacing: "-0.02em",
            margin: "0 0 10px",
          }}>
            Payment not completed
          </h1>

          <p style={{
            fontSize: 15,
            color: mkt.onDark,
            lineHeight: 1.6,
            margin: "0 0 12px",
          }}>
            Your checkout was cancelled and no payment was taken.
            Your selected services have not been activated.
          </p>

          <p style={{
            fontSize: 14,
            color: mkt.onDarkMuted,
            lineHeight: 1.6,
            margin: "0 0 32px",
          }}>
            You can return to the pricing page to try again, or contact us
            if you have any questions.
          </p>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <a
              href="/pricing"
              className="wft-hover-border-white"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 28px",
                borderRadius: 12,
                background: mkt.accent,
                color: "#FFFFFF",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: FONT,
                textDecoration: "none",
              }}
            >
              Back to Pricing
              <ArrowRight size={16} />
            </a>

            <a
              href="/contact"
              style={{
                fontSize: 13,
                color: mkt.accent,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Need help? Contact us
            </a>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
