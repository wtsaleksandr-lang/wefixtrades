import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildAuditReportEmail } from "./reportEmailTemplate";
import { generateReportPdf } from "./pdfGenerator";
import { isEmailUnsubscribed } from "./unsubscribeStorage";

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB

export async function sendAuditReportEmail(opts: {
  reportId: string;
  recipientEmail: string;
  origin: string;
}): Promise<{ ok: boolean; error?: string }> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    return { ok: false, error: "Email service not configured" };
  }

  if (await isEmailUnsubscribed(opts.recipientEmail)) {
    console.log(`[audit-email] Recipient ${opts.recipientEmail} is unsubscribed — skipping`);
    return { ok: false, error: "Recipient unsubscribed" };
  }

  const rows = await db
    .select({
      business_name: auditReports.business_name,
      audit_data: auditReports.audit_data,
      ai_narrative: auditReports.ai_narrative,
    })
    .from(auditReports)
    .where(eq(auditReports.id, opts.reportId))
    .limit(1);

  if (rows.length === 0) {
    return { ok: false, error: "Report not found" };
  }

  const row = rows[0];
  const audit: any = row.audit_data || {};
  const narrative: any = row.ai_narrative || {};
  const reportUrl = `${opts.origin}/audit/report/${opts.reportId}`;

  // Generate PDF attachment
  let attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  let hasPdf = false;
  try {
    const pdfResult = await generateReportPdf(opts.reportId, opts.origin);
    if (pdfResult.ok && pdfResult.buffer.length <= MAX_ATTACHMENT_SIZE) {
      attachments = [{
        filename: pdfResult.filename,
        content: pdfResult.buffer,
        contentType: "application/pdf",
      }];
      hasPdf = true;
    } else if (pdfResult.ok) {
      console.log(`[audit-email] PDF too large (${(pdfResult.buffer.length / 1024 / 1024).toFixed(1)}MB), sending link only`);
    } else {
      console.log(`[audit-email] PDF generation failed: ${pdfResult.error}, sending link only`);
    }
  } catch (err: any) {
    console.log(`[audit-email] PDF generation error: ${err?.message}, sending link only`);
  }

  // Build email HTML (template adapts based on whether PDF is attached)
  const { subject, html } = buildAuditReportEmail({
    businessName: row.business_name,
    score: audit.scores?.total ?? null,
    grade: audit.scores?.grade || narrative.grade || "N/A",
    executiveSummary: narrative.executiveSummary || "",
    reportUrl,
    hasPdfAttachment: hasPdf,
    recipientEmail: opts.recipientEmail,
  });

  await transporter.sendMail({
    from: getFromAddress(),
    to: opts.recipientEmail,
    subject,
    html,
    attachments,
  });

  return { ok: true };
}
