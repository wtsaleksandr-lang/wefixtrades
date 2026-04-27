/**
 * Premium dashboard report shell — shared components across all product
 * monthly/periodic reports (AdFlow, MapGuard, ReputationShield, …).
 *
 * Design language is the v6 AdFlow approved style: dark hero card, cyan
 * accent, mathematically consistent 2×2 KPI grid, alpha-faded integrated
 * chart, recommendations panel, metric glossary, premium footer.
 *
 * Each component renders gracefully when data is absent (returns empty
 * string). Callers compose only the sections they actually have data
 * for. Result: real-metrics-only reports, no "—" placeholders for entire
 * sections.
 *
 * NOT used by transactional emails (account welcome, payment receipt,
 * etc.) — those keep the simpler centered shell from emailFooter.ts.
 */

import { buildEmailHeader, buildLegalFooter, buildChatBubble } from "./emailFooter";

/* ─── Brand palette (locked to all-cyan accent for now) ─── */

export const REPORT_COLORS = {
  bg: "#0B0F14",
  card: "#151A21",
  cardSubtle: "#0F141A",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.10)",
  bright: "#F0F0F0",
  text: "#CDD1D6",
  muted: "#8B919A",
  faint: "#555B63",
  tiny: "#3D434A",
  accent: "#66E8FA",
  positive: "#22C55E",
  negative: "#EF4444",
  warn: "#F59E0B",
} as const;

/* ─── Header (new: left-aligned logo + product, right-aligned badge) ─── */

export interface HeaderBadge {
  label: string;
  tone: "good" | "neutral" | "warn";
}

/**
 * Report-specific header. Logo + product label on the left, optional
 * status badge on the right. Replaces the centered transactional
 * header for dashboard reports.
 */
export function buildReportHeader(opts: { product: string; badge?: HeaderBadge }): string {
  const { product, badge } = opts;
  const accent = REPORT_COLORS.accent;
  const muted = REPORT_COLORS.muted;
  const bright = REPORT_COLORS.bright;

  const badgeHtml = badge ? `
    <td valign="middle" align="right" style="white-space:nowrap;">
      ${renderBadge(badge)}
    </td>` : "";

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 22px;border-collapse:collapse;">
      <tr>
        <td valign="middle" style="padding:0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;">
            <tr>
              <td valign="middle" style="padding-right:11px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;">
                  <tr>
                    <td align="center" valign="middle" width="38" height="38" style="width:38px;height:38px;background:#1a1f1e;border:1px solid rgba(255,255,255,0.18);border-radius:10px;color:${accent};font-size:18px;font-weight:700;font-family:Arial,sans-serif;line-height:38px;text-align:center;">&#10003;</td>
                  </tr>
                </table>
              </td>
              <td valign="middle" style="text-align:left;">
                <div style="font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-weight:700;font-size:18px;letter-spacing:-0.03em;color:${bright};line-height:1;">We<span style="color:${accent};">Fix</span>Trades</div>
                <div style="font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;font-size:10.5px;color:${muted};letter-spacing:0.09em;text-transform:uppercase;line-height:1;margin-top:4px;">${escapeHtml(product)}</div>
              </td>
            </tr>
          </table>
        </td>
        ${badgeHtml}
      </tr>
    </table>`;
}

function renderBadge(b: HeaderBadge): string {
  const palette = b.tone === "good"
    ? { bg: "rgba(34,197,94,0.10)", dot: REPORT_COLORS.positive, text: "#86EFAC" }
    : b.tone === "warn"
    ? { bg: "rgba(245,158,11,0.10)", dot: REPORT_COLORS.warn, text: "#FCD34D" }
    : { bg: "rgba(102,232,250,0.10)", dot: REPORT_COLORS.accent, text: "#9CECF8" };

  return `
    <span style="display:inline-block;background:${palette.bg};border:1px solid ${palette.bg.replace("0.10", "0.22")};border-radius:999px;padding:5px 10px 5px 9px;font-family:'Inter',system-ui,Arial,sans-serif;font-size:10.5px;font-weight:700;color:${palette.text};letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap;">
      <span style="display:inline-block;width:6px;height:6px;background:${palette.dot};border-radius:50%;margin-right:6px;vertical-align:middle;"></span>${escapeHtml(b.label)}
    </span>`;
}

/* ─── Auto-derive header badge from metrics ─── */

interface DeltaShape {
  rose: boolean;
  good: boolean;
  pctText: string;       // "32%" — no sign
  shown: boolean;
}

/**
 * Pick a header badge from a single primary delta + optional critical flag.
 * Returns "Up trending" if the metric improved by ≥10%, "Needs attention"
 * if it got materially worse, otherwise "On track".
 *
 * Pass `critical: true` to force "Needs attention" regardless of delta
 * (e.g. unanswered low-rating reviews).
 */
export function deriveHeaderBadge(opts: {
  primaryDelta?: DeltaShape;
  critical?: boolean;
}): HeaderBadge {
  if (opts.critical) return { label: "Needs attention", tone: "warn" };
  const d = opts.primaryDelta;
  if (d?.shown) {
    const pct = parseInt(d.pctText, 10) || 0;
    if (d.good && pct >= 10) return { label: "Up trending", tone: "good" };
    if (!d.good && pct >= 10) return { label: "Needs attention", tone: "warn" };
  }
  return { label: "On track", tone: "neutral" };
}

/* ─── Hero block (eyebrow + headline + summary + optional right-side meta) ─── */

export interface ReportHeroOpts {
  eyebrow: string;            // e.g. "Monthly performance"
  headline: string;
  period?: string;            // e.g. "April 2026"
  businessName?: string;
  summary?: string;
}

export function buildReportHero(opts: ReportHeroOpts): string {
  const c = REPORT_COLORS;
  const period = opts.period ? `<span style="color:${c.muted};margin-right:10px;">${escapeHtml(opts.period)}</span>` : "";
  const biz = opts.businessName ? `<span style="color:${c.muted};">${escapeHtml(opts.businessName)}</span>` : "";

  return `
    <p style="font-size:11px;font-weight:700;color:${c.accent};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">${escapeHtml(opts.eyebrow)}</p>
    <h1 style="font-size:26px;font-weight:800;color:${c.bright};margin:0 0 6px;line-height:1.18;letter-spacing:-0.02em;">${escapeHtml(opts.headline)}</h1>
    ${period || biz ? `
    <p style="font-size:13px;color:${c.muted};line-height:1.5;margin:0 0 14px;">${period}${biz}</p>` : `<div style="height:8px;"></div>`}
    ${opts.summary ? `<p style="font-size:14px;color:${c.text};line-height:1.55;margin:0 0 18px;">${escapeHtml(opts.summary)}</p>` : ""}
  `;
}

/* ─── KPI grid (2×2 mathematically consistent) ─── */

export interface KpiTile {
  label: string;
  value: string;
  delta?: DeltaShape;
  accent?: boolean;          // primary KPI gets cyan value text
}

export function buildKpiGrid(tiles: KpiTile[]): string {
  if (!tiles.length) return "";
  const c = REPORT_COLORS;
  const DELTA_ROW = 18;

  const cell = (t: KpiTile | null) => {
    if (!t) return `<td valign="top" width="50%" style="padding:0 4px 8px;width:50%;"></td>`;
    return `
      <td valign="top" width="50%" style="padding:0 4px 8px;width:50%;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${c.cardSubtle};border:1px solid ${c.border};border-radius:12px;border-collapse:separate;">
          <tr>
            <td style="padding:11px 13px 0;font-size:10.5px;color:${c.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;line-height:1;">${escapeHtml(t.label)}</td>
          </tr>
          <tr>
            <td style="padding:6px 13px 0;font-size:22px;font-weight:800;color:${t.accent ? c.accent : c.bright};letter-spacing:-0.02em;line-height:1.05;">${t.value}</td>
          </tr>
          <tr>
            <td height="${DELTA_ROW}" style="padding:4px 13px 11px;height:${DELTA_ROW}px;line-height:${DELTA_ROW}px;">${t.delta ? renderDeltaBadge(t.delta) : "&nbsp;"}</td>
          </tr>
        </table>
      </td>`;
  };

  // Pad to even number for 2-column grid
  const padded = tiles.length % 2 === 0 ? tiles : [...tiles, null as any];
  const rows: string[] = [];
  for (let i = 0; i < padded.length; i += 2) {
    rows.push(`<tr>${cell(padded[i])}${cell(padded[i + 1] ?? null)}</tr>`);
  }

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 14px;border-collapse:separate;border-spacing:0;table-layout:fixed;">
      ${rows.join("")}
    </table>`;
}

function renderDeltaBadge(d: DeltaShape): string {
  if (!d.shown) return "&nbsp;";
  const c = REPORT_COLORS;
  const arrow = d.rose ? "↑" : "↓";
  const word = d.rose ? "higher" : "lower";
  const color = d.good ? c.positive : c.negative;
  return `<span style="font-size:11px;font-weight:700;color:${color};white-space:nowrap;letter-spacing:0;">${arrow} ${escapeHtml(d.pctText)} ${word}</span>`;
}

/* ─── Integrated chart embed (alpha-faded PNG; sits inside hero card) ─── */

export function buildIntegratedChart(opts: {
  chartUrl: string;
  alt: string;
  width?: number;     // intrinsic width attribute (default 600)
  height?: number;    // intrinsic height attribute (default 280)
}): string {
  const w = opts.width || 600;
  const h = opts.height || 280;
  return `
    <div style="margin:6px -24px 14px;">
      <img src="${opts.chartUrl}" alt="${escapeHtml(opts.alt)}" width="${w}" height="${h}" style="display:block;width:100%;max-width:none;height:auto;border:0;outline:none;text-decoration:none;" />
    </div>`;
}

/* ─── Numeric chart fallback (always renders, even when image is blocked) ─── */

export interface ChartFallbackOpts {
  /** e.g. "What the chart shows" */
  title?: string;
  cells: Array<{ label: string; value: string; emphasis?: boolean }>;
}

export function buildChartFallback(opts: ChartFallbackOpts): string {
  if (!opts.cells.length) return "";
  const c = REPORT_COLORS;
  const title = opts.title || "What the chart shows";

  const cellHtml = opts.cells.map((cell, i, arr) => `
    <td valign="top" style="padding-${i === 0 ? "right" : "left"}:12px;${i > 0 ? `border-left:1px solid ${c.border};` : ""}">
      <div style="font-size:11px;color:${c.muted};margin:0 0 2px;">${escapeHtml(cell.label)}</div>
      <div style="font-size:14px;font-weight:700;color:${cell.emphasis ? c.accent : c.bright};">${cell.value}</div>
    </td>`).join("");

  return `
    <div style="background:${c.cardSubtle};border:1px solid ${c.border};border-radius:12px;padding:14px 18px;margin:0 0 22px;">
      <p style="font-size:10.5px;color:${c.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin:0 0 10px;">${escapeHtml(title)}</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr>${cellHtml}</tr></table>
    </div>`;
}

/* ─── Recommendations panel ─── */

export function buildRecommendations(opts: { title?: string; items: string[] }): string {
  if (!opts.items?.length) return "";
  const c = REPORT_COLORS;
  const title = opts.title || "What we're doing next month";
  return `
    <div style="background:rgba(102,232,250,0.04);border:1px solid rgba(102,232,250,0.18);border-radius:12px;padding:18px 20px;margin:0 0 22px;">
      <p style="font-size:10.5px;color:${c.accent};text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin:0 0 10px;">${escapeHtml(title)}</p>
      ${opts.items.slice(0, 4).map(it => `
        <p style="font-size:13px;color:${c.text};line-height:1.55;margin:0 0 6px;padding-left:14px;position:relative;">
          <span style="color:${c.accent};position:absolute;left:0;top:0;font-weight:700;">›</span>${escapeHtml(it)}
        </p>
      `).join("")}
    </div>`;
}

/* ─── Section block (generic title + content) ─── */

export function buildSection(opts: { title: string; content: string }): string {
  if (!opts.content) return "";
  const c = REPORT_COLORS;
  return `
    <div style="margin:0 0 22px;">
      <p style="font-size:10.5px;color:${c.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin:0 0 10px;">${escapeHtml(opts.title)}</p>
      ${opts.content}
    </div>`;
}

/* ─── Activity list (bullet list, dark-card style) ─── */

export function buildActivityList(items: string[]): string {
  if (!items?.length) return "";
  const c = REPORT_COLORS;
  return `
    <div style="background:${c.cardSubtle};border:1px solid ${c.border};border-radius:10px;padding:14px 18px;">
      ${items.slice(0, 8).map(it => `
        <p style="font-size:13px;color:${c.text};line-height:1.55;margin:0 0 4px;padding-left:14px;position:relative;">
          <span style="color:${c.accent};position:absolute;left:0;top:0;font-weight:700;">✓</span>${escapeHtml(it)}
        </p>
      `).join("")}
    </div>`;
}

/* ─── Profile / status checklist ─── */

export function buildChecklist(items: Array<{ label: string; ok: boolean; detail?: string }>): string {
  if (!items?.length) return "";
  const c = REPORT_COLORS;
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 4px;">
      ${items.map(it => `
        <tr>
          <td style="padding:5px 0;font-size:13px;color:${it.ok ? c.text : c.faint};line-height:1.5;">
            <span style="color:${it.ok ? c.positive : c.tiny};font-weight:700;margin-right:8px;">${it.ok ? "&#10003;" : "○"}</span>${escapeHtml(it.label)}${it.detail ? ` <span style="color:${c.muted};font-size:11px;">(${escapeHtml(it.detail)})</span>` : ""}
          </td>
        </tr>
      `).join("")}
    </table>`;
}

/* ─── CTA button ─── */

export function buildCtaButton(opts: { href: string; label: string }): string {
  const c = REPORT_COLORS;
  return `
    <div style="text-align:center;margin:8px 0 4px;">
      <a href="${opts.href}" style="display:inline-block;background:${c.accent};color:${c.bg};font-size:14px;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;letter-spacing:-0.01em;">${escapeHtml(opts.label)} &rarr;</a>
    </div>`;
}

/* ─── Metric glossary ("What these numbers mean") ─── */

export interface MetricDef {
  name: string;
  def: string;
}

const METRIC_DEFS: Record<string, string> = {
  "CTR": "Click-through rate. Of people who saw your ad, the percentage who clicked.",
  "Click-through": "Of people who saw your ad, the percentage who clicked.",
  "Impressions": "Number of times your ad or listing was shown.",
  "Cost / Lead": "Total ad spend divided by leads generated. Lower is better.",
  "Cost per click": "Average amount you paid each time someone clicked your ad.",
  "Conversions": "Visitors who completed the goal action (form fill, call, booking).",
  "Visibility Score": "0-100 score covering profile completeness, photos, posts, ratings, and review responsiveness.",
  "Local Pack": "The 3 map results Google shows for searches like \"plumber near me\". Top placement = more calls.",
  "Map Pack": "The 3 map results Google shows for searches like \"plumber near me\". Top placement = more calls.",
  "Rating": "Your average star rating across all tracked review platforms.",
  "Reviews": "Total reviews written about your business, all sources combined.",
  "Reviews awaiting reply": "Reviews you haven't responded to yet. Replying within 48 hours raises your rank.",
  "Map Pack keywords": "How many tracked search terms place you in the top-3 map results.",
  "Scans": "How many times we ran a fresh check on your profile this period.",
  "Total spend": "All money paid to ad platforms (Google, Meta, etc.) for this period.",
  "Leads": "Calls, form fills, and chats your campaign generated this period.",
};

/**
 * Render a small "what these numbers mean" panel at the bottom of the
 * report. Pass in the metric labels you used in the KPI grid; the
 * helper will look up known definitions and skip unknown ones silently.
 *
 * `customDefs` lets a caller add product-specific metrics not in the
 * shared dictionary.
 */
export function buildMetricGlossary(opts: {
  metrics: string[];
  customDefs?: Record<string, string>;
}): string {
  const defs = { ...METRIC_DEFS, ...(opts.customDefs || {}) };
  const items: MetricDef[] = [];
  const seen = new Set<string>();
  for (const name of opts.metrics) {
    if (seen.has(name)) continue;
    if (defs[name]) {
      items.push({ name, def: defs[name] });
      seen.add(name);
    }
  }
  if (!items.length) return "";

  const c = REPORT_COLORS;
  return `
    <div style="background:${c.cardSubtle};border:1px solid ${c.border};border-radius:12px;padding:16px 18px;margin:18px 0 0;">
      <p style="font-size:10.5px;color:${c.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin:0 0 10px;">What these mean</p>
      ${items.map(it => `
        <p style="font-size:12px;color:${c.text};line-height:1.55;margin:0 0 6px;">
          <strong style="color:${c.bright};font-weight:600;">${escapeHtml(it.name)}.</strong> <span style="color:${c.muted};">${escapeHtml(it.def)}</span>
        </p>
      `).join("")}
    </div>`;
}

/* ─── Outer shell wrapper ─── */

export interface ReportShellOpts {
  product: string;            // "AdFlow Report", "MapGuard Report"
  badge?: HeaderBadge;
  /** The composed body HTML (hero + KPIs + chart + sections + CTA + glossary) */
  body: string;
  /** Recipient email for unsubscribe link in footer */
  recipientEmail: string;
}

/**
 * Wrap a composed body with the email-safe shell: outer dark background,
 * report header with badge, inner card containing the body, chat bubble,
 * footer.
 */
export function buildReportShell(opts: ReportShellOpts): string {
  const c = REPORT_COLORS;
  return `
    <div style="font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:${c.bg};padding:40px 16px;">
      <div style="max-width:600px;margin:0 auto;">
        ${buildReportHeader({ product: opts.product, badge: opts.badge })}
        <div style="background:${c.card};border:1px solid ${c.border};border-radius:16px;padding:32px 24px;">
          ${opts.body}
        </div>
        ${buildChatBubble()}
        ${buildLegalFooter({ recipientEmail: opts.recipientEmail, marketing: true })}
      </div>
    </div>`;
}

/* ─── Helpers ─── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// Re-export so callers needing direct access don't have to import twice
export { buildEmailHeader, buildLegalFooter, buildChatBubble };
