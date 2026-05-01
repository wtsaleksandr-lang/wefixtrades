/**
 * TOTP (Time-based One-Time Password) service — RFC 6238 / RFC 4226
 *
 * Pure Node.js implementation using crypto — no external dependencies.
 * Generates 6-digit codes with a 30-second time step, HMAC-SHA1.
 */

import crypto from "crypto";
import { createLogger } from "../lib/logger";

const log = createLogger("TOTP");

const TOTP_PERIOD = 30;    // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = "sha1";
const ISSUER = "WeFixTrades";

/**
 * Generate a random 20-byte secret and return it as base32,
 * along with the otpauth:// URI for QR code generation.
 */
export function generateSecret(accountEmail: string): {
  secret: string;
  otpauthUrl: string;
} {
  const secretBytes = crypto.randomBytes(20);
  const secret = base32Encode(secretBytes);
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(accountEmail)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;

  return { secret, otpauthUrl };
}

/**
 * Verify a TOTP code against a secret.
 * Checks current window and +/- 1 window for clock skew tolerance.
 */
export function verifyCode(secret: string, code: string): boolean {
  if (!code || !secret) return false;

  // Normalize: strip whitespace, must be exactly TOTP_DIGITS digits
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  const now = Math.floor(Date.now() / 1000);

  // Check current window and +/- 1 for clock skew
  for (const offset of [-1, 0, 1]) {
    const counter = Math.floor((now + offset * TOTP_PERIOD) / TOTP_PERIOD);
    const expected = generateTOTP(secret, counter);
    if (timingSafeCompare(normalized, expected)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate a TOTP value for a given counter.
 */
function generateTOTP(base32Secret: string, counter: number): string {
  const secretBytes = base32Decode(base32Secret);

  // Convert counter to 8-byte big-endian buffer
  const counterBuf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBuf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  // HMAC-SHA1
  const hmac = crypto.createHmac(TOTP_ALGORITHM, secretBytes);
  hmac.update(counterBuf);
  const digest = hmac.digest();

  // Dynamic truncation (RFC 4226 Section 5.4)
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, "0");
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ─── Base32 encoding/decoding (RFC 4648) ─── */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return output;
}

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/[=\s]/g, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      log.warn("Invalid base32 character encountered during decode");
      continue;
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
