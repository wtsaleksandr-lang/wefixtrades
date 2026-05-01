import nodemailer from "nodemailer";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("WeeklyReport");

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    return null;
  }

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    }),
    from: from!,
  };
}

function buildEmailHtml(data: {
  businessName: string;
  views: number;
  leads: number;
  conversionRate: number;
  avgQuote: number;
  bestDay: string | null;
  editToken: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;margin-top:24px;margin-bottom:24px;">
  <tr><td style="background:#2D6A4F;padding:32px 24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Weekly Quote Performance</h1>
    <p style="color:#a7d4bb;margin:8px 0 0;font-size:14px;">${data.businessName}</p>
  </td></tr>
  <tr><td style="padding:32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="50%" style="padding:8px;">
          <div style="background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#2D6A4F;">${data.views}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">Total Views</div>
          </div>
        </td>
        <td width="50%" style="padding:8px;">
          <div style="background:#eff6ff;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#1d4ed8;">${data.leads}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">New Leads</div>
          </div>
        </td>
      </tr>
      <tr>
        <td width="50%" style="padding:8px;">
          <div style="background:#fefce8;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#a16207;">${data.conversionRate}%</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">Conversion Rate</div>
          </div>
        </td>
        <td width="50%" style="padding:8px;">
          <div style="background:#faf5ff;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#7c3aed;">$${data.avgQuote}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">Avg Quote</div>
          </div>
        </td>
      </tr>
    </table>
    ${data.bestDay ? `<div style="background:#f9fafb;border-radius:8px;padding:12px 16px;margin-top:16px;text-align:center;">
      <span style="font-size:13px;color:#6b7280;">Best Day for Leads:</span>
      <span style="font-size:13px;font-weight:600;color:#111827;margin-left:4px;">${data.bestDay}</span>
    </div>` : ''}
    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ''}/Dashboard?token=${data.editToken}"
         style="display:inline-block;background:#2D6A4F;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        Edit Pricing to Improve Conversions
      </a>
    </div>
  </td></tr>
  <tr><td style="padding:16px 24px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent by QuickQuote — Your weekly performance summary</p>
  </td></tr>
</table>
</body>
</html>`;
}

export async function sendWeeklyReports(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const mail = getTransporter();
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  if (!mail) {
    log.warn("SMTP not configured, skipping email sends");
    return { sent: 0, skipped: 0, errors: ["SMTP not configured"] };
  }

  const calcs = await storage.getAllCalculatorsWithEmail();

  for (const calc of calcs) {
    try {
      if (!calc.owner_email) {
        skipped++;
        continue;
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [eventCounts, weeklyLeadCount, avgQuote, bestDay] = await Promise.all([
        storage.getEventCounts(calc.id, sevenDaysAgo),
        storage.getLeadCountSince(calc.id, sevenDaysAgo),
        storage.getAvgQuoteAmount(calc.id),
        storage.getBestDay(calc.id, sevenDaysAgo),
      ]);

      const weeklyViews = eventCounts.views;
      const weeklyLeads = weeklyLeadCount;
      const conversionRate = weeklyViews > 0 ? Math.round((weeklyLeads / weeklyViews) * 100) : 0;

      const html = buildEmailHtml({
        businessName: calc.business_name,
        views: weeklyViews,
        leads: weeklyLeads,
        conversionRate,
        avgQuote,
        bestDay,
        editToken: calc.edit_token,
      });

      await mail.transporter.sendMail({
        from: `"QuickQuote" <${mail.from}>`,
        to: calc.owner_email,
        subject: "Your Weekly Quote Performance Report",
        html,
      });

      sent++;
    } catch (err: any) {
      errors.push(`Calculator ${calc.id} (${calc.owner_email}): ${err.message}`);
    }
  }

  return { sent, skipped, errors };
}

export function buildSMSSummary(leads: number, conversionRate: number): string {
  return `This week: ${leads} leads, ${conversionRate}% conversion.`;
}
