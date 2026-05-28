/**
 * Wave 82 — sms_template_overrides
 *
 * Per-tenant override store for the central SMS template registry
 * (`shared/sms/templateRegistry.ts`). One row per `(client_id, template_id)`
 * with two optional override knobs:
 *
 *   - `enabled`        flip the send on/off
 *   - `body_override`  swap the wording (the registry's `defaultBody` stays
 *                      as the fallback when this column is NULL)
 *
 * The resolver layers this row on top of the registry default, so a tenant
 * that has never touched a template stays on the code-default. The portal
 * (Wave 83) is the only writer outside of seed/migration scripts.
 */

import { pgTable, serial, integer, text, boolean, timestamp, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const smsTemplateOverrides = pgTable(
  "sms_template_overrides",
  {
    id: serial("id").primaryKey(),
    /** Trade tenant id (`clients.id`, integer serial in this codebase). */
    client_id: integer("client_id").notNull(),
    /** Registry id slug, e.g. 'bookflow.confirmation'. */
    template_id: text("template_id").notNull(),
    /** Whether the tenant wants this send to fire. NULL row == registry default. */
    enabled: boolean("enabled").notNull().default(true),
    /** Tenant-edited body. NULL == fall back to registry `defaultBody`. */
    body_override: text("body_override"),
    /** Id of the user who last touched the row. */
    updated_by: integer("updated_by"),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqClientTemplate: unique("sms_template_overrides_client_template_key").on(
      table.client_id,
      table.template_id,
    ),
    idxClient: index("idx_sms_template_overrides_client").on(table.client_id),
  }),
);

export const insertSmsTemplateOverrideSchema = createInsertSchema(smsTemplateOverrides).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export type SmsTemplateOverride = typeof smsTemplateOverrides.$inferSelect;
export type InsertSmsTemplateOverride = z.infer<typeof insertSmsTemplateOverrideSchema>;
