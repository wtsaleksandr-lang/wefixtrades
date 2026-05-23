/**
 * Shared types + utilities for invoice PDF renderers (Phase A).
 *
 * Each template (Classic Minimal / Modern Bold / Trade Service) consumes the
 * same InvoicePdfData shape and renders via PDFKit. Adding a Phase-B template
 * is "drop a new file that imports these helpers + define styling deltas" —
 * no new dependencies, no schema changes.
 *
 * PDFKit ships its own fonts (Helvetica, Helvetica-Bold, etc.) so no font
 * loading is required.
 */

import PDFDocument from "pdfkit";
import QRCode from "qrcode";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
}

export interface InvoicePdfData {
  /** Invoice fields */
  invoice_number: string;
  status: string;
  issue_date: Date | null;
  due_date: Date | null;
  currency: string;
  line_items: InvoiceLineItem[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_region: string | null;
  billing_postal: string | null;
  billing_country: string | null;

  /** Business (client) fields */
  business_name: string;
  business_email: string | null;
  business_phone: string | null;
  business_website: string | null;
  logo_url: string | null;

  /** Branding overrides (per-invoice metadata wins over client default) */
  accent_color: string;

  /** Payment URL — used both as a clickable link in the totals area and
   *  encoded into the QR code in the footer. */
  pay_url: string;
}

/** Format a cents integer for display with the invoice's currency symbol. */
export function formatMoney(cents: number, currency: string): string {
  const sym = currencySymbol(currency);
  return `${sym}${(cents / 100).toFixed(2)}`;
}

export function currencySymbol(currency: string): string {
  switch (currency) {
    case "USD":
    case "CAD":
    case "AUD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    default:
      return `${currency} `;
  }
}

export function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** A11y/clarity: convert raw status to a friendly label. */
export function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Render the bottom-right QR code that points at the pay URL. ~80x80px. */
export async function drawQrCode(
  doc: PDFKit.PDFDocument,
  url: string,
  x: number,
  y: number,
  size = 80,
): Promise<void> {
  try {
    const dataUrl = await QRCode.toDataURL(url, { margin: 0, width: size * 2 });
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const buf = Buffer.from(base64, "base64");
    doc.image(buf, x, y, { width: size, height: size });
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#6B7280")
      .text("Scan to pay", x, y + size + 4, { width: size, align: "center" });
  } catch {
    // QR generation is best-effort — never block the PDF on a QR failure.
  }
}

/** Render the document and resolve the resulting Buffer. */
export function bufferDocument(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/** Create a new portrait PDFKit doc with consistent metadata. */
export function createDoc(invoiceNumber: string): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "LETTER",
    margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: {
      Title: `Invoice ${invoiceNumber}`,
      Producer: "WeFixTrades",
    },
  });
}

/** Sanity-check the rendered buffer starts with the PDF signature. */
export function isValidPdf(buf: Buffer): boolean {
  return buf.slice(0, 5).toString("ascii") === "%PDF-";
}
