import { storage } from "../storage";
import type { InsertAuditFollowupEmail } from "@shared/schema";

/**
 * Audit follow-up email sequence.
 * Enqueues 4 emails after a user submits their email to unlock the audit report.
 *
 * Day 0: Welcome + report link (handled separately via sendAuditReportEmail)
 * Day 1: "Did you review your audit?" + top issue
 * Day 3: "Here's how to fix your #1 problem" + service recommendation
 * Day 5: "Other businesses like yours improved — here's how" + CTA
 */

interface AuditFollowupContext {
  auditSubmissionId: number;
  auditReportId: string | null;
  email: string;
  businessName: string;
  topIssues: string[];
  score: number;
  trade: string;
  city: string;
  recommendedServices: Array<{ name: string; price: number; id: string }>;
}

const SEQUENCE: Array<{
  step: string;
  offsetDays: number;
  subject: (ctx: AuditFollowupContext) => string;
  body: (ctx: AuditFollowupContext) => string;
}> = [
  {
    step: "day1_review",
    offsetDays: 1,
    subject: (ctx) => `${ctx.businessName} scored ${ctx.score}/100 — here's what to fix first`,
    body: (ctx) => {
      const topIssue = ctx.topIssues[0]?.replace(/-/g, " ") || "your online presence";
      return `Hi there,

Yesterday you ran an audit on ${ctx.businessName} and scored ${ctx.score}/100.

Your biggest gap right now is ${topIssue}. Fixing this alone could noticeably improve your visibility to local customers searching for ${ctx.trade} services in ${ctx.city}.

You can revisit your full report anytime:
{{report_link}}

If you'd like help fixing it, our team handles everything — no learning curve, no software to manage.

— The WeFixTrades Team`;
    },
  },
  {
    step: "day2_cross_tool",
    offsetDays: 2,
    subject: (ctx) => `You're losing more than just rankings`,
    body: (ctx) => {
      return `Hi there,

Your audit for ${ctx.businessName} flagged ${ctx.topIssues.length} issue${ctx.topIssues.length !== 1 ? "s" : ""}. But there's another problem most ${ctx.trade} businesses don't realize:

Missed calls.

Every call that goes unanswered is a potential job walking out the door. And it adds up fast — especially during busy hours and weekends.

We built a free calculator that shows you exactly how much missed calls are costing your business:

{{calculator_link}}

Takes 30 seconds. You might be surprised.

— The WeFixTrades Team`;
    },
  },
  {
    step: "day3_fix",
    offsetDays: 3,
    subject: (ctx) => `How to fix "${ctx.topIssues[0]?.replace(/-/g, " ") || "your top issue"}" for ${ctx.businessName}`,
    body: (ctx) => {
      const svc = ctx.recommendedServices[0];
      const svcLine = svc
        ? `Our ${svc.name} service ($${svc.price}/mo) is built specifically for this — we handle everything from setup to ongoing optimization.`
        : "We have done-for-you services built specifically for trades businesses like yours.";
      return `Hi there,

A quick follow-up on your ${ctx.businessName} audit.

You had ${ctx.topIssues.length} issue${ctx.topIssues.length !== 1 ? "s" : ""} flagged. The most impactful one to fix first: ${ctx.topIssues[0]?.replace(/-/g, " ") || "improving your online presence"}.

${svcLine}

Most businesses see results within 2–4 weeks.

View your report: {{report_link}}

— The WeFixTrades Team`;
    },
  },
  {
    step: "day5_social_proof",
    offsetDays: 5,
    subject: (ctx) => `${ctx.trade} businesses in ${ctx.city} are getting more calls — here's how`,
    body: (ctx) => {
      return `Hi there,

Since you audited ${ctx.businessName}, we wanted to share what we're seeing from similar ${ctx.trade} businesses:

• Average score improvement: 34 points in 60 days
• Most common result: 2–3x more calls from Google Maps
• Fastest wins: review growth + profile optimization (2–4 weeks)

Your current score is ${ctx.score}/100. There's real room to grow.

Ready to fix the gaps? View your report and pick the services that match:
{{report_link}}

— The WeFixTrades Team`;
    },
  },
];

export async function enqueueAuditFollowupSequence(ctx: AuditFollowupContext): Promise<void> {
  const now = Date.now();
  const reportLink = ctx.auditReportId
    ? `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""}/audit/report/${ctx.auditReportId}`
    : "";
  const calculatorLink = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""}/tools/missed-call-calculator`;

  const jobs: InsertAuditFollowupEmail[] = SEQUENCE.map((step) => {
    const runAt = new Date(now + step.offsetDays * 24 * 60 * 60 * 1000);
    const subject = step.subject(ctx);
    const body = step.body(ctx)
      .replace(/\{\{report_link\}\}/g, reportLink)
      .replace(/\{\{calculator_link\}\}/g, calculatorLink);

    return {
      audit_submission_id: ctx.auditSubmissionId,
      audit_report_id: ctx.auditReportId,
      email: ctx.email,
      business_name: ctx.businessName,
      run_at: runAt,
      step: step.step,
      status: "pending" as const,
      payload: { subject, body },
    };
  });

  await storage.enqueueAuditFollowups(jobs);
}
