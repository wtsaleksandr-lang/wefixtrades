import { useEffect } from "react";
import { Check, Mail, ArrowRight } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, typography } from "@/theme/tokens";

const FONT = typography.fontFamily;

export default function CheckoutSuccess() {
  useEffect(() => {
    document.title = "Payment Successful — WeFixTrades";
  }, []);

  return (
    <MarketingLayout>
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ maxWidth: 540, width: "100%" }}>

          {/* Success icon */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(16,185,129,0.15)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}>
              <Check size={32} color="#10B981" strokeWidth={2.5} />
            </div>

            <h1 style={{
              fontSize: "clamp(24px, 4vw, 32px)",
              fontWeight: 800,
              color: mkt.onDark,
              fontFamily: FONT,
              letterSpacing: "-0.02em",
              margin: "0 0 8px",
            }}>
              Payment successful
            </h1>

            <p style={{
              fontSize: 16,
              color: mkt.text,
              lineHeight: 1.6,
              margin: 0,
            }}>
              Thank you — your services are being set up now.
            </p>
          </div>

          {/* Email notice */}
          <div style={{
            background: mkt.accentTint,
            border: "1px solid rgba(102,232,250,0.12)",
            borderRadius: 12,
            padding: "16px 20px",
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            marginBottom: 24,
          }}>
            <Mail size={20} color={mkt.accent} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark, marginBottom: 4 }}>
                Check your email
              </div>
              <div style={{ fontSize: 13, color: mkt.text, lineHeight: 1.55 }}>
                If any of your services require onboarding information, we've sent a short
                form to the email you provided. Please complete it so our team can get
                started right away.
              </div>
            </div>
          </div>

          {/* What happens next */}
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 32,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: mkt.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
              What happens next
            </div>
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14, counterReset: "steps" }}>
              {[
                { title: "Complete onboarding", desc: "Fill out the short form we emailed you (takes ~5 minutes). This gives our team the info they need to configure your services." },
                { title: "We start setup", desc: "Our team begins working on your account within 24 hours. No action needed from you while we set things up." },
                { title: "You'll hear from us", desc: "We'll send progress updates and let you know as each service goes live. Expect your first update within 1–2 business days." },
              ].map((step, i) => (
                <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    color: mkt.accent,
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: mkt.onDark, marginBottom: 2 }}>{step.title}</div>
                    <div style={{ fontSize: 13, color: mkt.text, lineHeight: 1.55 }}>{step.desc}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* CTA */}
          <div style={{ textAlign: "center" }}>
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
              }}
            >
              Back to Home
              <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
