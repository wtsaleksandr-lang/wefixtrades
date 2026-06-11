/**
 * /checkout/success — post-Stripe-Checkout landing.
 *
 * P0-2 (night audit 2026-06-11): this page previously claimed
 * "Payment successful" on a bare page-load with no session_id and for
 * every non-200 verification result. It now renders strictly from the
 * verified outcome (see ./checkoutSuccessState.ts):
 *
 *   no_session  → neutral "no order found" + redirect to /pricing
 *   verifying   → neutral "confirming your order" (no success claims)
 *   verified    → success copy (server confirmed the session is PAID via
 *                 /api/auth/checkout-login, which re-checks Stripe
 *                 payment_status before minting the session)
 *   pending     → honest "still confirming" (webhook race / consumed token)
 *   unconfirmed → honest "payment not confirmed" (Stripe says not settled)
 */
import { useEffect, useState, useRef } from "react";
import { Check, Mail, ArrowRight, LogIn, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt, typography } from "@/theme/tokens";
import {
  initialOutcome,
  isSuccess,
  outcomeForLoginResponse,
  NETWORK_ERROR,
  type CheckoutOutcome,
} from "./checkoutSuccessState";

const FONT = typography.fontFamily;

function readSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("session_id");
}

export default function CheckoutSuccess() {
  const [, navigate] = useLocation();
  const [outcome, setOutcome] = useState<CheckoutOutcome>(() => initialOutcome(readSessionId()));
  const attemptedRef = useRef(false);

  // Title + noindex. The title only asserts success once verified.
  useEffect(() => {
    document.title = isSuccess(outcome)
      ? "Payment Successful — WeFixTrades"
      : "Order Status — WeFixTrades";
    // Prevent indexing of transactional checkout result pages.
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "noindex, nofollow");
  }, [outcome]);

  // Bare page-load with no session: nothing to celebrate — go to pricing.
  useEffect(() => {
    if (outcome !== "no_session") return;
    const t = setTimeout(() => navigate("/pricing", { replace: true }), 1500);
    return () => clearTimeout(t);
  }, [outcome, navigate]);

  // Verify the checkout session server-side (and auto-login on success).
  useEffect(() => {
    if (outcome !== "verifying" || attemptedRef.current) return;
    attemptedRef.current = true;

    const sessionId = readSessionId();
    if (!sessionId) {
      // Unreachable: initialOutcome(null) is "no_session", so this effect
      // never runs without a session id. Defensive only.
      return;
    }

    // Retries after the first call: the webhook that mints the login token
    // may still be processing right after the Stripe redirect.
    let attemptsLeft = 3;
    let cancelled = false;

    const tryVerify = async () => {
      let status: number = NETWORK_ERROR;
      let user: { id: number; email: string; role: string; name: string } | null = null;
      try {
        const res = await fetch("/api/auth/checkout-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sessionId }),
        });
        status = res.status;
        if (res.ok) {
          const data = await res.json();
          user = data?.user ?? null;
        }
      } catch {
        status = NETWORK_ERROR;
      }

      if (cancelled) return;

      const next = outcomeForLoginResponse(status, attemptsLeft);
      if (next === "retry") {
        attemptsLeft--;
        setTimeout(tryVerify, 2000);
        return;
      }
      if (next === "verified" && user) {
        queryClient.setQueryData(["auth", "me"], user);
        queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      }
      setOutcome(next);
    };

    tryVerify();
    return () => { cancelled = true; };
  }, [outcome]);

  const verified = isSuccess(outcome);

  /* ─── Per-outcome header content (icon / heading / sub) ─── */
  const header = (() => {
    switch (outcome) {
      case "verified":
        return {
          icon: <Check size={32} color={mkt.success} strokeWidth={2.5} />,
          iconBg: "rgba(16,185,129,0.15)",
          heading: "Payment successful — you're all set!",
          sub: "Your account is ready and your services are being set up now.",
        };
      case "verifying":
        return {
          icon: <Loader2 size={32} color={mkt.accent} strokeWidth={2.5} style={{ animation: "wftCsSpin 1s linear infinite" }} />,
          iconBg: "rgba(13,60,252,0.12)",
          heading: "Confirming your order…",
          sub: "We're verifying your payment with Stripe. This usually takes a few seconds — please keep this page open.",
        };
      case "pending":
        return {
          icon: <Clock size={32} color={mkt.warning} strokeWidth={2.5} />,
          iconBg: "rgba(247,180,48,0.15)",
          heading: "We're still confirming your payment",
          sub: "Confirmation is taking a little longer than usual. If you completed checkout, your receipt and setup email will arrive shortly — check your inbox.",
        };
      case "unconfirmed":
        return {
          icon: <AlertTriangle size={32} color={mkt.warning} strokeWidth={2.5} />,
          iconBg: "rgba(247,180,48,0.15)",
          heading: "Payment not confirmed",
          sub: "We couldn't confirm payment for this checkout session. If you paid by bank debit (ACH), settlement can take a few business days — we'll email you the moment it clears. If checkout didn't complete, you can pick up where you left off.",
        };
      case "no_session":
        return {
          icon: <ArrowRight size={32} color={mkt.accent} strokeWidth={2.5} />,
          iconBg: "rgba(13,60,252,0.12)",
          heading: "No order found",
          sub: "This page confirms completed checkouts. Taking you to our pricing page…",
        };
    }
  })();

  return (
    <MarketingLayout>
      <div data-theme="dark" style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ maxWidth: 540, width: "100%" }}>

          {/* Status icon + heading */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: header.iconBg,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}>
              {header.icon}
            </div>

            <h1 style={{
              fontSize: "clamp(24px, 4vw, 32px)",
              fontWeight: 800,
              color: mkt.onDark,
              fontFamily: FONT,
              letterSpacing: "-0.02em",
              margin: "0 0 8px",
            }}>
              {header.heading}
            </h1>

            <p style={{
              fontSize: 16,
              color: mkt.onDark,
              lineHeight: 1.6,
              margin: "0 0 16px",
            }}>
              {header.sub}
            </p>

            {verified && (
              <div style={{
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: 10,
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: mkt.success,
                textAlign: "center",
              }}>
                Your dashboard is ready
                <div style={{ fontSize: 12, fontWeight: 400, color: mkt.onDark, marginTop: 4 }}>
                  You're logged in and can access your portal now.
                </div>
              </div>
            )}

            {outcome === "pending" && (
              <div style={{
                background: "rgba(13,60,252,0.08)",
                border: "1px solid rgba(13,60,252,0.2)",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                color: mkt.accent,
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}>
                <LogIn size={14} />
                Already completed setup? Log in to your portal below.
              </div>
            )}
          </div>

          {/* Email notice — verified: email sent; pending: what to expect */}
          {(verified || outcome === "pending") && (
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
                  {verified
                    ? "If any of your services require onboarding information, we've sent a short form to the email you provided. Please complete it so our team can get started right away."
                    : "Once your payment is confirmed you'll receive a receipt, and — if any of your services require onboarding information — a short setup form at the email you provided."}
                </div>
              </div>
            </div>
          )}

          {/* What happens next — only after a VERIFIED payment */}
          {verified && (
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
          )}

          {/* CTAs per outcome */}
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {verified && (
              <button
                onClick={() => navigate("/portal")}
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
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Go to your dashboard
                <ArrowRight size={16} />
              </button>
            )}

            {outcome === "pending" && (
              <>
                <button
                  onClick={() => navigate("/login")}
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
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Log in to your portal
                  <ArrowRight size={16} />
                </button>
                <a href="/" style={{ fontSize: 13, color: mkt.onDarkMuted, textDecoration: "underline" }}>
                  Back to Home
                </a>
              </>
            )}

            {outcome === "unconfirmed" && (
              <>
                <button
                  onClick={() => navigate("/pricing")}
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
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Back to Pricing
                  <ArrowRight size={16} />
                </button>
                <a href="mailto:support@wefixtrades.com" style={{ fontSize: 13, color: mkt.onDarkMuted, textDecoration: "underline" }}>
                  Questions? support@wefixtrades.com
                </a>
              </>
            )}

            {outcome === "no_session" && (
              <button
                onClick={() => navigate("/pricing", { replace: true })}
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
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Go to Pricing now
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes wftCsSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </MarketingLayout>
  );
}
