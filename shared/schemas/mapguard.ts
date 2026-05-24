import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, uuid, doublePrecision, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients, clientServices } from "./adminCrm";
import { auditReports } from "./db";

/* ═══════════════════════════════════════════
   MapGuard Task Engine
   ═══════════════════════════════════════════
   Dedicated task table for MapGuard's hybrid
   automation + service execution model.

   Separate from fulfillment_tasks because:
   - Structured task types (not free-text checklists)
   - Audit-derived creation with input/output data
   - Supplier routing metadata as first-class columns
   - Validation rules for result verification
   - More granular status lifecycle
   ═══════════════════════════════════════════ */

export const mapguardTasks = pgTable("mapguard_tasks", {
  id: serial("id").primaryKey(),

  /* ─── Ownership ─── */
  client_id: integer("client_id").notNull().references(() => clients.id),
  client_service_id: integer("client_service_id").references(() => clientServices.id),
  audit_report_id: uuid("audit_report_id").references(() => auditReports.id),

  /* ─── Task Identity ─── */
  task_type: varchar("task_type", { length: 50 }).notNull(),
  // baseline_audit_review | gbp_optimization | citation_cleanup | review_issue_response
  // competitor_reaction | profile_content_update | suspension_support
  // monthly_report_review | manual_followup | photo_upload | post_scheduling
  title: text("title").notNull(),
  description: text("description"),

  /* ─── Source & Origin ─── */
  source_type: varchar("source_type", { length: 30 }).notNull().default("manual"),
  // audit | monitoring | manual | competitor | review | system
  created_by_system: boolean("created_by_system").notNull().default(false),

  /* ─── Lifecycle ─── */
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  // pending | upcoming | ready | in_progress | waiting_supplier | waiting_client
  // needs_review | blocked | completed | cancelled
  priority: varchar("priority", { length: 20 }).notNull().default("normal"),
  // low | normal | high | urgent
  sort_order: integer("sort_order").notNull().default(0),

  /* ─── Operational Guidance ─── */
  waiting_on: varchar("waiting_on", { length: 20 }),
  // internal | supplier | client | system | null
  next_step_hint: text("next_step_hint"),
  // Human-readable guidance for what should happen next

  /* ─── Scheduling ─── */
  scheduled_for: timestamp("scheduled_for"),
  due_at: timestamp("due_at"),
  completed_at: timestamp("completed_at"),

  /* ─── Structured Data ─── */
  input_data: jsonb("input_data"),
  // Context needed to execute this task (audit findings, profile data, etc.)
  expected_output: jsonb("expected_output"),
  // What a completed task should produce (description fields, photo count, etc.)
  validation_rules: jsonb("validation_rules"),
  // Rules for verifying result quality (min word count, required fields, etc.)
  result_data: jsonb("result_data"),
  // Actual output from execution (supplier deliverable, AI output, etc.)

  /* ─── Supplier Routing (future-ready) ─── */
  supplier_type: varchar("supplier_type", { length: 30 }),
  // fiverr | agency | manual | automation | null
  supplier_ref: text("supplier_ref"),
  // External reference (Fiverr order ID, agency ticket, etc.)
  assigned_to: text("assigned_to"),
  // Internal user or external supplier name
  cost_cents: integer("cost_cents"),

  /* ─── Metadata ─── */
  escalation_flag: boolean("escalation_flag").notNull().default(false),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const insertMapguardTaskSchema = createInsertSchema(mapguardTasks).omit({
  id: true, created_at: true, updated_at: true,
});
export type InsertMapguardTask = z.infer<typeof insertMapguardTaskSchema>;
export type MapguardTask = typeof mapguardTasks.$inferSelect;

/* ─── MapGuard Task Activity Log ─── */
export const mapguardTaskActivity = pgTable("mapguard_task_activity", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id").notNull().references(() => mapguardTasks.id),
  action: varchar("action", { length: 50 }).notNull(),
  // created | status_changed | assigned | result_attached | escalated | note_added | completed | cancelled
  actor_type: varchar("actor_type", { length: 20 }).notNull().default("system"),
  // human | ai_agent | system | supplier
  actor_name: text("actor_name"),
  from_status: varchar("from_status", { length: 30 }),
  to_status: varchar("to_status", { length: 30 }),
  summary: text("summary"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertMapguardTaskActivitySchema = createInsertSchema(mapguardTaskActivity).omit({
  id: true, created_at: true,
});
export type InsertMapguardTaskActivity = z.infer<typeof insertMapguardTaskActivitySchema>;
export type MapguardTaskActivity = typeof mapguardTaskActivity.$inferSelect;

/* ═══════════════════════════════════════════
   map_snapshots — Wave BF-6
   ═══════════════════════════════════════════
   Publicly shareable GBP rank-grid + audit
   snapshots from the free /tools/map-snapshot
   page. Currently consumed via raw SQL in
   server/routes/mapSnapshotRoutes.ts, but the
   Drizzle definition MUST exist here so
   drizzle-kit push sees the table and does not
   propose DROP TABLE / DROP INDEX against it
   in production. Schema must match
   migrations/0034_map_snapshots.sql exactly.
   ═══════════════════════════════════════════ */
export const mapSnapshots = pgTable(
  "map_snapshots",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 32 }).notNull().unique(),
    business_name: varchar("business_name", { length: 200 }).notNull(),
    business_address: varchar("business_address", { length: 400 }),
    location_lat: doublePrecision("location_lat").notNull(),
    location_lng: doublePrecision("location_lng").notNull(),
    keywords_json: jsonb("keywords_json").notNull().default(sql`'[]'::jsonb`),
    heatmap_json: jsonb("heatmap_json").notNull().default(sql`'[]'::jsonb`),
    audit_json: jsonb("audit_json").notNull().default(sql`'[]'::jsonb`),
    source: varchar("source", { length: 16 }).notNull().default("mock"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Names + directions must match migrations/0034_map_snapshots.sql:
    //   CREATE INDEX idx_map_snapshots_slug    ON map_snapshots(slug);
    //   CREATE INDEX idx_map_snapshots_created ON map_snapshots(created_at DESC);
    // Postgres default for DESC is NULLS FIRST. Drizzle's `.desc()` alone
    // emits `DESC NULLS LAST`, which does NOT match the live index and
    // makes drizzle-kit propose drop+recreate on every deploy. The
    // `.nullsFirst()` chain pins the schema to the same NULL ordering
    // Postgres chose when the migration ran with bare `DESC`.
    slugIdx: index("idx_map_snapshots_slug").on(t.slug),
    createdIdx: index("idx_map_snapshots_created").on(
      t.created_at.desc().nullsFirst(),
    ),
  }),
);
export type MapSnapshot = typeof mapSnapshots.$inferSelect;
