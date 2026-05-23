/**
 * SEO Integrations — OAuth token storage + indexing history.
 *
 * Backs the admin Integrations page (/admin/integrations/google). One row
 * per connected provider in `oauth_tokens`; `seo_indexing_history` is
 * append-only audit of sitemap submissions and index requests across GSC
 * and Bing Webmaster Tools.
 *
 * Tokens at rest are encrypted via server/lib/tokenEncryption.ts using the
 * TOKEN_ENCRYPTION_KEY env var (AES-256-GCM, prefix "enc:v1:"). The
 * columns store the prefixed ciphertext; decrypt before sending to APIs.
 *
 * See migrations/0044_seo_integrations.sql.
 */

import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(), // 'google' | 'bing' | 'gbp'
    account_email: text("account_email"),
    access_token: text("access_token").notNull(), // encrypted (enc:v1:...)
    refresh_token: text("refresh_token"), // encrypted (enc:v1:...)
    expires_at: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes").array(),
    connected_at: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Single row per provider — connecting overwrites the prior token.
    providerIdx: index("oauth_tokens_provider_idx").on(table.provider),
  }),
);

export const seoIndexingHistory = pgTable(
  "seo_indexing_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull(),
    action: text("action").notNull(), // 'sitemap-submitted' | 'index-requested' | 'index-confirmed'
    source: text("source").notNull(), // 'gsc' | 'bing'
    status: text("status"),
    details: jsonb("details"),
    performed_at: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    urlIdx: index("seo_indexing_history_url_idx").on(table.url, table.performed_at),
  }),
);

export const insertOauthTokenSchema = createInsertSchema(oauthTokens).omit({
  id: true,
  connected_at: true,
  updated_at: true,
});
export type InsertOauthToken = z.infer<typeof insertOauthTokenSchema>;
export type OauthTokenRow = typeof oauthTokens.$inferSelect;

export const insertSeoIndexingHistorySchema = createInsertSchema(seoIndexingHistory).omit({
  id: true,
  performed_at: true,
});
export type InsertSeoIndexingHistory = z.infer<typeof insertSeoIndexingHistorySchema>;
export type SeoIndexingHistoryRow = typeof seoIndexingHistory.$inferSelect;
