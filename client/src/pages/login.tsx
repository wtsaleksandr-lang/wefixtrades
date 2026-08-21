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
import FacebookSignInButton from "@/components/auth/FacebookSignInButton";
import AppleSignInButton from "@/components/auth/AppleSignInButton";
import { AuthCard } from "@/components/auth/AuthCard";
import { FreeToolFormField, FreeToolFormFieldStyles } from "@/components/marketing/FreeToolFormField";

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

/** Friendly copy for the ?apple_error= codes the Apple callback may return. */
const APPLE_ERROR_COPY: Record<string, string> = {
  not_configured: "Apple sign-in isn't available right now. Please use email or password.",
  email_unverified: "Your Apple account's email isn't verified. Please sign in with email or password instead.",
  invalid_state: "Apple sign-in couldn't be verified. Please try again.",
  missing_code: "Apple sign-in didn't complete. Please try again.",
  exchange_failed: "We couldn't complete sign-in with Apple. Please try again.",
  start_failed: "Couldn't start Apple sign-in. Please try again.",
  internal: "Apple sign-in hit an unexpected error. Please try again.",
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
  /** Lane C: 2FA step accepts a single-use recovery code instead of TOTP. */
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [tokenLoginError, setTokenLoginError] = useState<string | null>(null);
  const [tokenLoginPending, setTokenLoginPending] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [, navigate] = useLocation();
  usePageTitle("Sign In");

  function completeLogin(data: { user: { role?: string }; requires2faEnrollment?: boolean }) {
    // BUG-FIX (2026-05-23): previously stored `data.user` directly, but
    // useAuth() expects shape `{ user, adminProPreview? }` (see
    // client/src/hooks/useAuth.ts AuthMeResponse). Storing the raw user
    // made the cache value's `.user` field undefined, so RequirePortal /
    // RequireClient on the destination route briefly saw the session as
    // unauthenticated and bounced the user back to /login before the
    // refetch could land. Wrap to match the /api/auth/me response shape.
    queryClient.setQueryData(["auth", "me"], { user: data.user, adminProPreview: false });
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

    // Lane C — mandatory admin 2FA: the server flags admin logins that
    // still lack an enrolled factor; route them straight into the 2FA
    // enrollment surface instead of the normal landing page.
    if (data.requires2faEnrollment) {
      navigate("/admin/crm/settings?enroll2fa=1");
      return;
    }

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
    const aErr = params.get("apple_error");
    if (aErr) {
      setAppleError(APPLE_ERROR_COPY[aErr] || "Apple sign-in didn't complete. Please try again.");
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

  /* P2-1 (night audit 2026-06-11): locked input rules — title-in-field,
   * help cue top-left, 2px stacked gaps — via the shared FreeToolFormField
   * primitive. The AuthCard surface is translucent glass, so the floated
   * label uses a transparent backing (it sits inside the field's padding,
   * clear of both the border and the typed value). */
  const fieldStackStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    ["--ftool-label-bg" as string]: "transparent",
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
            <FreeToolFormFieldStyles />
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
                {/* P2-2: was "Login" — ambiguous next to "Email Link" (and
                    colliding with the nav's LOGIN). The tabs pick an auth
                    METHOD, so name the method. */}
                <button
                  type="button"
                  onClick={() => setMode("password")}
                  style={tabBtnStyle(mode === "password")}
                  data-testid="tab-password"
                >
                  Password
                </button>
              </div>
            )}

            {/* Token-login error surfaces at the top — usually expired
                or already-used link. */}
            {(tokenLoginError || googleError || appleError) && (
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
                {tokenLoginError || googleError || appleError}
              </div>
            )}

            {/* ─── Email-link mode ───
              * Both panels stay in the DOM so we can animate the height
              * transition smoothly via the grid-template-rows trick
              * (0fr <-> 1fr is interpolatable; auto-height is not).
              * `pointer-events:none` + `aria-hidden` on the inactive
              * panel keeps focus + clicks scoped to the active one. */}
            <div
              // `inert` (native, applied only when collapsed) removes the
              // hidden panel's inputs/links/buttons from BOTH the tab order and
              // the a11y tree. aria-hidden alone left them keyboard-focusable
              // inside an aria-hidden subtree → axe `aria-hidden-focus`. Applied
              // as a raw attribute so the active panel never receives it (React
              // 18 has no typed `inert` prop and would emit inert="false").
              {...(!(mode === "email-link" && !requires2fa) ? { inert: "" } : {})}
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
                    <div style={fieldStackStyle}>
                      <FreeToolFormField
                        id="login-emaillink-email"
                        theme="dark"
                        label="Email"
                        type="email"
                        placeholder="john@smithplumbing.com"
                        helpText="The email on your account — we'll send a one-time sign-in link there. It expires in 15 minutes."
                        hideHelpCue
                        value={email}
                        onChange={setEmail}
                        inputMode="email"
                        autoComplete="email"
                        autoFocus
                        required
                        testId="input-email"
                      />
                    </div>

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
              // See the email-link panel above — `inert` (collapsed only)
              // keeps the inactive password/2FA fields out of the tab order and
              // a11y tree, fixing axe `aria-hidden-focus`.
              {...(!(mode === "password" || requires2fa) ? { inert: "" } : {})}
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
                  <div style={fieldStackStyle}>
                    <FreeToolFormField
                      id="login-password-email"
                      theme="dark"
                      label="Email"
                      type="email"
                      placeholder="john@smithplumbing.com"
                      helpText="The email you signed up with."
                      hideHelpCue
                      value={email}
                      onChange={setEmail}
                      inputMode="email"
                      autoComplete="email"
                      required
                      testId="input-password-email"
                    />
                    <FreeToolFormField
                      id="login-password"
                      theme="dark"
                      label="Password"
                      type={showPassword ? "text" : "password"}
                      helpText="Your account password. Use the eye icon to check what you've typed."
                      hideHelpCue
                      value={password}
                      onChange={setPassword}
                      autoComplete="current-password"
                      required
                      testId="input-password"
                      trailing={
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          style={{
                            width: 36,
                            height: 36,
                            padding: 0,
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
                      }
                    />
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: mkt.onDarkMuted, marginBottom: 14 }}>
                      {useRecoveryCode
                        ? "Enter one of your single-use recovery codes."
                        : "Enter the 6-digit code from your authenticator app."}
                    </p>
                    <div style={fieldStackStyle}>
                      <FreeToolFormField
                        id="login-2fa-code"
                        theme="dark"
                        label={useRecoveryCode ? "Recovery Code" : "Authentication Code"}
                        helpText={useRecoveryCode
                          ? "One of the single-use recovery codes you saved when enabling 2FA."
                          : "The 6-digit code currently shown in your authenticator app."}
                        hideHelpCue
                        value={totpCode}
                        onChange={(v) =>
                          setTotpCode(
                            useRecoveryCode
                              ? v.toUpperCase().replace(/[^A-Z0-9-]/g, "")
                              : v.replace(/[^0-9]/g, ""),
                          )
                        }
                        inputMode={useRecoveryCode ? "text" : "numeric"}
                        pattern={useRecoveryCode ? undefined : "[0-9]{6}"}
                        maxLength={useRecoveryCode ? 13 : 6}
                        autoFocus
                        autoComplete="one-time-code"
                        required
                        testId="input-2fa-code"
                        fieldStyle={{
                          fontFamily: "ui-monospace, monospace",
                          letterSpacing: useRecoveryCode ? "0.1em" : "0.4em",
                          textAlign: "center" as const,
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => { setUseRecoveryCode((v) => !v); setTotpCode(""); }}
                      style={{ marginTop: 10, fontSize: 12, color: mkt.onDarkMuted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                      data-testid="toggle-recovery-code"
                    >
                      {useRecoveryCode ? "Use authenticator code instead" : "Lost your device? Use a recovery code"}
                    </button>
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
                      {/* P2-2: style as the link it is — was plain muted text
                          while "Sign up free" below got the blue treatment. */}
                      <a href="/reset-password" style={{ fontSize: 13, color: mkt.onDarkMuted, textDecoration: "none" }}>
                        Forgot your password? <span style={{ color: "#0d3cfc" }}>Reset it</span>
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
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <GoogleSignInButton mode="login" />
                  <FacebookSignInButton mode="login" />
                  <AppleSignInButton mode="login" />
                </div>
              </>
            )}
      </>
    </AuthCard>
  );
}
