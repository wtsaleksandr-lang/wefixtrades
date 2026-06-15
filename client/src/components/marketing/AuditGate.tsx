import { useState } from "react";
import { trackEvent } from "@/lib/trackEvent";
import { Lock, Send, CheckCircle2, Loader2, Shield, HelpCircle, Plus } from "lucide-react";
import { SmsConsentDisclosure } from "@/components/forms/SmsConsentDisclosure";

// BE-2: ink upgraded to the locked QuoteQuick brand ink (#1E1E1E)
const DARK = "#1E1E1E";
const CYAN = "#0d3cfc";
const WHITE = "#FFFFFF";
const GREY = "#6B7280";
const BORDER = "#E5E7EB";

// Score → traffic-light verdict colour + plain-English read. Used by the
// explained hero gauge (design M5/H1 — first-time visitors must understand
// the number, not just see it).
function scoreColor(s: number): string {
  if (s >= 80) return "#16A34A"; // emerald
  if (s >= 50) return "#D97706"; // amber
  return "#DC2626"; // crimson
}
function scoreVerdict(s: number): string {
  if (s >= 80) return "Strong — a few quick wins left";
  if (s >= 65) return "Decent — real ground to gain";
  if (s >= 50) return "Mixed — competitors are pulling ahead";
  return "At risk — you're losing visible ground";
}

/**
 * ExplainedScoreGauge — the wow moment. A premium semicircular gauge that
 * leads the gate with the overall score + a one-line "what this means"
 * caption and a top-left "?" help cue (DESIGN-SYSTEM rule §2). This is the
 * first real number a brand-new visitor sees, so it must read as premium
 * AND be understood. Self-contained SVG (no token/theme dependency) so it
 * renders identically on the gate's white card.
 */
function ExplainedScoreGauge({ score, grade }: { score: number; grade?: string }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = scoreColor(clamped);

  // Semicircle geometry: 180° arc, viewBox 200×118.
  const cx = 100;
  const cy = 100;
  const r = 80;
  const startDeg = 180;
  const endDeg = 0;
  const polar = (deg: number) => {
    const a = (Math.PI * deg) / 180;
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };
  const arc = (from: number, to: number) => {
    const s = polar(from);
    const e = polar(to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    const sweep = to > from ? 0 : 1;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} ${sweep} ${e.x} ${e.y}`;
  };
  const valueDeg = startDeg - (clamped / 100) * (startDeg - endDeg);

  return (
    <div data-theme="light" style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
      {/* DESIGN-SYSTEM rule §2 — help cue anchored top-left of the component.
          data-theme="light" scopes this light-surface gauge for the
          hardcoded-color guard (the help button is white-on-light, the
          tooltip is white-on-dark — both intentional, theme-correct). */}
      <button
        type="button"
        aria-label="What this score means"
        aria-expanded={helpOpen}
        onClick={() => setHelpOpen((o) => !o)}
        onBlur={() => setHelpOpen(false)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: `1px solid ${BORDER}`,
          background: WHITE,
          color: GREY,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
          zIndex: 2,
        }}
      >
        <HelpCircle size={14} />
      </button>
      {helpOpen && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: 28,
            left: 0,
            width: 240,
            background: DARK,
            color: WHITE,
            fontSize: 12,
            lineHeight: 1.5,
            borderRadius: 10,
            padding: "10px 12px",
            zIndex: 3,
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            textAlign: "left",
          }}
        >
          Your overall audit score (0–100) blends your Google Maps profile, website,
          reviews, and how you stack up against nearby competitors. Higher = easier for
          customers to find and trust you.
        </div>
      )}

      <svg viewBox="0 0 200 118" width="200" height="118" role="img" aria-label={`Overall audit score ${clamped} out of 100`}>
        {/* track */}
        <path d={arc(startDeg, endDeg)} fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth={14} strokeLinecap="round" />
        {/* value arc */}
        <path d={arc(startDeg, valueDeg)} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
        {/* needle */}
        <line
          x1={cx}
          y1={cy}
          x2={polar(valueDeg).x}
          y2={polar(valueDeg).y}
          stroke={DARK}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={4} fill={DARK} />
      </svg>

      {/* Big number + grade, sitting in the arc's mouth */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: -28 }}>
        <span style={{ fontSize: 40, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.02em" }}>
          {clamped}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: GREY }}>/100</span>
        {grade && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color,
              background: `${color}1A`,
              border: `1px solid ${color}`,
              borderRadius: 20,
              padding: "2px 10px",
              marginLeft: 2,
            }}
          >
            Grade {grade}
          </span>
        )}
      </div>
      {/* "What this means" caption — the explanation, not just the number */}
      <div style={{ fontSize: 13, fontWeight: 600, color: DARK, marginTop: 8, textAlign: "center" }}>
        {scoreVerdict(clamped)}
      </div>
      <div style={{ fontSize: 11, color: GREY, marginTop: 2, textAlign: "center" }}>
        Your overall Google &amp; website health score
      </div>
    </div>
  );
}

interface AuditGateProps {
  businessName?: string;
  reportId?: string | null;
  score?: number;
  grade?: string;
  trade?: string;
  city?: string;
  placeId?: string;
  issueCount?: number;
  detectedIssues?: string[];
  recommendedServices?: Array<{ name: string; price: number; id: string }>;
  /**
   * Estimated monthly revenue left on the table (missed jobs). When provided
   * the gate renders the full loss-framed ask ("recover $X/mo in missed
   * jobs"). ReportView already computes this as `lostRevenueMonthly` — pass
   * it through the AuditGate call site to light up the revenue copy. Absent
   * → the gate falls back to a concrete issue-count loss frame.
   */
  lostRevenueMonthly?: number;
  /**
   * Generic lead noun for the loss-framed copy ("jobs", "calls", "new
   * enquiries"). Supplied by the report's `leadNoun` so the gate never assumes
   * a trade vertical. Defaults to "jobs" for backwards-compatibility.
   */
  leadNoun?: string;
  /** Fired once the lead is saved and the gate unlocks. The captured contact
   *  details are passed back so downstream surfaces (e.g. the checkout intake
   *  modal) can prefill them instead of re-asking at the highest-intent moment. */
  onUnlock: (lead?: { email?: string; name?: string; phone?: string }) => void;
}

export default function AuditGate({
  businessName,
  reportId,
  score,
  grade,
  trade,
  city,
  placeId,
  issueCount,
  detectedIssues,
  recommendedServices,
  lostRevenueMonthly,
  leadNoun = "jobs",
  onUnlock,
}: AuditGateProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const fixes = issueCount ?? detectedIssues?.length ?? 0;
  const revenue =
    typeof lostRevenueMonthly === "number" && lostRevenueMonthly > 0
      ? Math.round(lostRevenueMonthly)
      : 0;

  // Loss-framed value line (CRO #7). Lead with the concrete count of fixes,
  // and — when a real revenue estimate is in scope — the dollars at stake.
  // Never invent a number: with no revenue figure we frame around the fixes
  // + the missed jobs they unblock, which is still concrete and honest.
  const headline =
    fixes > 0
      ? revenue > 0
        ? `See the ${fixes} fix${fixes !== 1 ? "es" : ""} that could recover ~$${revenue.toLocaleString()}/mo in missed ${leadNoun}`
        : `See the ${fixes} fix${fixes !== 1 ? "es" : ""} costing you ${leadNoun} on Google`
      : revenue > 0
        ? `See how to recover ~$${revenue.toLocaleString()}/mo in missed ${leadNoun}`
        : "See your full fix plan and competitor breakdown";

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

      // Store unlock + captured contact in localStorage so a checkout started
      // after a page reload can still prefill (the gate is gone by then).
      if (reportId) {
        try {
          localStorage.setItem(`audit-unlocked-${reportId}`, "1");
          localStorage.setItem(
            `audit-lead-${reportId}`,
            JSON.stringify({ email: trimmed, name: name.trim() || "", phone: phone.trim() || "" }),
          );
        } catch {
          /* localStorage unavailable (private mode / blocked) — non-fatal,
             the in-memory unlock below still reveals the report this session */
        }
      }

      // Brief confirmation then unlock — hand the captured contact back so the
      // checkout intake can prefill instead of re-asking (conversion fix #6).
      setTimeout(() => {
        onUnlock({ email: trimmed, name: name.trim() || undefined, phone: phone.trim() || undefined });
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
          We've also emailed your fix checklist{fixes > 0 ? ` — all ${fixes} of them` : ""}.
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

      {/* M5/H1 — lead with the explained premium score gauge (the wow moment),
          so the hero number is understood the moment a first-time visitor
          lands on the gate. Only when a real score is in scope. */}
      {typeof score === "number" && score > 0 && (
        <ExplainedScoreGauge score={score} grade={grade} />
      )}

      <div style={{ textAlign: "center", marginBottom: 20 }}>
        {/* Lock cue as a tied-in pill (not a floating box) so it reads as one
            unit with the headline — top of the gate, clean alignment. */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: 999,
            background: `${CYAN}14`,
            color: CYAN,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          <Lock size={14} color={CYAN} />
          Locked — free to unlock
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: DARK, marginBottom: 8, lineHeight: 1.25 }}>
          {headline}
        </div>
        <div style={{ fontSize: 14, color: GREY, lineHeight: 1.5 }}>
          Enter your email to unlock the full report — Rank Grid, SEO checklist,
          site speed, NAP, market sizer, trust score and your complete action plan
          with competitor breakdown. Free, no card.
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
            aria-label="Email address"
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

        {/* CRO #7 — email-only ask. Name stays optional inline; phone is no
            longer a visible required field (it dampened conversion). It's
            available behind a one-tap reveal for the buyers who want a call. */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          aria-label="Name (optional)"
          style={{
            width: "100%",
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

        {showPhone ? (
          <>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (optional)"
              aria-label="Phone number (optional)"
              autoFocus
              style={{
                width: "100%",
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
            <SmsConsentDisclosure variant="inline" />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowPhone(true)}
            style={{
              alignSelf: "center",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "none",
              border: "none",
              padding: "2px 4px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: GREY,
              fontFamily: "inherit",
            }}
          >
            <Plus size={14} />
            Add phone for a callback (optional)
          </button>
        )}

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
          Unlock my full report &rarr;
        </button>

        {/* Sub-note: the report unlocks on-screen instantly; the email is a
            bonus, not the payload. Avoids underselling the CTA. */}
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12,
            color: GREY,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Opens instantly on this page (also emailed to you).
        </p>
      </form>

      {/* Trust line — numbered social proof (CRO #7). Generic "businesses"
          count so it applies to ANY business (not only home-service trades). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          marginTop: 14,
          fontSize: 12,
          color: GREY,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        <Shield size={12} style={{ flexShrink: 0 }} />
        <span>Joined by 2,370+ businesses. No spam — just your audit &amp; fix checklist.</span>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { @keyframes spin { to { transform: none; } } }`}</style>
    </div>
  );
}
