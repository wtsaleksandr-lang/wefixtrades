import { useState } from "react";
import { trackEvent } from "@/lib/trackEvent";
import { FileText, Loader2, ArrowRight, Gauge, ShieldCheck, Smartphone, Accessibility, Search } from "lucide-react";

/**
 * CompleteReportCta — the single paid offer in the new free-diagnosis model.
 *
 * The free audit shows every Google-presence problem for free. This card sells
 * the one convenience product: a deep technical engineering audit (page speed,
 * mobile, accessibility, security, SEO structure) scored + prioritised in one
 * professional PDF — the "scan everything, get one report" deliverable.
 *
 * Wires the previously-dormant POST /api/full-audit/checkout
 * ({ business_url, email } -> { checkout_url }) and redirects to Stripe. The
 * reportId rides along in metadata so a later wave can fold the free-audit
 * findings into the same combined report.
 */

const DARK = "#11161C";
const ACCENT = "#0d3cfc";
const WHITE = "#FFFFFF";
const MUTED = "rgba(255,255,255,0.62)";
const BORDER = "rgba(255,255,255,0.12)";

const INCLUDES = [
  { icon: Gauge, label: "Page speed (Core Web Vitals)" },
  { icon: Smartphone, label: "Mobile experience" },
  { icon: Accessibility, label: "Accessibility (WCAG 2.1)" },
  { icon: ShieldCheck, label: "Security & headers" },
  { icon: Search, label: "SEO structure" },
];

interface CompleteReportCtaProps {
  reportId?: string | null;
  /** The audited business website. The technical audit needs a real site. */
  businessUrl?: string;
  /** Prefill from the optional email capture, if the visitor gave one. */
  defaultEmail?: string;
}

export default function CompleteReportCta({ reportId, businessUrl, defaultEmail }: CompleteReportCtaProps) {
  const [email, setEmail] = useState(defaultEmail || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // The deep technical audit requires a real website. Without one, the biggest
  // fix IS getting a site — so we don't sell a website-audit here; the free
  // findings + fix-services already cover that case.
  if (!businessUrl) return null;

  const startCheckout = async () => {
    if (submitting) return;
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter your email so we can send the report.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      trackEvent("full_audit_checkout_started", { reportId });
      const res = await fetch("/api/full-audit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_url: businessUrl, email: trimmed, report_id: reportId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.checkout_url) {
        throw new Error(data?.error || "Could not start checkout. Please try again.");
      }
      window.location.href = data.checkout_url as string;
    } catch (err: any) {
      setError(err?.message || "Could not start checkout. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div
      data-theme="dark"
      data-testid="complete-report-cta"
      style={{
        background: DARK,
        borderRadius: 16,
        padding: "22px 22px",
        marginBottom: 10,
        border: `1px solid ${BORDER}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "rgba(13,60,252,0.18)", color: "#9DB3FF",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <FileText size={20} />
        </span>
        <div style={{ fontSize: 17, fontWeight: 800, color: WHITE, letterSpacing: "-0.01em" }}>
          Get the complete technical report
        </div>
      </div>

      <p style={{ margin: "0 0 14px", fontSize: 13.5, color: MUTED, lineHeight: 1.55, maxWidth: 620 }}>
        Everything above is yours free. The complete report adds a deep engineering
        audit of your website — scored, prioritised, and delivered as one professional
        PDF you can act on (or hand to whoever fixes it).
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {INCLUDES.map(({ icon: Icon, label }) => (
          <span
            key={label}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.82)",
              background: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`,
              borderRadius: 999, padding: "5px 11px",
            }}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@business.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
          data-testid="complete-report-email"
          style={{
            flex: "1 1 220px", minWidth: 0, height: 46, padding: "0 14px",
            fontSize: 14, color: WHITE, background: "rgba(255,255,255,0.06)",
            border: `1px solid ${error ? "#F87171" : BORDER}`, borderRadius: 10,
            outline: "none", boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={startCheckout}
          disabled={submitting}
          data-testid="complete-report-checkout"
          style={{
            flexShrink: 0, height: 46, padding: "0 20px",
            display: "inline-flex", alignItems: "center", gap: 8,
            background: ACCENT, color: WHITE, border: "none", borderRadius: 10,
            fontSize: 14.5, fontWeight: 700, cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.8 : 1, whiteSpace: "nowrap",
          }}
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
          Get the full report — $9.80
          {!submitting && <ArrowRight size={16} />}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: "#FCA5A5", marginTop: 8 }}>{error}</div>}
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.45)", marginTop: 10 }}>
        One-time payment · secure Stripe checkout · report emailed in ~60 seconds.
      </div>
    </div>
  );
}
