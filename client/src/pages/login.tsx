import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { getSessionId } from "@/lib/chatHelpers";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requires2fa, setRequires2fa] = useState(false);
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

    const role = data.user?.role;
    if (role === "admin" || role === "portal") {
      navigate("/admin/crm");
    } else if (role === "client") {
      navigate("/portal");
    } else {
      navigate("/dashboard");
    }
  }

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (requires2fa) {
      verify2fa.mutate();
    } else {
      login.mutate();
    }
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
    color: mkt.text,
    background: mkt.surface,
    border: `1px solid ${mkt.border}`,
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const currentError = requires2fa ? verify2fa.error : login.error;
  const isPending = requires2fa ? verify2fa.isPending : login.isPending;

  return (
    <MarketingLayout>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          padding: "80px 24px 40px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 380 }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: mkt.text,
              marginBottom: 8,
              letterSpacing: "-0.02em",
            }}
          >
            {requires2fa ? "Two-factor verification" : "Sign in"}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: mkt.textMuted,
              marginBottom: 32,
              lineHeight: 1.5,
            }}
          >
            {requires2fa
              ? "Enter the 6-digit code from your authenticator app."
              : "Manage your services and account."}
          </p>

          <form onSubmit={handleSubmit}>
            {!requires2fa ? (
              <>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  style={{ ...inputStyle, marginBottom: 20 }}
                />
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ ...inputStyle, marginBottom: 28 }}
                />
              </>
            ) : (
              <>
                <label style={labelStyle}>Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="one-time-code"
                  placeholder="000000"
                  style={{
                    ...inputStyle,
                    marginBottom: 28,
                    textAlign: "center" as const,
                    fontSize: 20,
                    letterSpacing: "0.3em",
                    fontFamily: "monospace",
                  }}
                />
              </>
            )}

            {currentError && (
              <p style={{ fontSize: 13, color: mkt.danger, marginBottom: 16 }}>
                {currentError.message}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              style={{
                width: "100%",
                padding: "14px 0",
                fontSize: 14,
                fontWeight: 500,
                color: mkt.buttonText,
                background: mkt.buttonBg,
                border: "none",
                borderRadius: 8,
                cursor: isPending ? "wait" : "pointer",
                opacity: isPending ? 0.7 : 1,
                transition: "background 0.15s ease, opacity 0.15s ease",
              }}
            >
              {isPending
                ? requires2fa ? "Verifying…" : "Signing in…"
                : requires2fa ? "Verify" : "Sign in"}
            </button>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              {requires2fa ? (
                <button
                  type="button"
                  onClick={() => { setRequires2fa(false); setTotpCode(""); }}
                  style={{
                    fontSize: 13,
                    color: mkt.textMuted,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Back to sign in
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                  <a
                    href="/reset-password"
                    style={{ fontSize: 13, color: mkt.textMuted, textDecoration: "none" }}
                    onMouseOver={(e) => (e.currentTarget.style.color = mkt.text)}
                    onMouseOut={(e) => (e.currentTarget.style.color = mkt.textMuted)}
                  >
                    Forgot your password?
                  </a>
                  <a
                    href="/signup"
                    style={{ fontSize: 13, color: mkt.textMuted, textDecoration: "none" }}
                    onMouseOver={(e) => (e.currentTarget.style.color = mkt.text)}
                    onMouseOut={(e) => (e.currentTarget.style.color = mkt.textMuted)}
                  >
                    Don't have an account? Sign up free
                  </a>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </MarketingLayout>
  );
}
