import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import s from "./FreeAuditReport.module.css";
import AuditChatWidget from "@/components/AuditChatWidget";
import { OptimizedImage } from "@/components/ui/Picture";
import { PageMeta } from "@/components/seo/PageMeta";
import {
  SemiGauge,
  DonutChart,
  BarComparisonCard,
  type DonutSegment,
  type SemiGaugePalette,
} from "@/components/ui/visual-primitives";
import {
  MapPin, Globe, Search, Trophy, Megaphone, Clock,
  Check, X as XIcon, Zap, ExternalLink, Download, Link2, Mail, ArrowRight,
} from "lucide-react";
import { mkt } from "@/theme/tokens";
import InfoTooltip from "@/components/marketing/InfoTooltip";
import { getServicesForIssues } from "@shared/services";

/* ─── Helpers ─── */
function scoreColor(score: number, max: number): string {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 70) return "#22C55E";
  if (pct >= 45) return "#F59E0B";
  return "#EF4444";
}

function gradeColor(grade: string): string {
  if (grade === "A") return "#22C55E";
  if (grade === "B") return mkt.accent;
  if (grade === "C") return "#F59E0B";
  return "#EF4444";
}

function gradeBg(grade: string): string {
  if (grade === "A") return "#DCFCE7";
  if (grade === "B") return "rgba(13,60,252,0.15)";
  if (grade === "C") return "#FEF3C7";
  return "#FEE2E2";
}

function renderStars(rating: number | null) {
  if (rating == null) return null;
  const full = Math.floor(rating);
  const stars: JSX.Element[] = [];
  for (let i = 0; i < 5; i++) {
    stars.push(<span key={i} style={{ color: i < full ? "#F59E0B" : "rgba(255,255,255,0.2)" }}>{"\u2605"}</span>);
  }
  return stars;
}

function fmtSec(v: any): string {
  const n = Number(v);
  if (Number.isNaN(n)) return "--";
  if (n < 1) return `${Math.round(n * 1000)}ms`;
  return `${n.toFixed(2)}s`;
}
function fmtMs(v: any): string {
  const n = Number(v);
  if (Number.isNaN(n)) return "--";
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
}

function metricStatusClass(name: string, raw: any): string {
  const v = Number(raw);
  if (Number.isNaN(v)) return s.statusNeeds;
  if (name === "FCP") return v <= 1.8 ? s.statusGood : v <= 3.0 ? s.statusNeeds : s.statusCritical;
  if (name === "LCP") return v <= 2.5 ? s.statusGood : v <= 4.0 ? s.statusNeeds : s.statusCritical;
  if (name === "TBT") return v <= 200 ? s.statusGood : v <= 600 ? s.statusNeeds : s.statusCritical;
  return v <= 0.1 ? s.statusGood : v <= 0.25 ? s.statusNeeds : s.statusCritical;
}
function metricStatusLabel(name: string, raw: any): string {
  const cls = metricStatusClass(name, raw);
  if (cls === s.statusGood) return "Good";
  if (cls === s.statusNeeds) return "Needs work";
  return "Critical";
}

function fmtNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/* ─── Wave 73c — KPI helpers ─── */
function bandPalette(pct: number): SemiGaugePalette {
  if (pct >= 80) return "emerald";
  if (pct >= 50) return "amber";
  return "crimson";
}
function overallVerdict(pct: number): string {
  if (pct >= 80) return "Strong";
  if (pct >= 50) return "Needs Work";
  return "Major Issues";
}
function overallAdvice(pct: number): string {
  if (pct >= 80) return "Keep maintaining — review monthly to defend your lead.";
  if (pct >= 50) return "Several fixable gaps. Tackle high-priority items first to move the needle.";
  return "Major issues are leaking leads. Focus on the top 3 actions to recover fast.";
}
function categoryVerdict(pct: number): string {
  if (pct >= 80) return "Strong";
  if (pct >= 50) return "Fair";
  return "Weak";
}
// Force any score number the AI narrative restates ("your score of 29/100") to
// the ONE computed overall score so the prose can't contradict the gauge.
function reconcileNarrativeScore(text: string | undefined, score: number): string | undefined {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/\b\d{1,3}\s*\/\s*100\b/g, `${score}/100`)
    .replace(/\b(score of|scored|scores)\s+\d{1,3}\b/gi, (_m, p1) => `${p1} ${score}`);
}
function categoryAdvice(key: string, pct: number): string {
  if (pct >= 80) return "Maintain";
  const tips: Record<string, string> = {
    googleMaps: "Complete your profile + collect more reviews.",
    websiteQuality: "Speed + mobile fixes will lift this fastest.",
    searchVisibility: "Add location-targeted SEO content.",
    competitorPositioning: "Differentiate on reviews + response time.",
  };
  return tips[key] ?? "Address the high-priority items below.";
}

/* ─── Plain-English explainer copy (help cues for non-technical owners) ─── */
// One-line "what this measures + what's good vs bad" per score category.
const CATEGORY_HELP: Record<string, string> = {
  googleMaps:
    "Your Google Business Profile — photos, hours, description, reviews. A complete, well-reviewed profile wins the top Maps spots; gaps push you down.",
  websiteQuality:
    "How fast, mobile-friendly and professional your site is. Slow or dated sites lose visitors before they ever call.",
  searchVisibility:
    "How easily customers find you on Google when they search for your service. Higher = you show up for more of the searches that matter.",
  competitorPositioning:
    "How you stack up against the other local businesses customers see next to you — reviews, website, ads. Higher means you out-position rivals.",
  adOpportunity:
    "The size of the paid-search market in your area — how much demand you could capture with Google Ads. Higher = more upside available.",
  demandCoverage:
    "Whether you're reachable when customers actually search (evenings, weekends, after-hours). Higher means you catch demand competitors miss.",
};

const OVERALL_HELP =
  "Your overall local-SEO health out of 100 — a weighted blend of your Google profile, website, search visibility, competitor position, ad opportunity and demand coverage. 80+ is strong, 50–79 has fixable gaps, under 50 means leads are leaking.";

// Jargon glossary used by inline InfoTooltip help cues.
const JARGON = {
  gbp: "Google Business Profile (GBP): your free Google listing that shows your name, hours, reviews and map pin. It's what customers see in Google Maps and the local '3-pack'.",
  monthlySearches:
    "Monthly searches: roughly how many times people in your area type this into Google each month. Higher = more potential customers looking.",
  cpc: "Cost per click (CPC): what advertisers pay Google for one click on this keyword. A higher number means the search is valuable — people who type it tend to buy.",
  rank: "Search rank: where your website lands in Google's results for this term. #1–3 gets most clicks; below #10 (page 2) gets almost none. 'Not ranking' means you don't appear.",
  speedScore:
    "Speed score (0–100): Google's grade for how fast your page loads. 90+ is fast, 50–89 needs work, under 50 is slow — and slow pages lose visitors and rank.",
};

// Realistic "after" target for a before→after strip: close ~60% of the gap to
// the category max, rounded, never below current and never above max. Uses the
// real score already in the report (no fabricated numbers).
function realisticTarget(score: number, max: number): number {
  if (max <= 0) return score;
  const gap = max - score;
  if (gap <= 0) return score;
  const lift = Math.max(1, Math.round(gap * 0.6));
  return Math.min(max, score + lift);
}

const NAV_SECTIONS = [
  { id: "at-a-glance", label: "At a Glance" },
  { id: "maps", label: "Maps" },
  { id: "website", label: "Website" },
  { id: "competitors", label: "Competitors" },
  { id: "plan", label: "Plan" },
];

function scrollToSection(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
  const el = document.getElementById(id);
  if (el) {
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export default function SharedAuditReport() {
  const [, params] = useRoute("/audit/report/:id");
  const id = params?.id || "";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // P1-10: distinguish a transient failure (network down / timeout / HTTP
  // error) from a genuine "deleted" report ({ ok:false }). Only the latter is
  // terminal; the former gets a "Try again" affordance instead of the
  // misleading "this report was removed" message.
  const [transient, setTransient] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Share / download controls (PDF + email + copy-link). Backend endpoints
  // (/report/:id/pdf, /report/:id/send-email) are public, so the shared
  // prospect-facing view can use them directly.
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailErr, setEmailErr] = useState("");

  const handlePdfDownload = async () => {
    if (!id || pdfDownloading) return;
    setPdfDownloading(true);
    try {
      const resp = await fetch(`/api/audit/report/${id}/pdf`);
      if (!resp.ok || !(resp.headers.get("content-type") || "").includes("application/pdf")) {
        setPdfDownloading(false);
        return;
      }
      const blob = await resp.blob();
      const nm = ((data?.auditData?.business?.name as string) || "Report").replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `WeFixTrades-Audit-${nm}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* surfaced via disabled state reset below */
    } finally {
      setPdfDownloading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  const handleEmailReport = async () => {
    if (!id || emailState === "sending" || !emailValue.includes("@")) return;
    setEmailState("sending");
    setEmailErr("");
    try {
      const resp = await fetch(`/api/audit/report/${id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: emailValue.trim() }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setEmailErr(j?.message || j?.error || "Couldn't send — please try again.");
        setEmailState("error");
        return;
      }
      setEmailState("sent");
    } catch {
      setEmailErr("Something went wrong. Please try again.");
      setEmailState("error");
    }
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTransient(false);
    // P1-10: a hung backend would otherwise spin "Loading report..." forever.
    // Abort the fetch after 15s and treat it as a transient failure.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    (async () => {
      try {
        const r = await fetch(`/api/audit/report/${id}`, { signal: controller.signal });
        // A non-2xx HTTP status (502/503/timeout-at-proxy) is a transport
        // failure, NOT a deleted report — retry-able.
        if (!r.ok) {
          if (!cancelled) { setError(`Server returned ${r.status}`); setTransient(true); }
          return;
        }
        const d = await r.json().catch(() => null);
        if (cancelled) return;
        if (!d) {
          // Body wasn't valid JSON — treat as transient transport hiccup.
          setError("Couldn't read the report response"); setTransient(true);
          return;
        }
        if (!d.ok) {
          // Backend explicitly says the report isn't available — terminal.
          setError(d.error || "Not found"); setTransient(false);
          return;
        }
        setData(d.report);
      } catch (e: any) {
        if (cancelled) return;
        // AbortError (timeout) or a network error — transient, offer retry.
        const isAbort = e?.name === "AbortError";
        setError(isAbort ? "The report took too long to load" : "Network error — check your connection");
        setTransient(true);
      } finally {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [id, reloadKey]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", fontFamily: "Inter, system-ui", color: "#6B7280" }}>Loading report...</div>;
  if (error || !data) return (
    <div data-theme="light" style={{ padding: 40, textAlign: "center", fontFamily: "Inter, system-ui" }} data-testid="shared-report-error">
      <h2 style={{ color: "#EF4444" }}>{transient ? "Couldn't load this report" : "Report not found"}</h2>
      <p style={{ color: "#6B7280", marginTop: 8 }}>
        {transient
          ? `${error || "Something went wrong loading the report."} This is usually temporary.`
          : (error || "This report may have been removed.")}
      </p>
      {transient && (
        <button
          data-testid="shared-report-retry"
          onClick={() => setReloadKey((k) => k + 1)}
          style={{ display: "inline-block", marginTop: 16, marginRight: 10, padding: "12px 24px", background: mkt.accent, color: "#FFFFFF", borderRadius: 10, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}
        >
          Try again
        </button>
      )}
      <a href="/tools/free-audit" style={{ display: "inline-block", marginTop: 16, padding: "12px 24px", background: transient ? "#FFFFFF" : mkt.accent, color: transient ? "#1A1A2E" : "#FFFFFF", border: transient ? "1px solid #E5E7EB" : "none", borderRadius: 10, fontWeight: 700, textDecoration: "none" }}>Get your own free audit &rarr;</a>
    </div>
  );

  const ad = data.auditData as any;
  const biz = ad?.business || {};
  const scores = ad?.scores || {};
  const narrative = ad?.narrative || {};
  const competitors = ad?.competitors || [];
  const keywords = ad?.keywords || [];
  const revLoss = ad?.estimatedRevenueLoss;
  const speedData = ad?.speedData || {};
  const actionPlan = narrative?.actionPlan || [];
  const quickWin = narrative?.quickWin;
  // Partial-data note: prefer the AI-authored note, else derive one from the
  // deterministic dataQuality flags so a dropped source is never silent.
  const dataQuality = ad?.dataQuality || {};
  const speedNumbersPresent = speedData?.mobile?.score != null || speedData?.desktop?.score != null;
  const missingDataNote: string | null = (() => {
    const aiNote = narrative?.reportDataQuality?.missingDataNote;
    if (typeof aiNote === "string" && aiNote.trim()) {
      // Don't let a stale AI note claim speed was unavailable when real speed
      // numbers actually loaded (they'd contradict the Website pillar/section).
      const claimsSpeedMissing = /speed/i.test(aiNote)
        && /(unavailable|could ?n[’']?t|couldn[’']?t|not be completed|no data)/i.test(aiNote);
      if (!(claimsSpeedMissing && speedNumbersPresent)) return aiNote.trim();
    }
    const missing: string[] = [];
    if (dataQuality.competitorDataAvailable === false) missing.push("competitor");
    if (dataQuality.keywordDataAvailable === false) missing.push("search-ranking");
    if (dataQuality.reviewDataAvailable === false) missing.push("review");
    if (!missing.length && dataQuality.gatherTimedOut !== true) return null;
    const what = missing.length ? `${missing.join(" and ")} data` : "some data";
    return `We couldn't load ${what} this run, so it's excluded from the score above — refresh to retry.`;
  })();
  // P1-4 disclosure: the business has a website but our crawler couldn't reach
  // it (network error or a bot-block such as HTTP 403). We exclude the website
  // category from the score rather than fabricating a low one — say so plainly.
  const websiteBlockedNote: string | null = dataQuality.websiteFetchBlocked === true
    ? `We couldn't reach your website${dataQuality.websiteFetchHttpStatus ? ` (it returned HTTP ${dataQuality.websiteFetchHttpStatus})` : ""} — it may block automated tools. We've left website quality out of the score rather than guess.`
    : null;
  // The scoring engine returns the headline as `total`; older cached reports may
  // carry `overall`. Read total first so the hero ring/gauge/competitor bar show
  // the real score instead of a constant 0. Coerce with Number()||0 so a string
  // or undefined never propagates NaN into the ring/gauge math (P5).
  const overall = Number(scores?.total ?? scores?.overall) || 0;
  const grade = scores?.grade || "D";
  // Revenue honesty — mirror ReportView exactly. The backend derives
  // `estimatedRevenueLoss = {low, high, isReal, ...}`. isReal=true → show the
  // business-specific $low–$high/mo band; isReal=false (low/high are 0) →
  // positive-frame ("you're capturing demand well — defend it"), NEVER a fake
  // loss. Gating on `high > 0` alone (the old behaviour) could contradict the
  // interactive report on a forwarded copy.
  const revLow = Number(revLoss?.low) || 0;
  const revHigh = Number(revLoss?.high) || 0;
  const revLossReal = revLoss?.isReal === true && (revLow > 0 || revHigh > 0);
  const maxVol = Math.max(...keywords.map((k: any) => k.monthlySearches || 0), 1);

  // Per-issue CTA target: the single best-matched WeFixTrades service for this
  // business's detected issues (reuses the existing issue→service mapping).
  // Used for the always-present "We can fix this →" chip on each action item so
  // a forwarded report keeps the offer attached to every problem.
  const detectedIssues: string[] = Array.isArray(ad?.detectedIssues) ? ad.detectedIssues : [];
  const recommendedService = getServicesForIssues(detectedIssues)[0] || null;
  // P1 — make the CTA land on a REAL, preselected purchase instead of dumping
  // the prospect at the top of /pricing. Deep-link to a query-driven checkout
  // (`/pricing?service=<id>&checkout=1`) that PricingUnified reads on mount to
  // auto-open the CheckoutModal with the matched service preselected — the same
  // intent as the interactive ReportView's fixWithService → setCheckoutOpen.
  const fixHref = recommendedService
    ? `/pricing?service=${encodeURIComponent(recommendedService.id)}&checkout=1`
    : "/pricing";
  const fixLabel = recommendedService ? `Fix with ${recommendedService.name}` : "We can fix this";

  // Only show nav links whose section actually renders for this report, so a
  // tapped anchor always lands somewhere.
  const hasSpeed = (speedData?.mobile?.score != null || speedData?.desktop?.score != null);
  const availableNavIds = new Set<string>([
    "at-a-glance",
    "maps",
    ...(hasSpeed ? ["website"] : []),
    ...(competitors.length > 0 ? ["competitors"] : []),
    ...(actionPlan.length > 0 ? ["plan"] : []),
  ]);
  const navSections = NAV_SECTIONS.filter((sec) => availableNavIds.has(sec.id));

  const SCORE_CATEGORIES = [
    { key: "googleMaps", label: "Google Maps", desc: "How complete and trusted your Google profile is", icon: <MapPin size={20} /> },
    { key: "websiteQuality", label: "Website", desc: "How fast and professional your website is", icon: <Globe size={20} /> },
    { key: "searchVisibility", label: "Search Visibility", desc: "How easily customers find you on Google", icon: <Search size={20} /> },
    { key: "competitorPositioning", label: "Competitor Position", desc: "How you compare to local competitors", icon: <Trophy size={20} /> },
    { key: "adOpportunity", label: "Ad Opportunity", desc: "The paid search market available in your area", icon: <Megaphone size={20} /> },
    { key: "demandCoverage", label: "Demand Coverage", desc: "Whether you're visible when customers search", icon: <Clock size={20} /> },
  ];

  const circumference = 2 * Math.PI * 48;
  const arcLength = (overall / 100) * circumference;

  /* Wave 73c — KPI data */
  const overallPct = Math.max(0, Math.min(100, overall));

  // 4-up category gauges — pick the 4 most actionable
  const FOUR_UP_CATEGORIES: Array<{ key: string; label: string }> = [
    { key: "googleMaps", label: "Google Maps" },
    { key: "websiteQuality", label: "Website" },
    { key: "searchVisibility", label: "Search Visibility" },
    { key: "competitorPositioning", label: "Competitor Position" },
  ];

  // Issue breakdown by priority (DonutChart segments)
  const priorityCounts = actionPlan.reduce(
    (acc: Record<string, number>, item: any) => {
      const p = (item.priority || "medium").toLowerCase();
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    },
    {}
  );
  const issueSegments: DonutSegment[] = (
    [
      { label: "High priority", value: priorityCounts.high || 0, color: "crimson" as const },
      { label: "Medium", value: priorityCounts.medium || 0, color: "amber" as const },
      { label: "Low", value: priorityCounts.low || 0, color: "emerald" as const },
    ] satisfies DonutSegment[]
  ).filter((seg) => seg.value > 0);
  const totalIssues = issueSegments.reduce((sum, seg) => sum + seg.value, 0);

  // Competitor benchmark — average competitor score
  const competitorAvg =
    competitors.length > 0
      ? Math.round(
          competitors.reduce((sum: number, c: any) => sum + (c.score || 0), 0) /
            competitors.length
        )
      : null;

  const reportTitle = biz.name ? `Free SEO audit — ${biz.name}` : "Shared SEO audit report";

  return (
    <div data-theme="light" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <PageMeta
        title={reportTitle}
        description="A WeFixTrades local SEO audit covering Google Business Profile, website quality, search visibility, competitors, and revenue opportunity."
        noIndex
        ogType="article"
        // P4 — pasted/forwarded links unfurl with the score card. The backend
        // renders a per-report OG image at this endpoint (auditRoutes.ts).
        // PageMeta resolves the relative path to an absolute URL for og:image /
        // twitter:image. noIndex keeps it out of search while still unfurling.
        ogImage={id ? `/api/audit/report/${id}/og-image` : undefined}
      />
      {/* Sticky header — read-only shared view */}
      <div className={s.stickyHeader}>
        <div className={s.stickyLogo}>We<span>Fix</span>Trades</div>
        <div style={{ flex: 1 }} />
        <span className={s.sharedBadge}>Shared Report</span>
        <a href="/tools/free-audit" style={{ marginLeft: 8, padding: "6px 14px", borderRadius: 8, background: mkt.accent, color: "#FFFFFF", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Get your own free audit &rarr;</a>
      </div>

      {/* Sticky section-anchor nav — smooth-scroll on a long single-scroll report */}
      <nav className={s.sectionNav} aria-label="Report sections" data-testid="shared-section-nav">
        {navSections.map((sec) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            className={s.sectionNavLink}
            onClick={(e) => scrollToSection(e, sec.id)}
          >
            {sec.label}
          </a>
        ))}
      </nav>

      <div className={s.reportPage}>
        {/* C1 — Hero */}
        <div className={s.heroCard}>
          <div className={s.heroTop}>
            <div className={s.heroLeft}>
              {biz.businessPhotoUrl ? (
                <OptimizedImage
                  className={s.heroPhoto}
                  src={biz.businessPhotoUrl}
                  alt=""
                  width={72}
                  height={72}
                  loading="lazy"
                />
              ) : (
                <div className={s.heroPhotoPlaceholder}>{(biz.name || "?")[0]}</div>
              )}
              <div className={s.heroName}>{biz.name}</div>
              <div className={s.heroMeta}>
                {biz.address && <span>{biz.address}</span>}
                {biz.phone && <span>{biz.phone}</span>}
              </div>
              {biz.rating != null && (
                <div className={s.heroStars}>
                  {renderStars(biz.rating)} <span>{biz.rating} ({biz.reviewsCount || 0} reviews)</span>
                </div>
              )}
              {biz.website && (
                <a className={s.heroWebsite} href={biz.website} target="_blank" rel="noreferrer">
                  {biz.website.replace(/^https?:\/\//, "")} <ExternalLink size={12} style={{ verticalAlign: "middle" }} />
                </a>
              )}
            </div>
            <div className={s.heroRight}>
              <div className={s.scoreCircle}>
                <svg viewBox="0 0 108 108">
                  <circle className={s.scoreCircleBg} cx="54" cy="54" r="48" strokeWidth="8" />
                  <circle className={s.scoreCircleFill} cx="54" cy="54" r="48" strokeWidth="8"
                    stroke={gradeColor(grade)}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - arcLength}
                  />
                </svg>
                <div className={s.scoreCircleText}>
                  <div className={s.scoreNum}>{overall}</div>
                  <div className={s.scoreDenom}>/100</div>
                </div>
              </div>
              <span className={s.gradeBadge} style={{ background: gradeBg(grade), color: gradeColor(grade) }}>{grade}</span>
            </div>
          </div>
          {narrative.executiveSummary && <div className={s.heroSummary}>{reconcileNarrativeScore(narrative.executiveSummary, overall)}</div>}
          {missingDataNote && <div className={s.calloutAmber} data-testid="audit-missing-data-note">{missingDataNote}</div>}
          {websiteBlockedNote && <div className={s.calloutAmber} data-testid="audit-website-blocked-note">{websiteBlockedNote}</div>}
          <div className={s.heroFooter}>
            Generated on {data.createdAt ? new Date(data.createdAt).toLocaleDateString() : "N/A"} · Powered by WeFixTrades AI · Viewed {data.viewCount || 1} times
          </div>
        </div>

        {/* Share / download controls — prospect-facing actions */}
        <div className={s.sectionCard} data-testid="shared-report-controls">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button
              data-testid="shared-download-pdf"
              onClick={handlePdfDownload}
              disabled={pdfDownloading}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 18px", borderRadius: 10, border: "none",
                background: pdfDownloading ? "#E5E7EB" : mkt.accent,
                color: pdfDownloading ? "#6B7280" : "#FFFFFF",
                fontWeight: 700, fontSize: 14,
                cursor: pdfDownloading ? "default" : "pointer",
              }}
            >
              <Download size={16} /> {pdfDownloading ? "Preparing PDF…" : "Download PDF"}
            </button>
            <button
              data-testid="shared-print"
              onClick={() => window.print()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 18px", borderRadius: 10,
                border: "1px solid #E5E7EB", background: "#FFFFFF",
                color: "#1A1A2E", fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}
            >
              Print
            </button>
            <button
              data-testid="shared-copy-link"
              onClick={handleCopyLink}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 18px", borderRadius: 10,
                border: "1px solid #E5E7EB", background: "#FFFFFF",
                color: "#1A1A2E", fontWeight: 600, fontSize: 14, cursor: "pointer",
              }}
            >
              <Link2 size={16} /> {copied ? "Link copied" : "Copy link"}
            </button>
          </div>

          {/* Email me this report */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>Email me this report</div>
            {emailState === "sent" ? (
              // P6 — confirm the send but allow emailing a SECOND address. The
              // form used to be permanently replaced, so a forwarder couldn't
              // send the report to another person on the same visit.
              <div data-testid="shared-email-sent" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Check size={16} /> Sent — check your inbox.
                </span>
                <button
                  data-testid="shared-email-again"
                  onClick={() => { setEmailValue(""); setEmailErr(""); setEmailState("idle"); }}
                  style={{
                    background: "none", border: "none", padding: 0,
                    color: mkt.accent, fontWeight: 600, fontSize: 13,
                    cursor: "pointer", fontFamily: "inherit", textDecoration: "underline",
                  }}
                >
                  Send to another address
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, maxWidth: 420 }}>
                <input
                  type="email"
                  value={emailValue}
                  onChange={(e) => { setEmailValue(e.target.value); if (emailState === "error") setEmailState("idle"); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEmailReport(); }}
                  placeholder="you@business.com"
                  aria-label="Email address for report"
                  data-testid="shared-email-input"
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFFFFF", color: "#1A1A2E", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                />
                <button
                  data-testid="shared-email-send"
                  onClick={handleEmailReport}
                  disabled={emailState === "sending" || !emailValue.includes("@")}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "10px 16px", borderRadius: 10, border: "none",
                    background: (emailState === "sending" || !emailValue.includes("@")) ? "#E5E7EB" : mkt.accent,
                    color: (emailState === "sending" || !emailValue.includes("@")) ? "#6B7280" : "#FFFFFF",
                    fontWeight: 700, fontSize: 13, flexShrink: 0,
                    cursor: (emailState === "sending" || !emailValue.includes("@")) ? "default" : "pointer",
                  }}
                >
                  <Mail size={16} /> {emailState === "sending" ? "Sending…" : "Send"}
                </button>
              </div>
            )}
            {emailState === "error" && emailErr && (
              <div data-testid="shared-email-error" style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{emailErr}</div>
            )}
          </div>
        </div>

        {/* Wave 73c — KPI primitives row (overall health + 4 categories) */}
        <div id="at-a-glance" className={`${s.sectionCard} ${s.scrollAnchor}`} data-testid="audit-kpi-row">
          <div className={s.sectionTitle}>
            <span className={s.gaugeLabelRow}>
              At a Glance
              <InfoTooltip theme="light" title="How to read your score" text={OVERALL_HELP} />
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "8px 0",
              }}
            >
              <SemiGauge
                value={overallPct}
                max={100}
                label="Overall Site Health"
                verdict={overallVerdict(overallPct)}
                advice={overallAdvice(overallPct)}
                unit="/100"
                palette={bandPalette(overallPct)}
                size={240}
              />
              {/* Permanent one-line "what this measures" caption (no modals here) */}
              <div className={s.gaugeCaption} data-testid="audit-overall-caption">
                Out of 100. 80+ strong · 50–79 fixable gaps · under 50 leaks leads.
              </div>
            </div>
            {FOUR_UP_CATEGORIES.map((cat) => {
              // P5 — a partial report can carry {max:25, score:undefined}, which
              // defeats the `|| {…}` default and feeds NaN into the gauge. Coerce
              // each field with Number()||0 before any math.
              const rawSc = scores[cat.key] || {};
              const scScore = Number(rawSc.score) || 0;
              const scMax = Number(rawSc.max) || 1;
              const pct = scMax > 0 ? (scScore / scMax) * 100 : 0;
              const safePct = Number.isFinite(pct) ? pct : 0;
              return (
                <div
                  key={cat.key}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
                  data-testid={`audit-kpi-${cat.key}`}
                >
                  <SemiGauge
                    value={Math.round(safePct)}
                    max={100}
                    label={cat.label}
                    verdict={categoryVerdict(safePct)}
                    advice={categoryAdvice(cat.key, safePct)}
                    unit="%"
                    palette={bandPalette(safePct)}
                    size={150}
                  />
                  {/* per-category "what this measures" help cue */}
                  <div className={s.gaugeLabelRow} style={{ marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>What this measures</span>
                    <InfoTooltip theme="light" title={cat.label} text={CATEGORY_HELP[cat.key] || categoryAdvice(cat.key, safePct)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Wave 73c — Issue breakdown + competitor benchmark */}
        {(totalIssues > 0 || competitorAvg != null) && (
          <div
            className={s.sectionCard}
            data-testid="audit-kpi-breakdown"
            style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  totalIssues > 0 && competitorAvg != null
                    ? "1fr 1fr"
                    : "1fr",
                gap: 24,
                alignItems: "center",
              }}
              className={s.kpiBreakdownGrid}
            >
              {totalIssues > 0 && (
                <div data-testid="audit-issue-donut">
                  <div className={s.sectionTitle} style={{ marginBottom: 8 }}>
                    Issue Breakdown
                  </div>
                  <DonutChart
                    segments={issueSegments}
                    centerLabel={String(totalIssues)}
                    centerSub={totalIssues === 1 ? "issue" : "issues"}
                    size={180}
                  />
                </div>
              )}
              {competitorAvg != null && (
                <div data-testid="audit-benchmark-bars">
                  <div className={s.sectionTitle} style={{ marginBottom: 8 }}>
                    Vs Local Competitors
                  </div>
                  <BarComparisonCard
                    items={[
                      {
                        label: "Your site",
                        value: overallPct,
                        color:
                          overallPct >= competitorAvg ? "emerald" : "crimson",
                        formatValue: (n) => `${Math.round(n)}/100`,
                      },
                      {
                        label: "Local average",
                        value: competitorAvg,
                        color: "sapphire",
                        formatValue: (n) => `${Math.round(n)}/100`,
                      },
                    ]}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* C2 — Score Breakdown */}
        <div id="maps" className={`${s.sectionCard} ${s.scrollAnchor}`}>
          <div className={s.sectionTitle}>Your Score Breakdown</div>
          {SCORE_CATEGORIES.map(cat => {
            // P5 — coerce score/max so a partial report ({max:25, score:undefined})
            // can't render NaN in the bar, value, or before/after strip.
            const rawSc = scores[cat.key] || {};
            const scScore = Number(rawSc.score) || 0;
            const scMax = Number(rawSc.max) || 1;
            const pctRaw = scMax > 0 ? (scScore / scMax) * 100 : 0;
            const pct = Number.isFinite(pctRaw) ? pctRaw : 0;
            const color = scoreColor(scScore, scMax);
            const after = realisticTarget(scScore, scMax);
            const showBA = after > scScore;
            return (
              <div key={cat.key} className={s.scoreRow}>
                <div className={s.scoreRowIcon} style={{ color }}>{cat.icon}</div>
                <div className={s.scoreRowBody}>
                  <div className={s.scoreRowName}>
                    <span className={s.gaugeLabelRow}>
                      {cat.label}
                      <InfoTooltip theme="light" title={cat.label} text={CATEGORY_HELP[cat.key] || cat.desc} />
                    </span>
                  </div>
                  <div className={s.scoreRowDesc}>{cat.desc}</div>
                  <div className={s.scoreBar}><div className={s.scoreBarFill} style={{ width: `${pct}%`, background: color }} /></div>
                  {showBA && (
                    <div className={s.baStrip} data-testid={`audit-ba-${cat.key}`}>
                      <span className={s.baNow}>Now {scScore}/{scMax}</span>
                      <span className={s.baArrow}>&rarr;</span>
                      <span className={s.baAfter}>Potential {after}/{scMax}</span>
                    </div>
                  )}
                </div>
                <div className={s.scoreRowValue} style={{ color }}>{scScore} / {scMax}</div>
              </div>
            );
          })}
        </div>

        {/* C3 — Action Plan */}
        {actionPlan.length > 0 && (
          <div id="plan" className={`${s.sectionCard} ${s.scrollAnchor}`}>
            <div className={s.sectionTitle}>What's Holding You Back</div>
            {actionPlan.map((item: any, i: number) => {
              const prio = (item.priority || "medium").toLowerCase();
              const prioCls = prio === "high" ? s.priorityHigh : prio === "low" ? s.priorityLow : s.priorityMedium;
              // P2 — render the DISTINCT problem vs fix the backend now provides,
              // mirroring ReportView exactly. Falling back to estimatedImpact /
              // detail keeps older cached reports working, and showFix suppresses
              // the "HOW TO FIX IT" block when it would just echo the problem.
              const problemText = (item.problem || item.estimatedImpact || item.detail || "").trim();
              const fixText = (item.fix || item.detail || "").trim();
              const showFix = !!fixText && fixText !== problemText;
              return (
                <div key={i} className={s.issueCard}>
                  <div className={s.issueTopBar}>
                    <span className={`${s.priorityBadge} ${prioCls}`}>{prio}</span>
                    {item.estimatedImpact && <span className={s.impactBadge}>{item.estimatedImpact}</span>}
                  </div>
                  <div className={s.issueBody}>
                    <div className={s.issueSection}>
                      <div className={`${s.issueSectionLabel} ${s.problem}`}>THE PROBLEM</div>
                      <div className={s.issueSectionTitle}>{item.title}</div>
                      {problemText && <div className={s.issueSectionText}>{problemText}</div>}
                    </div>
                    {(prio === "high" ? item.estimatedImpact : item.estimatedImpact) && (
                      <div className={s.issueSection}>
                        <div className={`${s.issueSectionLabel} ${s.cost}`}>WHAT IT'S COSTING YOU</div>
                        <div className={s.issueSectionText}>
                          {prio === "high"
                            ? `Every month this isn't fixed, you're potentially missing ${item.estimatedImpact}.`
                            : `Addressing this could bring in ${item.estimatedImpact}.`}
                        </div>
                      </div>
                    )}
                    {showFix && (
                      <div className={s.issueSection}>
                        <div className={`${s.issueSectionLabel} ${s.fix}`}>HOW TO FIX IT</div>
                        <div className={s.badgeRow}>
                          {item.estimatedCost && <span className={s.smallBadge}>{item.estimatedCost}</span>}
                          {item.timeToResult && <span className={s.smallBadge}>{item.timeToResult}</span>}
                        </div>
                        <div className={s.issueSectionText}>{fixText}</div>
                      </div>
                    )}
                  </div>
                  {/* Always-present per-issue CTA — the offer rides every problem
                      so a forwarded report stays a lead magnet (conversion #9). */}
                  <div className={s.issueFixBanner} data-testid={`audit-issue-cta-${i}`}>
                    <span className={s.issueFixText}>
                      Don't want to do this yourself? <strong>We can fix it for you.</strong>
                    </span>
                    <a className={s.issueFixLink} href={fixHref}>
                      {fixLabel} <ArrowRight size={14} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* C4 — Competitors */}
        {competitors.length > 0 && (
          <div id="competitors" className={`${s.sectionCard} ${s.scrollAnchor}`}>
            <div className={s.sectionTitle}>
              <span className={s.gaugeLabelRow}>
                How You Compare Locally
                <InfoTooltip theme="light" title="Reading this table" text="A snapshot of the local businesses customers see alongside you. 'Website' and 'Ads' show whether each one has those — gaps are where you can pull ahead. 'Score' is each business's overall local-SEO health out of 100." />
              </span>
            </div>
            {/* Desktop / tablet: scrollable table (≥480px) */}
            <div className={s.compTableWrap}>
              <table className={s.compTable}>
                <thead>
                  <tr><th>#</th><th>Business</th><th>Rating</th><th>Reviews</th><th>Website</th><th>Ads</th><th>Score</th></tr>
                </thead>
                <tbody>
                  <tr className={s.compRowUser}>
                    <td style={{ fontWeight: 700 }}>{"\u2605"} YOU</td>
                    <td><div className={s.compName}><strong>{biz.name}</strong></div></td>
                    <td>{biz.rating ?? "--"}</td>
                    <td>{biz.reviewsCount ?? 0}</td>
                    <td>{biz.website ? <Check size={14} color="#22C55E" /> : <XIcon size={14} color="#EF4444" />}</td>
                    <td><XIcon size={14} color="#EF4444" /></td>
                    <td><span className={s.compScoreBadge} style={{ background: gradeBg(grade), color: gradeColor(grade) }}>{overall}</span></td>
                  </tr>
                  {competitors.map((c: any, i: number) => {
                    const cColor = c.score >= 70 ? "#22C55E" : c.score >= 45 ? "#F59E0B" : "#EF4444";
                    const cBg = c.score >= 70 ? "#DCFCE7" : c.score >= 45 ? "#FEF3C7" : "#FEE2E2";
                    return (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>
                          <div className={s.compName}>
                            {c.photoUrl ? (
                              <OptimizedImage
                                className={s.compPhoto}
                                src={c.photoUrl}
                                alt=""
                                width={32}
                                height={32}
                                loading="lazy"
                              />
                            ) : (
                              <div className={s.compPhotoPlaceholder}>{(c.name || "?")[0]}</div>
                            )}
                            {c.name}
                          </div>
                        </td>
                        <td>{c.rating || "--"}</td>
                        <td>{c.reviewsCount || 0}</td>
                        <td>{c.hasWebsite ? <Check size={14} color="#22C55E" /> : <XIcon size={14} color="#EF4444" />}</td>
                        <td>{c.isRunningAds ? <Check size={14} color="#22C55E" /> : <XIcon size={14} color="#EF4444" />}</td>
                        <td><span className={s.compScoreBadge} style={{ background: cBg, color: cColor }}>{c.score}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked cards (<480px) — no horizontal clipping */}
            <div className={s.compCards} data-testid="comp-cards">
              <div className={`${s.compCard} ${s.compCardYou}`}>
                <div className={s.compCardHead}>
                  <span className={s.compCardName}>{"★"} {biz.name} (You)</span>
                  <span className={s.compScoreBadge} style={{ background: gradeBg(grade), color: gradeColor(grade) }}>{overall}</span>
                </div>
                <div className={s.compCardGrid}>
                  <div className={s.compCardCell}><span className={s.compCardCellLabel}>Rating</span><span className={s.compCardCellVal}>{biz.rating ?? "--"}</span></div>
                  <div className={s.compCardCell}><span className={s.compCardCellLabel}>Reviews</span><span className={s.compCardCellVal}>{biz.reviewsCount ?? 0}</span></div>
                  <div className={s.compCardCell}><span className={s.compCardCellLabel}>Website</span><span className={s.compCardCellVal}>{biz.website ? <Check size={14} color="#22C55E" /> : <XIcon size={14} color="#EF4444" />}</span></div>
                  <div className={s.compCardCell}><span className={s.compCardCellLabel}>Ads</span><span className={s.compCardCellVal}><XIcon size={14} color="#EF4444" /></span></div>
                </div>
              </div>
              {competitors.map((c: any, i: number) => {
                const cColor = c.score >= 70 ? "#22C55E" : c.score >= 45 ? "#F59E0B" : "#EF4444";
                const cBg = c.score >= 70 ? "#DCFCE7" : c.score >= 45 ? "#FEF3C7" : "#FEE2E2";
                return (
                  <div key={i} className={s.compCard}>
                    <div className={s.compCardHead}>
                      <span className={s.compCardRank}>#{i + 1}</span>
                      <span className={s.compCardName}>{c.name}</span>
                      <span className={s.compScoreBadge} style={{ background: cBg, color: cColor }}>{c.score}</span>
                    </div>
                    <div className={s.compCardGrid}>
                      <div className={s.compCardCell}><span className={s.compCardCellLabel}>Rating</span><span className={s.compCardCellVal}>{c.rating || "--"}</span></div>
                      <div className={s.compCardCell}><span className={s.compCardCellLabel}>Reviews</span><span className={s.compCardCellVal}>{c.reviewsCount || 0}</span></div>
                      <div className={s.compCardCell}><span className={s.compCardCellLabel}>Website</span><span className={s.compCardCellVal}>{c.hasWebsite ? <Check size={14} color="#22C55E" /> : <XIcon size={14} color="#EF4444" />}</span></div>
                      <div className={s.compCardCell}><span className={s.compCardCellLabel}>Ads</span><span className={s.compCardCellVal}>{c.isRunningAds ? <Check size={14} color="#22C55E" /> : <XIcon size={14} color="#EF4444" />}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
            {narrative.competitorWeakness && <div className={s.calloutAmber}>Opportunity: {narrative.competitorWeakness}</div>}
          </div>
        )}

        {/* C5 — Keywords */}
        {keywords.some((k: any) => k.monthlySearches > 0) && (
          <div className={s.sectionCard}>
            <div className={s.sectionTitle}>
              <span className={s.gaugeLabelRow}>
                What Customers Search For
                <InfoTooltip theme="light" title="Search terms" text={JARGON.monthlySearches} />
              </span>
            </div>
            {/* legend with help cues for the per-keyword pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12, fontSize: 11, color: "#6B7280", fontWeight: 600 }} data-testid="kw-legend">
              <span className={s.gaugeLabelRow}>$ = cost per click<InfoTooltip theme="light" title="Cost per click (CPC)" text={JARGON.cpc} /></span>
              <span className={s.gaugeLabelRow}># = your Google rank<InfoTooltip theme="light" title="Search rank" text={JARGON.rank} /></span>
            </div>
            {keywords.map((kw: any, i: number) => {
              const volPct = maxVol > 0 ? ((kw.monthlySearches || 0) / maxVol) * 100 : 0;
              const rankColor = kw.organicRank ? (kw.organicRank <= 3 ? "#22C55E" : kw.organicRank <= 10 ? "#F59E0B" : "#EF4444") : "#EF4444";
              const rankBg = kw.organicRank ? (kw.organicRank <= 3 ? "#DCFCE7" : kw.organicRank <= 10 ? "#FEF3C7" : "#FEE2E2") : "#FEE2E2";
              const statusColor = kw.status === "strong" ? "#166534" : kw.status === "good" ? "#0a9e96" : kw.status === "below-fold" ? "#92400e" : "#991b1b";
              const statusBg = kw.status === "strong" ? "#DCFCE7" : kw.status === "good" ? "rgba(13,60,252,0.12)" : kw.status === "below-fold" ? "#FEF3C7" : "#FEE2E2";
              return (
                <div key={i} className={s.kwRow}>
                  <div style={{ fontWeight: 600, color: "#1A1A2E", fontSize: 13 }}>{kw.keyword}</div>
                  <div className={s.kwBar}><div className={s.kwBarFill} style={{ width: `${volPct}%` }} /></div>
                  {/* P5 — only render the CPC pill when we have a real positive
                      number; a missing/zero CPC printed "$0.00", which looks broken. */}
                  {Number(kw.cpc) > 0 && (
                    <span className={s.kwPill} style={{ background: "#F9FAFB", color: "#6B7280" }}>${Number(kw.cpc).toFixed(2)}</span>
                  )}
                  <span className={s.kwPill} style={{ background: rankBg, color: rankColor }}>{kw.organicRank ? `#${kw.organicRank}` : "Not ranking"}</span>
                  <span className={s.kwPill} style={{ background: statusBg, color: statusColor }}>{kw.status || "unknown"}</span>
                </div>
              );
            })}
            {narrative.keyStrength && <div className={s.calloutGreen}>{"\u2713"} Your strength: {narrative.keyStrength}</div>}
          </div>
        )}

        {/* C6 — Revenue. P3 — honesty must match the interactive ReportView:
            gate on estimatedRevenueLoss.isReal, NOT just high > 0. When the loss
            is real, show the business-specific $low–$high/mo band; when it isn't
            (low/high are 0), positive-frame instead of an invented loss, so a
            forwarded report can never contradict the interactive one. We only
            render the positive-frame card when we actually have revenue data
            (revLoss present) — otherwise the section is omitted entirely. */}
        {revLossReal ? (
          <div className={s.revenueCard}>
            <div className={s.revenueLabel}>Estimated Monthly Revenue Being Left on the Table</div>
            <div className={s.revenueAmount}>${fmtNumber(revLow)} – ${fmtNumber(revHigh)}</div>
            {narrative.revenueCalculation && <div className={s.revenueExplain}>{narrative.revenueCalculation}</div>}
            {narrative.demandGapInsight && <div className={s.revenueExplain} style={{ marginTop: 8 }}>{narrative.demandGapInsight}</div>}
          </div>
        ) : revLoss ? (
          <div className={s.revenueCard} data-testid="audit-revenue-positive">
            <div className={s.revenueLabel}>Demand Capture</div>
            <div className={s.revenueAmount} style={{ fontSize: 28 }}>You're capturing demand well</div>
            <div className={s.revenueExplain}>
              We didn't find a measurable revenue gap from missed demand right now — that's a good sign. Keep defending your position so competitors don't close the gap.
            </div>
          </div>
        ) : null}

        {/* C7 — Quick Win */}
        {quickWin && (
          <div className={s.quickWinCard}>
            <div className={s.quickWinTitle}><Zap size={20} style={{ verticalAlign: "text-bottom", color: "#22C55E" }} /> Your Quick Win</div>
            <div className={s.quickWinSub}>Do this today — it's free</div>
            <div className={s.quickWinAction}>{quickWin.action}</div>
            {quickWin.timeRequired && <span className={s.quickWinTimeBadge}>{quickWin.timeRequired}</span>}
            {quickWin.expectedResult && <div className={s.quickWinResult}>{quickWin.expectedResult}</div>}
            <a className={s.ctaBtn} href="/contact">Book a Free Strategy Call &rarr;</a>
          </div>
        )}

        {/* C8 — Speed */}
        {(speedData?.mobile?.score != null || speedData?.desktop?.score != null) && (
          <div id="website" className={`${s.sectionCard} ${s.scrollAnchor}`}>
            <div className={s.sectionTitle}>
              <span className={s.gaugeLabelRow}>
                Website Speed
                <InfoTooltip theme="light" title="Speed score" text={JARGON.speedScore} />
              </span>
            </div>
            <div className={s.speedGrid}>
              {["mobile", "desktop"].map(device => {
                const d = speedData?.[device];
                if (!d?.score && d?.score !== 0) return null;
                const sc = Math.round(d.score);
                const clr = sc >= 90 ? "#22C55E" : sc >= 50 ? "#F59E0B" : "#EF4444";
                const TOOLTIPS: Record<string, string> = {
                  FCP: "First Contentful Paint: how long before visitors see something on screen. Affects bounce rate.",
                  LCP: "Largest Contentful Paint: how long for the main content to fully load. Key Google ranking factor.",
                  TBT: "Total Blocking Time: how long the page is unresponsive to clicks. Makes your site feel sluggish.",
                  CLS: "Cumulative Layout Shift: how much the page jumps around while loading. Frustrating for users.",
                };
                const metrics = [
                  { name: "FCP", value: fmtSec(d.fcp), raw: d.fcp },
                  { name: "LCP", value: fmtSec(d.lcp), raw: d.lcp },
                  { name: "TBT", value: fmtMs(d.tbt), raw: d.tbt },
                  { name: "CLS", value: d.cls != null ? String(d.cls) : "--", raw: d.cls },
                ];
                return (
                  <div key={device} className={s.speedCard}>
                    <div className={s.speedLabel}>{device === "mobile" ? "Mobile" : "Desktop"}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 12 }}>
                      <span className={s.speedScoreNum} style={{ color: clr }}>{sc}</span>
                      <span className={s.speedScoreDen}>/100</span>
                    </div>
                    {metrics.map(m => (
                      <div key={m.name} className={s.metricRow}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span className={s.metricName}>{m.name}</span>
                          <div className={s.metricTooltip}>
                            <span className={s.metricTooltipIcon}>?</span>
                            <div className={s.metricTooltipBubble}>{TOOLTIPS[m.name]}</div>
                          </div>
                        </div>
                        <span className={s.metricVal}>{m.value}</span>
                        <span className={`${s.statusChip} ${metricStatusClass(m.name, m.raw)}`}>{metricStatusLabel(m.name, m.raw)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Run-your-own-audit virality banner — turns a forwarded report into a
            lead magnet for the person who received it (conversion #9). */}
        <div className={s.viralBanner} data-testid="shared-run-own-audit">
          <div className={s.viralTitle}>Want a free audit like this for your business?</div>
          <div className={s.viralSub}>
            See your own Google Maps + website score, the exact fixes holding you back, and what they're worth — in about 60 seconds. No card, no catch.
          </div>
          <a className={s.viralBtn} href="/tools/free-audit">Run my free audit &rarr;</a>
        </div>

        {/* Back to audit CTA */}
        <div style={{ textAlign: "center", marginTop: 24, marginBottom: 40 }}>
          <a href="/tools/free-audit" style={{ display: "inline-block", padding: "14px 28px", background: mkt.accent, color: "#FFFFFF", borderRadius: 12, fontWeight: 800, fontSize: 15, textDecoration: "none" }}>Get your own free audit &rarr;</a>
        </div>
      </div>

      {/* Chat Widget */}
      <AuditChatWidget
        businessName={biz.name || ""}
        trade={ad?.trade || ""}
        city={ad?.city || ""}
        score={overall}
        grade={grade}
        actionPlan={actionPlan}
        estimatedRevenueLoss={revLoss}
        reportId={id}
        detectedIssueIds={ad?.detectedIssues}
      />
    </div>
  );
}
