import { useState } from "react";
import { trackEvent } from "@/lib/trackEvent";
import { Lock, Send, CheckCircle2, Loader2, Shield } from "lucide-react";
import { SmsConsentDisclosure } from "@/components/forms/SmsConsentDisclosure";

// BE-2: ink upgraded to the locked QuoteQuick brand ink (#1E1E1E)
const DARK = "#1E1E1E";
const CYAN = "#0d3cfc";
const WHITE = "#FFFFFF";
const GREY = "#6B7280";
const BORDER = "#E5E7EB";

interface AuditGateProps {
  businessName?: string;
  reportId?: string | null;
  score?: number;
  trade?: string;
  city?: string;
  placeId?: string;
  issueCount?: number;
  detectedIssues?: string[];
  recommendedServices?: Array<{ name: string; price: number; id: string }>;
  onUnlock: () => void;
}

export default function AuditGate({
  businessName,
  reportId,
  score,
  trade,
  city,
  placeId,
  issueCount,
  detectedIssues,
  recommendedServices,
  onUnlock,
}: AuditGateProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;

    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/audit/save-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          name: name.trim() || null,
          phone: phone.trim() || null,
          reportId,
          businessName,
          placeId,
          trade,
          city,
          score,
          issueCount,
          detectedIssues,
          recommendedServices: recommendedServices?.slice(0, 3).map((s) => ({
            name: s.name,
            price: s.price,
            id: s.id,
          })),
          source_tool: "audit",
          source_page: typeof window !== "undefined" ? window.location.pathname : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong.");
      }

      setSubmitted(true);
      trackEvent("audit_lead_submitted", { businessName, score });

      // Store unlock in localStorage
      if (reportId) {
        try {
          localStorage.setItem(`audit-unlocked-${reportId}`, "1");
        } catch {}
      }

      // Brief confirmation then unlock
      setTimeout(() => {
        onUnlock();
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        data-theme="light"
        style={{
          background: WHITE,
          borderRadius: 16,
          border: `1px solid ${BORDER}`,
          padding: "32px 24px",
          textAlign: "center",
          margin: "20px 0",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#DCFCE7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <CheckCircle2 size={24} color="#22C55E" />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: DARK, marginBottom: 6 }}>
          Your full report is ready.
        </div>
        <div style={{ fontSize: 14, color: GREY, lineHeight: 1.5 }}>
          We've also emailed your fix checklist.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: WHITE,
        borderRadius: 16,
        border: `1px solid ${BORDER}`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
        padding: "28px 24px",
        margin: "20px 0",
        position: "relative",
        // BE-2: `clip` (not `hidden`) so any future sticky descendants are not
        // clamped by this card. See memory `project-overflow-clip-for-sticky`.
        overflow: "clip",
      }}
    >
      {/* Accent top border */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${CYAN}, #3B82F6)`,
        }}
      />

      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: `${CYAN}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 14px",
          }}
        >
          <Lock size={20} color={CYAN} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: DARK, marginBottom: 6, lineHeight: 1.2 }}>
          {businessName
            ? `Unlock ${businessName}'s Full Report`
            : "Unlock Your Full Audit Report"}
        </div>
        <div style={{ fontSize: 14, color: GREY, lineHeight: 1.5 }}>
          Your detailed fix plan, competitor analysis, and recommendations are ready.
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            placeholder="your@email.com"
            required
            style={{
              width: "100%",
              height: 44,
              padding: "0 14px",
              borderRadius: 10,
              border: `1px solid ${error ? "#EF4444" : BORDER}`,
              fontSize: 14,
              outline: "none",
              fontFamily: "inherit",
              color: DARK,
              boxSizing: "border-box",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => {
              if (!error) e.currentTarget.style.borderColor = CYAN;
            }}
            onBlur={(e) => {
              if (!error) e.currentTarget.style.borderColor = BORDER;
            }}
          />
          {error && (
            <div style={{ fontSize: 12, color: "#EF4444", marginTop: 4 }}>{error}</div>
          )}
        </div>

        {/* Optional fields - collapsed into a row.
            BE-2: bumped to 44px to meet the locked mobile touch-target floor. */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            style={{
              flex: 1,
              height: 44,
              padding: "0 12px",
              borderRadius: 10,
              border: `1px solid ${BORDER}`,
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
              color: DARK,
              boxSizing: "border-box",
            }}
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
            style={{
              flex: 1,
              height: 44,
              padding: "0 12px",
              borderRadius: 10,
              border: `1px solid ${BORDER}`,
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
              color: DARK,
              boxSizing: "border-box",
            }}
          />
        </div>
        <SmsConsentDisclosure variant="inline" />

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            height: 48,
            borderRadius: 12,
            border: "none",
            background: CYAN,
            // BE-2: white on brand-blue per locked QuoteQuick CTA pattern
            // (dark-on-cyan failed AA contrast).
            color: WHITE,
            fontSize: 15,
            fontWeight: 700,
            cursor: submitting ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.2s",
            opacity: submitting ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!submitting) e.currentTarget.style.boxShadow = "0 4px 16px rgba(13,60,252,0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          {submitting ? (
            <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Send size={16} />
          )}
          Unlock My Full Audit & Fix Plan
        </button>
      </form>

      {/* Trust line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          marginTop: 14,
          fontSize: 12,
          color: GREY,
        }}
      >
        <Shield size={12} />
        <span>No spam. We'll only send your audit report and fix checklist.</span>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { @keyframes spin { to { transform: none; } } }`}</style>
    </div>
  );
}
