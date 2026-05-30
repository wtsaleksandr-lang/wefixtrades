/**
 * Outbound Sync Worker — V1 (hardened)
 *
 * Runs every 15 minutes via scheduler.ts.
 *
 * Hardening applied:
 *  - Task 3: Per-campaign daily + hourly send limits enforced before any push
 *  - Task 4: Retry / cooldown — skips leads with next_retry_at in the future;
 *            after a sync failure increments retry_count and backs off exponentially
 *  - Task 8: Safety guards — DNC, missing email, wrong status all blocked before push
 *  - Task 9: Structured event logging for every outcome
 *
 * Rate limiting strategy:
 *  We count synced leads from prospect_events for the current hour/day window.
 *  This is accurate even if the worker crashes mid-run and is restarted.
 *
 * Delay strategy:
 *  A small randomised delay (1–3 s) between Instantly/Smartlead API calls
 *  prevents burst-registering leads. Actual email pacing is controlled by
 *  the outreach platform — we are only registering leads into a campaign.
 */

import { db } from "../db";
import {
  campaignProspects, outboundCampaigns, prospects, prospectEnrichment,
  prospectEvents,
} from "@shared/schema";
import { eq, and, sql, lt, isNull, or, gte } from "drizzle-orm";
import { getOutreachAdapter } from "../services/outreachPlatform";
import { checkBlacklist } from "../services/outboundSafety";
import { createLogger } from "../lib/logger";

const log = createLogger("OutboundSync");

/* ─── Helpers ─── */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Random delay between 1 000 ms and 3 000 ms between API calls */
const apiDelay = () => sleep(1000 + Math.random() * 2000);

/** Start-of-today UTC as a Date */
function startOfDayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** One hour ago */
function oneHourAgo(): Date {
  return new Date(Date.now() - 60 * 60 * 1000);
}

/** Max retry attempts before a lead is permanently skipped */
const MAX_RETRIES = 2;

/** Exponential back-off: 1 h → 4 h → give up */
function retryDelayMs(retryCount: number): number {
  return Math.pow(4, retryCount) * 60 * 60 * 1000; // 1h, 4h
}

/* ─── Rate limit counters ─── */

/** Count how many leads were synced for a campaign since `since`. */
async function countSyncedSince(campaignId: number, since: Date): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(prospectEvents)
    .where(
      and(
        eq(prospectEvents.event_type, "sent_to_platform"),
        sql`${prospectEvents.metadata}->>'campaign_id' = ${String(campaignId)}`,
        gte(prospectEvents.created_at, since),
      )
    );
  return Number(rows[0]?.c ?? 0);
}

/* ─── Main export ─── */

export interface SyncResult {
  campaigns_processed: number;
  leads_synced: number;
  leads_skipped_rate_limit: number;
  leads_skipped_cooldown: number;
  leads_skipped_safety: number;
  leads_failed: number;
}

export async function processOutboundSync(): Promise<SyncResult> {
  const result: SyncResult = {
    campaigns_processed: 0,
    leads_synced: 0,
    leads_skipped_rate_limit: 0,
    leads_skipped_cooldown: 0,
    leads_skipped_safety: 0,
    leads_failed: 0,
  };

  // Active campaigns with an external platform ID configured
  const activeCampaigns = await db
    .select()
    .from(outboundCampaigns)
    .where(eq(outboundCampaigns.status, "active"));

  for (const campaign of activeCampaigns) {
    if (!campaign.external_campaign_id) continue;

    const platform = campaign.platform as "instantly" | "smartlead";
    let adapter: ReturnType<typeof getOutreachAdapter> | null = null;

    try {
      adapter = getOutreachAdapter(platform);
    } catch (err: any) {
      // API key not configured — skip platform silently
      log.warn("Skipping campaign — adapter unavailable", { campaignId: campaign.id, error: err.message });
      continue;
    }

    // ── TASK 3: Check rate limits before touching any leads ──
    const dailySent  = await countSyncedSince(campaign.id, startOfDayUtc());
    const hourlySent = await countSyncedSince(campaign.id, oneHourAgo());

    const dailyRemaining  = (campaign.daily_send_limit ?? 40) - dailySent;
    const hourlyRemaining = (campaign.hourly_send_limit ?? 10) - hourlySent;

    if (dailyRemaining <= 0) {
      log.info("Campaign hit daily limit", { campaignId: campaign.id, dailySendLimit: campaign.daily_send_limit });
      result.leads_skipped_rate_limit++;
      continue;
    }
    if (hourlyRemaining <= 0) {
      log.info("Campaign hit hourly limit", { campaignId: campaign.id, hourlySendLimit: campaign.hourly_send_limit });
      result.leads_skipped_rate_limit++;
      continue;
    }

    // How many can we push this run?
    const batchCap = Math.min(dailyRemaining, hourlyRemaining, 50);

    // Fetch pending leads — FIFO by assigned_at
    // Task 4: skip leads where next_retry_at is still in the future
    const now = new Date();
    const pending = await db
      .select({
        cp: campaignProspects,
        prospect: prospects,
        enrichment: prospectEnrichment,
      })
      .from(campaignProspects)
      .leftJoin(prospects, eq(prospects.id, campaignProspects.prospect_id))
      .leftJoin(prospectEnrichment, eq(prospectEnrichment.prospect_id, campaignProspects.prospect_id))
      .where(
        and(
          eq(campaignProspects.campaign_id, campaign.id),
          eq(campaignProspects.sync_status, "pending"),
          // Only pick up leads whose cooldown has expired (or were never set)
          or(
            isNull(campaignProspects.next_retry_at),
            lt(campaignProspects.next_retry_at, now),
          ),
          // Hard cap on retries
          sql`${campaignProspects.retry_count} <= ${MAX_RETRIES}`,
        )
      )
      .orderBy(campaignProspects.assigned_at)     // FIFO
      .limit(batchCap);

    if (pending.length === 0) continue;
    result.campaigns_processed++;

    for (const { cp, prospect, enrichment } of pending) {
      // ── TASK 8: Pre-send safety guards ──────────────────
      if (!prospect) {
        result.leads_skipped_safety++;
        continue;
      }

      if (!prospect.primary_email) {
        result.leads_skipped_safety++;
        await db.update(campaignProspects)
          .set({ sync_status: "failed", updated_at: new Date() })
          .where(eq(campaignProspects.id, cp.id));
        await db.insert(prospectEvents).values({
          prospect_id: cp.prospect_id,
          campaign_prospect_id: cp.id,
          event_type: "retry_skipped",
          actor_type: "system",
          actor_name: "outbound_sync_worker",
          summary: "Skipped: no email address",
        });
        continue;
      }

      if (prospect.do_not_contact) {
        result.leads_skipped_safety++;
        await db.update(campaignProspects)
          .set({ sync_status: "removed", updated_at: new Date() })
          .where(eq(campaignProspects.id, cp.id));
        await db.insert(prospectEvents).values({
          prospect_id: cp.prospect_id,
          campaign_prospect_id: cp.id,
          event_type: "retry_skipped",
          actor_type: "system",
          actor_name: "outbound_sync_worker",
          summary: "Skipped: do_not_contact flag set",
        });
        continue;
      }

      if (!["approved", "campaign_queued"].includes(prospect.status)) {
        result.leads_skipped_safety++;
        continue;
      }

      // ── CASL implied-consent gate (default ON) ──────────
      // Only contact an email that is CONSPICUOUSLY PUBLISHED on the business's
      // OWN website — i.e. the email's domain matches the business's website
      // domain (info@acmeplumbing.com is fine; a scraped gmail/outlook address
      // or an email on an unrelated domain is NOT implied consent under CASL's
      // B2B exemption). This is the actual published-on-their-site test, not the
      // coarser contact_confidence bucket (which lumps domain-matched generics
      // together with unknown-domain emails). Flip OUTBOUND_CASL_STRICT=false
      // only with a separate lawful basis to send.
      if (process.env.OUTBOUND_CASL_STRICT !== "false") {
        const emailDomain = prospect.primary_email.split("@")[1]?.toLowerCase().trim().replace(/^www\./, "") || "";
        const siteDomain = (prospect.website_domain || "").toLowerCase().trim().replace(/^www\./, "");
        const publishedOnOwnSite = !!emailDomain && !!siteDomain && emailDomain === siteDomain;
        if (!publishedOnOwnSite) {
          result.leads_skipped_safety++;
          await db.update(campaignProspects)
            .set({ sync_status: "removed", updated_at: new Date() })
            .where(eq(campaignProspects.id, cp.id));
          await db.insert(prospectEvents).values({
            prospect_id: cp.prospect_id,
            campaign_prospect_id: cp.id,
            event_type: "retry_skipped",
            actor_type: "system",
            actor_name: "outbound_sync_worker",
            summary: `Skipped (CASL): "${prospect.primary_email}" is not published on the business's own domain (${siteDomain || "no website"})`,
          });
          continue;
        }
      }

      // Live blacklist re-check at push time (protects against post-assignment blacklisting)
      const blCheck = await checkBlacklist(
        prospect.website_domain,
        prospect.primary_email,
        prospect.primary_phone
      );
      if (blCheck.blocked) {
        result.leads_skipped_safety++;
        await db.update(campaignProspects)
          .set({ sync_status: "removed", updated_at: new Date() })
          .where(eq(campaignProspects.id, cp.id));
        await db.update(prospects)
          .set({ do_not_contact: true, dnc_reason: `blacklist:${blCheck.type}`, updated_at: new Date() })
          .where(eq(prospects.id, cp.prospect_id));
        await db.insert(prospectEvents).values({
          prospect_id: cp.prospect_id,
          campaign_prospect_id: cp.id,
          event_type: "blacklisted",
          actor_type: "system",
          actor_name: "outbound_sync_worker",
          summary: `Blocked at sync: blacklisted ${blCheck.type}`,
          metadata: { reason: blCheck.reason },
        });
        continue;
      }

      // ── TASK 4: Cooldown check (redundant but explicit) ─
      if (cp.next_retry_at && cp.next_retry_at > now) {
        result.leads_skipped_cooldown++;
        continue;
      }

      // ── Push to platform ─────────────────────────────────
      try {
        const pushResult = await adapter!.addLeadToCampaign(
          campaign.external_campaign_id!,
          {
            email: prospect.primary_email,
            firstName: prospect.owner_name || prospect.contact_name || undefined,
            companyName: prospect.business_name,
            website: prospect.website_url || undefined,
            phone: prospect.primary_phone || undefined,
            personalizationLine: enrichment?.ai_personalization_line || undefined,
          }
        );

        const contactedAt = new Date();

        await db.update(campaignProspects)
          .set({
            external_lead_id: pushResult.externalLeadId,
            sync_status: "synced",
            outreach_status: "queued",
            last_synced_at: contactedAt,
            last_contacted_at: contactedAt,
            updated_at: contactedAt,
          })
          .where(eq(campaignProspects.id, cp.id));

        await db.update(prospects)
          .set({ status: "in_outreach", updated_at: contactedAt })
          .where(eq(prospects.id, cp.prospect_id));

        // Task 9: sent_to_platform event — metadata includes campaign_id for rate-limit counting
        await db.insert(prospectEvents).values({
          prospect_id: cp.prospect_id,
          campaign_prospect_id: cp.id,
          event_type: "sent_to_platform",
          actor_type: "system",
          actor_name: "outbound_sync_worker",
          summary: `Pushed to ${platform} campaign "${campaign.name}"`,
          metadata: {
            campaign_id: campaign.id,
            external_lead_id: pushResult.externalLeadId,
          },
        });

        result.leads_synced++;

        // ── TASK 3: Throttle between API calls ─────────────
        await apiDelay();

      } catch (err: any) {
        log.error("Failed to sync lead", { prospectId: cp.prospect_id, error: err.message });
        result.leads_failed++;

        const newRetryCount = (cp.retry_count ?? 0) + 1;

        if (newRetryCount > MAX_RETRIES) {
          // Permanently failed — remove from queue
          await db.update(campaignProspects)
            .set({
              sync_status: "failed",
              retry_count: newRetryCount,
              updated_at: new Date(),
            })
            .where(eq(campaignProspects.id, cp.id));

          await db.insert(prospectEvents).values({
            prospect_id: cp.prospect_id,
            campaign_prospect_id: cp.id,
            event_type: "retry_skipped",
            actor_type: "system",
            actor_name: "outbound_sync_worker",
            summary: `Max retries (${MAX_RETRIES}) exceeded — permanently failed`,
            metadata: { error: err.message, retry_count: newRetryCount },
          });
        } else {
          // ── TASK 4: Schedule exponential back-off retry ──
          const nextRetry = new Date(Date.now() + retryDelayMs(newRetryCount));

          await db.update(campaignProspects)
            .set({
              sync_status: "pending",     // keep as pending so it's retried
              retry_count: newRetryCount,
              next_retry_at: nextRetry,
              updated_at: new Date(),
            })
            .where(eq(campaignProspects.id, cp.id));

          await db.insert(prospectEvents).values({
            prospect_id: cp.prospect_id,
            campaign_prospect_id: cp.id,
            event_type: "retry_queued",
            actor_type: "system",
            actor_name: "outbound_sync_worker",
            summary: `Sync failed (attempt ${newRetryCount}/${MAX_RETRIES}) — retrying after ${nextRetry.toISOString()}`,
            metadata: { error: err.message, next_retry_at: nextRetry.toISOString() },
          });
        }
      }
    }
  }

  return result;
}
