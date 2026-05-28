/**
 * Wave 86 — Twilio porting rejection translator.
 *
 * Layer 6 of the fully-automated porting flow. Maps Twilio's machine
 * rejection codes (and the failure modes we surface from our own SDK
 * wrapper) into plain-English copy the customer can act on without ever
 * seeing Twilio-speak.
 *
 * Pure function. Add a new mapping → next deploy. The ~20% of edge cases
 * not in the registry surface a generic "we're reviewing — back within 24
 * hours" message AND open a support ticket (caller wires that side; this
 * function only owns the copy).
 *
 * Coverage drawn from Twilio's published porting rejection codes and our
 * own observation of failure paths from portSubmission.ts. When the
 * incoming code is null/empty we still produce the generic copy so the
 * customer-facing path never throws.
 */

export interface TranslatedRejection {
  /** Short customer-facing title, e.g. "Your account has an outstanding balance". */
  title: string;
  /** Actionable, jargon-free fix instructions. */
  fixInstructions: string;
  /**
   * When `true` the wizard surfaces a "resubmit" CTA — the failure is
   * customer-fixable. When `false` the failure is in-band for support
   * (the wizard tells the user "we're on it").
   */
  customerFixable: boolean;
  /**
   * Stable category for analytics + admin dashboard grouping. NOT shown to
   * the customer.
   */
  category:
    | "balance"
    | "identity_mismatch"
    | "account_status"
    | "carrier_lock"
    | "documentation"
    | "configuration"
    | "system_error"
    | "unknown";
}

const REGISTRY: Record<string, TranslatedRejection> = {
  /* ─── Customer-fixable: balance / billing ─────────────────────────── */
  PORT_DENIED_BALANCE_DUE: {
    title: "Your account has an outstanding balance",
    fixInstructions:
      "Pay your final bill from your current carrier. Once it clears (usually 1-3 days), come back to the dashboard and tap 'Resubmit port'.",
    customerFixable: true,
    category: "balance",
  },
  PORT_DENIED_ACCOUNT_PAST_DUE: {
    title: "Your current carrier shows a past-due balance",
    fixInstructions:
      "Settle the past-due amount with your current carrier. After payment clears, resubmit the port from your dashboard.",
    customerFixable: true,
    category: "balance",
  },

  /* ─── Customer-fixable: identity / account info mismatch ──────────── */
  PORT_DENIED_NAME_MISMATCH: {
    title: "The name on the LOA doesn't match your carrier's records",
    fixInstructions:
      "Make sure the name on the Letter of Authorization matches the account holder on your current carrier bill EXACTLY — including middle initials and business suffixes. Restart the wizard with the corrected name.",
    customerFixable: true,
    category: "identity_mismatch",
  },
  PORT_DENIED_ADDRESS_MISMATCH: {
    title: "Service address doesn't match your carrier's records",
    fixInstructions:
      "Pull up your most recent bill and re-upload — we'll re-extract the service address. If your carrier has an outdated address on file, update it with them first, then resubmit.",
    customerFixable: true,
    category: "identity_mismatch",
  },
  PORT_DENIED_ACCOUNT_NUMBER_MISMATCH: {
    title: "Account number doesn't match",
    fixInstructions:
      "Check your most recent bill for the exact account number (sometimes labelled 'Account #' or 'Customer ID'). Re-upload the bill and resubmit.",
    customerFixable: true,
    category: "identity_mismatch",
  },
  PORT_DENIED_PIN_MISMATCH: {
    title: "Your carrier requires an account PIN we don't have",
    fixInstructions:
      "Most carriers (Verizon, T-Mobile, AT&T) require you to set a transfer PIN via their app or by calling their porting line before you can port out. Set one up, then tap 'Resubmit port' on your dashboard.",
    customerFixable: true,
    category: "identity_mismatch",
  },

  /* ─── Customer-fixable: account status ────────────────────────────── */
  PORT_DENIED_NUMBER_NOT_PORTABLE: {
    title: "This number isn't eligible to be ported",
    fixInstructions:
      "Toll-free numbers, sub-accounts on a shared plan, and numbers under contract sometimes can't be ported until the contract ends. Contact your current carrier to confirm eligibility, then come back.",
    customerFixable: true,
    category: "carrier_lock",
  },
  PORT_DENIED_NUMBER_NOT_ACTIVE: {
    title: "Your current carrier marks this number as inactive",
    fixInstructions:
      "If you cancelled service recently, the number may be in a 'soft-disconnect' window. Reactivate the line with your current carrier (usually a quick phone call), then resubmit.",
    customerFixable: true,
    category: "account_status",
  },
  PORT_DENIED_NUMBER_NOT_FOUND: {
    title: "Your current carrier can't find this number on the account",
    fixInstructions:
      "Double-check the phone number on the bill matches what you entered. If the bill is for a multi-line account, confirm this specific number is yours and not another line on the plan.",
    customerFixable: true,
    category: "identity_mismatch",
  },
  PORT_DENIED_FREEZE_IN_PLACE: {
    title: "Your account has a port-freeze enabled",
    fixInstructions:
      "Call your current carrier's porting line and ask them to lift the port-freeze on your account. Once they confirm, resubmit the port from your dashboard.",
    customerFixable: true,
    category: "carrier_lock",
  },

  /* ─── Documentation issues ────────────────────────────────────────── */
  PORT_DENIED_LOA_INVALID: {
    title: "The Letter of Authorization needs additional info",
    fixInstructions:
      "Restart the wizard — we'll regenerate the LOA with the correct details. If the problem repeats, our team will reach out within 24 hours.",
    customerFixable: true,
    category: "documentation",
  },
  PORT_DENIED_BILL_INVALID: {
    title: "Your carrier needs a clearer or more recent bill",
    fixInstructions:
      "Upload your most recent bill (within the last 60 days). Make sure all four corners of the bill are visible and the text is readable.",
    customerFixable: true,
    category: "documentation",
  },

  /* ─── Internal / configuration ────────────────────────────────────── */
  twilio_not_configured: {
    title: "We're finalizing the port setup on our side",
    fixInstructions:
      "Our team will complete the carrier handoff and email you when the port is submitted. No action needed from you right now.",
    customerFixable: false,
    category: "configuration",
  },
  loa_missing: {
    title: "The LOA didn't reach our submission queue",
    fixInstructions:
      "Restart the wizard from the dashboard — your bill is already saved, so it'll only take a minute.",
    customerFixable: true,
    category: "documentation",
  },
  loa_download_failed: {
    title: "We had trouble reading the LOA",
    fixInstructions:
      "Our team is regenerating the document. You'll get an SMS once it's resubmitted.",
    customerFixable: false,
    category: "system_error",
  },
  twilio_api_unavailable: {
    title: "Our carrier connection is temporarily unavailable",
    fixInstructions:
      "We'll retry automatically every few hours. Most outages clear within 24 hours; you don't need to do anything.",
    customerFixable: false,
    category: "system_error",
  },
  twilio_rejected: {
    title: "Your carrier didn't accept the port request",
    fixInstructions:
      "Our team is reviewing the rejection. You'll hear from us within 24 hours with the next step.",
    customerFixable: false,
    category: "unknown",
  },
};

/** Fallback for codes not in the registry. */
const GENERIC: TranslatedRejection = {
  title: "Your port is being reviewed by our team",
  fixInstructions:
    "Something on the carrier side needs a closer look. Our team is on it and will be in touch within 24 hours with the next step. You don't need to do anything right now.",
  customerFixable: false,
  category: "unknown",
};

/**
 * Translate a Twilio rejection code into customer-facing copy.
 *
 * Accepts the code in any case; canonicalised via toUpperCase() before
 * lookup so case-insensitive lookups work. Returns the GENERIC entry when
 * the code is unknown / null / empty — never throws.
 */
export function translatePortRejection(
  code: string | null | undefined,
): TranslatedRejection {
  if (!code) return GENERIC;
  // Try as-is (our internal codes are lower_snake_case).
  if (REGISTRY[code]) return REGISTRY[code];
  const upper = code.toUpperCase();
  if (REGISTRY[upper]) return REGISTRY[upper];
  return GENERIC;
}

/** Whether the given code is recognised — useful for analytics dashboards. */
export function isRecognisedRejection(code: string | null | undefined): boolean {
  if (!code) return false;
  return code in REGISTRY || code.toUpperCase() in REGISTRY;
}

/** Full registry export — admin panel renders this as a reference table. */
export function listKnownRejections(): Array<{ code: string; entry: TranslatedRejection }> {
  return Object.entries(REGISTRY).map(([code, entry]) => ({ code, entry }));
}
