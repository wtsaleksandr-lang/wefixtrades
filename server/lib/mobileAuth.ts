/**
 * Mobile JWT issue/verify + refresh-token rotation + Bearer-or-session
 * hybrid auth middleware.
 *
 * Used by the React Native softphone app (Phase 3+). Web continues to
 * use cookie-session auth via Passport — both coexist on the same
 * endpoints when wrapped with `requireSessionOrBearer`.
 *
 * Signing key:
 *   - MOBILE_JWT_SECRET (base64, ≥32 bytes) when set
 *   - Otherwise HKDF-style derived from SESSION_SECRET via HMAC-SHA256
 *     with the label "mobile-jwt". Lets the server boot without a
 *     dedicated mobile secret while still keeping the mobile signing
 *     key separate-of-purpose from the cookie signer.
 *
 * Access token: 15-min HS256 JWT.
 * Refresh token: 32-byte random base64url string, NOT a JWT. We store
 *   only its SHA256 hash. Rotated on every /refresh; presenting a
 *   revoked refresh token triggers theft response (revoke-all for user).
 */

import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { mobileRefreshTokens, users } from "@shared/schema";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { createLogger } from "./logger";

const log = createLogger("MobileAuth");

const ACCESS_TOKEN_TTL_SEC = 15 * 60;          // 15 min
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 3600;  // 30 days
const ACCESS_TOKEN_ALG = "HS256";

/** Cache the signing key after first derivation so we don't HMAC on every request. */
let cachedSigningKey: Buffer | null = null;

function getSigningKey(): Buffer {
  if (cachedSigningKey) return cachedSigningKey;

  const explicit = process.env.MOBILE_JWT_SECRET;
  if (explicit) {
    const buf = Buffer.from(explicit, "base64");
    if (buf.length < 32) {
      throw new Error("MOBILE_JWT_SECRET must decode to at least 32 bytes");
    }
    cachedSigningKey = buf;
    return buf;
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("Neither MOBILE_JWT_SECRET nor SESSION_SECRET is set");
  }
  // HKDF-Expand-ish: HMAC the SESSION_SECRET with a domain-separation label.
  cachedSigningKey = crypto.createHmac("sha256", sessionSecret).update("mobile-jwt-v1").digest();
  return cachedSigningKey;
}

export interface AccessTokenPayload {
  sub: number;        // user.id
  email: string;
  role: string;
  name: string | null;
}

export function issueAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getSigningKey(), {
    algorithm: ACCESS_TOKEN_ALG,
    expiresIn: ACCESS_TOKEN_TTL_SEC,
  });
}

/**
 * Verify a JWT and return the payload, or null on invalid/expired.
 * Caller must handle the null case (401).
 */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSigningKey(), {
      algorithms: [ACCESS_TOKEN_ALG],
    }) as jwt.JwtPayload & AccessTokenPayload;
    if (typeof decoded.sub !== "number") return null;
    return {
      sub: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name ?? null,
    };
  } catch {
    return null;
  }
}

/* ─── Refresh tokens ─── */

export function generateRefreshTokenPlain(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashRefreshToken(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

/**
 * Create a new refresh token, hash it, persist the row, return the plaintext
 * (returned to the client once and never again).
 */
export async function issueRefreshToken(args: {
  userId: number;
  deviceLabel?: string | null;
  ip?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const plain = generateRefreshTokenPlain();
  const hash = hashRefreshToken(plain);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);

  await db.insert(mobileRefreshTokens).values({
    user_id: args.userId,
    token_hash: hash,
    device_label: args.deviceLabel ?? null,
    issued_ip: args.ip ?? null,
    expires_at: expiresAt,
  });

  return { token: plain, expiresAt };
}

/**
 * Look up a refresh token by its plaintext, validate (not revoked,
 * not expired), and return the linked user. Returns null on any failure
 * — caller treats as 401.
 */
export async function validateRefreshToken(plain: string): Promise<{
  rowId: number;
  userId: number;
  email: string;
  role: string;
  name: string | null;
} | null> {
  const hash = hashRefreshToken(plain);
  const now = new Date();

  const [row] = await db
    .select({
      id: mobileRefreshTokens.id,
      user_id: mobileRefreshTokens.user_id,
      revoked_at: mobileRefreshTokens.revoked_at,
      expires_at: mobileRefreshTokens.expires_at,
      email: users.email,
      role: users.role,
      name: users.name,
    })
    .from(mobileRefreshTokens)
    .innerJoin(users, eq(users.id, mobileRefreshTokens.user_id))
    .where(eq(mobileRefreshTokens.token_hash, hash))
    .limit(1);

  if (!row) return null;
  if (row.revoked_at !== null) {
    // Reused after rotation/revocation: possible theft. Revoke ALL refresh
    // tokens for this user and refuse.
    await db
      .update(mobileRefreshTokens)
      .set({ revoked_at: now })
      .where(
        and(
          eq(mobileRefreshTokens.user_id, row.user_id),
          isNull(mobileRefreshTokens.revoked_at),
        ),
      );
    log.warn("Refresh-token reuse detected — revoked all tokens for user", { user_id: row.user_id });
    return null;
  }
  if (row.expires_at <= now) return null;

  return {
    rowId: row.id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    name: row.name,
  };
}

/** Revoke a single refresh token by its plaintext. Idempotent. */
export async function revokeRefreshToken(plain: string): Promise<void> {
  const hash = hashRefreshToken(plain);
  await db
    .update(mobileRefreshTokens)
    .set({ revoked_at: new Date() })
    .where(
      and(
        eq(mobileRefreshTokens.token_hash, hash),
        isNull(mobileRefreshTokens.revoked_at),
      ),
    );
}

/** Revoke every active refresh token for a user. Idempotent. */
export async function revokeAllForUser(userId: number): Promise<number> {
  const result = await db
    .update(mobileRefreshTokens)
    .set({ revoked_at: new Date() })
    .where(
      and(
        eq(mobileRefreshTokens.user_id, userId),
        isNull(mobileRefreshTokens.revoked_at),
      ),
    );
  return (result as any).rowCount ?? 0;
}

/* ─── Hybrid auth middleware ─── */

/**
 * Accepts EITHER a Passport-populated session (web) OR a Bearer JWT (mobile).
 *
 * - If req.user is already set (cookie session), passes through.
 * - Otherwise, looks at Authorization: Bearer <token>; if valid, populates
 *   req.user with the JWT payload (matching Express.User shape).
 * - 401 if neither succeeds.
 */
export function requireSessionOrBearer(req: Request, res: Response, next: NextFunction): void {
  if (req.user) {
    next();
    return;
  }

  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    const payload = verifyAccessToken(token);
    if (payload) {
      // Populate req.user matching Express.User shape (id/email/role/name)
      (req as any).user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        name: payload.name,
      };
      next();
      return;
    }
  }

  res.status(401).json({ error: "Authentication required" });
}

/** Bumps last_used_at on a refresh row. Cheap, non-blocking from the caller's POV. */
export async function touchRefreshRow(rowId: number): Promise<void> {
  await db
    .update(mobileRefreshTokens)
    .set({ last_used_at: new Date() })
    .where(eq(mobileRefreshTokens.id, rowId));
}

/** Rotation: revoke old row, issue new token in one transaction. */
export async function rotateRefreshToken(args: {
  oldRowId: number;
  userId: number;
  deviceLabel?: string | null;
  ip?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  return await db.transaction(async (tx) => {
    await tx
      .update(mobileRefreshTokens)
      .set({ revoked_at: new Date() })
      .where(eq(mobileRefreshTokens.id, args.oldRowId));

    const plain = generateRefreshTokenPlain();
    const hash = hashRefreshToken(plain);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);

    await tx.insert(mobileRefreshTokens).values({
      user_id: args.userId,
      token_hash: hash,
      device_label: args.deviceLabel ?? null,
      issued_ip: args.ip ?? null,
      expires_at: expiresAt,
    });

    return { token: plain, expiresAt };
  });
}

export { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC };
