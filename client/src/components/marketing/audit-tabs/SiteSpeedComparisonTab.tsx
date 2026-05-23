/**
 * SiteSpeedComparisonTab — Free-Audit tab #2: side-by-side PageSpeed
 * comparison between the audited business and the top organic competitor
 * for "{trade} {city}". Backend: GET /api/audit/speed-vs-competitor.
 *
 * UI: 2-column layout (stacks on mobile). Each side shows a PageSpeed
 * score dial + 4 Core Web Vitals + hero number. Color-coded win/loss
 * badges on each metric. Plain-English summary above.
 */

import { useEffect, useMemo, useState } from "react";
import { Zap, Trophy, Activity, Gauge } from "lucide-react";
import AuditTabFrame, { staggerDelay } from "./AuditTabFrame";
import AuditTabHelpModal from "./AuditTabHelpModal";

interface PageSpeedSummary {
  url: string;
  hostname: string;
  score: number | null;
  fcp: number | null;
  lcp: number | null;
  tbt: number | null;
  cls: number | null;
}

interface CompareResponse {
  ok: boolean;
  you: PageSpeedSummary | null;
  them: PageSpeedSummary | null;
  summary: string;
  competitorUrl?: string | null;
  unavailable?: boolean;
  winLoss: Array<{ metric: string; winner: "you" | "them" | "tie"; delta: string }>;
}

const INK = "#0d1514";
const GREY = "#6B7280";
const GREEN = "#22C55E";
const AMBER = "#F59E0B";
const RED = "#EF4444";

function speedColor(score: number | null): string {
  if (score == null) return GREY;
  if (score >= 75) return GREEN;
  if (score >= 50) return AMBER;
  return RED;
}

function CountUpNum({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value == null) return;
    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * ease));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (value == null) return <span>—</span>;
  return <span>{shown}{suffix}</span>;
}

function SpeedDial({ score, label, sub }: { score: number | null; label: string; sub?: string }) {
  const color = speedColor(score);
  const r = 42;
  const circ = 2 * Math.PI * r;
  const fill = score == null ? 0 : (score / 100) * circ;
  return (
    <div data-theme="light" style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: 110, height: 110, margin: "0 auto 6px" }}>
        <svg width="110" height="110" viewBox="0 0 110 110">
          <circle cx="55" cy="55" r={r} stroke="#E5E7EB" strokeWidth="9" fill="none" />
          <circle
            cx="55"
            cy="55"
            r={r}
            stroke={color}
            strokeWidth="9"
            fill="none"
            strokeLinecap="round"
            transform="rotate(-90 55 55)"
            strokeDasharray={`${fill} ${circ - fill}`}
            style={{ transition: "stroke-dasharray 800ms ease" }}
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
          <div style={{ fontSize: 28, fontWeight: 800, color: INK, lineHeight: 1 }}>
            <CountUpNum value={score} />
          </div>
          <div style={{ fontSize: 10, color: GREY, marginTop: 2 }}>/ 100</div>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{label}</div>
      {sub && (
        <div style={{ fontSize: 11, color: GREY, marginTop: 2, wordBreak: "break-word" }}>{sub}</div>
      )}
    </div>
  );
}

function MetricRow({
  label,
  yourVal,
  theirVal,
  unit,
  lowerIsBetter,
  index,
}: {
  label: string;
  yourVal: number | null;
  theirVal: number | null;
  unit: string;
  lowerIsBetter: boolean;
  index: number;
}) {
  const winner =
    yourVal == null || theirVal == null
      ? "tie"
      : Math.abs(yourVal - theirVal) < 0.001
        ? "tie"
        : lowerIsBetter
          ? (yourVal < theirVal ? "you" : "them")
          : (yourVal > theirVal ? "you" : "them");
  const fmt = (v: number | null) => (v == null ? "—" : unit === "ms" ? `${Math.round(v)}${unit}` : unit === "" ? v.toFixed(3) : `${v.toFixed(2)}${unit}`);
  const delay = staggerDelay(index);
  return (
    <div
      className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #F1F5F9",
        background: "#fff",
        fontSize: 12.5,
        animationDelay: `${delay}ms`,
        animationDuration: "350ms",
        animationFillMode: "backwards",
      }}
    >
      <div style={{ color: INK, fontWeight: 600 }}>{label}</div>
      <div style={{ color: winner === "you" ? GREEN : INK, fontWeight: winner === "you" ? 700 : 500, minWidth: 56, textAlign: "right" }}>
        {fmt(yourVal)}
      </div>
      <div style={{ color: GREY, fontSize: 10 }}>vs</div>
      <div style={{ color: winner === "them" ? RED : INK, fontWeight: winner === "them" ? 700 : 500, minWidth: 56, textAlign: "right" }}>
        {fmt(theirVal)}
      </div>
    </div>
  );
}

export interface SiteSpeedComparisonTabProps {
  reportId?: string | null;
}

export default function SiteSpeedComparisonTab({ reportId }: SiteSpeedComparisonTabProps) {
  const [state, setState] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const [data, setData] = useState<CompareResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!reportId) {
      setState("error");
      setErrorMsg("This tool needs a saved report.");
      return;
    }
    const cacheKey = `speed-compare:${reportId}`;
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
    fetch(`/api/audit/speed-vs-competitor?reportId=${encodeURIComponent(reportId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: CompareResponse) => {
        if (cancelled) return;
        if (!json.ok) throw new Error("API error");
        setData(json);
        setState(json.unavailable ? "empty" : "ready");
        try { sessionStorage.setItem(cacheKey, JSON.stringify(json)); } catch { /* noop */ }
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg(e?.message || "Failed to compare speeds.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const helpSections = useMemo(
    () => [
      {
        icon: <Zap size={20} />,
        title: "What this is",
        body: "We auto-find the top-ranking competitor in your city for your trade, then run Google's PageSpeed test against both sites and show you the side-by-side.",
      },
      {
        icon: <Gauge size={20} />,
        title: "How to read it",
        body: "The score (0-100) is Google's overall speed grade. The 4 metrics below — FCP, LCP, TBT, CLS — are Core Web Vitals. Lower is better for all 4. Green wins are highlighted.",
      },
      {
        icon: <Trophy size={20} />,
        title: "Why it matters",
        body: "Mobile users abandon slow pages — Google says 53% leave if a page takes over 3 seconds. A faster site = more calls, higher conversion, better local rankings.",
      },
      {
        icon: <Activity size={20} />,
        title: "How to improve it",
        body: "Common wins: compress images, defer offscreen JS, enable a CDN, use better hosting. WebFix + MapGuard together address page speed AND the local-SEO leverage it unlocks.",
      },
    ],
    [],
  );

  return (
    <AuditTabFrame
      testid="audit-tab-speed-comparison"
      title="Site Speed: You vs Competitor"
      insight={data?.summary || null}
      state={state}
      errorMessage={errorMsg || data?.summary}
      helpTrigger={
        <AuditTabHelpModal
          testid="audit-speed-help"
          triggerLabel="What is the Site Speed comparison?"
          title="Understanding your speed comparison"
          sections={helpSections}
        />
      }
      cta={
        data && data.you
          ? {
              eyebrow: "Win on speed",
              pitch: "WebFix tunes your hosting + page weight; MapGuard converts the speed advantage into local-pack ranking moves.",
              label: "Get the WebFix + MapGuard bundle",
              href: "/products/webfix?utm_source=audit&utm_medium=tab-cta&utm_campaign=speed-comparison",
            }
          : undefined
      }
    >
      {data && data.you && (
        <>
          {/* Side-by-side dials */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 18,
              marginBottom: 18,
            }}
          >
            <SpeedDial score={data.you.score} label="You" sub={data.you.hostname} />
            <SpeedDial score={data.them?.score ?? null} label="Top competitor" sub={data.them?.hostname || "competitor not found"} />
          </div>

          {/* Metric grid */}
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GREY, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 2 }}>
              Core Web Vitals (mobile)
            </div>
            <MetricRow
              index={0}
              label="First Contentful Paint"
              yourVal={data.you.fcp}
              theirVal={data.them?.fcp ?? null}
              unit="s"
              lowerIsBetter
            />
            <MetricRow
              index={1}
              label="Largest Contentful Paint"
              yourVal={data.you.lcp}
              theirVal={data.them?.lcp ?? null}
              unit="s"
              lowerIsBetter
            />
            <MetricRow
              index={2}
              label="Total Blocking Time"
              yourVal={data.you.tbt}
              theirVal={data.them?.tbt ?? null}
              unit="ms"
              lowerIsBetter
            />
            <MetricRow
              index={3}
              label="Cumulative Layout Shift"
              yourVal={data.you.cls}
              theirVal={data.them?.cls ?? null}
              unit=""
              lowerIsBetter
            />
          </div>
        </>
      )}
    </AuditTabFrame>
  );
}
