/**
 * client_email_identities
 *
 * Per-client sender identity for outbound transactional + lifecycle email.
 *
 * Default (Starter tier): sender is `em.wefixtrades.com` with the trade's
 * business name in the display field. Customers see "Joe's Plumbing" but
 * the actual envelope/From is our shared subdomain.
 *
 * Pro tier (verified via clientHasProAccess): can claim their own custom
 * domain. Verification requires SPF, DKIM, and DMARC TXT records on
 * their DNS. Daily DNS check (or manual "Verify now" click) flips
 * custom_domain_verified_at.
 *
 * Per-send selection happens in emailTransport — look up the client's
 * row, pick wefixtrades_subdomain (default) or custom_domain (if verified).
 */

import { pgTable, serial, integer, varchar, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

export const clientEmailIdentities = pgTable(
  "client_email_identities",
  {
    id: serial("id").primaryKey(),
    client_id: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** What customers see in their inbox (e.g. "Joe's Plumbing") */
    display_name: text("display_name").notNull(),
    /** Pro-tier custom domain (e.g. "joesplumbing.com"). NULL = use wefixtrades subdomain */
    custom_domain: varchar("custom_domain", { length: 253 }),
    /** Set when SPF + DKIM + DMARC verification all pass; NULL = unverified */
    custom_domain_verified_at: timestamp("custom_domain_verified_at", { withTimezone: true }),
    /** 'wefixtrades_subdomain' (default) or 'custom_domain' (Pro, after verify) */
    sending_method: varchar("sending_method", { length: 32 }).notNull().default("wefixtrades_subdomain"),
    /** Last attempted verification — useful for "you tried 5 min ago, wait" UI */
    last_verify_attempt_at: timestamp("last_verify_attempt_at", { withTimezone: true }),
    /** Reason verification failed last time — surfaced in the portal UI */
    last_verify_error: text("last_verify_error"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqClient: unique("client_email_identities_client_id_key").on(table.client_id),
  }),
);

export const insertClientEmailIdentitySchema = createInsertSchema(clientEmailIdentities).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type ClientEmailIdentity = typeof clientEmailIdentities.$inferSelect;
export type InsertClientEmailIdentity = z.infer<typeof insertClientEmailIdentitySchema>;

export const SENDING_METHODS = ["wefixtrades_subdomain", "custom_domain"] as const;
export type SendingMethod = (typeof SENDING_METHODS)[number];
