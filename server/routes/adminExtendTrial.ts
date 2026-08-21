/**
 * Pure logic + validation for the admin "extend Pro trial" shortcut
 * (POST /api/admin/crm/clients/:id/extend-trial). Extracted from
 * adminCrmRoutes.ts so it is unit-testable without pulling in the whole
 * express/storage/twilio import graph (see adminExtendTrial.test.ts).
 *
 * Mirrors the QuoteFleet tenant equivalent (admin.ts extendTenantTrialAdmin)
 * but over WeFixTrades' `clients.trial_pro_expires_at`.
 */
import { z } from "zod";

/** The only trial-extension increments the admin shortcut offers. Validated as
 *  a closed set so a hand-crafted request can't push an arbitrary (or negative)
 *  number of days onto a client's trial. */
export const EXTEND_TRIAL_DAYS = [7, 14, 21, 30] as const;
export type ExtendTrialDays = (typeof EXTEND_TRIAL_DAYS)[number];

/** Body schema for the "extend trial" shortcut. `days` must be one of the
 *  fixed set (7/14/21/30); anything else is a clean 400. */
export const extendTrialBodySchema = z.object({
  days: z.union([z.literal(7), z.literal(14), z.literal(21), z.literal(30)]),
});
export type ExtendTrialBody = z.infer<typeof extendTrialBodySchema>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * New `trial_pro_expires_at` = (the LATER of now or the existing expiry) + N days.
 * So extending a LAPSED / null trial restarts it from now (+N days of fresh
 * runway); extending an ACTIVE trial adds N days onto its remaining tail.
 * `now` is passed in purely so callers/tests are deterministic.
 */
export function computeExtendedTrialEnd(
  now: Date,
  existing: Date | string | null | undefined,
  days: ExtendTrialDays,
): Date {
  const current = existing ? new Date(existing) : null;
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * MS_PER_DAY);
}
