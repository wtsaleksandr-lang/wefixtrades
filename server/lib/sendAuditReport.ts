import { db } from "../db";
import { auditReports } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getEmailTransporter, getFromAddress } from "./emailTransport";
import { buildAuditReportEmail } from "./reportEmailTemplate";

export async function sendAuditReportEmail(opts: {
  reportId: string;
  recipientEmail: string;
  origin: string;
}): Promise<{ ok: boolean; error?: string }> {
  const transporter = getEmailTransporter();
  if (!transporter) {
    return { ok: false, error: "Email service not configured" };
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

  const { subject, html } = buildAuditReportEmail({
    businessName: row.business_name,
    score: audit.scores?.total ?? null,
    grade: audit.scores?.grade || narrative.grade || "N/A",
    executiveSummary: narrative.executiveSummary || "",
    reportUrl,
  });

  await transporter.sendMail({
    from: getFromAddress(),
    to: opts.recipientEmail,
    subject,
    html,
  });

  return { ok: true };
}
