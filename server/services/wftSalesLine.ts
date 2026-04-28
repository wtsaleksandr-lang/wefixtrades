/**
 * WeFixTrades company sales line — post-call handling.
 *
 * When someone calls the WeFixTrades phone number (not a customer
 * TradeLine call), Vapi's AI sales assistant handles the conversation
 * through the default `buildAssistantConfig()` + `handleConversationTurn()`
 * pipeline. After the call ends, we want to:
 *
 *   1. Parse the transcript for caller identity (name, business, email)
 *   2. Create a sales_leads row so nothing falls through the cracks
 *   3. Email a summary to ADMIN_EMAIL with transcript + extracted info
 *
 * The Vapi webhook handler invokes `handleSalesCallEnded` from the
 * "end-of-call-report" branch whenever the call did NOT resolve to a
 * TradeLine customer service.
 */

import { db } from "../db";
import { salesLeads } from "@shared/schema";
import { eq } from "drizzle-orm";
import { chat } from "./aiService";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { buildAdminAlertEmail, buildAdminAlertPlainText, ADMIN_ALERT_FROM_NAME } from "../lib/adminAlertShell";
import type { VapiCallReport } from "./vapiService";

interface ExtractedCaller {
  name?: string;
  business_name?: string;
  email?: string;
  phone?: string;
  trade_type?: string;
  intent?: string;        // "pricing question" | "demo request" | "signup" | "existing customer" | "complaint" | "other"
  summary?: string;       // one-sentence call summary
  is_real_lead: boolean;  // false if caller hung up immediately or was clearly wrong number
}

function cleanJson(text: string): string {
  return text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
}

async function extractCallerInfo(transcript: string, callerNumber?: string): Promise<ExtractedCaller> {
  if (!transcript || transcript.length < 50) {
    return { is_real_lead: false, intent: "hangup", summary: "Call ended before meaningful conversation." };
  }

  try {
    const response = await chat({
      system: `You extract structured info from a sales call transcript. The caller reached WeFixTrades — a SaaS + services platform for trades businesses. Return STRICT JSON matching this TypeScript interface. Only include fields with HIGH confidence. Return ONLY the JSON, no prose.

interface Output {
  name?: string;          // first name at least
  business_name?: string;
  email?: string;
  phone?: string;         // E.164 if possible
  trade_type?: string;    // lowercase, e.g. "plumber", "hvac", "electrician"
  intent?: "pricing_question" | "demo_request" | "signup" | "existing_customer" | "complaint" | "wrong_number" | "other";
  summary: string;        // one sentence, under 30 words
  is_real_lead: boolean;  // true if the caller engaged with our services with purchase/info intent
}`,
      messages: [{
        role: "user",
        content: `Caller number: ${callerNumber || "unknown"}\n\nCall transcript:\n${transcript}`,
      }],
      maxTokens: 400,
    });
    const parsed = JSON.parse(cleanJson(response));
    return {
      name: parsed.name,
      business_name: parsed.business_name,
      email: parsed.email,
      phone: parsed.phone || callerNumber,
      trade_type: parsed.trade_type,
      intent: parsed.intent,
      summary: parsed.summary || "No summary extracted.",
      is_real_lead: Boolean(parsed.is_real_lead),
    };
  } catch (err: any) {
    console.warn("[wft-sales-line] Extraction failed:", err.message);
    return {
      is_real_lead: false,
      summary: "Call completed but AI extraction failed — review transcript manually.",
      phone: callerNumber,
    };
  }
}

function buildInternalEmailHtml(params: {
  extracted: ExtractedCaller;
  transcript: string;
  callId: string;
  durationSec?: number;
  callerNumber?: string;
}): string {
  const e = params.extracted;
  const dur = params.durationSec
    ? `${Math.floor(params.durationSec / 60)}m ${params.durationSec % 60}s`
    : "unknown";

  const detailRows: Array<{ label: string; value: string }> = [];
  if (e.name) detailRows.push({ label: "Name", value: e.name });
  if (e.business_name) detailRows.push({ label: "Business", value: e.business_name });
  if (e.email) detailRows.push({ label: "Email", value: e.email });
  const phone = e.phone || params.callerNumber;
  if (phone) detailRows.push({ label: "Phone", value: phone });
  if (e.trade_type) detailRows.push({ label: "Trade", value: e.trade_type });
  if (e.intent) detailRows.push({ label: "Intent", value: e.intent });
  detailRows.push({ label: "Call ID", value: params.callId });
  detailRows.push({ label: "Duration", value: dur });

  const transcriptEsc = params.transcript
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return buildAdminAlertEmail({
    subjectForTitle: e.is_real_lead ? `[Sales call] ${e.name || "Caller"}` : `[Call ended] ${e.intent || "unclassified"}`,
    alertType: e.is_real_lead ? "Sales lead" : "Call completed",
    alertTone: e.is_real_lead ? "success" : "info",
    headline: e.summary || "Sales line call ended",
    detailRows,
    bodyHtml: `
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Full transcript</p>
        <pre style="margin:0;font-family:'Menlo','Monaco',monospace;font-size:12px;color:#374151;white-space:pre-wrap;line-height:1.55;">${transcriptEsc}</pre>
      </div>`,
    footerNote: "WeFixTrades sales line",
  });
}

function buildInternalEmailPlainText(params: {
  extracted: ExtractedCaller;
  transcript: string;
  callId: string;
  durationSec?: number;
  callerNumber?: string;
}): string {
  const e = params.extracted;
  const dur = params.durationSec
    ? `${Math.floor(params.durationSec / 60)}m ${params.durationSec % 60}s`
    : "unknown";

  const detailRows: Array<{ label: string; value: string }> = [];
  if (e.name) detailRows.push({ label: "Name", value: e.name });
  if (e.business_name) detailRows.push({ label: "Business", value: e.business_name });
  if (e.email) detailRows.push({ label: "Email", value: e.email });
  const phone = e.phone || params.callerNumber;
  if (phone) detailRows.push({ label: "Phone", value: phone });
  if (e.trade_type) detailRows.push({ label: "Trade", value: e.trade_type });
  if (e.intent) detailRows.push({ label: "Intent", value: e.intent });
  detailRows.push({ label: "Call ID", value: params.callId });
  detailRows.push({ label: "Duration", value: dur });

  return buildAdminAlertPlainText({
    alertType: e.is_real_lead ? "Sales lead" : "Call completed",
    headline: e.summary || "Sales line call ended",
    detailRows,
    bodyText: `Full transcript:\n${params.transcript}`,
    footerNote: "WeFixTrades sales line",
  });
}

/**
 * Process a completed call that wasn't tied to a customer TradeLine service.
 * Extracts caller info via Claude, logs as sales_lead if useful, emails the team.
 *
 * Safe-fail on every step so Vapi webhook never errors out because of us.
 */
export async function handleSalesCallEnded(report: VapiCallReport): Promise<void> {
  try {
    const extracted = await extractCallerInfo(report.transcript || "", report.customerNumber);

    // Create a sales_lead if this was a real lead with at least some contact info
    let leadId: number | undefined;
    if (extracted.is_real_lead && (extracted.email || extracted.phone || extracted.business_name)) {
      try {
        // Dedup by phone — don't create a new row if we already have this caller
        let existing;
        if (extracted.phone) {
          const [row] = await db.select({ id: salesLeads.id })
            .from(salesLeads)
            .where(eq(salesLeads.phone, extracted.phone))
            .limit(1);
          existing = row;
        }

        if (existing) {
          leadId = existing.id;
          await db.update(salesLeads)
            .set({
              last_contacted_at: new Date(),
              notes: `${(extracted.summary || "Sales call").trim()} (call ${report.callId})`,
              updated_at: new Date(),
            })
            .where(eq(salesLeads.id, existing.id));
        } else {
          const [row] = await db.insert(salesLeads).values({
            business_name: extracted.business_name || extracted.name || "Unknown caller",
            contact_name: extracted.name,
            email: extracted.email,
            phone: extracted.phone || report.customerNumber,
            source: "inbound",
            status: "new",
            notes: `Inbound call · intent: ${extracted.intent || "unknown"}\n\nSummary: ${extracted.summary}\n\nCall ID: ${report.callId}`,
            last_contacted_at: new Date(),
          }).returning({ id: salesLeads.id });
          leadId = row?.id;
        }
      } catch (err: any) {
        console.warn("[wft-sales-line] Failed to persist sales_lead:", err.message);
      }
    }

    // Send summary email to the team
    const adminEmail = process.env.ADMIN_EMAIL || process.env.INTERNAL_LEAD_EMAIL;
    const transporter = getEmailTransporter();
    if (adminEmail && transporter) {
      try {
        const transcriptForBody = report.transcript || "(no transcript captured)";
        await transporter.sendMail({
          from: `${ADMIN_ALERT_FROM_NAME} <${getFromAddress()}>`,
          to: adminEmail,
          replyTo: extracted.email || undefined,
          subject: extracted.is_real_lead
            ? `[Sales call] ${extracted.name || "Caller"}${extracted.business_name ? ` — ${extracted.business_name}` : ""}`
            : `[Call ended] ${extracted.intent || "unclassified"} — ${report.callId.slice(-8)}`,
          html: buildInternalEmailHtml({
            extracted,
            transcript: transcriptForBody,
            callId: report.callId,
            durationSec: report.duration,
            callerNumber: report.customerNumber,
          }),
          text: buildInternalEmailPlainText({
            extracted,
            transcript: transcriptForBody,
            callId: report.callId,
            durationSec: report.duration,
            callerNumber: report.customerNumber,
          }),
        });
      } catch (err: any) {
        console.warn("[wft-sales-line] Email send failed:", err.message);
      }
    } else {
      console.log("[wft-sales-line] ADMIN_EMAIL or SMTP not configured — skipping call summary email");
    }

    console.log(`[wft-sales-line] Processed call ${report.callId}: lead=${extracted.is_real_lead} intent=${extracted.intent} sales_lead_id=${leadId || "none"}`);
  } catch (err: any) {
    console.error(`[wft-sales-line] Unhandled error processing call ${report.callId}:`, err.message);
  }
}
