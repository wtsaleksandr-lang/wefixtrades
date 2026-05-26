import { pgTable, text, serial, integer, timestamp, jsonb, uuid, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Marketing chat widget sessions (Wave 12A)
 *
 * Anonymous conversations from the floating "Chat with us" widget on
 * wefixtrades.com. session_id is a client-generated uuid stored in
 * localStorage; we never tie this to an auth session. lead_email/name are
 * captured opportunistically when the AI asks for them and the visitor
 * provides them. Sales tooling can then follow up via the captured email.
 *
 * messages_json is a compact transcript: [{ role: "user"|"assistant",
 * content: string, ts: iso8601 }]. recommended_product / pain_bucket are
 * lightweight analytics fields the route updates as the AI infers them.
 */
export const marketingChatSessions = pgTable(
  "marketing_chat_sessions",
  {
    id: serial("id").primaryKey(),
    session_id: uuid("session_id").notNull().unique(),
    messages_json: jsonb("messages_json").notNull().default(sql`'[]'::jsonb`),
    lead_email: text("lead_email"),
    lead_name: text("lead_name"),
    lead_phone: text("lead_phone"),
    recommended_product: text("recommended_product"),
    pain_bucket: text("pain_bucket"),
    ip_hash: varchar("ip_hash", { length: 64 }),
    user_agent: text("user_agent"),
    landing_path: text("landing_path"),
    message_count: integer("message_count").notNull().default(0),
    created_at: timestamp("created_at").notNull().defaultNow(),
    last_active_at: timestamp("last_active_at").notNull().defaultNow(),
  },
  (t) => ({
    lastActiveIdx: index("idx_marketing_chat_sessions_last_active").on(t.last_active_at),
    leadEmailIdx: index("idx_marketing_chat_sessions_lead_email")
      .on(t.lead_email)
      .where(sql`${t.lead_email} IS NOT NULL`),
  }),
);

export type MarketingChatSession = typeof marketingChatSessions.$inferSelect;
export type InsertMarketingChatSession = typeof marketingChatSessions.$inferInsert;
