/**
 * Calculator storage helpers extracted from server/storage.ts.
 *
 * Pure functions over `db` — no `this`, no cross-method calls (intra-module
 * helpers call each other directly). The DatabaseStorage class re-exports
 * these through thin wrappers so the public API stays byte-identical.
 *
 * Tables touched: calculators, deployment_status, analytics_events (delete
 * cascade), leads (delete cascade + count for admin overview).
 *
 * Scope: per-QuoteQuick-calculator CRUD (create/get/update/duplicate/delete,
 * slug + token + old-slug lookups, view counter), deployment-status
 * upsert/read, and the admin-overview aggregator
 * (getAllCalculatorsForAdmin) plus owner-side `getCalculatorsByUserId` and
 * Stripe-subscription reverse lookup.
 */

import { db } from "../db";
import {
  calculators,
  analyticsEvents,
  deploymentStatus,
  leads,
  type Calculator, type InsertCalculator,
  type DeploymentStatus, type InsertDeploymentStatus,
} from "@shared/schema";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { QUOTEQUICK_PLAN_REVENUE_CENTS } from "@shared/pricing";

export async function createCalculator(data: InsertCalculator): Promise<Calculator> {
  const [calc] = await db.insert(calculators).values(data).returning();
  return calc;
}

export async function getCalculatorBySlug(slug: string): Promise<Calculator | undefined> {
  const [calc] = await db.select().from(calculators).where(eq(calculators.slug, slug)).limit(1);
  return calc;
}

export async function getCalculatorByToken(token: string): Promise<Calculator | undefined> {
  const [calc] = await db.select().from(calculators).where(eq(calculators.edit_token, token)).limit(1);
  return calc;
}

export async function getCalculatorById(id: number): Promise<Calculator | undefined> {
  const [calc] = await db.select().from(calculators).where(eq(calculators.id, id)).limit(1);
  return calc;
}

export async function updateCalculator(
  id: number,
  updates: Partial<InsertCalculator>,
): Promise<Calculator | undefined> {
  const [calc] = await db.update(calculators).set(updates).where(eq(calculators.id, id)).returning();
  return calc;
}

export async function duplicateCalculator(
  id: number,
  newSlug: string,
  newToken: string,
  newExpiry: Date,
): Promise<Calculator | undefined> {
  const original = await getCalculatorById(id);
  if (!original) return undefined;

  await db.update(calculators).set({ is_duplicated: true }).where(eq(calculators.id, id));

  const [newCalc] = await db.insert(calculators).values({
    user_id: original.user_id,
    slug: newSlug,
    business_name: original.business_name,
    trade_type: original.trade_type,
    tagline: original.tagline,
    logo_url: original.logo_url,
    owner_email: original.owner_email,
    owner_phone: original.owner_phone,
    website_url: original.website_url,
    primary_color: original.primary_color,
    cta_button_text: original.cta_button_text,
    lead_thank_you_message: original.lead_thank_you_message,
    pricing_config: original.pricing_config,
    theme_overrides: original.theme_overrides,
    calculator_settings: original.calculator_settings,
    edit_token: newToken,
    token_expires_at: newExpiry,
    is_duplicated: false,
    total_views: 0,
    show_powered_by_badge: original.show_powered_by_badge,
    plan_tier: original.plan_tier,
  }).returning();
  return newCalc;
}

export async function getCalculatorByOldSlug(oldSlug: string): Promise<Calculator | undefined> {
  // Search for a calculator that has this slug in its _slug_redirects metadata.
  //
  // Wave Q-Hotfix — the previous version dropped the `jsonb_typeof` guard.
  // When any row had `calculator_settings._slug_redirects` as null or as a
  // non-array (e.g. legacy rows pre-slug-redirect feature), the bare
  // `@> [...]::jsonb` containment check threw and bubbled out as HTTP 500
  // from the /api/calculators/lookup endpoint, killing the hosted-page
  // feature entirely. The typeof guard short-circuits rows that don't
  // have an array there so the containment runs only on safe shapes.
  const results = await db.select().from(calculators)
    .where(sql`
      jsonb_typeof(${calculators.calculator_settings}::jsonb -> '_slug_redirects') = 'array'
      AND ${calculators.calculator_settings}::jsonb -> '_slug_redirects' @> ${JSON.stringify([{ slug: oldSlug }])}::jsonb
    `)
    .limit(1);
  return results[0];
}

export async function deleteCalculator(id: number): Promise<void> {
  await db.delete(analyticsEvents).where(eq(analyticsEvents.calculator_id, id));
  await db.delete(deploymentStatus).where(eq(deploymentStatus.calculator_id, id));
  await db.delete(leads).where(eq(leads.calculator_id, id));
  await db.delete(calculators).where(eq(calculators.id, id));
}

export async function incrementViews(id: number): Promise<void> {
  await db.update(calculators).set({ total_views: sql`${calculators.total_views} + 1` }).where(eq(calculators.id, id));
}

export async function getDeploymentStatus(calculatorId: number): Promise<DeploymentStatus | undefined> {
  const [ds] = await db.select().from(deploymentStatus).where(eq(deploymentStatus.calculator_id, calculatorId)).limit(1);
  return ds;
}

export async function upsertDeploymentStatus(data: InsertDeploymentStatus): Promise<DeploymentStatus> {
  const existing = await getDeploymentStatus(data.calculator_id);
  if (existing) {
    const [updated] = await db.update(deploymentStatus)
      .set({ ...data, updated_at: new Date() })
      .where(eq(deploymentStatus.calculator_id, data.calculator_id))
      .returning();
    return updated;
  }
  const [created] = await db.insert(deploymentStatus).values(data).returning();
  return created;
}

export async function getAllCalculatorsWithEmail(): Promise<Calculator[]> {
  return db.select().from(calculators).where(isNotNull(calculators.owner_email));
}

export async function getAllCalculatorsForAdmin(): Promise<any[]> {
  const allCalcs = await db.select({
    id: calculators.id,
    user_id: calculators.user_id,
    business_name: calculators.business_name,
    trade_type: calculators.trade_type,
    slug: calculators.slug,
    owner_email: calculators.owner_email,
    plan_tier: calculators.plan_tier,
    total_views: calculators.total_views,
    created_at: calculators.created_at,
    calculator_settings: calculators.calculator_settings,
  }).from(calculators).orderBy(desc(calculators.created_at));

  const PLAN_REVENUE = QUOTEQUICK_PLAN_REVENUE_CENTS;
  const QQ_COST_CENTS = 500;

  const results = [];
  for (const calc of allCalcs) {
    const deploy = await getDeploymentStatus(calc.id);
    const [leadRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(leads).where(eq(leads.calculator_id, calc.id));
    const tier = (calc.plan_tier as string) ?? 'free';
    const settings = (calc.calculator_settings as any) || {};
    results.push({
      ...calc,
      total_leads: leadRow?.count ?? 0,
      status: deploy?.status ?? 'draft',
      price_cents: PLAN_REVENUE[tier] ?? 0,
      cost_cents: tier === 'free' ? 0 : QQ_COST_CENTS,
      // Lead email notifications are on unless explicitly disabled.
      notifications_enabled: settings?.followup?.notifications?.email_enabled !== false,
    });
  }
  return results;
}

export async function findCalculatorByStripeSubscriptionId(
  subscriptionId: string,
): Promise<Calculator | undefined> {
  const [calc] = await db.select().from(calculators)
    .where(eq(calculators.stripe_subscription_id, subscriptionId))
    .limit(1);
  return calc;
}

export async function getCalculatorsByUserId(userId: number): Promise<Calculator[]> {
  return db.select().from(calculators).where(eq(calculators.user_id, userId)).orderBy(desc(calculators.id));
}
