/**
 * Trade-agnostic DEFAULT homeowner proposal drip (product default).
 *
 * Context — server/routes/leadRoutes.ts already sends a TRANSACTIONAL branded proposal PDF to a homeowner
 * who clicks "Email me this proposal" (answers.intent="email_quote"). This module adds the light 2-touch
 * nudge that was left as a TODO there: a sequence that fires for those leads EVEN WHEN the tenant (the trade
 * business) hasn't configured their own follow-up drip — so every tenant gets homeowner re-engagement out of
 * the box, in a generic voice they can later override with their own configured sequence.
 *
 * Compliance + guards are handled by the shared follow-up worker (server/jobs/followupWorker.ts):
 *   - it appends the "Unsubscribe" footer + "Sent on behalf of {business}" (CAN-SPAM), and
 *   - it CANCELS the remaining sequence the moment the lead replies OR the lead status leaves "new"
 *     (i.e. the homeowner booked / was won / was archived) — so we never nag a converted lead.
 * The worker runs these despite `followup.enabled=false` via the `payload.homeowner_proposal_drip` bypass.
 *
 * Merge fields use the worker's `{{var}}` templateVars: name, business_name, quote_amount, phone, booking_link.
 */
import type { InsertFollowupJob } from "@shared/schema";

export interface HomeownerDripStep {
  type: string;
  offsetHours: number;
  subject: string;
  body: string;
}

// Two gentle touches. Kept deliberately generic (no trade-specific words) so it reads right for a roofer, a
// solar installer, a plumber, etc. A tenant who configures their own follow-up sequence supersedes this
// entirely (see the `!followup.enabled` gate at the call site).
export const HOMEOWNER_PROPOSAL_DRIP_STEPS: HomeownerDripStep[] = [
  {
    type: "homeowner_proposal_d1",
    offsetHours: 24,
    subject: "Your {{business_name}} estimate — any questions?",
    body:
      "Hi {{name}},\n\n" +
      "Thanks for requesting an estimate from {{business_name}} — your quote of {{quote_amount}} is ready whenever you are.\n\n" +
      "Happy to walk you through the details or answer anything at all. When you're ready to move forward:\n" +
      "{{booking_link}}\n\n" +
      "Or just call us: {{phone}}\n\n" +
      "— The team at {{business_name}}",
  },
  {
    type: "homeowner_proposal_d3",
    offsetHours: 72,
    subject: "Still thinking it over?",
    body:
      "Hi {{name}},\n\n" +
      "Checking in one last time about your {{business_name}} estimate ({{quote_amount}}). If now's a good time we'd love to help — and if something's holding you back, simply reply to this email and we'll make it easy.\n\n" +
      "Book a time here:\n{{booking_link}}\n\n" +
      "Or call: {{phone}}\n\n" +
      "— {{business_name}}",
  },
];

export interface HomeownerDripOpts {
  calculatorId: number;
  /** A homeowner-facing link (the tenant's configured booking link, else their hosted calculator URL). */
  bookingLink?: string;
}

/**
 * Build the follow-up job rows for the default homeowner drip. Returns [] when the lead has no email
 * (the sequence is email-only). The caller enqueues these via storage.enqueueFollowupJobs.
 */
export function buildHomeownerProposalDripJobs(
  lead: any,
  calc: any,
  opts: HomeownerDripOpts,
): InsertFollowupJob[] {
  if (!lead?.email) return [];
  const now = Date.now();
  const personalization = {
    business_name: calc?.business_name || "your contractor",
    phone: calc?.owner_phone || "",
    booking_link: opts.bookingLink || "",
    service_area: "",
  };
  return HOMEOWNER_PROPOSAL_DRIP_STEPS.map((step) => ({
    lead_id: lead.id,
    calculator_id: opts.calculatorId,
    run_at: new Date(now + step.offsetHours * 60 * 60 * 1000),
    type: step.type,
    channel: "email",
    status: "pending",
    payload: {
      // The bypass flag the worker checks so this default drip runs even when the tenant hasn't turned on
      // their own follow-up sequence. All other worker guards (reply/status-cancel, quiet hours, unsubscribe)
      // still apply.
      homeowner_proposal_drip: true,
      template: { subject: step.subject, body: step.body },
      personalization,
    },
  })) as InsertFollowupJob[];
}
