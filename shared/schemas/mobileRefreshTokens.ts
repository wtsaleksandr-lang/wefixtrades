/**
 * mobile_refresh_tokens
 *
 * Refresh-token store for the React Native softphone app. Access tokens
 * are short-lived JWTs (15 min); refresh tokens are 32-byte random opaque
 * strings stored as SHA256 hashes (we never persist the plaintext).
 *
 * Each refresh issue ROTATES the refresh token — the old row is marked
 * revoked_at and a new row is inserted. A reused (already-revoked) refresh
 * token signals theft and triggers logout-all for that user.
 *
 * Rows are purged via cron 30 days after expires_at — out of scope for
 * the initial wire-up.
 */

import { pgTable, serial, integer, varchar, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./db";

export const mobileRefreshTokens = pgTable(
  "mobile_refresh_tokens",
  {
    id: serial("id").primaryKey(),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA256 hex of the refresh token. 64 chars. */
    token_hash: varchar("token_hash", { length: 64 }).notNull().unique(),
    /** Self-reported device label or User-Agent excerpt — useful for log-out-from. */
    device_label: varchar("device_label", { length: 200 }),
    /** Initial issue. */
    created_at: timestamp("created_at").notNull().defaultNow(),
    /** Bumped on every /refresh — lets us detect inactive tokens. */
    last_used_at: timestamp("last_used_at").notNull().defaultNow(),
    /** Set on rotation (normal) or by /logout / /logout-all. */
    revoked_at: timestamp("revoked_at"),
    /** Hard expiry; even if not used, becomes invalid after this. */
    expires_at: timestamp("expires_at").notNull(),
    /** Optional: IP at issue, for audit. */
    issued_ip: varchar("issued_ip", { length: 45 }),
  },
  (table) => ({
    tokenHashIdx: index("idx_mrt_token_hash").on(table.token_hash),
    userActiveIdx: index("idx_mrt_user_active").on(table.user_id, table.revoked_at),
  }),
);

export const insertMobileRefreshTokenSchema = createInsertSchema(mobileRefreshTokens).omit({
  id: true,
  created_at: true,
  last_used_at: true,
});
export type InsertMobileRefreshToken = z.infer<typeof insertMobileRefreshTokenSchema>;
export type MobileRefreshToken = typeof mobileRefreshTokens.$inferSelect;
