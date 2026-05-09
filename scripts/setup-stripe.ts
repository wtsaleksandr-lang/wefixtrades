/**
 * Stripe live-mode setup helper.
 *
 * Run once from Replit shell (or anywhere with STRIPE_SECRET_KEY set):
 *
 *   npx tsx scripts/setup-stripe.ts
 *
 * What it does (idempotent — safe to re-run):
 *
 *   1. Verifies the STRIPE_SECRET_KEY actually works and reports the
 *      account, mode (live vs test), and country.
 *   2. Lists existing webhook endpoints. If none target our two
 *      handler paths (/api/stripe/webhook and
 *      /api/stripe-billing/webhook) it creates them, subscribed to
 *      the events the routes actually listen for. The signing
 *      secrets are PRINTED ONCE at the end — copy them into Replit
 *      secrets as STRIPE_BILLING_WEBHOOK_SECRET / STRIPE_WEBHOOK_SECRET.
 *   3. Verifies the four QuoteQuick price IDs in your env vars exist
 *      and are still active. Reports any that are missing or
 *      archived.
 *   4. Checks whether a customer-portal configuration exists. If
 *      not, creates a sensible default (cancellation, payment-method
 *      updates, invoice history enabled). The Stripe-hosted Customer
 *      Portal is what the "Manage Billing" / "Pay now" buttons in
 *      the app open.
 *
 * What it does NOT do:
 *
 *   - Create products + prices for the WeFixTrades service catalog.
 *     Those map 1:1 to entries in shared/pricing.ts; doing this
 *     blindly risks duplicates if you've already created them. The
 *     script lists what it sees in your account so you can compare.
 *
 *   - Touch any subscription, customer, or invoice. Read-only on
 *     existing data.
 *
 * Required env: STRIPE_SECRET_KEY, plus optionally APP_URL (defaults
 * to https://wefixtrades.com if unset). The four
 * STRIPE_PRICE_QQ_* env vars are validated when present but not
 * required.
 */

import Stripe from "stripe";

const log = (msg: string) => console.log(`[stripe-setup] ${msg}`);
const warn = (msg: string) => console.warn(`[stripe-setup] ⚠ ${msg}`);
const ok = (msg: string) => console.log(`[stripe-setup] ✓ ${msg}`);
const fail = (msg: string) => {
  console.error(`[stripe-setup] ✗ ${msg}`);
  process.exit(1);
};

/* ─── 1. Connect ────────────────────────────────────────────────── */

const key = process.env.STRIPE_SECRET_KEY;
if (!key) fail("STRIPE_SECRET_KEY is not set");

const stripe = new Stripe(key!, { apiVersion: "2025-01-27.acacia" as any });

const baseUrl = (process.env.APP_URL || "https://wefixtrades.com").replace(/\/$/, "");
log(`base URL = ${baseUrl}`);

async function main() {
  /* ─── 1a. Account ─── */
  const account = await stripe.accounts.retrieve();
  ok(`connected to Stripe account ${account.id} (${account.country})`);
  // The balance call confirms whether we're in live or test mode and
  // that the key has the right permissions.
  const balance = await stripe.balance.retrieve();
  ok(`mode: ${balance.livemode ? "LIVE" : "TEST"}`);

  /* ─── 2. Webhook endpoints ──────────────────────────────────────
     Two paths in our codebase:
       /api/stripe-billing/webhook  — subscription lifecycle, invoices
       /api/stripe/webhook          — checkout sessions */
  const desired = [
    {
      url: `${baseUrl}/api/stripe-billing/webhook`,
      events: [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.trial_will_end",
        "invoice.paid",
        "invoice.payment_failed",
        "invoice.finalized",
        "invoice.upcoming",
      ],
      env_var: "STRIPE_BILLING_WEBHOOK_SECRET",
    },
    {
      url: `${baseUrl}/api/stripe/webhook`,
      events: [
        "checkout.session.completed",
        "checkout.session.expired",
      ],
      env_var: "STRIPE_WEBHOOK_SECRET",
    },
  ];

  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  log(`found ${existing.data.length} existing webhook endpoint${existing.data.length === 1 ? "" : "s"}`);

  for (const want of desired) {
    const match = existing.data.find((w) => w.url === want.url);
    if (match) {
      ok(`webhook ${want.url} already exists (id=${match.id})`);
      // Diff the events — warn if missing any, but don't auto-update
      // (subtractive changes are user choices).
      const missing = want.events.filter((e) => !match.enabled_events.includes(e) && !match.enabled_events.includes("*"));
      if (missing.length > 0) {
        warn(`  endpoint is missing events: ${missing.join(", ")}`);
        warn(`  add them in Stripe → Developers → Webhooks → ${match.id}`);
      }
      continue;
    }
    log(`creating webhook ${want.url} ...`);
    const created = await stripe.webhookEndpoints.create({
      url: want.url,
      enabled_events: want.events as any,
      description: "WeFixTrades — automated by setup-stripe.ts",
    });
    ok(`  created (id=${created.id})`);
    if (created.secret) {
      console.log("");
      console.log(`  ┌─ COPY THIS into Replit secrets:`);
      console.log(`  │   ${want.env_var}=${created.secret}`);
      console.log(`  └─ This is the only time the signing secret is shown.`);
      console.log("");
    }
  }

  /* ─── 3. Price ID validation ──────────────────────────────────── */
  const priceVars = [
    "STRIPE_PRICE_QQ_SOLO_MONTHLY",
    "STRIPE_PRICE_QQ_SOLO_ANNUAL",
    "STRIPE_PRICE_QQ_BUSINESS_MONTHLY",
    "STRIPE_PRICE_QQ_BUSINESS_ANNUAL",
  ];
  for (const v of priceVars) {
    const id = process.env[v];
    if (!id) {
      warn(`${v} not set — QuoteQuick checkout for that tier will 503`);
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(id);
      if (!price.active) {
        warn(`${v}=${id} exists but is ARCHIVED — QuoteQuick checkout will fail`);
      } else {
        ok(`${v}=${id} active (${price.unit_amount! / 100} ${price.currency.toUpperCase()} / ${price.recurring?.interval ?? "one-time"})`);
      }
    } catch (err) {
      warn(`${v}=${id} not found in this Stripe account: ${(err as Error).message}`);
    }
  }

  /* ─── 4. Customer-portal configuration ────────────────────────── */
  const portalConfigs = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  if (portalConfigs.data.length > 0) {
    ok(`customer portal already configured (${portalConfigs.data.length} active config${portalConfigs.data.length === 1 ? "" : "s"})`);
  } else {
    log("creating default customer-portal configuration ...");
    const config = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: "Manage your WeFixTrades subscription",
      },
      features: {
        customer_update: {
          allowed_updates: ["email", "address", "phone", "tax_id"],
          enabled: true,
        },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end",
          cancellation_reason: {
            enabled: true,
            options: [
              "too_expensive",
              "missing_features",
              "switched_service",
              "unused",
              "customer_service",
              "too_complex",
              "low_quality",
              "other",
            ],
          },
        },
      },
      default_return_url: `${baseUrl}/portal/billing`,
    });
    ok(`  created customer portal config (id=${config.id})`);
  }

  /* ─── Summary ─── */
  console.log("");
  log("DONE. Next steps:");
  log("  1. If a STRIPE_*_WEBHOOK_SECRET line was printed above, copy it into Replit secrets and restart the app.");
  log("  2. Stripe → Developers → Webhooks → confirm the endpoints look right.");
  log("  3. Create your service-catalog products + prices in Stripe (manual — do not blindly automate; risk of duplicates).");
}

void main().catch((err) => {
  console.error("[stripe-setup] FATAL", err);
  process.exit(1);
});
