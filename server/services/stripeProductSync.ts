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

/**
 * Compute the yearly amount from a monthly amount using the standard
 * WeFixTrades 10% annual discount (matches `sync-stripe.ts`).
 */
export function monthlyToYearlyCents(monthlyCents: number): number {
  // Round to nearest dollar so prices read cleanly on receipts.
  return Math.round((monthlyCents * 12 * 0.9) / 100) * 100;
}
