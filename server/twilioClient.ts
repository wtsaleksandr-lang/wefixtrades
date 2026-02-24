import twilio from "twilio";
import { db } from "./db";
import { smsMessages, leads } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import type { InsertSmsMessage } from "@shared/schema";

export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  );
}

export function getTwilioClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials not configured");
  }
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

export async function sendSMS(
  to: string,
  body: string,
  channel: "sms" | "whatsapp" = "sms"
): Promise<string> {
  const client = getTwilioClient();

  let from: string;
  let toFormatted: string;

  if (channel === "whatsapp") {
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_FROM_NUMBER;
    if (!whatsappNumber) throw new Error("WhatsApp number not configured");
    from = `whatsapp:${whatsappNumber}`;
    toFormatted = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  } else {
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    if (!fromNumber) throw new Error("TWILIO_FROM_NUMBER not configured");
    from = fromNumber;
    toFormatted = to;
  }

  const message = await client.messages.create({ from, to: toFormatted, body });
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

  const allLeads = await db
    .select()
    .from(leads)
    .where(sql`phone IS NOT NULL`)
    .orderBy(sql`created_date DESC`);

  const match = allLeads.find((l) => {
    if (!l.phone) return false;
    const leadNorm = normalizePhone(l.phone);
    return leadNorm === normalized;
  });

  return match ?? null;
}

export function truncateSms(text: string, maxLen = 160): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
