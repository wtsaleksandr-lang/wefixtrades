/**
 * OAuth token store — single connected account per provider.
 *
 * Backed by oauth_tokens (migration 0044). Tokens are encrypted at rest
 * via tokenEncryption.ts (AES-256-GCM, prefix "enc:v1:"). Reads decrypt
 * automatically; legacy/unencrypted values pass through unchanged.
 *
 * Providers are 'google' | 'bing' | 'gbp'. Reconnecting any provider
 * overwrites the existing row (the unique index on `provider` enforces
 * single-account-per-provider for v1).
 */

import { db } from "../../db";
import { oauthTokens, type OauthTokenRow } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { encryptToken, decryptToken } from "../tokenEncryption";
import { createLogger } from "../logger";

const log = createLogger("OAuthTokenStore");

export type Provider = "google" | "bing" | "gbp";

export interface StoredToken {
  provider: Provider;
  account_email: string | null;
  access_token: string; // plaintext (decrypted on read)
  refresh_token: string | null; // plaintext (decrypted on read)
  expires_at: Date | null;
  scopes: string[];
  connected_at: Date;
  updated_at: Date;
}

export interface UpsertTokenInput {
  provider: Provider;
  account_email?: string | null;
  access_token: string; // plaintext — store encrypts
  refresh_token?: string | null; // plaintext — store encrypts
  expires_at?: Date | null;
  scopes?: string[];
}

function rowToToken(row: OauthTokenRow): StoredToken {
  return {
    provider: row.provider as Provider,
    account_email: row.account_email,
    access_token: decryptToken(row.access_token),
    refresh_token: row.refresh_token ? decryptToken(row.refresh_token) : null,
    expires_at: row.expires_at,
    scopes: row.scopes ?? [],
    connected_at: row.connected_at,
    updated_at: row.updated_at,
  };
}

export async function getToken(provider: Provider): Promise<StoredToken | null> {
  const rows = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, provider)).limit(1);
  if (rows.length === 0) return null;
  return rowToToken(rows[0]);
}

export async function upsertToken(input: UpsertTokenInput): Promise<void> {
  const encAccess = encryptToken(input.access_token);
  if (encAccess === null) {
    log.error("Cannot encrypt access_token — refusing to persist", { provider: input.provider });
    throw new Error("TOKEN_ENCRYPTION_KEY required for token storage in production");
  }
  const encRefresh = input.refresh_token ? encryptToken(input.refresh_token) : null;
  if (input.refresh_token && encRefresh === null) {
    log.error("Cannot encrypt refresh_token — refusing to persist", { provider: input.provider });
    throw new Error("TOKEN_ENCRYPTION_KEY required for token storage in production");
  }

  await db
    .insert(oauthTokens)
    .values({
      provider: input.provider,
      account_email: input.account_email ?? null,
      access_token: encAccess,
      refresh_token: encRefresh,
      expires_at: input.expires_at ?? null,
      scopes: input.scopes ?? [],
    })
    .onConflictDoUpdate({
      target: oauthTokens.provider,
      set: {
        account_email: input.account_email ?? null,
        access_token: encAccess,
        refresh_token: encRefresh,
        expires_at: input.expires_at ?? null,
        scopes: input.scopes ?? [],
        updated_at: sql`NOW()`,
      },
    });
}

export async function deleteToken(provider: Provider): Promise<void> {
  await db.delete(oauthTokens).where(eq(oauthTokens.provider, provider));
}

export async function listProviders(): Promise<Provider[]> {
  const rows = await db.select({ provider: oauthTokens.provider }).from(oauthTokens);
  return rows.map((r) => r.provider as Provider);
}

/**
 * True if the token will expire within `bufferSec` seconds (default 5min).
 */
export function isExpiringSoon(token: StoredToken, bufferSec = 300): boolean {
  if (!token.expires_at) return false;
  const expiresMs = token.expires_at.getTime();
  return expiresMs - Date.now() < bufferSec * 1000;
}
