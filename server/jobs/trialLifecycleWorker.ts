import nodemailer from "nodemailer";
import { storage } from "../storage";
import { db } from "../db";
import { calculators, leads, analyticsEvents } from "@shared/schema";
import { eq, and, sql, isNotNull, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { QUOTEQUICK, getTier, formatPrice } from "@shared/pricing";

const log = createLogger("TrialLifecycle");

// Lane A2 — customer-facing prices derive from @shared/pricing. The old
// hardcoded "Solo $49 / Business $99" ladder was retired in Wave Q.
const QQ_PRO_PRICE = formatPrice(getTier(QUOTEQUICK, "Pro")!.price);
const QQ_BUSINESS_PRICE = formatPrice(getTier(QUOTEQUICK, "Business")!.price);

/**
 * Calculator lifecycle worker (trial-truth rework).
 *
 * TRIAL-TRUTH INVARIANT — free tools never pause. The marketing site and
 * terms promise a permanent, no-time-limit free tier, so this worker MUST
 * NEVER touch the deployment-status table, never flip a calculator back
 * to draft, and never gate anything the Free plan includes. The old
 * day-14 auto-pause function was removed for exactly that reason (its
 * prod leftovers are remediated separately — see PR "Trial-truth").
 *
 * What remains, honestly framed:
 *   - Day 0 / 1 / 3: onboarding emails (link sharing, first-traction tips).
 *   - Day 14: ONE "Pro preview has ended" email. The 14-day window only
 *     ends PRO-only features (the Pro-features preview new accounts get at
 *     signup); the free plan keeps working untouched, forever. No urgency
 *     copy, no countdown sequence, prices derived from @shared/pricing.
 *
 * The legacy `trial_email_day_N` analytics event names are kept for the
 * day-0/1/3 dedup markers so historical sends stay deduplicated (renaming
 * them would re-send to calculators mid-sequence). They are internal
 * identifiers only — nothing customer-visible says "trial".
 *
 * File/job names (`trialLifecycleWorker`, `trial_lifecycle`) are likewise
 * kept to preserve job-log continuity; the customer-facing concept is
 * "Pro preview".
 */

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

export function daysSince(date: Date | string | null, now: number = Date.now()): number {
  if (!date) return 0;
  return Math.floor((now - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

export interface LifecycleEmailContext {
  businessName: string;
  slug: string;
  ownerEmail: string;
  views: number;
  leadCount: number;
  calcUrl: string;
  editUrl: string;
  pricingUrl: string;
}

export function buildLifecycleEmail(day: number, ctx: LifecycleEmailContext): { subject: string; html: string } | null {
  const { businessName, calcUrl, editUrl, pricingUrl, views, leadCount } = ctx;
  const baseUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '';

  const wrap = (body: string) => `<!DOCTYPE html>
<html><body style="font-family:'Inter',Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="padding:24px 28px;background:#0d1514;">
    <h1 style="color:#fff;font-size:17px;margin:0;">QuoteQuick</h1>
  </td></tr>
  <tr><td style="padding:28px;font-size:14px;line-height:1.7;color:#333;">
    ${body}
  </td></tr>
  <tr><td style="padding:12px 28px;background:#f9fafb;text-align:center;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">Sent by WeFixTrades &middot; <a href="${baseUrl}/pricing/quotequick" style="color:#9ca3af;">View plans</a></p>
  </td></tr>
</table>
</body></html>`;

  switch (day) {
    case 0:
      return {
        subject: `Your quote calculator is ready — ${businessName}`,
        html: wrap(`
          <p style="font-size:16px;font-weight:700;color:#111;margin:0 0 12px;">Your calculator is live!</p>
          <p>Share this link to start getting leads today:</p>
          <div style="padding:14px;background:#f0fdf4;border-radius:8px;margin:12px 0;">
            <a href="${calcUrl}" style="color:#059669;font-weight:700;font-size:15px;word-break:break-all;">${calcUrl}</a>
          </div>
          <p><strong>3 places to share it right now:</strong></p>
          <ol style="padding-left:20px;margin:8px 0 16px;">
            <li>Your Google Business profile</li>
            <li>Your email signature</li>
            <li>Your social media bio</li>
          </ol>
          <a href="${calcUrl}" style="display:inline-block;padding:12px 24px;background:#394247;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Open Your Calculator</a>
        `),
      };

    case 1:
      return {
        subject: `Where to put your quote link — ${businessName}`,
        html: wrap(`
          <p>Here are the best places to share your QuoteQuick calculator:</p>
          <p><strong>1. Google Business Profile</strong><br/>Add the link to your GBP website field or posts. Customers searching for you will see it first.</p>
          <p><strong>2. Email signature</strong><br/>Add "Get an instant quote: ${calcUrl}" to every email you send.</p>
          <p><strong>3. Social bio</strong><br/>Instagram, Facebook, or LinkedIn — replace your website link with your quote page.</p>
          <p><strong>4. Your website</strong><br/>Embed the calculator directly. <a href="${editUrl}" style="color:#059669;">Get the embed code</a></p>
        `),
      };

    case 3:
      if (views > 0 || leadCount > 0) {
        return {
          subject: `${leadCount > 0 ? `You have ${leadCount} lead${leadCount > 1 ? 's' : ''}` : `${views} people viewed your calculator`} — ${businessName}`,
          html: wrap(`
            <p style="font-size:16px;font-weight:700;color:#111;margin:0 0 12px;">Your calculator is getting traction!</p>
            <div style="display:flex;gap:16px;margin:16px 0;">
              <div style="flex:1;padding:16px;background:#f8fafc;border-radius:8px;text-align:center;">
                <p style="font-size:24px;font-weight:800;color:#111;margin:0;">${views}</p>
                <p style="font-size:12px;color:#666;margin:4px 0 0;">Views</p>
              </div>
              <div style="flex:1;padding:16px;background:#f0fdf4;border-radius:8px;text-align:center;">
                <p style="font-size:24px;font-weight:800;color:#059669;margin:0;">${leadCount}</p>
                <p style="font-size:12px;color:#666;margin:4px 0 0;">Leads</p>
              </div>
            </div>
            <a href="${editUrl}" style="display:inline-block;padding:12px 24px;background:#394247;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">View Dashboard</a>
          `),
        };
      }
      return {
        subject: `No views yet? Here's how to fix that — ${businessName}`,
        html: wrap(`
          <p>Your calculator is live but hasn't had any visitors yet. That's normal — it just needs traffic.</p>
          <p><strong>3 free ways to get views today:</strong></p>
          <ol style="padding-left:20px;margin:8px 0 16px;">
            <li>Post your link on your Facebook/Instagram page</li>
            <li>Text it to 5 past customers: "We have instant quotes now — try it"</li>
            <li>Add it to your Google Business profile</li>
          </ol>
          <a href="${calcUrl}" style="display:inline-block;padding:12px 24px;background:#394247;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Copy Your Link</a>
        `),
      };

    case PRO_PREVIEW_ENDED_DAY:
      // The ONE honest expiry email. No countdown, no "reactivate", no
      // pressure — the calculator stays live on the Free plan forever.
      return {
        subject: `Your Pro preview has ended — ${businessName}`,
        html: wrap(`
          <p style="font-size:16px;font-weight:700;color:#111;margin:0 0 12px;">Your Pro preview has ended — you're now on the Free plan.</p>
          <p><strong>Your calculator stays live.</strong> Your quote page, your leads, and everything the Free plan includes keep working — everything free stays free forever.</p>
          <p>Pro features (AI quote assistant, custom domain, badge removal) are available whenever you want them. Upgrade anytime:</p>
          <p style="margin:12px 0;"><strong>Pro — ${QQ_PRO_PRICE}/mo</strong> &middot; <strong>Business — ${QQ_BUSINESS_PRICE}/mo</strong></p>
          <a href="${pricingUrl}" style="display:inline-block;padding:12px 24px;background:#394247;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">View Plans</a>
        `),
      };

    default:
      return null;
  }
}

/** Onboarding emails fire on exactly these days after creation. */
export const ONBOARDING_EMAIL_DAYS = [0, 1, 3];

/** The Pro-features preview ends after 14 days. */
export const PRO_PREVIEW_ENDED_DAY = 14;

/* Catch-up window for the preview-ended email: if the daily run was missed
 * (deploy, downtime), still send up to 2 days late — but never blast the
 * historical backlog of older free calculators. */
const PRO_PREVIEW_ENDED_MAX_DAY = 16;

/** Dedup marker for the new honest expiry email. */
export const PRO_PREVIEW_ENDED_EVENT = "pro_preview_ended_email";
/** Legacy day-14 marker — checked too so historical sends never double up. */
const LEGACY_DAY14_EVENT = "trial_email_day_14";

export interface LifecycleCalculatorRecord {
  id: number;
  business_name: string;
  slug: string | null;
  owner_email: string | null;
  plan_tier: string | null;
  total_views: number | null;
  created_at: Date | string | null;
}

/**
 * IO surface for the lifecycle pass. Deliberately narrow: there is NO
 * deployment-status accessor here, so the lifecycle pass is incapable of
 * pausing a calculator by construction. server/jobs/trialLifecycleWorker.test.ts
 * (npm run check:trial-truth) additionally asserts this file never touches
 * deployment status.
 */
export interface LifecycleIO {
  listCalculators(): Promise<LifecycleCalculatorRecord[]>;
  countLeads(calculatorId: number): Promise<number>;
  wasEventTracked(calculatorId: number, eventType: string): Promise<boolean>;
  trackEvent(event: { calculator_id: number; event_type: string; metadata: Record<string, unknown> }): Promise<void>;
  sendEmail(to: string, subject: string, html: string): Promise<void>;
  baseUrl: string;
}

function buildDefaultIO(): LifecycleIO | null {
  const mail = getTransporter();
  if (!mail) return null;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@wefixtrades.com';
  const baseUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '';
  return {
    baseUrl,
    async listCalculators() {
      return db.select({
        id: calculators.id,
        business_name: calculators.business_name,
        slug: calculators.slug,
        owner_email: calculators.owner_email,
        plan_tier: calculators.plan_tier,
        total_views: calculators.total_views,
        created_at: calculators.created_at,
      })
        .from(calculators)
        .where(isNotNull(calculators.owner_email))
        .orderBy(desc(calculators.created_at));
    },
    async countLeads(calculatorId) {
      const [leadRow] = await db.select({ count: sql<number>`count(*)::int` })
        .from(leads).where(eq(leads.calculator_id, calculatorId));
      return leadRow?.count ?? 0;
    },
    async wasEventTracked(calculatorId, eventType) {
      const [existing] = await db.select({ id: analyticsEvents.id })
        .from(analyticsEvents)
        .where(and(
          eq(analyticsEvents.calculator_id, calculatorId),
          eq(analyticsEvents.event_type, eventType),
        ))
        .limit(1);
      return !!existing;
    },
    async trackEvent(event) {
      await storage.trackEvent(event);
    },
    async sendEmail(to, subject, html) {
      await mail.sendMail({ from, to, subject, html });
    },
  };
}

/**
 * Daily lifecycle pass: onboarding emails (day 0/1/3) + the single honest
 * "Pro preview has ended" email (day 14). Never pauses anything.
 */
export async function processCalculatorLifecycle(
  io?: LifecycleIO,
  now: number = Date.now(),
): Promise<{ processed: number; emails: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let emails = 0;

  const effectiveIO = io ?? buildDefaultIO();
  if (!effectiveIO) return { processed: 0, emails: 0, errors: ['SMTP not configured'] };

  const allCalcs = await effectiveIO.listCalculators();

  for (const calc of allCalcs) {
    if (!calc.owner_email || !calc.created_at) continue;

    // Skip paid users — they upgraded; no onboarding drip, no expiry email.
    if (calc.plan_tier && calc.plan_tier !== 'free') continue;

    const day = daysSince(calc.created_at, now);

    const isOnboardingDay = ONBOARDING_EMAIL_DAYS.includes(day);
    const isPreviewEndedDay = day >= PRO_PREVIEW_ENDED_DAY && day <= PRO_PREVIEW_ENDED_MAX_DAY;
    if (!isOnboardingDay && !isPreviewEndedDay) continue;

    // Dedup via analytics_events. The onboarding markers keep their legacy
    // names (internal identifiers — renaming would re-send mid-sequence).
    const dedupEvent = isOnboardingDay ? `trial_email_day_${day}` : PRO_PREVIEW_ENDED_EVENT;
    if (await effectiveIO.wasEventTracked(calc.id, dedupEvent)) continue;
    if (!isOnboardingDay && await effectiveIO.wasEventTracked(calc.id, LEGACY_DAY14_EVENT)) continue;

    const leadCount = await effectiveIO.countLeads(calc.id);

    // Wave P-E — slug can now be null (released-back-to-pool). Skip the
    // lifecycle email for released calculators; nothing useful to link to.
    if (!calc.slug) continue;
    const ctx: LifecycleEmailContext = {
      businessName: calc.business_name,
      slug: calc.slug,
      ownerEmail: calc.owner_email,
      views: calc.total_views ?? 0,
      leadCount,
      calcUrl: `${effectiveIO.baseUrl}/calculator?slug=${calc.slug}`,
      editUrl: `${effectiveIO.baseUrl}/EditCalculator?token=check-dashboard`,
      pricingUrl: `${effectiveIO.baseUrl}/pricing/quotequick`,
    };

    const email = buildLifecycleEmail(isOnboardingDay ? day : PRO_PREVIEW_ENDED_DAY, ctx);
    if (!email) continue;

    try {
      await effectiveIO.sendEmail(calc.owner_email, email.subject, email.html);

      await effectiveIO.trackEvent({
        calculator_id: calc.id,
        event_type: dedupEvent,
        metadata: { day, email: calc.owner_email, leadCount, views: calc.total_views },
      });

      emails++;
    } catch (err: any) {
      errors.push(`calc ${calc.id} day ${day}: ${err.message}`);
    }

    processed++;
  }

  if (emails > 0) log.info(`calculator lifecycle: ${emails} emails sent (${processed} processed)`);
  return { processed, emails, errors };
}
