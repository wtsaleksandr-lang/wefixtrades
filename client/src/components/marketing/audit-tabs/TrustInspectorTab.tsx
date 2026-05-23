/**
 * TrustInspectorTab — Free-Audit tab #5: domain trust profile.
 * Backend: GET /api/audit/trust-inspector.
 *
 * UI: large hero grade letter (A+/A/B/C/D/F) with animated count-up,
 * 5 sub-grade cards (domain age / SSL / DNS / Wayback / IP geo), and a
 * "specific fixes" list. ReputationShield CTA below.
 */

import { useEffect, useMemo, useState } from "react";
import { Shield, Lock, Server, Globe2, Mail, History } from "lucide-react";
import AuditTabFrame, { staggerDelay } from "./AuditTabFrame";
import AuditTabHelpModal from "./AuditTabHelpModal";

type TrustGrade = "A+" | "A" | "B" | "C" | "D" | "F" | "?";

interface SubScore {
  id: string;
  label: string;
  grade: TrustGrade;
  detail: string;
  score: number;
}

interface TrustResponse {
  ok: boolean;
  grade: TrustGrade;
  overallScore?: number;
  scores: {
    domainAge: SubScore;
    ssl: SubScore;
    dns: SubScore;
    wayback: SubScore;
    ipGeo: SubScore;
  } | null;
  fixes: string[];
  summary: string;
  unavailable?: boolean;
  host?: string;
}

const INK = "#0d1514";
const GREY = "#6B7280";
const GREEN = "#22C55E";
const AMBER = "#F59E0B";
const RED = "#EF4444";
const BRAND_PRIMARY = "#0d3cfc";

function gradeColor(g: TrustGrade): string {
  if (g === "A+" || g === "A") return GREEN;
  if (g === "B") return BRAND_PRIMARY;
  if (g === "C") return AMBER;
  if (g === "D" || g === "F") return RED;
  return GREY;
}

function gradeBg(g: TrustGrade): string {
  if (g === "A+" || g === "A") return "#DCFCE7";
  if (g === "B") return "rgba(13,60,252,0.08)";
  if (g === "C") return "#FEF3C7";
  if (g === "D" || g === "F") return "#FEE2E2";
  return "#F3F4F6";
}

function HeroGrade({ grade }: { grade: TrustGrade }) {
  // Subtle scale-in animation for the grade letter
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 50);
    return () => clearTimeout(t);
  }, [grade]);
  const color = gradeColor(grade);
  return (
    <div
      data-theme="light"
      style={{
        textAlign: "center",
        padding: "20px 16px 24px",
        background: gradeBg(grade),
        borderRadius: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: GREY, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
        Trust grade
      </div>
      <div
        style={{
          fontSize: 72,
          fontWeight: 900,
          color,
          lineHeight: 1,
          letterSpacing: "-0.05em",
          transform: shown ? "scale(1)" : "scale(0.6)",
          opacity: shown ? 1 : 0,
          transition: "transform 480ms cubic-bezier(0.16, 1, 0.3, 1), opacity 480ms ease",
        }}
      >
        {grade}
      </div>
    </div>
  );
}

function SubCard({ score, icon, index }: { score: SubScore; icon: React.ReactNode; index: number }) {
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const delay = staggerDelay(index, 750, 50);
  const color = gradeColor(score.grade);
  return (
    <div
      data-testid={`audit-trust-sub-${score.id}`}
      className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "12px 14px",
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered ? "0 6px 14px rgba(0,0,0,0.06)" : "0 1px 2px rgba(0,0,0,0.04)",
        transition: "transform 180ms ease, box-shadow 180ms ease",
        cursor: "pointer",
        animationDelay: `${delay}ms`,
        animationDuration: "400ms",
        animationFillMode: "backwards",
      }}
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((e) => !e)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded((s) => !s);
        }
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: gradeBg(score.grade),
            color,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{score.label}</div>
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color,
            letterSpacing: "-0.02em",
            flexShrink: 0,
          }}
        >
          {score.grade}
        </div>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: GREY,
          lineHeight: 1.5,
          maxHeight: expanded ? 200 : 28,
          overflow: "hidden",
          transition: "max-height 250ms ease",
        }}
      >
        {score.detail}
      </div>
    </div>
  );
}

export interface TrustInspectorTabProps {
  reportId?: string | null;
}

export default function TrustInspectorTab({ reportId }: TrustInspectorTabProps) {
  const [state, setState] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const [data, setData] = useState<TrustResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!reportId) {
      setState("error");
      setErrorMsg("This tool needs a saved report.");
      return;
    }
    const cacheKey = `trust-inspector:${reportId}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setData(parsed);
        setState(parsed.unavailable ? "empty" : "ready");
        return;
      }
    } catch { /* noop */ }

    let cancelled = false;
    fetch(`/api/audit/trust-inspector?reportId=${encodeURIComponent(reportId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: TrustResponse) => {
        if (cancelled) return;
        if (!json.ok) throw new Error("API error");
        setData(json);
        setState(json.unavailable ? "empty" : "ready");
        try { sessionStorage.setItem(cacheKey, JSON.stringify(json)); } catch { /* noop */ }
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg(e?.message || "Failed to run trust check.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const helpSections = useMemo(
    () => [
      {
        icon: <Shield size={20} />,
        title: "What this is",
        body: "Five free signals that tell search engines + customers your business is legitimate: how old your domain is, whether your SSL is healthy, your DNS / email setup, your Wayback history, and where you're hosted.",
      },
      {
        icon: <Lock size={20} />,
        title: "How to read it",
        body: "Each signal gets its own grade (A+ to F). The big grade up top is a weighted average. SSL + DNS weigh slightly higher because they're table stakes — broken SSL ≈ broken trust.",
      },
      {
        icon: <Mail size={20} />,
        title: "Why it matters",
        body: "These are the signals Google's algorithm uses to weed out spam. Missing SPF / DMARC sends your emails to spam folders. Missing SSL warns customers away. New domains earn less trust.",
      },
      {
        icon: <History size={20} />,
        title: "How to improve it",
        body: "Most fixes are 5-30 minute jobs you can do with your DNS host. Add SPF + DMARC, renew SSL, submit to Internet Archive. ReputationShield monitors all 5 monthly so they never regress.",
      },
    ],
    [],
  );

  const subCards = useMemo(() => {
    if (!data?.scores) return [];
    return [
      { score: data.scores.domainAge, icon: <Globe2 size={16} /> },
      { score: data.scores.ssl, icon: <Lock size={16} /> },
      { score: data.scores.dns, icon: <Mail size={16} /> },
      { score: data.scores.wayback, icon: <History size={16} /> },
      { score: data.scores.ipGeo, icon: <Server size={16} /> },
    ];
  }, [data]);

  return (
    <AuditTabFrame
      testid="audit-tab-trust-inspector"
      title="Trust Inspector"
      insight={data?.summary || null}
      state={state}
      errorMessage={errorMsg}
      helpTrigger={
        <AuditTabHelpModal
          testid="audit-trust-help"
          triggerLabel="What is the Trust Inspector?"
          title="Understanding your trust grade"
          sections={helpSections}
          cta={{ label: "Get ReputationShield", href: "/products/reputationshield?utm_source=audit&utm_medium=help-modal&utm_campaign=trust" }}
        />
      }
      cta={
        data && data.scores
          ? {
              eyebrow: "Lock in your trust profile",
              pitch: "ReputationShield monitors all 5 signals every month and alerts you the moment any one regresses.",
              label: "Get ReputationShield",
              href: "/products/reputationshield?utm_source=audit&utm_medium=tab-cta&utm_campaign=trust",
            }
          : undefined
      }
    >
      {data && data.scores && (
        <>
          <HeroGrade grade={data.grade} />

          {/* Sub-grade cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 10,
            }}
          >
            {subCards.map((c, i) => (
              <SubCard key={c.score.id} score={c.score} icon={c.icon} index={i} />
            ))}
          </div>

          {/* Fixes */}
          {data.fixes.length > 0 && (
            <div
              data-testid="audit-trust-fixes"
              style={{
                marginTop: 16,
                padding: "14px 16px",
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Specific fixes
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: INK, lineHeight: 1.55 }}>
                {data.fixes.map((f, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </AuditTabFrame>
  );
}
