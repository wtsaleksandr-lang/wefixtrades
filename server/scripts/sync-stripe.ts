/**
 * Sync service catalog → Stripe Products & Prices.
 *
 * Usage:
 *   npx tsx server/scripts/sync-stripe.ts
 *
 * What it does:
 *   1. Reads all active services from service_catalog
 *   2. For each service:
 *      - Creates a Stripe Product if stripe_product_id is missing
 *      - Creates a monthly Stripe Price if stripe_price_id is missing
 *      - Creates a yearly Stripe Price if stripe_yearly_price_id is missing (monthly services only)
 *   3. Stores IDs back into service_catalog
 *
 * Yearly price = monthly * 12 * (1 - YEARLY_DISCOUNT_PCT), billed annually.
 *
 * Safe to run multiple times — skips services that already have Stripe IDs.
 * To force re-sync (e.g. after price change), clear the stripe_price_id /
 * stripe_yearly_price_id in the database and re-run.
 *
 * Requires:
 *   STRIPE_SECRET_KEY in environment
 *   DATABASE_URL in environment
 */

import Stripe from "stripe";
import { db } from "../db";
import { serviceCatalog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { YEARLY_DISCOUNT_PCT } from "@shared/pricing";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set.");
    process.exit(1);
  }
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
}

async function main() {
  const stripe = getStripe();
  console.log("Syncing service catalog → Stripe...\n");
  console.log(`Yearly discount: ${Math.round(YEARLY_DISCOUNT_PCT * 100)}%\n`);

  const services = await db.select().from(serviceCatalog).orderBy(serviceCatalog.sort_order);

  if (!services.length) {
    console.log("No services found. Run seed-services.ts first.");
    process.exit(0);
  }

  let created = 0;
  let skipped = 0;

  for (const svc of services) {
    if (!svc.is_active) {
      console.log(`  ⏭ ${svc.name} — inactive, skipping`);
      skipped++;
      continue;
    }

    if (!svc.default_price || svc.default_price <= 0) {
      console.log(`  ⏭ ${svc.name} — no price set, skipping`);
      skipped++;
      continue;
    }

    let productId = svc.stripe_product_id;
    let priceId = svc.stripe_price_id;
    let yearlyPriceId = svc.stripe_yearly_price_id;
    const isRecurring = svc.billing_period === "monthly";

    // ─── Create Product if missing ───
    if (!productId) {
      const product = await stripe.products.create({
        name: svc.name,
        description: svc.tagline || svc.description || undefined,
        metadata: {
          service_catalog_id: svc.id,
          category: svc.category,
          delivery_pattern: svc.delivery_pattern,
        },
      });
      productId = product.id;
      console.log(`  ✓ Created Product: ${svc.name} → ${productId}`);
    } else {
      console.log(`  · Product exists: ${svc.name} → ${productId}`);
    }

    // ─── Create monthly/one-time Price if missing ───
    if (!priceId) {
      const priceParams: Stripe.PriceCreateParams = {
        product: productId,
        currency: "usd",
        unit_amount: svc.default_price,
        metadata: { service_catalog_id: svc.id, period: isRecurring ? "monthly" : "one-time" },
      };

      if (isRecurring) {
        priceParams.recurring = { interval: "month" };
      }

      const price = await stripe.prices.create(priceParams);
      priceId = price.id;
      console.log(`  ✓ Created Price: $${(svc.default_price / 100).toFixed(2)}${isRecurring ? "/mo" : " one-time"} → ${priceId}`);
    } else {
      console.log(`  · Price exists: ${svc.name} → ${priceId}`);
    }

    // ─── Create yearly Price if missing (monthly services only) ───
    if (isRecurring && !yearlyPriceId) {
      const yearlyAmountCents = Math.round(svc.default_price * 12 * (1 - YEARLY_DISCOUNT_PCT));

      const yearlyPrice = await stripe.prices.create({
        product: productId,
        currency: "usd",
        unit_amount: yearlyAmountCents,
        recurring: { interval: "year" },
        metadata: { service_catalog_id: svc.id, period: "yearly" },
      });
      yearlyPriceId = yearlyPrice.id;
      console.log(`  ✓ Created Yearly Price: $${(yearlyAmountCents / 100).toFixed(2)}/yr → ${yearlyPriceId}`);
    } else if (isRecurring && yearlyPriceId) {
      console.log(`  · Yearly Price exists: ${svc.name} → ${yearlyPriceId}`);
    }

    // ─── Store IDs back in service_catalog ───
    const updates: Record<string, any> = {};
    if (productId !== svc.stripe_product_id) updates.stripe_product_id = productId;
    if (priceId !== svc.stripe_price_id) updates.stripe_price_id = priceId;
    if (yearlyPriceId && yearlyPriceId !== svc.stripe_yearly_price_id) updates.stripe_yearly_price_id = yearlyPriceId;

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date();
      await db.update(serviceCatalog).set(updates).where(eq(serviceCatalog.id, svc.id));
      created++;
    }
  }

  console.log(`\nDone — ${created} synced, ${skipped} skipped.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Stripe sync failed:", err.message);
  process.exit(1);
});
