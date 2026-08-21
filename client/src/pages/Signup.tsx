import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { getSessionId } from "@/lib/chatHelpers";
import { landingPathForRole } from "@/lib/authRedirect";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { V7PageShell } from "@/components/marketing/v7";
import { mkt } from "@/theme/tokens";
import { usePageTitle } from "@/hooks/usePageTitle";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import FacebookSignInButton from "@/components/auth/FacebookSignInButton";
import AppleSignInButton from "@/components/auth/AppleSignInButton";
import { FreeToolFormField, FreeToolFormFieldStyles } from "@/components/marketing/FreeToolFormField";
import { ga4Event } from "@/lib/ga4";
import {
  SmsConsentDisclosure,
  SMS_CONSENT_LABEL,
  SMS_CONSENT_VERSION,
} from "@/components/forms/SmsConsentDisclosure";

export default function SignupPage() {
  const [businessName, setBusinessName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [, navigate] = useLocation();
  usePageTitle("Create Free Account");

  // TCPA: a phone number may only be submitted with an affirmative opt-in.
  const phoneProvided = phone.trim().length > 0;
  const consentRequired = phoneProvided && !smsConsent;

  // ─── GA4: signup_started ───
  // Fires once on page mount; we count "page reached" as the funnel-top
  // signal. A second event would fire on first form-field interaction —
  // the page-mount signal is plenty for measuring drop-off from /pricing
  // → /signup → portal handoff.
  const gaSignupStartedRef = useRef(false);
  useEffect(() => {
    if (gaSignupStartedRef.current) return;
    gaSignupStartedRef.current = true;
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    ga4Event("signup_started", {
      source: params?.get("source") ?? null,
    });
  }, []);

  /* BI-1 — anonymous AI demo handoff. When the visitor signs up after the
   * /tools/build-with-ai/preview gate, the URL is shaped as
   *   /signup?source=ai-demo&demo=<session_id>
   * The server reads the session id, materialises a real calculator on the
   * new account, and returns a `redirect` path the client should follow.
   * Falls through to /portal if the session expired (graceful). */
  const demoSessionId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("demo") || "";
  }, []);

  const signup = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          name,
          businessName,
          phone: phone || undefined,
          // TCPA: explicit opt-in + the exact text the user agreed to.
          smsConsent: phone.trim() ? smsConsent : false,
          smsConsentText: phone.trim() && smsConsent ? SMS_CONSENT_LABEL : undefined,
          smsConsentVersion: phone.trim() && smsConsent ? SMS_CONSENT_VERSION : undefined,
          demoSessionId: demoSessionId || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Signup failed");
      }
      return res.json();
    },
    onSuccess: (data: { user: { role?: string }; redirect?: string | null }) => {
      // Must match the /api/auth/me shape `{ user, adminProPreview }` that
      // useAuth() reads — storing the raw user makes the cache's `.user`
      // undefined, so RequireClient on the destination route reads the
      // brand-new session as unauthenticated and bounces to /login before
      // the refetch lands (same bug login.tsx fixed 2026-05-23).
      queryClient.setQueryData(["auth", "me"], { user: data.user, adminProPreview: false });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });

      ga4Event("signup_completed", { source: demoSessionId ? "ai-demo" : null });

      try {
        const chatSessionId = getSessionId();
        if (chatSessionId) {
          fetch("/api/auth/link-chat-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ chatSessionId }),
          }).catch(() => {});
        }
      } catch { /* noop */ }

      // BI-1: prefer server-supplied redirect (lands the new user in the
      // wizard editor with their freshly created AI calculator open).
      // IA-1: otherwise role-based via shared helper.
      navigate(data.redirect || landingPathForRole(data.user?.role));
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // TCPA: block submit if a phone is given without an affirmative opt-in.
    if (consentRequired) {
      setConsentError(true);
      return;
    }
    signup.mutate();
  };

  return (
    <MarketingLayout>
      <V7PageShell>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "75vh",
          padding: "100px 24px 60px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 420, background: mkt.sectionLight, borderRadius: 24, padding: "40px 32px", border: `1px solid ${mkt.onDarkBorder}` }}>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: mkt.onDark,
              marginBottom: 8,
              letterSpacing: "-0.02em",
            }}
          >
            Create your free account
          </h1>
          <p
            style={{
              fontSize: 14,
              color: mkt.onDarkMuted,
              marginBottom: 32,
              lineHeight: 1.5,
            }}
          >
            Get started with WeFixTrades — no credit card required.
          </p>

          {/* Fastest path first — one click, then a single business-name
              prompt. Falls through to the full form below. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <GoogleSignInButton mode="signup" />
            <FacebookSignInButton mode="signup" />
            <AppleSignInButton mode="signup" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: mkt.onDarkBorder }} />
            <span style={{ fontSize: 11, color: mkt.onDarkMuted, letterSpacing: "0.08em" }}>OR</span>
            <div style={{ flex: 1, height: 1, background: mkt.onDarkBorder }} />
          </div>

          <form onSubmit={handleSubmit}>
            {/* P2-1 (night audit 2026-06-11): retrofit to the locked input
                rules — title-in-field floating labels, `?` help cue top-left,
                2px gaps between stacked fields — via the shared
                FreeToolFormField primitive (same as the checkout drawer and
                every free tool). */}
            <FreeToolFormFieldStyles />
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 8, ["--ftool-label-bg" as any]: mkt.sectionLight }}>
              <FreeToolFormField
                id="signup-business-name"
                theme="dark"
                label="Business Name"
                placeholder="e.g. Smith Plumbing Ltd"
                helpText="The trading name of your business — it appears on your dashboard, quotes, and invoices."
                value={businessName}
                onChange={setBusinessName}
                autoComplete="organization"
                required
              />
              <FreeToolFormField
                id="signup-name"
                theme="dark"
                label="Your Name"
                placeholder="e.g. John Smith"
                helpText="Who we should address account emails to."
                value={name}
                onChange={setName}
                autoComplete="name"
                required
              />
              <FreeToolFormField
                id="signup-email"
                theme="dark"
                label="Email"
                type="email"
                placeholder="john@smithplumbing.com"
                helpText="You'll use this to sign in. Account and billing emails go here."
                value={email}
                onChange={setEmail}
                inputMode="email"
                autoComplete="email"
                required
              />
              <FreeToolFormField
                id="signup-password"
                theme="dark"
                label="Password"
                type="password"
                placeholder="Min. 8 characters"
                helpText="At least 8 characters. You'll use it with your email to sign in."
                value={password}
                onChange={setPassword}
                minLength={8}
                autoComplete="new-password"
                required
              />
              <FreeToolFormField
                id="signup-phone"
                theme="dark"
                label="Phone (optional)"
                type="tel"
                placeholder="(555) 123-4567"
                helpText="Optional — only needed if you'd like SMS updates (opt-in below)."
                value={phone}
                onChange={setPhone}
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            {phoneProvided && (
              <label
                htmlFor="signup-sms-consent"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  id="signup-sms-consent"
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(e) => {
                    setSmsConsent(e.target.checked);
                    if (e.target.checked) setConsentError(false);
                  }}
                  style={{
                    width: 18,
                    height: 18,
                    marginTop: 1,
                    flexShrink: 0,
                    accentColor: "#0D3CFC",
                    cursor: "pointer",
                  }}
                  data-testid="checkbox-sms-consent"
                />
                <span style={{ fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.5 }}>
                  {SMS_CONSENT_LABEL}
                </span>
              </label>
            )}
            <div style={{ marginBottom: consentError ? 6 : 20 }}>
              <SmsConsentDisclosure variant="inline" />
            </div>
            {consentError && (
              <p style={{ fontSize: 13, color: mkt.danger, marginBottom: 16 }}>
                Please tick the box to agree to SMS messages, or clear the phone field to continue without it.
              </p>
            )}

            {signup.error && (
              <p style={{ fontSize: 13, color: mkt.danger, marginBottom: 16 }}>
                {signup.error.message}
              </p>
            )}

            {/* B2 fix (2026-05-20): submit was rendering beige/cream because it
                read `mkt.buttonBg` / `mkt.buttonText`, which are deprecated
                aliases for the cream secondary tokens. Primary conversion
                surface should match /login's "Email me a link →" — brand blue
                #0D3CFC with off-white text. */}
            <button
              type="submit"
              disabled={signup.isPending || consentRequired}
              style={{
                width: "100%",
                padding: "14px 0",
                fontSize: 14,
                fontWeight: 600,
                color: "#D5E1E7",
                background: "#0D3CFC",
                border: "none",
                borderRadius: 10,
                cursor: signup.isPending ? "wait" : "pointer",
                opacity: signup.isPending || consentRequired ? 0.7 : 1,
                letterSpacing: "0.04em",
                transition: "background 0.15s ease, opacity 0.15s ease",
              }}
            >
              {signup.isPending ? "Creating account..." : "Create free account"}
            </button>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <a
                href="/login"
                style={{ fontSize: 13, color: mkt.onDarkMuted, textDecoration: "none" }}
                onMouseOver={(e) => (e.currentTarget.style.color = mkt.text)}
                onMouseOut={(e) => (e.currentTarget.style.color = mkt.onDarkMuted)}
              >
                Already have an account? Log in
              </a>
            </div>
          </form>
        </div>
      </div>
      </V7PageShell>
    </MarketingLayout>
  );
}
