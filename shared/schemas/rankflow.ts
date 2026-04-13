import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

/* ─── RankFlow Profiles ─── */
export const rankflowProfiles = pgTable("rankflow_profiles", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id).unique(),
  niche: text("niche"),
  location: text("location"),
  website_url: text("website_url"),
  cms_type: varchar("cms_type", { length: 50 }),
  credentials: jsonb("credentials"),
  target_services: jsonb("target_services"),
  target_locations: jsonb("target_locations"),
  plan_tier: varchar("plan_tier", { length: 20 }).notNull().default("starter"),
  enabled: boolean("enabled").notNull().default(false),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const insertRankflowProfileSchema = createInsertSchema(rankflowProfiles).omit({ id: true, created_at: true, updated_at: true });
export type InsertRankflowProfile = z.infer<typeof insertRankflowProfileSchema>;
export type RankflowProfile = typeof rankflowProfiles.$inferSelect;

/* ─── RankFlow Monthly Plans ─── */
export const rankflowMonthlyPlans = pgTable("rankflow_monthly_plans", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  month: varchar("month", { length: 7 }).notNull(),
  plan_data: jsonb("plan_data").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertRankflowMonthlyPlanSchema = createInsertSchema(rankflowMonthlyPlans).omit({ id: true, created_at: true });
export type InsertRankflowMonthlyPlan = z.infer<typeof insertRankflowMonthlyPlanSchema>;
export type RankflowMonthlyPlan = typeof rankflowMonthlyPlans.$inferSelect;

/* ─── RankFlow Tasks ─── */
export const rankflowTasks = pgTable("rankflow_tasks", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  plan_id: integer("plan_id").notNull().references(() => rankflowMonthlyPlans.id),
  type: varchar("type", { length: 30 }).notNull(),
  title: text("title").notNull(),
  instructions: text("instructions"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending | assigned | in_progress | submitted | qa_review | approved | rejected | done
  assigned_to: varchar("assigned_to", { length: 50 }),
  priority: varchar("priority", { length: 20 }).notNull().default("normal"),
  due_date: timestamp("due_date"),
  completed_at: timestamp("completed_at"),
  metadata: jsonb("metadata"),
  // Execution fields
  execution_mode: varchar("execution_mode", { length: 20 }).notNull().default("ai"),
  // ai | manual_admin | outsourced
  vendor_type: varchar("vendor_type", { length: 50 }),
  assigned_at: timestamp("assigned_at"),
  submitted_at: timestamp("submitted_at"),
  // QA fields
  qa_status: varchar("qa_status", { length: 20 }),
  // pending | passed | failed
  qa_notes: text("qa_notes"),
  // Proof & cost
  proof_data: jsonb("proof_data"),
  // { urls: string[], notes: string, screenshots?: string[] }
  estimated_cost: numeric("estimated_cost"),
  actual_cost: numeric("actual_cost"),
  rejection_reason: text("rejection_reason"),
  batch_id: integer("batch_id"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertRankflowTaskSchema = createInsertSchema(rankflowTasks).omit({ id: true, created_at: true });
export type InsertRankflowTask = z.infer<typeof insertRankflowTaskSchema>;
export type RankflowTask = typeof rankflowTasks.$inferSelect;

/* ─── RankFlow Vendor Batches ─── */
export const rankflowVendorBatches = pgTable("rankflow_vendor_batches", {
  id: serial("id").primaryKey(),
  vendor_type: varchar("vendor_type", { length: 50 }).notNull(),
  assigned_to: varchar("assigned_to", { length: 100 }),
  batch_type: varchar("batch_type", { length: 30 }).notNull(),
  // citations | backlinks | uploads | misc
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  // draft | assigned | in_progress | submitted | qa_review | completed | failed
  task_ids: jsonb("task_ids").notNull().default([]),
  dispatch_packet: jsonb("dispatch_packet"),
  proof_data: jsonb("proof_data"),
  qa_status: varchar("qa_status", { length: 20 }),
  qa_notes: text("qa_notes"),
  estimated_cost: numeric("estimated_cost"),
  actual_cost: numeric("actual_cost"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
  submitted_at: timestamp("submitted_at"),
  completed_at: timestamp("completed_at"),
});

export const insertRankflowVendorBatchSchema = createInsertSchema(rankflowVendorBatches).omit({ id: true, created_at: true, updated_at: true });
export type InsertRankflowVendorBatch = z.infer<typeof insertRankflowVendorBatchSchema>;
export type RankflowVendorBatch = typeof rankflowVendorBatches.$inferSelect;

/* ─── RankFlow QA Checks ─── */
export const rankflowQaChecks = pgTable("rankflow_qa_checks", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id").notNull().references(() => rankflowTasks.id),
  check_type: varchar("check_type", { length: 50 }),
  required: boolean("required").notNull().default(true),
  passed: boolean("passed").notNull(),
  notes: text("notes"),
  issues: jsonb("issues"),
  checked_by: varchar("checked_by", { length: 20 }).notNull().default("ai"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertRankflowQaCheckSchema = createInsertSchema(rankflowQaChecks).omit({ id: true, created_at: true });
export type InsertRankflowQaCheck = z.infer<typeof insertRankflowQaCheckSchema>;
export type RankflowQaCheck = typeof rankflowQaChecks.$inferSelect;

/* ─── RankFlow Progress ─── */
export const rankflowProgress = pgTable("rankflow_progress", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  month: varchar("month", { length: 7 }).notNull(),
  tasks_completed: integer("tasks_completed").notNull().default(0),
  pages_created: integer("pages_created").notNull().default(0),
  citations_built: integer("citations_built").notNull().default(0),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertRankflowProgressSchema = createInsertSchema(rankflowProgress).omit({ id: true, created_at: true });
export type InsertRankflowProgress = z.infer<typeof insertRankflowProgressSchema>;
export type RankflowProgress = typeof rankflowProgress.$inferSelect;

/* ─── RankFlow Keywords (Tracked) ─── */
export const rankflowKeywords = pgTable("rankflow_keywords", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  keyword: text("keyword").notNull(),
  cluster: varchar("cluster", { length: 100 }),
  priority: integer("priority").notNull().default(5),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertRankflowKeywordSchema = createInsertSchema(rankflowKeywords).omit({ id: true, created_at: true });
export type InsertRankflowKeyword = z.infer<typeof insertRankflowKeywordSchema>;
export type RankflowKeyword = typeof rankflowKeywords.$inferSelect;

/* ─── RankFlow Rankings (History) ─── */
export const rankflowRankings = pgTable("rankflow_rankings", {
  id: serial("id").primaryKey(),
  keyword_id: integer("keyword_id").notNull().references(() => rankflowKeywords.id),
  position: integer("position"),
  previous_position: integer("previous_position"),
  change: integer("change"),
  checked_at: timestamp("checked_at").defaultNow(),
});

export const insertRankflowRankingSchema = createInsertSchema(rankflowRankings).omit({ id: true });
export type InsertRankflowRanking = z.infer<typeof insertRankflowRankingSchema>;
export type RankflowRanking = typeof rankflowRankings.$inferSelect;

/* ─── RankFlow Pages (Tracked) ─── */
export const rankflowPages = pgTable("rankflow_pages", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  url: text("url").notNull(),
  target_keyword: text("target_keyword"),
  page_type: varchar("page_type", { length: 30 }),
  created_by_task_id: integer("created_by_task_id"),
  indexed: boolean("indexed").notNull().default(false),
  last_checked_at: timestamp("last_checked_at"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertRankflowPageSchema = createInsertSchema(rankflowPages).omit({ id: true, created_at: true });
export type InsertRankflowPage = z.infer<typeof insertRankflowPageSchema>;
export type RankflowPage = typeof rankflowPages.$inferSelect;

/* ─── RankFlow Signals (Summary) ─── */
export const rankflowSignals = pgTable("rankflow_signals", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id).unique(),
  total_keywords: integer("total_keywords").notNull().default(0),
  keywords_top_10: integer("keywords_top_10").notNull().default(0),
  keywords_top_20: integer("keywords_top_20").notNull().default(0),
  keywords_improved: integer("keywords_improved").notNull().default(0),
  avg_position: numeric("avg_position"),
  pages_indexed: integer("pages_indexed").notNull().default(0),
  pages_total: integer("pages_total").notNull().default(0),
  last_updated: timestamp("last_updated").defaultNow(),
});

export const insertRankflowSignalSchema = createInsertSchema(rankflowSignals).omit({ id: true });
export type InsertRankflowSignal = z.infer<typeof insertRankflowSignalSchema>;
export type RankflowSignal = typeof rankflowSignals.$inferSelect;
