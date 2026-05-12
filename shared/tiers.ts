/**
 * Pricing tier schema (Q28a)
 *
 * Per-product tiers (Starter/Growth/Pro etc) stored in
 * serviceCatalog.tiers as jsonb. Admin-edited via the product editor.
 *
 * Customer-facing surfaces should prefer DB tiers when present and fall
 * back to the hardcoded TIERS in shared/pricing.ts otherwise. See
 * getEffectiveTiers() below.
 */

import { z } from "zod";

export const tierSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  price_cents: z.number().int().min(0),
  billing_period: z.enum(["monthly", "one-time"]),
  features: z.array(z.string().min(1).max(400)).max(40),
  badge: z.string().max(60).optional().nullable(),
  highlighted: z.boolean().optional(),
  included_mins: z.number().int().min(0).optional().nullable(),
  stripe_price_id: z.string().max(120).optional().nullable(),
});

export type Tier = z.infer<typeof tierSchema>;

export const tiersSchema = z.array(tierSchema).max(10);

export function validateTiers(input: unknown): Tier[] {
  return tiersSchema.parse(input);
}
