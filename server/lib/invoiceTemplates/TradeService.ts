/**
 * Trade Service — warm blue + grey palette, pill-shaped status badge, friendly
 * Helvetica spacing. Pairs with the brand-blue accent. Renders a soft tinted
 * header instead of a full color block. React preview lives at
 * client/src/pages/portal/invoice-templates/TradeService.tsx.
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
const COL_DESC_X = 56;
const COL_QTY_X = 360;
const COL_PRICE_X = 420;
const COL_TOTAL_X = 500;

/**
 * Mix the accent color with white at ~14% strength so the header tint stays
 * readable in any brand color.
 */
function tint(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "#EFF4FF";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const mix = (v: number) => Math.round(v + (255 - v) * 0.88);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

export async function renderPdf(data: InvoicePdfData): Promise<Buffer> {
  const doc = createDoc(data.invoice_number);
  const headerTint = tint(data.accent_color);

  // ─── Soft tinted header card ─────────────────────────────────────────
  doc.roundedRect(36, 36, 540, 100, 10).fill(headerTint);

  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor("#0F172A")
    .text(data.business_name, 56, 56);

  doc.font("Helvetica").fontSize(9).fillColor("#475569");
  const headerLines = [
    data.business_email,
    data.business_phone,
    data.business_website,
  ].filter(Boolean) as string[];
  headerLines.forEach((l, i) => doc.text(l, 56, 84 + i * 12));

  // Right side — invoice number + status pill
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#475569")
    .text(`Invoice #${data.invoice_number}`, 380, 56, { width: 184, align: "right" });

  // Status pill — rounded rect with accent border
  const statusText = statusLabel(data.status);
  const pillW = 86;
  const pillX = RIGHT_EDGE - pillW;
  const pillY = 76;
  doc
    .lineWidth(1)
    .strokeColor(data.accent_color)
    .roundedRect(pillX, pillY, pillW, 18, 9)
    .stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(data.accent_color)
    .text(statusText.toUpperCase(), pillX, pillY + 5, { width: pillW, align: "center" });

  doc.font("Helvetica").fontSize(9).fillColor("#64748B");
  doc.text(`Issued ${formatDate(data.issue_date)}`, 380, 104, { width: 184, align: "right" });
  doc.text(`Due ${formatDate(data.due_date)}`, 380, 116, { width: 184, align: "right" });

  // ─── Bill-to block ───────────────────────────────────────────────────
  let y = 160;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#64748B").text("BILLED TO", 48, y);
  y += 16;
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#0F172A").text(data.customer_name, 48, y);
  y += 16;
  doc.font("Helvetica").fontSize(10).fillColor("#475569");
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

  // ─── Grouped line items ──────────────────────────────────────────────
  y += 18;
  doc.roundedRect(48, y - 6, 516, 24, 4).fill("#F1F5F9");
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#475569");
  doc.text("SERVICE", COL_DESC_X, y + 2);
  doc.text("QTY", COL_QTY_X, y + 2, { width: 40, align: "right" });
  doc.text("PRICE", COL_PRICE_X, y + 2, { width: 60, align: "right" });
  doc.text("AMOUNT", COL_TOTAL_X, y + 2, { width: 56, align: "right" });
  y += 28;

  doc.font("Helvetica").fontSize(10).fillColor("#0F172A");
  for (const li of data.line_items) {
    const line_total = li.quantity * li.unit_price_cents;
    doc.text(li.description, COL_DESC_X, y, { width: 290 });
    doc.text(String(li.quantity), COL_QTY_X, y, { width: 40, align: "right" });
    doc.text(formatMoney(li.unit_price_cents, data.currency), COL_PRICE_X, y, { width: 60, align: "right" });
    doc.text(formatMoney(line_total, data.currency), COL_TOTAL_X, y, { width: 56, align: "right" });
    y += 20;
    doc.strokeColor("#E2E8F0").lineWidth(0.5).moveTo(48, y - 4).lineTo(RIGHT_EDGE, y - 4).stroke();
  }

  // ─── Totals ──────────────────────────────────────────────────────────
  y += 10;
  doc.font("Helvetica").fontSize(10).fillColor("#475569");
  doc.text("Subtotal", 360, y, { width: 140, align: "right" });
  doc.text(formatMoney(data.subtotal_cents, data.currency), COL_TOTAL_X, y, { width: 56, align: "right" });
  y += 14;
  if (data.tax_cents > 0) {
    doc.text("Tax", 360, y, { width: 140, align: "right" });
    doc.text(formatMoney(data.tax_cents, data.currency), COL_TOTAL_X, y, { width: 56, align: "right" });
    y += 14;
  }

  // Total row — soft tinted background with accent text
  y += 6;
  doc.roundedRect(360, y - 4, 204, 26, 4).fill(headerTint);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(data.accent_color);
  doc.text("Total Due", 360, y + 4, { width: 140, align: "right" });
  doc.text(formatMoney(data.total_cents, data.currency), COL_TOTAL_X, y + 4, { width: 56, align: "right" });
  y += 36;

  // ─── Notes ───────────────────────────────────────────────────────────
  if (data.notes) {
    y += 8;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#64748B").text("NOTES", 48, y);
    y += 14;
    doc.font("Helvetica").fontSize(10).fillColor("#475569").text(data.notes, 48, y, { width: 350 });
  }

  // ─── Friendly footer + QR ────────────────────────────────────────────
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#64748B")
    .text(`Thanks for your business! Pay online: ${data.pay_url}`, 48, 700, { width: 380 });
  await drawQrCode(doc, data.pay_url, RIGHT_EDGE - 80, 680);

  const buf = await bufferDocument(doc);
  if (!isValidPdf(buf)) throw new Error("Invalid PDF output");
  return buf;
}
