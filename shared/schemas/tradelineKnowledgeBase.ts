/**
 * Wave W-AW-1 — User-controlled TradeLine knowledge base entries.
 *
 * Each entry is a small markdown snippet (FAQ, service description, policy,
 * pricing note, or arbitrary doc) the client surface to their AI receptionist.
 * The TradeLine prompt builder pulls all `active` entries for the client,
 * orders by `priority desc`, and embeds them under a "Business Knowledge"
 * section so callers get accurate, client-specific answers.
 */

import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { clients } from "./adminCrm";

export const tradelineKnowledgeBase = pgTable(
  "tradeline_knowledge_base",
  {
    /** cuid */
    id: text("id").primaryKey(),
    client_id: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** 'faq' | 'service' | 'policy' | 'pricing' | 'doc' — soft enum. */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    /** Markdown body. */
    content: text("content").notNull(),
    /** Higher = surfaced earlier in the system prompt. */
    priority: integer("priority").notNull().default(0),
    /** 'active' | 'draft' | 'archived'. */
    status: text("status").notNull().default("active"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // Direction must match migrations/0027_tradeline_voice_settings.sql:
    //   CREATE INDEX tradeline_kb_client_idx
    //     ON tradeline_knowledge_base (client_id, status, priority DESC).
    // Postgres default for DESC is NULLS FIRST. Drizzle's `.desc()` alone
    // emits `DESC NULLS LAST`, which does NOT match the live index and
    // makes drizzle-kit propose drop+recreate on every deploy. The
    // `.nullsFirst()` chain pins the schema to the same NULL ordering
    // Postgres chose when the migration ran with bare `DESC`.
    clientIdx: index("tradeline_kb_client_idx").on(
      t.client_id,
      t.status,
      t.priority.desc().nullsFirst(),
    ),
  }),
);

export const TRADELINE_KB_KINDS = ["faq", "service", "policy", "pricing", "doc"] as const;
export type TradelineKbKind = (typeof TRADELINE_KB_KINDS)[number];

export const TRADELINE_KB_STATUSES = ["active", "draft", "archived"] as const;
export type TradelineKbStatus = (typeof TRADELINE_KB_STATUSES)[number];

export const insertTradelineKnowledgeBaseSchema = createInsertSchema(
  tradelineKnowledgeBase,
).omit({ created_at: true, updated_at: true });
export type InsertTradelineKnowledgeBase = z.infer<typeof insertTradelineKnowledgeBaseSchema>;
export type TradelineKnowledgeBase = typeof tradelineKnowledgeBase.$inferSelect;
