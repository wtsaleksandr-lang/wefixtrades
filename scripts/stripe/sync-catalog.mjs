#!/usr/bin/env node
/**
 * Stripe catalog sync — idempotent reconciler against shared/pricing.ts.
 *
 * Reads the live Stripe account, compares product names/active state to the
 * canonical catalog declared in shared/pricing.ts, and (with --apply)
 * archives stray products/prices and renames mismatched product names.
 *
 * Hard rules:
 *   1. Dry-run by default. --apply is required to mutate anything.
 *   2. Never echoes STRIPE_SECRET_KEY (read from process.env only).
 *   3. Only archives — never deletes. Archive is reversible from the Dashboard.
 *   4. Only touches products/prices that match one of the explicit policy
 *      buckets below — never makes wholesale "everything not in pricing.ts"
 *      decisions (the catalog has env-var-mapped + service_catalog-mapped
 *      prices that won't appear in shared/pricing.ts directly).
 *
 * Companion to PR #668 audit (docs/operations/stripe-audit-2026-05-24.md).
 * Codifies the manual dashboard cleanups so the same drift cannot return
 * silently — re-run before each launch checkpoint.
 *
 * Usage:
 *   doppler run --project wefixtrades --config prd -- node scripts/stripe/sync-catalog.mjs
 *   doppler run --project wefixtrades --config prd -- node scripts/stripe/sync-catalog.mjs --apply
 */

const APPLY = process.argv.includes("--apply");
const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error("FATAL: STRIPE_SECRET_KEY missing from env. Run via `doppler run`.");
  process.exit(1);
}
if (!SECRET.startsWith("sk_")) {
  console.error("FATAL: STRIPE_SECRET_KEY does not look like a Stripe secret key.");
  process.exit(1);
}

const AUTH = "Basic " + Buffer.from(SECRET + ":").toString("base64");
const API = "https://api.stripe.com/v1";

// ─── Desired-state policy ─────────────────────────────────────────────
// Each entry is a deterministic decision the script will (re-)apply
// every run. Adding a new entry codifies a new cleanup; removing one
// stops it from being enforced.

const PRODUCTS_TO_ARCHIVE = [
  // P1-1 — duplicate, non-trademarked ContentFlow products
  { id: "prod_UW7KZHhsLcykTc", reason: "duplicate ContentFlow Agency (no ™)" },
  { id: "prod_UW7KLt5uhQkpER", reason: "duplicate ContentFlow Studio (no ™)" },
  { id: "prod_UW7KxpQ11HR1vk", reason: "duplicate ContentFlow Creator (no ™)" },
  // P1-4 — retired Wave Q QuoteQuick Starter
  { id: "prod_UOZ3Uwbjhce2DD", reason: "legacy QuoteQuick Starter (Wave Q retired)" },
];

const PRICES_TO_ARCHIVE = [
  // Prices belonging to PRODUCTS_TO_ARCHIVE (Stripe archives don't cascade)
  { id: "price_1TX56DFWY4wju6QiQ8hdx030", reason: "ContentFlow Agency dup monthly" },
  { id: "price_1TX56CFWY4wju6QinGBcwXOX", reason: "ContentFlow Studio dup monthly" },
  { id: "price_1TX56CFWY4wju6QiGtAQVwTg", reason: "ContentFlow Creator dup monthly" },
  { id: "price_1TPlv1FWY4wju6QiMf5btR69", reason: "QuoteQuick Starter $49/mo (legacy)" },
  { id: "price_1TPlv1FWY4wju6QibAiYl4Si", reason: "QuoteQuick Starter $529.20/yr (legacy)" },
  // P1-3 — legacy pre-Wave-Q QuoteQuick Pro prices (product itself stays active)
  { id: "price_1TPlv2FWY4wju6Qi3OFAQj5e", reason: "QuoteQuick Pro $79/mo (pre-Wave-Q legacy)" },
  { id: "price_1TPlv2FWY4wju6QiMY63j3D2", reason: "QuoteQuick Pro $853.20/yr (pre-Wave-Q legacy)" },
];

const PRODUCT_RENAMES = [
  // P1-2 — Stripe product name must match shared/pricing.ts display name
  {
    id: "prod_UOZ3aHXPO5ZKOh",
    expected: "ReputationShield™ Premium",
    reason: "shared/pricing.ts uses 'Premium' (formerly 'Scale')",
  },
];

// ─── HTTP helpers ─────────────────────────────────────────────────────

async function stripeGet(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API}${path}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function stripePost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: AUTH,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`stripe-sync — mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log("");

  // Before counts
  const productsBefore = await stripeGet("/products", { active: "true", limit: 100 });
  const activeBefore = productsBefore.data.length;
  console.log(`Active products before: ${activeBefore}`);

  let archivedProducts = 0;
  let archivedPrices = 0;
  let renamed = 0;
  let alreadyDone = 0;

  // 1. Archive products
  for (const { id, reason } of PRODUCTS_TO_ARCHIVE) {
    try {
      const p = await stripeGet(`/products/${id}`);
      if (!p.active) {
        alreadyDone++;
        console.log(`  product ${id} already archived (${reason})`);
        continue;
      }
      if (APPLY) {
        await stripePost(`/products/${id}`, { active: "false" });
        archivedProducts++;
        console.log(`  product ${id} ARCHIVED (${reason})`);
      } else {
        console.log(`  product ${id} WOULD archive (${reason})`);
      }
    } catch (e) {
      console.error(`  product ${id} ERROR: ${e.message}`);
    }
  }

  // 2. Archive prices
  for (const { id, reason } of PRICES_TO_ARCHIVE) {
    try {
      const p = await stripeGet(`/prices/${id}`);
      if (!p.active) {
        alreadyDone++;
        console.log(`  price ${id} already archived (${reason})`);
        continue;
      }
      if (APPLY) {
        await stripePost(`/prices/${id}`, { active: "false" });
        archivedPrices++;
        console.log(`  price ${id} ARCHIVED (${reason})`);
      } else {
        console.log(`  price ${id} WOULD archive (${reason})`);
      }
    } catch (e) {
      console.error(`  price ${id} ERROR: ${e.message}`);
    }
  }

  // 3. Renames
  for (const { id, expected, reason } of PRODUCT_RENAMES) {
    try {
      const p = await stripeGet(`/products/${id}`);
      if (p.name === expected) {
        alreadyDone++;
        console.log(`  product ${id} name OK (${reason})`);
        continue;
      }
      if (APPLY) {
        await stripePost(`/products/${id}`, { name: expected });
        renamed++;
        console.log(`  product ${id} RENAMED -> "${expected}" (${reason})`);
      } else {
        console.log(`  product ${id} WOULD rename "${p.name}" -> "${expected}" (${reason})`);
      }
    } catch (e) {
      console.error(`  product ${id} ERROR: ${e.message}`);
    }
  }

  // After counts (only meaningful in --apply)
  if (APPLY) {
    const productsAfter = await stripeGet("/products", { active: "true", limit: 100 });
    console.log("");
    console.log(`Active products after:  ${productsAfter.data.length} (before ${activeBefore})`);
  }

  console.log("");
  console.log(`Summary — applied=${APPLY} archivedProducts=${archivedProducts} archivedPrices=${archivedPrices} renamed=${renamed} alreadyDone=${alreadyDone}`);
  if (!APPLY) console.log("Re-run with --apply to execute.");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
