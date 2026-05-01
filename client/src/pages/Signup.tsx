import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { getSessionId } from "@/lib/chatHelpers";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { mkt } from "@/theme/tokens";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function SignupPage() {
  const [businessName, setBusinessName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [, navigate] = useLocation();
  usePageTitle("Create Free Account");

  const signup = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, name, businessName, phone: phone || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Signup failed");
      }
      return res.json();
    },
    onSuccess: (data: { user: { role?: string } }) => {
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

      navigate("/portal");
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
            Create your free account
          </h1>
          <p
            style={{
              fontSize: 14,
              color: mkt.textMuted,
              marginBottom: 32,
              lineHeight: 1.5,
            }}
          >
            Get started with WeFixTrades — no credit card required.
          </p>

          <form onSubmit={handleSubmit}>
            <label style={labelStyle}>Business name</label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Smith Plumbing Ltd"
              style={{ ...inputStyle, marginBottom: 20 }}
            />

            <label style={labelStyle}>Your name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Smith"
              autoComplete="name"
              style={{ ...inputStyle, marginBottom: 20 }}
            />

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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              style={{ ...inputStyle, marginBottom: 20 }}
            />

            <label style={labelStyle}>Phone <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              style={{ ...inputStyle, marginBottom: 28 }}
            />

            {signup.error && (
              <p style={{ fontSize: 13, color: mkt.danger, marginBottom: 16 }}>
                {signup.error.message}
              </p>
            )}

            <button
              type="submit"
              disabled={signup.isPending}
              style={{
                width: "100%",
                padding: "14px 0",
                fontSize: 14,
                fontWeight: 500,
                color: mkt.buttonText,
                background: mkt.buttonBg,
                border: "none",
                borderRadius: 8,
                cursor: signup.isPending ? "wait" : "pointer",
                opacity: signup.isPending ? 0.7 : 1,
                transition: "background 0.15s ease, opacity 0.15s ease",
              }}
            >
              {signup.isPending ? "Creating account..." : "Create free account"}
            </button>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <a
                href="/login"
                style={{ fontSize: 13, color: mkt.textMuted, textDecoration: "none" }}
                onMouseOver={(e) => (e.currentTarget.style.color = mkt.text)}
                onMouseOut={(e) => (e.currentTarget.style.color = mkt.textMuted)}
              >
                Already have an account? Log in
              </a>
            </div>
          </form>
        </div>
      </div>
    </MarketingLayout>
  );
}
