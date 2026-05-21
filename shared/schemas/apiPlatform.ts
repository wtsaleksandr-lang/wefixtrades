/**
 * API Platform (Wave AJ-2 — Phase 1 foundation)
 *
 * Tables that back the public API platform for WeFixTrades tools. Developers
 * subscribe to a tier, get an API key (wfx_live_… / wfx_test_…), hit endpoints,
 * and are rate-limited + billed against a monthly quota.
 *
 * This phase ships the schemas, key-storage rules, and rate-limit primitives.
 * Stripe billing wiring, customer-facing UIs, and the actual API endpoints
 * for QuoteQuick are wired in subsequent phases.
 *
 * Security notes:
 *  - api_keys.hash is the SHA-256 of the full plaintext key. The plaintext
 *    is shown to the user EXACTLY ONCE at creation/rotation and never
 *    stored. Auth lookups compare hashes.
 *  - api_keys.prefix is the first 12 chars of the plaintext key (e.g.
 *    "wfx_live_ab") — safe to render in lists for human ID.
 *  - api_usage_logs is a high-volume table. user_id is denormalized to
 *    avoid a join for user-scoped aggregations. The (key_id, created_at)
 *    and (user_id, created_at) composite indexes carry the common queries.
 */

import {
  pgTable,
  text,
  varchar,
  integer,
  bigserial,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./db";

/* ─── api_keys ─────────────────────────────────────────────────────── */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(), // cuid generated in app layer
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** User-supplied label, e.g. "Production app" */
    name: text("name").notNull(),
    /** First 12 chars of the plaintext key (e.g. "wfx_live_ab"). Safe to display. */
    prefix: varchar("prefix", { length: 24 }).notNull(),
    /** SHA-256 hex of the full key. 64 chars. Used for lookup. */
    hash: varchar("hash", { length: 64 }).notNull(),
    /** Tier id from API_TIERS (free | starter | growth | scale | enterprise). */
    tier: varchar("tier", { length: 30 }).notNull().default("free"),
    /** active | disabled | revoked */
    status: varchar("status", { length: 20 }).notNull().default("active"),
    last_used_at: timestamp("last_used_at"),
    total_calls: integer("total_calls").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    expires_at: timestamp("expires_at"),
    /** Free-form admin notes, ip_allowlist, environment ("live" | "test"), etc. */
    metadata: jsonb("metadata"),
  },
  (t) => ({
    hashIdx: uniqueIndex("idx_api_keys_hash").on(t.hash),
    userIdx: index("idx_api_keys_user").on(t.user_id),
    statusIdx: index("idx_api_keys_status").on(t.status),
  }),
);

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  created_at: true,
  last_used_at: true,
  total_calls: true,
});
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

/* ─── api_subscriptions ─────────────────────────────────────────────── */
export const apiSubscriptions = pgTable(
  "api_subscriptions",
  {
    id: text("id").primaryKey(), // cuid generated in app layer
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: varchar("tier", { length: 30 }).notNull().default("free"),
    /** trial | active | past_due | cancelled | paused */
    status: varchar("status", { length: 20 }).notNull().default("trial"),
    stripe_subscription_id: text("stripe_subscription_id"),
    stripe_customer_id: text("stripe_customer_id"),
    current_period_start: timestamp("current_period_start").notNull().defaultNow(),
    current_period_end: timestamp("current_period_end").notNull(),
    /** Cached from tier definition so middleware doesn't have to look it up. */
    monthly_call_quota: integer("monthly_call_quota").notNull().default(0),
    monthly_calls_used: integer("monthly_calls_used").notNull().default(0),
    /** Wall-clock time when monthly_calls_used resets to 0. */
    reset_at: timestamp("reset_at").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // One active subscription per user. Relaxed via app-level guard if we
    // later need to support upgrade-in-flight (new + old coexist briefly).
    userIdx: uniqueIndex("idx_api_subscriptions_user").on(t.user_id),
  }),
);

export const insertApiSubscriptionSchema = createInsertSchema(apiSubscriptions).omit({
  created_at: true,
  updated_at: true,
});
export type InsertApiSubscription = z.infer<typeof insertApiSubscriptionSchema>;
export type ApiSubscription = typeof apiSubscriptions.$inferSelect;

/* ─── api_usage_logs ───────────────────────────────────────────────────
 * High-volume. One row per authenticated API call. Writes are async — the
 * middleware fires-and-forgets after the response is sent so request
 * latency isn't coupled to log-write latency.
 *
 * Partition strategy: not yet partitioned. Phase 2 will add a monthly
 * partition + retention policy. For now (TODO) periodic prune via cron.
 * ─────────────────────────────────────────────────────────────────── */
export const apiUsageLogs = pgTable(
  "api_usage_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    key_id: text("key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    /** Denormalized from api_keys.user_id for fast user-scoped aggregations. */
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    method: varchar("method", { length: 10 }).notNull(),
    status_code: integer("status_code").notNull(),
    response_ms: integer("response_ms").notNull(),
    bytes_out: integer("bytes_out"),
    ip: varchar("ip", { length: 45 }),
    user_agent: text("user_agent"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    keyTimeIdx: index("idx_api_usage_key_created").on(t.key_id, t.created_at),
    userTimeIdx: index("idx_api_usage_user_created").on(t.user_id, t.created_at),
  }),
);

export const insertApiUsageLogSchema = createInsertSchema(apiUsageLogs).omit({
  id: true,
  created_at: true,
});
export type InsertApiUsageLog = z.infer<typeof insertApiUsageLogSchema>;
export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;

/* ─── api_rate_limit_buckets ───────────────────────────────────────────
 * Token-bucket state per key. The middleware does an atomic
 * read-refill-decrement in a transaction. If a Redis backend is
 * available later we'll move this hot path off Postgres; for now the
 * DB carries the buckets so the system is stateless across instances.
 *
 * The PK is key_id (one bucket per key, never more).
 * ─────────────────────────────────────────────────────────────────── */
export const apiRateLimitBuckets = pgTable("api_rate_limit_buckets", {
  key_id: text("key_id")
    .primaryKey()
    .references(() => apiKeys.id, { onDelete: "cascade" }),
  tokens: integer("tokens").notNull(),
  /** Tokens per second added to the bucket. tier.rateLimitPerMinute / 60. */
  refill_rate_per_sec: integer("refill_rate_per_sec").notNull(),
  /** Max bucket size — equals tier.rateLimitPerMinute. */
  capacity: integer("capacity").notNull(),
  last_refill_at: timestamp("last_refill_at").notNull().defaultNow(),
});

export const insertApiRateLimitBucketSchema = createInsertSchema(apiRateLimitBuckets);
export type InsertApiRateLimitBucket = z.infer<typeof insertApiRateLimitBucketSchema>;
export type ApiRateLimitBucket = typeof apiRateLimitBuckets.$inferSelect;

/* ─── api_webhooks (Wave AJ-6) ─────────────────────────────────────
 * Webhook subscriptions for external API consumers. POSTed to when an
 * event the customer subscribed to fires (e.g. submission.created).
 *
 * `secret` is the HMAC signing secret in plaintext — required so the
 * dispatcher can sign outbound payloads. Returned to the customer
 * EXACTLY ONCE at creation; redacted in subsequent GETs.
 *
 * Tier gating lives in the route handler (uses ApiTier.webhookQuota);
 * no DB cap.
 * ─────────────────────────────────────────────────────────────── */
export const apiWebhooks = pgTable(
  "api_webhooks",
  {
    id: text("id").primaryKey(),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** Plaintext HMAC signing secret. Returned once at creation, redacted afterwards. */
    secret: varchar("secret", { length: 80 }).notNull(),
    /** JSON array of event-type strings. e.g. ["submission.created"] */
    events: jsonb("events").notNull().default([]),
    /** active | revoked */
    status: varchar("status", { length: 20 }).notNull().default("active"),
    last_delivery_at: timestamp("last_delivery_at"),
    last_delivery_status: integer("last_delivery_status"),
    total_deliveries: integer("total_deliveries").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("idx_api_webhooks_user").on(t.user_id),
    statusIdx: index("idx_api_webhooks_status").on(t.status),
  }),
);

export const insertApiWebhookSchema = createInsertSchema(apiWebhooks).omit({
  created_at: true,
  updated_at: true,
  total_deliveries: true,
  last_delivery_at: true,
  last_delivery_status: true,
});
export type InsertApiWebhook = z.infer<typeof insertApiWebhookSchema>;
export type ApiWebhook = typeof apiWebhooks.$inferSelect;
