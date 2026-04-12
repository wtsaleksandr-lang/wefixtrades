/**
 * Minimal symmetric encryption for storing OAuth tokens at rest.
 * Uses AES-256-GCM with a server-side key from TOKEN_ENCRYPTION_KEY env var.
 *
 * This is NOT a full secrets management system — it prevents tokens from
 * being stored as plaintext in the database. For production, consider
 * a dedicated secrets manager (AWS Secrets Manager, Vault, etc.).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY environment variable is required for token encryption");
  // Key must be 32 bytes (256 bits). If provided as hex, decode; otherwise hash to 32 bytes.
  if (key.length === 64 && /^[0-9a-f]+$/i.test(key)) {
    return Buffer.from(key, "hex");
  }
  // Fallback: derive 32-byte key from arbitrary string via SHA-256
  const { createHash } = require("crypto");
  return createHash("sha256").update(key).digest();
}

/**
 * Encrypt a plaintext string. Returns a hex-encoded string containing:
 * [iv (16 bytes)][authTag (16 bytes)][ciphertext]
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("hex");
}

/**
 * Decrypt a hex-encoded encrypted token string.
 */
export function decryptToken(encryptedHex: string): string {
  const key = getKey();
  const data = Buffer.from(encryptedHex, "hex");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

/**
 * Check if encryption is configured (env var present).
 */
export function isEncryptionConfigured(): boolean {
  return !!process.env.TOKEN_ENCRYPTION_KEY;
}
