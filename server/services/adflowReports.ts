/**
 * AdFlow monthly performance report.
 *
 * Wires AdFlow's data shape (impressions, clicks, leads, daily breakdown,
 * creatives, recommendations) into the shared `reportShell` premium
 * dashboard layout. Previous bespoke HTML moved to reportShell; this
 * file is now data-shaping + composition only.
 *
 * Idempotent per period via client_service.metadata.last_report_period.
 */

import { db } from "../db";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { isEmailUnsubscribed } from "../lib/unsubscribeStorage";
import { generateLineChart } from "./emailCharts";
import { chat } from "./aiService";
import {
  REPORT_COLORS,
  buildReportShell,
  buildReportHero,
  buildKpiGrid,
  buildIntegratedChart,
  buildChartFallback,
  buildRecommendations,
  buildSection,
  buildCtaButton,
  buildMetricGlossary,
  deriveHeaderBadge,
  type KpiTile,
  type HeaderBadge,
} from "../lib/reportShell";

/* ─── Public types ─── */

export interface AdFlowDailyPoint {
  date: string;
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
  shown: boolean;
  pctText: string;
  rose: boolean;
  good: boolean;
}

function pctDelta(curr?: number, prev?: number, opts: { higherIsBetter?: boolean } = {}): Delta {
  if (curr == null || prev == null || prev === 0) {
    return { shown: false, pctText: "", rose: false, good: true };
  }
  const change = ((curr - prev) / prev) * 100;
  if (Math.abs(change) < 1) {
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

/* ─── Body composition ─── */

interface AdFlowComposeOpts {
  contactName: string;
  serviceName: string;
  period: string;
  metrics: AdFlowReportMetrics;
  chartUrl: string | null;
  portalUrl: string;
  recipientEmail: string;
  summary: string;
}

async function composeAdFlowReport(o: AdFlowComposeOpts): Promise<{ subject: string; html: string; badge: HeaderBadge }> {
  const m = o.metrics;
  const prior = m.prior_period;

  // Deltas
  const leadsDelta = pctDelta(m.leads_generated, prior?.leads_generated, { higherIsBetter: true });
  const cplCurr = m.leads_generated && m.cost_spent_cents ? m.cost_spent_cents / m.leads_generated : undefined;
  const cplPrev = prior?.leads_generated && prior?.cost_spent_cents ? prior.cost_spent_cents / prior.leads_generated : undefined;
  const cplDelta = pctDelta(cplCurr, cplPrev, { higherIsBetter: false });
  const ctrDelta = pctDelta(m.ctr_pct, prior?.ctr_pct, { higherIsBetter: true });

  // Header badge auto-derived from leads delta
  const badge = deriveHeaderBadge({ primaryDelta: leadsDelta });

  // Hero headline + dynamic subject
  let heroHeadline: string;
  let subject: string;
  if (m.leads_generated == null) {
    heroHeadline = `${o.serviceName} report`;
    subject = `Your ${o.period} ${o.serviceName} report`;
  } else if (leadsDelta.shown && leadsDelta.rose && parseInt(leadsDelta.pctText, 10) >= 15) {
    heroHeadline = `Strong month — leads up ${leadsDelta.pctText}`;
    subject = `Leads up ${leadsDelta.pctText} — your ${o.period} AdFlow recap`;
  } else if (leadsDelta.shown && !leadsDelta.rose && parseInt(leadsDelta.pctText, 10) >= 15) {
    heroHeadline = `Adjusting course this month`;
    subject = `${m.leads_generated} leads in ${o.period} — adjusting course`;
  } else {
    const word = m.leads_generated === 1 ? "lead" : "leads";
    heroHeadline = `${m.leads_generated} new ${word} this month`;
    subject = `${m.leads_generated} ${word} — your ${o.period} AdFlow recap`;
  }

  // KPI tiles
  const kpis: KpiTile[] = [
    { label: "Leads", value: formatInt(m.leads_generated), delta: leadsDelta, accent: true },
    { label: "Cost / Lead", value: cplCurr != null ? formatUsd(Math.round(cplCurr)) : "—", delta: cplDelta },
    { label: "Click-through", value: formatPct(m.ctr_pct), delta: ctrDelta },
    { label: "Total spend", value: formatUsd(m.cost_spent_cents) },
  ];

  // Chart fallback (peak day + daily average)
  const peakDay = m.daily_breakdown && m.daily_breakdown.length > 0
    ? m.daily_breakdown.reduce((best, d) => (d.leads > best.leads ? d : best), m.daily_breakdown[0])
    : null;
  const totalDays = m.daily_breakdown?.length ?? 0;
  const avgPerDay = totalDays > 0 && m.leads_generated != null ? (m.leads_generated / totalDays).toFixed(1) : null;
  const peakDate = peakDay
    ? new Date(peakDay.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const fallbackCells: Array<{ label: string; value: string; emphasis?: boolean }> = [];
  if (peakDate && peakDay) {
    fallbackCells.push({ label: "Peak day", value: `${peakDate} · ${peakDay.leads} leads`, emphasis: true });
  }
  if (avgPerDay) {
    fallbackCells.push({ label: "Daily average", value: `${avgPerDay} leads / day` });
  }

  // Top performers
  const topCreatives = m.creatives && m.creatives.length > 0
    ? m.creatives.slice(0, 3)
    : (m.top_creative ? [{ name: m.top_creative }] : []);

  const creativesHtml = topCreatives.length > 0 ? topCreatives.map((c, i) => `
    <div style="background:${REPORT_COLORS.cardSubtle};border:1px solid ${REPORT_COLORS.border};border-radius:10px;padding:12px 14px;margin:0 0 6px;">
      <div style="font-size:13px;font-weight:600;color:${REPORT_COLORS.bright};line-height:1.4;">${i === 0 ? `<span style="color:${REPORT_COLORS.accent};margin-right:6px;">★</span>` : ""}${escapeHtml(c.name)}</div>
      ${(c.leads != null || c.spend_cents != null || c.ctr_pct != null) ? `
      <div style="font-size:11px;color:${REPORT_COLORS.muted};margin-top:3px;line-height:1.5;">
        ${[
          c.leads != null ? `${c.leads} lead${c.leads === 1 ? "" : "s"}` : null,
          c.spend_cents != null ? formatUsd(c.spend_cents) : null,
          c.ctr_pct != null ? `${c.ctr_pct.toFixed(2)}% CTR` : null,
        ].filter(Boolean).join(" · ")}
      </div>` : ""}
    </div>
  `).join("") : "";

  // Notes from team (legacy field, optional)
  const notesHtml = m.notes ? `
    <p style="font-size:13px;color:${REPORT_COLORS.text};line-height:1.55;margin:0;">${escapeHtml(m.notes)}</p>
  ` : "";

  // Compose body
  const body = [
    buildReportHero({
      eyebrow: "Monthly performance",
      headline: heroHeadline,
      period: o.period,
      summary: o.summary,
    }),
    buildKpiGrid(kpis),
    o.chartUrl ? buildIntegratedChart({ chartUrl: o.chartUrl, alt: `Daily leads trend, ${o.period}`, height: 280 }) : "",
    fallbackCells.length ? buildChartFallback({ cells: fallbackCells }) : "",
    creativesHtml ? buildSection({ title: "Top performers", content: creativesHtml }) : "",
    buildRecommendations({ items: m.recommendations || [] }),
    notesHtml ? buildSection({ title: "Notes from the team", content: notesHtml }) : "",
    buildCtaButton({ href: o.portalUrl, label: "View full campaign dashboard" }),
    buildMetricGlossary({ metrics: ["Leads", "Cost / Lead", "Click-through", "Total spend"] }),
  ].filter(Boolean).join("");

  const html = buildReportShell({
    product: `${o.serviceName} Report`,
    badge,
    body,
    recipientEmail: o.recipientEmail,
  });

  return { subject, html, badge };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
  cacheKey: string,
  metrics: AdFlowReportMetrics,
): Promise<string | null> {
  if (!metrics.daily_breakdown || metrics.daily_breakdown.length < 2) return null;

  const points = metrics.daily_breakdown;
  const stride = Math.max(1, Math.floor(points.length / 8));
  const labels = points.map((p, i) =>
    i % stride === 0
      ? new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "",
  );

  const result = await generateLineChart({
    cacheKey,
    labels,
    values: points.map((p) => p.leads),
    width: 700,
    height: 280,
    backgroundColor: REPORT_COLORS.card,
    variant: "integrated",
  });

  return result?.url || null;
}

/* ─── Public API ─── */

const ADFLOW_FROM_NAME = "WeFixTrades AdFlow";

export async function compileAndSendAdFlowReport(
  clientServiceId: number,
): Promise<CompileResult> {
  const [cs] = await db.select().from(clientServices).where(eq(clientServices.id, clientServiceId)).limit(1);
  if (!cs) return { sent: false, reason: "client_service_not_found" };
  if (!cs.service_id.startsWith("adflow")) return { sent: false, reason: "not_an_adflow_service" };

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

  const periodKey = metrics.period_start
    ? new Date(metrics.period_start).toISOString().slice(0, 7)
    : new Date().toISOString().slice(0, 7);
  const chartUrl = await tryGenerateChart(`adflow-cs${cs.id}-${periodKey}-fb`, metrics);

  const summary = await writeSummary(serviceName, metrics, period);
  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();
  const contactName = client.contact_name || client.business_name || "there";

  const { subject, html } = await composeAdFlowReport({
    contactName,
    serviceName,
    period,
    metrics,
    chartUrl,
    portalUrl: `${baseUrl}/portal/services`,
    recipientEmail: client.contact_email,
    summary,
  });

  try {
    await transporter.sendMail({
      from: `${ADFLOW_FROM_NAME} <${getFromAddress()}>`,
      to: client.contact_email,
      replyTo: supportEmail,
      subject,
      html,
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
 */
export async function previewAdFlowReportHtml(opts: {
  contactName: string;
  serviceName: string;
  metrics: AdFlowReportMetrics;
  recipientEmail: string;
  cacheKey?: string;
  embedChartAsCid?: boolean;
}): Promise<{ subject: string; html: string; chartLocalPath: string | null; senderName: string }> {
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
        backgroundColor: REPORT_COLORS.card,
        variant: "integrated",
      })
    : null;

  const chartUrl = opts.embedChartAsCid && chartResult?.localPath
    ? "cid:chart"
    : (chartResult?.url || null);

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";

  const { subject, html } = await composeAdFlowReport({
    contactName: opts.contactName,
    serviceName: opts.serviceName,
    period,
    metrics: m,
    chartUrl,
    portalUrl: `${baseUrl}/portal/services`,
    recipientEmail: opts.recipientEmail,
    summary,
  });

  return { subject, html, chartLocalPath: chartResult?.localPath || null, senderName: ADFLOW_FROM_NAME };
}

/* ─── Batch sender (strict-gated monthly cron) ─── */

/**
 * Pure helper — returns true iff `periodStartRaw` parses to a date that
 * falls within the previous calendar month relative to `now` (UTC).
 *
 * Returns false for: undefined, empty string, unparseable date, future
 * date, or any date older than the start of the previous month.
 *
 * Exported for unit-testing the strict gate in isolation.
 */
export function isPeriodStartInPreviousMonth(
  now: Date,
  periodStartRaw: string | undefined | null,
): boolean {
  if (!periodStartRaw) return false;
  const ps = new Date(periodStartRaw);
  if (isNaN(ps.getTime())) return false;
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); // exclusive
  return ps >= prevMonthStart && ps < prevMonthEnd;
}

/**
 * Strict-gated batch sender for the AdFlow monthly cron.
 *
 * Unlike the other monthly reports (RankFlow / SocialSync / MapGuard),
 * AdFlow metrics are NOT auto-collected — an admin manually enters them
 * via POST /api/admin/crm/client-services/:id/adflow-metrics, which writes
 * to client_service.metadata.latest_report.
 *
 * Because of that, an unguarded sweep would risk emailing zero-data or
 * stale reports to clients whose admin forgot to enter this month's
 * numbers. The cron fires on the 2nd of each month at 13:00 UTC, so the
 * "current" report is the **previous calendar month**.
 *
 * Strict gate (in order):
 *   1. Service must be active + enabled + service_id LIKE 'adflow%'
 *   2. Client must have a non-empty contact_email
 *   3. metadata.latest_report.period_start must exist AND fall within
 *      the previous calendar month — otherwise the client is bucketed
 *      as `skipped_missing_current_report` (covers both missing AND stale)
 *   4. compileAndSendAdFlowReport() then runs its own idempotency check
 *      via metadata.last_report_period (so re-runs same month are safe)
 *
 * Returns a job_logs-friendly metadata object — including a per-skip
 * breakdown so ops can see at a glance which clients still need
 * metrics entered for the month.
 */
export async function sendAllAdflowReports(): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
  skipped_missing_current_report: number;
  skipped_already_sent: number;
  skipped_unsubscribed: number;
  skipped_other: number;
}> {
  const now = new Date();

  const activeServices = await db.select({
    cs_id: clientServices.id,
    metadata: clientServices.metadata,
    business_name: clients.business_name,
    contact_email: clients.contact_email,
  })
    .from(clientServices)
    .innerJoin(clients, eq(clientServices.client_id, clients.id))
    .innerJoin(serviceCatalog, eq(clientServices.service_id, serviceCatalog.id))
    .where(and(
      eq(clientServices.status, "active"),
      eq(clientServices.enabled, true),
      sql`${serviceCatalog.id} LIKE 'adflow%'`,
      sql`${clients.contact_email} IS NOT NULL AND ${clients.contact_email} != ''`,
    ));

  let sent = 0;
  let skipped = 0;
  let skipped_missing_current_report = 0;
  let skipped_already_sent = 0;
  let skipped_unsubscribed = 0;
  let skipped_other = 0;
  const errors: string[] = [];

  for (const svc of activeServices) {
    const meta = (svc.metadata as any) || {};
    const latest = meta.latest_report;
    const periodStartRaw: string | undefined = latest?.period_start;

    // Strict gate: must have a period_start that falls in previous calendar month
    if (!isPeriodStartInPreviousMonth(now, periodStartRaw)) {
      skipped++;
      skipped_missing_current_report++;
      console.log(`[adflow-report] Skipped #${svc.cs_id} (${svc.business_name}): missing or stale current-period metrics`);
      continue;
    }

    const result = await compileAndSendAdFlowReport(svc.cs_id);
    if (result.sent) {
      sent++;
    } else if (result.reason === "already_sent_this_period") {
      skipped++;
      skipped_already_sent++;
    } else if (result.reason === "recipient_unsubscribed") {
      skipped++;
      skipped_unsubscribed++;
    } else {
      // smtp_not_configured, send_failed, no_client_email (defense-in-depth), etc.
      skipped++;
      skipped_other++;
      errors.push(`${svc.business_name}: ${result.reason}`);
    }
  }

  console.log(`[adflow-report] Batch complete: ${sent} sent, ${skipped} skipped (${skipped_missing_current_report} missing/stale, ${skipped_already_sent} already-sent, ${skipped_unsubscribed} unsubscribed, ${skipped_other} other), ${errors.length} errors`);

  return {
    sent,
    skipped,
    errors,
    skipped_missing_current_report,
    skipped_already_sent,
    skipped_unsubscribed,
    skipped_other,
  };
}
