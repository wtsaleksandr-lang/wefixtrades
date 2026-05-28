import twilio from "twilio";
const { validateRequest } = twilio as any;
import type { Request } from "express";
import { db } from "./db";
import { smsMessages, leads, smsOptOuts } from "@shared/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import type { InsertSmsMessage } from "@shared/schema";
import { createLogger } from "./lib/logger";

const smsLog = createLogger("twilio-sms");

/**
 * Returns the configured Twilio sender phone number.
 *
 * Accepts either env-var name for compatibility with the two naming
 * conventions in our infrastructure:
 *   - TWILIO_FROM_NUMBER  (legacy name used in this codebase)
 *   - TWILIO_PHONE_NUMBER (canonical Twilio name; what the Replit Secrets panel uses)
 *
 * Returns `null` if neither is set.
 */
export function getTwilioFromNumber(): string | null {
  return process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || null;
}

export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    getTwilioFromNumber()
  );
}

export function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials not configured");
  }
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Normalize a raw phone string into E.164 best-effort. We don't have full
 * country detection here; assume +1 for 10-digit North-American numbers,
 * preserve a leading + if already present, otherwise return the raw digits
 * prefixed with +. Used only as the lookup key for opt-out enforcement.
 */
function toE164(raw: string): string {
  if (!raw) return raw;
  const trimmed = raw.replace(/^whatsapp:/i, "").trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/**
 * Is the given phone number on the SMS opt-out list? Lookup is by
 * E.164-normalized number; opt-outs are global across all outbound flows.
 */
export async function isSmsOptedOut(to: string): Promise<boolean> {
  if (!to) return false;
  const e164 = toE164(to);
  try {
    const [row] = await db
      .select({ id: smsOptOuts.id })
      .from(smsOptOuts)
      .where(eq(smsOptOuts.phone_e164, e164))
      .limit(1);
    return !!row;
  } catch (err: any) {
    smsLog.warn(`[opt-out] lookup failed for ${e164}: ${err.message}`);
    return false; // fail-open on read errors — better to send than block valid traffic
  }
}

/**
 * Record an opt-out. Idempotent on phone_e164 (UNIQUE constraint + ON
 * CONFLICT DO NOTHING). Reasons: 'stop_keyword' | 'manual' | 'hard_bounce'.
 */
export async function recordSmsOptOut(
  to: string,
  reason: "stop_keyword" | "manual" | "hard_bounce" | string = "manual",
): Promise<void> {
  const e164 = toE164(to);
  if (!e164) return;
  try {
    await db
      .insert(smsOptOuts)
      .values({ phone_e164: e164, opt_out_reason: reason })
      .onConflictDoNothing({ target: smsOptOuts.phone_e164 });
    smsLog.info(`[opt-out] recorded ${e164} (reason=${reason})`);
  } catch (err: any) {
    smsLog.error(`[opt-out] insert failed for ${e164}: ${err.message}`);
  }
}

export async function sendSMS(
  to: string,
  body: string,
  channel: "sms" | "whatsapp" = "sms"
): Promise<string> {
  // Opt-out enforcement applies to SMS only (WhatsApp uses its own
  // template/opt-in flow). Throws so callers know the send didn't happen
  // and can record the skip in their own audit trail.
  if (channel === "sms" && (await isSmsOptedOut(to))) {
    smsLog.info(`[opt-out] skipped outbound SMS to ${toE164(to)} — recipient opted out`);
    throw new Error("sms_recipient_opted_out");
  }

  const client = getTwilioClient();

  let from: string;
  let toFormatted: string;

  if (channel === "whatsapp") {
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || getTwilioFromNumber();
    if (!whatsappNumber) throw new Error("WhatsApp number not configured");
    from = `whatsapp:${whatsappNumber}`;
    toFormatted = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  } else {
    const fromNumber = getTwilioFromNumber();
    if (!fromNumber) throw new Error("TWILIO_FROM_NUMBER (or TWILIO_PHONE_NUMBER) not configured");
    from = fromNumber;
    toFormatted = to;
  }

  // Wave 78 — wire delivery-status callback so we learn whether the
  // message actually delivered, failed, or hard-bounced. Endpoint at
  // POST /api/twilio/sms-status (see server/routes/twilioStatusCallbackRoutes.ts).
  // PUBLIC_BASE_URL convention matches sitemapRoutes / robotsRoutes /
  // cron/seoIndexing — falls back to wefixtrades.com if unset.
  const createParams: Record<string, unknown> = { from, to: toFormatted, body };
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://wefixtrades.com";
  createParams.statusCallback = `${publicBaseUrl}/api/twilio/sms-status`;
  createParams.statusCallbackMethod = "POST";

  const message = await client.messages.create(createParams as any);
  return message.sid;
}

export async function checkRateLimit(
  leadId: number,
  calculatorId: number,
  _channel: string
): Promise<{ allowed: boolean; reason?: string }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [leadCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(smsMessages)
    .where(and(eq(smsMessages.lead_id, leadId), gte(smsMessages.created_at, since)));

  if ((leadCount?.count ?? 0) >= 3) {
    return { allowed: false, reason: "Per-lead daily limit (3) reached" };
  }

  const [calcCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(smsMessages)
    .where(and(eq(smsMessages.calculator_id, calculatorId), gte(smsMessages.created_at, since)));

  if ((calcCount?.count ?? 0) >= 50) {
    return { allowed: false, reason: "Per-business daily limit (50) reached" };
  }

  return { allowed: true };
}

export async function storeSmsMessage(data: InsertSmsMessage) {
  const [msg] = await db.insert(smsMessages).values(data).returning();
  return msg;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export async function matchLeadByPhone(fromPhone: string) {
  const normalized = normalizePhone(fromPhone);

  // First try to resolve via recent SMS messages to avoid scanning the entire leads table
  const recentMsg = await db
    .select()
    .from(smsMessages)
    .where(
      and(
        sql`regexp_replace(${smsMessages.from_number}::text, '\\D', '', 'g') LIKE ${'%' + normalized}`,
        sql`${smsMessages.lead_id} IS NOT NULL`,
      ),
    )
    .orderBy(desc(smsMessages.created_at))
    .limit(1);

  const candidateLeadId = recentMsg[0]?.lead_id;

  if (candidateLeadId) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, candidateLeadId));
    if (lead) {
      return lead;
    }
  }

  // Fallback: scan a capped set of leads that have a phone
  const allLeads = await db
    .select()
    .from(leads)
    .where(sql`phone IS NOT NULL`)
    .orderBy(desc(leads.created_date))
    .limit(500);

  const match = allLeads.find((l) => {
    if (!l.phone) return false;
    const leadNorm = normalizePhone(l.phone);
    return leadNorm === normalized;
  });

  return match ?? null;
}

export function verifyTwilioSignature(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.header("x-twilio-signature") || "";
  if (!authToken || !signature) return false;

  const protocol = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers.host;
  if (!host) return false;

  const url = `${protocol}://${host}${req.originalUrl}`;

  // Twilio sends URL-encoded form data; Express has already parsed it into req.body
  const params = req.body ?? {};

  try {
    return validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}

export function truncateSms(text: string, maxLen = 160): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
