import { storage } from "../storage";
import type { InsertAuditFollowupEmail } from "@shared/schema";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";

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
    subject: () => `A week later — want to see how TradeLine would handle it?`,
    body: (ctx) => {
      return `Hi there,

A week ago you ran our missed-call calculator. No pressure to do anything with the number — but if it's still sitting on your mind, here's the short version of what TradeLine actually does:

- Answers every inbound call 24/7 in a real conversation, not a menu
- Texts the caller back automatically if they hang up before you pick up
- Sends you a notification the moment a lead comes in, with the transcript
- Live in under 30 minutes, starting at $97/mo

If it's not a fit for your ${ctx.trade} business, ignore this email — we won't keep emailing. If it is, take a look: {{tradeline_link}}

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
export function buildImmediateResultsEmail(ctx: MissedCallFollowupContext): { subject: string; html: string; text: string } {
  const monthly = Math.round(ctx.estimatedAnnualLoss / 12);
  const daily = Math.round(ctx.estimatedAnnualLoss / 365);
  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://wefixtrades.com");
  const tradelineLink = `${baseUrl.replace(/\/$/, "")}/products/tradeline`;

  const subject = `Your Missed Call Report: ${formatDollars(ctx.estimatedAnnualLoss)}/yr in lost ${ctx.trade} revenue`;

  const html = buildTransactionalEmail({
    recipientEmail: ctx.email,
    subjectForTitle: subject,
    headerTagline: `${ctx.trade} business estimate`,
    eyebrow: "Missed-call revenue report",
    eyebrowColor: "#EF4444",
    headline: "Your missed-call revenue estimate",
    intro: `Based on ${ctx.missedCallsPerWeek} missed calls/week at a ${ctx.closeRatePercent}% close rate with an average job value of <strong style="color:#F0F0F0;">${formatDollars(ctx.avgJobValue)}</strong>.`,
    bodyHtml: `
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
        <tr>
          <td style="padding:16px 18px;background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.20);border-radius:10px;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;color:#FCA5A5;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Estimated annual loss</p>
            <p style="margin:0;font-size:30px;font-weight:800;color:#F87171;">${formatDollars(ctx.estimatedAnnualLoss)}</p>
          </td>
        </tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px;">
        <tr>
          <td style="padding:12px 14px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;width:48%;text-align:center;">
            <p style="margin:0;font-size:11px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;">Per month</p>
            <p style="margin:4px 0 0;font-size:17px;font-weight:700;color:#F0F0F0;">${formatDollars(monthly)}</p>
          </td>
          <td style="width:10px;"></td>
          <td style="padding:12px 14px;background:#0F141A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;width:48%;text-align:center;">
            <p style="margin:0;font-size:11px;color:#8B919A;text-transform:uppercase;letter-spacing:0.06em;">Per day</p>
            <p style="margin:4px 0 0;font-size:17px;font-weight:700;color:#F0F0F0;">${formatDollars(daily)}</p>
          </td>
        </tr>
      </table>
      <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:18px;margin-top:4px;">
        <p style="font-size:14px;font-weight:700;color:#F0F0F0;margin:0 0 6px;">How to recover this revenue</p>
        <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;">
          TradeLine answers your calls 24/7 with AI, sends instant SMS replies to missed calls, captures every lead, and follows up automatically. Most businesses see results within 2 weeks.
        </p>
      </div>`,
    cta: { label: "See TradeLine plans — from $97/mo", url: tradelineLink },
  });

  const text = buildPlainText({
    headline: "Your missed-call revenue estimate",
    intro: `Based on ${ctx.missedCallsPerWeek} missed calls/week at a ${ctx.closeRatePercent}% close rate with an average job value of ${formatDollars(ctx.avgJobValue)}.`,
    bodyText: [
      `Estimated annual loss: ${formatDollars(ctx.estimatedAnnualLoss)}`,
      `Per month: ${formatDollars(monthly)}`,
      `Per day: ${formatDollars(daily)}`,
      "",
      "How to recover this revenue:",
      "TradeLine answers your calls 24/7 with AI, sends instant SMS replies to missed calls, captures every lead, and follows up automatically. Most businesses see results within 2 weeks.",
    ].join("\n"),
    ctaLabel: "See TradeLine plans — from $97/mo",
    ctaUrl: tradelineLink,
  });

  return { subject, html, text };
}
