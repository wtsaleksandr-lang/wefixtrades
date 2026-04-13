import {
  pgTable, text, varchar, serial, integer,
  timestamp, jsonb, uuid, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const intakeEvents = pgTable("intake_events", {
  id:              serial("id").primaryKey(),
  event_id:        uuid("event_id").notNull().unique().defaultRandom(),
  correlation_id:  varchar("correlation_id", { length: 200 }).notNull(),
  source_type:     varchar("source_type", { length: 50 }).notNull(),
  event_type:      varchar("event_type", { length: 100 }).notNull(),
  actor_type:      varchar("actor_type", { length: 20 }).notNull().default("anonymous"),
  actor_id:        integer("actor_id"),
  entity_type:     varchar("entity_type", { length: 50 }),
  entity_id:       varchar("entity_id", { length: 100 }),
  account_id:      integer("account_id"),
  event_version:   integer("event_version").notNull().default(1),
  status:          varchar("status", { length: 20 }).notNull().default("normalized"),
  raw_payload:     jsonb("raw_payload").notNull(),
  normalized_data: jsonb("normalized_data"),
  last_error:      text("last_error"),
  ip_address:      varchar("ip_address", { length: 45 }),
  user_agent:      varchar("user_agent", { length: 500 }),
  created_at:      timestamp("created_at").defaultNow().notNull(),
  normalized_at:   timestamp("normalized_at"),
}, (table) => [
  index("intake_events_status_idx").on(table.status),
  index("intake_events_source_type_idx").on(table.source_type),
  index("intake_events_event_type_idx").on(table.event_type),
  index("intake_events_correlation_id_idx").on(table.correlation_id),
  index("intake_events_created_at_idx").on(table.created_at),
  uniqueIndex("intake_events_dedup_idx").on(
    table.source_type,
    table.event_type,
    table.correlation_id,
  ),
]);

export const insertIntakeEventSchema = createInsertSchema(intakeEvents)
  .omit({ id: true, event_id: true, created_at: true });

export type InsertIntakeEvent = z.infer<typeof insertIntakeEventSchema>;
export type IntakeEvent = typeof intakeEvents.$inferSelect;
