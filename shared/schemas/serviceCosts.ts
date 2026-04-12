import { pgTable, varchar, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

/**
 * Service cost tracking — logs per-action costs for profitability analysis.
 * Used by SocialSync, ReputationShield, and future services.
 */
export const serviceCostLogs = pgTable("service_cost_logs", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clients.id),
  service: varchar("service", { length: 30 }).notNull(),
  // socialsync | reputationshield | tradeline | etc.
  cost_type: varchar("cost_type", { length: 30 }).notNull(),
  // ai_content | ai_image | ai_review_reply | ai_quality | sms | email | infra
  amount_micro_usd: integer("amount_micro_usd").notNull(),     // USD × 1,000,000 for precision
  description: varchar("description", { length: 200 }),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});
export const insertServiceCostLogSchema = createInsertSchema(serviceCostLogs).omit({ id: true, created_at: true });
export type InsertServiceCostLog = z.infer<typeof insertServiceCostLogSchema>;
export type ServiceCostLog = typeof serviceCostLogs.$inferSelect;
