/**
 * AdFlow monthly performance report
 *
 * Compiles a one-page summary of the client's AdFlow campaign for the
 * prior month and emails it to the customer. Since we don't have live
 * ad-platform integrations yet, the report is sourced from what the
 * white-label supplier reports back via fulfillment task metadata +
 * any structured data they attach.
 *
 * Design contract:
 *  - Called by the "Monthly performance report" fulfillment task
 *    when it transitions to delivered → the task handler invokes
 *    compileAndSendAdFlowReport(client_service_id).
 *  - Safe-fail: if supplier hasn't populated metrics yet, the report
 *    shows "Data collection in progress" placeholders rather than
 *    breaking the email.
 *
 * Metric sources (read from client_service.metadata.latest_report):
 *  - { impressions, clicks, conversions, cost_spent_cents, cpc_cents,
 *      ctr_pct, leads_generated, top_creative, notes, period_start,
 *      period_end }
 *  - Supplier populates this via the admin CRM UI (future) or via
 *    direct metadata update on task completion.
 */

import { db } from "../db";
import { clients, clientServices, serviceCatalog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { buildLegalFooter } from "../lib/emailFooter";
import { chat } from "./aiService";

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
}

export interface CompileResult {
  sent: boolean;
  reason?: string;
  period?: string;
}

function formatUsd(cents?: number): string {
  if (cents == null) return "—";
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

async function writeSummary(
  serviceName: string,
  metrics: AdFlowReportMetrics,
  period: string,
): Promise<string> {
  // Generate a short "what this means" paragraph via Claude so the customer
  // gets plain-English context, not just a grid of numbers. If Claude is
  // unavailable, fall back to a rule-based summary.
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
    // Rule-based fallback
    const leads = metrics.leads_generated ?? 0;
    const spend = metrics.cost_spent_cents ? formatUsd(metrics.cost_spent_cents) : "—";
    if (leads > 0) {
      return `This month's campaign generated ${leads} lead${leads === 1 ? "" : "s"} on ${spend} spend. Metrics below show the full picture.`;
    }
    return `Campaign active for ${period}. Metrics below show reach and engagement — leads should follow as optimization continues.`;
  }
}

function buildHtml(params: {
  contactName: string;
  serviceName: string;
  period: string;
  summary: string;
  metrics: AdFlowReportMetrics;
  portalUrl: string;
  supportEmail: string;
}): string {
  const metricRow = (label: string, value: string, accent = false) => `
    <tr>
      <td style="padding:10px 12px;background:#0F141A;border-radius:8px 0 0 8px;border:1px solid rgba(255,255,255,0.06);border-right:none;font-size:12px;color:#8B919A;font-weight:500;">${label}</td>
      <td style="padding:10px 12px;background:#0F141A;border-radius:0 8px 8px 0;border:1px solid rgba(255,255,255,0.06);border-left:none;font-size:14px;color:${accent ? "#66E8FA" : "#F0F0F0"};font-weight:${accent ? 700 : 600};text-align:right;">${value}</td>
    </tr>
    <tr><td colspan="2" style="height:6px;"></td></tr>
  `;

  return `
    <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:32px;">
          <span style="display:inline-block;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:12px;font-weight:800;padding:5px 16px;border-radius:999px;letter-spacing:0.06em;">WeFixTrades · AdFlow</span>
        </div>
        <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
          <p style="font-size:11px;font-weight:700;color:#66E8FA;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 6px;">Monthly report · ${params.period}</p>
          <h1 style="font-size:22px;font-weight:700;color:#F0F0F0;margin:0 0 16px;line-height:1.3;">${params.serviceName}</h1>
          <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 24px;">
            Hi ${params.contactName}, ${params.summary}
          </p>

          <table style="width:100%;border-collapse:separate;border-spacing:0;">
            ${metricRow("Leads generated", formatInt(params.metrics.leads_generated), true)}
            ${metricRow("Conversions", formatInt(params.metrics.conversions))}
            ${metricRow("Clicks", formatInt(params.metrics.clicks))}
            ${metricRow("Impressions", formatInt(params.metrics.impressions))}
            ${metricRow("Click-through rate", formatPct(params.metrics.ctr_pct))}
            ${metricRow("Cost per click", formatUsd(params.metrics.cpc_cents))}
            ${metricRow("Total spend", formatUsd(params.metrics.cost_spent_cents))}
          </table>

          ${params.metrics.top_creative ? `
          <div style="margin-top:20px;padding:14px;background:rgba(102,232,250,0.06);border-left:2px solid #66E8FA;border-radius:4px;">
            <p style="font-size:11px;font-weight:600;color:#66E8FA;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px;">Top creative</p>
            <p style="font-size:13px;color:#CDD1D6;line-height:1.5;margin:0;">${params.metrics.top_creative}</p>
          </div>
          ` : ""}

          ${params.metrics.notes ? `
          <div style="margin-top:16px;padding:14px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;">
            <p style="font-size:11px;font-weight:600;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 6px;">Notes from the team</p>
            <p style="font-size:13px;color:#CDD1D6;line-height:1.5;margin:0;">${params.metrics.notes}</p>
          </div>
          ` : ""}

          <div style="border-top:1px solid rgba(255,255,255,0.06);margin:28px 0 20px;"></div>

          <a href="${params.portalUrl}" style="display:inline-block;background:#66E8FA;color:#0B0F14;font-size:13px;font-weight:700;padding:11px 20px;border-radius:8px;text-decoration:none;">
            View full campaign dashboard
          </a>

          <p style="font-size:12px;color:#8B919A;line-height:1.5;margin:18px 0 0;">
            Questions? Reply to this email and our team will get back to you.
          </p>
        </div>
        <p style="font-size:11px;color:#555B63;text-align:center;margin:24px 0 0;line-height:1.5;">
          Sent to <a href="mailto:${params.supportEmail}" style="color:#66E8FA;text-decoration:none;">${params.supportEmail}</a>
        </p>
        ${buildLegalFooter()}
      </div>
    </div>
  `;
}

function formatPeriod(start?: string, end?: string): string {
  if (!start) {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return prev.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  const d = new Date(start);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Compile and send an AdFlow monthly report for a specific client_service.
 * Idempotent per period — stores `last_report_sent_at` in metadata.
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

  const transporter = getEmailTransporter();
  if (!transporter) return { sent: false, reason: "smtp_not_configured" };

  const [svc] = await db.select().from(serviceCatalog).where(eq(serviceCatalog.id, cs.service_id)).limit(1);
  const serviceName = svc?.name || "AdFlow";

  const csMeta = (cs.metadata as any) || {};
  const metrics: AdFlowReportMetrics = csMeta.latest_report || {};
  const period = formatPeriod(metrics.period_start, metrics.period_end);

  // Idempotency — don't resend same period
  if (csMeta.last_report_period === period) {
    return { sent: false, reason: "already_sent_this_period", period };
  }

  const summary = await writeSummary(serviceName, metrics, period);
  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const supportEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL || getFromAddress();
  const contactName = client.contact_name || client.business_name || "there";

  try {
    await transporter.sendMail({
      from: `WeFixTrades <${getFromAddress()}>`,
      to: client.contact_email,
      replyTo: supportEmail,
      subject: `${serviceName} · ${period} performance report`,
      html: buildHtml({
        contactName,
        serviceName,
        period,
        summary,
        metrics,
        portalUrl: `${baseUrl}/portal/services`,
        supportEmail,
      }),
    });

    // Record send
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
