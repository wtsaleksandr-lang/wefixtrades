/**
 * Wave AN-1 — WeFixTrades API Platform Stripe price sync.
 *
 * Idempotent provisioning of the 9 Products + Prices that back the
 * API Platform tier ladder:
 *
 *   Starter $49/mo, $480/yr, $29/mo (QQ loyalty)
 *   Pro     $149/mo, $1488/yr
 *   Business $399/mo, $3972/yr
 *   Agency  $999/mo, $9948/yr
 *
 * Annual rates are monthly × 12 × 0.83 (17% discount), rounded.
 *
 * USAGE:
 *
 *   doppler run --project wefixtrades --config dev -- \
 *     npx tsx scripts/sync-api-platform-stripe-prices.ts
 *
 * For each tier the script:
 *   1. Finds the Stripe Product by exact display name; creates it if absent.
 *   2. Lists active Prices on that product, picks one matching
 *      (unit_amount, recurring.interval, currency=USD).
 *   3. If found: prints "EXISTS: <ENV_VAR>=<price_id>".
 *      If not:   creates a new Price; prints "CREATED: <ENV_VAR>=<price_id>".
 *
 * At the end the 9 env-var assignment lines are printed grouped together so
 * they can be diffed and pasted into Doppler.
 *
 * The script refuses to run unless STRIPE_SECRET_KEY is present and starts
 * with `sk_test_` or `sk_live_` — it surfaces the mode loudly so a
 * confused operator doesn't accidentally provision in LIVE mode.
 *
 * The script NEVER logs the raw STRIPE_SECRET_KEY value, only its prefix.
 *
 * SAFETY: even though `dev` Doppler is the expected source of secrets, the
 * `wefixtrades/dev` config was historically discovered to hold an `sk_live_*`
 * key. To prevent this script from ever transparently provisioning in LIVE
 * mode again, it HARD-REFUSES to run in live mode unless `--allow-live` is
 * passed on the CLI. See SCORECARD.md ("Known config issues") for context.
 */

import Stripe from "stripe";

const log = (msg: string) => console.log(`[api-prices] ${msg}`);
const ok = (msg: string) => console.log(`[api-prices] ✓ ${msg}`);
const warn = (msg: string) => console.warn(`[api-prices] ⚠ ${msg}`);
const fail = (msg: string): never => {
  console.error(`[api-prices] ✗ ${msg}`);
  process.exit(1);
};

const key = process.env.STRIPE_SECRET_KEY;
if (!key) fail("STRIPE_SECRET_KEY is not set (run via `doppler run -- ...`)");

const isTest = key!.startsWith("sk_test_");
const isLive = key!.startsWith("sk_live_");
if (!isTest && !isLive) {
  fail("STRIPE_SECRET_KEY must start with sk_test_ or sk_live_");
}

const mode = isLive ? "LIVE" : "TEST";
log(`Stripe mode: ${mode}`);

// HARD SAFETY: refuse LIVE mode unless --allow-live is passed explicitly.
// This guards against the historical hazard of `wefixtrades/dev` Doppler
// containing an sk_live_* key (see SCORECARD.md "Known config issues").
const allowLive = process.argv.includes("--allow-live");
if (isLive && !allowLive) {
  console.error("[api-prices] REFUSE: live mode detected. Pass --allow-live to confirm.");
  process.exit(1);
}

const stripe = new Stripe(key!, { apiVersion: "2025-01-27.acacia" as any });

interface TierSpec {
  productName: string;
  envVar: string;
  unitAmount: number; // cents
  interval: "month" | "year";
}

const TIERS: TierSpec[] = [
  {
    productName: "WFT API — Starter (Monthly)",
    envVar: "STRIPE_API_STARTER_MONTHLY_PRICE",
    unitAmount: 49_00,
    interval: "month",
  },
  {
    productName: "WFT API — Starter (Annual)",
    envVar: "STRIPE_API_STARTER_ANNUAL_PRICE",
    unitAmount: 480_00,
    interval: "year",
  },
  {
    productName: "WFT API — Starter (QQ Loyalty Monthly)",
    envVar: "STRIPE_API_STARTER_LOYALTY_MONTHLY_PRICE",
    unitAmount: 29_00,
    interval: "month",
  },
  {
    productName: "WFT API — Pro (Monthly)",
    envVar: "STRIPE_API_PRO_MONTHLY_PRICE",
    unitAmount: 149_00,
    interval: "month",
  },
  {
    productName: "WFT API — Pro (Annual)",
    envVar: "STRIPE_API_PRO_ANNUAL_PRICE",
    unitAmount: 1488_00,
    interval: "year",
  },
  {
    productName: "WFT API — Business (Monthly)",
    envVar: "STRIPE_API_BUSINESS_MONTHLY_PRICE",
    unitAmount: 399_00,
    interval: "month",
  },
  {
    productName: "WFT API — Business (Annual)",
    envVar: "STRIPE_API_BUSINESS_ANNUAL_PRICE",
    unitAmount: 3972_00,
    interval: "year",
  },
  {
    productName: "WFT API — Agency (Monthly)",
    envVar: "STRIPE_API_AGENCY_MONTHLY_PRICE",
    unitAmount: 999_00,
    interval: "month",
  },
  {
    productName: "WFT API — Agency (Annual)",
    envVar: "STRIPE_API_AGENCY_ANNUAL_PRICE",
    unitAmount: 9948_00,
    interval: "year",
  },
];

/** Find a Product by exact name match (active products only). */
async function findProductByName(name: string): Promise<Stripe.Product | null> {
  // Stripe search supports `name:"..."` — but search lags by a few seconds
  // for newly-created products. To stay correct under repeated runs, fall
  // back to a paginated list scan.
  for await (const product of stripe.products.list({ active: true, limit: 100 })) {
    if (product.name === name) return product;
  }
  return null;
}

/** Find an active Price on `productId` matching amount + interval + USD. */
async function findMatchingPrice(
  productId: string,
  unitAmount: number,
  interval: "month" | "year",
): Promise<Stripe.Price | null> {
  for await (const price of stripe.prices.list({ product: productId, active: true, limit: 100 })) {
    if (
      price.unit_amount === unitAmount &&
      price.currency === "usd" &&
      price.recurring?.interval === interval
    ) {
      return price;
    }
  }
  return null;
}

interface SyncResult {
  envVar: string;
  priceId: string;
  status: "EXISTS" | "CREATED";
}

async function syncTier(tier: TierSpec): Promise<SyncResult> {
  // 1. Product
  let product = await findProductByName(tier.productName);
  if (!product) {
    log(`creating product "${tier.productName}" ...`);
    product = await stripe.products.create({
      name: tier.productName,
      description: `WeFixTrades API Platform tier — ${tier.envVar}`,
    });
  }

  // 2. Price
  const existing = await findMatchingPrice(product.id, tier.unitAmount, tier.interval);
  if (existing) {
    ok(`EXISTS: ${tier.envVar} = ${existing.id}`);
    return { envVar: tier.envVar, priceId: existing.id, status: "EXISTS" };
  }

  const created = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: tier.unitAmount,
    recurring: { interval: tier.interval },
  });
  ok(`CREATED: ${tier.envVar} = ${created.id}`);
  return { envVar: tier.envVar, priceId: created.id, status: "CREATED" };
}

async function main() {
  // Confirm key works + cross-check the prefix-derived mode.
  const balance = await stripe.balance.retrieve();
  const apiMode = balance.livemode ? "LIVE" : "TEST";
  if (apiMode !== mode) {
    fail(`Mode mismatch: key prefix says ${mode} but Stripe API reports ${apiMode}`);
  }
  ok(`connected to Stripe in ${apiMode} mode`);

  const results: SyncResult[] = [];
  for (const tier of TIERS) {
    results.push(await syncTier(tier));
  }

  console.log("");
  log("── Doppler env-var lines (paste into wefixtrades/<config>) ──");
  for (const r of results) {
    console.log(`${r.envVar}=${r.priceId}`);
  }
  console.log("");

  const created = results.filter((r) => r.status === "CREATED").length;
  const existed = results.filter((r) => r.status === "EXISTS").length;
  log(`DONE. created=${created}, exists=${existed}, total=${results.length}, mode=${mode}`);
}

void main().catch((err) => {
  console.error("[api-prices] FATAL", err);
  process.exit(1);
});
