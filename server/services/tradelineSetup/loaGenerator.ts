/**
 * Wave 86 — LOA (Letter of Authorization) PDF generator.
 *
 * Layer 2 of the fully-automated porting flow. Renders a single-page A4 PDF
 * with the standard porting-authorization wording, the customer's typed
 * legal name, the date, and (when provided) an embedded canvas signature
 * PNG. Returns the raw bytes to the caller, who is responsible for
 * uploading via uploadEncryptedBuffer() and persisting the object key on
 * port_loa_pdf_object_key.
 *
 * Reuses the project's existing pdfkit dependency — no new library.
 *
 * Pure function; no I/O. Safe to call from a route handler.
 */

import PDFDocument from "pdfkit";

export interface LoaInput {
  authorizedSignerName: string;
  businessName: string;
  /** Phone number being ported, E.164 preferred. */
  portingNumber: string;
  /** Losing carrier as it appeared on the bill. */
  losingCarrier: string;
  /** Account holder as it appeared on the bill (if different from signer). */
  accountHolderName: string;
  accountNumber: string;
  /** Service address from the bill. */
  serviceAddressLine1: string;
  serviceAddressLine2: string;
  /** Optional signature PNG bytes — embedded under the signature block. */
  signaturePng?: Buffer;
  /** Defaults to `new Date()`; injected for tests. */
  signedAt?: Date;
}

const C = {
  ink: "#0F172A",
  muted: "#475569",
  rule: "#CBD5E1",
  accent: "#0D3CFC",
};

/**
 * Generate the LOA PDF and return its bytes.
 *
 * Never throws — wraps the pdfkit stream in a Promise and rejects only on a
 * truly catastrophic failure. Callers should treat a rejection as a
 * server-side bug, not a user-facing error.
 */
export function generateLoaPdf(input: LoaInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: "A4", margin: 56, bufferPages: true });

      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const signedAt = input.signedAt ?? new Date();
      const dateStr = signedAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      /* ─── Header ─── */
      doc
        .fillColor(C.ink)
        .font("Helvetica-Bold")
        .fontSize(20)
        .text("Letter of Authorization", { align: "center" });
      doc
        .moveDown(0.15)
        .fillColor(C.muted)
        .font("Helvetica")
        .fontSize(10)
        .text("Phone Number Porting Authorization", { align: "center" });

      doc.moveDown(1.2);

      /* ─── Rule ─── */
      const startX = doc.page.margins.left;
      const endX = doc.page.width - doc.page.margins.right;
      doc
        .moveTo(startX, doc.y)
        .lineTo(endX, doc.y)
        .strokeColor(C.rule)
        .lineWidth(0.5)
        .stroke();

      doc.moveDown(1);

      /* ─── Date + recipient ─── */
      doc
        .fillColor(C.ink)
        .font("Helvetica")
        .fontSize(11)
        .text(`Date: ${dateStr}`)
        .moveDown(0.5)
        .text("To: Twilio Inc., on behalf of WeFixTrades")
        .moveDown(1);

      /* ─── Account block (table-like) ─── */
      const labelW = 160;
      const rowH = 18;
      const rows: Array<[string, string]> = [
        ["Authorized signer:", input.authorizedSignerName],
        ["Business name:", input.businessName],
        ["Account holder (per bill):", input.accountHolderName],
        ["Account number:", input.accountNumber],
        ["Phone number being ported:", input.portingNumber],
        ["Current (losing) carrier:", input.losingCarrier],
        [
          "Service address:",
          [input.serviceAddressLine1, input.serviceAddressLine2].filter(Boolean).join(", "),
        ],
      ];

      for (const [label, value] of rows) {
        const y = doc.y;
        doc
          .fillColor(C.muted)
          .font("Helvetica")
          .fontSize(10)
          .text(label, startX, y, { width: labelW });
        doc
          .fillColor(C.ink)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(value || "—", startX + labelW, y, { width: endX - startX - labelW });
        doc.y = y + rowH;
      }

      doc.moveDown(0.8);

      /* ─── Authorization statement ─── */
      doc
        .fillColor(C.ink)
        .font("Helvetica")
        .fontSize(11)
        .text(
          `I, ${input.authorizedSignerName}, certify that I am authorized to act on ` +
            `the account identified above. I authorize the porting of the phone number ` +
            `${input.portingNumber} from ${input.losingCarrier} to Twilio for use by ` +
            `WeFixTrades on behalf of ${input.businessName}.`,
          { align: "left" },
        )
        .moveDown(0.6)
        .text(
          "I understand that:",
          { align: "left" },
        )
        .moveDown(0.3);

      const bullets = [
        "Porting typically takes 7–14 business days, set by the losing carrier.",
        "Service on the current carrier will be cancelled when the port completes.",
        "Any outstanding balance with the losing carrier must be settled separately.",
        "I have read and accept Twilio's porting terms of service.",
      ];
      for (const b of bullets) {
        const y = doc.y;
        doc
          .fillColor(C.accent)
          .font("Helvetica-Bold")
          .text("•", startX, y, { width: 12 });
        doc
          .fillColor(C.ink)
          .font("Helvetica")
          .fontSize(11)
          .text(b, startX + 12, y, { width: endX - startX - 12 });
      }

      doc.moveDown(1.2);

      /* ─── Signature block ─── */
      const sigBlockY = doc.y;
      doc
        .fillColor(C.muted)
        .font("Helvetica")
        .fontSize(10)
        .text("Signature:", startX, sigBlockY);

      if (input.signaturePng && input.signaturePng.length > 0) {
        try {
          doc.image(input.signaturePng, startX, sigBlockY + 14, {
            fit: [220, 60],
          });
        } catch {
          // If signature bytes are unreadable, fall back to a typed-name
          // affidavit on the signature line.
          doc
            .fillColor(C.ink)
            .font("Helvetica-Oblique")
            .fontSize(12)
            .text(`/s/ ${input.authorizedSignerName}`, startX, sigBlockY + 24);
        }
      } else {
        doc
          .fillColor(C.ink)
          .font("Helvetica-Oblique")
          .fontSize(12)
          .text(`/s/ ${input.authorizedSignerName}`, startX, sigBlockY + 24);
      }

      // Signature line
      const lineY = sigBlockY + 86;
      doc
        .moveTo(startX, lineY)
        .lineTo(startX + 260, lineY)
        .strokeColor(C.rule)
        .lineWidth(0.5)
        .stroke();
      doc
        .fillColor(C.muted)
        .font("Helvetica")
        .fontSize(9)
        .text(`${input.authorizedSignerName}  (${dateStr})`, startX, lineY + 4);

      /* ─── Footer ─── */
      doc
        .fillColor(C.muted)
        .font("Helvetica")
        .fontSize(8)
        .text(
          "Generated by WeFixTrades — wefixtrades.com. This document is part of the porting record retained for 90 days post-resolution.",
          startX,
          doc.page.height - doc.page.margins.bottom - 16,
          { width: endX - startX, align: "center" },
        );

      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}
