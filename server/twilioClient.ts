import twilio from "twilio";
const { validateRequest } = twilio as any;
import type { Request } from "express";
import { db } from "./db";
import { smsMessages, leads, smsOptOuts, tradelinePhoneSetups } from "@shared/schema";
import { eq, and, or, gte, sql, desc, isNull } from "drizzle-orm";
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
 * Is the given phone number on the SMS opt-out list?
 *
 * Wave 77 — scope semantics:
 *   - If `scopeClientId` is provided, the check matches rows where the
 *     opt-out is either GLOBAL (scope_client_id IS NULL) OR scoped to
 *     this same client. This means a global opt-out always wins; a
 *     per-client opt-out only blocks sends from THAT client's tenant.
 *   - If `scopeClientId` is omitted, only global opt-outs match. This
 *     preserves the pre-Wave-77 behavior for callers that haven't been
 *     migrated to the per-tenant signature yet.
 */
export async function isSmsOptedOut(
  to: string,
  scopeClientId?: number,
): Promise<boolean> {
  if (!to) return false;
  const e164 = toE164(to);
  try {
    const phoneMatch = eq(smsOptOuts.phone_e164, e164);
    const scopeMatch =
      scopeClientId == null
        ? isNull(smsOptOuts.scope_client_id)
        : or(
            isNull(smsOptOuts.scope_client_id),
            eq(smsOptOuts.scope_client_id, scopeClientId),
          );
    const [row] = await db
      .select({ id: smsOptOuts.id })
      .from(smsOptOuts)
      .where(and(phoneMatch, scopeMatch))
      .limit(1);
    return !!row;
  } catch (err: any) {
    smsLog.warn(`[opt-out] lookup failed for ${e164}: ${err.message}`);
    return false; // fail-open on read errors — better to send than block valid traffic
  }
}

/**
 * Record an opt-out. Idempotent on (phone_e164, scope_client_id) via the
 * partial unique indexes from migration 0068_sms_opt_outs_scope.sql.
 *
 * Reasons: 'stop_keyword' | 'manual' | 'hard_bounce'.
 *
 * Wave 77 — when `scopeClientId` is supplied, the opt-out is per-client
 * (only sends from that client's per-tenant number will respect it).
 * When omitted, the opt-out is global — matching the historical behavior
 * for STOPs landing on the shared WeFixTrades brand line.
 */
export async function recordSmsOptOut(
  to: string,
  reason: "stop_keyword" | "manual" | "hard_bounce" | string = "manual",
  scopeClientId?: number,
): Promise<void> {
  const e164 = toE164(to);
  if (!e164) return;
  try {
    // We can't ON CONFLICT against a partial unique index by target columns
    // alone in drizzle, so do an explicit upsert-by-check: skip if the
    // (phone, scope) pair already exists. The races are bounded (a single
    // STOP keyword usually only fires once) and the partial index will
    // reject a hard-duplicate insert if a race does occur.
    const scopeMatch =
      scopeClientId == null
        ? isNull(smsOptOuts.scope_client_id)
        : eq(smsOptOuts.scope_client_id, scopeClientId);
    const [existing] = await db
      .select({ id: smsOptOuts.id })
      .from(smsOptOuts)
      .where(and(eq(smsOptOuts.phone_e164, e164), scopeMatch))
      .limit(1);
    if (existing) {
      smsLog.info(
        `[opt-out] already recorded ${e164} (scope=${scopeClientId ?? "global"})`,
      );
      return;
    }
    await db.insert(smsOptOuts).values({
      phone_e164: e164,
      opt_out_reason: reason,
      scope_client_id: scopeClientId ?? null,
    });
    smsLog.info(
      `[opt-out] recorded ${e164} (reason=${reason}, scope=${scopeClientId ?? "global"})`,
    );
  } catch (err: any) {
    // Partial-index conflict on race — treat as success.
    if (/duplicate key|unique constraint/i.test(err?.message ?? "")) {
      smsLog.info(`[opt-out] race-conflict noop for ${e164}`);
      return;
    }
    smsLog.error(`[opt-out] insert failed for ${e164}: ${err.message}`);
  }
}

/**
 * Resolve the per-client outbound SMS number assigned in the TradeLine
 * phone-setup wizard. Returns null when the client hasn't completed
 * provisioning (mode is null / pending / queued / failed). Callers
 * should fall back to the global brand line in that case.
 *
 * Cached short-term inside the request loop via Map below; full memoization
 * isn't needed because the worker batches usually iterate ≤50 sends/run.
 */
export async function getClientAssignedNumber(
  clientId: number,
): Promise<string | null> {
  if (!clientId) return null;
  try {
    const [row] = await db
      .select({ assigned_number: tradelinePhoneSetups.assigned_number })
      .from(tradelinePhoneSetups)
      .where(eq(tradelinePhoneSetups.client_id, clientId))
      .limit(1);
    return row?.assigned_number ?? null;
  } catch (err: any) {
    smsLog.warn(
      `[per-tenant] assigned-number lookup failed for client ${clientId}: ${err.message}`,
    );
    return null;
  }
}

/**
 * Resolve the client_id that owns a given E.164 number (its TradeLine
 * `assigned_number`). Used by the inbound webhook to know which tenant's
 * number a STOP keyword landed on, so the opt-out can be scoped to that
 * client only.
 *
 * Returns null when the number isn't a per-tenant assigned number (in
 * which case the caller is expected to record a global opt-out — the
 * existing behavior for the shared WeFixTrades brand line).
 */
export async function getClientIdByAssignedNumber(
  toE164Number: string,
): Promise<number | null> {
  if (!toE164Number) return null;
  const e164 = toE164(toE164Number);
  try {
    const [row] = await db
      .select({ client_id: tradelinePhoneSetups.client_id })
      .from(tradelinePhoneSetups)
      .where(eq(tradelinePhoneSetups.assigned_number, e164))
      .limit(1);
    return row?.client_id ?? null;
  } catch (err: any) {
    smsLog.warn(
      `[per-tenant] reverse-number lookup failed for ${e164}: ${err.message}`,
    );
    return null;
  }
}

/**
 * Wave 77 — object-arg form of sendSMS.
 *
 *   - `to`              destination phone (any reasonable format; normalized for opt-out)
 *   - `body`            message body
 *   - `channel`         "sms" (default) | "whatsapp"
 *   - `fromOverride`    per-tenant sender (e.g. a client's TradeLine assigned_number);
 *                       falls back to the global TWILIO_PHONE_NUMBER when null.
 *                       Ignored for WhatsApp (TWILIO_WHATSAPP_NUMBER still wins).
 *   - `scopeClientId`   when set, the opt-out lookup is scoped to that client
 *                       (a per-tenant STOP against John's Plumbing doesn't
 *                       block Mary's Roofing). When null, only global opt-outs
 *                       are honored — preserving the historical behavior for
 *                       sends from the shared WeFixTrades brand line.
 */
export interface SendSmsArgs {
  to: string;
  body: string;
  channel?: "sms" | "whatsapp";
  fromOverride?: string | null;
  scopeClientId?: number | null;
}

export async function sendSMS(args: SendSmsArgs): Promise<string>;
// Backward-compat — pre-Wave-77 positional signature. Equivalent to
// sendSMS({ to, body, channel }) with no per-tenant override.
export async function sendSMS(
  to: string,
  body: string,
  channel?: "sms" | "whatsapp",
): Promise<string>;
export async function sendSMS(
  argsOrTo: SendSmsArgs | string,
  bodyMaybe?: string,
  channelMaybe: "sms" | "whatsapp" = "sms",
): Promise<string> {
  const args: SendSmsArgs =
    typeof argsOrTo === "string"
      ? { to: argsOrTo, body: bodyMaybe ?? "", channel: channelMaybe }
      : argsOrTo;

  const { to, body } = args;
  const channel: "sms" | "whatsapp" = args.channel ?? "sms";
  const fromOverride = args.fromOverride ?? null;
  const scopeClientId = args.scopeClientId ?? undefined;

  // Opt-out enforcement applies to SMS only (WhatsApp uses its own
  // template/opt-in flow). Throws so callers know the send didn't happen
  // and can record the skip in their own audit trail.
  if (channel === "sms" && (await isSmsOptedOut(to, scopeClientId))) {
    smsLog.info(
      `[opt-out] skipped outbound SMS to ${toE164(to)} — recipient opted out (scope=${scopeClientId ?? "global"})`,
    );
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
    const fromNumber = fromOverride || getTwilioFromNumber();
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

/**
 * Wave 77 — convenience wrapper for any "homeowner gets a text" path.
 *
 * Looks up the client's TradeLine assigned_number and sends the SMS from
 * THAT number (so the homeowner sees the trade's own line in their texting
 * app, not the shared WeFixTrades brand line). Scopes opt-outs to the
 * client so STOP from one tenant doesn't affect another.
 *
 * Falls back to the global brand line (with a warn log) when the client
 * hasn't completed TradeLine provisioning yet. In that fallback case the
 * opt-out lookup is STILL scoped to the client — a homeowner who already
 * texted STOP to John's Plumbing's tenant line stays opted out for John,
 * regardless of what number ends up actually carrying the send.
 *
 * Wave 79 — `quietHoursBypass` controls whether this send is exempt from
 * the 21:00 – 08:00 (Sun 10:00) carrier-compliance quiet-hours gate:
 *   - 'transactional' — exempt. Use only when the homeowner JUST took an
 *                       action (booking confirm, support reply, 2FA).
 *   - 'reminder' (default) — gated. Re-runs natural-retry next window.
 *   - 'marketing' — gated. Same enforcement as 'reminder' today; reserved
 *                   for future stricter rules (e.g. weekend opt-in).
 *
 * When the gate trips, the function throws `sms_quiet_hours_blocked`
 * so the caller can defer rather than silently swallow the send.
 */
export type SmsQuietHoursBypass = "transactional" | "reminder" | "marketing";

export async function sendSmsAsClient(args: {
  clientId: number;
  to: string;
  body: string;
  channel?: "sms" | "whatsapp";
  quietHoursBypass?: SmsQuietHoursBypass;
  /** Trade's configured business timezone (overrides area-code lookup). */
  fallbackTimezone?: string | null;
}): Promise<string> {
  const { clientId, to, body } = args;
  const channel = args.channel ?? "sms";
  const bypass: SmsQuietHoursBypass = args.quietHoursBypass ?? "reminder";

  // Wave 79 — quiet-hours gate. Only applies to SMS (WhatsApp uses its
  // own opt-in template flow). Skip for transactional sends.
  if (channel === "sms" && bypass !== "transactional") {
    const { isQuietHour } = await import("./lib/smsQuietHours");
    if (
      isQuietHour({
        phoneE164: to,
        fallbackTimezone: args.fallbackTimezone ?? null,
      })
    ) {
      smsLog.info(
        `[quiet-hours] deferred outbound SMS to ${to} — local quiet window (bypass=${bypass})`,
      );
      throw new Error("sms_quiet_hours_blocked");
    }
  }

  const assigned = await getClientAssignedNumber(clientId);
  if (!assigned) {
    smsLog.warn(
      `[per-tenant] client ${clientId} has no assigned number — falling back to global brand line`,
    );
  }
  return sendSMS({
    to,
    body,
    channel,
    fromOverride: assigned,
    scopeClientId: clientId,
  });
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
