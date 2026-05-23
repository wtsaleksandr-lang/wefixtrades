import { useState, useEffect, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { getSessionId } from "@/lib/chatHelpers";
import { landingPathForRole } from "@/lib/authRedirect";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { V7PageShell } from "@/components/marketing/v7";
import { mkt } from "@/theme/tokens";
import { usePageTitle } from "@/hooks/usePageTitle";

/**
 * Business-name completion step for "Continue with Google" sign-up.
 *
 * Google gives us the person's name + email but not their business
 * name (which every WeFixTrades account needs). After the OAuth
 * callback stashes a pending signup in the session, it redirects the
 * browser here. This page collects the one missing field, POSTs to
 * /api/auth/google/complete to actually create the account, and lands
 * the new user in the portal.
 *
 * If there's no pending Google signup in the session (direct visit,
 * refresh after completion, expired session) we bounce to /signup.
 */

interface PendingResponse {
  pending: boolean;
  email?: string;
  name?: string | null;
}

export default function SignupBusinessNamePage() {
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [, navigate] = useLocation();
  usePageTitle("Finish signing up");

  // Confirm a pending Google signup exists before showing the form.
  const { data: pending, isLoading } = useQuery<PendingResponse>({
    queryKey: ["/api/auth/google/pending"],
    queryFn: async () => {
      const res = await fetch("/api/auth/google/pending", { credentials: "include" });
      if (!res.ok) throw new Error("pending check failed");
      return res.json();
    },
  });

  // No pending signup → nothing to finish here.
  useEffect(() => {
    if (!isLoading && pending && !pending.pending) {
      navigate("/signup");
    }
  }, [isLoading, pending, navigate]);

  const complete = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/google/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessName, phone: phone || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't finish signup");
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
      // IA-1: role-based via shared helper (Google signups are role=client
      // today, but if that ever changes we want one consistent landing path).
      navigate(landingPathForRole(data.user?.role));
    },
  });

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || complete.isPending) return;
    complete.mutate();
  };

  const firstName = pending?.name?.split(" ")[0];

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
            <h1 style={{ fontSize: 26, fontWeight: 700, color: mkt.onDark, marginBottom: 8, letterSpacing: "-0.02em" }}>
              {firstName ? `Almost there, ${firstName}` : "One last thing"}
            </h1>
            <p style={{ fontSize: 14, color: mkt.onDarkMuted, marginBottom: 28, lineHeight: 1.5 }}>
              Tell us your business name and we'll set up your account.
            </p>

            {isLoading ? (
              <p style={{ fontSize: 14, color: mkt.onDarkMuted }}>Loading…</p>
            ) : (
              <form onSubmit={handleSubmit}>
                <label style={labelStyle}>Business name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Smith Plumbing Ltd"
                  style={{ ...inputStyle, marginBottom: 20 }}
                  data-testid="input-business-name"
                />

                <label style={labelStyle}>
                  Phone <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  style={{ ...inputStyle, marginBottom: 28 }}
                  data-testid="input-phone"
                />

                {complete.error && (
                  <p style={{ fontSize: 13, color: mkt.danger, marginBottom: 16 }}>
                    {(complete.error as Error).message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!businessName.trim() || complete.isPending}
                  style={{
                    width: "100%",
                    padding: "14px 0",
                    fontSize: 14,
                    fontWeight: 500,
                    color: mkt.buttonText,
                    background: mkt.buttonBg,
                    border: "none",
                    borderRadius: 8,
                    cursor: complete.isPending ? "wait" : "pointer",
                    opacity: !businessName.trim() || complete.isPending ? 0.7 : 1,
                    transition: "background 0.15s ease, opacity 0.15s ease",
                  }}
                  data-testid="button-finish-signup"
                >
                  {complete.isPending ? "Setting up your account…" : "Finish signup →"}
                </button>
              </form>
            )}
          </div>
        </div>
      </V7PageShell>
    </MarketingLayout>
  );
}
