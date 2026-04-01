import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
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
      const role = data.user?.role;
      if (role === "admin" || role === "portal") {
        navigate("/admin/crm");
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
            Access your dashboard and tools.
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
          </form>
        </div>
      </div>
    </MarketingLayout>
  );
}
