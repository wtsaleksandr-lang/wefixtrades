/**
 * Citation Tracker — daily scan logic.
 *
 * For each active subscription:
 *   1. Iterate the directory registry, SKIPPING any directory without an
 *      implemented scraper (those are never checked and never reported).
 *   2. Find the existing listing row (or create one on first sight).
 *   3. Invoke the per-directory scraper.
 *   4. Diff against the stored NAP. On drift, write an alert and
 *      dispatch via alerts.ts.
 *   5. Update last_checked_at + current_nap.
 *
 * EVIDENCE RULES (see the guard in monitor.test.ts)
 * -------------------------------------------------
 * There are three distinct outcomes and they must never be collapsed:
 *
 *   a) not checked   — no scraper implemented. Produces nothing at all.
 *   b) check failed  — scraper returned an `error` (timeout, 403/429
 *                      rate-limit, Cloudflare challenge, parse failure).
 *                      Tells us nothing; we record the error and move on.
 *   c) confirmed absent — scrape completed cleanly and found no listing.
 *                      Only this counts toward a removal, and only after
 *                      CONSECUTIVE_MISSES_BEFORE_ALERT consecutive
 *                      occurrences.
 *
 * Collapsing (a) or (b) into (c) is what emailed customers "Citation
 * Tracker alert — Citation removed" (severity: high) every time a
 * scraper timed out or a directory had no scraper at all.
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

/**
 * A listing must come back absent on this many CONSECUTIVE clean scrapes
 * before we tell the customer it was removed. Scrapes that errored do not
 * count and do not reset the streak — they are simply not evidence.
 */
export const CONSECUTIVE_MISSES_BEFORE_ALERT = 2;

interface ScanStats {
  subscriptions_processed: number;
  /** Directories we actually scraped (implemented scrapers only). */
  listings_checked: number;
  /** Registry entries skipped because no scraper is implemented. */
  directories_not_checked: number;
  /** Scrapes that errored — status unknown, never treated as "removed". */
  scrape_failures: number;
  /** Clean scrapes that found nothing but haven't hit the confirm threshold. */
  unconfirmed_misses: number;
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
    directories_not_checked: 0,
    scrape_failures: 0,
    unconfirmed_misses: 0,
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
      // Directories with no implemented scraper are NOT checked. Skipping
      // before any DB work guarantees they can never produce a listing row,
      // a "missing" status, or an alert — and keeps them out of every
      // customer-visible "directories checked" count.
      if (!dir.scrape) {
        stats.directories_not_checked += 1;
        continue;
      }

      stats.listings_checked += 1;
      const row = byDirectory.get(dir.id);
      const scrape: ScrapeResult = await dir.scrape({
        business_name: sub.business_name,
        phone: canonical.phone,
        address: canonical.address,
        website: canonical.website,
      });

      // A scraper that errored tells us NOTHING about the listing. Record
      // the failure for ops and move on — never let a timeout, a 403/429
      // rate-limit, a Cloudflare challenge or a parse error be read as
      // "the listing is gone".
      if (scrape.error) {
        stats.scrape_failures += 1;
        if (row) {
          await db
            .update(citationTrackerListings)
            .set({ last_scrape_error: scrape.error })
            .where(eq(citationTrackerListings.id, row.id));
        }
        continue;
      }

      // No listing tracked yet + scraper confirmed none exists: do nothing.
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

      // Listing was tracked and this scrape completed cleanly without
      // finding it. That is a CONFIRMED negative — but a single one is
      // still not enough: directories reshuffle URLs, and a one-off miss
      // used to email the customer "Citation removed" at high severity.
      // Require CONSECUTIVE_MISSES_BEFORE_ALERT confirmed negatives.
      if (row && !scrape.found) {
        const misses = (row.consecutive_missing_count ?? 0) + 1;
        const confirmed = misses >= CONSECUTIVE_MISSES_BEFORE_ALERT;

        await db
          .update(citationTrackerListings)
          .set({
            // Only claim "missing" once confirmed; until then the listing
            // keeps its previous status and we simply count the misses.
            ...(confirmed ? { status: "missing" } : {}),
            consecutive_missing_count: misses,
            last_checked_at: new Date(),
            last_scrape_ok_at: new Date(),
            last_scrape_error: null,
          })
          .where(eq(citationTrackerListings.id, row.id));

        if (confirmed && row.status !== "missing") {
          await createAlert({
            subscription_id: sub.id,
            listing_id: row.id,
            alert_type: "removed_listing",
            old_value: { directory: dir.name, nap: row.current_nap as any } as any,
            new_value: null,
            severity: "high",
          });
          stats.alerts_created += 1;
        } else if (!confirmed) {
          stats.unconfirmed_misses += 1;
        }
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
            // Seeing the listing clears any pending "might be gone" streak.
            consecutive_missing_count: 0,
            last_scrape_ok_at: new Date(),
            last_scrape_error: null,
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
    directories_not_checked: 0,
    scrape_failures: 0,
    unconfirmed_misses: 0,
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
      // Roll these up too — scrape_failures rising while alerts stay flat is
      // the signal that a directory started blocking us, which is exactly what
      // used to be misread as customers' listings being removed.
      totals.directories_not_checked += stats.directories_not_checked;
      totals.scrape_failures += stats.scrape_failures;
      totals.unconfirmed_misses += stats.unconfirmed_misses;
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
