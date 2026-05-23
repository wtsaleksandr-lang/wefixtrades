/**
 * SeoChecklistTab — Free-Audit tab #1: 15 local-SEO ranking signals
 * checked in 60 seconds, with per-signal status + plain-English summary
 * + top-3 fix recommendations. Backend: GET /api/audit/seo-checklist.
 *
 * Premium standard:
 *   - Lazy fetch on first mount (this component is itself lazy-mounted
 *     by ReportView so the audit page stays fast).
 *   - Cascading entry (motion-safe slide-in, 30ms × N, capped 750ms).
 *   - Animated count-up on the final score circle.
 *   - Hover scale + soft shadow lift on rows.
 *   - Skeleton loading state via AuditTabFrame.
 *   - Top-left InfoCue help modal mirroring the Rank Grid pattern.
 *
 * All colors are either brand tokens or live inside data-theme="light"
 * wrappers (via AuditTabFrame) so the hardcoded-color guard stays at 0.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, X, HelpCircle, ListChecks, Target, Wrench, Search } from "lucide-react";
import AuditTabFrame, { staggerDelay } from "./AuditTabFrame";
import AuditTabHelpModal from "./AuditTabHelpModal";

interface Signal {
  id: string;
  label: string;
  status: "pass" | "fail" | "unknown";
  detail: string;
  why: string;
}

interface ChecklistResponse {
  ok: boolean;
  signals: Signal[];
  score: number;
  total: number;
  summary: string;
  fixes: string[];
}

const BRAND_PRIMARY = "#0d3cfc";
const INK = "#0d1514";
const GREEN = "#22C55E";
const RED = "#EF4444";
const GREY = "#6B7280";

function ScoreRing({ score, total }: { score: number; total: number }) {
  const pct = total > 0 ? score / total : 0;
  const r = 38;
  const circ = 2 * Math.PI * r;
  const fill = pct * circ;
  const color = pct >= 0.7 ? GREEN : pct >= 0.45 ? "#F59E0B" : RED;

  // Local count-up that respects prefers-reduced-motion
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setShown(score);
      return;
    }
    const start = performance.now();
    const dur = 800;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(score * ease));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div
      data-theme="light"
      style={{
        position: "relative",
        width: 100,
        height: 100,
        margin: "0 auto 8px",
      }}
    >
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} stroke="#E5E7EB" strokeWidth="8" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={r}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          strokeDasharray={`${fill} ${circ - fill}`}
          style={{ transition: "stroke-dasharray 700ms ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 800, color: INK, lineHeight: 1 }}>{shown}</div>
        <div style={{ fontSize: 11, color: GREY, marginTop: 2 }}>/ {total}</div>
      </div>
    </div>
  );
}

function SignalRow({
  signal,
  index,
}: {
  signal: Signal;
  index: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const delay = staggerDelay(index);
  const color = signal.status === "pass" ? GREEN : signal.status === "fail" ? RED : GREY;
  const Icon = signal.status === "pass" ? Check : signal.status === "fail" ? X : HelpCircle;

  return (
    <div
      data-testid={`seo-signal-${signal.id}`}
      className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr auto",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 12,
        border: "1px solid #E5E7EB",
        background: hovered ? "#F8FAFC" : "#fff",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        boxShadow: hovered ? "0 4px 10px rgba(0,0,0,0.05)" : "none",
        transition: "transform 160ms ease, box-shadow 160ms ease, background 160ms ease",
        animationDelay: `${delay}ms`,
        animationDuration: "350ms",
        animationFillMode: "backwards",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: signal.status === "pass" ? "#DCFCE7" : signal.status === "fail" ? "#FEE2E2" : "#F3F4F6",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} color={color} aria-hidden="true" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{signal.label}</span>
          <button
            type="button"
            onClick={() => setShowWhy((s) => !s)}
            aria-expanded={showWhy}
            aria-label={showWhy ? "Hide explanation" : "Why this matters"}
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              color: GREY,
              padding: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HelpCircle size={12} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: GREY, marginTop: 2, lineHeight: 1.45 }}>
          {signal.detail}
        </div>
        {showWhy && (
          <div
            className="motion-safe:animate-in motion-safe:fade-in"
            style={{
              fontSize: 12,
              color: "#475569",
              marginTop: 6,
              padding: "6px 10px",
              background: "#F8FAFC",
              borderLeft: `2px solid ${BRAND_PRIMARY}`,
              borderRadius: 4,
              lineHeight: 1.5,
            }}
          >
            <strong>Why it matters:</strong> {signal.why}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color,
          flexShrink: 0,
          alignSelf: "center",
        }}
      >
        {signal.status === "pass" ? "Pass" : signal.status === "fail" ? "Fix" : "—"}
      </div>
    </div>
  );
}

export interface SeoChecklistTabProps {
  reportId?: string | null;
}

export default function SeoChecklistTab({ reportId }: SeoChecklistTabProps) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!reportId) {
      setState("error");
      setErrorMsg("This tool needs a saved report — open the audit again.");
      return;
    }
    // Session-cache by reportId so a tab re-open doesn't refetch.
    const cacheKey = `seo-checklist:${reportId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setData(parsed);
        setState("ready");
        return;
      }
    } catch { /* noop */ }

    let cancelled = false;
    fetch(`/api/audit/seo-checklist?reportId=${encodeURIComponent(reportId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: ChecklistResponse) => {
        if (cancelled) return;
        if (!json.ok) throw new Error("API returned error");
        setData(json);
        setState("ready");
        try { sessionStorage.setItem(cacheKey, JSON.stringify(json)); } catch { /* noop */ }
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg(e?.message || "Failed to load SEO checklist.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const helpSections = useMemo(
    () => [
      {
        icon: <ListChecks size={20} />,
        title: "What this is",
        body: "A quick sweep of the 15 local-SEO basics that move the needle for trade businesses — from HTTPS to schema markup to whether your Google Business Profile is claimed.",
      },
      {
        icon: <Target size={20} />,
        title: "How to read it",
        body: "Each row shows a green check, a red X, or a dash. The score at the top is the count of passes out of 15. 12+ is healthy; below 8 means you're leaving traffic on the table.",
      },
      {
        icon: <Search size={20} />,
        title: "Why it matters",
        body: "These signals don't move the needle individually — they compound. A site that nails all 15 punches well above its weight in local search, especially in competitive trades.",
      },
      {
        icon: <Wrench size={20} />,
        title: "How to improve it",
        body: "Start with the top-3 recommended fixes below the list. Most can be done by your web host in under an hour. WebFix handles all 15 every month, so they stay green automatically.",
      },
    ],
    [],
  );

  return (
    <AuditTabFrame
      testid="audit-tab-seo-checklist"
      title="Local SEO Checklist (15 signals)"
      insight={data?.summary || null}
      state={state}
      errorMessage={errorMsg}
      helpTrigger={
        <AuditTabHelpModal
          testid="audit-seo-checklist-help"
          triggerLabel="What is the Local SEO Checklist?"
          title="Understanding your SEO Checklist"
          sections={helpSections}
          cta={{ label: "Get WebFix", href: "/products/webfix?utm_source=audit&utm_medium=help-modal&utm_campaign=seo-checklist" }}
        />
      }
      cta={
        data
          ? {
              eyebrow: "Want all 15 green?",
              pitch: "WebFix maintains every signal on this checklist — sitemap, schema, page speed, NAP — every month automatically.",
              label: "Get WebFix",
              href: "/products/webfix?utm_source=audit&utm_medium=tab-cta&utm_campaign=seo-checklist",
            }
          : undefined
      }
    >
      {data && (
        <>
          {/* Hero score */}
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <ScoreRing score={data.score} total={data.total} />
            <div style={{ fontSize: 13, color: GREY, fontWeight: 500 }}>
              {data.score >= 12 ? "Strong foundation" : data.score >= 8 ? "Mixed — quick wins available" : "Big gaps to close"}
            </div>
          </div>

          {/* Signal list */}
          <div style={{ display: "grid", gap: 8 }}>
            {data.signals.map((s, i) => (
              <SignalRow key={s.id} signal={s} index={i} />
            ))}
          </div>

          {/* Top fixes */}
          {data.fixes.length > 0 && (
            <div
              data-testid="audit-seo-checklist-fixes"
              style={{
                marginTop: 16,
                padding: "14px 16px",
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Top 3 fixes
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: INK, lineHeight: 1.55 }}>
                {data.fixes.map((f, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{f}</li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </AuditTabFrame>
  );
}
