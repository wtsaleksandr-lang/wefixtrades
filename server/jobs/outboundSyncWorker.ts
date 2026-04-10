/**
 * Outbound Sync Worker — V1
 *
 * Runs every 15 minutes (configured in scheduler.ts).
 * Finds campaign_prospects with sync_status = 'pending' and pushes them
 * to the appropriate outreach platform (Instantly or Smartlead).
 *
 * This is the automated counterpart to the manual POST /campaigns/:id/sync
 * endpoint — same logic, but runs on a schedule over ALL active campaigns.
 */

import { db } from "../db";
import {
  campaignProspects, outboundCampaigns, prospects, prospectEnrichment,
  prospectEvents,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getOutreachAdapter } from "../services/outreachPlatform";
import { sql } from "drizzle-orm";

interface SyncResult {
  campaigns_processed: number;
  leads_synced: number;
  leads_failed: number;
}

export async function processOutboundSync(): Promise<SyncResult> {
  let campaigns_processed = 0;
  let leads_synced = 0;
  let leads_failed = 0;

  // Get all active campaigns that have an external_campaign_id configured
  const activeCampaigns = await db.select()
    .from(outboundCampaigns)
    .where(
      and(
        eq(outboundCampaigns.status, "active"),
      )
    );

  for (const campaign of activeCampaigns) {
    if (!campaign.external_campaign_id) continue;

    const platform = campaign.platform as "instantly" | "smartlead";
    let adapter: ReturnType<typeof getOutreachAdapter> | null = null;

    try {
      adapter = getOutreachAdapter(platform);
    } catch (err: any) {
      // API key not configured — skip this platform silently
      console.warn(`[OutboundSync] Skipping campaign ${campaign.id} — ${err.message}`);
      continue;
    }

    // Fetch up to 50 pending leads per campaign per run (rate limit friendly)
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
        )
      )
      .limit(50);

    if (pending.length === 0) continue;
    campaigns_processed++;

    for (const { cp, prospect, enrichment } of pending) {
      if (!prospect?.primary_email) {
        leads_failed++;
        continue;
      }

      try {
        const result = await adapter.addLeadToCampaign(
          campaign.external_campaign_id,
          {
            email: prospect.primary_email,
            firstName: prospect.owner_name || prospect.contact_name || undefined,
            companyName: prospect.business_name,
            website: prospect.website_url || undefined,
            phone: prospect.primary_phone || undefined,
            personalizationLine: enrichment?.ai_personalization_line || undefined,
          }
        );

        await db.update(campaignProspects)
          .set({
            external_lead_id: result.externalLeadId,
            sync_status: "synced",
            outreach_status: "queued",
            last_synced_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(campaignProspects.id, cp.id));

        await db.update(prospects)
          .set({ status: "in_outreach", updated_at: new Date() })
          .where(eq(prospects.id, cp.prospect_id));

        await db.insert(prospectEvents).values({
          prospect_id: cp.prospect_id,
          campaign_prospect_id: cp.id,
          event_type: "synced",
          actor_type: "system",
          actor_name: "outbound_sync_worker",
          summary: `Auto-synced to ${platform} campaign "${campaign.name}"`,
          metadata: { external_lead_id: result.externalLeadId },
        });

        leads_synced++;
      } catch (err: any) {
        console.error(`[OutboundSync] Failed to sync lead ${cp.prospect_id} to ${platform}:`, err.message);

        await db.update(campaignProspects)
          .set({ sync_status: "failed", updated_at: new Date() })
          .where(eq(campaignProspects.id, cp.id));

        leads_failed++;
      }
    }
  }

  return { campaigns_processed, leads_synced, leads_failed };
}
