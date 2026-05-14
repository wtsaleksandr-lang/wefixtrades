import { useEffect, useState, useRef } from "react";
import { Check, Mail, ArrowRight, LogIn } from "lucide-react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, typography } from "@/theme/tokens";

const FONT = typography.fontFamily;

export default function CheckoutSuccess() {
  const [, navigate] = useLocation();
  const [autoLoginState, setAutoLoginState] = useState<"idle" | "loading" | "success" | "failed">("idle");
  const attemptedRef = useRef(false);

  useEffect(() => {
    document.title = "Payment Successful — WeFixTrades";
  }, []);

  // Auto-login via checkout session
  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;

    setAutoLoginState("loading");

    // Retry up to 3 times with 2s delay (webhook may still be processing)
    let attempts = 0;
    const maxAttempts = 3;

    const tryLogin = async () => {
      try {
        const res = await fetch("/api/auth/checkout-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sessionId }),
        });

        if (res.ok) {
          const data = await res.json();
          queryClient.setQueryData(["auth", "me"], data.user);
          queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
          setAutoLoginState("success");
          return;
        }

        // 404 = token not ready yet (webhook hasn't fired)
        if (res.status === 404 && attempts < maxAttempts) {
          attempts++;
          setTimeout(tryLogin, 2000);
          return;
        }

        setAutoLoginState("failed");
      } catch {
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(tryLogin, 2000);
          return;
        }
        setAutoLoginState("failed");
      }
    };

    tryLogin();
  }, []);

  const isLoggedIn = autoLoginState === "success";

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
              {isLoggedIn ? "You're all set!" : "Payment successful"}
            </h1>

            <p style={{
              fontSize: 16,
              color: mkt.onDark,
              lineHeight: 1.6,
              margin: "0 0 16px",
            }}>
              {isLoggedIn
                ? "Your account is ready and your services are being set up now."
                : "Thank you — your services are being set up now."}
            </p>

            {/* Auto-login status */}
            {autoLoginState === "loading" && (
              <div style={{
                background: "rgba(13,60,252,0.08)",
                border: "1px solid rgba(13,60,252,0.2)",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                color: mkt.accent,
                textAlign: "center",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}>
                <LogIn size={14} />
                Setting up your account...
              </div>
            )}

            {isLoggedIn && (
              <div style={{
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: 10,
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: "#10B981",
                textAlign: "center",
              }}>
                Your dashboard is ready
                <div style={{ fontSize: 12, fontWeight: 400, color: mkt.onDark, marginTop: 4 }}>
                  You're logged in and can access your portal now.
                </div>
              </div>
            )}

            {!isLoggedIn && autoLoginState !== "loading" && (
              <div style={{
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: 10,
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: "#10B981",
                textAlign: "center",
              }}>
                Next step: check your email and complete setup
                <div style={{ fontSize: 12, fontWeight: 400, color: mkt.onDark, marginTop: 4 }}>
                  Takes 2-3 minutes. We'll handle the rest.
                </div>
              </div>
            )}
          </div>

          {/* Email notice */}
          <div style={{
            background: "rgba(13,60,252,0.10)",
            border: "1px solid rgba(13,60,252,0.12)",
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
              <div style={{ fontSize: 13, color: mkt.onDark, lineHeight: 1.55 }}>
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
                { title: "You'll hear from us", desc: "We'll send progress updates and let you know as each service goes live. Expect your first update within 1-2 business days." },
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
                    <div style={{ fontSize: 13, color: mkt.onDark, lineHeight: 1.55 }}>{step.desc}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* CTA */}
          <div style={{ textAlign: "center" }}>
            {isLoggedIn ? (
              <button
                onClick={() => navigate("/portal")}
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
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Go to your dashboard
                <ArrowRight size={16} />
              </button>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
