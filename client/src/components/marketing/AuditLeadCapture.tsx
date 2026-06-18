import { useState } from "react";
import { trackEvent } from "@/lib/trackEvent";
import { Mail, CheckCircle2, Loader2, X } from "lucide-react";

/**
 * AuditLeadCapture — the OPTIONAL, non-blocking email capture for the free
 * audit. The diagnosis itself is fully open (every problem is shown for free,
 * no wall); this slim card just lets a visitor get the report + a free fix
 * plan emailed so we still capture the lead we need to sell the FIX. It never
 * gates content and is dismissible.
 *
 * Reuses the proven /api/audit/save-lead contract (identical payload to the
 * old gate) so existing CRM ingestion is unchanged — only the framing moves
 * from "unlock to see" to "want it emailed?".
 */

const DARK = "#1E1E1E";
const ACCENT = "#0d3cfc";
const WHITE = "#FFFFFF";
const GREY = "#6B7280";
const BORDER = "#E5E7EB";

interface RecommendedService {
  name?: string;
  price?: number | string;
  id?: string;
}

interface AuditLeadCaptureProps {
  reportId?: string | null;
  businessName?: string;
  score?: number;
  trade?: string;
  city?: string;
  placeId?: string;
  issueCount?: number;
  detectedIssues?: string[];
  recommendedServices?: RecommendedService[];
  /** Fired after a successful save so the parent can prefill checkout intake. */
  onCaptured?: (lead: { email: string; name?: string }) => void;
}

export default function AuditLeadCapture({
  reportId,
  businessName,
  score,
  trade,
  city,
  placeId,
  issueCount,
  detectedIssues,
  recommendedServices,
  onCaptured,
}: AuditLeadCaptureProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

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
          phone: null,
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
      trackEvent("audit_lead_submitted", { businessName, score, optional: true });
      if (reportId) {
        try {
          localStorage.setItem(
            `audit-lead-${reportId}`,
            JSON.stringify({ email: trimmed, name: name.trim() || "", phone: "" }),
          );
        } catch {
          /* private mode / blocked — non-fatal */
        }
      }
      onCaptured?.({ email: trimmed, name: name.trim() || undefined });
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-theme="light"
      data-testid="audit-lead-capture"
      style={{
        position: "relative",
        background: WHITE,
        border: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${ACCENT}`,
        borderRadius: 14,
        padding: "16px 18px",
        marginBottom: 12,
        boxShadow: "0 1px 2px rgba(20,35,60,0.04), 0 6px 18px -12px rgba(20,35,60,0.12)",
      }}
    >
      {/* Dismiss — keeps this strictly optional / non-blocking. */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: "none",
          background: "transparent",
          color: GREY,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        <X size={16} />
      </button>

      {submitted ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 24 }}>
          <CheckCircle2 size={20} style={{ color: "#16A34A", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: DARK }}>Sent — check your inbox</div>
            <div style={{ fontSize: 12.5, color: GREY, marginTop: 2 }}>
              Your full report and a free, prioritized fix plan are on the way.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "rgba(13,60,252,0.10)",
              color: ACCENT,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Mail size={20} />
          </span>

          <div style={{ flex: "1 1 240px", minWidth: 0, paddingRight: 20 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: DARK, letterSpacing: "-0.01em" }}>
              Want this report emailed to you?
            </div>
            <div style={{ fontSize: 12.5, color: GREY, marginTop: 2, lineHeight: 1.5 }}>
              The full breakdown plus a free, prioritized fix plan — sent to your inbox. Optional.
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@business.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
                data-testid="audit-lead-capture-email"
                style={{
                  flex: "1 1 200px",
                  minWidth: 0,
                  height: 44,
                  padding: "0 14px",
                  fontSize: 14,
                  color: DARK,
                  background: WHITE,
                  border: `1px solid ${error ? "#DC2626" : BORDER}`,
                  borderRadius: 10,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="submit"
                disabled={submitting}
                data-testid="audit-lead-capture-submit"
                style={{
                  flexShrink: 0,
                  height: 44,
                  padding: "0 18px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: ACCENT,
                  color: WHITE,
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.8 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                Email it to me
              </button>
            </form>
            {error && (
              <div style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{error}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
