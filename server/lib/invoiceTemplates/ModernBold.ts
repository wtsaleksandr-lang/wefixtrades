/**
 * Modern Bold — large brand-colored header block, bold table headers, accent
 * strip down the left edge. PDFKit renderer; React preview lives at
 * client/src/pages/portal/invoice-templates/ModernBold.tsx.
 */

import {
  bufferDocument,
  createDoc,
  drawQrCode,
  formatDate,
  formatMoney,
  isValidPdf,
  statusLabel,
  type InvoicePdfData,
} from "./base";

const RIGHT_EDGE = 564;
const COL_DESC_X = 60;
const COL_QTY_X = 360;
const COL_PRICE_X = 420;
const COL_TOTAL_X = 500;

export async function renderPdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = createDoc(data.invoice_number);

  // ─── Header band ─────────────────────────────────────────────────────
  doc.rect(0, 0, 612, 110).fill(data.accent_color);
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor("#FFFFFF")
    .text(data.business_name, 48, 32);

  doc.font("Helvetica").fontSize(10).fillColor("rgba(255,255,255,0.85)" as any);
  const headerLines = [
    data.business_email,
    data.business_phone,
    data.business_website,
  ].filter(Boolean) as string[];
  headerLines.forEach((l, i) => doc.fillColor("#E0E7FF").text(l, 48, 64 + i * 13));

  // Invoice meta inside the band — right side
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#FFFFFF")
    .text(`INVOICE #${data.invoice_number}`, 380, 38, { width: 184, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#E0E7FF")
    .text(`Status: ${statusLabel(data.status)}`, 380, 60, { width: 184, align: "right" })
    .text(`Issued: ${formatDate(data.issue_date)}`, 380, 74, { width: 184, align: "right" })
    .text(`Due: ${formatDate(data.due_date)}`, 380, 88, { width: 184, align: "right" });

  // ─── Accent strip down the left edge ─────────────────────────────────
  doc.rect(0, 110, 4, 700).fill(data.accent_color);

  // ─── Bill-to block ───────────────────────────────────────────────────
  let y = 140;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(data.accent_color)
    .text("BILL TO", 48, y);
  y += 16;
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111").text(data.customer_name, 48, y);
  y += 16;
  doc.font("Helvetica").fontSize(10).fillColor("#374151");
  const addrLines = [
    data.customer_email,
    data.customer_phone,
    data.billing_street,
    [data.billing_city, data.billing_region, data.billing_postal].filter(Boolean).join(", "),
    data.billing_country,
  ].filter((s) => s && s.length > 0) as string[];
  addrLines.forEach((l) => {
    doc.text(l, 48, y);
    y += 13;
  });

  // ─── Line items header — bold accent band ────────────────────────────
  y += 16;
  doc.rect(48, y - 4, 516, 24).fill(data.accent_color);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF");
  doc.text("DESCRIPTION", COL_DESC_X, y + 4);
  doc.text("QTY", COL_QTY_X, y + 4, { width: 40, align: "right" });
  doc.text("PRICE", COL_PRICE_X, y + 4, { width: 60, align: "right" });
  doc.text("TOTAL", COL_TOTAL_X, y + 4, { width: 56, align: "right" });
  y += 26;

  // ─── Line items — alternating row stripes ────────────────────────────
  doc.font("Helvetica").fontSize(10).fillColor("#111111");
  data.line_items.forEach((li, idx) => {
    if (idx % 2 === 0) {
      doc.rect(48, y - 4, 516, 22).fill("#F9FAFB");
      doc.fillColor("#111111");
    }
    const line_total = li.quantity * li.unit_price_cents;
    doc.fillColor("#111111").text(li.description, COL_DESC_X, y, { width: 290 });
    doc.text(String(li.quantity), COL_QTY_X, y, { width: 40, align: "right" });
    doc.text(formatMoney(li.unit_price_cents, data.currency), COL_PRICE_X, y, { width: 60, align: "right" });
    doc.text(formatMoney(line_total, data.currency), COL_TOTAL_X, y, { width: 56, align: "right" });
    y += 22;
  });

  // ─── Totals ──────────────────────────────────────────────────────────
  y += 12;
  doc.font("Helvetica").fontSize(10).fillColor("#374151");
  doc.text("Subtotal", 360, y, { width: 140, align: "right" });
  doc.text(formatMoney(data.subtotal_cents, data.currency), COL_TOTAL_X, y, { width: 56, align: "right" });
  y += 14;
  if (data.tax_cents > 0) {
    doc.text("Tax", 360, y, { width: 140, align: "right" });
    doc.text(formatMoney(data.tax_cents, data.currency), COL_TOTAL_X, y, { width: 56, align: "right" });
    y += 14;
  }
  // Bold accent-filled totals row
  y += 6;
  doc.rect(360, y - 4, 204, 26).fill(data.accent_color);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#FFFFFF");
  doc.text("Total", 360, y + 4, { width: 140, align: "right" });
  doc.text(formatMoney(data.total_cents, data.currency), COL_TOTAL_X, y + 4, { width: 56, align: "right" });
  y += 34;

  // ─── Notes ───────────────────────────────────────────────────────────
  if (data.notes) {
    y += 12;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(data.accent_color).text("NOTES", 48, y);
    y += 14;
    doc.font("Helvetica").fontSize(10).fillColor("#374151").text(data.notes, 48, y, { width: 350 });
  }

  // ─── Footer with QR + pay URL ────────────────────────────────────────
  await drawQrCode(doc, data.pay_url, RIGHT_EDGE - 80, 680);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#6B7280")
    .text(`Pay online: ${data.pay_url}`, 48, 700, { width: 380 });

  const buf = await bufferDocument(doc);
  if (!isValidPdf(buf)) throw new Error("Invalid PDF output");
  return buf;
}
