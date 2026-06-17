/**
 * Booking consolidation (PR2) — shared client resolver.
 *
 * Single source of truth for the `calculator → user_id → clients.id` bridge
 * that every booking entry point needs to map a public calculator to the
 * `clients` row that owns its `bookflow_settings` / `bookflow_appointments`.
 *
 * This logic previously lived inline in `storage.ts` (the review-request
 * trigger). It is extracted here behavior-identically so the consolidation
 * façade and `storage.ts` share ONE implementation. PR2 is additive: no live
 * caller is repointed yet beyond `storage.ts` calling this helper.
 *
 * DB-free unit-testable: all data access is injected via `deps`. The default
 * `deps` wire the real Drizzle queries.
 */
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { clients } from "@shared/schema";

export interface ResolveClientDeps {
  /** Resolve a calculator by id → at least its `user_id` (null when unowned). */
  getCalculatorUserId: (calculatorId: number) => Promise<number | null>;
  /** Resolve the `clients.id` owned by a given `user_id` (null when none). */
  getClientIdByUserId: (userId: number) => Promise<number | null>;
}

/* Default deps — the real DB queries. Mirrors storage.ts:808-821 semantics. */
export const defaultResolveClientDeps: ResolveClientDeps = {
  async getCalculatorUserId(calculatorId: number): Promise<number | null> {
    // Lazy import to avoid a storage <-> service import cycle at module eval.
    const { getCalculatorById } = await import("../../storage/calculator");
    const calc = await getCalculatorById(calculatorId);
    if (!calc) return null;
    return calc.user_id ?? null;
  },
  async getClientIdByUserId(userId: number): Promise<number | null> {
    const rows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.user_id, userId))
      .limit(1);
    return rows[0]?.id ?? null;
  },
};

/**
 * Resolve the `clients.id` that owns the given calculator, or `null` when the
 * calculator does not exist or has no linked client.
 *
 * Behavior-identical to the inline logic at storage.ts:808-821:
 *   calculator → calc.user_id → clients.user_id → clients.id
 */
export async function resolveClientForCalculator(
  calculatorId: number,
  deps: ResolveClientDeps = defaultResolveClientDeps,
): Promise<number | null> {
  const userId = await deps.getCalculatorUserId(calculatorId);
  if (!userId) return null; // no calculator, or calculator has no owning user

  const clientId = await deps.getClientIdByUserId(userId);
  return clientId; // null when no linked client — caller decides what to do
}
