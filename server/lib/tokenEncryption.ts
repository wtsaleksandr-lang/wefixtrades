/**
 * Token encryption utilities for sensitive data at rest (e.g. OAuth tokens).
 *
 * Uses AES-256-GCM with a 32-byte key from TOKEN_ENCRYPTION_KEY env var.
 * Ciphertext format: "enc:v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>"
 *
 * If TOKEN_ENCRYPTION_KEY is not set:
 *   - Production: logs error and refuses to operate
 *   - Development: passes through unencrypted with a warning
 */

import crypto from "crypto";
import { createLogger } from "./logger";

const log = createLogger("TokenEncryption");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;       // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;  // 128-bit auth tag
const PREFIX = "enc:v1:";

function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex) return null;

  const keyBuf = Buffer.from(keyHex, "hex");
  if (keyBuf.length !== 32) {
    log.error("TOKEN_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)", {
      actualLength: keyBuf.length,
    });
    return null;
  }
  return keyBuf;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns the prefixed ciphertext, or null if encryption is unavailable in production.
 * In development without a key, returns the plaintext unchanged with a warning.
 */
export function encryptToken(plaintext: string): string | null {
  const key = getEncryptionKey();
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      log.error("TOKEN_ENCRYPTION_KEY not set — refusing to store unencrypted token in production");
      return null;
    }
    log.warn("TOKEN_ENCRYPTION_KEY not set — storing token unencrypted (dev mode)");
    return plaintext;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a ciphertext string produced by encryptToken.
 * If the input is not prefixed (i.e., legacy unencrypted data), returns it as-is.
 */
export function decryptToken(ciphertext: string): string {
  // Legacy/unencrypted data — pass through
  if (!ciphertext.startsWith(PREFIX)) {
    return ciphertext;
  }

  const key = getEncryptionKey();
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      log.error("TOKEN_ENCRYPTION_KEY not set — cannot decrypt token in production");
      throw new Error("Decryption key not available");
    }
    log.warn("TOKEN_ENCRYPTION_KEY not set — cannot decrypt, returning raw ciphertext (dev mode)");
    return ciphertext;
  }

  const parts = ciphertext.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Check if a value is already encrypted (has the enc:v1: prefix).
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * Encrypt a Google credentials object. Encrypts the access_token and refresh_token
 * fields individually, leaving the rest (expiry_date, token_type, scope, etc.) as-is.
 */
export function encryptGoogleCredentials(creds: Record<string, unknown>): Record<string, unknown> | null {
  const result = { ...creds };

  if (typeof creds.access_token === "string" && creds.access_token) {
    const encrypted = encryptToken(creds.access_token);
    if (encrypted === null) return null; // production with no key
    result.access_token = encrypted;
  }

  if (typeof creds.refresh_token === "string" && creds.refresh_token) {
    const encrypted = encryptToken(creds.refresh_token);
    if (encrypted === null) return null; // production with no key
    result.refresh_token = encrypted;
  }

  return result;
}

/**
 * Decrypt a Google credentials object. Decrypts access_token and refresh_token
 * if they are encrypted (have the prefix). Legacy unencrypted tokens pass through.
 */
export function decryptGoogleCredentials(creds: Record<string, unknown>): Record<string, unknown> {
  const result = { ...creds };

  if (typeof creds.access_token === "string" && creds.access_token) {
    result.access_token = decryptToken(creds.access_token);
  }

  if (typeof creds.refresh_token === "string" && creds.refresh_token) {
    result.refresh_token = decryptToken(creds.refresh_token);
  }

  return result;
}
