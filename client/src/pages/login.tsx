import { useState, useEffect, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { getSessionId } from "@/lib/chatHelpers";
import { landingPathForRole } from "@/lib/authRedirect";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { V7PageShell } from "@/components/marketing/v7";
import { mkt } from "@/theme/tokens";
import { usePageTitle } from "@/hooks/usePageTitle";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { AuthCard } from "@/components/auth/AuthCard";

/** Friendly copy for the ?google_error= codes the OAuth callback may return. */
const GOOGLE_ERROR_COPY: Record<string, string> = {
  not_configured: "Google sign-in isn't available right now. Please use email or password.",
  email_unverified: "Your Google account's email isn't verified. Please sign in with email or password instead.",
  invalid_state: "Google sign-in couldn't be verified. Please try again.",
  missing_code: "Google sign-in didn't complete. Please try again.",
  exchange_failed: "We couldn't complete sign-in with Google. Please try again.",
  start_failed: "Couldn't start Google sign-in. Please try again.",
  account_lookup_failed: "Something went wrong finding your account. Please try again.",
  internal: "Google sign-in hit an unexpected error. Please try again.",
};

/**
 * Sign-in page.
 *
 * Two flows, behind tabs:
 *   - Email link  → POST /api/auth/request-link sends a 15-min
 *                   magic link, which lands back here as ?token=...;
 *                   on mount we detect the token, post it to
 *                   /api/auth/token-login, and navigate to the right
 *                   home page.
 *   - Password    → POST /api/auth/login with email + password,
 *                   followed by /api/auth/verify-2fa if the account
 *                   has 2FA enabled.
 *
 * Email link is the default tab — better UX for trades-business
 * owners who would otherwise reset a forgotten password every other
 * week.
 */

type Mode = "email-link" | "password";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("email-link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [requires2fa, setRequires2fa] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [tokenLoginError, setTokenLoginError] = useState<string | null>(null);
  const [tokenLoginPending, setTokenLoginPending] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [, navigate] = useLocation();
  usePageTitle("Sign In");

  function completeLogin(data: { user: { role?: string } }) {
    queryClient.setQueryData(["auth", "me"], data.user);
    queryClient.invalidateQueries({ queryKey: ["auth", "me"] });

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

    // IA-1: role-based landing via shared helper (server mirror at
    // server/routes/authRoutes.ts → landingPathForRole). Default for
    // unknown roles is /portal, not the standalone QuoteQuick dashboard.
    navigate(landingPathForRole(data.user?.role));
  }

  /* ─── Token-link auto-login ────────────────────────────────────
     When the user clicks a magic link in their inbox, they arrive
     here at /login?token=<jwt>. We immediately exchange the token
     for a session and navigate. Token is stripped from the URL on
     success so it isn't shareable / cacheable. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return;

    setTokenLoginPending(true);
    fetch("/api/auth/token-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "This sign-in link is invalid or has expired.");
        }
        return res.json();
      })
      .then((data: { user: { role?: string } }) => {
        /* Strip the token from the URL so back/refresh doesn't try
         * to consume it twice (it's already burnt server-side). */
        window.history.replaceState({}, "", "/login");
        completeLogin(data);
      })
      .catch((err: Error) => {
        setTokenLoginError(err.message);
        setTokenLoginPending(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Google sign-in callback landing ──────────────────────────
     The OAuth callback redirects back here with either:
       ?google_error=<code>  — show the failure reason
       ?verify2fa=1          — the matched account has 2FA; the server
                               already staged the pending 2FA user, so
                               jump straight to the password tab's 2FA
                               step (the verify-2fa endpoint reads the
                               session, no email/password needed). */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gErr = params.get("google_error");
    if (gErr) {
      setGoogleError(GOOGLE_ERROR_COPY[gErr] || "Google sign-in didn't complete. Please try again.");
      window.history.replaceState({}, "", "/login");
    }
    if (params.get("verify2fa") === "1") {
      setMode("password");
      setRequires2fa(true);
      window.history.replaceState({}, "", "/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Mutations ───────────────────────────────────────────────── */

  const requestLink = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't send sign-in link");
      }
      return res.json();
    },
    onSuccess: () => {
      setLinkSent(true);
    },
  });

  const login = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Login failed");
      }
      return res.json();
    },
    onSuccess: async (data: { user?: { role?: string }; requires2fa?: boolean }) => {
      if (data.requires2fa) {
        setRequires2fa(true);
        return;
      }
      if (data.user) {
        completeLogin(data as { user: { role?: string } });
      }
    },
  });

  const verify2fa = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: totpCode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Verification failed");
      }
      return res.json();
    },
    onSuccess: (data: { user: { role?: string } }) => {
      completeLogin(data);
    },
  });

  /* ─── Styles ──────────────────────────────────────────────────── */

  const labelStyle = {
    display: "block",
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

  const tabBtnStyle = (active: boolean) => ({
    flex: 1,
    padding: "10px 0",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    background: "none",
    border: "none",
    borderBottom: `2px solid ${active ? "#0d3cfc" : "transparent"}`,
    color: active ? "#0d3cfc" : mkt.onDarkMuted,
    cursor: "pointer",
    transition: "color 180ms ease, border-color 180ms ease",
  });

  /* CTA test (just on /login per request): keep the #0D3CFC blue but
   * flip text to off-white (#D5E1E7) so the button reads bright on the
   * dark page. Previously the dark-on-blue combo made the button look
   * muddy / "barely visible". */
  const ctaBtnStyle = {
    width: "100%",
    padding: "12px 14px",
    background: "#0D3CFC",
    color: "#D5E1E7",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    letterSpacing: "0.04em",
    transition: "background 180ms ease",
  };

  const handleEmailLinkSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || requestLink.isPending) return;
    requestLink.mutate();
  };

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (requires2fa) {
      if (!totpCode.trim() || verify2fa.isPending) return;
      verify2fa.mutate();
    } else {
      if (!email.trim() || !password || login.isPending) return;
      login.mutate();
    }
  };

  /* ─── Token-login is in flight ──────────────────────────────────
     Block the form until the redirect resolves so the user isn't
     filling in credentials we're about to ignore. */
  if (tokenLoginPending) {
    return (
      <MarketingLayout>
        <V7PageShell>
          <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: 14, color: mkt.onDarkMuted }}>Signing you in…</p>
          </div>
        </V7PageShell>
      </MarketingLayout>
    );
  }

  /* ─── Render ──────────────────────────────────────────────────── */

  return (
    <AuthCard title={requires2fa ? "Two-factor verification" : "Sign in"} testId="auth-card-login">
      <>
            {/* Tabs — hidden during 2FA step since the user is past
                that decision. */}
            {!requires2fa && (
              <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: `1px solid ${mkt.onDarkBorder}` }}>
                <button
                  type="button"
                  onClick={() => { setMode("email-link"); setLinkSent(false); }}
                  style={tabBtnStyle(mode === "email-link")}
                  data-testid="tab-email-link"
                >
                  Email Link
                </button>
                <button
                  type="button"
                  onClick={() => setMode("password")}
                  style={tabBtnStyle(mode === "password")}
                  data-testid="tab-password"
                >
                  Login
                </button>
              </div>
            )}

            {/* Token-login error surfaces at the top — usually expired
                or already-used link. */}
            {(tokenLoginError || googleError) && (
              <div
                role="alert"
                style={{
                  marginBottom: 16,
                  padding: "10px 12px",
                  background: "rgba(220, 38, 38, 0.08)",
                  border: "1px solid rgba(220, 38, 38, 0.30)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#FCA5A5",
                }}
              >
                {tokenLoginError || googleError}
              </div>
            )}

            {/* ─── Email-link mode ───
              * Both panels stay in the DOM so we can animate the height
              * transition smoothly via the grid-template-rows trick
              * (0fr <-> 1fr is interpolatable; auto-height is not).
              * `pointer-events:none` + `aria-hidden` on the inactive
              * panel keeps focus + clicks scoped to the active one. */}
            <div
              aria-hidden={!(mode === "email-link" && !requires2fa)}
              style={{
                display: "grid",
                gridTemplateRows: mode === "email-link" && !requires2fa ? "1fr" : "0fr",
                opacity: mode === "email-link" && !requires2fa ? 1 : 0,
                pointerEvents: mode === "email-link" && !requires2fa ? "auto" : "none",
                transition: "grid-template-rows 260ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease",
              }}
            >
              <div style={{ overflow: "hidden" }}>
              <>
                {!linkSent ? (
                  <form onSubmit={handleEmailLinkSubmit}>
                    <label style={labelStyle}>
                      Email <span style={{ color: "#FCA5A5" }}>*</span>
                    </label>
                    <input
                      type="email"
                      required
                      autoFocus
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={inputStyle}
                      data-testid="input-email"
                    />

                    {requestLink.error && (
                      <p style={{ marginTop: 12, fontSize: 13, color: "#FCA5A5" }}>
                        {(requestLink.error as Error).message}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={!email.trim() || requestLink.isPending}
                      className="wft-hover-border-white"
                      style={{ ...ctaBtnStyle, marginTop: 18, opacity: !email.trim() || requestLink.isPending ? 0.6 : 1 }}
                      data-testid="button-email-me-a-link"
                    >
                      {requestLink.isPending ? "Sending…" : "Email me a link →"}
                    </button>
                  </form>
                ) : (
                  <div
                    role="status"
                    style={{
                      padding: "14px 16px",
                      background: "rgba(13, 60, 252, 0.08)",
                      border: "1px solid rgba(13, 60, 252, 0.30)",
                      borderRadius: 10,
                      fontSize: 13,
                      color: "#A8F0FA",
                      textAlign: "center" as const,
                    }}
                  >
                    ✓ Check your inbox. Link expires in 15 minutes.
                  </div>
                )}

                <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                  <a
                    href="/signup"
                    style={{ fontSize: 13, color: mkt.onDarkMuted, textDecoration: "none" }}
                  >
                    New here? <span style={{ color: "#0d3cfc" }}>Start free →</span>
                  </a>
                </div>
              </>
              </div>
            </div>

            {/* ─── Password mode ─── (same grid-collapse pattern as above) */}
            <div
              aria-hidden={!(mode === "password" || requires2fa)}
              style={{
                display: "grid",
                gridTemplateRows: mode === "password" || requires2fa ? "1fr" : "0fr",
                opacity: mode === "password" || requires2fa ? 1 : 0,
                pointerEvents: mode === "password" || requires2fa ? "auto" : "none",
                transition: "grid-template-rows 260ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease",
              }}
            >
              <div style={{ overflow: "hidden" }}>
              <form onSubmit={handlePasswordSubmit}>
                {!requires2fa ? (
                  <>
                    <label style={labelStyle}>Email</label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{ ...inputStyle, marginBottom: 14 }}
                      data-testid="input-password-email"
                    />

                    <label style={labelStyle}>Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ ...inputStyle, paddingRight: 40 }}
                        data-testid="input-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        style={{
                          position: "absolute",
                          top: 0, right: 0, height: "100%",
                          width: 40,
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          color: mkt.onDarkMuted,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                        data-testid="toggle-password-visibility"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: mkt.onDarkMuted, marginBottom: 14 }}>
                      Enter the 6-digit code from your authenticator app.
                    </p>
                    <label style={labelStyle}>Authentication code</label>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      autoFocus
                      autoComplete="one-time-code"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, ""))}
                      style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", letterSpacing: "0.4em", textAlign: "center" as const }}
                      data-testid="input-2fa-code"
                    />
                  </>
                )}

                {(requires2fa ? verify2fa.error : login.error) && (
                  <p style={{ marginTop: 12, fontSize: 13, color: "#FCA5A5" }}>
                    {((requires2fa ? verify2fa.error : login.error) as Error).message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={requires2fa ? !totpCode.trim() || verify2fa.isPending : !email.trim() || !password || login.isPending}
                  className="wft-hover-border-white"
                  style={{
                    ...ctaBtnStyle,
                    marginTop: 18,
                    opacity:
                      (requires2fa ? !totpCode.trim() || verify2fa.isPending : !email.trim() || !password || login.isPending)
                        ? 0.6 : 1,
                  }}
                  data-testid="button-sign-in"
                >
                  {(requires2fa ? verify2fa.isPending : login.isPending)
                    ? "Signing in…"
                    : requires2fa ? "Verify" : "Sign in"}
                </button>

                <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                  {requires2fa ? (
                    <button
                      type="button"
                      onClick={() => { setRequires2fa(false); setTotpCode(""); }}
                      style={{ fontSize: 13, color: mkt.onDarkMuted, background: "none", border: "none", cursor: "pointer" }}
                    >
                      Back to sign in
                    </button>
                  ) : (
                    <>
                      <a href="/reset-password" style={{ fontSize: 13, color: mkt.onDarkMuted, textDecoration: "none" }}>
                        Forgot your password?
                      </a>
                      <a href="/signup" style={{ fontSize: 13, color: mkt.onDarkMuted, textDecoration: "none" }}>
                        Don't have an account? <span style={{ color: "#0d3cfc" }}>Sign up free</span>
                      </a>
                    </>
                  )}
                </div>
              </form>
              </div>
            </div>

            {/* ─── Continue with Google ───
                Hidden during the 2FA step — the user is past the
                identity-provider decision at that point. */}
            {!requires2fa && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 18px" }}>
                  <div style={{ flex: 1, height: 1, background: mkt.onDarkBorder }} />
                  <span style={{ fontSize: 11, color: mkt.onDarkMuted, letterSpacing: "0.08em" }}>OR</span>
                  <div style={{ flex: 1, height: 1, background: mkt.onDarkBorder }} />
                </div>
                <GoogleSignInButton mode="login" />
              </>
            )}
      </>
    </AuthCard>
  );
}
