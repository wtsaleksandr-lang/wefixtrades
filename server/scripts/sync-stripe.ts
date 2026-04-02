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
 *      - Creates a Stripe Price if stripe_price_id is missing
 *   3. Stores stripe_product_id and stripe_price_id back into service_catalog
 *
 * Safe to run multiple times — skips services that already have Stripe IDs.
 * To force re-sync (e.g. after price change), clear the stripe_price_id
 * in the database and re-run.
 *
 * Requires:
 *   STRIPE_SECRET_KEY in environment
 *   DATABASE_URL in environment
 *
 * Does NOT touch the legacy Stripe Connect / booking deposit flow.
 */

import Stripe from "stripe";
import { db } from "../db";
import { serviceCatalog } from "@shared/schema";
import { eq } from "drizzle-orm";

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

    // ─── Create Price if missing ───
    if (!priceId) {
      const isRecurring = svc.billing_period === "monthly";

      const priceParams: Stripe.PriceCreateParams = {
        product: productId,
        currency: "usd",
        unit_amount: svc.default_price, // already in cents
        metadata: {
          service_catalog_id: svc.id,
        },
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

    // ─── Store IDs back in service_catalog ───
    if (productId !== svc.stripe_product_id || priceId !== svc.stripe_price_id) {
      await db.update(serviceCatalog)
        .set({
          stripe_product_id: productId,
          stripe_price_id: priceId,
          updated_at: new Date(),
        })
        .where(eq(serviceCatalog.id, svc.id));
      created++;
    }
  }

  console.log(`\nDone — ${created} synced, ${skipped} skipped.`);
  console.log("\nNext steps:");
  console.log("  1. Verify products in Stripe Dashboard → Products");
  console.log("  2. Build checkout routes (stripeBillingRoutes.ts)");
  console.log("  3. Build webhook handler for payment events");
  process.exit(0);
}

main().catch((err) => {
  console.error("Stripe sync failed:", err.message);
  process.exit(1);
});
