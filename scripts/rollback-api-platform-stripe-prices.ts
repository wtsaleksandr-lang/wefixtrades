/**
 * EMERGENCY ROLLBACK — Wave AN-1.
 *
 * Archives (deactivates) the 9 LIVE Stripe Prices + Products that were
 * inadvertently created when sync-api-platform-stripe-prices.ts was run
 * against a Doppler config containing an `sk_live_*` key.
 *
 * Stripe does not allow hard-delete of Prices that have been created via
 * the API once they exist (only Prices with no associated subscriptions
 * can be archived). Since these are brand new and have no subscriptions,
 * we archive (`active: false`) both the Price and the Product.
 *
 * Run via:
 *   doppler run --project wefixtrades --config dev -- \
 *     npx tsx scripts/rollback-api-platform-stripe-prices.ts
 */

import Stripe from "stripe";

const PRICE_IDS = [
  "price_1TZa8OFWY4wju6QisX5FUzSq", // STARTER_MONTHLY
  "price_1TZa8PFWY4wju6QiXyhU4TJa", // STARTER_ANNUAL
  "price_1TZa8PFWY4wju6QiZY0cxd2Z", // STARTER_LOYALTY_MONTHLY
  "price_1TZa8QFWY4wju6Qi9iX4wPFw", // PRO_MONTHLY
  "price_1TZa8RFWY4wju6QiN9OoqaPM", // PRO_ANNUAL
  "price_1TZa8SFWY4wju6QiJBZXBGJ2", // BUSINESS_MONTHLY
  "price_1TZa8SFWY4wju6QibQIsMiPK", // BUSINESS_ANNUAL
  "price_1TZa8TFWY4wju6Qisd7BdP6R", // AGENCY_MONTHLY
  "price_1TZa8UFWY4wju6Qiqt1pu0Z7", // AGENCY_ANNUAL
];

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY missing");
  process.exit(1);
}
const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });

async function main() {
  const balance = await stripe.balance.retrieve();
  const mode = balance.livemode ? "LIVE" : "TEST";
  console.log(`[rollback] connected, mode=${mode}`);
  if (mode !== "LIVE") {
    console.error("[rollback] refusing: rollback list contains LIVE price IDs, but key is TEST.");
    process.exit(1);
  }

  const productIds = new Set<string>();
  for (const pid of PRICE_IDS) {
    try {
      const price = await stripe.prices.retrieve(pid);
      if (typeof price.product === "string") productIds.add(price.product);
      const updated = await stripe.prices.update(pid, { active: false });
      console.log(`[rollback] archived price ${pid} (active=${updated.active})`);
    } catch (err) {
      console.warn(`[rollback] could not archive price ${pid}: ${(err as Error).message}`);
    }
  }
  for (const prodId of productIds) {
    try {
      const updated = await stripe.products.update(prodId, { active: false });
      console.log(`[rollback] archived product ${prodId} (active=${updated.active})`);
    } catch (err) {
      console.warn(`[rollback] could not archive product ${prodId}: ${(err as Error).message}`);
    }
  }
  console.log("[rollback] done");
}

void main().catch((err) => {
  console.error("[rollback] FATAL", err);
  process.exit(1);
});
