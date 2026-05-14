/**
 * Mobile AI image-attachment endpoints.
 *
 * Two routes powering the Ask tab's image-attach feature:
 *
 *   POST /api/mobile/ai/upload-image
 *     - Accept a single image as base64 JSON (matching the pattern used
 *       by /api/chat/attachments — see chatAttachmentRoutes.ts). The
 *       mobile app reads the picked image, base64-encodes it, and POSTs
 *       it here. No multer dependency required.
 *     - Stores it (AES-256-GCM encrypted at rest) in Replit Object
 *       Storage under `assistant-uploads/<userId>/<uuid>.<ext>` and
 *       returns a signed URL the client can render immediately.
 *
 *   GET /api/mobile/ai/image/:assetPath(*)
 *     - Streams an asset back to the client after verifying:
 *         a) the request is authenticated AND
 *         b) the asset path is owned by the authenticated user
 *            (assetPath must start with `assistant-uploads/<userId>/`),
 *            AND
 *         c) the URL signature is valid + non-expired (HMAC over
 *            userId|assetPath|expiry — see lib/assistantImageUrl.ts).
 *     - Triple defence: auth + ownership + signature. Any one missing
 *       returns 401/403/410 instead of leaking the bytes.
 *
 * Why a server proxy instead of a direct Object Storage URL? Replit's
 * @replit/object-storage SDK doesn't yet expose first-class GCS-style
 * signed URLs. We mirror the strategy used by tradelineSetupRoutes for
 * encrypted phone-bill PDFs: proxy + auth + ownership check.
 *
 * Dimension validation: `sharp` is not in package.json, so we don't
 * decode the image server-side. We validate magic bytes for the
 * declared MIME (PNG/JPEG/GIF/WEBP) which is cheap and stops the
 * obvious "rename .exe to .jpg" attack vector. Strict pixel-dimension
 * checking is left as a future enhancement (would require adding sharp).
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { requireSessionOrBearer } from "../lib/mobileAuth";
import { uploadEncryptedBuffer, downloadDecrypted } from "../lib/objectStorage";
import {
  buildSignedImageUrl,
  verifySignedImageUrl,
  getDefaultBaseUrl,
} from "../lib/assistantImageUrl";
import { createLogger } from "../lib/logger";

const log = createLogger("MobileAiImages");

/** Per the product spec: <= 10 MB decoded. */
const MAX_BYTES = 10 * 1024 * 1024;

/** Whitelist Anthropic's supported image MIME types. */
const ALLOWED_MIMES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

interface UploadBody {
  image?: string;     // base64-encoded body (no data-URL prefix)
  mimeType?: string;  // e.g. "image/jpeg"
}

/**
 * Sniff the buffer's leading bytes to confirm it actually matches the
 * declared MIME. Cheap defence against MIME-spoofing.
 */
function magicBytesMatch(mime: string, buf: Buffer): boolean {
  if (buf.length < 12) return false;
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      // FF D8 FF
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case "image/png":
      // 89 50 4E 47 0D 0A 1A 0A
      return (
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
        buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
      );
    case "image/gif":
      // "GIF87a" or "GIF89a"
      return buf.slice(0, 6).toString("ascii") === "GIF87a"
        || buf.slice(0, 6).toString("ascii") === "GIF89a";
    case "image/webp":
      // "RIFF" .... "WEBP"
      return buf.slice(0, 4).toString("ascii") === "RIFF"
        && buf.slice(8, 12).toString("ascii") === "WEBP";
    default:
      return false;
  }
}

/**
 * Confirm assetPath begins with the user's prefix. Multi-tenant guard
 * preventing user A from fetching user B's uploads even if they guess
 * a UUID.
 */
function assetBelongsToUser(assetPath: string, userId: number): boolean {
  const prefix = `assistant-uploads/${userId}/`;
  if (!assetPath.startsWith(prefix)) return false;
  // Reject path traversal attempts (`..`, leading `/`, double slashes).
  const rest = assetPath.slice(prefix.length);
  if (rest.includes("..") || rest.includes("//") || rest.startsWith("/")) return false;
  // Filename must be UUID-shaped (`<32hex>.<ext>` with no further slashes).
  return /^[a-z0-9]+\.[a-z0-9]+$/.test(rest);
}

export function registerMobileAiImagesRoutes(app: Express): void {
  /**
   * POST /api/mobile/ai/upload-image
   *
   * Body:
   *   {
   *     "image": "<base64 bytes>",
   *     "mimeType": "image/jpeg"
   *   }
   *
   * Returns:
   *   {
   *     "assetId": "assistant-uploads/<userId>/<uuid>.<ext>",
   *     "url": "https://.../api/mobile/ai/image/<assetId>?exp=...&sig=...",
   *     "mimeType": "image/jpeg",
   *     "sizeBytes": 245678
   *   }
   */
  app.post(
    "/api/mobile/ai/upload-image",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      try {
        const userId = (req.user as any)?.id as number | undefined;
        if (!userId) return res.status(401).json({ error: "Authentication required" });

        const { image, mimeType } = (req.body ?? {}) as UploadBody;

        if (!image || typeof image !== "string") {
          return res.status(400).json({ error: "image (base64 string) is required" });
        }
        if (!mimeType || typeof mimeType !== "string" || !mimeType.startsWith("image/")) {
          return res.status(400).json({ error: "mimeType must start with image/" });
        }

        const normalizedMime = mimeType.toLowerCase().split(";")[0].trim();
        const ext = ALLOWED_MIMES[normalizedMime];
        if (!ext) {
          return res.status(415).json({
            error: `Unsupported image type: ${mimeType}. Allowed: JPEG, PNG, GIF, WEBP.`,
          });
        }

        const buffer = Buffer.from(image, "base64");
        if (buffer.length === 0) {
          return res.status(400).json({ error: "Image is empty or not valid base64" });
        }
        if (buffer.length > MAX_BYTES) {
          return res.status(413).json({
            error: `Image exceeds ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit`,
          });
        }
        if (!magicBytesMatch(normalizedMime, buffer)) {
          return res.status(400).json({ error: "Image bytes do not match declared mimeType" });
        }

        const uuid = crypto.randomBytes(16).toString("hex");
        const assetPath = `assistant-uploads/${userId}/${uuid}.${ext}`;

        const result = await uploadEncryptedBuffer(assetPath, buffer);
        if (!result.ok) {
          log.error("upload failed", { userId, err: result.error });
          return res.status(502).json({ error: "Image storage upload failed" });
        }

        const url = buildSignedImageUrl({
          userId,
          assetPath,
          baseUrl: getDefaultBaseUrl(),
        });

        log.info("assistant image uploaded", {
          user_id: userId,
          asset: assetPath,
          bytes: buffer.length,
          mime: normalizedMime,
        });

        return res.json({
          assetId: assetPath,
          url,
          mimeType: normalizedMime,
          sizeBytes: buffer.length,
        });
      } catch (err) {
        log.error("upload threw", { err: (err as Error).message });
        return res.status(500).json({ error: "Upload failed" });
      }
    },
  );

  /**
   * GET /api/mobile/ai/image/*
   *
   * Streams the decrypted bytes back to the client. The wildcard
   * captures the full assetPath (which contains slashes).
   *
   * Query params:
   *   - exp: unix-seconds expiry baked into the signed URL
   *   - sig: HMAC-SHA256 hex over (userId|assetPath|exp)
   */
  app.get(
    "/api/mobile/ai/image/*path",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      try {
        const userId = (req.user as any)?.id as number | undefined;
        if (!userId) return res.status(401).json({ error: "Authentication required" });

        // `req.params.path` holds the wildcard portion (named wildcard *path).
        const assetPath = (req.params as any).path as string | undefined;
        if (!assetPath) return res.status(400).json({ error: "asset path missing" });

        if (!assetBelongsToUser(assetPath, userId)) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const expRaw = req.query.exp;
        const sigRaw = req.query.sig;
        if (typeof expRaw !== "string" || typeof sigRaw !== "string") {
          return res.status(400).json({ error: "exp and sig query params are required" });
        }
        const expiry = Number(expRaw);
        const ok = verifySignedImageUrl({
          userId,
          assetPath,
          expiry,
          signature: sigRaw,
        });
        if (!ok) {
          return res.status(410).json({ error: "URL expired or signature invalid" });
        }

        const download = await downloadDecrypted(assetPath);
        if (!download.ok) {
          if (download.notFound) {
            return res.status(404).json({ error: "Asset not found" });
          }
          log.error("download failed", { userId, asset: assetPath, err: download.error });
          return res.status(502).json({ error: "Image fetch failed" });
        }

        // Mirror MIME from the file extension. Anthropic's whitelist only
        // includes the four types we already validated at upload time, so
        // an extension-based lookup is safe and avoids a separate metadata
        // store.
        const extMatch = assetPath.match(/\.([a-z0-9]+)$/);
        const ext = extMatch?.[1] ?? "";
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
                   : ext === "png" ? "image/png"
                   : ext === "gif" ? "image/gif"
                   : ext === "webp" ? "image/webp"
                   : "application/octet-stream";

        res.setHeader("Content-Type", mime);
        res.setHeader("Content-Length", download.data.length);
        // Signed URL is short-lived; allow browser cache for its lifetime.
        res.setHeader("Cache-Control", "private, max-age=300");
        return res.send(download.data);
      } catch (err) {
        log.error("image serve threw", { err: (err as Error).message });
        return res.status(500).json({ error: "Image serve failed" });
      }
    },
  );
}
