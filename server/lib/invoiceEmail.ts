/**
 * BookFlow invoice email — sent when tradesperson clicks "Send Invoice".
 *
 * Uses the transactional shell for a clean, mobile-first email.
 * Shows line items, total, due date, and a big "Pay Now" button.
 */

import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { createLogger } from "./logger";

const log = createLogger("InvoiceEmail");

interface InvoiceEmailParams {
  recipientEmail: string;
  customerName: string;
  businessName: string;
  invoiceNumber: string;
  lineItems: Array<{ description: string; quantity: number; unit_price_cents: number }>;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  dueDate: Date | null;
  notes: string | null;
  payUrl: string;
  /** Optional override for the email subject. Defaults to
   *  `Invoice {n} from {businessName}`. */
  subjectOverride?: string;
  /** Optional override for the friendly intro line above the invoice body. */
  introOverride?: string;
  /** Optional PDF attachment (Phase A — attached on every send). */
  pdfAttachment?: { filename: string; buffer: Buffer };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildLineItemRows(items: InvoiceEmailParams["lineItems"]): string {
  return items
    .map(
      (li) => `
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#CDD1D6;border-bottom:1px solid rgba(255,255,255,0.06);">
          ${li.description}
        </td>
        <td style="padding:8px 0;font-size:14px;color:#CDD1D6;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);">
          ${li.quantity}
        </td>
        <td style="padding:8px 0;font-size:14px;color:#F0F0F0;text-align:right;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.06);">
          ${formatCents(li.quantity * li.unit_price_cents)}
        </td>
      </tr>`
    )
    .join("");
}

export async function sendInvoiceEmail(params: InvoiceEmailParams): Promise<void> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    log.warn("Skipping invoice email — no transporter configured");
    return;
  }

  const dueDateStr = params.dueDate ? formatDate(params.dueDate) : null;

  const bodyHtml = `
    <div style="background:#0F141A;border:1px solid rgba(255,255,255,0.10);border-radius:10px;padding:18px 16px;margin:0 0 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:0 0 8px;font-size:11px;font-weight:700;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;text-align:left;border-bottom:1px solid rgba(255,255,255,0.10);">
              Item
            </th>
            <th style="padding:0 0 8px;font-size:11px;font-weight:700;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;text-align:center;border-bottom:1px solid rgba(255,255,255,0.10);">
              Qty
            </th>
            <th style="padding:0 0 8px;font-size:11px;font-weight:700;color:#8B919A;text-transform:uppercase;letter-spacing:0.08em;text-align:right;border-bottom:1px solid rgba(255,255,255,0.10);">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          ${buildLineItemRows(params.lineItems)}
        </tbody>
      </table>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.10);">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:13px;color:#8B919A;">Subtotal</td>
            <td style="font-size:13px;color:#CDD1D6;text-align:right;">${formatCents(params.subtotalCents)}</td>
          </tr>
          ${params.taxCents > 0 ? `
          <tr>
            <td style="font-size:13px;color:#8B919A;padding-top:4px;">Tax</td>
            <td style="font-size:13px;color:#CDD1D6;text-align:right;padding-top:4px;">${formatCents(params.taxCents)}</td>
          </tr>` : ""}
          <tr>
            <td style="font-size:16px;font-weight:700;color:#F0F0F0;padding-top:10px;">Total</td>
            <td style="font-size:16px;font-weight:700;color:#F0F0F0;text-align:right;padding-top:10px;">${formatCents(params.totalCents)}</td>
          </tr>
        </table>
      </div>
    </div>

    ${dueDateStr ? `<p style="font-size:13px;color:#8B919A;margin:0 0 8px;">Due by <strong style="color:#CDD1D6;">${dueDateStr}</strong></p>` : ""}
    ${params.notes ? `<p style="font-size:13px;color:#8B919A;line-height:1.5;margin:0 0 8px;">${params.notes}</p>` : ""}
  `;

  const morePayOptionsHtml = `
    <p style="font-size:12px;color:#8B919A;text-align:center;margin:12px 0 0;">
      <a href="${params.payUrl}" style="color:#6B8AFF;text-decoration:underline;">More payment options available</a> on the payment page
    </p>
  `;

  const introLine =
    params.introOverride && params.introOverride.trim().length > 0
      ? params.introOverride
      : `Hi ${params.customerName}, here's your invoice from ${params.businessName}.`;

  const html = buildTransactionalEmail({
    recipientEmail: params.recipientEmail,
    subjectForTitle: `Invoice ${params.invoiceNumber}`,
    headline: `Invoice ${params.invoiceNumber}`,
    intro: introLine,
    bodyHtml,
    cta: {
      label: `Pay ${formatCents(params.totalCents)}`,
      url: params.payUrl,
      style: "block",
    },
    afterCtaHtml: morePayOptionsHtml,
    pasteLinkFallback: { url: params.payUrl },
    supportNote: `Questions about this invoice? Reply to this email or contact ${params.businessName} directly.`,
  });

  const bodyLines = [
    ...params.lineItems.map((li) => `- ${li.description} x${li.quantity}: ${formatCents(li.quantity * li.unit_price_cents)}`),
    `Total: ${formatCents(params.totalCents)}`,
    dueDateStr ? `Due by: ${dueDateStr}` : "",
  ].filter(Boolean);

  const plain = buildPlainText({
    headline: `Invoice ${params.invoiceNumber}`,
    intro: introLine,
    bodyText: bodyLines.join("\n"),
    ctaLabel: `Pay ${formatCents(params.totalCents)}`,
    ctaUrl: params.payUrl,
    pasteLinkUrl: params.payUrl,
  });

  const fromAddr = getFromAddress();
  const subject =
    params.subjectOverride && params.subjectOverride.trim().length > 0
      ? params.subjectOverride
      : `Invoice ${params.invoiceNumber} from ${params.businessName}`;

  const attachments = params.pdfAttachment
    ? [{
        filename: params.pdfAttachment.filename,
        content: params.pdfAttachment.buffer,
        contentType: "application/pdf",
      }]
    : undefined;

  try {
    await transporter.sendMail({
      from: fromAddr,
      to: params.recipientEmail,
      subject,
      html,
      text: plain,
      ...(attachments ? { attachments } : {}),
    });
    log.info("Invoice email sent", {
      to: params.recipientEmail,
      invoice: params.invoiceNumber,
      pdf: params.pdfAttachment ? "attached" : "none",
    });
  } catch (err: any) {
    log.error("Failed to send invoice email", { error: err.message, to: params.recipientEmail });
    throw err;
  }
}
