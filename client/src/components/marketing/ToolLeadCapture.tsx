/**
 * ToolLeadCapture + ToolUpsellCTA — shared peak-intent conversion layer for
 * the free local-SEO tools (Citation Checker, Google Review Link, Local Rank
 * Grid, Local Rank Tracker, Local SERP Checker, Local Rankflux).
 *
 * Why this file exists
 * --------------------
 * The free tools gave away 100% of their value anonymously. Both Phase-1
 * auditors flagged the same two missing conversion levers:
 *
 *   1. Lead capture AT PEAK INTENT — an "Email me this report" affordance that
 *      appears AFTER the results render (never a gate before). Email-only, no
 *      phone, genuinely optional: the results stay fully visible whether or
 *      not the visitor submits. ONE shared component, reused across all tools
 *      (no 6× copy-paste). Submits to POST /api/tools/tool-lead, which reuses
 *      the audit lead store (storage.createAuditSubmission) + email pipeline
 *      (queueEmail) — see server/routes/freeToolsRoutes.ts. The `sourceTool`
 *      tag lands in audit_submissions.source_tool so follow-up / analytics can
 *      differentiate which tool produced the lead.
 *
 *   2. Result-aware upsell — a contextual next step derived from what the
 *      result actually says (poor ranking → MapGuard; missing citations →
 *      MapSetup; good result → run the Full Audit). Routes to the matched
 *      paid service checkout via /pricing?service=<id>&checkout=1 (the same
 *      query contract SharedAuditReport.tsx uses), or to /tools/free-audit for
 *      the good-result cross-sell.
 *
 * Design-system compliance (DESIGN-SYSTEM.md, hard input rules):
 *   - title-in-field floating label (reuses FreeToolFormField), help cue
 *     top-left, 2px stack gaps, light surface (rgb()/rgba() only — never bare
 *     #fff / white / black on a color prop, per the hardcoded-colors guard).
 *   - selected/active = subtle outline + blue tint, never a bright fill.
 */
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import {
  FreeToolFormField,
  FreeToolFormFieldStyles,
} from "@/components/marketing/FreeToolFormField";
import { trackEvent } from "@/lib/trackEvent";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ─── Lead capture ─────────────────────────────────────────────────────── */

interface ToolLeadCaptureProps {
  /**
   * Stable tool slug — persisted to audit_submissions.source_tool for
   * attribution. Keep ≤ 50 chars (varchar(50) column). e.g.
   * "citation-checker", "local-rank-tracker".
   */
  sourceTool: string;
  /** Tool path for source_page attribution + analytics. */
  sourcePage: string;
  /**
   * Business name already captured by the tool's own form, if any — sent
   * along so the lead row carries it (no re-asking the visitor).
   */
  businessName?: string;
  /** Headline override. Defaults to "Email me this report". */
  title?: string;
  /** One-line supporting copy under the headline. */
  subtitle?: string;
}

/**
 * Peak-intent email capture. Renders INSIDE a tool's result panel, after the
 * results. Email-only, optional — results remain fully visible regardless.
 */
export function ToolLeadCapture({
  sourceTool,
  sourcePage,
  businessName,
  title = "Email me this report",
  subtitle = "Get a copy in your inbox — plus a short, no-pressure breakdown of what to fix first. No spam.",
}: ToolLeadCaptureProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Please enter a valid email.");
      return;
    }
    setStatus("loading");
    try {
      const r = await fetch("/api/tools/tool-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          sourceTool,
          sourcePage,
          businessName: businessName || undefined,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || "Could not send.");
      setStatus("done");
      trackEvent("tool_lead_captured", { sourceTool, sourcePage });
    } catch (err: any) {
      setStatus("error");
      setError(err?.message || "Could not send. Please try again.");
    }
  }

  if (status === "done") {
    return (
      <div
        data-testid="tool-lead-done"
        style={{
          marginTop: 14,
          padding: "16px 18px",
          borderRadius: 14,
          border: "1px solid rgba(34,197,94,0.35)",
          background: "rgba(34,197,94,0.07)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "rgb(22,101,52)",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
        On its way — check your inbox in a minute.
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      data-testid="tool-lead-capture"
      style={{
        marginTop: 14,
        padding: "16px 18px",
        borderRadius: 14,
        border: "1px solid rgba(13,60,252,0.18)",
        background: "linear-gradient(135deg, rgba(13,60,252,0.06), rgba(13,60,252,0.02))",
      }}
    >
      <FreeToolFormFieldStyles />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 15,
          fontWeight: 800,
          color: "rgb(17,24,39)",
          marginBottom: 4,
          letterSpacing: "-0.01em",
        }}
      >
        <Mail size={16} color="rgb(13,60,252)" />
        {title}
      </div>
      <div style={{ fontSize: 13, color: "rgba(0,0,0,0.6)", lineHeight: 1.5, marginBottom: 10 }}>
        {subtitle}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <FreeToolFormField
            id={`tool-lead-email-${sourceTool}`}
            type="email"
            inputMode="email"
            label="Email address"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            testId="input-tool-lead-email"
            helpText="We'll send this report to this address and, occasionally, tips on improving your local ranking. Unsubscribe anytime."
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading"}
          data-testid="button-tool-lead-submit"
          style={{
            flexShrink: 0,
            minHeight: 52,
            padding: "0 18px",
            borderRadius: 12,
            background: status === "loading" ? "rgba(13,60,252,0.6)" : "rgb(13,60,252)",
            color: "rgb(255,255,255)",
            fontSize: 14,
            fontWeight: 700,
            border: "none",
            cursor: status === "loading" ? "default" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {status === "loading" ? "Sending…" : "Email it to me"}
          {status !== "loading" && <ArrowRight size={16} />}
        </button>
      </div>
      {error && (
        <div
          style={{
            marginTop: 8,
            color: "rgb(185,28,28)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </form>
  );
}

/* ─── Result-aware upsell ──────────────────────────────────────────────── */

export type UpsellTone = "fix" | "audit";

interface ToolUpsellCTAProps {
  /** Eyebrow over the headline — e.g. "Next step", "You're in good shape". */
  eyebrow: string;
  /** Headline — the contextual recommendation derived from the result. */
  headline: string;
  /** Supporting sentence. */
  body: ReactNode;
  /** Button label. */
  ctaLabel: string;
  /**
   * Matched service id (from shared/services.ts) → routes to
   * /pricing?service=<id>&checkout=1. When omitted, `href` is used verbatim
   * (e.g. the good-result cross-sell to /tools/free-audit).
   */
  serviceId?: string;
  /** Explicit href — used when serviceId is absent. */
  href?: string;
  /** Visual tone: "fix" = brand-blue urgency, "audit" = calm cross-sell. */
  tone?: UpsellTone;
  /** Tool slug for analytics attribution. */
  sourceTool: string;
}

/**
 * Contextual next-step CTA rendered after a tool's results. The CALLER decides
 * what the result says and passes the matched recommendation in — this
 * component only renders + routes it, so the result→service mapping lives
 * next to each tool's result shape.
 */
export function ToolUpsellCTA({
  eyebrow,
  headline,
  body,
  ctaLabel,
  serviceId,
  href,
  tone = "fix",
  sourceTool,
}: ToolUpsellCTAProps) {
  const target = serviceId
    ? `/pricing?service=${encodeURIComponent(serviceId)}&checkout=1`
    : href || "/tools/free-audit";

  const isFix = tone === "fix";

  return (
    <div
      data-testid="tool-upsell-cta"
      style={{
        marginTop: 14,
        padding: "18px 20px",
        borderRadius: 16,
        border: isFix
          ? "1px solid rgba(13,60,252,0.22)"
          : "1px solid rgba(0,0,0,0.10)",
        background: isFix
          ? "linear-gradient(135deg, rgba(13,60,252,0.08), rgba(13,60,252,0.02))"
          : "rgb(255,255,255)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: isFix ? "rgb(13,60,252)" : "rgba(0,0,0,0.5)",
          marginBottom: 6,
        }}
      >
        {eyebrow}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: "rgb(17,24,39)", marginBottom: 6, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
        {headline}
      </div>
      <div style={{ fontSize: 14, color: "rgba(0,0,0,0.62)", lineHeight: 1.55, marginBottom: 14 }}>
        {body}
      </div>
      <Link
        href={target}
        onClick={() =>
          trackEvent("tool_upsell_clicked", { sourceTool, serviceId: serviceId || null, target })
        }
        data-testid="link-tool-upsell"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: isFix ? "rgb(13,60,252)" : "rgba(13,60,252,0.10)",
          color: isFix ? "rgb(255,255,255)" : "rgb(13,60,252)",
          padding: "10px 16px",
          borderRadius: 11,
          fontSize: 14,
          fontWeight: 700,
          textDecoration: "none",
          border: isFix ? "none" : "1px solid rgba(13,60,252,0.25)",
        }}
      >
        {ctaLabel}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
