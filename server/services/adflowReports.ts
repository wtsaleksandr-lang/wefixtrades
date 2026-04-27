/**
 * AdFlow monthly performance report — premium edition.
 *
 * Compiles a one-page summary of the client's AdFlow campaign for the
 * prior month and emails it to the customer. Optimized for visual impact,
 * trust, clear ROI, and perceived monthly activity.
 *
 * Data sources (read from client_service.metadata.latest_report):
 *   Required (current shape — backwards-compatible):
 *     impressions, clicks, conversions, cost_spent_cents, cpc_cents,
 *     ctr_pct, leads_generated, top_creative, notes,
 *     period_start, period_end
 *   Optional (premium fields — render only if present):
 *     daily_breakdown:    Array<{ date, leads, cost_cents }>  → drives chart
 *     prior_period:       { leads_generated, cost_spent_cents, ctr_pct,
 *                           cpc_cents }                       → MoM deltas
 *     creatives:          Array<{ name, spend_cents, leads, ctr_pct }>
 *     recommendations:    string[]                            → "what's next"
 *
 * If the optional fields are missing, the email gracefully falls back to
 * the existing simple metric layout — no breakage. Suppliers can populate
 * the richer fields over time without a flag flip.
 *
 * Idempotent per period via client_service.metadata.last_report_period.
 */

import { db } from "../db";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { buildLegalFooter, buildEmailHeader, buildChatBubble } from "../lib/emailFooter";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";
import { generateLineChart } from "./emailCharts";
import { chat } from "./aiService";

/* ─── Public types ─── */

export interface AdFlowDailyPoint {
  date: string;          // ISO date, e.g. "2026-04-15"
  leads: number;
  cost_cents?: number;
  impressions?: number;
  clicks?: number;
}

export interface AdFlowCreative {
  name: string;
  spend_cents?: number;
  leads?: number;
  ctr_pct?: number;
}

export interface AdFlowPriorPeriod {
  leads_generated?: number;
  cost_spent_cents?: number;
  ctr_pct?: number;
  cpc_cents?: number;
}

export interface AdFlowReportMetrics {
  impressions?: number;
  clicks?: number;
  conversions?: number;
  cost_spent_cents?: number;
  cpc_cents?: number;
  ctr_pct?: number;
  leads_generated?: number;
  top_creative?: string;
  notes?: string;
  period_start?: string;
  period_end?: string;

  // Premium fields — all optional
  daily_breakdown?: AdFlowDailyPoint[];
  prior_period?: AdFlowPriorPeriod;
  creatives?: AdFlowCreative[];
  recommendations?: string[];
}

export interface CompileResult {
  sent: boolean;
  reason?: string;
  period?: string;
}

/* ─── Formatters ─── */

function formatUsd(cents?: number): string {
  if (cents == null) return "—";
  if (cents >= 100_000) return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatInt(n?: number): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function formatPct(n?: number): string {
  if (n == null) return "—";
  return `${n.toFixed(2)}%`;
}

/* ─── Delta logic ─── */

interface Delta {
  /** Whether to render the badge at all (false for missing or near-flat data). */
  shown: boolean;
  /** Bare percentage like "32%" — no sign, no arrow. */
  pctText: string;
  /** True if the value went up (regardless of whether up is good). */
  rose: boolean;
  /** True if the change is in the "good" direction for this metric. */
  good: boolean;
}

function pctDelta(curr?: number, prev?: number, opts: { higherIsBetter?: boolean } = {}): Delta {
  if (curr == null || prev == null || prev === 0) {
    return { shown: false, pctText: "", rose: false, good: true };
  }
  const change = ((curr - prev) / prev) * 100;
  if (Math.abs(change) < 1) {
    // Near-flat: don't render a noisy badge
    return { shown: false, pctText: "", rose: false, good: true };
  }
  const rose = change > 0;
  const good = (opts.higherIsBetter ?? true) ? rose : !rose;
  return {
    shown: true,
    pctText: `${Math.round(Math.abs(change))}%`,
    rose,
    good,
  };
}

const COLORS = {
  bg: "#0B0F14",
  card: "#151A21",
  cardSubtle: "#0F141A",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.10)",
  bright: "#F0F0F0",
  text: "#CDD1D6",
  muted: "#8B919A",
  faint: "#555B63",
  accent: "#66E8FA",
  positive: "#22C55E",
  negative: "#EF4444",
  warn: "#F59E0B",
};

function deltaBadge(delta: Delta): string {
  if (!delta.shown) return "";
  // Arrow tracks the literal direction of the number; color encodes good/bad.
  // For cost-per-lead: dropping is good → green ↓, rising is bad → red ↑.
  // For leads: rising is good → green ↑, dropping is bad → red ↓.
  const arrow = delta.rose ? "↑" : "↓";
  const word = delta.rose ? "higher" : "lower";
  const color = delta.good ? COLORS.positive : COLORS.negative;
  return `<span style="font-size:11px;font-weight:700;color:${color};white-space:nowrap;letter-spacing:0;">${arrow} ${delta.pctText} ${word}</span>`;
}

/* ─── AI plain-English summary ─── */

async function writeSummary(
  serviceName: string,
  metrics: AdFlowReportMetrics,
  period: string,
): Promise<string> {
  const hasData = metrics.impressions != null || metrics.leads_generated != null;
  if (!hasData) {
    return `Your ${serviceName} campaign is being monitored — our white-label partner is collecting performance data and will have your first full report in the next cycle.`;
  }

  try {
    const prompt = `You are a concise marketing analyst. Given the metrics below from a tradesperson's ad campaign for ${period}, write ONE paragraph (2-3 sentences, under 60 words) explaining in plain English how the campaign is performing. Be specific but not salesy. No bullet points, no "overall" intros.

Metrics:
${JSON.stringify(metrics, null, 2)}

Reply with the paragraph only. No preamble.`;
    const text = await chat({
      system: "You write short, plain-English marketing summaries for non-marketing readers.",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 200,
    });
    return text.trim() || "Campaign data collected — see metrics below.";
  } catch {
    const leads = metrics.leads_generated ?? 0;
    const spend = metrics.cost_spent_cents ? formatUsd(metrics.cost_spent_cents) : "—";
    if (leads > 0) {
      return `This month's campaign generated ${leads} lead${leads === 1 ? "" : "s"} on ${spend} spend. Metrics below show the full picture.`;
    }
    return `Campaign active for ${period}. Metrics below show reach and engagement — leads should follow as optimization continues.`;
  }
}

/* ─── HTML builder ─── */

interface BuildHtmlParams {
  contactName: string;
  serviceName: string;
  period: string;
  summary: string;
  metrics: AdFlowReportMetrics;
  chartUrl: string | null;
  portalUrl: string;
  recipientEmail: string;
}

function buildHtml(p: BuildHtmlParams): string {
  const m = p.metrics;
  const prior = m.prior_period;

  const leadsDelta = pctDelta(m.leads_generated, prior?.leads_generated, { higherIsBetter: true });
  const cplCurr = m.leads_generated && m.cost_spent_cents ? m.cost_spent_cents / m.leads_generated : undefined;
  const cplPrev = prior?.leads_generated && prior?.cost_spent_cents ? prior.cost_spent_cents / prior.leads_generated : undefined;
  const cplDelta = pctDelta(cplCurr, cplPrev, { higherIsBetter: false });
  const ctrDelta = pctDelta(m.ctr_pct, prior?.ctr_pct, { higherIsBetter: true });

  const heroHeadline = (() => {
    if (m.leads_generated == null) return `${p.serviceName} report`;
    const leadsPct = leadsDelta.shown ? parseInt(leadsDelta.pctText, 10) : 0;
    if (leadsDelta.shown && leadsDelta.rose && leadsPct >= 15) {
      return `Strong month — leads up ${leadsDelta.pctText}`;
    }
    if (leadsDelta.shown && !leadsDelta.rose && leadsPct >= 15) {
      return `Adjusting course this month`;
    }
    return `${m.leads_generated} new lead${m.leads_generated === 1 ? "" : "s"} this month`;
  })();

  /* Stat tiles — mathematically consistent 2×2 grid.
     Each tile is a 3-row table (label / value / delta), so every card
     has identical width, padding, label position, value baseline, and
     a reserved delta row even when no delta exists. Delta row renders
     a non-breaking space when empty so the cell still occupies space
     and all 4 tiles end at the same Y coordinate. */
  const DELTA_ROW_HEIGHT = 18;
  const statTile = (label: string, value: string, delta?: Delta, accent = false) => `
    <td valign="top" width="50%" style="padding:0 4px 8px;width:50%;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${COLORS.cardSubtle};border:1px solid ${COLORS.border};border-radius:12px;border-collapse:separate;">
        <tr>
          <td style="padding:11px 13px 0;font-size:10.5px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;line-height:1;">${label}</td>
        </tr>
        <tr>
          <td style="padding:6px 13px 0;font-size:22px;font-weight:800;color:${accent ? COLORS.accent : COLORS.bright};letter-spacing:-0.02em;line-height:1.05;">${value}</td>
        </tr>
        <tr>
          <td height="${DELTA_ROW_HEIGHT}" style="padding:4px 13px 11px;height:${DELTA_ROW_HEIGHT}px;line-height:${DELTA_ROW_HEIGHT}px;">${delta && delta.shown ? deltaBadge(delta) : "&nbsp;"}</td>
        </tr>
      </table>
    </td>`;

  const statsGrid = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 14px;border-collapse:separate;border-spacing:0;table-layout:fixed;">
      <tr>
        ${statTile("Leads", formatInt(m.leads_generated), leadsDelta, true)}
        ${statTile("Cost / Lead", cplCurr != null ? formatUsd(Math.round(cplCurr)) : "—", cplDelta)}
      </tr>
      <tr>
        ${statTile("Click-through", formatPct(m.ctr_pct), ctrDelta)}
        ${statTile("Total spend", formatUsd(m.cost_spent_cents))}
      </tr>
    </table>`;

  /* Chart + numeric fallback (the fallback ALWAYS renders) */
  const peakDay = m.daily_breakdown && m.daily_breakdown.length > 0
    ? m.daily_breakdown.reduce((best, d) => (d.leads > best.leads ? d : best), m.daily_breakdown[0])
    : null;
  const totalDays = m.daily_breakdown?.length ?? 0;
  const avgPerDay = totalDays > 0 && m.leads_generated != null
    ? (m.leads_generated / totalDays).toFixed(1)
    : null;
  const peakDate = peakDay
    ? new Date(peakDay.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  // Full-bleed chart — extends to the card's interior edges via negative
  // margins. The PNG itself is rendered wider than the visible area with
  // generous internal padding, so the line trails into dim negative space
  // at left/right rather than terminating at a hard endpoint. Background
  // matches the card so the chart reads as a dashboard backdrop, not an
  // inserted image.
  const chartBlock = p.chartUrl ? `
    <div style="margin:6px -24px 14px;">
      <img src="${p.chartUrl}" alt="Daily leads trend, ${p.period}" width="600" height="280" style="display:block;width:100%;max-width:none;height:auto;border:0;outline:none;text-decoration:none;" />
    </div>` : "";

  const numericFallback = (peakDay || avgPerDay) ? `
    <div style="background:${COLORS.cardSubtle};border:1px solid ${COLORS.border};border-radius:12px;padding:14px 18px;margin:0 0 22px;">
      <p style="font-size:10.5px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin:0 0 10px;">What the chart shows</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          ${peakDate ? `
          <td valign="top" style="padding-right:12px;">
            <div style="font-size:11px;color:${COLORS.muted};margin:0 0 2px;">Peak day</div>
            <div style="font-size:14px;font-weight:700;color:${COLORS.bright};">${peakDate} <span style="color:${COLORS.accent};">· ${peakDay!.leads} leads</span></div>
          </td>` : ""}
          ${avgPerDay ? `
          <td valign="top" style="padding-left:${peakDate ? "12px" : "0"};border-left:${peakDate ? `1px solid ${COLORS.border}` : "none"};">
            <div style="font-size:11px;color:${COLORS.muted};margin:0 0 2px;">Daily average</div>
            <div style="font-size:14px;font-weight:700;color:${COLORS.bright};">${avgPerDay} leads / day</div>
          </td>` : ""}
        </tr>
      </table>
    </div>` : "";

  /* Top creative block */
  const topCreatives = m.creatives && m.creatives.length > 0
    ? m.creatives.slice(0, 3)
    : (m.top_creative ? [{ name: m.top_creative }] : []);

  const creativesBlock = topCreatives.length > 0 ? `
    <div style="margin:0 0 22px;">
      <p style="font-size:10.5px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin:0 0 10px;">Top performers</p>
      ${topCreatives.map((c, i) => `
        <div style="background:${COLORS.cardSubtle};border:1px solid ${COLORS.border};border-radius:10px;padding:12px 14px;margin:0 0 6px;">
          <div style="font-size:13px;font-weight:600;color:${COLORS.bright};line-height:1.4;">${i === 0 ? `<span style="color:${COLORS.accent};margin-right:6px;">★</span>` : ""}${c.name}</div>
          ${(c.leads != null || c.spend_cents != null || c.ctr_pct != null) ? `
          <div style="font-size:11px;color:${COLORS.muted};margin-top:3px;line-height:1.5;">
            ${[
              c.leads != null ? `${c.leads} lead${c.leads === 1 ? "" : "s"}` : null,
              c.spend_cents != null ? formatUsd(c.spend_cents) : null,
              c.ctr_pct != null ? `${c.ctr_pct.toFixed(2)}% CTR` : null,
            ].filter(Boolean).join(" · ")}
          </div>` : ""}
        </div>
      `).join("")}
    </div>` : "";

  /* Recommendations */
  const recsBlock = (m.recommendations && m.recommendations.length > 0) ? `
    <div style="background:rgba(102,232,250,0.04);border:1px solid rgba(102,232,250,0.18);border-radius:12px;padding:18px 20px;margin:0 0 24px;">
      <p style="font-size:10.5px;color:${COLORS.accent};text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin:0 0 10px;">What we're doing next month</p>
      ${m.recommendations.slice(0, 3).map(r => `
        <p style="font-size:13px;color:${COLORS.text};line-height:1.55;margin:0 0 6px;padding-left:14px;position:relative;">
          <span style="color:${COLORS.accent};position:absolute;left:0;top:0;font-weight:700;">›</span>${r}
        </p>
      `).join("")}
    </div>` : "";

  /* Notes from team (legacy) */
  const notesBlock = m.notes ? `
    <div style="background:${COLORS.cardSubtle};border:1px solid ${COLORS.border};border-radius:10px;padding:14px 16px;margin:0 0 22px;">
      <p style="font-size:10.5px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin:0 0 6px;">Notes from the team</p>
      <p style="font-size:13px;color:${COLORS.text};line-height:1.55;margin:0;">${m.notes}</p>
    </div>` : "";

  return `
    <div style="font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;background:${COLORS.bg};padding:40px 16px;">
      <div style="max-width:600px;margin:0 auto;">
        ${buildEmailHeader({ tagline: `${p.serviceName} · ${p.period}` })}

        <div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;padding:32px 24px;">

          <p style="font-size:11px;font-weight:700;color:${COLORS.accent};text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">Monthly performance</p>
          <h1 style="font-size:26px;font-weight:800;color:${COLORS.bright};margin:0 0 10px;line-height:1.18;letter-spacing:-0.02em;">${heroHeadline}</h1>
          <p style="font-size:14px;color:${COLORS.text};line-height:1.55;margin:0 0 18px;">${p.summary}</p>

          ${statsGrid}

          ${chartBlock}
          ${numericFallback}

          ${creativesBlock}
          ${recsBlock}
          ${notesBlock}

          <div style="text-align:center;margin:8px 0 4px;">
            <a href="${p.portalUrl}" style="display:inline-block;background:${COLORS.accent};color:${COLORS.bg};font-size:14px;font-weight:700;padding:13px 26px;border-radius:10px;text-decoration:none;letter-spacing:-0.01em;">View full campaign dashboard &rarr;</a>
          </div>
        </div>

        ${buildChatBubble()}
        ${buildLegalFooter({ recipientEmail: p.recipientEmail, marketing: true })}
      </div>
    </div>`;
}

/* ─── Period label ─── */

function formatPeriod(start?: string, end?: string): string {
  if (!start) {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return prev.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return new Date(start).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/* ─── Chart spec from daily_breakdown ─── */

async function tryGenerateChart(
  clientServiceId: number,
  metrics: AdFlowReportMetrics,
  periodStart?: string,
): Promise<string | null> {
  if (!metrics.daily_breakdown || metrics.daily_breakdown.length < 2) return null;

  const periodKey = periodStart
    ? new Date(periodStart).toISOString().slice(0, 7)
    : new Date().toISOString().slice(0, 7);

  const points = metrics.daily_breakdown;
  // Show only every Nth date label so the x-axis isn't crowded
  const stride = Math.max(1, Math.floor(points.length / 8));
  const labels = points.map((p, i) =>
    i % stride === 0
      ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "",
  );

  const result = await generateLineChart({
    cacheKey: `adflow-cs${clientServiceId}-${periodKey}-fb`,
    labels,
    values: points.map((p) => p.leads),
    width: 700,
    height: 280,
    backgroundColor: COLORS.card, // match the hero card so the chart blends
    variant: "integrated",
  });

  return result?.url || null;
}

/* ─── Public API ─── */

/**
 * Compile and send an AdFlow monthly report for a specific client_service.
 * Idempotent per period — stores `last_report_period` in metadata.
 */
export async function compileAndSendAdFlowReport(
  clientServiceId: number,
): Promise<CompileResult> {
  const [cs] = await db.select().from(clientServices).where(eq(clientServices.id, clientServiceId)).limit(1);
  if (!cs) return { sent: false, reason: "client_service_not_found" };

  if (!cs.service_id.startsWith("adflow")) {
    return { sent: false, reason: "not_an_adflow_service" };
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, cs.client_id)).limit(1);
  if (!client?.contact_email) return { sent: false, reason: "no_client_email" };

  if (await isEmailUnsubscribed(client.contact_email)) {
    return { sent: false, reason: "recipient_unsubscribed" };
  }

  const transporter = getEmailTransporter();
  if (!transporter) return { sent: false, reason: "smtp_not_configured" };

  const [svc] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, cs.service_id)).limit(1);
  const serviceName = svc?.name || "AdFlow";

  const csMeta = (cs.metadata as any) || {};
  const metrics: AdFlowReportMetrics = csMeta.latest_report || {};
  const period = formatPeriod(metrics.period_start, metrics.period_end);

  if (csMeta.last_report_period === period) {
    return { sent: false, reason: "already_sent_this_period", period };
  }

  // Pre-generate chart (best-effort; null is fine — fallback block carries the story)
  const chartUrl = await tryGenerateChart(cs.id, metrics, metrics.period_start);

  const summary = await writeSummary(serviceName, metrics, period);
  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();
  const contactName = client.contact_name || client.business_name || "there";

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: client.contact_email,
      replyTo: supportEmail,
      subject: `Your ${period} performance update — ${serviceName}`,
      html: buildHtml({
        contactName,
        serviceName,
        period,
        summary,
        metrics,
        chartUrl,
        portalUrl: `${baseUrl}/portal/services`,
        recipientEmail: client.contact_email,
      }),
    });

    await db.update(clientServices)
      .set({
        metadata: { ...csMeta, last_report_period: period, last_report_sent_at: new Date().toISOString() },
        updated_at: new Date(),
      } as any)
      .where(eq(clientServices.id, cs.id));

    console.log(`[adflow-report] Sent ${period} report for service #${cs.id} to ${client.contact_email}`);
    return { sent: true, period };
  } catch (err: any) {
    console.error(`[adflow-report] Failed to send for service #${cs.id}:`, err.message);
    return { sent: false, reason: `send_failed: ${err.message}` };
  }
}

/**
 * Build the email HTML for preview/test purposes without sending.
 * Used by the preview script to render exactly what a real recipient sees.
 *
 * Returns the chart's local file path alongside the HTML so the caller
 * can attach the post-processed PNG as a CID inline attachment when
 * embedding via a public URL isn't viable (e.g. before the deployment
 * has the cached file).
 */
export async function previewAdFlowReportHtml(opts: {
  contactName: string;
  serviceName: string;
  metrics: AdFlowReportMetrics;
  recipientEmail: string;
  cacheKey?: string;
  /** When true, replace the chart <img> src with `cid:chart` so the
      caller can attach the local PNG inline. Default: false. */
  embedChartAsCid?: boolean;
}): Promise<{ subject: string; html: string; chartLocalPath: string | null }> {
  const m = opts.metrics;
  const period = formatPeriod(m.period_start, m.period_end);
  const summary = await writeSummary(opts.serviceName, m, period).catch(() => "Campaign summary unavailable in preview.");

  const chartResult = m.daily_breakdown && m.daily_breakdown.length > 1
    ? await generateLineChart({
        cacheKey: opts.cacheKey || `adflow-preview-${Date.now()}`,
        labels: m.daily_breakdown.map((p, i, arr) => {
          const stride = Math.max(1, Math.floor(arr.length / 8));
          return i % stride === 0
            ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "";
        }),
        values: m.daily_breakdown.map((p) => p.leads),
        width: 700,
        height: 280,
        backgroundColor: COLORS.card,
        variant: "integrated",
      })
    : null;

  const chartUrl = opts.embedChartAsCid && chartResult?.localPath
    ? "cid:chart"
    : (chartResult?.url || null);

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";

  return {
    subject: `Your ${period} performance update — ${opts.serviceName}`,
    html: buildHtml({
      contactName: opts.contactName,
      serviceName: opts.serviceName,
      period,
      summary,
      metrics: m,
      chartUrl,
      portalUrl: `${baseUrl}/portal/services`,
      recipientEmail: opts.recipientEmail,
    }),
    chartLocalPath: chartResult?.localPath || null,
  };
}
