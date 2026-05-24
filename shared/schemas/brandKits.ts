import { pgTable, text, integer, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./db";

/**
 * Brand Kits — Wave W-AO-6d (Brand Studio Wave 2, Pro tier).
 *
 * A reusable bundle of QuoteQuick style settings a user can apply across
 * every calculator they own. The `style` column stores an `AdvStyle`-shaped
 * JSON blob — same shape as `calculators.calculator_settings.advanced.style`.
 *
 * Pro-tier gated at the API layer (portalBrandKitsRoutes.ts); the table
 * itself enforces no plan check, only that the row belongs to a user.
 */
export const brandKits = pgTable(
  "brand_kits",
  {
    /** cuid */
    id: text("id").primaryKey(),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Full `AdvStyle` bundle (Brand Studio Wave 1 + 2 fields included). */
    style: jsonb("style").notNull(),
    /** Separate column so the picker can render the kit's logo without
     *  decoding the JSON style blob. */
    logo_url: text("logo_url"),
    is_default: boolean("is_default").default(false),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // Direction must match migrations/0025_brand_kits.sql:
    //   CREATE INDEX brand_kits_user_idx ON brand_kits (user_id, created_at DESC).
    // Postgres default for DESC is NULLS FIRST. Drizzle's `.desc()` alone
    // emits `DESC NULLS LAST`, which does NOT match the live index and
    // makes drizzle-kit propose drop+recreate on every deploy. The
    // `.nullsFirst()` chain pins the schema to the same NULL ordering
    // Postgres chose when the migration ran with bare `DESC`.
    userIdx: index("brand_kits_user_idx").on(
      t.user_id,
      t.created_at.desc().nullsFirst(),
    ),
  }),
);

export const insertBrandKitSchema = createInsertSchema(brandKits).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertBrandKit = z.infer<typeof insertBrandKitSchema>;
export type BrandKit = typeof brandKits.$inferSelect;
