/**
 * ai_response_ratings — message-level feedback for AI responses surfaced
 * in the admin UI. Backs the <AiResponseRating /> component (👍 / 👎 +
 * optional comment) and feeds the nightly conversation→KB sweep that
 * promotes 👎-with-comment rows into tradeline_learning_candidates.
 *
 * See migration 0049_ai_response_ratings.sql for table + index details.
 */

import { pgTable, bigserial, text, smallint, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const AI_RATING_VALUES = [-1, 1] as const;
export type AiRatingValue = (typeof AI_RATING_VALUES)[number];

export const aiResponseRatings = pgTable(
  "ai_response_ratings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** The AI response identifier (message_id, vapi segment id, or generic external_id). */
    response_id: text("response_id").notNull(),
    /** Matches AI_SURFACES in server/services/aiSurfaces.ts. */
    surface: text("surface").notNull(),
    /** -1 (thumbs down) or +1 (thumbs up). */
    rating: smallint("rating").notNull(),
    /** Optional free-text feedback. Required-ish for 👎 (the sweep only
     *  picks up 👎 rows that have a comment to feed the candidate body). */
    comment: text("comment"),
    /** users.id of the admin who left the rating. */
    rated_by: integer("rated_by").notNull(),
    rated_at: timestamp("rated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Optional client scope for per-client analytics. */
    client_id: integer("client_id"),
  },
  (table) => ({
    raterResponseIdx: uniqueIndex("ai_response_ratings_rater_response_idx").on(
      table.rated_by,
      table.response_id,
    ),
    surfaceRatedAtIdx: index("ai_response_ratings_surface_rated_at_idx").on(
      table.surface,
      table.rated_at,
    ),
    clientIdx: index("ai_response_ratings_client_idx").on(table.client_id, table.rated_at),
    // migrations/0049_ai_response_ratings.sql: partial index for nightly
    // sweep of 👎-with-comment rows fed into the conversation→KB pipeline.
    //   ON ai_response_ratings(rated_at DESC) WHERE rating = -1 AND comment IS NOT NULL
    // `.desc().nullsFirst()` pins to Postgres's default NULL ordering for
    // DESC (rated_at is NOT NULL so NULL ordering is moot for data, but
    // drizzle-kit byte-compares the index definition).
    negativeRecentIdx: index("ai_response_ratings_negative_recent_idx")
      .on(table.rated_at.desc().nullsFirst())
      .where(sql`${table.rating} = -1 AND ${table.comment} IS NOT NULL`),
  }),
);

export const insertAiResponseRatingSchema = createInsertSchema(aiResponseRatings).omit({
  id: true,
  rated_at: true,
});

/** Validator for the POST /api/admin/ai/ratings body. */
export const upsertAiRatingRequestSchema = z.object({
  response_id: z.string().trim().min(1).max(256),
  surface: z.string().trim().min(1).max(64),
  rating: z.union([z.literal(-1), z.literal(1)]),
  comment: z.string().trim().max(2000).optional().nullable(),
  client_id: z.coerce.number().int().positive().optional().nullable(),
});

export type AiResponseRating = typeof aiResponseRatings.$inferSelect;
export type InsertAiResponseRating = z.infer<typeof insertAiResponseRatingSchema>;
export type UpsertAiRatingRequest = z.infer<typeof upsertAiRatingRequestSchema>;
