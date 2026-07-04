/**
 * Homeowner-facing proposal email.
 *
 * When a homeowner clicks "Email me this proposal" in the roof/solar widget,
 * the widget submits the lead with `answers.intent === "email_quote"` (already
 * wired client-side in server/roofQuote/assets/roof3d.html). This module turns
 * that flagged lead into a real, transactional email to the HOMEOWNER with the
 * branded proposal PDF attached — the counterpart to the existing
 * contractor-facing lead-notification email (server/jobs/notificationWorker.ts).
 *
 * Design goals:
 *   - PURE + injectable. The heavy lifting (should-we-send? which PDF? what
 *     copy?) is a plain function over data + injected dependencies, so it is
 *     unit-testable with NO DB and NO real SMTP (see
 *     server/jobs/homeownerProposalEmail.test.ts).
 *   - Consent: transactional only. The homeowner explicitly requested this
 *     quote by email, so it's a transactional send (no marketing consent flag
 *     required). We NEVER send if no email was provided.
 *   - Best-effort PDF: a PDF-generation failure NEVER blocks the email — we
 *     send the summary email without the attachment and log it, mirroring the
 *     contractor-notification path.
 */

import type { Calculator, Lead } from "@shared/schema";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";

/** The homeowner-requested "email me my quote" intent flag the widget stamps. */
export const EMAIL_QUOTE_INTENT = "email_quote";

/**
 * True when this lead is a homeowner who explicitly asked for their quote by
 * email AND actually gave us an email to send it to. Both are required:
 *   - `answers.intent === "email_quote"` — the homeowner clicked the button.
 *   - a non-empty `lead.email` — consent + a deliverable address. Transactional
 *     (they requested it), so no marketing-consent flag is needed.
 */
export function shouldEmailHomeownerProposal(lead: Pick<Lead, "email" | "answers">): boolean {
  const email = typeof lead.email === "string" ? lead.email.trim() : "";
  if (!email) return false;
  const answers = (lead.answers as Record<string, unknown> | null) || {};
  return answers.intent === EMAIL_QUOTE_INTENT;
}

/** Attachment shape shared by nodemailer + the orchestrator. */
export interface ProposalAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/** A rendered homeowner email, ready to hand to the transporter. */
export interface HomeownerProposalMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: ProposalAttachment[];
}

/** Result of the PDF generator (mirrors generateProposalPdf's return). */
export type ProposalPdfResult =
  | { ok: true; buffer: Buffer; filename: string }
  | { ok: false; error: string };

/** Injected side-effecting dependencies — swapped for fakes in tests. */
export interface HomeownerProposalDeps {
  /** Generate the branded proposal PDF for this lead. Best-effort. */
  generatePdf: (calc: Calculator, lead: Lead) => Promise<ProposalPdfResult>;
  /** Send the rendered message. Resolves on success, rejects on failure. */
  sendMail: (msg: HomeownerProposalMessage) => Promise<void>;
  /** Optional structured logger (defaults to console-ish no-op-safe). */
  log?: {
    info?: (msg: string, meta?: Record<string, unknown>) => void;
    warn?: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Compose the homeowner-facing email body (no side effects). Uses the shared
 * transactional shell so it matches every other WeFixTrades transactional
 * email. Marketing:false → no unsubscribe link (this is a requested quote).
 */
export function buildHomeownerProposalMessage(
  calc: Calculator,
  lead: Lead,
  attachments?: ProposalAttachment[],
): HomeownerProposalMessage {
  const businessName = String(calc.business_name || "your contractor").trim() || "your contractor";
  const firstName = (lead.name || "").trim().split(/\s+/)[0] || "there";
  const quoteDisplay =
    typeof lead.quote_amount === "number" && Number.isFinite(lead.quote_amount)
      ? `$${Math.round(lead.quote_amount).toLocaleString("en-US")}`
      : "your personalized quote";

  const subject = "Your WeFixTrades quote";

  const introHtml = attachments?.length
    ? `Thanks for using ${escapeHtml(businessName)}'s quote tool. Your personalized proposal is attached as a PDF — open it any time.`
    : `Thanks for using ${escapeHtml(businessName)}'s quote tool. Here's a summary of the estimate you requested.`;

  const html = buildTransactionalEmail({
    recipientEmail: lead.email || undefined,
    marketing: false,
    subjectForTitle: subject,
    headerTagline: escapeHtml(businessName),
    eyebrow: "Your quote is ready",
    headline: `Hi ${escapeHtml(firstName)}, here's your quote`,
    intro: introHtml,
    bodyHtml: `
      <table style="width:100%;border-collapse:collapse;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
        <tr>
          <td style="padding:14px 16px;font-size:13px;color:#8B919A;">Estimated total</td>
          <td style="padding:14px 16px;font-size:18px;color:#0d3cfc;font-weight:700;text-align:right;">${escapeHtml(quoteDisplay)}</td>
        </tr>
      </table>
      <p style="font-size:13px;color:#8B919A;line-height:1.6;margin:14px 0 0;">
        This estimate is based on the details you entered. ${escapeHtml(businessName)} will follow up to confirm
        the final scope and answer any questions.
      </p>`,
  });

  const text = buildPlainText({
    headline: `Hi ${firstName}, here's your quote`,
    intro: `Thanks for using ${businessName}'s quote tool.`,
    bodyText: [
      `Estimated total: ${quoteDisplay}`,
      attachments?.length ? `Your full proposal is attached as a PDF.` : "",
      `${businessName} will follow up to confirm the final scope.`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return {
    to: lead.email!.trim(),
    subject,
    html,
    text,
    ...(attachments?.length ? { attachments } : {}),
  };
}

/**
 * End-to-end homeowner-proposal send, pure of framework wiring: gate → generate
 * PDF (best-effort) → compose → send. Returns a small result so callers (the
 * notification worker) can record status. Throws only if `sendMail` throws —
 * PDF failures degrade to a no-attachment send.
 */
export async function sendHomeownerProposal(
  calc: Calculator,
  lead: Lead,
  deps: HomeownerProposalDeps,
): Promise<
  | { sent: true; hadAttachment: boolean }
  | { sent: false; reason: "no_intent_or_email" }
> {
  const log = deps.log || {};
  if (!shouldEmailHomeownerProposal(lead)) {
    return { sent: false, reason: "no_intent_or_email" };
  }

  let attachments: ProposalAttachment[] | undefined;
  try {
    const pdf = await deps.generatePdf(calc, lead);
    if (pdf.ok) {
      attachments = [{ filename: pdf.filename, content: pdf.buffer, contentType: "application/pdf" }];
    } else {
      log.warn?.("[homeowner-proposal] PDF generation failed; sending without attachment", {
        leadId: lead.id,
        error: pdf.error,
      });
    }
  } catch (pdfErr: any) {
    log.warn?.("[homeowner-proposal] PDF threw; sending without attachment", {
      leadId: lead.id,
      error: pdfErr?.message,
    });
  }

  const msg = buildHomeownerProposalMessage(calc, lead, attachments);
  await deps.sendMail(msg);
  log.info?.("[homeowner-proposal] sent", {
    leadId: lead.id,
    hadAttachment: !!attachments?.length,
  });
  return { sent: true, hadAttachment: !!attachments?.length };
}
