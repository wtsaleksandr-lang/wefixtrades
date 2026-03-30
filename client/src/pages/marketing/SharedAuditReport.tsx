import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import s from "./FreeAuditReport.module.css";
import AuditChatWidget from "@/components/AuditChatWidget";
import {
  MapPin, Globe, Search, Trophy, Megaphone, Clock,
  Check, X as XIcon, Zap, ExternalLink,
} from "lucide-react";

/* ─── Helpers ─── */
function scoreColor(score: number, max: number): string {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 70) return "#22C55E";
  if (pct >= 45) return "#F59E0B";
  return "#EF4444";
}

function gradeColor(grade: string): string {
  if (grade === "A") return "#22C55E";
  if (grade === "B") return "#00D4C8";
  if (grade === "C") return "#F59E0B";
  return "#EF4444";
}

function gradeBg(grade: string): string {
  if (grade === "A") return "#DCFCE7";
  if (grade === "B") return "rgba(0,212,200,0.15)";
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

export default function SharedAuditReport() {
  const [, params] = useRoute("/audit/report/:id");
  const id = params?.id || "";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/audit/report/${id}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) throw new Error(d.error || "Not found");
        setData(d.report);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", fontFamily: "Inter, system-ui", color: "#6B7280" }}>Loading report...</div>;
  if (error || !data) return (
    <div style={{ padding: 40, textAlign: "center", fontFamily: "Inter, system-ui" }}>
      <h2 style={{ color: "#EF4444" }}>Report not found</h2>
      <p style={{ color: "#6B7280", marginTop: 8 }}>{error || "This report may have been removed."}</p>
      <a href="/free-audit" style={{ display: "inline-block", marginTop: 16, padding: "12px 24px", background: "#00D4C8", color: "#1A1A2E", borderRadius: 10, fontWeight: 700, textDecoration: "none" }}>Get your own free audit &rarr;</a>
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
  const overall = scores?.overall ?? 0;
  const grade = scores?.grade || "D";
  const maxVol = Math.max(...keywords.map((k: any) => k.monthlySearches || 0), 1);

  const SCORE_CATEGORIES = [
    { key: "googleMaps", label: "Google Maps", desc: "How complete and trusted your Google profile is", icon: <MapPin size={18} /> },
    { key: "websiteQuality", label: "Website", desc: "How fast and professional your website is", icon: <Globe size={18} /> },
    { key: "searchVisibility", label: "Search Visibility", desc: "How easily customers find you on Google", icon: <Search size={18} /> },
    { key: "competitorPosition", label: "Competitor Position", desc: "How you compare to local competitors", icon: <Trophy size={18} /> },
    { key: "adOpportunity", label: "Ad Opportunity", desc: "The paid search market available in your area", icon: <Megaphone size={18} /> },
    { key: "demandCoverage", label: "Demand Coverage", desc: "Whether you're visible when customers search", icon: <Clock size={18} /> },
  ];

  const circumference = 2 * Math.PI * 48;
  const arcLength = (overall / 100) * circumference;

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Sticky header — read-only shared view */}
      <div className={s.stickyHeader}>
        <div className={s.stickyLogo}>We<span>Fix</span>Trades</div>
        <div style={{ flex: 1 }} />
        <span className={s.sharedBadge}>Shared Report</span>
        <a href="/free-audit" style={{ marginLeft: 8, padding: "6px 14px", borderRadius: 8, background: "#00D4C8", color: "#1A1A2E", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Get your own free audit &rarr;</a>
      </div>

      <div className={s.reportPage}>
        {/* C1 — Hero */}
        <div className={s.heroCard}>
          <div className={s.heroTop}>
            <div className={s.heroLeft}>
              {biz.businessPhotoUrl ? (
                <img className={s.heroPhoto} src={biz.businessPhotoUrl} alt="" loading="lazy" />
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
          {narrative.executiveSummary && <div className={s.heroSummary}>{narrative.executiveSummary}</div>}
          <div className={s.heroFooter}>
            Generated on {data.createdAt ? new Date(data.createdAt).toLocaleDateString() : "N/A"} · Powered by WeFixTrades AI · Viewed {data.viewCount || 1} times
          </div>
        </div>

        {/* C2 — Score Breakdown */}
        <div className={s.sectionCard}>
          <div className={s.sectionTitle}>Your Score Breakdown</div>
          {SCORE_CATEGORIES.map(cat => {
            const sc = scores[cat.key] || { score: 0, max: 1 };
            const pct = sc.max > 0 ? (sc.score / sc.max) * 100 : 0;
            const color = scoreColor(sc.score, sc.max);
            return (
              <div key={cat.key} className={s.scoreRow}>
                <div className={s.scoreRowIcon} style={{ color }}>{cat.icon}</div>
                <div className={s.scoreRowBody}>
                  <div className={s.scoreRowName}>{cat.label}</div>
                  <div className={s.scoreRowDesc}>{cat.desc}</div>
                  <div className={s.scoreBar}><div className={s.scoreBarFill} style={{ width: `${pct}%`, background: color }} /></div>
                </div>
                <div className={s.scoreRowValue} style={{ color }}>{sc.score} / {sc.max}</div>
              </div>
            );
          })}
        </div>

        {/* C3 — Action Plan */}
        {actionPlan.length > 0 && (
          <div className={s.sectionCard}>
            <div className={s.sectionTitle}>What's Holding You Back</div>
            {actionPlan.map((item: any, i: number) => {
              const prio = (item.priority || "medium").toLowerCase();
              const prioCls = prio === "high" ? s.priorityHigh : prio === "low" ? s.priorityLow : s.priorityMedium;
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
                      <div className={s.issueSectionText}>{item.detail}</div>
                    </div>
                    <div className={s.issueSection}>
                      <div className={`${s.issueSectionLabel} ${s.cost}`}>WHAT IT'S COSTING YOU</div>
                      <div className={s.issueSectionText}>
                        {prio === "high"
                          ? `Every month this isn't fixed, you're potentially missing ${item.estimatedImpact || "significant leads"}.`
                          : `Addressing this could bring in ${item.estimatedImpact || "additional business"}.`}
                      </div>
                    </div>
                    <div className={s.issueSection}>
                      <div className={`${s.issueSectionLabel} ${s.fix}`}>HOW TO FIX IT</div>
                      <div className={s.badgeRow}>
                        {item.estimatedCost && <span className={s.smallBadge}>{item.estimatedCost}</span>}
                        {item.timeToResult && <span className={s.smallBadge}>{item.timeToResult}</span>}
                      </div>
                      <div className={s.issueSectionText}>{item.detail}</div>
                    </div>
                  </div>
                  {item.wefixtrades_can_help && (
                    <div className={s.wftBanner}>
                      <span className={s.wftBannerText}>WeFixTrades can handle this for you</span>
                      <a className={s.wftBannerLink} href="/plans">See how &rarr;</a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* C4 — Competitors */}
        {competitors.length > 0 && (
          <div className={s.sectionCard}>
            <div className={s.sectionTitle}>How You Compare Locally</div>
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
                            {c.photoUrl ? <img className={s.compPhoto} src={c.photoUrl} alt="" loading="lazy" /> : <div className={s.compPhotoPlaceholder}>{(c.name || "?")[0]}</div>}
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
            {narrative.competitorWeakness && <div className={s.calloutAmber}>Opportunity: {narrative.competitorWeakness}</div>}
          </div>
        )}

        {/* C5 — Keywords */}
        {keywords.some((k: any) => k.monthlySearches > 0) && (
          <div className={s.sectionCard}>
            <div className={s.sectionTitle}>What Customers Search For</div>
            {keywords.map((kw: any, i: number) => {
              const volPct = maxVol > 0 ? ((kw.monthlySearches || 0) / maxVol) * 100 : 0;
              const rankColor = kw.organicRank ? (kw.organicRank <= 3 ? "#22C55E" : kw.organicRank <= 10 ? "#F59E0B" : "#EF4444") : "#EF4444";
              const rankBg = kw.organicRank ? (kw.organicRank <= 3 ? "#DCFCE7" : kw.organicRank <= 10 ? "#FEF3C7" : "#FEE2E2") : "#FEE2E2";
              const statusColor = kw.status === "strong" ? "#166534" : kw.status === "good" ? "#0a9e96" : kw.status === "below-fold" ? "#92400e" : "#991b1b";
              const statusBg = kw.status === "strong" ? "#DCFCE7" : kw.status === "good" ? "rgba(0,212,200,0.12)" : kw.status === "below-fold" ? "#FEF3C7" : "#FEE2E2";
              return (
                <div key={i} className={s.kwRow}>
                  <div style={{ fontWeight: 600, color: "#1A1A2E", fontSize: 13 }}>{kw.keyword}</div>
                  <div className={s.kwBar}><div className={s.kwBarFill} style={{ width: `${volPct}%` }} /></div>
                  <span className={s.kwPill} style={{ background: "#F9FAFB", color: "#6B7280" }}>${kw.cpc?.toFixed(2) ?? "0.00"}</span>
                  <span className={s.kwPill} style={{ background: rankBg, color: rankColor }}>{kw.organicRank ? `#${kw.organicRank}` : "Not ranking"}</span>
                  <span className={s.kwPill} style={{ background: statusBg, color: statusColor }}>{kw.status || "unknown"}</span>
                </div>
              );
            })}
            {narrative.keyStrength && <div className={s.calloutGreen}>{"\u2713"} Your strength: {narrative.keyStrength}</div>}
          </div>
        )}

        {/* C6 — Revenue */}
        {revLoss && revLoss.high > 0 && (
          <div className={s.revenueCard}>
            <div className={s.revenueLabel}>Estimated Monthly Revenue Being Left on the Table</div>
            <div className={s.revenueAmount}>${fmtNumber(revLoss.low)} – ${fmtNumber(revLoss.high)}</div>
            {narrative.revenueCalculation && <div className={s.revenueExplain}>{narrative.revenueCalculation}</div>}
            {narrative.demandGapInsight && <div className={s.revenueExplain} style={{ marginTop: 8 }}>{narrative.demandGapInsight}</div>}
          </div>
        )}

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
          <div className={s.sectionCard}>
            <div className={s.sectionTitle}>Website Speed</div>
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

        {/* Back to audit CTA */}
        <div style={{ textAlign: "center", marginTop: 24, marginBottom: 40 }}>
          <a href="/free-audit" style={{ display: "inline-block", padding: "14px 28px", background: "#00D4C8", color: "#1A1A2E", borderRadius: 12, fontWeight: 800, fontSize: 15, textDecoration: "none" }}>Get your own free audit &rarr;</a>
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
