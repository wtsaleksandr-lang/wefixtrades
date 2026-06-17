/**
 * Booking consolidation (PR6) — the SINGLE booking-calculator resolver shared by
 * BOTH TradeLine entry points (VOICE and CHAT).
 *
 * A TradeLine client's booking calendar lives on a calculator: that calculator's
 * `booking_settings` + slot calendar is what the booking executors
 * (`executeCheckAvailability` / `executeCreateBooking`) read/write, and — post
 * PR2–PR5 — what the BookFlow façade resolves the owning client from. This module
 * is the ONE place that picks WHICH calculator backs the booking calendar, so the
 * brittle "first-calculator-wins" heuristic is fixed (or hardened) in exactly one
 * place instead of being duplicated across voice (`vapiService.resolveBookingCalculatorId`)
 * and the new chat path.
 *
 * Behaviour is intentionally IDENTICAL to the old voice-only helper: resolve the
 * client's calculators by `user_id`, return the first one's id (descending by id
 * — newest first, matching `getCalculatorsByUserId`'s ordering), or null when the
 * client has no calculator (booking can't fire → the caller degrades to
 * take-a-message). Fail-soft: any storage error returns null and is logged, never
 * thrown, so a calculator-lookup hiccup never breaks a live voice call or chat
 * turn.
 *
 * DB-free unit-testable: the calculator lookup is injected via `deps`, mirroring
 * the DI seam used across the consolidation (createBookingForCalculator,
 * tradelineBooking.test.ts).
 */
import { createLogger } from "../../lib/logger";

const log = createLogger("ResolveBookingCalculator");

export interface ResolveBookingCalculatorDeps {
  /** clients.user_id → that owner's calculators (newest first). Only the id is used. */
  getCalculatorsByUserId: (userId: number) => Promise<Array<{ id: number }>>;
}

/* Default deps: lazy-import storage so this module stays DB-free at eval time
 * (storage transitively imports server/db, which throws if DATABASE_URL is
 * unset — the same pattern the rest of the booking façade uses). */
export const defaultResolveBookingCalculatorDeps: ResolveBookingCalculatorDeps = {
  async getCalculatorsByUserId(userId) {
    const { storage } = await import("../../storage");
    return storage.getCalculatorsByUserId(userId);
  },
};

/**
 * Resolve the calculator id that backs a TradeLine client's booking calendar.
 *
 * @param userId  The owning user's id (`clients.user_id`). Both voice and chat
 *                resolve this from the client record before calling.
 * @returns the backing calculator id, or null when none exists / on error.
 */
export async function resolveBookingCalculatorId(
  userId: number | null | undefined,
  deps: ResolveBookingCalculatorDeps = defaultResolveBookingCalculatorDeps,
): Promise<number | null> {
  try {
    const calcs = await deps.getCalculatorsByUserId(userId ?? 0);
    return calcs[0]?.id ?? null;
  } catch (err) {
    log.warn("Failed to resolve booking calculator", {
      userId: String(userId ?? ""),
      error: (err as Error).message,
    });
    return null;
  }
}
