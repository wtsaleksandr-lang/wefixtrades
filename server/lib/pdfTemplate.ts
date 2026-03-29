/**
 * Self-contained HTML template for PDF rendering.
 * No React, no external CSS, no JS — pure inline-styled HTML optimized for A4 PDF.
 */

export interface PdfReportData {
  businessName: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewsCount: number;
  trade: string;
  city: string;
  createdAt: string;
  overallScore: number;
  grade: string;
  executiveSummary: string;
  scores: {
    googleMaps: { score: number; max: number };
    websiteQuality: { score: number; max: number } | null;
    searchVisibility: { score: number; max: number };
    competitorPositioning: { score: number; max: number };
    adOpportunity: { score: number; max: number };
    demandCoverage: { score: number; max: number };
  };
  actionPlan: Array<{
    priority: string;
    title: string;
    detail: string;
    estimatedImpact?: string;
    estimatedCost?: string;
    timeToResult?: string;
  }>;
  competitors: Array<{
    name: string;
    rating: number;
    reviewsCount: number;
    hasWebsite: boolean;
    isRunningAds: boolean;
    score: number;
  }>;
  keywords: Array<{
    keyword: string;
    organicRank: number | null;
    isInLocalPack: boolean;
    monthlySearches: number;
    cpc: number;
  }>;
  revenueLoss: { low: number; high: number } | null;
  quickWin: { action: string; timeRequired?: string; expectedResult?: string } | null;
  speedData: {
    mobile: { score: number; fcp?: number; lcp?: number; tbt?: number; cls?: number } | null;
    desktop: { score: number; fcp?: number; lcp?: number; tbt?: number; cls?: number } | null;
  } | null;
  reportUrl: string;
}

const COLORS = {
  dark: "#1A1A2E",
  white: "#FFFFFF",
  grey: "#6B7280",
  lightGrey: "#F3F4F6",
  border: "#E5E7EB",
  cyan: "#00D4C8",
  green: "#22C55E",
  amber: "#F59E0B",
  red: "#EF4444",
};

function gradeColor(g: string): string {
  if (g === "A") return COLORS.green;
  if (g === "B") return COLORS.cyan;
  if (g === "C") return COLORS.amber;
  return COLORS.red;
}

function scoreColor(score: number, max: number): string {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 70) return COLORS.green;
  if (pct >= 45) return COLORS.amber;
  return COLORS.red;
}

function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtSec(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return "--";
  return Number(v) < 1 ? `${Math.round(Number(v) * 1000)}ms` : `${Number(v).toFixed(2)}s`;
}

function fmtMs(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return "--";
  return Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(2)}s` : `${Math.round(Number(v))}ms`;
}

function speedStatus(name: string, v: number | null | undefined): { label: string; color: string } {
  const n = Number(v);
  if (v == null || Number.isNaN(n)) return { label: "--", color: COLORS.grey };
  if (name === "FCP") return n <= 1.8 ? { label: "Good", color: COLORS.green } : n <= 3.0 ? { label: "Needs work", color: COLORS.amber } : { label: "Poor", color: COLORS.red };
  if (name === "LCP") return n <= 2.5 ? { label: "Good", color: COLORS.green } : n <= 4.0 ? { label: "Needs work", color: COLORS.amber } : { label: "Poor", color: COLORS.red };
  if (name === "TBT") return n <= 200 ? { label: "Good", color: COLORS.green } : n <= 600 ? { label: "Needs work", color: COLORS.amber } : { label: "Poor", color: COLORS.red };
  // CLS
  return n <= 0.1 ? { label: "Good", color: COLORS.green } : n <= 0.25 ? { label: "Needs work", color: COLORS.amber } : { label: "Poor", color: COLORS.red };
}

/** Builds a complete standalone HTML page for PDF rendering. */
export function buildPdfHtml(data: PdfReportData): string {
  const gc = gradeColor(data.grade);
  const circumference = 2 * Math.PI * 48;
  const arcLength = (Math.min(data.overallScore, 100) / 100) * circumference;
  const dashOffset = circumference - arcLength;
  const dateStr = data.createdAt ? new Date(data.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";

  const scoreCategories = [
    { key: "googleMaps" as const, label: "Google Maps Profile", max: 25 },
    { key: "websiteQuality" as const, label: "Website Quality", max: 20 },
    { key: "searchVisibility" as const, label: "Search Visibility", max: 20 },
    { key: "competitorPositioning" as const, label: "Competitor Position", max: 15 },
    { key: "adOpportunity" as const, label: "Ad Opportunity", max: 10 },
    { key: "demandCoverage" as const, label: "Demand Coverage", max: 10 },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  @page { size: A4; margin: 20mm 16mm 20mm 16mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: ${COLORS.dark};
    font-size: 11px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page-break { page-break-before: always; }
  .avoid-break { page-break-inside: avoid; }

  /* Header */
  .header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 24px; background: ${COLORS.dark}; border-radius: 10px;
    margin-bottom: 16px;
  }
  .header-brand { font-size: 18px; font-weight: 800; color: ${COLORS.white}; letter-spacing: -0.5px; }
  .header-brand span { color: ${COLORS.cyan}; }
  .header-date { font-size: 10px; color: rgba(255,255,255,0.5); }

  /* Hero */
  .hero {
    display: flex; gap: 20px; align-items: flex-start;
    padding: 20px; background: ${COLORS.white}; border: 1px solid ${COLORS.border};
    border-radius: 10px; margin-bottom: 12px;
  }
  .hero-info { flex: 1; }
  .hero-name { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
  .hero-meta { font-size: 10px; color: ${COLORS.grey}; margin-bottom: 6px; }
  .hero-rating { font-size: 11px; color: ${COLORS.amber}; margin-bottom: 4px; }
  .hero-summary { font-size: 11px; color: #4B5563; line-height: 1.6; margin-top: 10px; padding-top: 10px; border-top: 1px solid ${COLORS.border}; }
  .score-circle-wrap { text-align: center; flex-shrink: 0; width: 110px; }
  .grade-badge {
    display: inline-block; padding: 3px 12px; border-radius: 6px;
    font-size: 12px; font-weight: 700; margin-top: 6px;
  }

  /* Cards */
  .card {
    background: ${COLORS.white}; border: 1px solid ${COLORS.border};
    border-radius: 10px; padding: 16px 20px; margin-bottom: 12px;
  }
  .card-title { font-size: 14px; font-weight: 700; margin-bottom: 12px; }

  /* Score breakdown */
  .score-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .score-row-label { width: 140px; font-size: 11px; font-weight: 600; }
  .score-bar { flex: 1; height: 8px; background: ${COLORS.lightGrey}; border-radius: 4px; overflow: hidden; }
  .score-bar-fill { height: 100%; border-radius: 4px; }
  .score-row-val { width: 50px; text-align: right; font-size: 11px; font-weight: 700; }

  /* Action plan */
  .issue { margin-bottom: 12px; border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden; }
  .issue-header { padding: 10px 14px; display: flex; gap: 8px; align-items: center; }
  .issue-body { padding: 8px 14px 12px; }
  .priority-badge {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 9px; font-weight: 700; text-transform: uppercase;
  }
  .priority-high { background: #FEE2E2; color: #991B1B; }
  .priority-medium { background: #FEF3C7; color: #92400E; }
  .priority-low { background: #DCFCE7; color: #166534; }
  .impact-badge { font-size: 9px; color: ${COLORS.grey}; background: ${COLORS.lightGrey}; padding: 2px 8px; border-radius: 4px; }
  .issue-title { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
  .issue-detail { font-size: 10px; color: #4B5563; line-height: 1.5; }
  .issue-meta { display: flex; gap: 6px; margin-top: 6px; }
  .issue-meta-tag { font-size: 9px; background: ${COLORS.lightGrey}; color: ${COLORS.grey}; padding: 2px 8px; border-radius: 4px; }

  /* Competitor table */
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { text-align: left; padding: 6px 8px; border-bottom: 2px solid ${COLORS.border}; font-weight: 700; color: ${COLORS.grey}; font-size: 9px; text-transform: uppercase; }
  td { padding: 6px 8px; border-bottom: 1px solid ${COLORS.lightGrey}; }
  .row-user { background: rgba(0,212,200,0.06); font-weight: 600; }

  /* Keywords */
  .kw-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid ${COLORS.lightGrey}; }
  .kw-name { width: 200px; font-weight: 600; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kw-vol { width: 60px; font-size: 10px; color: ${COLORS.grey}; text-align: right; }
  .kw-cpc { width: 50px; font-size: 10px; color: ${COLORS.grey}; text-align: right; }
  .kw-rank-pill { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 9px; font-weight: 600; }

  /* Revenue */
  .revenue-card {
    background: ${COLORS.dark}; border-radius: 10px; padding: 20px;
    text-align: center; margin-bottom: 12px; color: ${COLORS.white};
  }
  .revenue-amount { font-size: 28px; font-weight: 800; color: ${COLORS.red}; margin: 6px 0; }
  .revenue-label { font-size: 11px; color: rgba(255,255,255,0.6); }

  /* Speed */
  .speed-grid { display: flex; gap: 12px; }
  .speed-card { flex: 1; background: ${COLORS.lightGrey}; border-radius: 8px; padding: 14px; }
  .speed-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${COLORS.grey}; margin-bottom: 4px; }
  .speed-score { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
  .metric-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 10px; }
  .metric-status { font-size: 9px; font-weight: 600; }

  /* Quick win */
  .quick-win {
    background: #F0FFF4; border: 1px solid #BBF7D0; border-radius: 10px;
    padding: 16px 20px; margin-bottom: 12px;
  }
  .quick-win-title { font-size: 13px; font-weight: 700; color: #166534; margin-bottom: 6px; }
  .quick-win-action { font-size: 11px; color: #4B5563; line-height: 1.5; }

  /* Footer */
  .footer {
    text-align: center; padding: 16px 0; margin-top: 8px;
    border-top: 1px solid ${COLORS.border};
    font-size: 9px; color: ${COLORS.grey};
  }
  .footer a { color: ${COLORS.cyan}; text-decoration: none; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div>
    <div class="header-brand">We<span>Fix</span>Trades</div>
    <div class="header-date">Local Business Audit Report${dateStr ? ` · ${esc(dateStr)}` : ""}</div>
  </div>
</div>

<!-- Hero -->
<div class="hero avoid-break">
  <div class="hero-info">
    <div class="hero-name">${esc(data.businessName)}</div>
    <div class="hero-meta">
      ${data.address ? esc(data.address) : ""}
      ${data.phone ? ` · ${esc(data.phone)}` : ""}
      ${data.website ? ` · ${esc(data.website.replace(/^https?:\/\//, ""))}` : ""}
    </div>
    ${data.rating != null ? `<div class="hero-rating">${"★".repeat(Math.floor(data.rating))}${"☆".repeat(5 - Math.floor(data.rating))} ${esc(data.rating)} (${esc(data.reviewsCount)} reviews)</div>` : ""}
    ${data.executiveSummary ? `<div class="hero-summary">${esc(data.executiveSummary)}</div>` : ""}
  </div>
  <div class="score-circle-wrap">
    <svg width="108" height="108" viewBox="0 0 108 108">
      <circle cx="54" cy="54" r="48" fill="none" stroke="${COLORS.lightGrey}" stroke-width="8"/>
      <circle cx="54" cy="54" r="48" fill="none" stroke="${gc}" stroke-width="8"
        stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
        transform="rotate(-90 54 54)"/>
      <text x="54" y="52" text-anchor="middle" font-size="28" font-weight="800" fill="${COLORS.dark}">${esc(data.overallScore)}</text>
      <text x="54" y="68" text-anchor="middle" font-size="10" fill="${COLORS.grey}">/100</text>
    </svg>
    <div><span class="grade-badge" style="background:${gc}20;color:${gc};">Grade ${esc(data.grade)}</span></div>
  </div>
</div>

<!-- Score Breakdown -->
<div class="card avoid-break">
  <div class="card-title">Score Breakdown</div>
  ${scoreCategories.map(cat => {
    const sc = data.scores[cat.key];
    if (!sc) return "";
    const pct = sc.max > 0 ? (sc.score / sc.max) * 100 : 0;
    const clr = scoreColor(sc.score, sc.max);
    return `<div class="score-row">
      <div class="score-row-label">${esc(cat.label)}</div>
      <div class="score-bar"><div class="score-bar-fill" style="width:${pct}%;background:${clr};"></div></div>
      <div class="score-row-val" style="color:${clr}">${esc(sc.score)} / ${esc(sc.max)}</div>
    </div>`;
  }).join("\n")}
</div>

<!-- Action Plan -->
${data.actionPlan.length > 0 ? `
<div class="card">
  <div class="card-title">What's Holding You Back</div>
  ${data.actionPlan.map(item => {
    const prio = (item.priority || "medium").toLowerCase();
    const prioCls = prio === "high" ? "priority-high" : prio === "low" ? "priority-low" : "priority-medium";
    return `<div class="issue avoid-break">
      <div class="issue-header">
        <span class="priority-badge ${prioCls}">${esc(prio)}</span>
        ${item.estimatedImpact ? `<span class="impact-badge">${esc(item.estimatedImpact)}</span>` : ""}
      </div>
      <div class="issue-body">
        <div class="issue-title">${esc(item.title)}</div>
        <div class="issue-detail">${esc(item.detail)}</div>
        <div class="issue-meta">
          ${item.estimatedCost ? `<span class="issue-meta-tag">${esc(item.estimatedCost)}</span>` : ""}
          ${item.timeToResult ? `<span class="issue-meta-tag">${esc(item.timeToResult)}</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("\n")}
</div>
` : ""}

<!-- Competitors -->
${data.competitors.length > 0 ? `
<div class="card avoid-break">
  <div class="card-title">How You Compare Locally</div>
  <table>
    <thead><tr><th>#</th><th>Business</th><th>Rating</th><th>Reviews</th><th>Website</th><th>Ads</th><th>Score</th></tr></thead>
    <tbody>
      <tr class="row-user">
        <td>★</td>
        <td><strong>${esc(data.businessName)}</strong></td>
        <td>${data.rating ?? "--"}</td>
        <td>${esc(data.reviewsCount)}</td>
        <td>${data.website ? "✓" : "✗"}</td>
        <td>—</td>
        <td style="font-weight:700;color:${gc}">${esc(data.overallScore)}</td>
      </tr>
      ${data.competitors.slice(0, 5).map((c, i) => {
        const cColor = c.score >= 70 ? COLORS.green : c.score >= 45 ? COLORS.amber : COLORS.red;
        return `<tr>
          <td>${i + 1}</td>
          <td>${esc(c.name)}</td>
          <td>${c.rating || "--"}</td>
          <td>${esc(c.reviewsCount)}</td>
          <td>${c.hasWebsite ? "✓" : "✗"}</td>
          <td>${c.isRunningAds ? "✓" : "✗"}</td>
          <td style="color:${cColor};font-weight:600">${esc(c.score)}</td>
        </tr>`;
      }).join("\n")}
    </tbody>
  </table>
</div>
` : ""}

<!-- Keywords -->
${data.keywords.length > 0 ? `
<div class="card">
  <div class="card-title">What Customers Search For</div>
  ${data.keywords.slice(0, 10).map(kw => {
    const rankColor = kw.organicRank ? (kw.organicRank <= 3 ? COLORS.green : kw.organicRank <= 10 ? COLORS.amber : COLORS.red) : COLORS.red;
    const rankBg = kw.organicRank ? (kw.organicRank <= 3 ? "#DCFCE7" : kw.organicRank <= 10 ? "#FEF3C7" : "#FEE2E2") : "#FEE2E2";
    const rankText = kw.organicRank ? `#${kw.organicRank}` : "Not ranking";
    return `<div class="kw-row avoid-break">
      <div class="kw-name">${esc(kw.keyword)}</div>
      <div class="kw-vol">${fmtNumber(kw.monthlySearches)}/mo</div>
      <div class="kw-cpc">$${kw.cpc?.toFixed(2) ?? "0.00"}</div>
      <span class="kw-rank-pill" style="background:${rankBg};color:${rankColor}">${esc(rankText)}</span>
      ${kw.isInLocalPack ? `<span class="kw-rank-pill" style="background:#DCFCE7;color:#166534">Map Pack</span>` : ""}
    </div>`;
  }).join("\n")}
</div>
` : ""}

<!-- Revenue Loss -->
${data.revenueLoss && data.revenueLoss.high > 0 ? `
<div class="revenue-card avoid-break">
  <div class="revenue-label">Estimated Monthly Revenue Left on the Table</div>
  <div class="revenue-amount">$${fmtNumber(data.revenueLoss.low)} – $${fmtNumber(data.revenueLoss.high)}</div>
</div>
` : ""}

<!-- Quick Win -->
${data.quickWin ? `
<div class="quick-win avoid-break">
  <div class="quick-win-title">⚡ Your Quick Win${data.quickWin.timeRequired ? ` (${esc(data.quickWin.timeRequired)})` : ""}</div>
  <div class="quick-win-action">${esc(data.quickWin.action)}</div>
  ${data.quickWin.expectedResult ? `<div style="font-size:10px;color:#166534;margin-top:6px;">${esc(data.quickWin.expectedResult)}</div>` : ""}
</div>
` : ""}

<!-- Website Speed -->
${data.speedData && (data.speedData.mobile || data.speedData.desktop) ? `
<div class="card avoid-break">
  <div class="card-title">Website Speed</div>
  <div class="speed-grid">
    ${(["mobile", "desktop"] as const).map(device => {
      const d = data.speedData?.[device];
      if (!d) return "";
      const sc = Math.round(d.score);
      const clr = sc >= 90 ? COLORS.green : sc >= 50 ? COLORS.amber : COLORS.red;
      const metrics = [
        { name: "FCP", value: fmtSec(d.fcp), raw: d.fcp },
        { name: "LCP", value: fmtSec(d.lcp), raw: d.lcp },
        { name: "TBT", value: fmtMs(d.tbt), raw: d.tbt },
        { name: "CLS", value: d.cls != null ? String(d.cls) : "--", raw: d.cls },
      ];
      return `<div class="speed-card">
        <div class="speed-label">${device === "mobile" ? "Mobile" : "Desktop"}</div>
        <div class="speed-score" style="color:${clr}">${sc}<span style="font-size:12px;color:${COLORS.grey}">/100</span></div>
        ${metrics.map(m => {
          const st = speedStatus(m.name, m.raw);
          return `<div class="metric-row">
            <span>${m.name}</span>
            <span>${m.value}</span>
            <span class="metric-status" style="color:${st.color}">${st.label}</span>
          </div>`;
        }).join("\n")}
      </div>`;
    }).join("\n")}
  </div>
</div>
` : ""}

<!-- Footer -->
<div class="footer">
  Generated by <strong>WeFixTrades</strong> · <a href="${esc(data.reportUrl)}">${esc(data.reportUrl)}</a>
  <br/>Free local business audit — helping trades businesses get found online.
</div>

</body>
</html>`;
}
