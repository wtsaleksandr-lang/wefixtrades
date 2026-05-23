/**
 * Classic Minimal — monochrome PDF template (mature businesses).
 *
 * Single column, thin grey rules, accent applied only on the totals row + QR
 * caption. Helvetica throughout. Matches the React preview in
 * client/src/pages/portal/invoice-templates/ClassicMinimal.tsx.
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

const COL_DESC_X = 48;
const COL_QTY_X = 360;
const COL_PRICE_X = 420;
const COL_TOTAL_X = 500;
const RIGHT_EDGE = 564;

export async function renderPdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = createDoc(data.invoice_number);

  // ─── Header ──────────────────────────────────────────────────────────
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#111111")
    .text(data.business_name, 48, 48);

  const headerLines = [
    data.business_email,
    data.business_phone,
    data.business_website,
  ].filter(Boolean) as string[];
  doc.font("Helvetica").fontSize(9).fillColor("#6B7280");
  headerLines.forEach((l, i) => doc.text(l, 48, 70 + i * 12));

  // Invoice meta — right column
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#111111")
    .text("INVOICE", 400, 48, { width: 164, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#374151")
    .text(`#${data.invoice_number}`, 400, 64, { width: 164, align: "right" });
  doc
    .fontSize(9)
    .fillColor("#6B7280")
    .text(`Status: ${statusLabel(data.status)}`, 400, 80, { width: 164, align: "right" })
    .text(`Issued: ${formatDate(data.issue_date)}`, 400, 92, { width: 164, align: "right" })
    .text(`Due: ${formatDate(data.due_date)}`, 400, 104, { width: 164, align: "right" });

  // Thin separator
  let y = 140;
  doc.strokeColor("#E5E7EB").lineWidth(0.5).moveTo(48, y).lineTo(RIGHT_EDGE, y).stroke();

  // ─── Bill-to block ───────────────────────────────────────────────────
  y += 16;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#6B7280").text("BILL TO", 48, y);
  y += 14;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text(data.customer_name, 48, y);
  y += 14;
  doc.font("Helvetica").fontSize(9).fillColor("#374151");
  const addrLines = [
    data.customer_email,
    data.customer_phone,
    data.billing_street,
    [data.billing_city, data.billing_region, data.billing_postal].filter(Boolean).join(", "),
    data.billing_country,
  ].filter((s) => s && s.length > 0) as string[];
  addrLines.forEach((l) => {
    doc.text(l, 48, y);
    y += 12;
  });

  // ─── Line items header ───────────────────────────────────────────────
  y += 20;
  doc.strokeColor("#E5E7EB").lineWidth(0.5).moveTo(48, y).lineTo(RIGHT_EDGE, y).stroke();
  y += 8;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#6B7280");
  doc.text("DESCRIPTION", COL_DESC_X, y);
  doc.text("QTY", COL_QTY_X, y, { width: 40, align: "right" });
  doc.text("PRICE", COL_PRICE_X, y, { width: 60, align: "right" });
  doc.text("TOTAL", COL_TOTAL_X, y, { width: 64, align: "right" });
  y += 14;
  doc.strokeColor("#E5E7EB").lineWidth(0.5).moveTo(48, y).lineTo(RIGHT_EDGE, y).stroke();
  y += 8;

  // ─── Line items ──────────────────────────────────────────────────────
  doc.font("Helvetica").fontSize(10).fillColor("#111111");
  for (const li of data.line_items) {
    const line_total = li.quantity * li.unit_price_cents;
    doc.text(li.description, COL_DESC_X, y, { width: 300 });
    doc.text(String(li.quantity), COL_QTY_X, y, { width: 40, align: "right" });
    doc.text(formatMoney(li.unit_price_cents, data.currency), COL_PRICE_X, y, { width: 60, align: "right" });
    doc.text(formatMoney(line_total, data.currency), COL_TOTAL_X, y, { width: 64, align: "right" });
    y += 20;
  }

  // ─── Totals ──────────────────────────────────────────────────────────
  y += 8;
  doc.strokeColor("#E5E7EB").lineWidth(0.5).moveTo(360, y).lineTo(RIGHT_EDGE, y).stroke();
  y += 8;
  doc.font("Helvetica").fontSize(10).fillColor("#374151");
  doc.text("Subtotal", 360, y, { width: 140, align: "right" });
  doc.text(formatMoney(data.subtotal_cents, data.currency), COL_TOTAL_X, y, { width: 64, align: "right" });
  y += 14;
  if (data.tax_cents > 0) {
    doc.text("Tax", 360, y, { width: 140, align: "right" });
    doc.text(formatMoney(data.tax_cents, data.currency), COL_TOTAL_X, y, { width: 64, align: "right" });
    y += 14;
  }
  y += 4;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(data.accent_color);
  doc.text("Total", 360, y, { width: 140, align: "right" });
  doc.text(formatMoney(data.total_cents, data.currency), COL_TOTAL_X, y, { width: 64, align: "right" });
  y += 24;

  // ─── Notes ───────────────────────────────────────────────────────────
  if (data.notes) {
    y += 12;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#6B7280").text("NOTES", 48, y);
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
