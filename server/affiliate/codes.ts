/**
 * Referral/affiliate CODE minting + resolution (DB-touching).
 *
 * Ported from QuoteFleet src/server/affiliate/codes.ts (tenant→client, and QF's
 * `db()` accessor → WFT's `db` drizzle instance from server/db.ts).
 *
 * A code lives in ONE of two namespaces but shares a single global keyspace so a
 * `?ref=<code>` / `/ref/<code>` resolves unambiguously:
 *   • clients.referral_code  — a peer-referral code (every client owns one)
 *   • affiliates.code        — a public affiliate's code
 * mintUniqueCode() therefore checks BOTH tables before returning.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { clients } from "@shared/schemas/adminCrm";
import { affiliates } from "@shared/schemas/affiliate";
import { generateCode, normalizeCode, type ResolvedCodeOwner } from "./programs";
import { createLogger } from "../lib/logger";

const log = createLogger("AffiliateCodes");

/** True when `code` is already used by a client OR an affiliate. */
export async function codeExists(code: string): Promise<boolean> {
  const [t, a] = await Promise.all([
    db.select({ id: clients.id }).from(clients).where(eq(clients.referral_code, code)).limit(1),
    db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.code, code)).limit(1),
  ]);
  return !!t[0] || !!a[0];
}

/**
 * Mint a globally-unique code. Retries on collision; falls back to a longer code
 * after several tries so it always terminates. The DB UNIQUE constraints on both
 * columns are the final race guard (callers handle the unique-violation error).
 *
 * `exists` is injectable so the co-located test can force a collision-then-hit
 * sequence without a database (WFT tsx harness has no module mocking).
 */
export async function mintUniqueCode(
  maxTries = 8,
  exists: (code: string) => Promise<boolean> = codeExists,
): Promise<string> {
  for (let i = 0; i < maxTries; i++) {
    const code = generateCode();
    if (!(await exists(code))) return code;
  }
  // Last resort: append entropy so this effectively never collides.
  const fallback = normalizeCode(generateCode() + generateCode()).slice(0, 12);
  return fallback;
}

/**
 * Ensure a client has a referral code, minting + persisting one if missing.
 * Idempotent: returns the existing code when already set. Used both in the
 * signup path and as a lazy backfill for clients created before this feature.
 */
export async function ensureClientReferralCode(clientId: number): Promise<string> {
  const row = (
    await db.select({ code: clients.referral_code }).from(clients).where(eq(clients.id, clientId)).limit(1)
  )[0];
  if (row?.code) return row.code;
  const code = await mintUniqueCode();
  await db.update(clients).set({ referral_code: code }).where(eq(clients.id, clientId));
  return code;
}

/** Resolve a code to its owner (client peer referral or affiliate), or null. */
export async function resolveCodeOwner(rawCode: string): Promise<ResolvedCodeOwner | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  try {
    const t = (
      await db
        .select({ id: clients.id, email: clients.contact_email, userId: clients.user_id })
        .from(clients)
        .where(eq(clients.referral_code, code))
        .limit(1)
    )[0];
    if (t) {
      return { kind: "referral", clientId: t.id, ownerUserId: t.userId ?? null, ownerEmail: t.email ?? null };
    }
    const a = (
      await db
        .select({ id: affiliates.id, email: affiliates.email, ownerClientId: affiliates.owner_client_id })
        .from(affiliates)
        .where(eq(affiliates.code, code))
        .limit(1)
    )[0];
    if (a) {
      return { kind: "affiliate", affiliateId: a.id, ownerClientId: a.ownerClientId ?? null, ownerEmail: a.email ?? null };
    }
    return null;
  } catch (err) {
    log.warn("resolveCodeOwner failed (non-fatal)", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
