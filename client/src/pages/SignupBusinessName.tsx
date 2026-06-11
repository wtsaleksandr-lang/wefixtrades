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
import { FreeToolFormField, FreeToolFormFieldStyles } from "@/components/marketing/FreeToolFormField";
import {
  SmsConsentDisclosure,
  SMS_CONSENT_LABEL,
  SMS_CONSENT_VERSION,
} from "@/components/forms/SmsConsentDisclosure";

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
  const [smsConsent, setSmsConsent] = useState(false);
  // Inline error shown when a phone is supplied but SMS consent isn't ticked.
  const [consentError, setConsentError] = useState(false);
  const [, navigate] = useLocation();

  // TCPA: a phone number may only be submitted with an affirmative opt-in.
  const phoneProvided = phone.trim().length > 0;
  const consentRequired = phoneProvided && !smsConsent;
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
        body: JSON.stringify({
          businessName,
          phone: phone || undefined,
          // TCPA: explicit opt-in + the exact text the user agreed to, so the
          // backend can persist a defensible consent record.
          smsConsent: phone.trim() ? smsConsent : false,
          smsConsentText: phone.trim() && smsConsent ? SMS_CONSENT_LABEL : undefined,
          smsConsentVersion: phone.trim() && smsConsent ? SMS_CONSENT_VERSION : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't finish signup");
      }
      return res.json();
    },
    onSuccess: (data: { user: { role?: string } }) => {
      // Match the /api/auth/me shape `{ user, adminProPreview }` useAuth()
      // reads — storing the raw user leaves the cache's `.user` undefined,
      // so RequireClient bounces the brand-new Google account to /login
      // before the refetch lands (same bug fixed on login + email signup).
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
      // IA-1: role-based via shared helper (Google signups are role=client
      // today, but if that ever changes we want one consistent landing path).
      navigate(landingPathForRole(data.user?.role));
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!businessName.trim() || complete.isPending) return;
    // TCPA: block submit if a phone is given without an affirmative opt-in.
    if (consentRequired) {
      setConsentError(true);
      return;
    }
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
                {/* P2-1 (night audit 2026-06-11): locked input rules —
                    title-in-field, help cue top-left, 2px stacked gaps. */}
                <FreeToolFormFieldStyles />
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 8, ["--ftool-label-bg" as any]: mkt.sectionLight }}>
                  <FreeToolFormField
                    id="finish-business-name"
                    theme="dark"
                    label="Business Name"
                    placeholder="e.g. Smith Plumbing Ltd"
                    helpText="The trading name of your business — it appears on your dashboard, quotes, and invoices."
                    value={businessName}
                    onChange={setBusinessName}
                    autoComplete="organization"
                    autoFocus
                    required
                    testId="input-business-name"
                  />
                  <FreeToolFormField
                    id="finish-phone"
                    theme="dark"
                    label="Phone (optional)"
                    type="tel"
                    placeholder="(555) 123-4567"
                    helpText="Optional — only needed if you'd like SMS updates (opt-in below)."
                    value={phone}
                    onChange={setPhone}
                    inputMode="tel"
                    autoComplete="tel"
                    testId="input-phone"
                  />
                </div>
                {phoneProvided && (
                  <label
                    htmlFor="finish-sms-consent"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      marginBottom: 8,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      id="finish-sms-consent"
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

                {complete.error && (
                  <p style={{ fontSize: 13, color: mkt.danger, marginBottom: 16 }}>
                    {(complete.error as Error).message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!businessName.trim() || complete.isPending || consentRequired}
                  style={{
                    width: "100%",
                    padding: "14px 0",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#D5E1E7",
                    background: "#0D3CFC",
                    border: "none",
                    borderRadius: 8,
                    letterSpacing: "0.04em",
                    cursor: complete.isPending ? "wait" : "pointer",
                    opacity: !businessName.trim() || complete.isPending || consentRequired ? 0.7 : 1,
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
