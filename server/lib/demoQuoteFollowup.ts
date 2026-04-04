import { storage } from "../storage";
import type { InsertAuditFollowupEmail } from "@shared/schema";

/**
 * Demo Quote Tool follow-up email sequence.
 * Sends quote details immediately, then 2 follow-ups selling QuoteQuick.
 */

interface DemoQuoteFollowupContext {
  demoQuoteLeadId: number;
  email: string;
  trade: string;
  demoBusinessName: string;
  quoteAmount: number | null;
  answers: Record<string, any> | null;
}

function formatDollars(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function quotequickLink(): string {
  const base = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "";
  return `${base}/signup?product=quotequick`;
}

function demoLink(): string {
  const base = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "";
  return `${base}/demo`;
}

/**
 * Build the immediate email sent right after the demo lead submits.
 */
export function buildDemoQuoteEmail(ctx: DemoQuoteFollowupContext): {
  subject: string;
  html: string;
} {
  const quoteDisplay = ctx.quoteAmount
    ? formatDollars(ctx.quoteAmount)
    : "Quote requested";

  const subject = `Your ${ctx.trade} quote from ${ctx.demoBusinessName} — ${quoteDisplay}`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:24px 28px;background:#0d1514;">
    <h1 style="color:#fff;font-size:18px;margin:0;">Your ${ctx.trade} Quote</h1>
    <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:6px 0 0;">from ${ctx.demoBusinessName} (demo)</p>
  </td></tr>
  <tr><td style="padding:28px;">
    ${ctx.quoteAmount ? `
    <div style="text-align:center;padding:16px;background:#f0fdf4;border-radius:8px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:12px;color:#166534;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Your Estimate</p>
      <p style="margin:0;font-size:32px;font-weight:800;color:#166534;">${quoteDisplay}</p>
    </div>` : ""}
    <p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 20px;">
      This quote was generated using the QuoteQuick demo for ${ctx.trade} services. In a real scenario, a ${ctx.trade} business would receive your details and follow up directly.
    </p>
    <div style="border-top:1px solid #E5E7EB;padding-top:20px;">
      <p style="font-size:15px;font-weight:700;color:#111;margin:0 0 8px;">Want this on YOUR website?</p>
      <p style="font-size:13px;color:#6B7280;line-height:1.6;margin:0 0 16px;">
        QuoteQuick lets your customers get instant quotes 24/7 and sends every lead straight to you. No code needed — live in under 10 minutes.
      </p>
      <a href="${quotequickLink()}" style="display:inline-block;background:#00D4C8;color:#0d1514;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Get QuoteQuick — From $49/mo</a>
    </div>
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent by WeFixTrades</p>
  </td></tr>
</table>
</body></html>`;

  return { subject, html };
}

/**
 * Build the internal notification email to WeFixTrades team.
 */
export function buildInternalNotificationEmail(ctx: DemoQuoteFollowupContext): {
  subject: string;
  html: string;
} {
  const quoteDisplay = ctx.quoteAmount
    ? formatDollars(ctx.quoteAmount)
    : "N/A";

  const subject = `[Demo Lead] ${ctx.email} — ${ctx.trade} — ${quoteDisplay}`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;">
  <tr><td style="padding:16px 20px;background:#1e293b;">
    <h2 style="color:#fff;font-size:15px;margin:0;">New Quote Demo Lead</h2>
  </td></tr>
  <tr><td style="padding:20px;">
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="padding:4px 0;font-size:13px;color:#666;">Email</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${ctx.email}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#666;">Trade</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${ctx.trade}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#666;">Demo Business</td><td style="padding:4px 0;font-size:13px;">${ctx.demoBusinessName}</td></tr>
      <tr><td style="padding:4px 0;font-size:13px;color:#666;">Quote Amount</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#166534;">${quoteDisplay}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, html };
}

const SEQUENCE: Array<{
  step: string;
  offsetDays: number;
  subject: (ctx: DemoQuoteFollowupContext) => string;
  body: (ctx: DemoQuoteFollowupContext) => string;
}> = [
  {
    step: "demo_day1",
    offsetDays: 1,
    subject: (ctx) =>
      `Your ${ctx.trade} quote + how to give YOUR customers this experience`,
    body: (ctx) => {
      const quoteDisplay = ctx.quoteAmount
        ? formatDollars(ctx.quoteAmount)
        : "your estimate";
      return `Hi there,

Yesterday you tried the QuoteQuick demo and got a ${ctx.trade} quote of ${quoteDisplay} from ${ctx.demoBusinessName}.

Imagine your customers getting that same experience on YOUR website — instant pricing, no phone tag, no back-and-forth emails.

That's exactly what QuoteQuick does:
- Customers answer a few questions and see their price instantly
- You get every lead with full contact details and quote amount
- Works on any website — no coding required
- Live in under 10 minutes

Plans start at $49/mo.

Get QuoteQuick: ${quotequickLink()}

— The WeFixTrades Team`;
    },
  },
  {
    step: "demo_day2_cross_tool",
    offsetDays: 2,
    subject: () => `Now get more traffic to your quotes`,
    body: (ctx) => {
      return `Hi there,

You've seen how QuoteQuick works for ${ctx.trade} businesses. The next question is: are customers actually finding you online?

We have a free audit that checks your Google Maps profile, website speed, and how you compare to local competitors — in about 30 seconds:

{{audit_link}}

No signup needed. It shows you exactly where you're visible and where you're not.

— The WeFixTrades Team`;
    },
  },
  {
    step: "demo_day3",
    offsetDays: 3,
    subject: (ctx) =>
      `${ctx.trade} businesses using QuoteQuick close more leads`,
    body: (ctx) => {
      return `Hi there,

Quick follow-up on the quote demo you tried.

Businesses using QuoteQuick see more leads because customers can get instant prices 24/7 — even when you're on a job, after hours, or on weekends.

Every quote becomes a lead you can follow up on. No more "I'll call back" that never happens.

Ready to try it?

Get QuoteQuick — from $49/mo: ${quotequickLink()}

Or talk to our team: ${demoLink()}

— The WeFixTrades Team`;
    },
  },
];

export async function enqueueDemoQuoteFollowups(
  ctx: DemoQuoteFollowupContext
): Promise<void> {
  const now = Date.now();
  const auditLink = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""}/free-audit`;

  const jobs: InsertAuditFollowupEmail[] = SEQUENCE.map((step) => {
    const runAt = new Date(now + step.offsetDays * 24 * 60 * 60 * 1000);
    const subject = step.subject(ctx);
    const body = step.body(ctx).replace(/\{\{audit_link\}\}/g, auditLink);

    return {
      demo_quote_lead_id: ctx.demoQuoteLeadId,
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
