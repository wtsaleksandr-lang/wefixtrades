/**
 * Wave 81 — QuoteQuick homeowner SMS templates + helpers.
 *
 * Per-flow templates and a small `interpolate(template, vars)` helper for
 * `${var}`-style substitution. Templates live here for the four homeowner
 * flows added in this wave:
 *
 *   1. Quote-ready (transactional)
 *   2. Deposit-receipt (transactional)
 *   3. Quote-expires-soon (reminder)
 *   4. Post-job thank-you (reminder)
 *
 * NOTE — Wave 82 will centralize all WeFixTrades SMS templates behind a
 * single template registry (per the SMS audit). For Wave 81 we keep
 * templates local to the QuoteQuick flow so the registry refactor is a
 * clean, self-contained next step.
 *
 * Every template ends with the carrier-compliance opt-out footer
 * (`Reply STOP to opt out, HELP for help.`) on the transactional sends.
 * Reminder sends skip the inline footer because the homeowner has already
 * received at least one transactional SMS from this trade carrying the
 * opt-out, and the keyword handler enforces STOP/HELP regardless of body.
 */

/**
 * Substitute `${var}` placeholders in a template string with values from
 * `vars`. Missing keys render as empty strings (matches the failure mode
 * of native template literals — the homeowner sees a missing word, not
 * `${trade_name}` as literal text in their inbox).
 *
 * The regex purposefully matches `${ident}` with optional whitespace, so
 * `${ trade_name }` works the same as `${trade_name}` for the few legacy
 * templates that were authored with spaces.
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\$\{\s*(\w+)\s*\}/g, (_match, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

/**
 * Format a USD cents amount as a human-readable dollar string.
 *   2500 → "$25"     (whole dollar)
 *   2599 → "$25.99"  (sub-dollar precision preserved)
 *   null → ""        (template renders empty so we don't leak NaN)
 */
export function formatAmountCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  const dollars = cents / 100;
  // Whole-dollar amounts read more naturally without the trailing ".00"
  // in a 160-char SMS body.
  return dollars % 1 === 0
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

/**
 * Format a numeric dollar amount (already in dollars, not cents) for
 * the same display rules as `formatAmountCents`. Used by the quote-ready
 * flow where `leads.quote_amount` is stored as whole dollars (not cents).
 */
export function formatAmountDollars(dollars: number | null | undefined): string {
  if (dollars == null || !Number.isFinite(dollars)) return "";
  return dollars % 1 === 0
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

/** Templates — keep tight to stay under the 160-char single-segment cap. */
export const QUOTEQUICK_SMS_TEMPLATES = {
  /** 1. Quote-ready (transactional). Fires on form completion. */
  quoteReady:
    "Your ${trade_name} quote: ${amount}. View + reserve: ${quote_link}. Reply STOP to opt out, HELP for help.",

  /** 2. Deposit-receipt (transactional). Fires on payment_intent.succeeded. */
  depositReceipt:
    "Deposit of ${amount} received for your ${trade_name} booking. Confirmation #${ref}. Receipt: ${link}",

  /** 3. Expires-soon (reminder). Cron, ~24h before expiry. */
  expiresSoon:
    "Your ${trade_name} quote expires tomorrow at ${time}. Lock it in: ${quote_link}",

  /** 4. Post-job thank-you (reminder). Cron, ~1h after completion. */
  postJobThankYou:
    "Thanks for choosing ${trade_name}! How did it go? Reply 1-5 (1=poor, 5=excellent). Or leave a review: ${review_link}",
} as const;

export type QuotequickSmsTemplateKey = keyof typeof QUOTEQUICK_SMS_TEMPLATES;

/**
 * Format a "tomorrow at HH:MM" string for the expires-soon reminder.
 * Falls back to "tomorrow" if the input is unparseable so we never ship
 * "tomorrow at NaN" to a homeowner.
 */
export function formatExpiresTime(
  expiresAt: Date | string | null | undefined,
  timezone: string | null = null,
): string {
  if (!expiresAt) return "tomorrow";
  const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (!Number.isFinite(d.getTime())) return "tomorrow";
  try {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone || undefined,
    });
  } catch {
    // Invalid timezone → fall back to UTC formatting.
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}
