/**
 * Encrypted object storage wrapper around @replit/object-storage.
 *
 * Replit Object Storage runs on GCS, which is encrypted at rest with
 * Google-managed keys. For phone-bill PDFs (PII) we additionally encrypt
 * at the application layer with AES-256-GCM so the key lives in Doppler
 * under our control, never in Replit/Google's KMS.
 *
 * Layout: [IV (12B)] [authTag (16B)] [ciphertext (Nb)].
 *
 * GCM IVs MUST NEVER repeat for the same key. We use crypto.randomBytes(12)
 * per call — the birthday bound for 96-bit IVs is ~2^48 messages, well
 * above any realistic phone-bill volume.
 */

import { Client, type RequestError } from "@replit/object-storage";
import * as crypto from "crypto";
import { createLogger } from "./logger";

const log = createLogger("ObjectStorage");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

let cachedClient: Client | null = null;

function getClient(): Client {
  if (!cachedClient) {
    cachedClient = new Client(
      process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID
        ? { bucketId: process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID }
        : undefined,
    );
  }
  return cachedClient;
}

function getEncryptionKey(): Buffer {
  const b64 = process.env.BILL_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error("BILL_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `BILL_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length})`,
    );
  }
  return key;
}

export interface UploadResult {
  ok: true;
  objectName: string;
  ciphertextBytes: number;
}

export interface UploadFailure {
  ok: false;
  error: string;
}

/**
 * Encrypts and uploads. Returns the object name on success; overwrites any
 * existing object with the same name.
 */
export async function uploadEncryptedBuffer(
  objectName: string,
  plaintext: Buffer,
): Promise<UploadResult | UploadFailure> {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, ciphertext]);

    // compress:false — encrypted bytes are high-entropy, gzip just adds overhead.
    const result = await getClient().uploadFromBytes(objectName, payload, {
      compress: false,
    });
    if (!result.ok) {
      log.error("upload failed", { objectName, err: requestErrorMessage(result.error) });
      return { ok: false, error: requestErrorMessage(result.error) };
    }
    return { ok: true, objectName, ciphertextBytes: payload.length };
  } catch (err) {
    const msg = (err as Error).message;
    log.error("upload threw", { objectName, err: msg });
    return { ok: false, error: msg };
  }
}

export interface DownloadResult {
  ok: true;
  data: Buffer;
}

export interface DownloadFailure {
  ok: false;
  error: string;
  notFound?: boolean;
}

/**
 * Downloads and decrypts. Auth-tag verification is performed by the GCM
 * decipher; tampered data throws and returns ok=false.
 */
export async function downloadDecrypted(
  objectName: string,
): Promise<DownloadResult | DownloadFailure> {
  try {
    const result = await getClient().downloadAsBytes(objectName);
    if (!result.ok) {
      const msg = requestErrorMessage(result.error);
      const notFound = result.error.statusCode === 404;
      return { ok: false, error: msg, notFound };
    }
    // downloadAsBytes returns Result<[Buffer], _> — value is a single-element tuple.
    const payload = result.value[0];
    if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      return { ok: false, error: "ciphertext too short to be valid" };
    }
    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return { ok: true, data: plaintext };
  } catch (err) {
    const msg = (err as Error).message;
    log.error("download/decrypt threw", { objectName, err: msg });
    return { ok: false, error: msg };
  }
}

/**
 * Deletes an object. Returns true on success or if already-absent; false on
 * other errors (logged).
 */
export async function deleteObject(objectName: string): Promise<boolean> {
  try {
    const result = await getClient().delete(objectName, { ignoreNotFound: true });
    if (!result.ok) {
      log.error("delete failed", { objectName, err: requestErrorMessage(result.error) });
      return false;
    }
    return true;
  } catch (err) {
    log.error("delete threw", { objectName, err: (err as Error).message });
    return false;
  }
}

/**
 * Server-proxy download URL. Replit Object Storage does not yet expose
 * first-class signed URLs the way GCS/S3 do, so callers fetch through an
 * authenticated route. The actual route is owned by tradelineSetupRoutes
 * and enforces `requireClient` + ownership checks before calling
 * downloadDecrypted().
 *
 * The ttl parameter is reserved for the future signed-URL implementation.
 */
export function getSignedDownloadUrl(objectName: string, _ttlSeconds = 300): string {
  return `/api/portal/tradeline/setup/port/bill-download/${encodeURIComponent(objectName)}`;
}

function requestErrorMessage(err: RequestError | Error | string): string {
  if (typeof err === "string") return err;
  if ("message" in err) return err.message;
  return String(err);
}
