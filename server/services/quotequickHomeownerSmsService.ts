/**
 * Wave 81 — QuoteQuick homeowner SMS service.
 *
 * Centralizes the four homeowner-facing SMS flows added in Wave 81:
 *
 *   1. sendQuoteReadySms       — fired by leadRoutes on submission success
 *   2. sendDepositReceiptSms   — fired by stripeBillingRoutes webhook
 *   3. sendExpiresSoonSms      — fired by quotequickExpiresSoonWorker cron
 *   4. sendPostJobThankYouSms  — fired by quotequickPostJobWorker cron
 *
 * Each entry:
 *   - resolves the owning client via calculator.user_id → clients.user_id,
 *   - falls back to the shared brand line when the calculator has no
 *     linked client row (legacy / demo flows) — matches followupWorker,
 *   - routes through sendSmsAsClient with the correct quietHoursBypass,
 *   - records a row in sms_messages for audit-trail parity with
 *     followup/owner-alert sends,
 *   - is idempotent (caller stamps the *_sent_at column AFTER the send
 *     returns; if the send throws sms_quiet_hours_blocked or any other
 *     error, the stamp is NOT written so the next tick re-attempts).
 *
 * Send results are typed so callers can:
 *   - skip the stamp on { ok: false, reason: 'deferred' } and let the
 *     next cron tick re-attempt naturally (quiet hours, opt-out),
 *   - permanently abandon on { ok: false, reason: 'no_consent' | ... }
 *     by stamping anyway (handled per-flow inside the workers).
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { clients, calculators } from "@shared/schema";
import { sendSmsAsClient, storeSmsMessage } from "../twilioClient";
import { createLogger } from "../lib/logger";
import {
  QUOTEQUICK_SMS_TEMPLATES,
  formatAmountDollars,
  formatAmountCents,
  formatExpiresTime,
  interpolate,
} from "../lib/quotequickHomeownerSms";
import { buildHostedUrl } from "@shared/slugUtils";

const log = createLogger("QuotequickHomeownerSms");

export type SmsSendResult =
  | { ok: true; twilio_sid: string }
  | { ok: false; reason: "no_consent" | "no_phone" | "no_calculator" | "deferred" | "send_failed"; error?: string };

/**
 * Resolve the per-tenant client_id that owns this calculator. Returns
 * `null` when the calculator is anonymous (no user_id) or no clients row
 * exists for the user. Caller decides whether to skip or fall through to
 * the global brand line.
 */
async function resolveClientIdForCalculator(
  calculatorId: number,
): Promise<{ clientId: number | null; calculator: any | null }> {
  const [calc] = await db
    .select()
    .from(calculators)
    .where(eq(calculators.id, calculatorId))
    .limit(1);
  if (!calc) return { clientId: null, calculator: null };
  if (calc.user_id == null) return { clientId: null, calculator: calc };
  const [c] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, calc.user_id))
    .limit(1);
  return { clientId: c?.id ?? null, calculator: calc };
}

/**
 * Build the public homeowner-facing quote link. Uses the hosted slug when
 * the calculator has one; falls back to the APP_URL embed path when the
 * slug is null (paid tier without a custom subdomain, etc.).
 */
function buildQuoteLink(calc: { slug: string | null }): string {
  if (calc.slug) return buildHostedUrl(calc.slug);
  const base = (process.env.APP_URL || "https://wefixtrades.com").replace(/\/$/, "");
  return `${base}/`;
}

/**
 * Build the per-trade review link surfaced in the post-job thank-you SMS.
 * Prefers the calculator's hosted page (which carries a "Leave a review"
 * CTA in the existing widget shell). Wave 82+ may replace with a direct
 * Google review shortlink once the per-client GBP place_id is available
 * to QuoteQuick context.
 */
function buildReviewLink(calc: { slug: string | null }): string {
  return buildQuoteLink(calc);
}

/* ─── Flow 1 — Quote-ready (transactional) ──────────────────────────── */

export interface QuoteReadyParams {
  leadId: number;
  calculatorId: number;
  phone: string;
  quoteAmountDollars: number | null;
  smsConsent: boolean;
}

/**
 * Send the quote-ready confirmation to the homeowner immediately after
 * submission. Transactional — bypasses quiet hours because the homeowner
 * JUST clicked Submit.
 */
export async function sendQuoteReadySms(
  params: QuoteReadyParams,
): Promise<SmsSendResult> {
  const { leadId, calculatorId, phone, quoteAmountDollars, smsConsent } = params;

  if (!smsConsent) return { ok: false, reason: "no_consent" };
  if (!phone) return { ok: false, reason: "no_phone" };

  const { clientId, calculator } = await resolveClientIdForCalculator(calculatorId);
  if (!calculator) return { ok: false, reason: "no_calculator" };

  const body = interpolate(QUOTEQUICK_SMS_TEMPLATES.quoteReady, {
    trade_name: calculator.business_name || "your trade",
    amount: formatAmountDollars(quoteAmountDollars),
    quote_link: buildQuoteLink(calculator),
  });

  try {
    let twilioSid: string;
    if (clientId != null) {
      twilioSid = await sendSmsAsClient({
        clientId,
        to: phone,
        body,
        channel: "sms",
        quietHoursBypass: "transactional",
      });
    } else {
      // Anonymous / legacy calculator without a clients row. Fall back to
      // the global brand line via sendSmsAsClient with clientId=0; the
      // downstream lookup returns null and routes through the brand line.
      log.warn(
        `[quote-ready] calculator ${calculatorId} has no clients row — falling back to brand line`,
      );
      const { sendSMS } = await import("../twilioClient");
      twilioSid = await sendSMS({ to: phone, body });
    }

    await storeSmsMessage({
      lead_id: leadId,
      calculator_id: calculatorId,
      direction: "outbound",
      channel: "sms",
      body,
      to_number: phone,
      twilio_sid: twilioSid,
      is_ai: false,
    });

    return { ok: true, twilio_sid: twilioSid };
  } catch (err: any) {
    if (err?.message === "sms_quiet_hours_blocked") {
      // Transactional shouldn't trip quiet hours, but if it does we treat
      // it as deferred so the caller doesn't stamp _sent_at.
      return { ok: false, reason: "deferred", error: err.message };
    }
    if (err?.message === "sms_recipient_opted_out") {
      // Stamp the column so we don't retry; homeowner already said STOP.
      return { ok: false, reason: "no_consent", error: err.message };
    }
    log.error("[quote-ready] send failed", { error: err?.message, leadId });
    return { ok: false, reason: "send_failed", error: err?.message };
  }
}

/* ─── Flow 2 — Deposit-receipt (transactional) ──────────────────────── */

export interface DepositReceiptParams {
  depositId: number;
  calculatorId: number;
  leadId: number | null;
  phone: string;
  amountCents: number;
  smsConsent: boolean;
  stripeSessionId: string;
}

/**
 * Send the deposit-receipt SMS after Stripe confirms payment. Transactional
 * — the homeowner JUST completed checkout, so quiet-hours is bypassed.
 *
 * Confirmation number is the deposit row id (zero-padded so the message
 * reads cleanly: "Confirmation #00042"). The receipt link points to the
 * homeowner-facing quote page with a deposit-success query flag, which
 * the existing widget shell already renders as a success state.
 */
export async function sendDepositReceiptSms(
  params: DepositReceiptParams,
): Promise<SmsSendResult> {
  const { depositId, calculatorId, leadId, phone, amountCents, smsConsent } = params;

  if (!smsConsent) return { ok: false, reason: "no_consent" };
  if (!phone) return { ok: false, reason: "no_phone" };

  const { clientId, calculator } = await resolveClientIdForCalculator(calculatorId);
  if (!calculator) return { ok: false, reason: "no_calculator" };

  const ref = String(depositId).padStart(5, "0");
  const link = calculator.slug
    ? `${buildHostedUrl(calculator.slug)}?deposit=success&deposit_id=${depositId}`
    : buildQuoteLink(calculator);

  const body = interpolate(QUOTEQUICK_SMS_TEMPLATES.depositReceipt, {
    trade_name: calculator.business_name || "your trade",
    amount: formatAmountCents(amountCents),
    ref,
    link,
  });

  try {
    let twilioSid: string;
    if (clientId != null) {
      twilioSid = await sendSmsAsClient({
        clientId,
        to: phone,
        body,
        channel: "sms",
        quietHoursBypass: "transactional",
      });
    } else {
      log.warn(
        `[deposit-receipt] calculator ${calculatorId} has no clients row — falling back to brand line`,
      );
      const { sendSMS } = await import("../twilioClient");
      twilioSid = await sendSMS({ to: phone, body });
    }

    await storeSmsMessage({
      lead_id: leadId ?? undefined,
      calculator_id: calculatorId,
      direction: "outbound",
      channel: "sms",
      body,
      to_number: phone,
      twilio_sid: twilioSid,
      is_ai: false,
    });

    return { ok: true, twilio_sid: twilioSid };
  } catch (err: any) {
    if (err?.message === "sms_quiet_hours_blocked") {
      return { ok: false, reason: "deferred", error: err.message };
    }
    if (err?.message === "sms_recipient_opted_out") {
      return { ok: false, reason: "no_consent", error: err.message };
    }
    log.error("[deposit-receipt] send failed", { error: err?.message, depositId });
    return { ok: false, reason: "send_failed", error: err?.message };
  }
}

/* ─── Flow 3 — Expires-soon (reminder) ──────────────────────────────── */

export interface ExpiresSoonParams {
  leadId: number;
  calculatorId: number;
  phone: string;
  smsConsent: boolean;
  expiresAt: Date | string;
}

/**
 * Send the expires-soon reminder ~24h before the quote expires. Reminder
 * class — honors the local quiet-hours window. Worker re-runs hourly and
 * naturally picks up deferred sends in the next quiet-hours-clear tick.
 */
export async function sendExpiresSoonSms(
  params: ExpiresSoonParams,
): Promise<SmsSendResult> {
  const { leadId, calculatorId, phone, smsConsent, expiresAt } = params;

  if (!smsConsent) return { ok: false, reason: "no_consent" };
  if (!phone) return { ok: false, reason: "no_phone" };

  const { clientId, calculator } = await resolveClientIdForCalculator(calculatorId);
  if (!calculator) return { ok: false, reason: "no_calculator" };

  // Time is rendered in the trade's configured timezone when set, falling
  // back to America/Toronto (the platform default) so we never display
  // raw UTC to a North-American homeowner.
  const settings = (calculator.calculator_settings as any) || {};
  const timezone =
    settings.booking_settings?.timezone ||
    settings.integrations?.timezone ||
    "America/Toronto";

  const body = interpolate(QUOTEQUICK_SMS_TEMPLATES.expiresSoon, {
    trade_name: calculator.business_name || "your trade",
    time: formatExpiresTime(expiresAt, timezone),
    quote_link: buildQuoteLink(calculator),
  });

  try {
    let twilioSid: string;
    if (clientId != null) {
      twilioSid = await sendSmsAsClient({
        clientId,
        to: phone,
        body,
        channel: "sms",
        quietHoursBypass: "reminder",
        fallbackTimezone: timezone,
      });
    } else {
      log.warn(
        `[expires-soon] calculator ${calculatorId} has no clients row — falling back to brand line`,
      );
      const { sendSMS } = await import("../twilioClient");
      twilioSid = await sendSMS({ to: phone, body });
    }

    await storeSmsMessage({
      lead_id: leadId,
      calculator_id: calculatorId,
      direction: "outbound",
      channel: "sms",
      body,
      to_number: phone,
      twilio_sid: twilioSid,
      is_ai: false,
    });

    return { ok: true, twilio_sid: twilioSid };
  } catch (err: any) {
    if (err?.message === "sms_quiet_hours_blocked") {
      return { ok: false, reason: "deferred", error: err.message };
    }
    if (err?.message === "sms_recipient_opted_out") {
      return { ok: false, reason: "no_consent", error: err.message };
    }
    log.error("[expires-soon] send failed", { error: err?.message, leadId });
    return { ok: false, reason: "send_failed", error: err?.message };
  }
}

/* ─── Flow 4 — Post-job thank-you (reminder) ────────────────────────── */

export interface PostJobThankYouParams {
  appointmentId: number;
  clientId: number;
  calculatorId: number | null;
  phone: string;
  smsConsent: boolean;
  fallbackTimezone?: string | null;
}

/**
 * Send the post-job thank-you SMS ~1h after a QuoteQuick-source booking
 * completes. Reminder class — honors quiet hours.
 *
 * The `calculatorId` is best-effort; bookflow_appointments doesn't
 * directly carry a calculator_id, so the worker passes through `null`
 * when no calculator context is available. We still need a calculator
 * to build the review link, so when `calculatorId` is null we fall back
 * to the platform-level APP_URL — the homeowner will land on the brand
 * landing page rather than the trade's per-tenant page. Better than
 * dropping the SMS entirely; Wave 82 may revisit by joining
 * scheduled_appointments → leads → calculator.
 */
export async function sendPostJobThankYouSms(
  params: PostJobThankYouParams,
): Promise<SmsSendResult> {
  const { appointmentId, clientId, calculatorId, phone, smsConsent, fallbackTimezone } = params;

  if (!smsConsent) return { ok: false, reason: "no_consent" };
  if (!phone) return { ok: false, reason: "no_phone" };

  // Look up the client's trade name + slug for personalization. Falls
  // back gracefully when the row is missing.
  let tradeName = "your trade";
  let reviewLink = (process.env.APP_URL || "https://wefixtrades.com").replace(/\/$/, "") + "/";
  let calculator: any | null = null;

  if (calculatorId != null) {
    const result = await resolveClientIdForCalculator(calculatorId);
    calculator = result.calculator;
    if (calculator) {
      tradeName = calculator.business_name || tradeName;
      reviewLink = buildReviewLink(calculator);
    }
  } else {
    const [c] = await db
      .select({ business_name: clients.business_name })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (c?.business_name) tradeName = c.business_name;
  }

  const body = interpolate(QUOTEQUICK_SMS_TEMPLATES.postJobThankYou, {
    trade_name: tradeName,
    review_link: reviewLink,
  });

  try {
    const twilioSid = await sendSmsAsClient({
      clientId,
      to: phone,
      body,
      channel: "sms",
      quietHoursBypass: "reminder",
      fallbackTimezone: fallbackTimezone ?? null,
    });

    await storeSmsMessage({
      calculator_id: calculator?.id ?? calculatorId ?? undefined,
      direction: "outbound",
      channel: "sms",
      body,
      to_number: phone,
      twilio_sid: twilioSid,
      is_ai: false,
    });

    return { ok: true, twilio_sid: twilioSid };
  } catch (err: any) {
    if (err?.message === "sms_quiet_hours_blocked") {
      return { ok: false, reason: "deferred", error: err.message };
    }
    if (err?.message === "sms_recipient_opted_out") {
      return { ok: false, reason: "no_consent", error: err.message };
    }
    log.error("[post-job] send failed", { error: err?.message, appointmentId });
    return { ok: false, reason: "send_failed", error: err?.message };
  }
}
