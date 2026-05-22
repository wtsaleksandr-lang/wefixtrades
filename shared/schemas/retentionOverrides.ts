/**
 * retention_overrides — Wave BA-7.
 *
 * Admin pins for the shared-files retention sweep. One row per
 * (file_table, file_id) pair. When the sweep finds a row in a covered
 * table that is older than the default 180-day window, it checks here
 * first — a matching override with `retained_until` in the future
 * (or null = indefinite) skips the soft-delete.
 *
 * Migration: 0033_shared_files_retention.sql.
 * Cron:       server/jobs/sharedFilesRetentionSweepWorker.ts
 * Endpoints: POST/DELETE /api/admin/files/:file_table/:file_id/retain
 *
 * NB. `file_table` is varchar (not enum) so BA-7b can plug new tables in
 * without a follow-on migration.
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./db";

export const retentionOverrides = pgTable(
  "retention_overrides",
  {
    id: serial("id").primaryKey(),
    /** Source table the override applies to, e.g. 'voicemails'. */
    file_table: varchar("file_table", { length: 64 }).notNull(),
    /** Stringified primary key from the source table. */
    file_id: varchar("file_id", { length: 64 }).notNull(),
    /** When the row becomes sweep-eligible again. NULL = indefinite. */
    retained_until: timestamp("retained_until"),
    reason: text("reason").notNull().default(""),
    created_by_admin_id: integer("created_by_admin_id").references(() => users.id, {
      onDelete: "set null",
    }),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    fileTableFileIdUnique: uniqueIndex("retention_overrides_table_file_unique").on(
      table.file_table,
      table.file_id,
    ),
    fileTableIdx: index("retention_overrides_table_idx").on(table.file_table),
    retainedUntilIdx: index("retention_overrides_retained_until_idx").on(table.retained_until),
  }),
);

export const insertRetentionOverrideSchema = createInsertSchema(retentionOverrides).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertRetentionOverride = z.infer<typeof insertRetentionOverrideSchema>;
export type RetentionOverride = typeof retentionOverrides.$inferSelect;
