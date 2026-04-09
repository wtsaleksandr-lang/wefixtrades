import { pgTable, text, varchar, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
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
  assigned_to: varchar("assigned_to", { length: 20 }).notNull().default("ai"),
  priority: varchar("priority", { length: 20 }).notNull().default("normal"),
  due_date: timestamp("due_date"),
  completed_at: timestamp("completed_at"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertRankflowTaskSchema = createInsertSchema(rankflowTasks).omit({ id: true, created_at: true });
export type InsertRankflowTask = z.infer<typeof insertRankflowTaskSchema>;
export type RankflowTask = typeof rankflowTasks.$inferSelect;

/* ─── RankFlow QA Checks ─── */
export const rankflowQaChecks = pgTable("rankflow_qa_checks", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id").notNull().references(() => rankflowTasks.id),
  passed: boolean("passed").notNull(),
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
