/**
 * audit_log — Wave W-AI-3c.
 *
 * General-purpose, append-only audit table. Any admin surface that mutates
 * persisted state should write a row here via `server/lib/auditLog.ts`
 * `writeAudit()`. Rows are read by the cross-cutting Audit Log admin page
 * (`/admin/audit-log`) and the per-entity `<EntityAuditWidget>`.
 *
 * Field notes:
 *   - `actor_id` is text (nullable) so we can record either the numeric
 *     `users.id` (stringified) or a non-user actor such as `'system'` or
 *     `'cron'`. Nullable because some system actions (boot-time migrations,
 *     etc.) have no actor.
 *   - `actor_type` distinguishes admin/system/user so the reader UI can
 *     style/system-filter without joining users.
 *   - `action` is a short verb: 'create', 'update', 'delete', 'archive',
 *     'unarchive', 'reset', 'rename', 'merge', 'import', 'export', etc.
 *   - `entity_type` + `entity_id` identify the touched record:
 *     ('quotequick_template', '<template_id>'), ('quotequick_trade', '<trade_id>'),
 *     ('api_key', '<key_id>'), etc.
 *   - `before` / `after` are full or sparse jsonb snapshots — callers
 *     decide the granularity. `diff` is an optional pre-computed summary
 *     so the UI doesn't have to re-derive what changed on every row.
 *
 * Append-only — no UPDATE or DELETE in the application code. Retention is
 * an ops concern (postgres pg_partman or scheduled prune).
 */

import { pgTable, bigserial, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  /** Stringified `users.id` for admin/user actions, or a system token (e.g. 'system', 'cron'). Null for boot/migration actions. */
  actor_id: text("actor_id"),
  /** 'admin' | 'system' | 'user' — drives reader UI filter + styling. */
  actor_type: text("actor_type").notNull().default("admin"),
  /** Short verb: 'create', 'update', 'delete', 'archive', 'unarchive', 'reset', 'rename', 'merge', 'import', 'export'. */
  action: text("action").notNull(),
  /** Entity namespace, e.g. 'quotequick_template', 'quotequick_trade'. */
  entity_type: text("entity_type").notNull(),
  /** Entity primary key (stringified). */
  entity_id: text("entity_id").notNull(),
  /** Full or sparse snapshot of the entity before the action. */
  before: jsonb("before").$type<unknown>(),
  /** Full or sparse snapshot of the entity after the action. */
  after: jsonb("after").$type<unknown>(),
  /** Optional summary of changed keys / shallow diff for the reader UI. */
  diff: jsonb("diff").$type<unknown>(),
  /** Free-form metadata (e.g. merge target ids, affected-template counts). */
  metadata: jsonb("metadata").$type<unknown>(),
  ip: text("ip"),
  user_agent: text("user_agent"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  created_at: true,
});

export type AuditLogRow = typeof auditLog.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
