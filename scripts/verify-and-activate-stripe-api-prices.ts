/**
 * Wave AN-1b — Verify & ACTIVATE the 9 LIVE Stripe API Platform Prices.
 *
 * Context: the 9 LIVE Products + Prices were already created (and immediately
 * archived) by an earlier run of sync-api-platform-stripe-prices.ts when a
 * dev Doppler config was found to hold an `sk_live_*` key. Rather than
 * re-create them (which would orphan the archived IDs), this script:
 *
 *   1. HARD-REFUSES to run unless we are in LIVE mode. Belt + suspenders:
 *      - STRIPE_SECRET_KEY must start with `sk_live_`
 *      - the Stripe API's reported livemode must be true
 *      Either check failing aborts the run.
 *   2. For each of the 9 expected products, finds the Product by exact name,
 *      then finds the Price on it with matching unit_amount + interval + USD
 *      regardless of active state.
 *   3. Validates every amount matches the locked pricing spec. ANY mismatch
 *      = STOP. Do not activate anything.
 *   4. Prints a clear pre-activation summary, then activates Prices and
 *      Products by setting active=true.
 *   5. Emits Doppler env-var lines for the operator to paste into wfx/prd.
 *
 * USAGE:
 *   doppler run --project wefixtrades --config prd -- \
 *     npx tsx scripts/verify-and-activate-stripe-api-prices.ts
 *
 * Never logs the raw STRIPE_SECRET_KEY value.
 */

import Stripe from "stripe";

const log = (msg: string) => console.log(`[verify-activate] ${msg}`);
const ok = (msg: string) => console.log(`[verify-activate] OK ${msg}`);
const fail = (msg: string): never => {
  console.error(`[verify-activate] FAIL ${msg}`);
  process.exit(1);
};

const key = process.env.STRIPE_SECRET_KEY;
if (!key) fail("STRIPE_SECRET_KEY is not set (run via `doppler run --project wefixtrades --config prd -- ...`)");

// HARD-REFUSE if not LIVE. This script is the REVERSE of normal safety:
// it EXPECTS live mode because the 9 Stripe artifacts only exist in live.
if (!key!.startsWith("sk_live_")) {
  fail("STRIPE_SECRET_KEY does NOT start with sk_live_. This script requires LIVE mode.");
}

const stripe = new Stripe(key!, { apiVersion: "2025-01-27.acacia" as any });

interface TierSpec {
  productName: string;
  envVar: string;
  unitAmount: number; // cents
  interval: "month" | "year";
}

const TIERS: TierSpec[] = [
  { productName: "WFT API — Starter (Monthly)",                envVar: "STRIPE_API_STARTER_MONTHLY_PRICE",         unitAmount: 49_00,    interval: "month" },
  { productName: "WFT API — Starter (Annual)",                 envVar: "STRIPE_API_STARTER_ANNUAL_PRICE",          unitAmount: 480_00,   interval: "year"  },
  { productName: "WFT API — Starter (QQ Loyalty Monthly)",     envVar: "STRIPE_API_STARTER_LOYALTY_MONTHLY_PRICE", unitAmount: 29_00,    interval: "month" },
  { productName: "WFT API — Pro (Monthly)",                    envVar: "STRIPE_API_PRO_MONTHLY_PRICE",             unitAmount: 149_00,   interval: "month" },
  { productName: "WFT API — Pro (Annual)",                     envVar: "STRIPE_API_PRO_ANNUAL_PRICE",              unitAmount: 1488_00,  interval: "year"  },
  { productName: "WFT API — Business (Monthly)",               envVar: "STRIPE_API_BUSINESS_MONTHLY_PRICE",        unitAmount: 399_00,   interval: "month" },
  { productName: "WFT API — Business (Annual)",                envVar: "STRIPE_API_BUSINESS_ANNUAL_PRICE",         unitAmount: 3972_00,  interval: "year"  },
  { productName: "WFT API — Agency (Monthly)",                 envVar: "STRIPE_API_AGENCY_MONTHLY_PRICE",          unitAmount: 999_00,   interval: "month" },
  { productName: "WFT API — Agency (Annual)",                  envVar: "STRIPE_API_AGENCY_ANNUAL_PRICE",           unitAmount: 9948_00,  interval: "year"  },
];

interface Resolved {
  tier: TierSpec;
  product: Stripe.Product;
  price: Stripe.Price;
}

/** Scan all products (active + archived) for an exact name match. */
async function findProductByName(name: string): Promise<Stripe.Product | null> {
  for await (const product of stripe.products.list({ active: false, limit: 100 })) {
    if (product.name === name) return product;
  }
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.name === name) return product;
  }
  return null;
}

/** Find a Price on `productId` (active OR archived) matching amount + interval + USD. */
async function findMatchingPrice(
  productId: string,
  unitAmount: number,
  interval: "month" | "year",
): Promise<Stripe.Price[]> {
  const matches: Stripe.Price[] = [];
  // include archived prices: list without active filter
  for await (const price of stripe.prices.list({ product: productId, limit: 100 })) {
    if (
      price.unit_amount === unitAmount &&
      price.currency === "usd" &&
      price.recurring?.interval === interval
    ) {
      matches.push(price);
    }
  }
  return matches;
}

async function main() {
  // 1. Double-check live mode via the API as well. The Balance object exposes
  // a top-level livemode boolean (the Account object does not).
  const balance = await stripe.balance.retrieve();
  if (balance.livemode !== true) {
    fail(`Stripe API reports livemode=${balance.livemode}. Refusing — this script requires LIVE.`);
  }
  ok(`connected to Stripe in LIVE mode`);

  // 2. Resolve each tier.
  const resolved: Resolved[] = [];
  let errors = 0;
  for (const tier of TIERS) {
    const product = await findProductByName(tier.productName);
    if (!product) {
      console.error(`[verify-activate] FAIL no product found named "${tier.productName}"`);
      errors++;
      continue;
    }
    const prices = await findMatchingPrice(product.id, tier.unitAmount, tier.interval);
    if (prices.length === 0) {
      console.error(`[verify-activate] FAIL no price found on ${product.id} matching $${tier.unitAmount / 100}/${tier.interval}`);
      errors++;
      continue;
    }
    if (prices.length > 1) {
      // Prefer archived (this is what we expect to unarchive). If multiple
      // archived, pick the oldest one (lowest created timestamp) for stability.
      const archived = prices.filter((p) => !p.active);
      const candidates = archived.length > 0 ? archived : prices;
      candidates.sort((a, b) => a.created - b.created);
      const chosen = candidates[0];
      log(`note: ${tier.envVar} has ${prices.length} matching prices on ${product.id}; chose oldest archived: ${chosen.id}`);
      resolved.push({ tier, product, price: chosen });
    } else {
      resolved.push({ tier, product, price: prices[0] });
    }
  }

  if (errors > 0) {
    fail(`verification failed with ${errors} error(s). NOT activating any prices.`);
  }

  // 3. Validate amounts (defensive — even though findMatchingPrice already filtered).
  for (const r of resolved) {
    if (r.price.unit_amount !== r.tier.unitAmount) {
      fail(`amount mismatch for ${r.tier.envVar}: spec=${r.tier.unitAmount} stripe=${r.price.unit_amount}`);
    }
    if (r.price.currency !== "usd") {
      fail(`currency mismatch for ${r.tier.envVar}: stripe=${r.price.currency}`);
    }
    if (r.price.recurring?.interval !== r.tier.interval) {
      fail(`interval mismatch for ${r.tier.envVar}: spec=${r.tier.interval} stripe=${r.price.recurring?.interval}`);
    }
  }

  // 4. Pre-activation summary.
  console.log("");
  log("── PRE-ACTIVATION SUMMARY ──");
  for (const r of resolved) {
    const usd = (r.price.unit_amount! / 100).toFixed(2);
    log(`${r.tier.envVar}`);
    log(`  product_id=${r.product.id}  product_active=${r.product.active}`);
    log(`  price_id=${r.price.id}      price_active=${r.price.active}`);
    log(`  amount=$${usd} interval=${r.price.recurring?.interval}`);
  }
  console.log("");

  // 5. Activate (unarchive) — prices then products.
  log("── ACTIVATING ──");
  for (const r of resolved) {
    if (!r.price.active) {
      const updated = await stripe.prices.update(r.price.id, { active: true });
      ok(`ACTIVATED price: ${r.tier.envVar} = ${updated.id} (active=${updated.active})`);
    } else {
      ok(`already active price: ${r.tier.envVar} = ${r.price.id}`);
    }
  }
  // dedupe product activations
  const seen = new Set<string>();
  for (const r of resolved) {
    if (seen.has(r.product.id)) continue;
    seen.add(r.product.id);
    if (!r.product.active) {
      const updated = await stripe.products.update(r.product.id, { active: true });
      ok(`ACTIVATED product: ${r.tier.productName} = ${updated.id} (active=${updated.active})`);
    } else {
      ok(`already active product: ${r.tier.productName} = ${r.product.id}`);
    }
  }

  // 6. Doppler env-var lines.
  console.log("");
  log("── Doppler env-var lines (paste into wefixtrades/prd) ──");
  for (const r of resolved) {
    console.log(`${r.tier.envVar}=${r.price.id}`);
  }
  console.log("");
  log(`DONE. activated=${resolved.length} prices, mode=LIVE`);
}

void main().catch((err) => {
  console.error("[verify-activate] FATAL", err);
  process.exit(1);
});
