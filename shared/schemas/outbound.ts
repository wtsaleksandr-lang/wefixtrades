import {
  pgTable, text, varchar, serial, integer, timestamp,
  jsonb, boolean, decimal, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ═══════════════════════════════════════════════════
   OUTBOUND LEAD MANAGEMENT — V1 Schema
   Flow: import → enrich → review → assign → sync → pipeline
   ═══════════════════════════════════════════════════ */

/* ─── Import Batches ─── */
// Tracks each CSV / API import run for auditability
export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  source: varchar("source", { length: 50 }).notNull().default("outscraper_csv"),
  // outscraper_csv | outscraper_api | manual
  filename: text("filename"),
  total_rows: integer("total_rows").notNull().default(0),
  imported: integer("imported").notNull().default(0),
  skipped_dupes: integer("skipped_dupes").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("processing"),
  // processing | completed | failed
  imported_by: integer("imported_by"),                     // user id
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  completed_at: timestamp("completed_at"),
});
export const insertImportBatchSchema = createInsertSchema(importBatches).omit({ id: true, created_at: true });
export type InsertImportBatch = z.infer<typeof insertImportBatchSchema>;
export type ImportBatch = typeof importBatches.$inferSelect;

/* ─── Prospects ─── */
// Core lead table — one row per unique business
export const prospects = pgTable("prospects", {
  id: serial("id").primaryKey(),
  import_batch_id: integer("import_batch_id").references(() => importBatches.id),

  // Identity / dedup keys
  business_name: text("business_name").notNull(),
  primary_email: text("primary_email"),
  primary_phone: text("primary_phone"),
  website_domain: text("website_domain"),                  // normalised, no www/http — dedup key
  website_url: text("website_url"),

  // Contact info
  owner_name: text("owner_name"),
  contact_name: text("contact_name"),

  // Business attributes
  trade_category: varchar("trade_category", { length: 100 }),  // plumber | electrician | hvac …
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  country: varchar("country", { length: 50 }).default("US"),
  address: text("address"),
  zip_code: varchar("zip_code", { length: 20 }),
  google_place_id: varchar("google_place_id", { length: 200 }),
  google_maps_url: text("google_maps_url"),
  google_rating: decimal("google_rating", { precision: 3, scale: 1 }),
  google_review_count: integer("google_review_count"),

  // Source tracking
  source: varchar("source", { length: 50 }).notNull().default("outscraper"),
  source_external_id: text("source_external_id"),          // Outscraper row ID or place_id
  raw_data: jsonb("raw_data"),                             // original CSV row stored verbatim

  // Lifecycle status
  status: varchar("status", { length: 30 }).notNull().default("new"),
  // new | enriched | approved | rejected | blacklisted | campaign_queued | in_outreach | replied | lost

  // Review fields
  reviewed_by: integer("reviewed_by"),
  reviewed_at: timestamp("reviewed_at"),
  review_notes: text("review_notes"),

  // DNC / suppression
  do_not_contact: boolean("do_not_contact").notNull().default(false),
  dnc_reason: text("dnc_reason"),

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (t) => ({
  domainIdx: uniqueIndex("prospects_domain_idx").on(t.website_domain),
}));
export const insertProspectSchema = createInsertSchema(prospects).omit({ id: true, created_at: true, updated_at: true });
export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Prospect = typeof prospects.$inferSelect;

/* ─── Prospect Enrichment ─── */
// One-to-one enrichment record per prospect — holds AI + heuristic scoring
export const prospectEnrichment = pgTable("prospect_enrichment", {
  id: serial("id").primaryKey(),
  prospect_id: integer("prospect_id").notNull().references(() => prospects.id),

  // Website heuristics (rule-based, filled at import time)
  has_website: boolean("has_website"),
  website_quality_score: integer("website_quality_score"),  // 0–100
  has_quote_tool: boolean("has_quote_tool"),
  likely_owner_operator: boolean("likely_owner_operator"),

  // AI scoring (filled by enrichment job)
  quality_score: integer("quality_score"),                  // 0–100 overall fit score
  ai_personalization_line: text("ai_personalization_line"), // opening line for cold email
  ai_notes: text("ai_notes"),                              // free-form AI summary

  // Extra signals
  employee_count_estimate: varchar("employee_count_estimate", { length: 20 }),
  // solo | small (2-10) | medium (11-50)
  years_in_business: integer("years_in_business"),
  social_presence_score: integer("social_presence_score"), // 0–100

  enrichment_source: varchar("enrichment_source", { length: 30 }).default("heuristic"),
  // heuristic | ai | manual
  enriched_at: timestamp("enriched_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertProspectEnrichmentSchema = createInsertSchema(prospectEnrichment).omit({ id: true, created_at: true, updated_at: true });
export type InsertProspectEnrichment = z.infer<typeof insertProspectEnrichmentSchema>;
export type ProspectEnrichment = typeof prospectEnrichment.$inferSelect;

/* ─── Outbound Campaigns ─── */
// Represents a campaign that lives in Instantly or Smartlead
export const outboundCampaigns = pgTable("outbound_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),

  // External platform link
  platform: varchar("platform", { length: 30 }).notNull().default("instantly"),
  // instantly | smartlead
  external_campaign_id: text("external_campaign_id"),      // ID in Instantly/Smartlead
  platform_status: varchar("platform_status", { length: 30 }),
  // active | paused | completed | draft

  status: varchar("status", { length: 30 }).notNull().default("active"),
  // active | paused | archived

  // Targeting metadata
  target_trade: varchar("target_trade", { length: 100 }),
  target_region: varchar("target_region", { length: 200 }),
  sender_email: text("sender_email"),

  created_by: integer("created_by"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertOutboundCampaignSchema = createInsertSchema(outboundCampaigns).omit({ id: true, created_at: true, updated_at: true });
export type InsertOutboundCampaign = z.infer<typeof insertOutboundCampaignSchema>;
export type OutboundCampaign = typeof outboundCampaigns.$inferSelect;

/* ─── Campaign Prospects ─── */
// Junction: prospect ↔ campaign, tracks per-lead outreach state
export const campaignProspects = pgTable("campaign_prospects", {
  id: serial("id").primaryKey(),
  campaign_id: integer("campaign_id").notNull().references(() => outboundCampaigns.id),
  prospect_id: integer("prospect_id").notNull().references(() => prospects.id),

  // External platform tracking
  external_lead_id: text("external_lead_id"),              // ID assigned by Instantly/Smartlead
  sync_status: varchar("sync_status", { length: 30 }).notNull().default("pending"),
  // pending | synced | failed | removed

  // Outreach state (synced back from platform)
  outreach_status: varchar("outreach_status", { length: 30 }).notNull().default("queued"),
  // queued | sent | opened | clicked | replied | bounced | unsubscribed | opted_out

  // Reply classification (set after a reply event)
  reply_sentiment: varchar("reply_sentiment", { length: 20 }),
  // positive | neutral | negative | out_of_office | auto_reply

  emails_sent: integer("emails_sent").notNull().default(0),
  last_email_sent_at: timestamp("last_email_sent_at"),
  last_replied_at: timestamp("last_replied_at"),
  last_synced_at: timestamp("last_synced_at"),

  assigned_by: integer("assigned_by"),
  assigned_at: timestamp("assigned_at").defaultNow(),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertCampaignProspectSchema = createInsertSchema(campaignProspects).omit({ id: true, created_at: true, updated_at: true });
export type InsertCampaignProspect = z.infer<typeof insertCampaignProspectSchema>;
export type CampaignProspect = typeof campaignProspects.$inferSelect;

/* ─── Prospect Events ─── */
// Append-only audit trail: imports, status changes, outreach events, sync events
export const prospectEvents = pgTable("prospect_events", {
  id: serial("id").primaryKey(),
  prospect_id: integer("prospect_id").notNull().references(() => prospects.id),
  campaign_prospect_id: integer("campaign_prospect_id").references(() => campaignProspects.id),

  event_type: varchar("event_type", { length: 50 }).notNull(),
  // imported | enriched | approved | rejected | blacklisted |
  // campaign_assigned | synced | email_sent | email_opened | email_clicked |
  // replied | bounced | unsubscribed | pipeline_stage_changed

  actor_type: varchar("actor_type", { length: 20 }).notNull().default("system"),
  // human | ai_agent | system | platform_webhook
  actor_id: integer("actor_id"),
  actor_name: text("actor_name"),

  summary: text("summary"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertProspectEventSchema = createInsertSchema(prospectEvents).omit({ id: true, created_at: true });
export type InsertProspectEvent = z.infer<typeof insertProspectEventSchema>;
export type ProspectEvent = typeof prospectEvents.$inferSelect;

/* ─── Sales Opportunities ─── */
// One per prospect (created when a positive reply is recorded)
export const salesOpportunities = pgTable("sales_opportunities", {
  id: serial("id").primaryKey(),
  prospect_id: integer("prospect_id").notNull().references(() => prospects.id),
  campaign_prospect_id: integer("campaign_prospect_id").references(() => campaignProspects.id),

  // Pipeline stage
  stage: varchar("stage", { length: 30 }).notNull().default("positive_reply"),
  // positive_reply | booked_call | trial_started | paid | lost

  // Stage timestamps
  positive_reply_at: timestamp("positive_reply_at"),
  booked_call_at: timestamp("booked_call_at"),
  trial_started_at: timestamp("trial_started_at"),
  paid_at: timestamp("paid_at"),
  lost_at: timestamp("lost_at"),

  lost_reason: text("lost_reason"),
  estimated_value_cents: integer("estimated_value_cents"),
  notes: text("notes"),

  owner_id: integer("owner_id"),                           // sales rep (user id)
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
export const insertSalesOpportunitySchema = createInsertSchema(salesOpportunities).omit({ id: true, created_at: true, updated_at: true });
export type InsertSalesOpportunity = z.infer<typeof insertSalesOpportunitySchema>;
export type SalesOpportunity = typeof salesOpportunities.$inferSelect;
