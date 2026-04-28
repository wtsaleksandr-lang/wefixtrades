import { storage } from "../storage";
import type { InsertAuditFollowupEmail } from "@shared/schema";
import { buildTransactionalEmail, buildPlainText } from "./transactionalShell";
import { buildAdminAlertEmail, buildAdminAlertPlainText } from "./adminAlertShell";

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
  text: string;
} {
  const quoteDisplay = ctx.quoteAmount
    ? formatDollars(ctx.quoteAmount)
    : "Quote requested";

  const subject = `Your ${ctx.trade} quote from ${ctx.demoBusinessName} — ${quoteDisplay}`;

  const quoteCallout = ctx.quoteAmount
    ? `<table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;">
        <tr>
          <td style="padding:16px 18px;background:rgba(102,232,250,0.08);border:1px solid rgba(102,232,250,0.20);border-radius:10px;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;color:#66E8FA;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Your estimate</p>
            <p style="margin:0;font-size:32px;font-weight:800;color:#F0F0F0;">${quoteDisplay}</p>
          </td>
        </tr>
      </table>`
    : "";

  const html = buildTransactionalEmail({
    recipientEmail: ctx.email,
    subjectForTitle: subject,
    headerTagline: `from ${ctx.demoBusinessName} (demo)`,
    eyebrow: `Your ${ctx.trade} quote`,
    headline: ctx.quoteAmount ? "Here's your estimate" : "Your quote request received",
    intro: `This quote was generated using the QuoteQuick demo for ${ctx.trade} services. In a real scenario, a ${ctx.trade} business would receive your details and follow up directly.`,
    bodyHtml: `
      ${quoteCallout}
      <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:18px;margin-top:4px;">
        <p style="font-size:14px;font-weight:700;color:#F0F0F0;margin:0 0 6px;">Want this on YOUR website?</p>
        <p style="font-size:13px;color:#CDD1D6;line-height:1.6;margin:0;">
          QuoteQuick lets your customers get instant quotes 24/7 and sends every lead straight to you. No code needed — live in under 10 minutes.
        </p>
      </div>`,
    cta: { label: "Get QuoteQuick — from $49/mo", url: quotequickLink() },
  });

  const text = buildPlainText({
    headline: ctx.quoteAmount ? "Here's your estimate" : "Your quote request received",
    intro: `This quote was generated using the QuoteQuick demo for ${ctx.trade} services.`,
    bodyText: ctx.quoteAmount
      ? `Your estimate: ${quoteDisplay}\n\nWant this on YOUR website? QuoteQuick lets your customers get instant quotes 24/7 and sends every lead straight to you. No code needed — live in under 10 minutes.`
      : `Want QuoteQuick on YOUR website? Customers get instant quotes 24/7 and every lead lands in your inbox. No code, live in under 10 minutes.`,
    ctaLabel: "Get QuoteQuick — from $49/mo",
    ctaUrl: quotequickLink(),
  });

  return { subject, html, text };
}

/**
 * Build the internal notification email to WeFixTrades team.
 */
export function buildInternalNotificationEmail(ctx: DemoQuoteFollowupContext): {
  subject: string;
  html: string;
  text: string;
} {
  const quoteDisplay = ctx.quoteAmount
    ? formatDollars(ctx.quoteAmount)
    : "N/A";

  const subject = `[Demo Lead] ${ctx.email} — ${ctx.trade} — ${quoteDisplay}`;

  const detailRows = [
    { label: "Email", value: ctx.email },
    { label: "Trade", value: ctx.trade },
    { label: "Demo business", value: ctx.demoBusinessName },
    { label: "Quote amount", value: quoteDisplay, valueColor: "#15803D" },
  ];

  const html = buildAdminAlertEmail({
    subjectForTitle: subject,
    alertType: "New demo quote lead",
    alertTone: "info",
    headline: `${ctx.email} just generated a demo quote`,
    detailRows,
    footerNote: "QuoteQuick demo · WeFixTrades",
  });

  const text = buildAdminAlertPlainText({
    alertType: "New demo quote lead",
    headline: `${ctx.email} just generated a demo quote`,
    detailRows: detailRows.map(({ label, value }) => ({ label, value })),
    footerNote: "QuoteQuick demo · WeFixTrades",
  });

  return { subject, html, text };
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
