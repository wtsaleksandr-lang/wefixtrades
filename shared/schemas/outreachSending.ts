import {
  pgTable,
  serial,
  varchar,
  integer,
  real,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ─── Outreach sending-domain pool (Lane OA) ─────────────────────────────
   Cold outreach NEVER sends from wefixtrades.com or any of its subdomains
   (hard denylist enforced in server/services/sending/sendingDomainPool.ts
   at insert AND at campaign verify-link). Each row is one purchased
   lookalike sending domain whose mailboxes live in Smartlead.

   Lifecycle: warming → active → paused (recoverable) | burned (terminal).
   Health (bounce_rate / complaint_rate) is synced from Smartlead campaign
   analytics over a trailing 7-day window; auto-pause fires at
   bounce > 3% or complaint > 0.1%.
*/

export const SENDING_DOMAIN_STATUSES = [
  "warming",
  "active",
  "paused",
  "burned",
] as const;
export type SendingDomainStatus = (typeof SENDING_DOMAIN_STATUSES)[number];

export const sendingDomainStatusSchema = z.enum(SENDING_DOMAIN_STATUSES);

export const outreachSendingDomains = pgTable(
  "outreach_sending_domains",
  {
    id: serial("id").primaryKey(),
    domain: varchar("domain", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("warming"),
    // warming | active | paused | burned
    warmup_started_at: timestamp("warmup_started_at"),
    daily_cap: integer("daily_cap").notNull().default(20),
    // Trailing-7-day rates synced from Smartlead analytics, stored as
    // fractions (0.03 = 3%), NOT percentages.
    bounce_rate: real("bounce_rate").notNull().default(0),
    complaint_rate: real("complaint_rate").notNull().default(0),
    paused_reason: text("paused_reason"),
    last_synced_at: timestamp("last_synced_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    domainUq: uniqueIndex("outreach_sending_domains_domain_uq").on(table.domain),
    statusIdx: index("outreach_sending_domains_status_idx").on(table.status),
  }),
);

export const insertOutreachSendingDomainSchema = createInsertSchema(
  outreachSendingDomains,
)
  .omit({ id: true, created_at: true, updated_at: true })
  .extend({
    domain: z
      .string()
      .min(4)
      .max(255)
      .regex(
        /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i,
        "must be a bare domain like example.com (no scheme, no path)",
      ),
    status: sendingDomainStatusSchema.optional(),
    daily_cap: z.number().int().min(1).max(2000).optional(),
  });
export type InsertOutreachSendingDomain = z.infer<
  typeof insertOutreachSendingDomainSchema
>;
export type OutreachSendingDomain = typeof outreachSendingDomains.$inferSelect;
