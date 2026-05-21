import { pgTable, text, bigserial, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Product waitlist (Wave W-AN-2)
 *
 * Captures early-access signups for products that can't ship at the
 * 2026-07-15 launch because they're blocked on platform approvals
 * (SocialSync, ReputationShield, MapGuard). When their marketing page
 * is rendered with `comingSoon: true`, the page shows a waitlist form
 * that POSTs here.
 */
export const productWaitlist = pgTable(
  "product_waitlist",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    product_slug: text("product_slug").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    business_name: text("business_name"),
    source: text("source"),
    ip: text("ip"),
    user_agent: text("user_agent"),
    notified_at: timestamp("notified_at"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    slugIdx: index("product_waitlist_slug_idx").on(t.product_slug, t.created_at),
    emailSlugIdx: uniqueIndex("product_waitlist_email_slug_idx").on(t.product_slug, t.email),
  }),
);

export const insertProductWaitlistSchema = createInsertSchema(productWaitlist).omit({
  id: true,
  created_at: true,
  notified_at: true,
});
export type InsertProductWaitlist = z.infer<typeof insertProductWaitlistSchema>;
export type ProductWaitlist = typeof productWaitlist.$inferSelect;
