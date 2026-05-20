/**
 * Wave P-E — QuoteQuick slug lifecycle.
 *
 * Free-tier calculators that haven't been edited or viewed for 30 days
 * are considered abandoned. Their subdomain (`{slug}.your-quote.net`)
 * gets released back to the pool so a new user with the same business
 * name can claim it.
 *
 * The cycle:
 *   - Day 23 of inactivity → send the owner a heads-up email warning
 *     them they have 7 days to interact (edit or open the wizard) or
 *     their hosted link will be released.
 *   - Day 30 of inactivity → null the `slug` column, leave the calculator
 *     row intact for analytics. The owner can still log in and pick a
 *     new slug.
 *
 * Paid tiers (`plan_tier != 'free'`) are excluded — their slugs are held
 * indefinitely.
 *
 * The cron entry point is `releaseStaleSlugs()`; it runs daily at 04:30
 * UTC via server/jobs/scheduler.ts. Same idempotency guarantee as the
 * other waves (rerunning the cron in the same day is a no-op).
 */

import { eq, and, lt, isNull, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { calculators } from '@shared/schemas/db';
import { queueEmail } from './emailQueueService';
import { createLogger } from '../lib/logger';

const log = createLogger('QuotequickSlugLifecycle');

const WARNING_AGE_DAYS = 23;
const RELEASE_AGE_DAYS = 30;

interface ReleaseResult {
  warned: number;
  released: number;
}

export async function releaseStaleSlugs(): Promise<ReleaseResult> {
  const warningCutoff = new Date(Date.now() - WARNING_AGE_DAYS * 24 * 3600 * 1000);
  const releaseCutoff = new Date(Date.now() - RELEASE_AGE_DAYS * 24 * 3600 * 1000);

  // Step 1 — find free-tier rows that crossed the warning threshold but
  // haven't been warned yet. Send them a single email and stamp
  // slug_release_warned_at so we don't spam on subsequent ticks.
  const warnCandidates = await db
    .select({
      id: calculators.id,
      slug: calculators.slug,
      business_name: calculators.business_name,
      owner_email: calculators.owner_email,
      updated_at: calculators.updated_at,
    })
    .from(calculators)
    .where(
      and(
        eq(calculators.plan_tier, 'free'),
        lt(calculators.updated_at, warningCutoff),
        isNull(calculators.slug_release_warned_at),
        isNotNull(calculators.slug),
        isNotNull(calculators.owner_email),
      ),
    );

  let warned = 0;
  for (const row of warnCandidates) {
    try {
      if (!row.owner_email || !row.slug) continue;
      const slug = row.slug;
      await queueEmail(
        row.owner_email,
        `Your QuoteQuick hosted link is about to be released`,
        renderWarningHtml(row.business_name, slug),
        renderWarningText(row.business_name, slug),
        { kind: 'qq_slug_release_warning', calculator_id: row.id },
      );
      await db
        .update(calculators)
        .set({ slug_release_warned_at: new Date() })
        .where(eq(calculators.id, row.id));
      warned += 1;
    } catch (err: any) {
      log.error('Failed to warn owner of pending slug release', {
        calculator_id: row.id, error: err.message,
      });
    }
  }

  // Step 2 — find rows that have now crossed the release threshold and
  // null their slug. Each row is updated independently so a single
  // failure doesn't take the cron down.
  const releaseCandidates = await db
    .select({
      id: calculators.id,
      slug: calculators.slug,
      business_name: calculators.business_name,
    })
    .from(calculators)
    .where(
      and(
        eq(calculators.plan_tier, 'free'),
        lt(calculators.updated_at, releaseCutoff),
        isNotNull(calculators.slug),
      ),
    );

  let released = 0;
  for (const row of releaseCandidates) {
    try {
      // Null the slug; the row stays for analytics. We don't reset
      // slug_release_warned_at — if the user comes back, they pick a
      // new slug from the wizard.
      await db
        .update(calculators)
        // `slug` is `notNull` in the schema today; we ALTER it via the
        // migration to allow NULL. Until that lands in prod, the update
        // would fail server-side and the cron would log + retry — so the
        // migration is part of the same PR.
        .set({ slug: null as unknown as string })
        .where(eq(calculators.id, row.id));
      released += 1;
      log.info('Released abandoned slug', {
        calculator_id: row.id, slug: row.slug, business_name: row.business_name,
      });
    } catch (err: any) {
      log.error('Failed to release slug', {
        calculator_id: row.id, error: err.message,
      });
    }
  }

  return { warned, released };
}

/**
 * Called by the wizard save / public view paths to bump updated_at and
 * (when relevant) clear a previous release warning. Cheap; safe to call
 * on every save. We don't want the warning_at flag stuck after the user
 * comes back, so we reset it the moment they interact again.
 */
export async function touchCalculatorActivity(calculatorId: number): Promise<void> {
  try {
    await db
      .update(calculators)
      .set({
        updated_at: new Date(),
        slug_release_warned_at: null,
      })
      .where(eq(calculators.id, calculatorId));
  } catch (err: any) {
    log.warn('touchCalculatorActivity failed (non-fatal)', {
      calculator_id: calculatorId, error: err.message,
    });
  }
}

function renderWarningHtml(businessName: string, slug: string): string {
  const url = `https://${slug}.your-quote.net`;
  return `
    <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
      <h2 style="font-size: 20px; margin: 0 0 14px;">Heads-up: your hosted QuoteQuick link is about to be released</h2>
      <p style="font-size: 14.5px; line-height: 1.55;">
        Hi! It looks like your QuoteQuick calculator for
        <strong>${escapeHtml(businessName)}</strong> hasn't been edited or
        viewed in about 3 weeks. To keep subdomains available for new users,
        we release inactive hosted links after 30 days of inactivity on the
        free plan.
      </p>
      <p style="font-size: 14.5px; line-height: 1.55;">
        Your link <code style="background: #f1f5f9; padding: 1px 5px; border-radius: 3px;">${escapeHtml(url)}</code>
        will be released in <strong>about 7 days</strong> unless you log in
        and either edit your calculator, or simply open the wizard once. That
        bumps the activity timer for another 30 days.
      </p>
      <p style="font-size: 14.5px; line-height: 1.55;">
        If you'd like to keep the link forever even without regular activity,
        upgrade to QuoteQuick Pro — that exempts you from the inactivity
        release entirely.
      </p>
      <p style="font-size: 13px; color: #475569; line-height: 1.55; margin-top: 24px;">
        — The QuoteQuick team
      </p>
    </div>
  `.trim();
}

function renderWarningText(businessName: string, slug: string): string {
  const url = `https://${slug}.your-quote.net`;
  return (
    `Heads-up: your hosted QuoteQuick link for ${businessName} hasn't been` +
    ` edited or viewed in about 3 weeks. To keep subdomains available for` +
    ` new users, we release inactive hosted links after 30 days of` +
    ` inactivity on the free plan.\n\n` +
    `Your link ${url} will be released in about 7 days unless you log in` +
    ` and either edit your calculator, or simply open the wizard once.` +
    ` That bumps the activity timer for another 30 days.\n\n` +
    `If you'd like to keep the link forever even without regular activity,` +
    ` upgrade to QuoteQuick Pro — that exempts you from the inactivity` +
    ` release entirely.\n\n— The QuoteQuick team`
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Re-export for the cron test harness — keeps the cron config in one place.
export const QUOTEQUICK_SLUG_LIFECYCLE_CONFIG = {
  WARNING_AGE_DAYS,
  RELEASE_AGE_DAYS,
  cronExpr: '30 4 * * *',
  cronLabel: 'quotequick_slug_release',
} as const;

// Future caller-side: server/routes/calculatorRoutes.ts should call
// touchCalculatorActivity(id) on PATCH /api/calculators and on the
// track-view endpoint. Wiring those is part of P-E too.
void sql;
