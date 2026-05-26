/**
 * Wave 34 — Universal AI-action-with-approval audit log schema.
 *
 * Backs the central dispatcher (`server/services/aiActions/dispatcher.ts`).
 * Every action attempted via either the new universal
 * `POST /api/ai-actions/dispatch` endpoint OR the legacy per-product
 * `POST /api/portal/<product>/run-action` endpoints writes one row here.
 *
 * Mirrors migrations/0067_ai_action_audit_log.sql exactly. Drizzle-kit
 * schema-drift check compares this table definition against the migrated
 * DB shape on every deploy.
 */

import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  jsonb,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const aiActionAuditLog = pgTable(
  "ai_action_audit_log",
  {
    id: serial("id").primaryKey(),
    /** Nullable: admin-context system actions may not have a client. */
    client_id: integer("client_id"),
    product: varchar("product", { length: 48 }).notNull(),
    /** 'portal' | 'admin' */
    context: varchar("context", { length: 16 }).notNull(),
    action_key: varchar("action_key", { length: 96 }).notNull(),
    /** Sanitised params snapshot — secrets must be stripped server-side. */
    params: jsonb("params"),
    result_payload: jsonb("result_payload"),
    success: boolean("success").notNull().default(false),
    error_message: text("error_message"),
    /** 'user_click' | 'auto_approved' */
    triggered_by: varchar("triggered_by", { length: 24 })
      .notNull()
      .default("user_click"),
    /** Customer OR admin user id. */
    user_id: integer("user_id"),
    /** The originating AI recommendation id, when applicable. */
    recommendation_id: varchar("recommendation_id", { length: 200 }),
    recorded_at: timestamp("recorded_at").defaultNow().notNull(),
  },
  (t) => ({
    // Index names match migrations/0067_ai_action_audit_log.sql so
    // drizzle-kit push doesn't propose to drop+recreate them.
    clientRecordedIdx: index("idx_ai_action_audit_log_client_recorded").on(
      t.client_id,
      t.recorded_at,
    ),
    productIdx: index("idx_ai_action_audit_log_product").on(
      t.product,
      t.recorded_at,
    ),
    actionKeyIdx: index("idx_ai_action_audit_log_action_key").on(t.action_key),
    recordedAtIdx: index("idx_ai_action_audit_log_recorded_at").on(
      t.recorded_at,
    ),
  }),
);

export const insertAiActionAuditLogSchema = createInsertSchema(
  aiActionAuditLog,
).omit({ id: true, recorded_at: true });
export type InsertAiActionAuditLog = z.infer<
  typeof insertAiActionAuditLogSchema
>;
export type AiActionAuditLog = typeof aiActionAuditLog.$inferSelect;
