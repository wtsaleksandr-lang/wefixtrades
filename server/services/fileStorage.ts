/**
 * File storage abstraction for fulfillment deliverables.
 *
 * Backend selection (env-driven, no extra deps required):
 *   - default:               local disk (UPLOAD_DIR or ./uploads)
 *   - process.env.S3_BUCKET: S3-compatible (extension hook — not implemented in
 *                            Phase A; throws a clear error so it can't be enabled
 *                            silently without the AWS SDK installed)
 *
 * Public URLs:
 *   - Local files are served at `${baseUrl}/uploads/<storage_key>`
 *   - The storage_key is collision-safe (uuid + sanitized filename)
 *
 * Phase A scope:
 *   - saveFile()         persist a buffer, return { url, storage_key }
 *   - getDownloadUrl()   build the public URL for an existing key
 *   - registerStaticServing() mount /uploads on the Express app
 *   - getUploadUrl()     stub; Phase A uses base64-in-body upload via
 *                        the deliverables route, not pre-signed URLs.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { Express } from "express";
import express from "express";

export interface SavedFile {
  url: string;          // public URL (relative to base, ready to embed)
  storage_key: string;  // backend-internal handle
  size_bytes: number;
}

const LOCAL_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");
const PUBLIC_PREFIX = "/uploads";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB hard cap per file (matches express.json 20mb after b64 inflation)

function backend(): "local" | "s3" {
  return process.env.S3_BUCKET ? "s3" : "local";
}

function ensureLocalDir(): void {
  if (!fs.existsSync(LOCAL_DIR)) {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
  }
}

function sanitizeFilename(name: string): string {
  // Strip directory parts + anything that's not alnum/dot/dash/underscore
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.length > 0 ? base.slice(-80) : "file";
}

/**
 * Persist a file buffer. Returns the public URL + storage key.
 * Throws on size violations or unconfigured S3.
 */
export async function saveFile(input: {
  filename: string;
  content: Buffer;
  mimeType?: string;
}): Promise<SavedFile> {
  if (input.content.length > MAX_BYTES) {
    throw new Error(`File too large: ${input.content.length} bytes (max ${MAX_BYTES})`);
  }
  if (input.content.length === 0) {
    throw new Error("Empty file");
  }

  const id = crypto.randomUUID();
  const safeName = sanitizeFilename(input.filename);
  const storageKey = `${id}-${safeName}`;

  if (backend() === "s3") {
    // Extension hook for Phase B. Kept inline so the call shape is clear.
    throw new Error(
      "S3 backend selected (S3_BUCKET set) but not implemented in Phase A. " +
      "Unset S3_BUCKET to use local storage, or wire the AWS SDK in fileStorage.ts.",
    );
  }

  ensureLocalDir();
  const fullPath = path.join(LOCAL_DIR, storageKey);
  await fs.promises.writeFile(fullPath, input.content);

  return {
    url: getDownloadUrl(storageKey),
    storage_key: storageKey,
    size_bytes: input.content.length,
  };
}

/** Build the public URL for a stored file. */
export function getDownloadUrl(storageKey: string): string {
  // For local backend, the URL is path-relative. Routes that embed it should
  // optionally prepend baseUrl when sending to external systems (email, etc.).
  return `${PUBLIC_PREFIX}/${storageKey}`;
}

/**
 * Stub — Phase A uses base64-in-body uploads via the deliverables route.
 * Pre-signed S3 PUT URLs land in Phase B alongside the S3 backend.
 */
export function getUploadUrl(_filename: string): string {
  throw new Error(
    "getUploadUrl() is not implemented in Phase A. " +
    "Use POST /api/admin/crm/fulfillment/:id/deliverables with base64 content.",
  );
}

/** Mount /uploads as static. Idempotent — safe to call once at boot. */
export function registerStaticServing(app: Express): void {
  if (backend() !== "local") return;
  ensureLocalDir();
  app.use(PUBLIC_PREFIX, express.static(LOCAL_DIR, {
    fallthrough: true,
    maxAge: "1h",
    etag: true,
  }));
  console.log(`[file-storage] Serving uploads from ${LOCAL_DIR} at ${PUBLIC_PREFIX}`);
}
