/**
 * 2FA recovery codes (Lane C — mandatory admin 2FA).
 *
 * Admin accounts are forced to enroll TOTP; without recovery codes a
 * lost phone means a locked-out admin with no self-service path back
 * in. These codes are the break-glass factor:
 *
 *   - Generated once at TOTP enrollment (verify-setup) and shown to the
 *     user EXACTLY once. Only SHA-256 hashes are persisted
 *     (users.totp_recovery_codes, jsonb string array).
 *   - Each code is single-use: verifying one consumes it (the hash is
 *     removed from the stored array).
 *   - Accepted at /api/auth/verify-2fa as an alternative to a TOTP
 *     code.
 *
 * Pure helpers — no DB imports — so policy + consumption logic is unit
 * testable.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const RECOVERY_CODE_COUNT = 8;

/** Unambiguous alphabet (no 0/O, 1/I/L) — codes get typed by hand. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_GROUPS = 2;
const CODE_GROUP_LEN = 5;

function randomCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < CODE_GROUPS; g++) {
    let group = "";
    const bytes = randomBytes(CODE_GROUP_LEN);
    for (let i = 0; i < CODE_GROUP_LEN; i++) {
      group += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/** Canonical form used for hashing/comparison: uppercase, no dashes/spaces. */
export function normalizeRecoveryCode(input: string): string {
  return (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(`wft-recovery:${normalizeRecoveryCode(code)}`).digest("hex");
}

export interface GeneratedRecoveryCodes {
  /** Plaintext codes — show once, never persist. */
  codes: string[];
  /** SHA-256 hex hashes — what goes into users.totp_recovery_codes. */
  hashes: string[];
}

export function generateRecoveryCodes(
  count: number = RECOVERY_CODE_COUNT,
): GeneratedRecoveryCodes {
  const codes: string[] = [];
  const seen = new Set<string>();
  while (codes.length < count) {
    const code = randomCode();
    const norm = normalizeRecoveryCode(code);
    if (seen.has(norm)) continue; // astronomically unlikely, but codes must be unique
    seen.add(norm);
    codes.push(code);
  }
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

/**
 * Heuristic: a recovery code is clearly not a 6-digit TOTP code. Used
 * by verify-2fa to decide which factor the submitted string targets.
 */
export function looksLikeRecoveryCode(input: string): boolean {
  const norm = normalizeRecoveryCode(input);
  if (/^\d{6}$/.test((input || "").replace(/\s/g, ""))) return false;
  return norm.length === CODE_GROUPS * CODE_GROUP_LEN;
}

export interface RecoveryConsumeResult {
  ok: boolean;
  /** Hashes that remain valid after consumption (unchanged when !ok). */
  remainingHashes: string[];
}

/**
 * Verify a submitted code against stored hashes and consume it on
 * match. Timing-safe hash comparison; returns the updated hash array
 * the caller should persist.
 */
export function consumeRecoveryCode(
  storedHashes: unknown,
  submittedCode: string,
): RecoveryConsumeResult {
  const hashes = Array.isArray(storedHashes)
    ? storedHashes.filter((h): h is string => typeof h === "string")
    : [];
  if (hashes.length === 0 || !submittedCode) {
    return { ok: false, remainingHashes: hashes };
  }

  const submittedHash = Buffer.from(hashRecoveryCode(submittedCode), "hex");
  let matchedIndex = -1;
  for (let i = 0; i < hashes.length; i++) {
    let candidate: Buffer;
    try {
      candidate = Buffer.from(hashes[i], "hex");
    } catch (_err) {
      continue; // malformed stored hash — skip, never throw mid-login
    }
    if (candidate.length === submittedHash.length && timingSafeEqual(candidate, submittedHash)) {
      matchedIndex = i;
      // No early break — constant-time over the whole array.
    }
  }

  if (matchedIndex === -1) return { ok: false, remainingHashes: hashes };
  return {
    ok: true,
    remainingHashes: hashes.filter((_, i) => i !== matchedIndex),
  };
}
