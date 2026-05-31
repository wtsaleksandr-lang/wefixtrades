import {
  pgTable, text, varchar, serial, integer, timestamp,
  jsonb, boolean, decimal, uniqueIndex, index,
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

  // ── TASK 1: Strong dedup ──────────────────────────────
  // sha256( normalize(name) + "|" + normalize(city) + "|" + digitsOnly(phone) )
  // Non-unique index — old rows pre-dating this column have NULL and stay valid.
  // Import code enforces uniqueness in application logic.
  dedupe_fingerprint: varchar("dedupe_fingerprint", { length: 64 }),

  // ── TASK 2: Contact confidence ────────────────────────
  // high   = domain email matching website (john@acmeplumbing.com)
  // medium = generic domain email (info@acmeplumbing.com) or unknown business domain
  // low    = free provider (gmail/yahoo/hotmail)
  // none   = no email at all
  contact_confidence: varchar("contact_confidence", { length: 10 }).default("none"),

  // ── V2: Offer targeting & priority ───────────────────
  // Rule-based offer match: quotequick | reputationshield | socialsync | tradeline | custom
  target_offer: varchar("target_offer", { length: 30 }),
  // 0–100 deterministic priority score (higher = push sooner)
  priority_score: integer("priority_score"),

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
  fingerprintIdx: index("prospects_fingerprint_idx").on(t.dedupe_fingerprint),
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

  // ── V2: Conversion-focused AI fields ─────────────────
  ai_reason_to_target: text("ai_reason_to_target"),         // why this specific lead fits our offer
  ai_first_line: text("ai_first_line"),                     // refined opening line (replaces ai_personalization_line)
  ai_offer_angle: text("ai_offer_angle"),                   // which product angle resonates for this business
  ai_cta_variant: text("ai_cta_variant"),                   // suggested CTA: "book a call" | "see demo" | "free audit" etc.

  // Extra signals
  employee_count_estimate: varchar("employee_count_estimate", { length: 20 }),
  // solo | small (2-10) | medium (11-50)
  years_in_business: integer("years_in_business"),
  social_presence_score: integer("social_presence_score"), // 0–100

  enrichment_source: varchar("enrichment_source", { length: 30 }).default("heuristic"),
  // heuristic | ai | manual
  enriched_at: timestamp("enriched_at"),

  // ── Artifact-first outbound (0076) ────────────────────
  // A real local-visibility audit generated for THIS prospect's business,
  // hosted at a public /audit/report/<id> link, merged into the cold email.
  artifact_type: text("artifact_type"),                      // 'audit' (future: 'calculator')
  artifact_status: text("artifact_status").default("pending"),// pending | generated | failed | skipped
  artifact_ref_id: text("artifact_ref_id"),                  // audit_reports.id (uuid)
  artifact_url: text("artifact_url"),                        // public report link
  artifact_score: integer("artifact_score"),                // audit total 0-100 (merge field)
  artifact_grade: text("artifact_grade"),                   // letter grade A-F (merge field)
  artifact_headline: text("artifact_headline"),             // one-line finding for the email
  artifact_generated_at: timestamp("artifact_generated_at"),
  artifact_error: text("artifact_error"),
  artifact_viewed_at: timestamp("artifact_viewed_at"),      // first report open = buy signal
  artifact_view_count: integer("artifact_view_count").default(0),

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Declared here to match migration 0076 (schema-drift guard) — the worker
  // scans by artifact_status; the report-view buy-signal looks up by ref id.
  artifactStatusIdx: index("prospect_enrichment_artifact_status_idx").on(table.artifact_status),
  artifactRefIdx: index("prospect_enrichment_artifact_ref_idx").on(table.artifact_ref_id),
}));
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

  // ── TASK 3: Send rate limits ──────────────────────────
  // Caps on how many leads are pushed to the outreach platform per time window.
  // These control Instantly/Smartlead account safety, not the email send rate.
  daily_send_limit: integer("daily_send_limit").notNull().default(40),
  hourly_send_limit: integer("hourly_send_limit").notNull().default(10),

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

  // ── V2: Richer reply intelligence ────────────────────
  reply_type: varchar("reply_type", { length: 20 }),
  // positive | neutral | negative
  reply_intent: varchar("reply_intent", { length: 30 }),
  // interested | not_now | objection | referral | unsubscribe | unclear
  ai_next_action: text("ai_next_action"),                   // AI recommended next step for sales rep

  emails_sent: integer("emails_sent").notNull().default(0),
  last_email_sent_at: timestamp("last_email_sent_at"),
  last_replied_at: timestamp("last_replied_at"),
  last_synced_at: timestamp("last_synced_at"),

  // ── TASK 4: Retry / cooldown ──────────────────────────
  last_contacted_at: timestamp("last_contacted_at"),
  next_retry_at: timestamp("next_retry_at"),
  retry_count: integer("retry_count").notNull().default(0),

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
  // imported | dedup_skipped | enriched | approved | rejected | blacklisted |
  // campaign_assigned | blocked_low_confidence | blocked_blacklist |
  // sent_to_platform | replied | classified_positive | classified_neutral |
  // classified_negative | bounced | unsubscribed | pipeline_stage_changed |
  // retry_queued | retry_skipped

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
// One per prospect (created when a positive/neutral reply is recorded)
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

/* ═══════════════════════════════════════════════════
   SEQUENCE TEMPLATES — multi-step cold-email copy

   One template per campaign (or unattached, for reusable libraries).
   Each template holds N steps (intro + followups). Subject lines are
   stored as JSONB arrays so we can A/B per recipient at send time.

   AI personalization (per-prospect first lines, offer angles) lives on
   prospect_enrichment — Smartlead substitutes those as custom merge
   fields. The `ai_personalize` flag on a template signals "this template
   uses AI tokens" but the AI call itself is NOT yet wired (see
   adminOutreachSequencesRoutes for the TODO).
   ═══════════════════════════════════════════════════ */

export const outreachSequences = pgTable("outreach_sequences", {
  id: serial("id").primaryKey(),
  campaign_id: integer("campaign_id").references(() => outboundCampaigns.id),

  name: text("name").notNull(),
  trade_filter: varchar("trade_filter", { length: 100 }),         // restrict to one trade (nullable = all)
  region_filter: varchar("region_filter", { length: 200 }),       // free-text region selector

  // Generation inputs — kept for audit + future regeneration
  icp: text("icp"),
  pain_point: text("pain_point"),
  offer: text("offer"),
  sender_persona: text("sender_persona"),
  tone: varchar("tone", { length: 30 }).default("direct"),

  // Whether this template uses per-recipient AI-generated tokens
  // (ai_first_line, ai_offer_angle, etc. from prospect_enrichment).
  // The Anthropic call to populate those is OUT OF SCOPE for this wave —
  // see ai_personalize TODO in adminOutreachSequencesRoutes.ts.
  ai_personalize: boolean("ai_personalize").notNull().default(false),

  status: varchar("status", { length: 20 }).notNull().default("draft"),
  // draft | active | archived

  owner_id: integer("owner_id"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (t) => ({
  campaignIdx: index("outreach_sequences_campaign_idx").on(t.campaign_id),
  statusIdx: index("outreach_sequences_status_idx").on(t.status),
}));
export const insertOutreachSequenceSchema = createInsertSchema(outreachSequences).omit({ id: true, created_at: true, updated_at: true });
export type InsertOutreachSequence = z.infer<typeof insertOutreachSequenceSchema>;
export type OutreachSequence = typeof outreachSequences.$inferSelect;

export const outreachSequenceSteps = pgTable("outreach_sequence_steps", {
  id: serial("id").primaryKey(),
  sequence_id: integer("sequence_id").notNull()
    .references(() => outreachSequences.id, { onDelete: "cascade" }),

  order_index: integer("order_index").notNull(),                  // 1 = intro, 2-N = followups
  delay_days: integer("delay_days").notNull().default(0),         // days after previous step

  subject_template: text("subject_template").notNull(),           // plain text, {{token}} placeholders
  body_template: text("body_template").notNull(),                 // plain text, {{token}} placeholders
  ai_personalize: boolean("ai_personalize").notNull().default(false),

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (t) => ({
  sequenceOrderIdx: uniqueIndex("outreach_sequence_steps_seq_order_idx").on(t.sequence_id, t.order_index),
}));
export const insertOutreachSequenceStepSchema = createInsertSchema(outreachSequenceSteps).omit({ id: true, created_at: true, updated_at: true });
export type InsertOutreachSequenceStep = z.infer<typeof insertOutreachSequenceStepSchema>;
export type OutreachSequenceStep = typeof outreachSequenceSteps.$inferSelect;

/* ═══════════════════════════════════════════════════
   TASK 7 — Global Blacklist Tables
   Three separate tables for O(1) lookup by type.
   onConflictDoNothing used on insert to make upserts safe.
   ═══════════════════════════════════════════════════ */

export const outboundBlockedDomains = pgTable("outbound_blocked_domains", {
  id: serial("id").primaryKey(),
  domain: varchar("domain", { length: 253 }).notNull().unique(),
  reason: text("reason"),                   // "bounce" | "unsubscribe" | "manual" | …
  created_at: timestamp("created_at").defaultNow(),
});
export type BlockedDomain = typeof outboundBlockedDomains.$inferSelect;

export const outboundBlockedEmails = pgTable("outbound_blocked_emails", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  reason: text("reason"),
  created_at: timestamp("created_at").defaultNow(),
});
export type BlockedEmail = typeof outboundBlockedEmails.$inferSelect;

export const outboundBlockedPhones = pgTable("outbound_blocked_phones", {
  id: serial("id").primaryKey(),
  phone: varchar("phone", { length: 30 }).notNull().unique(),   // digits only, normalised
  reason: text("reason"),
  created_at: timestamp("created_at").defaultNow(),
});
export type BlockedPhone = typeof outboundBlockedPhones.$inferSelect;
