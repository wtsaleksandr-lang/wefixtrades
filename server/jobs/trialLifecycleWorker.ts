import nodemailer from "nodemailer";
import { storage } from "../storage";
import { db } from "../db";
import { calculators, deploymentStatus, leads, analyticsEvents } from "@shared/schema";
import { eq, and, sql, gte, lte, isNotNull, desc } from "drizzle-orm";
import { sendTrialExpiryEmail } from "../lib/trialExpiryEmail";

/**
 * Trial Lifecycle Worker
 *
 * Runs daily. For each calculator, determines trial day and sends
 * appropriate lifecycle email. Uses calculator.created_at as trial start.
 *
 * Trial is 14 days. Grace period: 3 days for active calculators.
 * Emails: day 0, 1, 3, 7, 10, 13, 14, 21.
 */

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

function daysSince(date: Date | string | null): number {
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

function buildTrialEmail(day: number, ctx: {
  businessName: string;
  slug: string;
  ownerEmail: string;
  views: number;
  leadCount: number;
  calcUrl: string;
  editUrl: string;
  pricingUrl: string;
}): { subject: string; html: string } | null {
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

    case 7:
      return {
        subject: `Halfway through your trial — ${businessName}`,
        html: wrap(`
          <p style="font-size:16px;font-weight:700;color:#111;margin:0 0 12px;">Your 14-day trial is half over.</p>
          <p><strong>Your stats so far:</strong> ${views} views, ${leadCount} leads captured.</p>
          ${leadCount > 0 ? `<p style="color:#059669;font-weight:600;">You've already captured leads worth more than a month of QuoteQuick.</p>` : ''}
          <p>Your calculator stays live — just pick a plan before day 14 to keep it running.</p>
          <a href="${pricingUrl}" style="display:inline-block;padding:12px 24px;background:#394247;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">View Plans — From $49/mo</a>
        `),
      };

    case 10:
      return {
        subject: `4 days left on your trial — ${businessName}`,
        html: wrap(`
          <p>Your QuoteQuick trial ends in 4 days.</p>
          <p><strong>What happens:</strong> Your calculator pauses. Your leads and settings are never deleted. Reactivate anytime by picking a plan.</p>
          <p><strong>Solo plan: $49/mo.</strong> One job covers it.</p>
          <a href="${pricingUrl}" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Choose a Plan</a>
        `),
      };

    case 13:
      return {
        subject: `Your trial ends tomorrow — ${businessName}`,
        html: wrap(`
          <p style="font-size:16px;font-weight:700;color:#111;margin:0 0 12px;">Last day of your free trial.</p>
          <p>Choose Solo ($49/mo) or Business ($99/mo) to keep your calculator live. Takes 30 seconds.</p>
          ${leadCount > 0 ? `<p style="color:#059669;font-weight:600;">You've captured ${leadCount} lead${leadCount > 1 ? 's' : ''} so far. Don't lose momentum.</p>` : ''}
          <a href="${pricingUrl}" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Pick a Plan</a>
          <p style="font-size:12px;color:#999;margin:16px 0 0;">No contracts. Cancel anytime.</p>
        `),
      };

    case 14:
      return {
        subject: `Your trial has ended — ${businessName}`,
        html: wrap(`
          <p>Your QuoteQuick trial has ended and your calculator is now paused.</p>
          <p><strong>Nothing is deleted.</strong> Your leads, settings, and calculator are all saved. Reactivate in 30 seconds by picking a plan.</p>
          <a href="${pricingUrl}" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Reactivate — From $49/mo</a>
        `),
      };

    case 21:
      return {
        subject: `Your calculator is still waiting — ${businessName}`,
        html: wrap(`
          <p>Just a reminder: your QuoteQuick calculator for <strong>${businessName}</strong> is still saved.</p>
          <p>Your leads and settings haven't been deleted. Pick a plan and you're back live instantly.</p>
          <a href="${pricingUrl}" style="display:inline-block;padding:12px 24px;background:#394247;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Reactivate</a>
          <p style="font-size:12px;color:#999;margin:16px 0 0;">This is our last reminder. We won't email again unless you reactivate.</p>
        `),
      };

    default:
      return null;
  }
}

const TRIAL_EMAIL_DAYS = [0, 1, 3, 7, 10, 13, 14, 21];

export async function processTrialLifecycle(): Promise<{ processed: number; emails: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let emails = 0;

  const mail = getTransporter();
  if (!mail) return { processed: 0, emails: 0, errors: ['SMTP not configured'] };

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@wefixtrades.com';
  const baseUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '';

  // Get all calculators with an owner email
  const allCalcs = await db.select({
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

  for (const calc of allCalcs) {
    if (!calc.owner_email || !calc.created_at) continue;

    // Skip paid users
    if (calc.plan_tier && calc.plan_tier !== 'free') continue;

    const day = daysSince(calc.created_at);

    // Only send on trigger days
    if (!TRIAL_EMAIL_DAYS.includes(day)) continue;

    // Check if we already sent this day's email (dedup via analytics_events)
    const [existing] = await db.select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(and(
        eq(analyticsEvents.calculator_id, calc.id),
        eq(analyticsEvents.event_type, `trial_email_day_${day}`),
      ))
      .limit(1);

    if (existing) continue; // Already sent

    // Get lead count
    const [leadRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(leads).where(eq(leads.calculator_id, calc.id));
    const leadCount = leadRow?.count ?? 0;

    const ctx = {
      businessName: calc.business_name,
      slug: calc.slug,
      ownerEmail: calc.owner_email,
      views: calc.total_views ?? 0,
      leadCount,
      calcUrl: `${baseUrl}/calculator?slug=${calc.slug}`,
      editUrl: `${baseUrl}/EditCalculator?token=check-dashboard`,
      pricingUrl: `${baseUrl}/pricing/quotequick`,
    };

    const email = buildTrialEmail(day, ctx);
    if (!email) continue;

    try {
      await mail.sendMail({
        from,
        to: calc.owner_email,
        subject: email.subject,
        html: email.html,
      });

      // On day 7+ (7 days remaining or less), also send a branded trial
      // expiry warning via the transactional shell. Respects unsubscribe
      // preferences. Non-blocking — never fails the main lifecycle email.
      if (day >= 7 && calc.owner_email) {
        const daysRemaining = Math.max(0, 14 - day);
        sendTrialExpiryEmail(calc.owner_email, {
          businessName: calc.business_name,
          daysRemaining,
          upgradeUrl: ctx.pricingUrl,
        }).catch(err =>
          console.warn(`[trial-expiry-email] failed for calc ${calc.id}:`, err.message),
        );
      }

      // Record that we sent this day's email
      await storage.trackEvent({
        calculator_id: calc.id,
        event_type: `trial_email_day_${day}`,
        metadata: { day, email: calc.owner_email, leadCount, views: calc.total_views },
      });

      emails++;
    } catch (err: any) {
      errors.push(`calc ${calc.id} day ${day}: ${err.message}`);
    }

    processed++;
  }

  return { processed, emails, errors };
}

/**
 * Auto-pause expired trial calculators.
 * Runs as part of the daily lifecycle. Separate function for clarity.
 *
 * Rules:
 * - Trial = 14 days from calculator.created_at
 * - Paid users (plan_tier !== 'free') are skipped
 * - Grace: if calculator has >= 1 lead, extend to 17 days (14 + 3)
 * - Pause = set deployment_status.status to 'draft'
 * - Idempotent: only pauses calculators currently 'live'
 * - Nothing is deleted. Dashboard remains accessible.
 */
export async function pauseExpiredTrials(): Promise<{ checked: number; paused: number; errors: string[] }> {
  const errors: string[] = [];
  let checked = 0;
  let paused = 0;

  // Get all free-tier calculators that are currently live
  const liveCalcs = await db.select({
    id: calculators.id,
    business_name: calculators.business_name,
    slug: calculators.slug,
    owner_email: calculators.owner_email,
    plan_tier: calculators.plan_tier,
    created_at: calculators.created_at,
  })
    .from(calculators)
    .where(isNotNull(calculators.created_at))
    .orderBy(desc(calculators.created_at));

  for (const calc of liveCalcs) {
    if (!calc.created_at) continue;

    // Skip paid users
    if (calc.plan_tier && calc.plan_tier !== 'free') continue;

    checked++;

    const day = daysSince(calc.created_at);

    // Not expired yet (within 14-day trial)
    if (day < 14) continue;

    // Check current deployment status — only act on 'live' calculators
    const deploy = await storage.getDeploymentStatus(calc.id);
    if (!deploy || deploy.status !== 'live') continue; // Already paused or no status

    // Grace period: if has leads, extend to day 17
    const [leadRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(leads).where(eq(leads.calculator_id, calc.id));
    const leadCount = leadRow?.count ?? 0;

    const expiryDay = leadCount > 0 ? 17 : 14;

    if (day < expiryDay) continue; // Still in grace period

    // Pause: set deployment_status to draft
    try {
      await storage.upsertDeploymentStatus({
        calculator_id: calc.id,
        status: 'draft',
      });

      // Record the pause event (dedup marker)
      await storage.trackEvent({
        calculator_id: calc.id,
        event_type: 'trial_auto_paused',
        metadata: { day, leadCount, grace: leadCount > 0, slug: calc.slug },
      });

      paused++;
    } catch (err: any) {
      errors.push(`pause calc ${calc.id}: ${err.message}`);
    }
  }

  return { checked, paused, errors };
}
