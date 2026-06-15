import { useState, type ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus, Check, X, AlertTriangle, MapPin, BarChart3 } from "lucide-react";
import InfoTooltip from "@/components/marketing/InfoTooltip";

/* ────────────────────────────────────────────────────────────────────────────
 * Premium value-first report modules.
 *
 * Consumes `report.premium` (emitted by the audit backend, PR #1848). EVERY
 * module is nullable and self-suppresses when its source data is absent — no
 * empty band, no "no data" placeholder (the owner explicitly complained about
 * empty bands). The parent (ReportView) renders <PremiumModules/> on the
 * Overview; this file is pure presentation and never fetches.
 *
 * Hard UI rules obeyed here (carried, oft-violated — see DESIGN-SYSTEM.md):
 *  - One help cue per component, anchored TOP-LEFT of the section header.
 *  - Theme-aware contrast (the report wrapper is data-theme="light"; these
 *    cards live on a light surface so foregrounds are dark / flat near-black).
 *  - Selected / highlighted row = subtle outline + faint tint, never a bright
 *    fill that swallows the text (the "you" row uses a 4% blue tint + outline).
 *  - No big empty gaps; tight, scannable rhythm.
 *  - Mobile 375px: the comparison renders as a horizontally-scrollable table
 *    inside an overflow wrapper so nothing clips.
 * ────────────────────────────────────────────────────────────────────────── */

// Tokens (mirror ReportView's light-surface palette)
const DARK = "#0d1514";
const CYAN = "#0d3cfc";
const GREEN = "#22C55E";
const AMBER = "#F59E0B";
const RED = "#EF4444";
const GREY = "#6B7280";
const GREY_BG = "#F9FAFB";
const BORDER = "#E5E7EB";
const WHITE = "#FFFFFF";
const BLUE_TINT = "rgba(13,60,252,0.06)"; // 6% blue — the "you" row tint
const R16 = 16;

export interface PremiumComparisonRow {
  name: string;
  reviews: number;
  rating: number;
  distanceLabel: string | null;
  isYou?: boolean;
}
export interface PremiumComparison {
  you: PremiumComparisonRow & { isYou: true };
  rows: PremiumComparisonRow[];
  yourRank: number;
}
export interface PremiumKpi {
  key: string;
  label: string;
  value: number | string;
  suffix?: string;
  benchmark?: number;
  trend?: "up" | "down" | "flat";
}
export interface PremiumGbpCheck { key: string; label: string; pass: boolean; hint?: string; }
export interface PremiumGbp { completenessPct: number; checks: PremiumGbpCheck[]; missing: string[]; }
export interface PremiumOnPageCheck { key: string; label: string; status: "pass" | "warn" | "fail"; detail?: string; }
export interface PremiumOnPage { checks: PremiumOnPageCheck[]; }
export interface PremiumReviewDepth { newestReviewAgeDays: number | null; sentimentHint: string | null; }
export interface PremiumBlock {
  comparison: PremiumComparison | null;
  kpis: PremiumKpi[];
  gbp: PremiumGbp | null;
  onPage: PremiumOnPage | null;
  reviewDepth: PremiumReviewDepth | null;
}

/** A keyword row coming from report.keywords (shape is loose). */
export interface KeywordLite {
  keyword: string;
  monthlySearches?: number;
  organicRank?: number | null;
  localPackPosition?: number | null;
  isInLocalPack?: boolean;
}

/* ─── Shared card shell with a single top-left help cue (Recurring Rule §2). ── */
function Card({ title, cue, children, headerExtra }: { title: string; cue?: string; children: ReactNode; headerExtra?: ReactNode }) {
  return (
    <div
      data-theme="light"
      style={{ background: WHITE, borderRadius: R16, border: `1px solid ${BORDER}`, padding: 20, marginBottom: 10 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {/* Help cue lives top-left of the header, never inline-right (Rule §2). */}
        {cue ? <InfoTooltip text={cue} theme="light" /> : null}
        <span style={{ fontSize: 17, fontWeight: 700, color: DARK, lineHeight: 1.2 }}>{title}</span>
        <span style={{ flex: 1 }} />
        {headerExtra}
      </div>
      {children}
    </div>
  );
}

function TrendIcon({ trend, color }: { trend?: "up" | "down" | "flat"; color: string }) {
  if (trend === "up") return <TrendingUp size={14} color={color} />;
  if (trend === "down") return <TrendingDown size={14} color={color} />;
  if (trend === "flat") return <Minus size={14} color={color} />;
  return null;
}

/* ═══ 1. KPI TILES ════════════════════════════════════════════════════════ */
function KpiTiles({ kpis }: { kpis: PremiumKpi[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (!kpis || kpis.length === 0) return null;
  return (
    <Card title="Your numbers at a glance" cue="Your headline metrics versus the local benchmark. A green arrow means you beat the area average for that metric; red means you're behind it.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {kpis.map((k) => {
          const isHover = hovered === k.key;
          // Trend colour: up = good (green), down = behind (red), flat = neutral.
          const trendColor = k.trend === "up" ? GREEN : k.trend === "down" ? RED : GREY;
          const hasBench = typeof k.benchmark === "number";
          return (
            <div
              key={k.key}
              onMouseEnter={() => setHovered(k.key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                background: GREY_BG,
                border: `1px solid ${isHover ? CYAN : BORDER}`,
                borderRadius: 12,
                padding: "14px 14px",
                transition: "border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease",
                transform: isHover ? "translateY(-2px)" : "none",
                boxShadow: isHover ? "0 6px 18px rgba(13,60,252,0.10)" : "none",
              }}
            >
              <div style={{ fontSize: 11, color: GREY, fontWeight: 600, letterSpacing: "0.02em", marginBottom: 6, lineHeight: 1.3 }}>
                {k.label}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: DARK, lineHeight: 1 }}>{k.value}</span>
                {k.suffix ? <span style={{ fontSize: 13, fontWeight: 700, color: GREY }}>{k.suffix}</span> : null}
              </div>
              {hasBench && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
                  <TrendIcon trend={k.trend} color={trendColor} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: trendColor }}>
                    {k.trend === "up" ? "Ahead of" : k.trend === "down" ? "Behind" : "At"} area avg
                  </span>
                  <span style={{ fontSize: 11, color: GREY }}>({k.benchmark}{k.suffix || ""})</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ═══ 2. YOU-VS-COMPETITORS TABLE ═════════════════════════════════════════ */
function ComparisonTable({ comparison }: { comparison: PremiumComparison }) {
  // Merge "you" into the ranked rows by review count so the highlighted row
  // sits in its true position; the table reads top-to-bottom like a leaderboard.
  const merged: PremiumComparisonRow[] = [...comparison.rows, comparison.you]
    .sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
  const total = comparison.rows.length + 1;
  const rankSuffix = comparison.yourRank === 1 ? "st" : comparison.yourRank === 2 ? "nd" : comparison.yourRank === 3 ? "rd" : "th";

  const th: React.CSSProperties = {
    fontSize: 10, color: GREY, textTransform: "uppercase", letterSpacing: "0.04em",
    fontWeight: 700, padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = { fontSize: 13, color: DARK, padding: "10px 10px", textAlign: "right", whiteSpace: "nowrap" };

  return (
    <Card
      title="You vs. your competitors"
      cue="Your local rivals ranked by review count — the strongest signal of who Google trusts most. Your business row is highlighted so you can see exactly where you stand."
      headerExtra={
        <span style={{
          fontSize: 12, fontWeight: 700, color: CYAN, background: BLUE_TINT,
          border: `1px solid ${CYAN}`, borderRadius: 20, padding: "3px 12px", whiteSpace: "nowrap",
        }}>
          You rank #{comparison.yourRank}<span style={{ fontWeight: 600 }}>{rankSuffix}</span> of {total}
        </span>
      }
    >
      {/* Mobile: horizontal scroll inside the wrapper so nothing clips at 375px. */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: "0 -4px" }}>
        <table style={{ width: "100%", minWidth: 360, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              <th style={{ ...th, textAlign: "left", paddingLeft: 10 }}>Business</th>
              <th style={th}>Reviews</th>
              <th style={th}>Rating</th>
              <th style={th}>Distance</th>
            </tr>
          </thead>
          <tbody>
            {merged.map((row, i) => {
              const you = !!row.isYou;
              return (
                <tr
                  key={`${row.name}-${i}`}
                  style={{
                    // Selected/highlighted = outline + faint tint, NEVER a bright
                    // fill (Recurring Rule §4). Text stays dark + readable.
                    background: you ? BLUE_TINT : "transparent",
                    outline: you ? `1.5px solid ${CYAN}` : "none",
                    outlineOffset: -1,
                    borderBottom: i < merged.length - 1 ? `1px solid ${BORDER}` : "none",
                  }}
                >
                  <td style={{ ...td, textAlign: "left", paddingLeft: 10, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700,
                        background: you ? CYAN : "#E5E7EB", color: you ? WHITE : GREY,
                      }}>{i + 1}</span>
                      <span style={{ fontWeight: you ? 800 : 600, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.name || "Unknown"}{you ? " (you)" : ""}
                      </span>
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight: you ? 800 : 600 }}>{(row.reviews || 0).toLocaleString()}</td>
                  <td style={td}>{row.rating ? `${row.rating.toFixed(1)}★` : "—"}</td>
                  <td style={{ ...td, color: GREY }}>{row.distanceLabel || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ═══ 3. GBP COMPLETENESS ═════════════════════════════════════════════════ */
function GbpCompletenessRing({ pct }: { pct: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * circ;
  const color = clamped >= 80 ? GREEN : clamped >= 50 ? AMBER : RED;
  return (
    <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke={BORDER} strokeWidth="6" />
        <circle
          cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`} transform="rotate(-90 32 32)"
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: DARK }}>
        {clamped}%
      </div>
    </div>
  );
}

function GbpCard({ gbp }: { gbp: PremiumGbp }) {
  if (!gbp || !Array.isArray(gbp.checks) || gbp.checks.length === 0) return null;
  // Lead with what's missing (actionable) — failures first, then passes.
  const ordered = [...gbp.checks].sort((a, b) => Number(a.pass) - Number(b.pass));
  return (
    <Card title="Google Business Profile health" cue="How complete your Google Business Profile is. Each item Google looks for is checked against your live profile — fix the red ones first; they're the quickest local-ranking wins.">
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <GbpCompletenessRing pct={gbp.completenessPct} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: DARK }}>Profile completeness</div>
          <div style={{ fontSize: 12, color: GREY, marginTop: 2, lineHeight: 1.45 }}>
            {gbp.missing && gbp.missing.length > 0
              ? `Missing: ${gbp.missing.join(", ")}`
              : "Every checked field is filled in — nice work."}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gap: 2 }}>
        {ordered.map((c) => (
          <div
            key={c.key}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px",
              borderRadius: 8, background: c.pass ? "transparent" : "#FEF2F2",
            }}
          >
            <span style={{ flexShrink: 0, marginTop: 1 }}>
              {c.pass ? <Check size={16} color={GREEN} strokeWidth={2.6} /> : <X size={16} color={RED} strokeWidth={2.6} />}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{c.label}</div>
              {!c.pass && c.hint ? <div style={{ fontSize: 12, color: GREY, marginTop: 2, lineHeight: 1.45 }}>{c.hint}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ═══ 4. ON-PAGE BASICS ═══════════════════════════════════════════════════ */
function OnPageCard({ onPage }: { onPage: PremiumOnPage }) {
  if (!onPage || !Array.isArray(onPage.checks) || onPage.checks.length === 0) return null;
  const statusMeta = (s: string) =>
    s === "pass" ? { color: GREEN, bg: "transparent", icon: <Check size={16} color={GREEN} strokeWidth={2.6} /> }
      : s === "warn" ? { color: AMBER, bg: "#FFFBEB", icon: <AlertTriangle size={14} color={AMBER} /> }
      : { color: RED, bg: "#FEF2F2", icon: <X size={16} color={RED} strokeWidth={2.6} /> };
  // Fails first, then warns, then passes — lead with what to fix.
  const order = { fail: 0, warn: 1, pass: 2 } as const;
  const ordered = [...onPage.checks].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <Card title="Website on-page basics" cue="Technical SEO and conversion checks on your live website — things like click-to-call, page title, mobile viewport and structured data. Red items hurt rankings or lose calls.">
      <div style={{ display: "grid", gap: 2 }}>
        {ordered.map((c) => {
          const m = statusMeta(c.status);
          return (
            <div key={c.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 8, background: m.bg }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>{m.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{c.label}</div>
                {c.detail ? <div style={{ fontSize: 12, color: GREY, marginTop: 2, lineHeight: 1.45 }}>{c.detail}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ═══ 5. CHARTS — keyword-position bars + review-gap-vs-leader ════════════ */
function KeywordPositionChart({ keywords }: { keywords: KeywordLite[] }) {
  // Only keywords with a known position (organic or local pack). Lower = better;
  // we draw a bar whose fill is longer the closer you are to #1 (cap at #20).
  const rows = (keywords || [])
    .map((k) => {
      const pos = (typeof k.organicRank === "number" && k.organicRank > 0)
        ? k.organicRank
        : (k.isInLocalPack && typeof k.localPackPosition === "number" && k.localPackPosition > 0)
          ? k.localPackPosition
          : null;
      const isLocal = !(typeof k.organicRank === "number" && k.organicRank > 0) && !!k.isInLocalPack;
      return pos ? { keyword: k.keyword, pos, isLocal } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a!.pos - b!.pos))
    .slice(0, 6) as Array<{ keyword: string; pos: number; isLocal: boolean }>;
  if (rows.length === 0) return null;
  const fillPct = (pos: number) => Math.max(8, Math.round(((21 - Math.min(20, pos)) / 20) * 100));
  const posColor = (pos: number) => (pos <= 3 ? GREEN : pos <= 10 ? AMBER : RED);
  return (
    <Card title="Where you rank for key searches" cue="Your Google position for each search term — bars closer to full mean you're nearer the top of page 1, where almost all the clicks go. Green = top 3, amber = page 1, red = below.">
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((row, i) => (
          <div key={`${row.keyword}-${i}`}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{row.keyword}</span>
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: posColor(row.pos) }}>
                {row.isLocal ? `Maps #${row.pos}` : `#${row.pos}`}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 5, background: GREY_BG, overflow: "hidden" }}>
              <div style={{ width: `${fillPct(row.pos)}%`, height: "100%", borderRadius: 5, background: posColor(row.pos) }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReviewGapChart({ you, leaderName, leaderReviews, areaAvg }: { you: number; leaderName?: string | null; leaderReviews?: number | null; areaAvg?: number | null }) {
  const bars = [
    { label: "You", value: Math.max(0, Math.round(you || 0)), color: CYAN, isYou: true },
    leaderReviews && leaderReviews > 0 ? { label: leaderName ? `Leader (${leaderName})` : "Market leader", value: Math.round(leaderReviews), color: DARK, isYou: false } : null,
    areaAvg && areaAvg > 0 ? { label: "Area average", value: Math.round(areaAvg), color: GREY, isYou: false } : null,
  ].filter(Boolean) as Array<{ label: string; value: number; color: string; isYou: boolean }>;
  // Need at least one comparator beyond "You" for the chart to mean anything.
  if (bars.length < 2) return null;
  const max = Math.max(...bars.map((b) => b.value), 1);
  const gap = (leaderReviews || 0) - (you || 0);
  return (
    <Card title="Review gap vs. the leader" cue="Review count is the biggest driver of who Google ranks first locally. This shows how your review total compares to the top competitor and the area average — closing the gap directly lifts your ranking.">
      <div style={{ display: "grid", gap: 12 }}>
        {bars.map((b) => (
          <div key={b.label}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: b.isYou ? 800 : 600, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{b.label}</span>
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: b.isYou ? CYAN : GREY }}>{b.value.toLocaleString()}</span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: GREY_BG, overflow: "hidden", outline: b.isYou ? `1px solid ${CYAN}` : "none", outlineOffset: -1 }}>
              <div style={{ width: `${Math.max(4, Math.round((b.value / max) * 100))}%`, height: "100%", borderRadius: 5, background: b.color }} />
            </div>
          </div>
        ))}
      </div>
      {gap > 0 && (
        <div style={{ marginTop: 14, background: "#FFFBEB", border: `1px solid #FDE68A`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#92400E", lineHeight: 1.5 }}>
          You're <strong>{gap.toLocaleString()}</strong> reviews behind the local leader. Closing that gap is the single biggest lever on your local ranking.
        </div>
      )}
    </Card>
  );
}

/* ═══ ORCHESTRATOR — renders only the modules whose data is present ════════ */
export default function PremiumModules({
  premium,
  keywords,
  reviewChart,
}: {
  premium: PremiumBlock | null | undefined;
  keywords?: KeywordLite[];
  reviewChart?: { you: number; leaderName?: string | null; leaderReviews?: number | null; areaAvg?: number | null };
}) {
  // Charts can render from EXISTING report data even if `premium` is absent.
  const hasKwChart = Array.isArray(keywords) && keywords.length > 0;
  const hasReviewChart = !!reviewChart && (reviewChart.leaderReviews ?? 0) > 0;

  if (!premium && !hasKwChart && !hasReviewChart) return null;

  const kpis = premium?.kpis;
  const comparison = premium?.comparison;
  const gbp = premium?.gbp;
  const onPage = premium?.onPage;

  return (
    <div data-testid="premium-modules">
      {/* Section eyebrow — top-left aligned (hard layout rule §4). */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 2px 8px" }}>
        <BarChart3 size={14} color={CYAN} />
        <span style={{ fontSize: 11, fontWeight: 700, color: GREY, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Deep-dive analysis
        </span>
      </div>

      {kpis && kpis.length > 0 ? <KpiTiles kpis={kpis} /> : null}
      {comparison ? <ComparisonTable comparison={comparison} /> : null}
      {hasReviewChart && reviewChart ? <ReviewGapChart {...reviewChart} /> : null}
      {gbp ? <GbpCard gbp={gbp} /> : null}
      {onPage ? <OnPageCard onPage={onPage} /> : null}
      {hasKwChart ? <KeywordPositionChart keywords={keywords!} /> : null}
    </div>
  );
}
