import { storage } from "../storage";
import type { InsertAuditFollowupEmail } from "@shared/schema";

/**
 * Missed Call Calculator follow-up email sequence.
 * Enqueues 3 emails after a user submits their email to unlock the calculator.
 * All emails reference TradeLine as the solution.
 */

interface MissedCallFollowupContext {
  missedCallLeadId: number;
  email: string;
  trade: string;
  missedCallsPerWeek: number;
  closeRatePercent: number;
  avgJobValue: number;
  estimatedAnnualLoss: number;
}

function formatDollars(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

const SEQUENCE: Array<{
  step: string;
  offsetDays: number;
  subject: (ctx: MissedCallFollowupContext) => string;
  body: (ctx: MissedCallFollowupContext) => string;
}> = [
  {
    step: "calc_day1",
    offsetDays: 1,
    subject: (ctx) =>
      `Your ${ctx.trade} business is losing ${formatDollars(ctx.estimatedAnnualLoss)}/yr to missed calls`,
    body: (ctx) => {
      const daily = Math.round(ctx.estimatedAnnualLoss / 365);
      return `Hi there,

Yesterday you ran the numbers on your ${ctx.trade} business and the result was clear: an estimated ${formatDollars(ctx.estimatedAnnualLoss)} per year in missed revenue from unanswered calls.

That's roughly ${formatDollars(daily)} walking out the door every single day.

The fix doesn't require hiring staff or staying glued to your phone. TradeLine answers your calls 24/7 with AI — captures leads, sends SMS replies, and follows up automatically.

Plans start at $97/mo with 200 minutes included.

See how it works: {{tradeline_link}}

— The WeFixTrades Team`;
    },
  },
  {
    step: "calc_day2_cross_tool",
    offsetDays: 2,
    subject: () => `What else is holding your business back?`,
    body: (ctx) => {
      return `Hi there,

You already know missed calls are costing your ${ctx.trade} business ${formatDollars(ctx.estimatedAnnualLoss)}/yr.

But that's just one piece. What about your Google Maps visibility? Your website speed? How you stack up against competitors?

We offer a free audit that checks all of this in about 30 seconds — no signup, no strings:

{{audit_link}}

It shows exactly where you're losing customers and what to fix first.

— The WeFixTrades Team`;
    },
  },
  {
    step: "calc_day3",
    offsetDays: 3,
    subject: (ctx) =>
      `How ${ctx.trade} businesses recover missed revenue`,
    body: (ctx) => {
      const monthly = Math.round(ctx.estimatedAnnualLoss / 12);
      return `Hi there,

A quick follow-up on your missed call report.

At ${ctx.missedCallsPerWeek} missed calls per week with a ${ctx.closeRatePercent}% close rate, you're leaving roughly ${formatDollars(monthly)} on the table every month.

Here's what TradeLine handles for you:
- AI answers calls you can't get to — 24/7, including weekends
- Missed call auto-response via SMS (within seconds)
- Lead capture so no inquiry goes unacknowledged
- Automated follow-ups to convert more of those leads

Most ${ctx.trade} businesses see results within the first 2 weeks.

See TradeLine plans: {{tradeline_link}}

— The WeFixTrades Team`;
    },
  },
  {
    step: "calc_day5",
    offsetDays: 5,
    subject: (ctx) => {
      const lost = Math.round((ctx.estimatedAnnualLoss / 365) * 5);
      return `${formatDollars(lost)} lost since you ran your report — time to fix it`;
    },
    body: (ctx) => {
      const lostSince = Math.round((ctx.estimatedAnnualLoss / 365) * 5);
      return `Hi there,

It's been 5 days since you calculated your missed call cost. In that time, an estimated ${formatDollars(lostSince)} in potential ${ctx.trade} jobs went unanswered.

Every day without a solution, the gap grows.

TradeLine is the fastest way to stop the bleeding:
- Set up in under 10 minutes
- AI handles calls immediately
- You get notified of every lead
- Starting at $97/mo

Start recovering lost revenue today: {{tradeline_link}}

— The WeFixTrades Team`;
    },
  },
];

export async function enqueueMissedCallFollowups(ctx: MissedCallFollowupContext): Promise<void> {
  const now = Date.now();
  const tradelineLink = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""}/products/tradeline`;
  const auditLink = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""}/free-audit`;

  const jobs: InsertAuditFollowupEmail[] = SEQUENCE.map((step) => {
    const runAt = new Date(now + step.offsetDays * 24 * 60 * 60 * 1000);
    const subject = step.subject(ctx);
    const body = step.body(ctx)
      .replace(/\{\{tradeline_link\}\}/g, tradelineLink)
      .replace(/\{\{audit_link\}\}/g, auditLink);

    return {
      missed_call_lead_id: ctx.missedCallLeadId,
      email: ctx.email,
      business_name: null,
      run_at: runAt,
      step: step.step,
      status: "pending" as const,
      payload: { subject, body },
    };
  });

  await storage.enqueueAuditFollowups(jobs);
}

/**
 * Build the immediate results email sent right after gate submission.
 */
export function buildImmediateResultsEmail(ctx: MissedCallFollowupContext): { subject: string; html: string } {
  const monthly = Math.round(ctx.estimatedAnnualLoss / 12);
  const daily = Math.round(ctx.estimatedAnnualLoss / 365);
  const tradelineLink = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""}/products/tradeline`;

  const subject = `Your Missed Call Report: ${formatDollars(ctx.estimatedAnnualLoss)}/yr in lost ${ctx.trade} revenue`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:24px 28px;background:#0d1514;">
    <h1 style="color:#fff;font-size:18px;margin:0;">Your Missed Call Revenue Report</h1>
    <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:6px 0 0;">${ctx.trade} business estimate</p>
  </td></tr>
  <tr><td style="padding:28px;">
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr>
        <td style="padding:12px 16px;background:#FEF2F2;border-radius:8px;text-align:center;">
          <p style="margin:0 0 4px;font-size:12px;color:#991B1B;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Estimated Annual Loss</p>
          <p style="margin:0;font-size:28px;font-weight:800;color:#DC2626;">${formatDollars(ctx.estimatedAnnualLoss)}</p>
        </td>
      </tr>
    </table>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr>
        <td style="padding:10px 14px;background:#f9fafb;border-radius:6px;width:50%;text-align:center;">
          <p style="margin:0;font-size:11px;color:#6B7280;">Per Month</p>
          <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#111;">${formatDollars(monthly)}</p>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:10px 14px;background:#f9fafb;border-radius:6px;width:50%;text-align:center;">
          <p style="margin:0;font-size:11px;color:#6B7280;">Per Day</p>
          <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#111;">${formatDollars(daily)}</p>
        </td>
      </tr>
    </table>
    <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 20px;">
      Based on ${ctx.missedCallsPerWeek} missed calls/week at a ${ctx.closeRatePercent}% close rate with an average job value of ${formatDollars(ctx.avgJobValue)}.
    </p>
    <div style="border-top:1px solid #E5E7EB;padding-top:20px;">
      <p style="font-size:14px;font-weight:700;color:#111;margin:0 0 8px;">How to recover this revenue</p>
      <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 16px;">
        TradeLine answers your calls 24/7 with AI, sends instant SMS replies to missed calls, captures every lead, and follows up automatically. Most businesses see results within 2 weeks.
      </p>
      <a href="${tradelineLink}" style="display:inline-block;background:#00D4C8;color:#0d1514;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">See TradeLine Plans — from $97/mo</a>
    </div>
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent by WeFixTrades</p>
  </td></tr>
</table>
</body></html>`;

  return { subject, html };
}
