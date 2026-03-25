import { useEffect, useMemo, useRef, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { colors } from "@/theme/tokens";
import { Search, CheckCircle2 } from "lucide-react";
import reportStyles from "./FreeAuditReport.module.css";

type Prediction = {
  place_id: string;
  name: string;
  formatted_address: string;
  rating: number | null;
  user_ratings_total: number;
  photoUrl: string | null;
};
type Business = {
  placeId: string;
  name: string;
  formattedAddress: string;
  addressComponents: Array<{ long_name: string; short_name: string; types: string[] }>;
  types: string[];
  rating: number | null;
  reviewsCount: number;
  website: string;
  phone: string;
  hours: string[];
  photos: string[];
};
type SpeedData = {
  mobile: { score: number | null; fcp?: number | null; lcp?: number | null; tbt?: number | null; cls?: number | null };
  desktop: { score: number | null; fcp?: number | null; lcp?: number | null; tbt?: number | null; cls?: number | null };
};
type Issue = {
  title: string;
  severity: "High" | "Medium";
  impact: string;
  fix: string;
};
type ReportJson = {
  business: {
    name: string;
    address: string;
    rating: number | null;
    reviewsCount: number;
    website: string;
    phone: string;
  };
  scores: {
    localVisibility: number;
    websiteSpeedMobile: number | null;
    websiteSpeedDesktop: number | null;
  };
  issues: Issue[];
  quickWins: string[];
  actionPlan: { next7Days: string[]; next30Days: string[] };
  recommendedServices: { name: string; why: string; cta: string }[];
};

async function postJSON<T>(url: string, body: any): Promise<T> {
  console.log(`[Audit] POST ${url}`, body);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok === false) {
    console.error(`[Audit] ${url} failed:`, r.status, data);
    throw new Error(data?.error || `Request failed: ${r.status}`);
  }
  return data as T;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

type ImpactLevel = "high" | "medium" | "low";
type MetricStatus = "good" | "needs" | "critical";

function impactToLevel(impact: any): ImpactLevel {
  const s = String(impact ?? "").toLowerCase();
  if (s.includes("high") || s.includes("critical")) return "high";
  if (s.includes("med") || s.includes("warn")) return "medium";
  if (s.includes("low") || s.includes("minor")) return "low";
  return "medium";
}

function fmtMs(v: any): string {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v ?? "--");
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
}

function fmtSec(v: any): string {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v ?? "--");
  if (n < 1) return `${Math.round(n * 1000)}ms`;
  return `${n.toFixed(2)}s`;
}

function metricStatus(name: "FCP" | "LCP" | "TBT" | "CLS", raw: any): MetricStatus {
  const v = Number(raw);
  if (Number.isNaN(v)) return "needs";
  if (name === "FCP") return v <= 1.8 ? "good" : v <= 3.0 ? "needs" : "critical";
  if (name === "LCP") return v <= 2.5 ? "good" : v <= 4.0 ? "needs" : "critical";
  if (name === "TBT") return v <= 200 ? "good" : v <= 600 ? "needs" : "critical";
  return v <= 0.1 ? "good" : v <= 0.25 ? "needs" : "critical";
}

function statusLabel(s: MetricStatus): string {
  return s === "good" ? "Good" : s === "needs" ? "Needs work" : "Critical";
}

function StatusChip({ status }: { status: MetricStatus }) {
  const cls =
    status === "good"
      ? `${reportStyles.statusChip} ${reportStyles.good}`
      : status === "needs"
      ? `${reportStyles.statusChip} ${reportStyles.needs}`
      : `${reportStyles.statusChip} ${reportStyles.critical}`;
  return <span className={cls}>{statusLabel(status)}</span>;
}

function RIcon({ kind }: { kind: "star" | "pin" | "phone" | "globe" | "clock" | "info" | "mobile" | "desktop" | "issue" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" as const };
  if (kind === "star")
    return (<svg {...common}><path d="M12 17.3l-5.4 3 1-6.1-4.4-4.3 6.1-.9L12 3.5l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-3z" stroke="currentColor" strokeWidth="1.6" /></svg>);
  if (kind === "pin")
    return (<svg {...common}><path d="M12 21s7-4.4 7-11a7 7 0 10-14 0c0 6.6 7 11 7 11z" stroke="currentColor" strokeWidth="1.6" /><path d="M12 10.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z" stroke="currentColor" strokeWidth="1.6" /></svg>);
  if (kind === "phone")
    return (<svg {...common}><path d="M7 3h3l2 5-2 1c1 3 3 5 6 6l1-2 5 2v3c0 1-1 2-2 2C10 20 4 14 4 6c0-1 1-3 3-3z" stroke="currentColor" strokeWidth="1.6" /></svg>);
  if (kind === "globe")
    return (<svg {...common}><path d="M12 22a10 10 0 100-20 10 10 0 000 20z" stroke="currentColor" strokeWidth="1.6" /><path d="M2 12h20" stroke="currentColor" strokeWidth="1.6" /><path d="M12 2c3 3 3 17 0 20" stroke="currentColor" strokeWidth="1.6" /></svg>);
  if (kind === "clock")
    return (<svg {...common}><path d="M12 22a10 10 0 100-20 10 10 0 000 20z" stroke="currentColor" strokeWidth="1.6" /><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
  if (kind === "info")
    return (<svg {...common}><path d="M12 22a10 10 0 100-20 10 10 0 000 20z" stroke="currentColor" strokeWidth="1.6" /><path d="M12 10v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M12 7.2h.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>);
  if (kind === "mobile")
    return (<svg {...common}><path d="M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.6" /><path d="M11 19h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
  if (kind === "desktop")
    return (<svg {...common}><path d="M4 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" stroke="currentColor" strokeWidth="1.6" /><path d="M9 21h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M12 17v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
  return (<svg {...common}><path d="M6 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M12 6v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>);
}

// ─── Design tokens ───────────────────
const DARK = '#0d1514';
const CYAN = '#00D4C8';
const GREEN = '#22C55E';
const GREEN_BG = '#DCFCE7';
const AMBER = '#F59E0B';
const AMBER_BG = '#FEF3C7';
const RED = '#EF4444';
const RED_BG = '#FEE2E2';
const GREY = '#6B7280';
const GREY_BG = '#F9FAFB';
const BORDER = '#E5E7EB';
const WHITE = '#FFFFFF';

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.7) return GREEN;
  if (pct >= 0.45) return AMBER;
  return RED;
}
function gradeColor(grade: string): string {
  if (grade === 'A') return GREEN;
  if (grade === 'B') return CYAN;
  if (grade === 'C') return AMBER;
  return RED;
}
function statusColor(status: string): string {
  if (status === 'strong' || status === 'good') return GREEN;
  if (status === 'below-fold') return AMBER;
  return RED;
}

function ScoreCircle({ score, grade }: { score: number; grade: string }) {
  const r = 45;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = gradeColor(grade);
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8"/>
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round" transform="rotate(-90 60 60)"/>
        <text x="60" y="55" textAnchor="middle" fill={WHITE} fontSize="22" fontWeight="700">{score}</text>
        <text x="60" y="70" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11">/100</text>
      </svg>
      <div style={{
        display: 'inline-block', padding: '3px 14px', borderRadius: 20,
        background: color + '22', border: `1px solid ${color}`,
        color, fontSize: 13, fontWeight: 700, marginTop: 6
      }}>
        Grade {grade}
      </div>
    </div>
  );
}

function ReportView({ report, business, reportId }: {
  report: any;
  business: any;
  reportId?: string | null;
}) {
  const [copiedLink, setCopiedLink] = useState(false);

  const ai = report?.narrative || {};
  const scores = report?.scores || {};
  const keywords = report?.keywords || [];
  const loss = report?.estimatedRevenueLoss || {};
  const speed = report?.speedData || {};
  const gaps = report?.contentGaps || ai?.contentGaps || [];
  const plan = ai?.actionPlan || [];
  const shareUrl = reportId
    ? `${window.location.origin}/audit/report/${reportId}`
    : window.location.href;

  const scoreRows = [
    { icon: '📍', label: 'Google Maps Profile', score: scores.googleMaps?.score || 0, max: 25, note: 'How complete and trusted your Google profile is' },
    { icon: '🌐', label: 'Website Quality', score: scores.websiteQuality?.score || 0, max: 20, note: speed.mobile?.score == null ? 'Speed test unavailable' : 'How fast and professional your website is' },
    { icon: '🔍', label: 'Search Visibility', score: scores.searchVisibility?.score || 0, max: 20, note: 'How easily customers find you on Google' },
    { icon: '🏆', label: 'Competitor Position', score: scores.competitorPositioning?.score || 0, max: 15, note: 'How you compare to local competitors' },
    { icon: '📢', label: 'Ad Opportunity', score: scores.adOpportunity?.score || 0, max: 10, note: 'The paid search market in your area' },
    { icon: '⏰', label: 'Demand Coverage', score: scores.demandCoverage?.score || 0, max: 10, note: "Whether you're visible when customers search most" },
  ];

  const card = (extra?: any) => ({
    background: WHITE, borderRadius: 16, border: `1px solid ${BORDER}`,
    padding: 24, marginBottom: 16, ...extra
  });

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 780, margin: '0 auto', padding: '0 16px 48px' }}>

      {/* SECTION 1 — COVER */}
      <div style={{ background: DARK, borderRadius: 16, padding: 28, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            {business?.businessPhotoUrl ? (
              <img src={business.businessPhotoUrl} alt={business.name} style={{
                width: 72, height: 72, borderRadius: '50%', objectFit: 'cover',
                border: `3px solid ${CYAN}`, marginBottom: 12, display: 'block'
              }} />
            ) : (
              <div style={{
                width: 72, height: 72, borderRadius: '50%', background: CYAN,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 700, color: DARK, marginBottom: 12
              }}>
                {(business?.name || 'B').charAt(0)}
              </div>
            )}
            <div style={{ fontSize: 22, fontWeight: 700, color: WHITE, marginBottom: 8, lineHeight: 1.3 }}>
              {business?.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ color: AMBER, fontSize: 14 }}>{'★'.repeat(Math.round(business?.rating || 0))}</span>
              <span style={{ color: WHITE, fontWeight: 600, fontSize: 14 }}>{business?.rating}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>({business?.reviewsCount?.toLocaleString()} reviews)</span>
            </div>
            {[business?.address, business?.phone].filter(Boolean).map((v, i) => (
              <div key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>{v}</div>
            ))}
            {business?.website && (
              <a href={business.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: CYAN, display: 'block', marginTop: 3, textDecoration: 'none' }}>
                {business.website.replace(/^https?:\/\//, '').split('/')[0]}
              </a>
            )}
          </div>
          <ScoreCircle score={scores.total || 0} grade={scores.grade || 'D'} />
        </div>
        {ai.executiveSummary && (
          <>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '20px 0' }}/>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 1.65, margin: 0 }}>{ai.executiveSummary}</p>
          </>
        )}
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 12 }}>
          Generated {new Date().toLocaleDateString()} · Powered by WeFixTrades AI
        </div>
      </div>

      {/* SECTION 2 — SCORE BREAKDOWN */}
      <div style={card()}>
        <div style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 20 }}>Your Score Breakdown</div>
        {scoreRows.map((row, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{row.icon}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: DARK }}>{row.label}</span>
              <div style={{ flex: 2, height: 8, borderRadius: 4, background: GREY_BG, overflow: 'hidden' }}>
                <div style={{ width: `${(row.score / row.max) * 100}%`, height: '100%', background: scoreColor(row.score, row.max), borderRadius: 4 }}/>
              </div>
              <span style={{ width: 60, textAlign: 'right', fontSize: 13, fontWeight: 700, color: scoreColor(row.score, row.max) }}>
                {row.score}/{row.max}
              </span>
            </div>
            <div style={{ fontSize: 11, color: GREY, marginTop: 3, marginLeft: 28 }}>{row.note}</div>
          </div>
        ))}
      </div>

      {/* SECTION 3 — ACTION PLAN */}
      {plan.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ background: DARK, borderRadius: '16px 16px 0 0', padding: '18px 24px', fontSize: 17, fontWeight: 700, color: WHITE }}>
            What's Holding You Back
          </div>
          {plan.map((item: any, i: number) => (
            <div key={i} style={{
              background: WHITE, border: `1px solid ${BORDER}`, borderTop: 'none',
              borderRadius: i === plan.length - 1 ? '0 0 16px 16px' : 0, padding: 24
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                <span style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                  background: item.priority === 'HIGH' ? RED_BG : item.priority === 'MEDIUM' ? AMBER_BG : GREEN_BG,
                  color: item.priority === 'HIGH' ? RED : item.priority === 'MEDIUM' ? AMBER : GREEN
                }}>
                  {item.priority} PRIORITY
                </span>
                <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#E0FAF9', color: '#00897B' }}>
                  {item.estimatedImpact}
                </span>
              </div>
              <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>❌ The Problem</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: GREY, lineHeight: 1.55 }}>{item.detail}</div>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>💸 What It's Costing You</div>
                <div style={{ fontSize: 13, color: DARK }}>
                  Every month this isn't fixed, you're missing an estimated <strong>{item.estimatedImpact}</strong> in potential jobs.
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>✅ How To Fix It</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[item.estimatedCost, item.timeToResult].filter(Boolean).map((v: string, j: number) => (
                    <span key={j} style={{ padding: '3px 10px', borderRadius: 12, background: GREY_BG, color: GREY, fontSize: 12 }}>{v}</span>
                  ))}
                </div>
              </div>
              {item.wefixtrades_can_help && (
                <div style={{ marginTop: 16, background: '#E0FAF9', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#00897B', fontWeight: 600 }}>🔧 WeFixTrades can handle this for you</span>
                  <a href="/plans" style={{ fontSize: 13, color: CYAN, fontWeight: 600, textDecoration: 'none' }}>See how →</a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SECTION 4 — KEYWORDS */}
      {keywords.some((k: any) => k.monthlySearches > 0) && (
        <div style={card()}>
          <div style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 4 }}>What Customers Search For</div>
          <div style={{ fontSize: 12, color: GREY, marginBottom: 16 }}>Keywords relevant to your business in {report?.city}</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: GREY_BG }}>
                  {['Keyword', 'Searches/mo', 'CPC', 'Your Rank', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: GREY, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keywords.map((kw: any, i: number) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? WHITE : '#FAFAFA', borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '11px 12px', fontWeight: 500, color: DARK }}>{kw.keyword}</td>
                    <td style={{ padding: '11px 12px', color: DARK }}>{kw.monthlySearches?.toLocaleString() || '—'}</td>
                    <td style={{ padding: '11px 12px', color: GREY }}>{kw.cpc > 0 ? `$${kw.cpc.toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '11px 12px', fontWeight: 600, color: !kw.organicRank ? RED : kw.organicRank <= 3 ? GREEN : kw.organicRank <= 10 ? AMBER : RED }}>
                      {kw.organicRank ? `#${kw.organicRank}` : 'Not ranking'}
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: statusColor(kw.status) + '20', color: statusColor(kw.status) }}>
                        {kw.status?.replace('-', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ai.keyStrength && (
            <div style={{ marginTop: 16, background: GREEN_BG, borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#166534' }}>
              ✓ {ai.keyStrength}
            </div>
          )}
        </div>
      )}

      {/* SECTION 5 — REVENUE */}
      {(loss.high || 0) > 0 && (
        <div style={{ background: DARK, borderRadius: 16, padding: '40px 32px', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: CYAN, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Estimated Monthly Revenue Being Left On The Table
          </div>
          <div style={{ fontSize: 48, fontWeight: 800, color: WHITE, marginTop: 12, lineHeight: 1 }}>
            ${loss.low?.toLocaleString()} {' – '} ${loss.high?.toLocaleString()}
          </div>
          {ai.estimatedMonthlyRevenueLoss?.calculation && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 12 }}>
              {ai.estimatedMonthlyRevenueLoss.calculation}
            </div>
          )}
          {ai.demandGapInsight && (
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 20, maxWidth: 560, margin: '20px auto 0', lineHeight: 1.6 }}>
              {ai.demandGapInsight}
            </div>
          )}
        </div>
      )}

      {/* SECTION 6 — QUICK WIN */}
      {ai.quickWin && (
        <div style={{ ...card(), border: `2px solid ${GREEN}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: DARK }}>⚡ Your Quick Win</span>
            <span style={{ padding: '4px 12px', borderRadius: 20, background: GREEN_BG, color: GREEN, fontSize: 11, fontWeight: 700 }}>Free & Fast</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: DARK, marginTop: 16, lineHeight: 1.5 }}>{ai.quickWin.action}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {ai.quickWin.timeRequired && (
              <span style={{ padding: '4px 12px', borderRadius: 12, background: GREY_BG, color: GREY, fontSize: 12 }}>⏱ {ai.quickWin.timeRequired}</span>
            )}
          </div>
          {ai.quickWin.expectedResult && (
            <div style={{ fontSize: 13, color: GREY, marginTop: 10, lineHeight: 1.5 }}>{ai.quickWin.expectedResult}</div>
          )}
          <button onClick={() => { window.location.href = '/contact'; }} style={{
            width: '100%', marginTop: 20, padding: '14px', background: CYAN, color: DARK,
            fontWeight: 700, fontSize: 15, borderRadius: 10, border: 'none', cursor: 'pointer'
          }}>
            Book a Free Strategy Call →
          </button>
        </div>
      )}

      {/* SECTION 7 — SPEED */}
      {speed.mobile?.score != null ? (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {[{ label: '📱 Mobile', data: speed.mobile }, { label: '🖥 Desktop', data: speed.desktop }].map(({ label, data }) => (
            <div key={label} style={{ ...card({ flex: 1, minWidth: 200, marginBottom: 0 }) }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: scoreColor(data?.score || 0, 100), lineHeight: 1 }}>
                {data?.score ?? '—'}<span style={{ fontSize: 16, color: GREY, fontWeight: 400 }}>/100</span>
              </div>
              {[
                { key: 'fcp', label: 'FCP', tip: 'First Contentful Paint', val: data?.fcp, unit: 's', good: 2.5, ok: 4 },
                { key: 'lcp', label: 'LCP', tip: 'Largest Contentful Paint — key Google ranking factor', val: data?.lcp, unit: 's', good: 2.5, ok: 4 },
                { key: 'tbt', label: 'TBT', tip: 'Total Blocking Time — page responsiveness', val: data?.tbt, unit: 'ms', good: 200, ok: 600 },
                { key: 'cls', label: 'CLS', tip: 'Cumulative Layout Shift — page stability', val: data?.cls, unit: '', good: 0.1, ok: 0.25 },
              ].map(m => {
                const isGood = (m.val || 0) <= m.good;
                const isOk = (m.val || 0) <= m.ok;
                const statusC = isGood ? GREEN : isOk ? AMBER : RED;
                const statusT = isGood ? 'Good' : isOk ? 'Needs work' : 'Critical';
                return (
                  <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: DARK }}>{m.label}</span>
                      <span title={m.tip} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', background: GREY_BG, color: GREY, fontSize: 9, cursor: 'help', marginLeft: 4 }}>?</span>
                      <div style={{ fontSize: 12, color: GREY }}>{m.val != null ? `${m.val}${m.unit}` : '—'}</div>
                    </div>
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: statusC + '20', color: statusC }}>{statusT}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 16, fontSize: 13, color: GREY, background: GREY_BG, borderRadius: 12, marginBottom: 16 }}>
          Website speed test unavailable for this report.
        </div>
      )}

      {/* SECTION 8 — CONTENT GAPS */}
      {gaps.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 4 }}>Pages You Should Create</div>
          <div style={{ fontSize: 12, color: GREY, marginBottom: 16 }}>These missing pages are leaving search traffic on the table</div>
          {gaps.map((g: any, i: number) => (
            <div key={i} style={{ background: GREY_BG, borderRadius: 10, padding: 16, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 8 }}>{g.pageTitle}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ padding: '2px 10px', borderRadius: 12, background: WHITE, border: `1px solid ${BORDER}`, fontSize: 12, color: GREY }}>{g.targetKeyword}</span>
                {g.monthlySearches && (
                  <span style={{ fontSize: 12, color: CYAN, fontWeight: 600 }}>{g.monthlySearches?.toLocaleString()} searches/mo</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: GREY, lineHeight: 1.5 }}>{g.reason}</div>
            </div>
          ))}
        </div>
      )}

      {/* SECTION 9 — SHARE */}
      <div style={{ background: DARK, borderRadius: 16, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: WHITE, marginBottom: 4 }}>Share This Report</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>Show your team or save for later</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { label: '📧 Email', onClick: () => { window.open(`mailto:?subject=My WeFixTrades Audit&body=View my free local business audit: ${shareUrl}`); } },
            { label: '💬 WhatsApp', onClick: () => { window.open(`https://wa.me/?text=Check out my business audit: ${shareUrl}`); } },
            { label: '📘 Facebook', onClick: () => { window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`); } },
            { label: '🐦 Twitter', onClick: () => { window.open(`https://twitter.com/intent/tweet?text=Just got my free local business audit — scored ${scores.total}/100. Get yours free:&url=${encodeURIComponent(shareUrl)}`); } },
            {
              label: copiedLink ? '✓ Copied!' : '🔗 Copy Link',
              onClick: () => { navigator.clipboard.writeText(shareUrl).then(() => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }); }
            },
          ].map((btn, i) => (
            <button key={i} onClick={btn.onClick} style={{
              padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.06)', color: WHITE, fontSize: 13, fontWeight: 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}>
              {btn.label}
            </button>
          ))}
        </div>
        {ai.reportDataQuality?.missingDataNote && (
          <div style={{ marginTop: 20, fontSize: 12, color: GREY, background: GREY_BG, borderRadius: 8, padding: '10px 14px', textAlign: 'left' }}>
            ℹ️ {ai.reportDataQuality.missingDataNote}
          </div>
        )}
      </div>
    </div>
  );
}

const STEPS = [
  "Fetching business details",
  "Running website speed test",
  "Generating report",
] as const;

function busyStep(busy: string | null): number {
  if (!busy) return 0;
  if (busy.includes("speed")) return 2;
  if (busy.includes("Generating")) return 3;
  return 1;
}

export default function FreeAudit() {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 400);

  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchDone, setSearchDone] = useState(false); // true after a search completes
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [business, setBusiness] = useState<Business | null>(null);
  const [speedData, setSpeedData] = useState<SpeedData | null>(null);
  const [report, setReport] = useState<ReportJson | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);

  // Autocomplete search: fires after 3+ chars with 400ms debounce
  useEffect(() => {
    setError(null); // Clear any previous errors on new input
    const q = debounced.trim();
    if (q.length < 3) {
      setPredictions([]);
      setDropdownOpen(false);
      setSearchDone(false);
      return;
    }

    setLoadingSearch(true);
    setSearchDone(false);

    console.log("[Audit] Autocomplete → POST /api/audit/search-places", { query: q });

    postJSON<{ ok: true; predictions: Prediction[] }>(
      "/api/audit/search-places",
      { query: q }
    )
      .then((d) => {
        const preds = d.predictions || [];
        console.log("[Audit] Got", preds.length, "predictions:", JSON.stringify(preds.map(p => ({ name: p.name, place_id: p.place_id }))));
        setPredictions(preds);
        setSearchDone(true);
        setDropdownOpen(true);
      })
      .catch((e) => {
        console.error("[Audit] Search failed:", e);
        setError(e.message || "Search failed");
        setPredictions([]);
        setSearchDone(true);
        setDropdownOpen(true);
      })
      .finally(() => setLoadingSearch(false));
  }, [debounced]);

  // Dismiss dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Dismiss dropdown on Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDropdownOpen(false); inputRef.current?.blur(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dropdownOpen]);

  async function runAudit(pred: Prediction) {
    console.log("[Audit] runAudit called:", JSON.stringify({ name: pred.name, place_id: pred.place_id }));
    const placeId = (pred.place_id || "").trim();
    try {
      setError(null);
      setBusy("Fetching business details\u2026");
      setReport(null);
      setSpeedData(null);
      setPredictions([]);
      setDropdownOpen(false);

      let details: { ok: true; business: Business };

      // Send placeId if available, otherwise send query for server-side resolution
      const body: any = placeId
        ? { placeId }
        : { query: `${pred.name} ${pred.formatted_address}`.trim() };
      console.log("[Audit] Fetching details with:", body);
      details = await postJSON<{ ok: true; business: Business }>(
        "/api/audit/place-details",
        body
      );
      setBusiness(details.business);

      // PageSpeed now runs server-side in parallel with other API calls
      setBusy("Generating report\u2026");
      const rep = await postJSON<{
        ok: true;
        report_json: any;
        reportId?: string;
      }>(
        "/api/audit/generate",
        {
          business: details.business,
          speedData: null,
          trade: details.trade || "",
          city: details.city || ""
        }
      );
      setReport(rep.report_json);
      if (rep.reportId) {
        setReportId(rep.reportId);
      }
      setBusy(null);

      setTimeout(() => {
        reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e: any) {
      setBusy(null);
      setError(e?.message || "Audit failed");
    }
  }

  const currentStep = busyStep(busy);

  const reportReady = !!report;
  const UI_BUSINESS = business
    ? { ...business, reviewsCount: business.reviewsCount, address: business.formattedAddress }
    : null;
  const UI_MAPS_ISSUES = report?.issues ?? [];
  const UI_SPEED = speedData ?? { mobile: { score: null }, desktop: { score: null } };

  return (
    <MarketingLayout>
      <style>{`
        .audit-page {
          min-height: 100vh;
          background: linear-gradient(180deg, rgba(236,242,244,1) 0%, rgba(248,250,252,1) 55%, rgba(236,242,244,1) 100%);
          position: relative;
        }
        .audit-page::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.045;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 200px 200px;
          pointer-events: none;
          z-index: 0;
        }
        .audit-container {
          position: relative;
          z-index: 1;
          max-width: 680px;
          margin: 0 auto;
          padding: 110px 16px 80px;
        }
        @media (min-width: 768px) {
          .audit-container { padding: 120px 24px 80px; }
        }
        .audit-input:focus {
          border-color: #2F6BFF !important;
          box-shadow: 0 0 0 4px rgba(47,107,255,0.16) !important;
        }
        .audit-suggestion:hover {
          background: rgba(47,107,255,0.06) !important;
        }
        .audit-suggestion:active {
          background: rgba(47,107,255,0.10) !important;
        }
        .audit-shimmer {
          height: 4px;
          border-radius: 4px;
          background: rgba(0,0,0,0.06);
          overflow: hidden;
          position: relative;
        }
        .audit-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 4px;
          background: linear-gradient(90deg, transparent, #2F6BFF, transparent);
          animation: audit-shimmer-move 1.4s ease-in-out infinite;
        }
        @keyframes audit-shimmer-move {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="audit-page">
        <div className="audit-container">
          {/* ─── Header + Search (always visible) ─── */}
          <div style={{ textAlign: "center", marginBottom: reportReady ? 20 : 36 }}>
            <h1
              data-testid="text-audit-title"
              style={{
                fontSize: reportReady ? "clamp(22px, 4vw, 28px)" : "clamp(30px, 5vw, 40px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: "#111827",
                marginBottom: reportReady ? 8 : 12,
                lineHeight: 1.05,
                transition: "font-size 0.3s",
              }}
            >
              Free Google Maps &amp; Website Audit
            </h1>
            {!reportReady && (
              <p
                style={{
                  fontSize: 16,
                  color: "rgba(0,0,0,0.62)",
                  maxWidth: "58ch",
                  margin: "0 auto 14px",
                  lineHeight: 1.55,
                }}
              >
                Search your business and get an instant report on your Google
                Business Profile health and website speed.
              </p>
            )}
            {!reportReady && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "rgba(0,0,0,0.48)",
                }}
              >
                <span>Instant report</span>
                <span style={{ opacity: 0.4 }}>{"\u00b7"}</span>
                <span>No signup</span>
                <span style={{ opacity: 0.4 }}>{"\u00b7"}</span>
                <span>Takes ~30 seconds</span>
              </div>
            )}
          </div>

          {!busy && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.78)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 18,
                    boxShadow: "0 18px 50px rgba(0,0,0,0.08)",
                    padding: 16,
                    position: "relative",
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <Search
                      size={18}
                      strokeWidth={1.75}
                      style={{
                        position: "absolute",
                        left: 14,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "rgba(0,0,0,0.35)",
                        pointerEvents: "none",
                      }}
                    />
                    <input
                      ref={inputRef}
                      data-testid="input-audit-search"
                      className="audit-input"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onFocus={() => { if (predictions.length > 0 || (searchDone && predictions.length === 0)) setDropdownOpen(true); }}
                      placeholder="Type your business name + city…"
                      style={{
                        width: "100%",
                        height: 46,
                        borderRadius: 14,
                        border: "1px solid rgba(0,0,0,0.10)",
                        padding: "0 14px 0 42px",
                        fontSize: 15,
                        fontWeight: 500,
                        outline: "none",
                        background: "#fff",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                        color: "#111827",
                      }}
                    />
                    {loadingSearch && (
                      <div
                        style={{
                          position: "absolute",
                          right: 14,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 18,
                          height: 18,
                          border: "2px solid rgba(47,107,255,0.2)",
                          borderTopColor: "#2F6BFF",
                          borderRadius: "50%",
                          animation: "spin 0.7s linear infinite",
                        }}
                      />
                    )}
                  </div>

                  {/* Autocomplete dropdown */}
                  {dropdownOpen && !loadingSearch && searchDone && (
                    <div
                      ref={dropdownRef}
                      data-testid="list-suggestions"
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "100%",
                        marginTop: 4,
                        borderRadius: 14,
                        background: "#fff",
                        border: "1px solid rgba(0,0,0,0.10)",
                        boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
                        zIndex: 50,
                        overflow: "hidden",
                      }}
                    >
                      {predictions.length === 0 ? (
                        <div style={{
                          padding: "16px 18px",
                          fontSize: 13,
                          color: "rgba(0,0,0,0.50)",
                          textAlign: "center",
                        }}>
                          No businesses found — try adding your city name
                        </div>
                      ) : (
                        <div style={{ maxHeight: 320, overflowY: "auto" }}>
                          {predictions.map((p, i) => (
                            <button
                              key={p.place_id}
                              data-testid={`button-place-${p.place_id}`}
                              className="audit-suggestion"
                              onClick={() => runAudit(p)}
                              style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "10px 16px",
                                background: "transparent",
                                border: "none",
                                borderBottom: i < predictions.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                transition: "background 0.1s",
                              }}
                            >
                              {p.photoUrl ? (
                                <img
                                  src={p.photoUrl}
                                  alt=""
                                  style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                                />
                              ) : (
                                <div style={{
                                  width: 36, height: 36, borderRadius: "50%",
                                  background: "rgba(47,107,255,0.08)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  flexShrink: 0, fontSize: 15, fontWeight: 700, color: "#2F6BFF",
                                }}>
                                  {p.name?.charAt(0) || "?"}
                                </div>
                              )}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {p.name}
                                </div>
                                <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {p.formatted_address}
                                  {p.rating != null && <span style={{ marginLeft: 6 }}>{"\u2605"} {p.rating}</span>}
                                  {p.user_ratings_total > 0 && <span> ({p.user_ratings_total})</span>}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {error && (
                    <div
                      data-testid="text-audit-error"
                      style={{
                        marginTop: 12,
                        padding: "10px 14px",
                        borderRadius: 12,
                        background: "rgba(239,68,68,0.06)",
                        border: "1px solid rgba(239,68,68,0.14)",
                        color: "#B91C1C",
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {error}
                    </div>
                  )}
                </div>
              )}

              {busy && (
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid rgba(0,0,0,0.07)",
                    borderRadius: 18,
                    boxShadow: "0 6px 24px rgba(0,0,0,0.05)",
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#111827",
                      marginBottom: 14,
                    }}
                  >
                    Running your audit… (step {currentStep} of 3)
                  </div>
                  <div className="audit-shimmer" style={{ marginBottom: 16 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {STEPS.map((label, idx) => {
                      const step = idx + 1;
                      const done = currentStep > step;
                      const active = currentStep === step;
                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            fontSize: 13,
                            fontWeight: 500,
                            color: done
                              ? "#22C55E"
                              : active
                              ? colors.accent.blue
                              : "rgba(0,0,0,0.35)",
                          }}
                        >
                          {done ? (
                            <CheckCircle2 size={15} />
                          ) : active ? (
                            <div
                              style={{
                                width: 15,
                                height: 15,
                                border: "2px solid rgba(47,107,255,0.3)",
                                borderTopColor: "#2F6BFF",
                                borderRadius: "50%",
                                animation: "spin 0.7s linear infinite",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 15,
                                height: 15,
                                borderRadius: "50%",
                                border: "2px solid rgba(0,0,0,0.12)",
                              }}
                            />
                          )}
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>
          )}

          {reportReady && report && (
            <div ref={reportRef}>
              <ReportView
                report={report}
                business={report.business}
                reportId={reportId}
              />
            </div>
          )}
        </div>
      </div>
    </MarketingLayout>
  );
}
