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
  prospectEvents, outboundSendState,
} from "@shared/schema";
import { eq, and, sql, lt, isNull, or, gte } from "drizzle-orm";
import { getOutreachAdapter, isDryRun } from "../services/outreachPlatform";
import {
  checkPushEligibility, addToBlacklist,
  computeGlobalDailyCap, GlobalSendBudget,
} from "../services/outboundSafety";
import { artifactOutreachEnabled } from "../services/outboundArtifactGenerator";
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

/* ─── LANE OB: Global volume ramp ───
 *
 * Cross-campaign cap on REAL pushes per day, enforced BEFORE the
 * per-campaign daily/hourly/batch caps. Ramp: 50/day at first real send,
 * +25/day per full week since; OUTBOUND_GLOBAL_DAILY_CAP is a hard ceiling.
 * Dry-run pushes neither count toward the cap (they log `dry_run_push`)
 * nor consume budget. */

/** Count REAL pushes across ALL campaigns since `since`. */
async function countGlobalSyncedSince(since: Date): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)` })
    .from(prospectEvents)
    .where(
      and(
        eq(prospectEvents.event_type, "sent_to_platform"),
        gte(prospectEvents.created_at, since),
      )
    );
  return Number(rows[0]?.c ?? 0);
}

/** Read the persisted first-real-send date (single-row state table). */
export async function getFirstRealSendAt(): Promise<Date | null> {
  const rows = await db.select().from(outboundSendState).limit(1);
  return rows[0]?.first_real_send_at ?? null;
}

/**
 * Persist the first-real-send date exactly once (idempotent — never
 * overwrites an existing value, so the ramp origin is stable forever).
 */
export async function markFirstRealSend(at: Date): Promise<void> {
  const rows = await db.select().from(outboundSendState).limit(1);
  if (rows.length === 0) {
    await db.insert(outboundSendState).values({ first_real_send_at: at });
    return;
  }
  if (!rows[0].first_real_send_at) {
    await db.update(outboundSendState)
      .set({ first_real_send_at: at, updated_at: new Date() })
      .where(eq(outboundSendState.id, rows[0].id));
  }
}

/** Build today's global budget: ramp cap minus what was already pushed today.
 *  Exported so the manual sync route enforces the SAME cross-campaign cap. */
export async function buildGlobalSendBudget(): Promise<GlobalSendBudget> {
  const firstRealSendAt = await getFirstRealSendAt();
  const cap = computeGlobalDailyCap(firstRealSendAt, new Date());
  const sentToday = await countGlobalSyncedSince(startOfDayUtc());
  return new GlobalSendBudget(cap, sentToday);
}

/* ─── Main export ─── */

export interface SyncResult {
  campaigns_processed: number;
  leads_synced: number;
  leads_skipped_rate_limit: number;
  leads_skipped_global_cap: number;
  leads_skipped_cooldown: number;
  leads_skipped_safety: number;
  leads_failed: number;
}

export async function processOutboundSync(): Promise<SyncResult> {
  const result: SyncResult = {
    campaigns_processed: 0,
    leads_synced: 0,
    leads_skipped_rate_limit: 0,
    leads_skipped_global_cap: 0,
    leads_skipped_cooldown: 0,
    leads_skipped_safety: 0,
    leads_failed: 0,
  };

  // ── LANE OB: Global volume ramp — checked BEFORE any per-campaign cap ──
  const globalBudget = await buildGlobalSendBudget();
  if (globalBudget.remaining <= 0) {
    log.info("Global daily send cap reached — no real pushes this run", {
      cap: globalBudget.cap,
    });
  }

  // Active campaigns with an external platform ID configured
  const activeCampaigns = await db
    .select()
    .from(outboundCampaigns)
    .where(eq(outboundCampaigns.status, "active"));

  for (const campaign of activeCampaigns) {
    if (!campaign.external_campaign_id) continue;

    const platform = campaign.platform as "instantly" | "smartlead";
    const dryRun = isDryRun(campaign.metadata as Record<string, unknown> | null);
    let adapter: ReturnType<typeof getOutreachAdapter> | null = null;

    try {
      // In dry-run, getOutreachAdapter returns the NoopAdapter — no key needed.
      adapter = getOutreachAdapter(platform, campaign.metadata as Record<string, unknown> | null);
    } catch (err: any) {
      // API key not configured — skip platform silently
      log.warn("Skipping campaign — adapter unavailable", { campaignId: campaign.id, error: err.message });
      continue;
    }

    // ── LANE OB: Global cap gates real campaigns BEFORE per-campaign caps ──
    // Dry-run campaigns are exempt (NoopAdapter, nothing real sent), so
    // testing never starves — and real sends never exceed the ramp.
    if (!dryRun && globalBudget.remaining <= 0) {
      result.leads_skipped_global_cap++;
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

    // How many can we push this run? Global remaining bounds real campaigns.
    const batchCap = dryRun
      ? Math.min(dailyRemaining, hourlyRemaining, 50)
      : Math.min(dailyRemaining, hourlyRemaining, 50, globalBudget.remaining);

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

      if (!["approved", "campaign_queued"].includes(prospect.status)) {
        result.leads_skipped_safety++;
        continue;
      }

      // ── Artifact-first gate ─────────────────────────────
      // The whole premise is "I already audited your business — here's the
      // link". So when artifact-first outreach is enabled, never push a lead
      // until its audit artifact is ready. Leave it pending; the artifact
      // worker generates it within a few minutes, then this picks it up.
      if (artifactOutreachEnabled() && enrichment?.artifact_status !== "generated") {
        result.leads_skipped_cooldown++;
        continue;
      }

      // ── LANE OB: Unified push-time eligibility re-check ─────────────────
      // ONE gate covering DNC, the CASL hard consent gate (min-confidence /
      // express / expired-implied / conspicuous-publication, CA always
      // strict), the global blacklist, AND the transactional unsubscribe
      // registry (email_unsubscribes bridge). Everything is re-checked HERE,
      // at push time — a lead suppressed by webhook or unsubscribe AFTER
      // assignment is never pushed.
      const gate = await checkPushEligibility(prospect);
      if (!gate.eligible) {
        result.leads_skipped_safety++;
        await db.update(campaignProspects)
          .set({ sync_status: "removed", updated_at: new Date() })
          .where(eq(campaignProspects.id, cp.id));

        if (gate.code === "blocked_blacklist" || gate.code === "blocked_unsubscribed") {
          // Permanent suppressions also flip the prospect-level DNC flag.
          await db.update(prospects)
            .set({
              do_not_contact: true,
              dnc_reason: gate.code === "blocked_blacklist"
                ? `blacklist:${gate.blacklistType}`
                : "transactional_unsubscribe",
              updated_at: new Date(),
            })
            .where(eq(prospects.id, cp.prospect_id));
          // Bridge: a transactional unsubscribe becomes a permanent outbound
          // blacklist entry too, so assign-time checks catch it from now on.
          if (gate.code === "blocked_unsubscribed" && prospect.primary_email) {
            await addToBlacklist("email", prospect.primary_email, "transactional_unsubscribe");
          }
        }

        await db.insert(prospectEvents).values({
          prospect_id: cp.prospect_id,
          campaign_prospect_id: cp.id,
          event_type: gate.code === "blocked_blacklist" || gate.code === "blocked_unsubscribed"
            ? "blacklisted"
            : gate.code === "blocked_dnc"
              ? "retry_skipped"
              : "blocked_consent",
          actor_type: "system",
          actor_name: "outbound_sync_worker",
          summary: `Blocked at push: ${gate.reason}`,
          metadata: { code: gate.code, campaign_id: campaign.id },
        });
        continue;
      }

      // ── TASK 4: Cooldown check (redundant but explicit) ─
      if (cp.next_retry_at && cp.next_retry_at > now) {
        result.leads_skipped_cooldown++;
        continue;
      }

      // ── LANE OB: consume one unit of the cross-campaign global budget ──
      // (real sends only — dry-run pushes are free). Once the budget is
      // exhausted, every remaining real lead this run is deferred, across
      // ALL campaigns.
      if (!dryRun && !globalBudget.tryConsume()) {
        result.leads_skipped_global_cap++;
        continue;
      }

      // ── Push to platform ─────────────────────────────────
      try {
        // Artifact merge fields → become {{audit_link}} / {{audit_score}} /
        // {{audit_grade}} / {{audit_finding}} variables in the platform email
        // template, so the cold email can show the report link + the specific
        // finding. Empty when no artifact (artifact-first gate above keeps that
        // from happening once the feature is enabled).
        const customFields: Record<string, string> = {};
        if (enrichment?.artifact_url) customFields.audit_link = enrichment.artifact_url;
        if (enrichment?.artifact_score != null) customFields.audit_score = String(enrichment.artifact_score);
        if (enrichment?.artifact_grade) customFields.audit_grade = enrichment.artifact_grade;
        if (enrichment?.artifact_headline) customFields.audit_finding = enrichment.artifact_headline;

        // ── P1-2: push the per-prospect AI personalization tokens ───────────
        // These become {{ai_first_line}} / {{ai_offer_angle}} / {{ai_cta_variant}}
        // / {{ai_reason_to_target}} merge fields in the platform template. Written
        // at assign time by personalizeForProspect (gated on the ANTHROPIC key);
        // absent fields are simply omitted (template falls back to its default).
        if (enrichment?.ai_first_line) customFields.ai_first_line = enrichment.ai_first_line;
        if (enrichment?.ai_offer_angle) customFields.ai_offer_angle = enrichment.ai_offer_angle;
        if (enrichment?.ai_cta_variant) customFields.ai_cta_variant = enrichment.ai_cta_variant;
        if (enrichment?.ai_reason_to_target) customFields.ai_reason_to_target = enrichment.ai_reason_to_target;

        const pushResult = await adapter!.addLeadToCampaign(
          campaign.external_campaign_id!,
          {
            email: prospect.primary_email,
            firstName: prospect.owner_name || prospect.contact_name || undefined,
            companyName: prospect.business_name,
            website: prospect.website_url || undefined,
            phone: prospect.primary_phone || undefined,
            // Prefer the refined ai_first_line over the legacy personalization line.
            personalizationLine:
              enrichment?.ai_first_line || enrichment?.ai_personalization_line || undefined,
            customFields: Object.keys(customFields).length ? customFields : undefined,
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

        // Task 9: event log — metadata includes campaign_id for rate-limit counting.
        // In dry-run we log a distinct `dry_run_push` (no real lead was registered),
        // so dashboards + rate-limit counters never treat a test as a real send.
        await db.insert(prospectEvents).values({
          prospect_id: cp.prospect_id,
          campaign_prospect_id: cp.id,
          event_type: dryRun ? "dry_run_push" : "sent_to_platform",
          actor_type: "system",
          actor_name: "outbound_sync_worker",
          summary: dryRun
            ? `DRY RUN — no external call. Would push to ${platform} campaign "${campaign.name}"`
            : `Pushed to ${platform} campaign "${campaign.name}"`,
          metadata: {
            campaign_id: campaign.id,
            external_lead_id: pushResult.externalLeadId,
            dry_run: dryRun,
          },
        });

        result.leads_synced++;

        // ── LANE OB: persist the ramp origin on the FIRST real send ever ──
        // Idempotent — markFirstRealSend never overwrites an existing value.
        if (!dryRun) {
          await markFirstRealSend(contactedAt);
        }

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
