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
  created_at: timestamp("created_at").defaultNow(),
});

export const insertRankflowTaskSchema = createInsertSchema(rankflowTasks).omit({ id: true, created_at: true });
export type InsertRankflowTask = z.infer<typeof insertRankflowTaskSchema>;
export type RankflowTask = typeof rankflowTasks.$inferSelect;

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
