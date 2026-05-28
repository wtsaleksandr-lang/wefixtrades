/**
 * Wave 82 — Central SMS template registry.
 *
 * Single source of truth for every homeowner-facing SMS the platform fires.
 * Each entry pins:
 *   - `defaultBody`  the exact wording shipped to homeowners when the trade
 *                    hasn't overridden it (templates are NOT changed in
 *                    Wave 82 — bodies were lifted verbatim from the
 *                    pre-existing per-product modules).
 *   - `vars`         declared placeholder names so the Wave 83 portal UI
 *                    can offer autocompletion and validation.
 *   - `defaultEnabled` whether the send happens by default for a new tenant.
 *   - `canBeDisabled`  guard against muting compliance-critical sends; the
 *                      portal endpoint and resolver both honor this flag.
 *   - `quietHoursBypass` the bypass class passed down to sendSmsAsClient
 *                        (transactional skips, reminder defers to next
 *                        morning, marketing is blocked outright).
 *
 * The matching DB table `sms_template_overrides` stores per-tenant
 * overrides as `(client_id, template_id) → {enabled?, body_override?}`.
 * Missing keys fall through to the defaults below — that's intentional so
 * carrier-compliance footers can't be silently dropped by a half-written
 * override.
 *
 * The placeholder syntax is `{var}` (single-brace). That matches the
 * BookFlow templates already shipped in Wave 80 and was retrofitted onto
 * the QuoteQuick templates (originally `${var}`) when they were lifted
 * here so the registry has one rule, not two.
 */

export type SmsTemplateId =
  // BookFlow homeowner flows (Wave 80)
  | "bookflow.confirmation"
  | "bookflow.day_of_reminder"
  | "bookflow.eta"
  | "bookflow.post_appointment"
  | "bookflow.no_show_recovery"
  // QuoteQuick homeowner flows (Wave 81)
  | "quotequick.quote_ready"
  | "quotequick.deposit_receipt"
  | "quotequick.expires_soon"
  | "quotequick.post_job_thank_you"
  // ReputationShield review request + follow-ups
  | "reputation.review_request"
  | "reputation.review_followup_1"
  | "reputation.review_followup_2"
  // TradeLine homeowner-direction sends
  | "tradeline.after_hours_apology"
  | "tradeline.owner_missed_call_alert"
  // Wave 86 — port-status milestone updates fired from the status poller.
  | "tradeline.port_status_submitted"
  | "tradeline.port_status_pending_carrier"
  | "tradeline.port_status_pending_loa"
  | "tradeline.port_status_failed"
  | "tradeline.port_status_complete";

export type SmsTemplateProduct =
  | "bookflow"
  | "quotequick"
  | "reputation"
  | "tradeline";

export type SmsTemplateCategory =
  | "transactional"
  | "reminder"
  | "marketing";

export type QuietHoursBypassClass =
  | "transactional"
  | "reminder"
  | "marketing";

export interface SmsTemplate {
  id: SmsTemplateId;
  product: SmsTemplateProduct;
  category: SmsTemplateCategory;
  /** Whether the send fires by default for a brand-new tenant. */
  defaultEnabled: boolean;
  /** Default wording (carrier-compliance footers preserved verbatim). */
  defaultBody: string;
  /** Declared `{var}` placeholders — drives the Wave 83 portal autocomplete. */
  vars: string[];
  /** One-liner shown next to the template in the portal settings UI. */
  description: string;
  /** Bypass class threaded into sendSmsAsClient at send time. */
  quietHoursBypass: QuietHoursBypassClass;
  /**
   * Compliance / business-rule guardrail. When false the resolver refuses
   * to honor a `disabled` override (the portal also greys out the toggle).
   * Examples: a deposit receipt is contractually required, so the tenant
   * can edit the wording but not silence the send.
   */
  canBeDisabled: boolean;
}

/* ─── Registry entries ──────────────────────────────────────────────────
 *
 * Bodies below mirror what shipped through Waves 80 + 81 + earlier review/
 * tradeline flows. Don't reword them here — Wave 82 is a relocate-only
 * refactor; Wave 83's portal UI is where homeowners' wording gets edited.
 */
export const SMS_TEMPLATE_REGISTRY: Record<SmsTemplateId, SmsTemplate> = {
  /* ── BookFlow ───────────────────────────────────────────────────── */
  "bookflow.confirmation": {
    id: "bookflow.confirmation",
    product: "bookflow",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "Booked! {brand_name}: {service_name} on {date} at {time}. Reply STOP to opt out, HELP for help. Manage: {manage_link}",
    vars: ["brand_name", "service_name", "date", "time", "manage_link"],
    description:
      "Sent immediately after a homeowner books an appointment. Carries the STOP/HELP opt-out footer (carrier-required first SMS).",
    quietHoursBypass: "transactional",
    // Booking-confirmation is the first homeowner SMS for this booking and
    // carries the carrier opt-out footer. Disabling it would also drop the
    // manage-link the homeowner uses to cancel — keep mandatory.
    canBeDisabled: false,
  },
  "bookflow.day_of_reminder": {
    id: "bookflow.day_of_reminder",
    product: "bookflow",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "Reminder: {brand_name} is scheduled today at {time}. Reply 1 to confirm, 2 to reschedule. STOP to opt out.",
    vars: ["brand_name", "time"],
    description:
      "Fires 3-4 hours before the appointment so the homeowner can confirm or reschedule.",
    quietHoursBypass: "transactional",
    canBeDisabled: true,
  },
  "bookflow.eta": {
    id: "bookflow.eta",
    product: "bookflow",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "{tech_name} from {brand_name} is on the way! ETA {eta_time}. Track: {track_link}",
    vars: ["tech_name", "brand_name", "eta_time", "track_link"],
    description:
      "Fires when the technician taps 'on my way'. Includes an optional tracking link.",
    quietHoursBypass: "transactional",
    canBeDisabled: true,
  },
  "bookflow.post_appointment": {
    id: "bookflow.post_appointment",
    product: "bookflow",
    category: "reminder",
    defaultEnabled: true,
    defaultBody:
      "Thanks for choosing {brand_name}! How did it go? Reply with a number 1-5 (1=poor, 5=excellent). Or leave a review: {review_link}",
    vars: ["brand_name", "review_link"],
    description:
      "Fires ~30 minutes after the appointment is marked completed. Honors quiet hours.",
    quietHoursBypass: "reminder",
    canBeDisabled: true,
  },
  "bookflow.no_show_recovery": {
    id: "bookflow.no_show_recovery",
    product: "bookflow",
    category: "reminder",
    defaultEnabled: true,
    defaultBody:
      "Hi! We missed you for your {service_name} appointment today. Want to reschedule? Reply YES or visit: {reschedule_link}",
    vars: ["service_name", "reschedule_link"],
    description:
      "Fires 1-2 hours after a no-show window closes, offering a reschedule link.",
    quietHoursBypass: "reminder",
    canBeDisabled: true,
  },

  /* ── QuoteQuick ─────────────────────────────────────────────────── */
  "quotequick.quote_ready": {
    id: "quotequick.quote_ready",
    product: "quotequick",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "Your {trade_name} quote: {amount}. View + reserve: {quote_link}. Reply STOP to opt out, HELP for help.",
    vars: ["trade_name", "amount", "quote_link"],
    description:
      "Fires the moment a homeowner submits the quote form. Carries the STOP/HELP opt-out footer.",
    quietHoursBypass: "transactional",
    // First QuoteQuick SMS for this homeowner — carries opt-out footer.
    canBeDisabled: false,
  },
  "quotequick.deposit_receipt": {
    id: "quotequick.deposit_receipt",
    product: "quotequick",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "Deposit of {amount} received for your {trade_name} booking. Confirmation #{ref}. Receipt: {link}",
    vars: ["trade_name", "amount", "ref", "link"],
    description:
      "Fires after Stripe confirms the deposit. Tenants can edit the wording but cannot silence the receipt.",
    quietHoursBypass: "transactional",
    // Deposit receipt is contractually required for proof-of-payment — the
    // wording is editable but the send itself cannot be disabled.
    canBeDisabled: false,
  },
  "quotequick.expires_soon": {
    id: "quotequick.expires_soon",
    product: "quotequick",
    category: "reminder",
    defaultEnabled: true,
    defaultBody:
      "Your {trade_name} quote expires tomorrow at {time}. Lock it in: {quote_link}",
    vars: ["trade_name", "time", "quote_link"],
    description:
      "Fires ~24h before quote expiry to nudge the homeowner. Honors quiet hours.",
    quietHoursBypass: "reminder",
    canBeDisabled: true,
  },
  "quotequick.post_job_thank_you": {
    id: "quotequick.post_job_thank_you",
    product: "quotequick",
    category: "reminder",
    defaultEnabled: true,
    defaultBody:
      "Thanks for choosing {trade_name}! How did it go? Reply 1-5 (1=poor, 5=excellent). Or leave a review: {review_link}",
    vars: ["trade_name", "review_link"],
    description:
      "Fires ~1 hour after a QuoteQuick-sourced booking is marked completed.",
    quietHoursBypass: "reminder",
    canBeDisabled: true,
  },

  /* ── ReputationShield ───────────────────────────────────────────── */
  "reputation.review_request": {
    id: "reputation.review_request",
    product: "reputation",
    category: "reminder",
    defaultEnabled: true,
    defaultBody:
      "Hi {customer_name}, how was your experience with {business_name}? Share your feedback: {feedback_url}",
    vars: ["customer_name", "business_name", "feedback_url"],
    description:
      "Initial review request, fired ~2 hours after a job is marked completed.",
    quietHoursBypass: "reminder",
    canBeDisabled: true,
  },
  "reputation.review_followup_1": {
    id: "reputation.review_followup_1",
    product: "reputation",
    category: "reminder",
    defaultEnabled: true,
    defaultBody:
      "Hi {customer_name}, just a reminder — we'd love your feedback on {business_name}. Takes 1 min: {feedback_url}",
    vars: ["customer_name", "business_name", "feedback_url"],
    description:
      "First follow-up if the initial review request goes unanswered (1 day after initial send).",
    quietHoursBypass: "reminder",
    canBeDisabled: true,
  },
  "reputation.review_followup_2": {
    id: "reputation.review_followup_2",
    product: "reputation",
    category: "reminder",
    defaultEnabled: true,
    defaultBody:
      "Hi {customer_name}, last chance to share your experience with {business_name}: {feedback_url}",
    vars: ["customer_name", "business_name", "feedback_url"],
    description:
      "Final follow-up (3 days after initial send). No further nudges after this.",
    quietHoursBypass: "reminder",
    canBeDisabled: true,
  },

  /* ── TradeLine ──────────────────────────────────────────────────── */
  "tradeline.after_hours_apology": {
    id: "tradeline.after_hours_apology",
    product: "tradeline",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "Thanks for calling {brand_name}! We received your message about {job_type}. We'll get back to you during business hours. — {brand_name}",
    vars: ["brand_name", "job_type"],
    description:
      "Sent to a caller whose call landed outside business hours. Transactional because the homeowner JUST called.",
    quietHoursBypass: "transactional",
    canBeDisabled: true,
  },
  "tradeline.owner_missed_call_alert": {
    id: "tradeline.owner_missed_call_alert",
    product: "tradeline",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "New call from {caller_name} ({caller_phone}). {job_type} - {urgency}. {summary}. View: {portal_url}",
    vars: [
      "caller_name",
      "caller_phone",
      "job_type",
      "urgency",
      "summary",
      "portal_url",
    ],
    description:
      "Owner-facing alert sent to the trade's configured numbers after a TradeLine call closes.",
    quietHoursBypass: "transactional",
    canBeDisabled: true,
  },

  /* ── TradeLine port-status updates (Wave 86) ───────────────────────── */
  "tradeline.port_status_submitted": {
    id: "tradeline.port_status_submitted",
    product: "tradeline",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "Your port to keep {phone_number} is in progress. Typical timeline is 7-14 business days; we'll update you at each milestone. Track: {status_url}",
    vars: ["phone_number", "status_url"],
    description:
      "Fires when the port is successfully submitted to Twilio. Sets the timeline expectation.",
    quietHoursBypass: "transactional",
    // Port milestone updates are transactional but tenants can mute if they
    // prefer to email-only — the customer can also opt out via STOP.
    canBeDisabled: true,
  },
  "tradeline.port_status_pending_carrier": {
    id: "tradeline.port_status_pending_carrier",
    product: "tradeline",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "Update on porting {phone_number}: your current carrier is reviewing. {progress}. Account is in good standing. Track: {status_url}",
    vars: ["phone_number", "progress", "status_url"],
    description:
      "Fires when Twilio reports the losing carrier is now reviewing the request. Reassures the customer that no action is required.",
    quietHoursBypass: "transactional",
    canBeDisabled: true,
  },
  "tradeline.port_status_pending_loa": {
    id: "tradeline.port_status_pending_loa",
    product: "tradeline",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "Quick action needed for porting {phone_number}: please check your email for the next step. Or tap: {status_url}",
    vars: ["phone_number", "status_url"],
    description:
      "Rare path — carrier asked for additional documentation. Customer needs to take an action.",
    quietHoursBypass: "transactional",
    // Customer-action template — never silence.
    canBeDisabled: false,
  },
  "tradeline.port_status_failed": {
    id: "tradeline.port_status_failed",
    product: "tradeline",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "Porting {phone_number} didn't go through: {reason_title}. {fix_action}. Details: {status_url}",
    vars: ["phone_number", "reason_title", "fix_action", "status_url"],
    description:
      "Fires when the port is rejected. Uses portRejectionTranslator output for plain-English copy.",
    quietHoursBypass: "transactional",
    canBeDisabled: false,
  },
  "tradeline.port_status_complete": {
    id: "tradeline.port_status_complete",
    product: "tradeline",
    category: "transactional",
    defaultEnabled: true,
    defaultBody:
      "Done! Your number {phone_number} is now active on WeFixTrades. Try calling it to test. — {brand_name}",
    vars: ["phone_number", "brand_name"],
    description:
      "Fires when the port completes successfully. Celebratory + call-to-action.",
    quietHoursBypass: "transactional",
    canBeDisabled: false,
  },
};

/** Convenience — every registry id, in declaration order. */
export const SMS_TEMPLATE_IDS: SmsTemplateId[] = Object.keys(
  SMS_TEMPLATE_REGISTRY,
) as SmsTemplateId[];

/**
 * Strict `{var}` interpolation. Unknown variables are left LITERAL in the
 * output so production logs surface broken templates ("…at {time}…")
 * instead of silently dropping the value — matches the BookFlow helper
 * shipped in Wave 80 (`server/lib/bookflowSmsTemplates.ts`).
 *
 * Null / undefined / empty-string vars are treated as missing so the
 * literal placeholder survives and a downstream observability sweep can
 * spot it. Numeric vars are coerced to string with `String()`.
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (match, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null || v === "") return match;
    return String(v);
  });
}
