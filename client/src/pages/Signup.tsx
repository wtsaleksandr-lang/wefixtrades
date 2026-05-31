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
import MicrosoftSignInButton from "@/components/auth/MicrosoftSignInButton";
import FacebookSignInButton from "@/components/auth/FacebookSignInButton";
import { ga4Event } from "@/lib/ga4";
import { SmsConsentDisclosure } from "@/components/forms/SmsConsentDisclosure";

export default function SignupPage() {
  const [businessName, setBusinessName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [, navigate] = useLocation();
  usePageTitle("Create Free Account");

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
    signup.mutate();
  };

  const labelStyle = {
    display: "block" as const,
    fontSize: 12,
    fontWeight: 600,
    color: mkt.textFaint,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 6,
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    fontSize: 14,
    color: mkt.onDark,
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${mkt.onDarkBorder}`,
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box" as const,
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
            <MicrosoftSignInButton mode="signup" />
            <FacebookSignInButton mode="signup" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
            <div style={{ flex: 1, height: 1, background: mkt.onDarkBorder }} />
            <span style={{ fontSize: 11, color: mkt.onDarkMuted, letterSpacing: "0.08em" }}>OR</span>
            <div style={{ flex: 1, height: 1, background: mkt.onDarkBorder }} />
          </div>

          <form onSubmit={handleSubmit}>
            <label htmlFor="signup-business-name" style={labelStyle}>Business name</label>
            <input
              id="signup-business-name"
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Smith Plumbing Ltd"
              style={{ ...inputStyle, marginBottom: 20 }}
            />

            <label htmlFor="signup-name" style={labelStyle}>Your name</label>
            <input
              id="signup-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Smith"
              autoComplete="name"
              style={{ ...inputStyle, marginBottom: 20 }}
            />

            <label htmlFor="signup-email" style={labelStyle}>Email</label>
            <input
              id="signup-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              style={{ ...inputStyle, marginBottom: 20 }}
            />

            <label htmlFor="signup-password" style={labelStyle}>Password</label>
            <input
              id="signup-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              style={{ ...inputStyle, marginBottom: 20 }}
            />

            <label htmlFor="signup-phone" style={labelStyle}>Phone <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input
              id="signup-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <div style={{ marginBottom: 20 }}>
              <SmsConsentDisclosure variant="inline" />
            </div>

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
              disabled={signup.isPending}
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
                opacity: signup.isPending ? 0.7 : 1,
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
