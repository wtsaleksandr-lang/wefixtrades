import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { getSessionId } from "@/lib/chatHelpers";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, navigate] = useLocation();

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
    onSuccess: (data: { user: { role?: string } }) => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });

      // Best-effort: link anonymous website chat session to the newly logged-in user
      // so the portal assistant can resume context. Fire-and-forget.
      try {
        const chatSessionId = getSessionId();
        if (chatSessionId) {
          fetch("/api/auth/link-chat-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ chatSessionId }),
          }).catch(() => {}); // silent — linking is optional
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
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
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
        <div
          style={{
            width: "100%",
            maxWidth: 380,
          }}
        >
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: mkt.text,
              marginBottom: 8,
              letterSpacing: "-0.02em",
            }}
          >
            Sign in
          </h1>
          <p
            style={{
              fontSize: 14,
              color: mkt.textMuted,
              marginBottom: 32,
              lineHeight: 1.5,
            }}
          >
            Manage your services and account.
          </p>

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

            <label style={labelStyle}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ ...inputStyle, marginBottom: 28 }}
            />

            {login.error && (
              <p
                style={{
                  fontSize: 13,
                  color: mkt.danger,
                  marginBottom: 16,
                }}
              >
                {login.error.message}
              </p>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              style={{
                width: "100%",
                padding: "14px 0",
                fontSize: 14,
                fontWeight: 500,
                color: mkt.buttonText,
                background: mkt.buttonBg,
                border: "none",
                borderRadius: 8,
                cursor: login.isPending ? "wait" : "pointer",
                opacity: login.isPending ? 0.7 : 1,
                transition: "background 0.15s ease, opacity 0.15s ease",
              }}
            >
              {login.isPending ? "Signing in\u2026" : "Sign in"}
            </button>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <a
                href="/reset-password"
                style={{
                  fontSize: 13,
                  color: mkt.textMuted,
                  textDecoration: "none",
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = mkt.text)}
                onMouseOut={(e) => (e.currentTarget.style.color = mkt.textMuted)}
              >
                Forgot your password?
              </a>
            </div>
          </form>
        </div>
      </div>
    </MarketingLayout>
  );
}
