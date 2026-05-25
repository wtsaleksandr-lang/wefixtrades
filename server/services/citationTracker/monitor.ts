/**
 * Citation Tracker — daily scan logic.
 *
 * For each active subscription:
 *   1. Iterate the directory registry.
 *   2. Find the existing listing row (or create one on first sight).
 *   3. Invoke the per-directory scrape stub.
 *   4. Diff against the stored NAP. On drift, write an alert and
 *      dispatch via alerts.ts.
 *   5. Update last_checked_at + current_nap.
 *
 * Wave 3 ships with no-op scrapers (see directories.ts). The diff
 * pipeline is fully wired so Wave 4 only fills in the scrape function
 * bodies — no orchestration changes needed.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  citationTrackerSubscriptions,
  citationTrackerListings,
  citationTrackerAlerts,
  type CitationTrackerSubscription,
  type CitationTrackerListing,
} from "@shared/schema";
import { CITATION_TRACKER_DIRECTORIES, type DirectoryDef, type ScrapeResult } from "./directories";
import { dispatchAlertEmail } from "./alerts";
import { createLogger } from "../../lib/logger";

const log = createLogger("citation-tracker:monitor");

export interface NapSnapshot {
  phone?: string;
  address?: string;
  name?: string;
  website?: string;
}

interface ScanStats {
  subscriptions_processed: number;
  listings_checked: number;
  alerts_created: number;
  errors: number;
}

/**
 * Compare two NAP snapshots field-by-field. Returns the list of fields
 * that differ; empty array means equal. Empty/undefined are treated as
 * "no opinion" — only present-vs-present mismatches trigger drift.
 */
export function diffNap(prev: NapSnapshot | null | undefined, next: NapSnapshot | null | undefined): Array<keyof NapSnapshot> {
  if (!prev || !next) return [];
  const fields: Array<keyof NapSnapshot> = ["phone", "address", "name", "website"];
  const changed: Array<keyof NapSnapshot> = [];
  for (const f of fields) {
    const a = prev[f]?.trim().toLowerCase();
    const b = next[f]?.trim().toLowerCase();
    if (a && b && a !== b) changed.push(f);
  }
  return changed;
}

/**
 * Normalize a sub's stored NAP into the typed snapshot shape.
 */
function napFromSub(sub: CitationTrackerSubscription): NapSnapshot {
  const raw = sub.nap as Record<string, unknown> | null;
  if (!raw) return {};
  return {
    phone: typeof raw.phone === "string" ? raw.phone : undefined,
    address: typeof raw.address === "string" ? raw.address : undefined,
    name: typeof raw.name === "string" ? raw.name : undefined,
    website: typeof raw.website === "string" ? raw.website : undefined,
  };
}

/**
 * Process a single subscription. Public so the admin "run-now" route
 * can fire a one-off scan for QA. Returns counters for telemetry.
 */
export async function scanSubscription(sub: CitationTrackerSubscription): Promise<ScanStats> {
  const stats: ScanStats = {
    subscriptions_processed: 1,
    listings_checked: 0,
    alerts_created: 0,
    errors: 0,
  };
  const canonical = napFromSub(sub);

  // Pull every listing we already have for this sub so we can diff in-memory.
  const existing = await db
    .select()
    .from(citationTrackerListings)
    .where(eq(citationTrackerListings.subscription_id, sub.id));

  const byDirectory = new Map<string, CitationTrackerListing>();
  for (const row of existing) byDirectory.set(row.directory_name, row);

  for (const dir of CITATION_TRACKER_DIRECTORIES) {
    try {
      stats.listings_checked += 1;
      const row = byDirectory.get(dir.id);
      const scrape: ScrapeResult = dir.scrape
        ? await dir.scrape({
            business_name: sub.business_name,
            phone: canonical.phone,
            address: canonical.address,
            website: canonical.website,
          })
        : { found: false };

      // No listing tracked yet + scraper didn't find one: do nothing.
      if (!row && !scrape.found) continue;

      // First time we see the listing → insert + emit "new_listing" alert.
      if (!row && scrape.found) {
        const [inserted] = await db
          .insert(citationTrackerListings)
          .values({
            subscription_id: sub.id,
            directory_name: dir.id,
            directory_url: dir.url,
            listing_url: scrape.listing_url,
            current_nap: scrape.nap as any,
            last_checked_at: new Date(),
            status: "active",
          })
          .returning();

        await createAlert({
          subscription_id: sub.id,
          listing_id: inserted?.id ?? null,
          alert_type: "new_listing",
          old_value: null,
          new_value: { directory: dir.name, nap: scrape.nap ?? null } as any,
          severity: "low",
        });
        stats.alerts_created += 1;
        continue;
      }

      if (!row) continue;

      // Listing was tracked but scraper now says it's gone → "removed_listing".
      if (row && !scrape.found && row.status !== "missing") {
        await db
          .update(citationTrackerListings)
          .set({ status: "missing", last_checked_at: new Date() })
          .where(eq(citationTrackerListings.id, row.id));
        await createAlert({
          subscription_id: sub.id,
          listing_id: row.id,
          alert_type: "removed_listing",
          old_value: { directory: dir.name, nap: row.current_nap as any } as any,
          new_value: null,
          severity: "high",
        });
        stats.alerts_created += 1;
        continue;
      }

      // Listing exists on both sides → diff NAP.
      if (row && scrape.found && scrape.nap) {
        const prev = (row.current_nap as NapSnapshot | null) ?? canonical;
        const changedFields = diffNap(prev, scrape.nap);

        // Also detect inconsistency against canonical NAP — directories
        // that diverge from canonical get an "inconsistency" alert even
        // if their value didn't move tick-to-tick.
        const inconsistentFields = diffNap(canonical, scrape.nap);

        const newStatus = inconsistentFields.length > 0 ? "inconsistent" : "active";
        await db
          .update(citationTrackerListings)
          .set({
            current_nap: scrape.nap as any,
            last_checked_at: new Date(),
            status: newStatus,
            listing_url: scrape.listing_url ?? row.listing_url,
          })
          .where(eq(citationTrackerListings.id, row.id));

        if (changedFields.length > 0) {
          await createAlert({
            subscription_id: sub.id,
            listing_id: row.id,
            alert_type: "nap_change",
            old_value: { directory: dir.name, fields: changedFields, nap: prev } as any,
            new_value: { directory: dir.name, fields: changedFields, nap: scrape.nap } as any,
            severity: changedFields.includes("phone") || changedFields.includes("address") ? "high" : "medium",
          });
          stats.alerts_created += 1;
        } else if (inconsistentFields.length > 0 && row.status !== "inconsistent") {
          // Newly flagged inconsistency (first scan that observed drift
          // against canonical, even though the listing itself didn't change).
          await createAlert({
            subscription_id: sub.id,
            listing_id: row.id,
            alert_type: "inconsistency",
            old_value: { directory: dir.name, canonical } as any,
            new_value: { directory: dir.name, fields: inconsistentFields, nap: scrape.nap } as any,
            severity: "medium",
          });
          stats.alerts_created += 1;
        }
      }
    } catch (err: any) {
      stats.errors += 1;
      log.warn("scan error", {
        subscription_id: sub.id,
        directory: dir.id,
        error: err?.message,
      });
    }
  }

  return stats;
}

/**
 * Insert + dispatch a single alert. Idempotency is handled implicitly
 * by the scanner only writing on transitions; we don't dedupe here.
 */
async function createAlert(input: {
  subscription_id: string;
  listing_id: string | null;
  alert_type: "nap_change" | "new_listing" | "removed_listing" | "inconsistency";
  old_value: unknown;
  new_value: unknown;
  severity: "low" | "medium" | "high";
}): Promise<void> {
  const [row] = await db
    .insert(citationTrackerAlerts)
    .values({
      subscription_id: input.subscription_id,
      listing_id: input.listing_id ?? undefined,
      alert_type: input.alert_type,
      old_value: input.old_value as any,
      new_value: input.new_value as any,
      severity: input.severity,
    })
    .returning();

  if (row) {
    // Fire-and-forget email. Failure is logged inside the dispatcher;
    // the alert row stays so the dashboard surfaces it regardless.
    await dispatchAlertEmail(row.id).catch((err: any) =>
      log.warn("alert dispatch failed", { alert_id: row.id, error: err?.message }),
    );
  }
}

/**
 * Daily-scan entrypoint. Iterates every active subscription and
 * accumulates per-sub stats.
 */
export async function runDailyScan(): Promise<ScanStats> {
  const totals: ScanStats = {
    subscriptions_processed: 0,
    listings_checked: 0,
    alerts_created: 0,
    errors: 0,
  };

  const subs = await db
    .select()
    .from(citationTrackerSubscriptions)
    .where(eq(citationTrackerSubscriptions.status, "active"));

  for (const sub of subs) {
    try {
      const stats = await scanSubscription(sub);
      totals.subscriptions_processed += stats.subscriptions_processed;
      totals.listings_checked += stats.listings_checked;
      totals.alerts_created += stats.alerts_created;
      totals.errors += stats.errors;
    } catch (err: any) {
      totals.errors += 1;
      log.error("subscription scan failed", { subscription_id: sub.id, error: err?.message });
    }
  }

  log.info("daily scan complete", { ...totals });
  return totals;
}

/**
 * Look up a single subscription by stripe_subscription_id. Used by the
 * webhook handler to keep status in sync.
 */
export async function findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<CitationTrackerSubscription | undefined> {
  const rows = await db
    .select()
    .from(citationTrackerSubscriptions)
    .where(eq(citationTrackerSubscriptions.stripe_subscription_id, stripeSubscriptionId))
    .limit(1);
  return rows[0];
}

/** Get a sub belonging to a specific customer. Returns the latest by created_at. */
export async function getSubscriptionForCustomer(customerId: number): Promise<CitationTrackerSubscription | undefined> {
  const rows = await db
    .select()
    .from(citationTrackerSubscriptions)
    .where(and(eq(citationTrackerSubscriptions.customer_id, customerId)));
  // Return active sub if any, else most recent
  const active = rows.find((r) => r.status === "active");
  if (active) return active;
  rows.sort((a, b) => (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0));
  return rows[0];
}
