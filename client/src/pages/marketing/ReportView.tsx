import { useState } from "react";
import { Wrench, FileX, BarChart3, Users } from "lucide-react";
import { SERVICES, getServicesForIssues } from '../../../../server/data/services';

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

export default function ReportView({ report, business, reportId }: {
  report: any;
  business: any;
  reportId?: string | null;
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<'maps' | 'website' | 'plan'>('maps');
  const [selected, setSelected] = useState<string[]>([]);
  const toggleService = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const detectedIssues: string[] = report?.detectedIssues || [];
  const recommendedServices: any[] = report?.recommendedServices || getServicesForIssues(detectedIssues);
  const totalPrice = selected.reduce((sum, id) => {
    const s = SERVICES.find(sv => sv.id === id);
    return sum + (s?.price || 0);
  }, 0);

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

      {/* TAB BAR */}
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:12, padding:4, marginBottom:20 }}>
        {(['maps','website','plan'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex:1, padding:'10px 0', borderRadius:9, border:'none', cursor:'pointer',
            fontWeight:600, fontSize:13,
            background: activeTab===tab ? WHITE : 'transparent',
            color: activeTab===tab ? DARK : GREY,
            boxShadow: activeTab===tab ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
          }}>
            {tab==='maps' ? 'Google Maps' : tab==='website' ? 'Website' : 'Action Plan'}
          </button>
        ))}
      </div>

      {/* SECTION 1 — COVER */}
      {activeTab === 'maps' && <div style={{ background: DARK, borderRadius: 16, padding: 28, marginBottom: 16 }}>
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
      </div>}

      {/* SECTION 2 — SCORE BREAKDOWN */}
      {activeTab === 'maps' && <div style={card()}>
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
      </div>}

      {/* SECTION 3 — ACTION PLAN */}
      {activeTab === 'maps' && plan.length > 0 && (
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
      {activeTab === 'website' && keywords.some((k: any) => k.monthlySearches > 0) && (
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
      {activeTab === 'maps' && (loss.high || 0) > 0 && (
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
      {activeTab === 'maps' && ai.quickWin && (
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
      {activeTab === 'website' && (speed.mobile?.score != null ? (
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
      ))}

      {/* SECTION 8 — CONTENT GAPS */}
      {activeTab === 'website' && gaps.length > 0 && (
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

      {activeTab === 'plan' && (
        <div>
          {/* A — DETECTED ISSUES HEADER */}
          <div style={{ background: AMBER_BG, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: AMBER, fontWeight: 600 }}>
            ⚠ {detectedIssues.length} issues detected in your audit — here's what we'd fix
          </div>

          {/* B — SERVICE CARDS */}
          {recommendedServices.map((service: any) => (
            <div key={service.id} style={{ background: WHITE, borderRadius: 16, border: `1px solid ${selected.includes(service.id) ? CYAN : BORDER}`, padding: 24, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: DARK }}>{service.name}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: CYAN }}>{service.priceLabel}</span>
              </div>
              {service.isPopular && (
                <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 10px', borderRadius: 12, background: CYAN + '22', color: CYAN, fontSize: 11, fontWeight: 700 }}>★ Popular</span>
              )}
              <div style={{ marginTop: 8 }}>
                <span style={{ background: AMBER_BG, color: AMBER, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                  Fixes: {service.fixesIssues.slice(0, 2).join(', ').replace(/-/g, ' ')}
                </span>
              </div>
              <div style={{ fontSize: 13, color: GREY, lineHeight: 1.55, marginTop: 12 }}>{service.description}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 12 }}>
                {service.features.map((f: string, fi: number) => (
                  <span key={fi} style={{ fontSize: 12, color: DARK }}>✓ {f}</span>
                ))}
              </div>
              <button
                onClick={() => toggleService(service.id)}
                style={{
                  marginTop: 16, width: '100%', padding: '10px 20px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                  border: selected.includes(service.id) ? 'none' : `1px solid ${BORDER}`,
                  background: selected.includes(service.id) ? CYAN : WHITE,
                  color: DARK,
                  fontWeight: selected.includes(service.id) ? 700 : 400,
                }}
              >
                {selected.includes(service.id) ? '✓ Selected' : 'Add to Selected Services'}
              </button>
            </div>
          ))}

          {/* Fallback when no services */}
          {recommendedServices.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', fontSize: 13, color: GREY }}>
              No specific issues detected — your profile looks strong!
            </div>
          )}

          {/* D — TRUST BADGES */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 24, marginBottom: 16 }}>
            {[
              { Icon: Wrench, title: 'All Done For You', text: 'No software to learn. No team to hire.' },
              { Icon: FileX, title: 'No Contracts', text: 'Cancel anytime. No cancellation fees.' },
              { Icon: BarChart3, title: 'Weekly Reports', text: 'See exactly what improved every week.' },
              { Icon: Users, title: 'Built for Trades', text: 'Designed for plumbers, HVAC, electricians and more.' },
            ].map(({ Icon, title, text }) => (
              <div key={title} style={{ background: GREY_BG, borderRadius: 12, padding: 16, textAlign: 'center' }}>
                <Icon size={20} color={CYAN} style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{title}</div>
                <div style={{ fontSize: 12, color: GREY, marginTop: 4 }}>{text}</div>
              </div>
            ))}
          </div>

          {/* E — POWERED BY STRIP */}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <div style={{ fontSize: 11, color: GREY, marginBottom: 8 }}>Powered by</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {['Google', 'Claude AI', 'Stripe', 'Zapier', 'Make.com', 'OpenAI'].map(tool => (
                <span key={tool} style={{ padding: '3px 10px', borderRadius: 12, background: GREY_BG, color: GREY, fontSize: 11 }}>{tool}</span>
              ))}
            </div>
          </div>

          {/* C — SELECTED SERVICES SUMMARY */}
          {selected.length > 0 && (
            <div style={{ position: 'sticky', bottom: 16, background: DARK, borderRadius: 12, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: WHITE }}>
                {selected.length} service{selected.length > 1 ? 's' : ''} selected · ${totalPrice}/mo
              </span>
              <button style={{ background: CYAN, color: DARK, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Get Started →
              </button>
            </div>
          )}
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
