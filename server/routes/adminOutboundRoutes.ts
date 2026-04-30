/**
 * Admin Outbound Routes — V1 (hardened)
 *
 * Mounted under /api/admin/outbound
 * All routes require admin authentication.
 *
 * Sections:
 *  1. Import (CSV + batch tracking)
 *  2. Prospects (list, get, review actions)
 *  3. Enrichment (trigger AI scoring)
 *  4. Campaigns (CRUD + stats)
 *  5. Campaign assignment
 *  6. Outreach sync (manual trigger + webhook receiver)
 *  7. Sales pipeline
 *  8. Overview / stats
 *  9. Blacklist management
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { db } from "../db";
import {
  prospects, prospectEnrichment, outboundCampaigns, campaignProspects,
  prospectEvents, salesOpportunities, importBatches,
  outboundBlockedDomains, outboundBlockedEmails, outboundBlockedPhones,
  type InsertProspect, type InsertProspectEnrichment,
  type InsertOutboundCampaign, type InsertCampaignProspect,
  type InsertProspectEvent, type InsertSalesOpportunity,
  type InsertImportBatch,
} from "@shared/schema";
import { eq, desc, ilike, and, or, inArray, sql, isNull, ne, gte, lt } from "drizzle-orm";
import { runHeuristics, runAiEnrichment, computeBaseScore } from "../services/prospectEnrichment";
import { getOutreachAdapter, parseOutreachWebhook } from "../services/outreachPlatform";
import {
  generateFingerprint,
  scoreContactConfidence,
  checkBlacklist,
  addToBlacklist,
} from "../services/outboundSafety";
import { assignTargetOffer, computePriorityScore } from "../services/prospectTargeting";
import { classifyReplyFull } from "../services/replyIntelligence";
import { logIntegrationError } from "../services/integrationErrors";

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
        const email = (mapped.primary_email as string | undefined) || null;
        const phone = (mapped.primary_phone as string | undefined) || null;

        // ── TASK 1: Fingerprint dedup ─────────────────────
        const fingerprint = generateFingerprint(
          mapped.business_name as string,
          mapped.city as string | undefined,
          phone
        );

        const fpDupe = await db.select({ id: prospects.id })
          .from(prospects)
          .where(eq(prospects.dedupe_fingerprint, fingerprint))
          .limit(1);

        if (fpDupe.length > 0) {
          skippedDupes++;
          // Log dedup skip event against the existing record (Task 9)
          await db.insert(prospectEvents).values({
            prospect_id: fpDupe[0].id,
            event_type: "dedup_skipped",
            actor_type: "system",
            actor_name: "import",
            summary: `Fingerprint duplicate skipped (batch ${batch.id})`,
            metadata: { filename, fingerprint },
          });
          continue;
        }

        // ── Fallback dedup: domain / email / phone ────────
        const dupeClauses: ReturnType<typeof eq>[] = [];
        if (domain) dupeClauses.push(eq(prospects.website_domain, domain));
        if (email)  dupeClauses.push(eq(prospects.primary_email, email));
        if (phone)  dupeClauses.push(eq(prospects.primary_phone, phone));

        if (dupeClauses.length > 0) {
          const existing = await db.select({ id: prospects.id })
            .from(prospects)
            .where(or(...dupeClauses))
            .limit(1);
          if (existing.length > 0) { skippedDupes++; continue; }
        }

        // ── TASK 7: Global blacklist check ────────────────
        const blacklisted = await checkBlacklist(domain, email, phone);
        if (blacklisted.blocked) {
          skippedDupes++;
          console.info(`[outbound/import] Blocked by blacklist (${blacklisted.type}): ${blacklisted.reason}`);
          continue;
        }

        // ── TASK 2: Contact confidence ────────────────────
        const confidence = scoreContactConfidence(email, domain);

        // Insert prospect
        const [prospect] = await db.insert(prospects).values({
          ...mapped,
          website_domain: domain,
          import_batch_id: batch.id,
          source: "outscraper",
          source_external_id: (mapped.google_place_id as string | null) ?? null,
          dedupe_fingerprint: fingerprint,
          contact_confidence: confidence,
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

        // V2: compute offer match + priority score from heuristics
        const targetOffer = assignTargetOffer({
          has_website:          h.has_website,
          website_quality_score: h.website_quality_score,
          has_quote_tool:       h.has_quote_tool,
          google_review_count:  prospect.google_review_count,
          google_rating:        prospect.google_rating,
          social_presence_score: h.social_presence_score,
          primary_phone:        prospect.primary_phone,
        });

        const priorityScore = computePriorityScore({
          has_website:           h.has_website,
          website_quality_score: h.website_quality_score,
          likely_owner_operator: h.likely_owner_operator,
          quality_score:         baseScore,
          contact_confidence:    confidence,
          primary_phone:         prospect.primary_phone,
          google_review_count:   prospect.google_review_count,
          google_rating:         prospect.google_rating,
        });

        await db.update(prospects)
          .set({ target_offer: targetOffer, priority_score: priorityScore, updated_at: new Date() })
          .where(eq(prospects.id, prospect.id));

        await db.insert(prospectEnrichment).values({
          prospect_id: prospect.id,
          ...h,
          quality_score: baseScore,
          enrichment_source: "heuristic",
          enriched_at: new Date(),
        });

        // Task 9: log import with confidence info
        await logEvent(prospect.id, "imported", actor,
          `Imported from ${filename || "CSV"} — confidence: ${confidence}`,
          { batch_id: batch.id, confidence, fingerprint }
        );

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
        limit: lRaw, offset: oRaw, min_score, sort,
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
      const orderClause = sort === "priority"
        ? [desc(prospects.priority_score), desc(prospectEnrichment.quality_score), desc(prospects.created_at)]
        : [desc(prospectEnrichment.quality_score), desc(prospects.created_at)];

      const rows = await db
        .select({
          prospect: prospects,
          enrichment: prospectEnrichment,
        })
        .from(prospects)
        .leftJoin(prospectEnrichment, eq(prospectEnrichment.prospect_id, prospects.id))
        .where(whereClause)
        .orderBy(...orderClause)
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
        // Recompute priority score with updated AI quality score
        const [existingRow] = await db.select().from(prospects).where(eq(prospects.id, id)).limit(1);
        const [existingEnrich] = await db.select().from(prospectEnrichment)
          .where(eq(prospectEnrichment.prospect_id, id)).limit(1);

        const updatedPriority = computePriorityScore({
          has_website:           existingEnrich?.has_website,
          website_quality_score: existingEnrich?.website_quality_score,
          likely_owner_operator: existingEnrich?.likely_owner_operator,
          quality_score:         aiResult.quality_score,
          contact_confidence:    existingRow?.contact_confidence,
          primary_phone:         existingRow?.primary_phone,
          google_review_count:   existingRow?.google_review_count,
          google_rating:         existingRow?.google_rating,
        });

        await db.update(prospectEnrichment)
          .set({
            quality_score:        aiResult.quality_score,
            ai_personalization_line: aiResult.ai_personalization_line,
            ai_notes:             aiResult.ai_notes,
            ai_reason_to_target:  aiResult.ai_reason_to_target,
            ai_first_line:        aiResult.ai_first_line,
            ai_offer_angle:       aiResult.ai_offer_angle,
            ai_cta_variant:       aiResult.ai_cta_variant,
            enrichment_source:    "ai",
            enriched_at:          new Date(),
            updated_at:           new Date(),
          })
          .where(eq(prospectEnrichment.prospect_id, id));

        await db.update(prospects)
          .set({ status: "enriched", priority_score: updatedPriority, updated_at: new Date() })
          .where(and(eq(prospects.id, id), eq(prospects.status, "new")));

        await logEvent(id, "enriched", actor, "AI enrichment completed", { score: aiResult.quality_score, priority: updatedPriority });
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
            const [existEnrich] = await db.select().from(prospectEnrichment)
              .where(eq(prospectEnrichment.prospect_id, row.id)).limit(1);

            const updatedPriority = computePriorityScore({
              has_website:           existEnrich?.has_website,
              website_quality_score: existEnrich?.website_quality_score,
              likely_owner_operator: existEnrich?.likely_owner_operator,
              quality_score:         aiResult.quality_score,
              contact_confidence:    row.contact_confidence,
              primary_phone:         row.primary_phone,
              google_review_count:   row.google_review_count,
              google_rating:         row.google_rating,
            });

            await db.update(prospectEnrichment)
              .set({
                quality_score:        aiResult.quality_score,
                ai_personalization_line: aiResult.ai_personalization_line,
                ai_notes:             aiResult.ai_notes,
                ai_reason_to_target:  aiResult.ai_reason_to_target,
                ai_first_line:        aiResult.ai_first_line,
                ai_offer_angle:       aiResult.ai_offer_angle,
                ai_cta_variant:       aiResult.ai_cta_variant,
                enrichment_source:    "ai",
                enriched_at:          new Date(),
                updated_at:           new Date(),
              })
              .where(eq(prospectEnrichment.prospect_id, row.id));

            await db.update(prospects)
              .set({ status: "enriched", priority_score: updatedPriority, updated_at: new Date() })
              .where(eq(prospects.id, row.id));

            await logEvent(row.id, "enriched", actor, "Batch AI enrichment", { score: aiResult.quality_score, priority: updatedPriority });
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

      // ── TASK 8: Filter to approved prospects only ─────
      const approved = await db.select().from(prospects)
        .where(and(
          inArray(prospects.id, prospect_ids),
          eq(prospects.status, "approved"),
          eq(prospects.do_not_contact, false),
        ));

      if (approved.length === 0) {
        return res.status(400).json({ error: "No approved prospects found in selection" });
      }

      const assigned: number[] = [];
      const skipped: number[] = [];
      const blocked: { id: number; reason: string }[] = [];

      for (const p of approved) {
        // Task 8: must have an email to be outreach-eligible
        if (!p.primary_email) {
          skipped.push(p.id);
          await logEvent(p.id, "blocked_low_confidence", actor,
            "Blocked from assignment: no email address",
            { campaign_id: campaignId }
          );
          continue;
        }

        // ── TASK 2: Confidence gate ───────────────────────
        // 'low' and 'none' are blocked unless the prospect was manually approved
        // (reviewed_by being set is the signal that a human explicitly OK'd it)
        const conf = p.contact_confidence ?? "none";
        if ((conf === "low" || conf === "none") && !p.reviewed_by) {
          skipped.push(p.id);
          await logEvent(p.id, "blocked_low_confidence", actor,
            `Blocked from assignment: contact_confidence = ${conf} (not manually approved)`,
            { campaign_id: campaignId, confidence: conf }
          );
          blocked.push({ id: p.id, reason: `contact_confidence: ${conf}` });
          continue;
        }

        // ── TASK 7: Blacklist check ───────────────────────
        const bl = await checkBlacklist(p.website_domain, p.primary_email, p.primary_phone);
        if (bl.blocked) {
          skipped.push(p.id);
          await logEvent(p.id, "blocked_blacklist", actor,
            `Blocked from assignment: blacklisted (${bl.type}) — ${bl.reason}`,
            { campaign_id: campaignId, blacklist_type: bl.type }
          );
          blocked.push({ id: p.id, reason: `blacklist:${bl.type}` });
          continue;
        }

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

        // Task 9: assigned_to_campaign event
        await logEvent(p.id, "campaign_assigned", actor,
          `Assigned to campaign "${campaign.name}"`,
          { campaign_id: campaignId }
        );

        assigned.push(p.id);
      }

      res.json({ assigned: assigned.length, skipped: skipped.length, blocked });
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

    // Validate secret header (set OUTREACH_WEBHOOK_SECRET env var).
    //
    // Phase-1 safety: production must always require the shared secret —
    // if it is missing, refuse the request with 503 rather than fail open.
    // Development/test deploys may run without it so local smoke tooling
    // still works, but the bypass is loud-logged so it can never be
    // mistaken for a configured deploy.
    const secret = process.env.OUTREACH_WEBHOOK_SECRET;
    const isProd = process.env.NODE_ENV === "production";

    if (!secret) {
      if (isProd) {
        console.error(
          "[outbound/webhook] PROD misconfiguration: OUTREACH_WEBHOOK_SECRET is not set — rejecting webhook",
        );
        void logIntegrationError({
          integration: "outreach",
          area: "webhook_secret_missing",
          severity: "critical",
          message: "OUTREACH_WEBHOOK_SECRET is not set in production — rejecting webhook",
          metadata: { platform },
        });
        return res.status(503).json({ error: "Webhook secret not configured" });
      }
      console.warn(
        "[outbound/webhook] DEV mode: OUTREACH_WEBHOOK_SECRET not set — accepting unauthenticated webhook. NEVER allow this in production.",
      );
    } else {
      const provided = req.headers["x-webhook-secret"] || req.headers["x-api-key"];
      if (provided !== secret) {
        void logIntegrationError({
          integration: "outreach",
          area: "secret_mismatch",
          severity: "critical",
          message: "Outreach webhook arrived with wrong shared-secret header",
          statusCode: 401,
          metadata: { platform },
        });
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

      // ── V2: Reply classification + conditional pipeline ──
      if (event.eventType === "replied") {
        // Extract reply body from platform payload (field names vary)
        const replyBody = String(
          (event.rawPayload as any).reply_text ||
          (event.rawPayload as any).body ||
          (event.rawPayload as any).message ||
          (event.rawPayload as any).content ||
          ""
        );

        // Full classification: type + intent + AI next action
        const classification = await classifyReplyFull(replyBody, process.env.ANTHROPIC_API_KEY);
        const { type: replyType, intent: replyIntent, ai_next_action } = classification;

        // Store all reply intelligence fields on the campaign_prospect
        await db.update(campaignProspects)
          .set({
            reply_sentiment: replyType,
            reply_type:      replyType,
            reply_intent:    replyIntent,
            ai_next_action,
            updated_at:      new Date(),
          })
          .where(eq(campaignProspects.id, cp.id));

        if (replyType === "negative") {
          // Negative: mark prospect lost, DNC, do NOT create opportunity
          await db.update(prospects)
            .set({
              status: "lost",
              do_not_contact: true,
              dnc_reason: "negative_reply",
              updated_at: new Date(),
            })
            .where(eq(prospects.id, cp.prospect_id));

          await logEvent(
            cp.prospect_id,
            "classified_negative",
            { actor_type: "system", actor_id: null as any, actor_name: platform },
            "Reply classified as negative — prospect marked lost",
            { reply_excerpt: replyBody.slice(0, 200), intent: replyIntent, ai_next_action },
            cp.id
          );
        } else {
          // positive or neutral → update prospect status and create opportunity
          await db.update(prospects)
            .set({ status: "replied", updated_at: new Date() })
            .where(eq(prospects.id, cp.prospect_id));

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

          const classifyEvent = replyType === "positive" ? "classified_positive" : "classified_neutral";
          await logEvent(
            cp.prospect_id,
            classifyEvent,
            { actor_type: "system", actor_id: null as any, actor_name: platform },
            `Reply classified as ${replyType} (intent: ${replyIntent}) — opportunity created`,
            { reply_excerpt: replyBody.slice(0, 200), intent: replyIntent, ai_next_action },
            cp.id
          );
        }
      }

      // ── TASK 7: Auto-blacklist on bounce / unsubscribe ───
      if (["bounced", "unsubscribed", "opted_out"].includes(event.eventType)) {
        await db.update(prospects)
          .set({
            do_not_contact: true,
            dnc_reason: event.eventType,
            updated_at: new Date(),
          })
          .where(eq(prospects.id, cp.prospect_id));

        // Fetch prospect identifiers to populate blacklists
        const [pRow] = await db.select({
          primary_email: prospects.primary_email,
          website_domain: prospects.website_domain,
        }).from(prospects).where(eq(prospects.id, cp.prospect_id)).limit(1);

        if (pRow) {
          const blReason = event.eventType; // "bounced" | "unsubscribed" | "opted_out"
          if (pRow.primary_email) {
            await addToBlacklist("email", pRow.primary_email, blReason);
          }
          // Only blacklist domain on hard bounce — soft bounces leave the domain usable
          if (event.eventType === "bounced" && pRow.website_domain) {
            await addToBlacklist("domain", pRow.website_domain, blReason);
          }
        }

        // Task 9: blacklisted event
        await logEvent(
          cp.prospect_id,
          "blacklisted",
          { actor_type: "platform_webhook", actor_id: null as any, actor_name: platform },
          `Auto-blacklisted: ${event.eventType}`,
          {},
          cp.id
        );
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

  /* ═══════════════════════════════════════════
     TASK 6 — Campaign Analytics
     GET /api/admin/outbound/campaigns/:id/stats
     ═══════════════════════════════════════════ */

  app.get("/api/admin/outbound/campaigns/:id/stats", requireAdmin, async (req: Request, res: Response) => {
    const campaignId = parseInt(req.params.id);
    try {
      // All campaign_prospect rows for this campaign
      const [
        totalRow,
        sentRow,
        repliedRow,
        positiveRow,
        bounceRow,
        unsubRow,
        openedRow,
        clickedRow,
        pendingRow,
        failedRow,
      ] = await Promise.all([
        db.select({ c: sql<number>`count(*)` }).from(campaignProspects)
          .where(eq(campaignProspects.campaign_id, campaignId)),

        db.select({ c: sql<number>`count(*)` }).from(campaignProspects)
          .where(and(
            eq(campaignProspects.campaign_id, campaignId),
            sql`${campaignProspects.outreach_status} IN ('sent','opened','clicked','replied')`,
          )),

        db.select({ c: sql<number>`count(*)` }).from(campaignProspects)
          .where(and(
            eq(campaignProspects.campaign_id, campaignId),
            eq(campaignProspects.outreach_status, "replied"),
          )),

        db.select({ c: sql<number>`count(*)` }).from(campaignProspects)
          .where(and(
            eq(campaignProspects.campaign_id, campaignId),
            eq(campaignProspects.reply_sentiment, "positive"),
          )),

        db.select({ c: sql<number>`count(*)` }).from(campaignProspects)
          .where(and(
            eq(campaignProspects.campaign_id, campaignId),
            eq(campaignProspects.outreach_status, "bounced"),
          )),

        db.select({ c: sql<number>`count(*)` }).from(campaignProspects)
          .where(and(
            eq(campaignProspects.campaign_id, campaignId),
            sql`${campaignProspects.outreach_status} IN ('unsubscribed','opted_out')`,
          )),

        db.select({ c: sql<number>`count(*)` }).from(campaignProspects)
          .where(and(
            eq(campaignProspects.campaign_id, campaignId),
            sql`${campaignProspects.outreach_status} IN ('opened','clicked')`,
          )),

        db.select({ c: sql<number>`count(*)` }).from(campaignProspects)
          .where(and(
            eq(campaignProspects.campaign_id, campaignId),
            eq(campaignProspects.outreach_status, "clicked"),
          )),

        db.select({ c: sql<number>`count(*)` }).from(campaignProspects)
          .where(and(
            eq(campaignProspects.campaign_id, campaignId),
            eq(campaignProspects.sync_status, "pending"),
          )),

        db.select({ c: sql<number>`count(*)` }).from(campaignProspects)
          .where(and(
            eq(campaignProspects.campaign_id, campaignId),
            eq(campaignProspects.sync_status, "failed"),
          )),
      ]);

      const total       = Number(totalRow[0]?.c ?? 0);
      const sent        = Number(sentRow[0]?.c ?? 0);
      const replied     = Number(repliedRow[0]?.c ?? 0);
      const positive    = Number(positiveRow[0]?.c ?? 0);
      const bounced     = Number(bounceRow[0]?.c ?? 0);
      const unsubscribed = Number(unsubRow[0]?.c ?? 0);
      const opened      = Number(openedRow[0]?.c ?? 0);
      const clicked     = Number(clickedRow[0]?.c ?? 0);

      res.json({
        campaign_id: campaignId,
        total_prospects:     total,
        pending_sync:        Number(pendingRow[0]?.c ?? 0),
        failed_sync:         Number(failedRow[0]?.c ?? 0),
        sent_count:          sent,
        opened_count:        opened,
        clicked_count:       clicked,
        reply_count:         replied,
        positive_reply_count: positive,
        bounce_count:        bounced,
        unsubscribe_count:   unsubscribed,
        // Derived rates (avoid division by zero)
        reply_rate:    sent > 0 ? Number(((replied / sent) * 100).toFixed(1)) : 0,
        open_rate:     sent > 0 ? Number(((opened / sent) * 100).toFixed(1)) : 0,
        bounce_rate:   sent > 0 ? Number(((bounced / sent) * 100).toFixed(1)) : 0,
      });
    } catch (err: any) {
      console.error("[outbound] campaign stats:", err.message);
      res.status(500).json({ error: "Failed to load campaign stats" });
    }
  });

  /* ═══════════════════════════════════════════
     TASK 7 — Blacklist Management
     ═══════════════════════════════════════════ */

  // GET  /api/admin/outbound/blacklist — list all three tables
  app.get("/api/admin/outbound/blacklist", requireAdmin, async (_req, res: Response) => {
    try {
      const [domains, emails, phones] = await Promise.all([
        db.select().from(outboundBlockedDomains).orderBy(desc(outboundBlockedDomains.created_at)).limit(200),
        db.select().from(outboundBlockedEmails).orderBy(desc(outboundBlockedEmails.created_at)).limit(200),
        db.select().from(outboundBlockedPhones).orderBy(desc(outboundBlockedPhones.created_at)).limit(200),
      ]);
      res.json({ domains, emails, phones });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load blacklist" });
    }
  });

  // POST /api/admin/outbound/blacklist
  // Body: { type: "domain"|"email"|"phone", value: string, reason?: string }
  app.post("/api/admin/outbound/blacklist", requireAdmin, async (req: Request, res: Response) => {
    const { type, value, reason } = req.body as { type: string; value: string; reason?: string };
    if (!["domain", "email", "phone"].includes(type) || !value) {
      return res.status(400).json({ error: "type (domain|email|phone) and value are required" });
    }
    try {
      await addToBlacklist(type as "domain" | "email" | "phone", value, reason || "manual");
      res.status(201).json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to add to blacklist" });
    }
  });

  // DELETE /api/admin/outbound/blacklist/:type/:id
  app.delete("/api/admin/outbound/blacklist/:type/:id", requireAdmin, async (req: Request, res: Response) => {
    const { type, id } = req.params;
    const rowId = parseInt(id);
    try {
      if (type === "domain") {
        await db.delete(outboundBlockedDomains).where(eq(outboundBlockedDomains.id, rowId));
      } else if (type === "email") {
        await db.delete(outboundBlockedEmails).where(eq(outboundBlockedEmails.id, rowId));
      } else if (type === "phone") {
        await db.delete(outboundBlockedPhones).where(eq(outboundBlockedPhones.id, rowId));
      } else {
        return res.status(400).json({ error: "Invalid blacklist type" });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to remove from blacklist" });
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
