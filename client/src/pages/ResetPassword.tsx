import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();

  // Check for token in URL
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (token) {
    return <SetNewPassword token={token} navigate={navigate} />;
  }

  return <RequestReset />;
}

/* ─── Step 1: Request reset link ─── */
function RequestReset() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Request failed");
      }
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const labelStyle = {
    display: "block" as const,
    fontSize: 12,
    fontWeight: 600,
    color: mkt.onDarkFaint,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 6,
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    fontSize: 14,
    color: mkt.onDark,
    background: mkt.sectionLight,
    border: `1px solid ${mkt.onDarkBorder}`,
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  return (
    <MarketingLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "80px 24px 40px" }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: mkt.onDark, marginBottom: 8, letterSpacing: "-0.02em" }}>
            Reset password
          </h1>
          <p style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 32, lineHeight: 1.5 }}>
            Enter your email and we'll send you a link to reset your password.
          </p>

          {sent ? (
            <div style={{ background: "rgba(13,60,252,0.08)", borderRadius: 8, padding: 16 }}>
              <p style={{ fontSize: 14, color: "#0d3cfc", fontWeight: 500, marginBottom: 4 }}>
                Check your email
              </p>
              <p style={{ fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.5 }}>
                If an account exists for <strong>{email}</strong>, we've sent a password reset link.
                It expires in 1 hour.
              </p>
              <a
                href="/login"
                style={{ display: "inline-block", marginTop: 16, fontSize: 13, color: "#0d3cfc", textDecoration: "none", fontWeight: 500 }}
              >
                Back to sign in
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                style={{ ...inputStyle, marginBottom: 20 }}
              />

              {error && (
                <p style={{ fontSize: 13, color: mkt.danger, marginBottom: 16 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  fontSize: 14,
                  fontWeight: 500,
                  color: mkt.buttonText,
                  background: mkt.buttonBg,
                  border: "none",
                  borderRadius: 8,
                  cursor: loading ? "wait" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  transition: "background 0.15s ease, opacity 0.15s ease",
                }}
              >
                {loading ? "Sending..." : "Send reset link"}
              </button>

              <div style={{ textAlign: "center", marginTop: 16 }}>
                <a href="/login" style={{ fontSize: 13, color: mkt.onDarkMuted, textDecoration: "none" }}>
                  Back to sign in
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </MarketingLayout>
  );
}

/* ─── Step 2: Set new password (with token) ─── */
function SetNewPassword({ token, navigate }: { token: string; navigate: (path: string) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const labelStyle = {
    display: "block" as const,
    fontSize: 12,
    fontWeight: 600,
    color: mkt.onDarkFaint,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 6,
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    fontSize: 14,
    color: mkt.onDark,
    background: mkt.sectionLight,
    border: `1px solid ${mkt.onDarkBorder}`,
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  return (
    <MarketingLayout>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "80px 24px 40px" }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: mkt.onDark, marginBottom: 8, letterSpacing: "-0.02em" }}>
            Set new password
          </h1>

          {done ? (
            <div style={{ background: "rgba(13,60,252,0.08)", borderRadius: 8, padding: 16 }}>
              <p style={{ fontSize: 14, color: "#0d3cfc", fontWeight: 500, marginBottom: 4 }}>
                Password updated
              </p>
              <p style={{ fontSize: 13, color: mkt.onDarkMuted, lineHeight: 1.5 }}>
                Your password has been reset. You can now sign in with your new password.
              </p>
              <button
                onClick={() => navigate("/login")}
                style={{
                  marginTop: 16,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: mkt.buttonText,
                  background: mkt.buttonBg,
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Sign in
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 32, lineHeight: 1.5 }}>
                Enter your new password below.
              </p>
              <form onSubmit={handleSubmit}>
                <label style={labelStyle}>New password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  style={{ ...inputStyle, marginBottom: 20 }}
                />

                <label style={labelStyle}>Confirm password</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  style={{ ...inputStyle, marginBottom: 20 }}
                />

                {error && (
                  <p style={{ fontSize: 13, color: mkt.danger, marginBottom: 16 }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "14px 0",
                    fontSize: 14,
                    fontWeight: 500,
                    color: mkt.buttonText,
                    background: mkt.buttonBg,
                    border: "none",
                    borderRadius: 8,
                    cursor: loading ? "wait" : "pointer",
                    opacity: loading ? 0.7 : 1,
                    transition: "background 0.15s ease, opacity 0.15s ease",
                  }}
                >
                  {loading ? "Resetting..." : "Reset password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </MarketingLayout>
  );
}
