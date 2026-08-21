/**
 * Self-serve affiliate REGISTRATION — the idempotent core, DB-free.
 *
 * The DB + HTTP wiring lives in server/routes/partnersRoutes.ts (POST
 * /api/partners/signup); this module holds only the decision logic behind a
 * dependency seam so signup.test.ts can prove idempotency + minting + the
 * base-tier/pending defaults without a database (WFT's tsx + node:assert
 * harness has no module mocking). The one program NUMBER it touches — the base
 * commission rate — is imported from programs.ts, never hardcoded here.
 */
import { AFFILIATE_BASE_RATE } from "./programs";

export interface AffiliateSignupInput {
  email: string;
  name?: string | null;
  payoutMethod?: string | null;
  payoutDetails?: string | null;
  /** Resolved by the route when a logged-in / matching account owns the email. */
  ownerClientId?: number | null;
  ownerUserId?: number | null;
}

/** The columns an insert must write (mirrors the `affiliates` table). */
export interface AffiliateInsertValues {
  email: string;
  name: string | null;
  code: string;
  tier: "base";
  commission_rate: number;
  status: "pending";
  payout_method: string | null;
  payout_details: string | null;
  owner_client_id: number | null;
  owner_user_id: number | null;
}

export interface AffiliateRow {
  code: string;
  status: string;
}

export interface RegisterAffiliateDeps {
  /** Existing affiliate for this (already-lowercased) email, or null. */
  findByEmail: (email: string) => Promise<AffiliateRow | null>;
  /** Mint a globally-unique code. */
  mint: () => Promise<string>;
  /** Insert the new affiliate; returns the created row (code + status). */
  insert: (values: AffiliateInsertValues) => Promise<AffiliateRow | null>;
}

export interface AffiliateSignupResult {
  code: string;
  status: string;
  /** True when the email was already registered (no new row was created). */
  existing: boolean;
}

/**
 * Register an affiliate, idempotent on email. Returns the existing row untouched
 * when the email is already registered; otherwise mints a code and inserts a
 * fresh row at tier 'base' / status 'pending' with the base commission rate.
 * Pure over its injected deps — no DB import, so the co-located test drives it
 * with fakes.
 */
export async function registerAffiliate(
  input: AffiliateSignupInput,
  deps: RegisterAffiliateDeps,
): Promise<AffiliateSignupResult> {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("registerAffiliate: email required");

  const existing = await deps.findByEmail(email);
  if (existing) {
    return { code: existing.code, status: existing.status, existing: true };
  }

  const code = await deps.mint();
  const row = await deps.insert({
    email,
    name: input.name ?? null,
    code,
    tier: "base",
    commission_rate: AFFILIATE_BASE_RATE,
    status: "pending",
    payout_method: input.payoutMethod ?? null,
    payout_details: input.payoutDetails ?? null,
    owner_client_id: input.ownerClientId ?? null,
    owner_user_id: input.ownerUserId ?? null,
  });
  if (!row) throw new Error("affiliate insert returned no row");
  return { code: row.code, status: row.status, existing: false };
}
