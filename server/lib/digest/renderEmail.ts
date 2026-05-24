/**
 * Daily monitoring digest — HTML + plain-text renderers.
 *
 * Self-contained inline-styled HTML (no external CSS, no <link>) so it
 * survives every email client. Brand tokens are inlined here rather than
 * pulled from the shared theme because email clients ignore CSS vars.
 *
 * Brand palette (kept in sync with DESIGN-SYSTEM.md):
 *   - brand-blue:   #0d3cfc
 *   - brand-black:  #0F141A
 *   - text-light:   #F0F0F0
 *   - text-muted:   #8B919A
 */

import type {
  ActivitySection,
  BingSection,
  DigestData,
  Ga4Section,
  GscSection,
  HealthzSection,
  Unavailable,
} from "./buildDigest";

const BRAND_BLUE = "#0d3cfc";
const BRAND_BLACK = "#0F141A";
const TEXT_LIGHT = "#F0F0F0";
const TEXT_MUTED = "#8B919A";
const SURFACE = "#161B22";
const DIVIDER = "rgba(255,255,255,0.06)";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function deltaBadge(n: number, suffix = ""): string {
  if (n === 0) return `<span style="color:${TEXT_MUTED};">±0${suffix}</span>`;
  const color = n > 0 ? "#3ddc91" : "#ff6b6b";
  const sign = n > 0 ? "+" : "";
  return `<span style="color:${color};font-weight:600;">${sign}${n}${suffix}</span>`;
}

function isAvailable<T extends { available: true } | Unavailable>(s: T): s is Exclude<T, Unavailable> {
  return s.available === true;
}

// ─── Section renderers (HTML) ───────────────────────────────────────────

function renderUnavailable(title: string, reason: string): string {
  return `
    <tr><td style="padding:14px 18px;border-bottom:1px solid ${DIVIDER};">
      <div style="font-size:13px;color:${TEXT_LIGHT};font-weight:600;">${esc(title)}</div>
      <div style="font-size:12px;color:${TEXT_MUTED};margin-top:4px;">Not configured: ${esc(reason)}</div>
    </td></tr>
  `;
}

function renderGsc(s: GscSection | Unavailable): string {
  if (!isAvailable(s)) return renderUnavailable("Search Console", s.reason);
  const queryRows = s.topQueries.length
    ? s.topQueries
        .map(
          (q) => `
        <li style="margin:2px 0;font-size:12px;color:${TEXT_LIGHT};">
          <span style="color:${TEXT_MUTED};">${esc(q.impressions)} impr · ${esc(q.clicks)} clk —</span>
          ${esc(q.query || "(empty)")}
        </li>`,
        )
        .join("")
    : `<li style="font-size:12px;color:${TEXT_MUTED};">no queries</li>`;

  return `
    <tr><td style="padding:14px 18px;border-bottom:1px solid ${DIVIDER};">
      <div style="font-size:13px;color:${TEXT_LIGHT};font-weight:600;">Search Console (yesterday)</div>
      <div style="font-size:13px;color:${TEXT_LIGHT};margin-top:6px;">
        ${esc(s.totals.impressions)} impressions ${deltaBadge(s.totalsDelta.impressions)} ·
        ${esc(s.totals.clicks)} clicks ${deltaBadge(s.totalsDelta.clicks)}
      </div>
      <div style="font-size:11px;color:${TEXT_MUTED};margin-top:8px;text-transform:uppercase;letter-spacing:0.04em;">Top 5 queries</div>
      <ul style="margin:6px 0 0;padding-left:16px;">${queryRows}</ul>
    </td></tr>
  `;
}

function renderBing(s: BingSection | Unavailable): string {
  if (!isAvailable(s)) return renderUnavailable("Bing Webmaster", s.reason);
  const crawl = s.lastSitemapCrawl
    ? new Date(s.lastSitemapCrawl).toISOString().slice(0, 10)
    : "never";
  const quotaColor = s.dailyQuotaPercent < 20 ? "#ff6b6b" : TEXT_LIGHT;
  return `
    <tr><td style="padding:14px 18px;border-bottom:1px solid ${DIVIDER};">
      <div style="font-size:13px;color:${TEXT_LIGHT};font-weight:600;">Bing Webmaster</div>
      <div style="font-size:13px;color:${quotaColor};margin-top:6px;">
        URL quota remaining: ${esc(s.dailyRemaining)}/day · ${esc(s.monthlyRemaining)}/month
        <span style="color:${TEXT_MUTED};">(${esc(s.dailyQuotaPercent)}% of daily)</span>
      </div>
      <div style="font-size:12px;color:${TEXT_MUTED};margin-top:4px;">
        Last sitemap crawl: ${esc(crawl)} · ${esc(s.feedCount)} feed(s) registered
      </div>
    </td></tr>
  `;
}

function renderGa4(s: Ga4Section | Unavailable): string {
  if (!isAvailable(s)) return renderUnavailable("GA4", s.reason);
  const pages = s.topPages.length
    ? s.topPages
        .map(
          (p) => `
        <li style="margin:2px 0;font-size:12px;color:${TEXT_LIGHT};">
          <span style="color:${TEXT_MUTED};">${esc(p.sessions)} sess —</span> ${esc(p.path)}
        </li>`,
        )
        .join("")
    : `<li style="font-size:12px;color:${TEXT_MUTED};">no pages</li>`;

  const conv = s.conversions;
  return `
    <tr><td style="padding:14px 18px;border-bottom:1px solid ${DIVIDER};">
      <div style="font-size:13px;color:${TEXT_LIGHT};font-weight:600;">GA4 (yesterday)</div>
      <div style="font-size:13px;color:${TEXT_LIGHT};margin-top:6px;">
        ${esc(s.sessionsYesterday)} sessions ${deltaBadge(s.sessionsDeltaPct, "%")}
        <span style="color:${TEXT_MUTED};">(prior ${esc(s.sessionsPrior)})</span>
      </div>
      <div style="font-size:12px;color:${TEXT_MUTED};margin-top:6px;">
        Conversions — quote: ${esc(conv.quote_completed)} · audit: ${esc(conv.audit_completed)} · purchase: ${esc(conv.purchase_completed)}
      </div>
      <div style="font-size:11px;color:${TEXT_MUTED};margin-top:8px;text-transform:uppercase;letter-spacing:0.04em;">Top 5 pages</div>
      <ul style="margin:6px 0 0;padding-left:16px;">${pages}</ul>
    </td></tr>
  `;
}

function renderHealthz(s: HealthzSection | Unavailable): string {
  if (!isAvailable(s)) return renderUnavailable("Healthz", s.reason);
  const color = s.status === "ok" ? "#3ddc91" : s.status === "degraded" ? "#ffb547" : "#ff6b6b";
  const failing = s.failingProbes.length
    ? `<div style="font-size:12px;color:#ff6b6b;margin-top:4px;">Failing: ${esc(s.failingProbes.join(", "))}</div>`
    : `<div style="font-size:12px;color:${TEXT_MUTED};margin-top:4px;">All ${esc(s.probeCount)} probes ok</div>`;
  return `
    <tr><td style="padding:14px 18px;border-bottom:1px solid ${DIVIDER};">
      <div style="font-size:13px;color:${TEXT_LIGHT};font-weight:600;">Healthz</div>
      <div style="font-size:13px;color:${color};font-weight:600;margin-top:6px;">${esc(s.status.toUpperCase())}</div>
      ${failing}
      <div style="font-size:11px;color:${TEXT_MUTED};margin-top:4px;">version: ${esc(s.version)}</div>
    </td></tr>
  `;
}

function renderActivity(s: ActivitySection | Unavailable): string {
  if (!isAvailable(s)) return renderUnavailable("Activity", s.reason);
  const audit = s.topAuditActions.length
    ? s.topAuditActions
        .map(
          (a) => `
        <li style="margin:2px 0;font-size:12px;color:${TEXT_LIGHT};">
          <span style="color:${TEXT_MUTED};">${esc(a.count)} ×</span>
          ${esc(a.action)} on ${esc(a.entity_type)}
        </li>`,
        )
        .join("")
    : `<li style="font-size:12px;color:${TEXT_MUTED};">no audit-log activity</li>`;
  return `
    <tr><td style="padding:14px 18px;border-bottom:1px solid ${DIVIDER};">
      <div style="font-size:13px;color:${TEXT_LIGHT};font-weight:600;">Activity (yesterday)</div>
      <div style="font-size:13px;color:${TEXT_LIGHT};margin-top:6px;">
        ${esc(s.newClients)} new client(s) · ${esc(s.newLeads)} new lead(s)
      </div>
      <div style="font-size:11px;color:${TEXT_MUTED};margin-top:8px;text-transform:uppercase;letter-spacing:0.04em;">Top 3 audit actions</div>
      <ul style="margin:6px 0 0;padding-left:16px;">${audit}</ul>
    </td></tr>
  `;
}

function renderActionItems(items: string[]): string {
  if (items.length === 0) {
    return `
      <div style="margin:18px 0;padding:14px 16px;background:${SURFACE};border-left:2px solid #3ddc91;border-radius:8px;font-size:13px;color:${TEXT_LIGHT};">
        No action items — everything green.
      </div>`;
  }
  const lis = items.map((i) => `<li style="margin:4px 0;color:${TEXT_LIGHT};">${esc(i)}</li>`).join("");
  return `
    <div style="margin:18px 0;padding:14px 16px;background:${SURFACE};border-left:2px solid #ff6b6b;border-radius:8px;">
      <div style="font-size:11px;color:#ff6b6b;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Action items</div>
      <ul style="margin:0;padding-left:18px;font-size:13px;">${lis}</ul>
    </div>`;
}

// ─── Public entry ───────────────────────────────────────────────────────

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

export function renderDigestEmail(d: DigestData): RenderedDigest {
  const date = d.yesterday.label;
  const subject = `WeFixTrades daily digest — ${date}`;

  const sectionsHtml =
    renderHealthz(d.healthz) +
    renderActivity(d.activity) +
    renderGsc(d.gsc) +
    renderBing(d.bing) +
    renderGa4(d.ga4);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND_BLACK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BLACK};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding:0 0 14px;">
          <div style="font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.1em;">Daily monitoring digest</div>
          <div style="font-size:22px;color:${TEXT_LIGHT};font-weight:700;margin-top:4px;">
            <span style="color:${BRAND_BLUE};">WeFixTrades</span> · ${esc(date)}
          </div>
          <div style="font-size:12px;color:${TEXT_MUTED};margin-top:4px;">
            Generated ${esc(d.generatedAt.toISOString())}
          </div>
        </td></tr>

        ${renderActionItems(d.actionItems)}

        <tr><td style="background:${SURFACE};border:1px solid ${DIVIDER};border-radius:12px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tbody>${sectionsHtml}</tbody>
          </table>
        </td></tr>

        <tr><td style="padding:18px 4px;font-size:11px;color:${TEXT_MUTED};line-height:1.6;">
          Automated digest from server/cron/dailyDigest.ts. Sources degrade independently —
          a "Not configured" section means that integration's credentials aren't wired in
          the current environment.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = renderText(d);

  return { subject, html, text };
}

function renderText(d: DigestData): string {
  const lines: string[] = [];
  lines.push(`WeFixTrades daily digest — ${d.yesterday.label}`);
  lines.push(`Generated ${d.generatedAt.toISOString()}`);
  lines.push("");

  if (d.actionItems.length) {
    lines.push("ACTION ITEMS:");
    for (const i of d.actionItems) lines.push(`  - ${i}`);
  } else {
    lines.push("ACTION ITEMS: none — all green.");
  }
  lines.push("");

  // Healthz
  if (isAvailable(d.healthz)) {
    lines.push(`HEALTHZ: ${d.healthz.status.toUpperCase()} (v${d.healthz.version})`);
    if (d.healthz.failingProbes.length) {
      lines.push(`  Failing: ${d.healthz.failingProbes.join(", ")}`);
    } else {
      lines.push(`  All ${d.healthz.probeCount} probes ok`);
    }
  } else {
    lines.push(`HEALTHZ: not available — ${d.healthz.reason}`);
  }
  lines.push("");

  // Activity
  if (isAvailable(d.activity)) {
    lines.push(`ACTIVITY (yesterday):`);
    lines.push(`  New clients: ${d.activity.newClients}`);
    lines.push(`  New leads:   ${d.activity.newLeads}`);
    if (d.activity.topAuditActions.length) {
      lines.push(`  Top audit actions:`);
      for (const a of d.activity.topAuditActions) {
        lines.push(`    ${a.count}× ${a.action} on ${a.entity_type}`);
      }
    }
  } else {
    lines.push(`ACTIVITY: not available — ${d.activity.reason}`);
  }
  lines.push("");

  // GSC
  if (isAvailable(d.gsc)) {
    lines.push(`SEARCH CONSOLE (yesterday):`);
    lines.push(
      `  ${d.gsc.totals.impressions} impressions (Δ ${d.gsc.totalsDelta.impressions}) · ${d.gsc.totals.clicks} clicks (Δ ${d.gsc.totalsDelta.clicks})`,
    );
    if (d.gsc.topQueries.length) {
      lines.push(`  Top 5 queries:`);
      for (const q of d.gsc.topQueries) {
        lines.push(`    ${q.impressions} impr / ${q.clicks} clk — ${q.query}`);
      }
    }
  } else {
    lines.push(`SEARCH CONSOLE: not available — ${d.gsc.reason}`);
  }
  lines.push("");

  // Bing
  if (isAvailable(d.bing)) {
    lines.push(`BING WEBMASTER:`);
    lines.push(
      `  URL quota remaining: ${d.bing.dailyRemaining}/day, ${d.bing.monthlyRemaining}/month (${d.bing.dailyQuotaPercent}%)`,
    );
    lines.push(
      `  Last sitemap crawl: ${d.bing.lastSitemapCrawl ? new Date(d.bing.lastSitemapCrawl).toISOString().slice(0, 10) : "never"} · ${d.bing.feedCount} feed(s)`,
    );
  } else {
    lines.push(`BING WEBMASTER: not available — ${d.bing.reason}`);
  }
  lines.push("");

  // GA4
  if (isAvailable(d.ga4)) {
    lines.push(`GA4 (yesterday):`);
    lines.push(
      `  ${d.ga4.sessionsYesterday} sessions (${d.ga4.sessionsDeltaPct}% vs ${d.ga4.sessionsPrior} prior)`,
    );
    lines.push(
      `  Conversions — quote_completed: ${d.ga4.conversions.quote_completed}, audit_completed: ${d.ga4.conversions.audit_completed}, purchase_completed: ${d.ga4.conversions.purchase_completed}`,
    );
    if (d.ga4.topPages.length) {
      lines.push(`  Top 5 pages:`);
      for (const p of d.ga4.topPages) {
        lines.push(`    ${p.sessions} sess — ${p.path}`);
      }
    }
  } else {
    lines.push(`GA4: not available — ${d.ga4.reason}`);
  }

  return lines.join("\n");
}
