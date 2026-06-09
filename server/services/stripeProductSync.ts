/**
 * Push admin-edited product changes to Stripe.
 *
 * When an admin edits a product/tier in the WeFixTrades dashboard and
 * clicks Publish, this module brings the corresponding Stripe Product
 * and Price objects up to date:
 *
 *   - name/description/tagline change → stripe.products.update()
 *   - price (default_price) change    → create new Stripe Price,
 *                                       archive the old one, return
 *                                       the new ID so the caller can
 *                                       persist on the service row.
 *
 * Stripe Prices are immutable — you can't change the amount on an
 * existing one. Standard pattern: create new + archive old + repoint.
 *
 * All operations are best-effort. A Stripe outage logs a warning and
 * returns ok:false but never throws back to the publish handler — the
 * DB write has already succeeded and customer-facing pricing in our
 * own UI is correct. The mismatch with Stripe is logged for follow-up.
 */

import Stripe from "stripe";
import { createLogger } from "../lib/logger";

const log = createLogger("stripe-product-sync");

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    log.warn("STRIPE_SECRET_KEY not set — sync skipped");
    return null;
  }
  return new Stripe(key, { apiVersion: "2024-12-18.acacia" as any });
}

export interface SyncResult {
  ok: boolean;
  /** New stripe_price_id if a new price was created (caller must persist). */
  newStripePriceId?: string;
  /** New stripe_yearly_price_id if yearly recreated. */
  newStripeYearlyPriceId?: string;
  /** Human-readable error message if ok=false. */
  warning?: string;
}

interface MetadataChange {
  stripeProductId: string;
  newName?: string;
  newDescription?: string;
}

/**
 * Update Stripe Product name + description if either changed.
 * Idempotent — passes only changed fields.
 */
export async function syncProductMetadata(change: MetadataChange): Promise<SyncResult> {
  if (!change.stripeProductId) return { ok: true };
  const stripe = getStripe();
  if (!stripe) return { ok: false, warning: "STRIPE_SECRET_KEY not configured" };

  const updates: Stripe.ProductUpdateParams = {};
  if (typeof change.newName === "string" && change.newName.length > 0) {
    updates.name = change.newName;
  }
  if (typeof change.newDescription === "string") {
    // Stripe description: max 22 chars on the checkout summary, but the
    // Product description supports up to ~500. We send what we have.
    updates.description = change.newDescription.slice(0, 500);
  }
  if (Object.keys(updates).length === 0) return { ok: true };

  try {
    await stripe.products.update(change.stripeProductId, updates);
    return { ok: true };
  } catch (err: any) {
    log.warn("Stripe product metadata sync failed", {
      productId: change.stripeProductId,
      err: err?.message,
    });
    return { ok: false, warning: `Stripe product update failed: ${err?.message ?? "unknown"}` };
  }
}

interface PriceChange {
  /** WeFixTrades service_catalog row id, e.g. "tradeline-pro" — used for metadata + lookup_key */
  serviceCatalogId: string;
  stripeProductId: string;
  oldStripePriceId: string | null | undefined;
  /** New amount in cents (the unit we store in default_price). */
  newAmountCents: number;
  /** "monthly" | "yearly" | "one_time" — drives `recurring` shape + lookup_key suffix */
  period: "monthly" | "yearly" | "one_time";
  /** Optional explicit currency override (defaults to USD). */
  currency?: string;
}

/**
 * Create a new Stripe Price with the given amount, archive the old one,
 * and return the new price ID for persistence.
 */
export async function syncProductPrice(change: PriceChange): Promise<SyncResult> {
  if (!change.stripeProductId) {
    return { ok: false, warning: "stripeProductId missing — can't create new Stripe price" };
  }
  const stripe = getStripe();
  if (!stripe) return { ok: false, warning: "STRIPE_SECRET_KEY not configured" };

  const currency = (change.currency ?? "usd").toLowerCase();
  const lookupKey = `${change.serviceCatalogId}_${change.period}`;

  const recurring =
    change.period === "monthly"
      ? { interval: "month" as const }
      : change.period === "yearly"
        ? { interval: "year" as const }
        : undefined;

  // Stripe rejects a duplicate lookup_key. Use transfer_lookup_key so the
  // new price takes ownership of the canonical key, then the old one
  // loses it automatically.
  let createdPriceId: string | undefined;
  try {
    const newPrice = await stripe.prices.create({
      currency,
      unit_amount: change.newAmountCents,
      product: change.stripeProductId,
      lookup_key: lookupKey,
      transfer_lookup_key: true,
      ...(recurring ? { recurring } : {}),
      metadata: { service_catalog_id: change.serviceCatalogId, period: change.period },
    });
    createdPriceId = newPrice.id;
  } catch (err: any) {
    log.warn("Stripe price create failed", {
      serviceCatalogId: change.serviceCatalogId,
      err: err?.message,
    });
    return { ok: false, warning: `Stripe price create failed: ${err?.message ?? "unknown"}` };
  }

  // Archive the old price (best-effort — don't fail the publish if archive fails).
  if (change.oldStripePriceId && change.oldStripePriceId !== createdPriceId) {
    try {
      await stripe.prices.update(change.oldStripePriceId, { active: false });
    } catch (err: any) {
      log.warn("Failed to archive old Stripe price (non-blocking)", {
        oldId: change.oldStripePriceId,
        err: err?.message,
      });
    }
  }

  const result: SyncResult = { ok: true };
  if (change.period === "yearly") result.newStripeYearlyPriceId = createdPriceId;
  else result.newStripePriceId = createdPriceId;
  return result;
}

export interface PriceValidationResult {
  /** true = the pasted price matches catalog amount/currency (or validation was safely skipped). */
  ok: boolean;
  /** true when validation could not run (key unset / Stripe error) — caller should treat as a soft warning, not a hard reject. */
  skipped?: boolean;
  /** Human-readable mismatch / skip reason. */
  warning?: string;
}

/**
 * Validate that a pasted `stripe_price_id` actually charges the amount +
 * currency our catalog advertises. Stripe Prices are the source of truth for
 * what a customer is billed; if an admin pastes a price_id whose unit_amount
 * differs from the catalog price, the site shows one number and Stripe charges
 * another. This retrieves the price and asserts unit_amount/currency match.
 *
 * Returns ok:false on a real mismatch (caller should reject/warn).
 * Returns ok:true, skipped:true when validation can't run (key unset, price
 * not found, Stripe error) — never blocks publish on infra trouble, only on a
 * confirmed mismatch.
 */
export async function validateStripePriceId(args: {
  stripePriceId: string;
  expectedAmountCents: number;
  /** Defaults to "usd" (our catalog has no currency column). */
  expectedCurrency?: string;
  /** For log/warning context, e.g. service id or tier id. */
  label?: string;
}): Promise<PriceValidationResult> {
  const { stripePriceId, expectedAmountCents } = args;
  const expectedCurrency = (args.expectedCurrency ?? "usd").toLowerCase();
  const label = args.label ? `${args.label} ` : "";

  if (!stripePriceId) return { ok: true };
  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: true,
      skipped: true,
      warning: `STRIPE_SECRET_KEY not configured — could not verify ${label}price ${stripePriceId} amount`,
    };
  }

  let price: Stripe.Price;
  try {
    price = await stripe.prices.retrieve(stripePriceId);
  } catch (err: any) {
    log.warn("Stripe price retrieve failed during validation", {
      stripePriceId,
      label: args.label,
      err: err?.message,
    });
    return {
      ok: true,
      skipped: true,
      warning: `Could not verify ${label}price ${stripePriceId} against Stripe: ${err?.message ?? "unknown error"}`,
    };
  }

  const actualAmount = price.unit_amount;
  const actualCurrency = (price.currency ?? "").toLowerCase();

  if (typeof actualAmount !== "number") {
    // Tiered/metered prices have no flat unit_amount — can't compare cleanly.
    return {
      ok: true,
      skipped: true,
      warning: `${label}price ${stripePriceId} has no flat unit_amount (tiered/metered) — amount not verified`,
    };
  }

  if (actualAmount !== expectedAmountCents || actualCurrency !== expectedCurrency) {
    return {
      ok: false,
      warning:
        `${label}Stripe price ${stripePriceId} charges ` +
        `${actualAmount} ${actualCurrency} but the catalog advertises ` +
        `${expectedAmountCents} ${expectedCurrency}. Customers would be charged a different amount than the site shows.`,
    };
  }

  return { ok: true };
}

/**
 * Compute the yearly amount from a monthly amount using the standard
 * WeFixTrades 10% annual discount (matches `sync-stripe.ts`).
 */
export function monthlyToYearlyCents(monthlyCents: number): number {
  // Round to nearest dollar so prices read cleanly on receipts.
  return Math.round((monthlyCents * 12 * 0.9) / 100) * 100;
}
