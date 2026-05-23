/**
 * AuditTabFrame — shared wrapper for the 5 new Free-Audit tab tools.
 *
 * Encapsulates the standard layout each tool uses:
 *   1. Header row with a top-left InfoCue (help modal trigger) + title.
 *   2. Plain-English insight callout (the "what does this mean" banner).
 *   3. Slot for the tool's content (rendered by the parent).
 *   4. CTA card at the bottom that links to the relevant paid product.
 *
 * Locked to `data-theme="light"` so the explicit white background +
 * brand-blue accents survive the hardcoded-color guard. All five tab
 * components import + render this so the visual language stays
 * consistent across SEO Checklist / Site Speed / NAP / Market Sizer /
 * Trust Inspector tabs.
 *
 * Cascading entry on the body is handled by the parent tab using
 * `motion-safe:animate-in fade-in slide-in-from-bottom-1` with the
 * standard 30ms × N stagger (capped 750ms).
 */

import { ReactNode } from "react";
import { ArrowRight, AlertCircle, Loader2 } from "lucide-react";

const BRAND_PRIMARY = "#0d3cfc";
const INK = "#0d1514";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

export type LoadState = "loading" | "ready" | "error" | "empty";

export interface AuditTabFrameProps {
  title: string;
  /** Plain-English summary surfaced above the data. */
  insight?: string | null;
  /** Right-aligned help-modal trigger (top-left of the section per UI rules). */
  helpTrigger?: ReactNode;
  state: LoadState;
  errorMessage?: string;
  /** Tool body — only rendered when state === "ready". */
  children: ReactNode;
  /** Bottom CTA — { label, href } pointing at the paid product. */
  cta?: {
    label: string;
    href: string;
    /** Eyebrow text above the CTA card ("Fix these →") */
    eyebrow?: string;
    /** One-liner under the eyebrow explaining what the paid product does. */
    pitch?: string;
  };
  /** Test id propagated to the outer wrapper for E2E targeting. */
  testid?: string;
}

function Skeleton() {
  return (
    <div
      data-theme="light"
      style={{
        display: "grid",
        gap: 12,
        padding: "12px 0",
      }}
    >
      <style>{`
        @keyframes audit-tab-skeleton-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.85; }
        }
        @media (prefers-reduced-motion: reduce) {
          .audit-tab-skeleton-row { animation: none !important; }
        }
      `}</style>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="audit-tab-skeleton-row"
          style={{
            height: 48,
            borderRadius: 12,
            background: "linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)",
            animation: "audit-tab-skeleton-pulse 1.8s ease-in-out infinite",
            animationDelay: `${i * 100}ms`,
          }}
        />
      ))}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          color: MUTED,
          fontSize: 12,
          marginTop: 4,
          justifyContent: "center",
        }}
      >
        <Loader2 size={14} className="audit-tab-skeleton-spinner" style={{ animation: "spin 1.2s linear infinite" }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        Crunching the numbers…
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      data-theme="light"
      style={{
        background: "#FFF7ED",
        border: "1px solid #FED7AA",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        color: "#9A3412",
      }}
    >
      <AlertCircle size={20} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Couldn't load this tab</div>
        <div>{message}</div>
      </div>
    </div>
  );
}

export default function AuditTabFrame({
  title,
  insight,
  helpTrigger,
  state,
  errorMessage,
  children,
  cta,
  testid,
}: AuditTabFrameProps) {
  return (
    <div
      data-theme="light"
      data-testid={testid}
      style={{
        background: "#fff",
        borderRadius: 16,
        border: `1px solid ${BORDER}`,
        padding: "20px clamp(16px, 3vw, 22px)",
        marginBottom: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
      }}
    >
      {/* Header — title with top-left InfoCue trigger (UI rule) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        {helpTrigger}
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: INK,
            letterSpacing: "-0.005em",
            flex: 1,
            minWidth: 0,
          }}
        >
          {title}
        </div>
      </div>

      {/* Plain-English insight callout */}
      {insight && state === "ready" && (
        <div
          data-testid={testid ? `${testid}-insight` : undefined}
          style={{
            background: "rgba(13,60,252,0.06)",
            border: "1px solid rgba(13,60,252,0.18)",
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 14,
            fontSize: 13,
            lineHeight: 1.55,
            color: INK,
            fontWeight: 500,
          }}
        >
          {insight}
        </div>
      )}

      {state === "loading" && <Skeleton />}
      {state === "error" && <ErrorState message={errorMessage || "Something went wrong — try again in a minute."} />}
      {state === "empty" && <ErrorState message={errorMessage || "No data available for this tool right now."} />}
      {state === "ready" && children}

      {/* CTA card */}
      {state === "ready" && cta && (
        <div
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTop: `1px solid ${BORDER}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 200, flex: 1 }}>
            {cta.eyebrow && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: BRAND_PRIMARY,
                  marginBottom: 4,
                }}
              >
                {cta.eyebrow}
              </div>
            )}
            {cta.pitch && (
              <div style={{ fontSize: 13, color: INK, lineHeight: 1.5 }}>
                {cta.pitch}
              </div>
            )}
          </div>
          <a
            href={cta.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: BRAND_PRIMARY,
              color: "#fff",
              padding: "10px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              transition: "transform 120ms ease, box-shadow 120ms ease",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(13,60,252,0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {cta.label} <ArrowRight size={14} aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}

/* ─── Shared cascading-row helper ──────────────────────────────────────
 * Wraps a row in motion-safe fade-in + 30ms stagger (capped at 750ms).
 * Used by every tab to satisfy the "cascading entry" premium standard.
 */
export function staggerDelay(index: number, capMs = 750, stepMs = 30): number {
  return Math.min(index * stepMs, capMs);
}
