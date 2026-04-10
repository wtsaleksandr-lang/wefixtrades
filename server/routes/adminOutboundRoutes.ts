/**
 * Admin Outbound Routes — V1
 *
 * Mounted under /api/admin/outbound
 * All routes require admin authentication.
 *
 * Sections:
 *  1. Import (CSV + batch tracking)
 *  2. Prospects (list, get, review actions)
 *  3. Enrichment (trigger AI scoring)
 *  4. Campaigns (CRUD)
 *  5. Campaign assignment
 *  6. Outreach sync (manual trigger + webhook receiver)
 *  7. Sales pipeline
 *  8. Overview / stats
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { db } from "../db";
import {
  prospects, prospectEnrichment, outboundCampaigns, campaignProspects,
  prospectEvents, salesOpportunities, importBatches,
  type InsertProspect, type InsertProspectEnrichment,
  type InsertOutboundCampaign, type InsertCampaignProspect,
  type InsertProspectEvent, type InsertSalesOpportunity,
  type InsertImportBatch,
} from "@shared/schema";
import { eq, desc, ilike, and, or, inArray, sql, isNull, ne } from "drizzle-orm";
import { runHeuristics, runAiEnrichment, computeBaseScore } from "../services/prospectEnrichment";
import { getOutreachAdapter, parseOutreachWebhook } from "../services/outreachPlatform";

/* ─── helpers ─── */

function actorMeta(req: Request) {
  return {
    actor_type: "human" as const,
    actor_id: (req.user as any)?.id,
    actor_name: (req.user as any)?.name || (req.user as any)?.email || "admin",
  };
}

async function logEvent(
  prospectId: number,
  eventType: string,
  actor: ReturnType<typeof actorMeta>,
  summary: string,
  meta?: Record<string, unknown>,
  campaignProspectId?: number
) {
  await db.insert(prospectEvents).values({
    prospect_id: prospectId,
    campaign_prospect_id: campaignProspectId ?? null,
    event_type: eventType,
    ...actor,
    summary,
    metadata: meta ?? null,
  });
}

/** Normalise a URL to a bare domain for dedup */
function normaliseDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase().trim();
    return host || null;
  } catch {
    return null;
  }
}

/* ─── CSV column mapping ─── */
// Outscraper exports different column names depending on API version.
// We map common variants to our schema fields.
const CSV_MAP: Record<string, keyof InsertProspect> = {
  name: "business_name",
  business_name: "business_name",
  title: "business_name",
  site: "website_url",
  website: "website_url",
  web_site: "website_url",
  phone: "primary_phone",
  phone_number: "primary_phone",
  full_address: "address",
  address: "address",
  city: "city",
  state: "state",
  country_code: "country",
  country: "country",
  postal_code: "zip_code",
  zip: "zip_code",
  place_id: "google_place_id",
  google_id: "google_place_id",
  url: "google_maps_url",
  maps_url: "google_maps_url",
  rating: "google_rating",
  reviews: "google_review_count",
  reviews_count: "google_review_count",
  category: "trade_category",
  main_category: "trade_category",
  type: "trade_category",
  email: "primary_email",
  email_1: "primary_email",
  owner: "owner_name",
  owner_name: "owner_name",
  contact: "contact_name",
};

function mapCsvRow(row: Record<string, string>): Partial<InsertProspect> & { raw_data: Record<string, string> } {
  const out: Partial<InsertProspect> = {};
  for (const [col, val] of Object.entries(row)) {
    const key = CSV_MAP[col.toLowerCase().trim()];
    if (key && val) {
      (out as any)[key] = val.trim();
    }
  }
  // Coerce numeric fields
  if (out.google_review_count) {
    out.google_review_count = parseInt(String(out.google_review_count)) || null as any;
  }
  return { ...out, raw_data: row };
}

/* ─── Route registration ─── */

export function registerAdminOutboundRoutes(app: Express): void {

  /* ═══════════════════════════════════════════
     Overview / Stats
     ═══════════════════════════════════════════ */

  app.get("/api/admin/outbound/overview", requireAdmin, async (_req, res: Response) => {
    try {
      const [
        totalRow,
        newRow,
        enrichedRow,
        approvedRow,
        inOutreachRow,
        repliedRow,
        activeCampaignRow,
        pipelineRow,
      ] = await Promise.all([
        db.select({ c: sql<number>`count(*)` }).from(prospects),
        db.select({ c: sql<number>`count(*)` }).from(prospects).where(eq(prospects.status, "new")),
        db.select({ c: sql<number>`count(*)` }).from(prospects).where(eq(prospects.status, "enriched")),
        db.select({ c: sql<number>`count(*)` }).from(prospects).where(eq(prospects.status, "approved")),
        db.select({ c: sql<number>`count(*)` }).from(prospects).where(eq(prospects.status, "in_outreach")),
        db.select({ c: sql<number>`count(*)` }).from(prospects).where(eq(prospects.status, "replied")),
        db.select({ c: sql<number>`count(*)` }).from(outboundCampaigns).where(eq(outboundCampaigns.status, "active")),
        db.select({ c: sql<number>`count(*)` }).from(salesOpportunities),
      ]);

      res.json({
        total_prospects: Number(totalRow[0]?.c ?? 0),
        new: Number(newRow[0]?.c ?? 0),
        enriched: Number(enrichedRow[0]?.c ?? 0),
        approved: Number(approvedRow[0]?.c ?? 0),
        in_outreach: Number(inOutreachRow[0]?.c ?? 0),
        replied: Number(repliedRow[0]?.c ?? 0),
        active_campaigns: Number(activeCampaignRow[0]?.c ?? 0),
        pipeline_opportunities: Number(pipelineRow[0]?.c ?? 0),
      });
    } catch (err: any) {
      console.error("[outbound] overview error:", err.message);
      res.status(500).json({ error: "Failed to load overview" });
    }
  });

  /* ═══════════════════════════════════════════
     Import — CSV upload
     ═══════════════════════════════════════════ */

  // POST /api/admin/outbound/import/csv
  // Body: { rows: Record<string, string>[], filename?: string }
  app.post("/api/admin/outbound/import/csv", requireAdmin, async (req: Request, res: Response) => {
    const actor = actorMeta(req);
    const { rows, filename } = req.body as {
      rows: Record<string, string>[];
      filename?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "rows array is required" });
    }

    // Create batch record
    const [batch] = await db.insert(importBatches).values({
      source: "outscraper_csv",
      filename: filename || null,
      total_rows: rows.length,
      status: "processing",
      imported_by: actor.actor_id ?? null,
    }).returning();

    let imported = 0;
    let skippedDupes = 0;
    let failed = 0;

    for (const rawRow of rows) {
      try {
        const mapped = mapCsvRow(rawRow);

        if (!mapped.business_name) { failed++; continue; }

        const domain = normaliseDomain(mapped.website_url as string | undefined);

        // Dedup: check by domain, email, or phone
        const dupeClauses: ReturnType<typeof eq>[] = [];
        if (domain) dupeClauses.push(eq(prospects.website_domain, domain));
        if (mapped.primary_email) dupeClauses.push(eq(prospects.primary_email, mapped.primary_email as string));
        if (mapped.primary_phone) dupeClauses.push(eq(prospects.primary_phone, mapped.primary_phone as string));

        if (dupeClauses.length > 0) {
          const existing = await db.select({ id: prospects.id })
            .from(prospects)
            .where(or(...dupeClauses))
            .limit(1);
          if (existing.length > 0) { skippedDupes++; continue; }
        }

        // Insert prospect
        const [prospect] = await db.insert(prospects).values({
          ...mapped,
          website_domain: domain,
          import_batch_id: batch.id,
          source: "outscraper",
          source_external_id: mapped.google_place_id as string | null ?? null,
          status: "new",
        } as InsertProspect).returning();

        // Run heuristics immediately
        const h = runHeuristics({
          businessName: prospect.business_name,
          websiteUrl: prospect.website_url,
          websiteDomain: prospect.website_domain,
          tradeCategory: prospect.trade_category,
          googleRating: prospect.google_rating,
          googleReviewCount: prospect.google_review_count,
          city: prospect.city,
          state: prospect.state,
          ownerName: prospect.owner_name,
        });

        const baseScore = computeBaseScore(h);

        await db.insert(prospectEnrichment).values({
          prospect_id: prospect.id,
          ...h,
          quality_score: baseScore,
          enrichment_source: "heuristic",
          enriched_at: new Date(),
        });

        await logEvent(prospect.id, "imported", actor, `Imported from ${filename || "CSV"}`, { batch_id: batch.id });

        imported++;
      } catch (rowErr: any) {
        console.error("[outbound/import] row failed:", rowErr.message);
        failed++;
      }
    }

    // Mark batch complete
    await db.update(importBatches)
      .set({ status: "completed", imported, skipped_dupes: skippedDupes, failed, completed_at: new Date() })
      .where(eq(importBatches.id, batch.id));

    res.status(201).json({ batch_id: batch.id, imported, skipped_dupes: skippedDupes, failed });
  });

  // GET /api/admin/outbound/import/batches
  app.get("/api/admin/outbound/import/batches", requireAdmin, async (_req, res: Response) => {
    try {
      const batches = await db.select().from(importBatches).orderBy(desc(importBatches.created_at)).limit(50);
      res.json(batches);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list batches" });
    }
  });

  /* ═══════════════════════════════════════════
     Prospects — list + detail
     ═══════════════════════════════════════════ */

  // GET /api/admin/outbound/prospects
  // Query: status, trade, city, search, limit, offset, min_score
  app.get("/api/admin/outbound/prospects", requireAdmin, async (req: Request, res: Response) => {
    try {
      const {
        status, trade, city, search,
        limit: lRaw, offset: oRaw, min_score,
      } = req.query as Record<string, string>;

      const limit = Math.min(100, Math.max(1, parseInt(lRaw) || 50));
      const offset = Math.max(0, parseInt(oRaw) || 0);

      const filters: ReturnType<typeof eq>[] = [];
      if (status) filters.push(eq(prospects.status, status));
      if (trade) filters.push(ilike(prospects.trade_category, `%${trade}%`));
      if (city) filters.push(ilike(prospects.city, `%${city}%`));
      if (search) {
        filters.push(
          or(
            ilike(prospects.business_name, `%${search}%`),
            ilike(prospects.primary_email, `%${search}%`),
            ilike(prospects.website_domain, `%${search}%`),
          ) as any
        );
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      // Join enrichment for score
      const rows = await db
        .select({
          prospect: prospects,
          enrichment: prospectEnrichment,
        })
        .from(prospects)
        .leftJoin(prospectEnrichment, eq(prospectEnrichment.prospect_id, prospects.id))
        .where(whereClause)
        .orderBy(desc(prospectEnrichment.quality_score), desc(prospects.created_at))
        .limit(limit)
        .offset(offset);

      // Filter by min_score after join
      const minScore = parseInt(min_score) || 0;
      const filtered = minScore > 0
        ? rows.filter((r) => (r.enrichment?.quality_score ?? 0) >= minScore)
        : rows;

      const totalRows = await db
        .select({ c: sql<number>`count(*)` })
        .from(prospects)
        .where(whereClause);

      res.json({ data: filtered, total: Number(totalRows[0]?.c ?? 0) });
    } catch (err: any) {
      console.error("[outbound] list prospects:", err.message);
      res.status(500).json({ error: "Failed to list prospects" });
    }
  });

  // GET /api/admin/outbound/prospects/:id
  app.get("/api/admin/outbound/prospects/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const [row] = await db
        .select({ prospect: prospects, enrichment: prospectEnrichment })
        .from(prospects)
        .leftJoin(prospectEnrichment, eq(prospectEnrichment.prospect_id, prospects.id))
        .where(eq(prospects.id, id))
        .limit(1);

      if (!row) return res.status(404).json({ error: "Not found" });

      const events = await db.select().from(prospectEvents)
        .where(eq(prospectEvents.prospect_id, id))
        .orderBy(desc(prospectEvents.created_at))
        .limit(50);

      const campaigns = await db
        .select({ cp: campaignProspects, campaign: outboundCampaigns })
        .from(campaignProspects)
        .leftJoin(outboundCampaigns, eq(outboundCampaigns.id, campaignProspects.campaign_id))
        .where(eq(campaignProspects.prospect_id, id));

      res.json({ ...row, events, campaigns });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get prospect" });
    }
  });

  /* ═══════════════════════════════════════════
     Prospects — review actions
     POST /api/admin/outbound/prospects/:id/review
     Body: { action: "approve" | "reject" | "blacklist" | "dnc", notes?: string }
     ═══════════════════════════════════════════ */

  app.post("/api/admin/outbound/prospects/:id/review", requireAdmin, async (req: Request, res: Response) => {
    const actor = actorMeta(req);
    const id = parseInt(req.params.id);
    const { action, notes } = req.body as { action: string; notes?: string };

    if (!["approve", "reject", "blacklist", "dnc"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const statusMap: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      blacklist: "blacklisted",
      dnc: "rejected",
    };

    try {
      const [updated] = await db.update(prospects)
        .set({
          status: statusMap[action],
          do_not_contact: action === "blacklist" || action === "dnc",
          dnc_reason: (action === "blacklist" || action === "dnc") ? (notes || action) : undefined,
          reviewed_by: actor.actor_id ?? null,
          reviewed_at: new Date(),
          review_notes: notes || null,
          updated_at: new Date(),
        })
        .where(eq(prospects.id, id))
        .returning();

      if (!updated) return res.status(404).json({ error: "Not found" });

      await logEvent(id, action, actor, `${action} by ${actor.actor_name}`, { notes });
      res.json(updated);
    } catch (err: any) {
      console.error("[outbound] review error:", err.message);
      res.status(500).json({ error: "Review failed" });
    }
  });

  /* ═══════════════════════════════════════════
     Enrichment — trigger AI for one prospect
     ═══════════════════════════════════════════ */

  app.post("/api/admin/outbound/prospects/:id/enrich", requireAdmin, async (req: Request, res: Response) => {
    const actor = actorMeta(req);
    const id = parseInt(req.params.id);

    try {
      const [row] = await db.select().from(prospects).where(eq(prospects.id, id)).limit(1);
      if (!row) return res.status(404).json({ error: "Not found" });

      const input = {
        businessName: row.business_name,
        websiteUrl: row.website_url,
        websiteDomain: row.website_domain,
        tradeCategory: row.trade_category,
        googleRating: row.google_rating,
        googleReviewCount: row.google_review_count,
        city: row.city,
        state: row.state,
        ownerName: row.owner_name,
      };

      const aiResult = await runAiEnrichment(input);

      if (aiResult) {
        await db.update(prospectEnrichment)
          .set({
            quality_score: aiResult.quality_score,
            ai_personalization_line: aiResult.ai_personalization_line,
            ai_notes: aiResult.ai_notes,
            enrichment_source: "ai",
            enriched_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(prospectEnrichment.prospect_id, id));

        await db.update(prospects)
          .set({ status: "enriched", updated_at: new Date() })
          .where(and(eq(prospects.id, id), eq(prospects.status, "new")));

        await logEvent(id, "enriched", actor, "AI enrichment completed", { score: aiResult.quality_score });
      }

      const [enrichment] = await db.select().from(prospectEnrichment)
        .where(eq(prospectEnrichment.prospect_id, id)).limit(1);

      res.json({ enrichment, ai_ran: !!aiResult });
    } catch (err: any) {
      console.error("[outbound] enrich error:", err.message);
      res.status(500).json({ error: "Enrichment failed" });
    }
  });

  // POST /api/admin/outbound/enrich/batch
  // Body: { prospect_ids?: number[] }  — if omitted, enriches all new/unenriched
  app.post("/api/admin/outbound/enrich/batch", requireAdmin, async (req: Request, res: Response) => {
    const actor = actorMeta(req);
    const { prospect_ids } = req.body as { prospect_ids?: number[] };

    try {
      const query = db.select().from(prospects)
        .where(
          prospect_ids?.length
            ? inArray(prospects.id, prospect_ids)
            : eq(prospects.status, "new")
        )
        .limit(50);

      const rows = await query;
      let enriched = 0;
      let failed = 0;

      for (const row of rows) {
        try {
          const input = {
            businessName: row.business_name,
            websiteUrl: row.website_url,
            websiteDomain: row.website_domain,
            tradeCategory: row.trade_category,
            googleRating: row.google_rating,
            googleReviewCount: row.google_review_count,
            city: row.city,
            state: row.state,
            ownerName: row.owner_name,
          };

          const aiResult = await runAiEnrichment(input);
          if (aiResult) {
            await db.update(prospectEnrichment)
              .set({
                quality_score: aiResult.quality_score,
                ai_personalization_line: aiResult.ai_personalization_line,
                ai_notes: aiResult.ai_notes,
                enrichment_source: "ai",
                enriched_at: new Date(),
                updated_at: new Date(),
              })
              .where(eq(prospectEnrichment.prospect_id, row.id));

            await db.update(prospects)
              .set({ status: "enriched", updated_at: new Date() })
              .where(eq(prospects.id, row.id));

            await logEvent(row.id, "enriched", actor, "Batch AI enrichment", { score: aiResult.quality_score });
            enriched++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      res.json({ total: rows.length, enriched, failed });
    } catch (err: any) {
      res.status(500).json({ error: "Batch enrichment failed" });
    }
  });

  /* ═══════════════════════════════════════════
     Campaigns — CRUD
     ═══════════════════════════════════════════ */

  app.get("/api/admin/outbound/campaigns", requireAdmin, async (_req, res: Response) => {
    try {
      const rows = await db.select().from(outboundCampaigns)
        .orderBy(desc(outboundCampaigns.created_at));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to list campaigns" });
    }
  });

  app.post("/api/admin/outbound/campaigns", requireAdmin, async (req: Request, res: Response) => {
    const actor = actorMeta(req);
    try {
      const [campaign] = await db.insert(outboundCampaigns)
        .values({ ...req.body, created_by: actor.actor_id ?? null })
        .returning();
      res.status(201).json(campaign);
    } catch (err: any) {
      console.error("[outbound] create campaign:", err.message);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  app.patch("/api/admin/outbound/campaigns/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    try {
      const [campaign] = await db.update(outboundCampaigns)
        .set({ ...req.body, updated_at: new Date() })
        .where(eq(outboundCampaigns.id, id))
        .returning();
      if (!campaign) return res.status(404).json({ error: "Not found" });
      res.json(campaign);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });

  app.get("/api/admin/outbound/campaigns/:id", requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    try {
      const [campaign] = await db.select().from(outboundCampaigns).where(eq(outboundCampaigns.id, id)).limit(1);
      if (!campaign) return res.status(404).json({ error: "Not found" });

      const leads = await db
        .select({ cp: campaignProspects, prospect: prospects, enrichment: prospectEnrichment })
        .from(campaignProspects)
        .leftJoin(prospects, eq(prospects.id, campaignProspects.prospect_id))
        .leftJoin(prospectEnrichment, eq(prospectEnrichment.prospect_id, campaignProspects.prospect_id))
        .where(eq(campaignProspects.campaign_id, id))
        .orderBy(desc(campaignProspects.assigned_at));

      res.json({ campaign, leads });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to get campaign" });
    }
  });

  /* ═══════════════════════════════════════════
     Campaign Assignment
     POST /api/admin/outbound/campaigns/:id/assign
     Body: { prospect_ids: number[] }
     ═══════════════════════════════════════════ */

  app.post("/api/admin/outbound/campaigns/:id/assign", requireAdmin, async (req: Request, res: Response) => {
    const actor = actorMeta(req);
    const campaignId = parseInt(req.params.id);
    const { prospect_ids } = req.body as { prospect_ids: number[] };

    if (!Array.isArray(prospect_ids) || prospect_ids.length === 0) {
      return res.status(400).json({ error: "prospect_ids required" });
    }

    try {
      const [campaign] = await db.select().from(outboundCampaigns)
        .where(eq(outboundCampaigns.id, campaignId)).limit(1);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });

      // Filter to approved prospects only
      const approved = await db.select().from(prospects)
        .where(and(
          inArray(prospects.id, prospect_ids),
          eq(prospects.status, "approved"),
        ));

      if (approved.length === 0) {
        return res.status(400).json({ error: "No approved prospects found in selection" });
      }

      const assigned: number[] = [];
      const skipped: number[] = [];

      for (const p of approved) {
        // Check not already in this campaign
        const existing = await db.select({ id: campaignProspects.id })
          .from(campaignProspects)
          .where(and(
            eq(campaignProspects.campaign_id, campaignId),
            eq(campaignProspects.prospect_id, p.id),
          )).limit(1);

        if (existing.length > 0) { skipped.push(p.id); continue; }

        await db.insert(campaignProspects).values({
          campaign_id: campaignId,
          prospect_id: p.id,
          sync_status: "pending",
          outreach_status: "queued",
          assigned_by: actor.actor_id ?? null,
          assigned_at: new Date(),
        });

        await db.update(prospects)
          .set({ status: "campaign_queued", updated_at: new Date() })
          .where(eq(prospects.id, p.id));

        await logEvent(p.id, "campaign_assigned", actor,
          `Assigned to campaign "${campaign.name}"`,
          { campaign_id: campaignId }
        );

        assigned.push(p.id);
      }

      res.json({ assigned: assigned.length, skipped: skipped.length });
    } catch (err: any) {
      console.error("[outbound] assign:", err.message);
      res.status(500).json({ error: "Assignment failed" });
    }
  });

  /* ═══════════════════════════════════════════
     Outreach Sync — push pending leads to platform
     POST /api/admin/outbound/campaigns/:id/sync
     ═══════════════════════════════════════════ */

  app.post("/api/admin/outbound/campaigns/:id/sync", requireAdmin, async (req: Request, res: Response) => {
    const campaignId = parseInt(req.params.id);
    const actor = actorMeta(req);

    try {
      const [campaign] = await db.select().from(outboundCampaigns)
        .where(eq(outboundCampaigns.id, campaignId)).limit(1);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (!campaign.external_campaign_id) {
        return res.status(400).json({ error: "Campaign has no external_campaign_id set" });
      }

      const adapter = getOutreachAdapter(campaign.platform as "instantly" | "smartlead");

      // Fetch pending leads
      const pending = await db
        .select({ cp: campaignProspects, prospect: prospects, enrichment: prospectEnrichment })
        .from(campaignProspects)
        .leftJoin(prospects, eq(prospects.id, campaignProspects.prospect_id))
        .leftJoin(prospectEnrichment, eq(prospectEnrichment.prospect_id, campaignProspects.prospect_id))
        .where(and(
          eq(campaignProspects.campaign_id, campaignId),
          eq(campaignProspects.sync_status, "pending"),
        ))
        .limit(100);

      let synced = 0;
      let failed = 0;

      for (const { cp, prospect, enrichment } of pending) {
        if (!prospect?.primary_email) { failed++; continue; }
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

          await logEvent(cp.prospect_id, "synced", actor,
            `Synced to ${campaign.platform} campaign`,
            { external_lead_id: result.externalLeadId },
            cp.id
          );

          synced++;
        } catch (syncErr: any) {
          console.error("[outbound/sync] lead failed:", syncErr.message);
          await db.update(campaignProspects)
            .set({ sync_status: "failed", updated_at: new Date() })
            .where(eq(campaignProspects.id, cp.id));
          failed++;
        }
      }

      res.json({ synced, failed, total: pending.length });
    } catch (err: any) {
      console.error("[outbound] sync error:", err.message);
      res.status(500).json({ error: "Sync failed" });
    }
  });

  /* ═══════════════════════════════════════════
     Outreach Webhook receiver
     POST /api/admin/outbound/webhook/:platform
     ═══════════════════════════════════════════ */

  app.post("/api/admin/outbound/webhook/:platform", async (req: Request, res: Response) => {
    const platform = req.params.platform as "instantly" | "smartlead";

    // Validate secret header (set OUTREACH_WEBHOOK_SECRET env var)
    const secret = process.env.OUTREACH_WEBHOOK_SECRET;
    if (secret) {
      const provided = req.headers["x-webhook-secret"] || req.headers["x-api-key"];
      if (provided !== secret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    const event = parseOutreachWebhook(platform, req.body as Record<string, unknown>);
    if (!event) {
      return res.status(200).json({ ignored: true }); // unknown event type, ack
    }

    try {
      // Find campaign prospect by external_lead_id
      const [cp] = await db.select().from(campaignProspects)
        .where(eq(campaignProspects.external_lead_id, event.externalLeadId))
        .limit(1);

      if (!cp) {
        console.warn(`[outbound/webhook] Unknown external_lead_id: ${event.externalLeadId}`);
        return res.status(200).json({ ignored: true });
      }

      // Map event type to outreach status
      const statusMap: Record<string, string> = {
        email_sent: "sent",
        email_opened: "opened",
        email_clicked: "clicked",
        replied: "replied",
        bounced: "bounced",
        unsubscribed: "unsubscribed",
        opted_out: "opted_out",
      };

      const newOutreachStatus = statusMap[event.eventType];

      await db.update(campaignProspects)
        .set({
          outreach_status: newOutreachStatus,
          ...(event.eventType === "email_sent" && { emails_sent: sql`${campaignProspects.emails_sent} + 1`, last_email_sent_at: event.occurredAt }),
          ...(event.eventType === "replied" && { last_replied_at: event.occurredAt }),
          last_synced_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(campaignProspects.id, cp.id));

      // Update prospect status for key events
      if (event.eventType === "replied") {
        await db.update(prospects)
          .set({ status: "replied", updated_at: new Date() })
          .where(eq(prospects.id, cp.prospect_id));

        // Auto-create sales opportunity on reply
        const existing = await db.select({ id: salesOpportunities.id })
          .from(salesOpportunities)
          .where(eq(salesOpportunities.prospect_id, cp.prospect_id))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(salesOpportunities).values({
            prospect_id: cp.prospect_id,
            campaign_prospect_id: cp.id,
            stage: "positive_reply",
            positive_reply_at: event.occurredAt,
          });
        }
      }

      if (["bounced", "unsubscribed", "opted_out"].includes(event.eventType)) {
        await db.update(prospects)
          .set({
            do_not_contact: true,
            dnc_reason: event.eventType,
            updated_at: new Date(),
          })
          .where(eq(prospects.id, cp.prospect_id));
      }

      await logEvent(
        cp.prospect_id,
        event.eventType,
        { actor_type: "platform_webhook", actor_id: undefined as any, actor_name: platform },
        `${platform} event: ${event.eventType}`,
        event.rawPayload,
        cp.id
      );

      res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error("[outbound/webhook] error:", err.message);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  /* ═══════════════════════════════════════════
     Sales Pipeline
     ═══════════════════════════════════════════ */

  // GET /api/admin/outbound/pipeline
  app.get("/api/admin/outbound/pipeline", requireAdmin, async (_req, res: Response) => {
    try {
      const rows = await db
        .select({
          opportunity: salesOpportunities,
          prospect: prospects,
          enrichment: prospectEnrichment,
        })
        .from(salesOpportunities)
        .leftJoin(prospects, eq(prospects.id, salesOpportunities.prospect_id))
        .leftJoin(prospectEnrichment, eq(prospectEnrichment.prospect_id, salesOpportunities.prospect_id))
        .orderBy(desc(salesOpportunities.created_at));

      // Group by stage
      const STAGES = ["positive_reply", "booked_call", "trial_started", "paid", "lost"] as const;
      const grouped = Object.fromEntries(STAGES.map((s) => [s, [] as typeof rows]));
      for (const row of rows) {
        const stage = row.opportunity.stage as typeof STAGES[number];
        if (grouped[stage]) grouped[stage].push(row);
      }

      res.json({ stages: grouped, total: rows.length });
    } catch (err: any) {
      console.error("[outbound] pipeline error:", err.message);
      res.status(500).json({ error: "Failed to load pipeline" });
    }
  });

  // PATCH /api/admin/outbound/pipeline/:id
  // Body: { stage: string, notes?: string, lost_reason?: string }
  app.patch("/api/admin/outbound/pipeline/:id", requireAdmin, async (req: Request, res: Response) => {
    const actor = actorMeta(req);
    const id = parseInt(req.params.id);
    const { stage, notes, lost_reason } = req.body as {
      stage: string; notes?: string; lost_reason?: string;
    };

    const validStages = ["positive_reply", "booked_call", "trial_started", "paid", "lost"];
    if (!validStages.includes(stage)) {
      return res.status(400).json({ error: "Invalid stage" });
    }

    try {
      const stageTimestamps: Record<string, Partial<typeof salesOpportunities.$inferSelect>> = {
        positive_reply: { positive_reply_at: new Date() },
        booked_call: { booked_call_at: new Date() },
        trial_started: { trial_started_at: new Date() },
        paid: { paid_at: new Date() },
        lost: { lost_at: new Date() },
      };

      const [opp] = await db.update(salesOpportunities)
        .set({
          stage,
          notes: notes || undefined,
          lost_reason: lost_reason || undefined,
          ...(stageTimestamps[stage] as any),
          updated_at: new Date(),
        })
        .where(eq(salesOpportunities.id, id))
        .returning();

      if (!opp) return res.status(404).json({ error: "Not found" });

      await logEvent(
        opp.prospect_id,
        "pipeline_stage_changed",
        actor,
        `Pipeline stage → ${stage}`,
        { stage, lost_reason }
      );

      res.json(opp);
    } catch (err: any) {
      console.error("[outbound] pipeline update:", err.message);
      res.status(500).json({ error: "Failed to update pipeline stage" });
    }
  });
}
