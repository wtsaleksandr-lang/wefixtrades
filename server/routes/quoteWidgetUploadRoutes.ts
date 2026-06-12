/**
 * PRICING-MODELS U4 — public photo-upload endpoint for `photo_upload`
 * widget fields.
 *
 *   POST /api/quote-widget/upload
 *   body: { calculator_id, field_id, filename, data }
 *
 * Anonymous buyers attach job photos from the embedded quote widget. The
 * body follows the repo's base64-JSON pattern (chatAttachmentRoutes — no
 * multer): `data` is the raw base64 payload; a `data:<mime>;base64,` URI
 * prefix is tolerated and stripped (the widget client strips it, but be
 * liberal in what we accept).
 *
 * Response contract (the widget treats any failure as a per-tile retry
 * badge; the quote submit NEVER blocks on photos):
 *   200 { ok:true, url, filename, size, mime }
 *   400 { ok:false, reason:'bad_request' } — body failed validation, or the
 *                                            payload is empty/not base64
 *   404 { ok:false, reason:'not_found' }   — unknown calculator, or it has no
 *                                            photo_upload field with this
 *                                            field_id (cheap authz — random
 *                                            calculator ids can't turn this
 *                                            into a free anonymous file host)
 *   413 { ok:false, reason:'too_large' }   — decoded bytes exceed the cap
 *                                            (8 MB hard, or the field's
 *                                            smaller maxPhotoMb)
 *   415 { ok:false, reason:'bad_type' }    — magic bytes are not PNG/JPEG/WEBP
 *   429 { ok:false, reason:'quota' }       — per-IP per-minute or per-day cap
 * Expected paths never 500; an unexpected throw logs server-side and returns
 * 500 { ok:false, reason:'error' }.
 *
 * SECURITY:
 *   - Content type is decided by MAGIC BYTES, never the filename or a
 *     client-supplied mime. PNG bytes named `photo.jpg` are stored as .png;
 *     a text/script payload named `photo.jpg` is rejected 415.
 *   - The stored name is `<16-byte-random-hex><ext>` (fileStorage.saveFile);
 *     the client filename is sanitized and only echoed for display.
 *   - File CONTENT is never logged — only sizes/mimes/ids.
 *   - Storage: data/uploads/lead-photos, served read-only by the
 *     `app.use("/uploads", express.static(...))` mount in server/index.ts.
 *
 * BODY-SIZE PLUMBING: the global express.json() parser has the 100 KB
 * default limit and runs before all routes, so server/index.ts mounts a
 * path-scoped 12 MB parser for this route AHEAD of the global one (8 MB
 * decoded → ~10.9 MB base64 + JSON envelope). See the U4 comment there.
 *
 * The pure core (`processUploadRequest`) takes every dependency injected so
 * the regression gate (quoteWidgetUploadRoutes.test.ts, CI:
 * check:quote-widget-upload) drives it DB-free and disk-free.
 */
import type { Express, Request } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { saveFile } from "../services/fileStorage";
import { createLogger } from "../lib/logger";
import {
  photoUploadPerMinLimiter,
  photoUploadPerDayLimiter,
} from "../services/rateLimiter";

const log = createLogger("QuoteWidgetUpload");

/** Hard decoded-size ceiling, MB. A field's maxPhotoMb can lower it, never raise it. */
export const HARD_MAX_MB = 8;
const BYTES_PER_MB = 1024 * 1024;

/** Subfolder under data/uploads — public URLs are /uploads/lead-photos/<name>. */
export const UPLOAD_SUBFOLDER = "lead-photos";

/* ─── Request body ─── */

export const uploadRequestBody = z.object({
  calculator_id: z.number().int().positive(),
  field_id: z.string().min(1).max(120),
  // Display-only; sanitized before any use. Optional because clipboard
  // pastes can arrive nameless.
  filename: z.string().max(300).optional(),
  // Raw base64 (a data: URI prefix is tolerated). 8 MB decoded ≈ 10.9 MB
  // base64; anything past ~11.2 MB cannot be under the cap, so cap the
  // string length to fail cheap before decoding.
  data: z.string().min(1).max(Math.ceil((HARD_MAX_MB * BYTES_PER_MB * 4) / 3) + 4096),
});

/* ─── Magic-byte sniffing ──────────────────────────────────────────────────
 * POLICY: the magic bytes are the single source of truth for the content
 * type. The filename's extension is ignored for typing — PNG bytes named
 * `.jpg` are accepted AND stored as `.png`; non-image bytes named `.jpg`
 * are rejected 415. Allowlist: PNG, JPEG, WEBP (what phone cameras and
 * screenshots actually produce; SVG is excluded on purpose — it can carry
 * scripts and these files are served from our origin).
 */
export interface SniffedImage {
  mime: "image/png" | "image/jpeg" | "image/webp";
  ext: ".png" | ".jpg" | ".webp";
}

export function sniffImageType(buf: Buffer): SniffedImage | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { mime: "image/png", ext: ".png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: ".jpg" };
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", ext: ".webp" };
  }
  return null;
}

/** Strip an optional `data:<mime>;base64,` (or bare `data:,`) URI prefix. */
export function stripDataUriPrefix(data: string): string {
  return data.replace(/^data:[^,]*,/, "");
}

/** Sanitize the client filename for display + the saveFile name stem.
 *  Path separators and shell/HTML-risky chars are stripped; the DETECTED
 *  extension is always appended (the original extension carries no trust). */
export function sanitizeFilename(raw: string | undefined, ext: string): string {
  const stem = (raw ?? "")
    .replace(/\.[A-Za-z0-9]{1,8}$/, "") // drop the untrusted extension
    .replace(/[^A-Za-z0-9._-]+/g, "_") // allowlist; kills /, \, <>, quotes, ctrl chars
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 80);
  return `${stem || "photo"}${ext}`;
}

/* ─── Pure core (dependency-injected for the DB/disk-free regression gate) ─── */

export type UploadFailReason =
  | "bad_request"
  | "not_found"
  | "too_large"
  | "bad_type"
  | "quota"
  | "error";

export type UploadResponseBody =
  | { ok: true; url: string; filename: string; size: number; mime: string }
  | { ok: false; reason: UploadFailReason };

export interface UploadRequestInput {
  calculatorId: number;
  fieldId: string;
  filename?: string;
  data: string;
  ip: string;
}

export interface UploadDeps {
  loadCalculator: (
    id: number,
  ) => Promise<{ id: number; calculator_settings: unknown } | undefined>;
  /** Persist the buffer; returns the public URL (fileStorage.saveFile). */
  saveFile: (buffer: Buffer, name: string, subfolder: string) => Promise<string>;
  perMinLimiter: { check(key: string): Promise<boolean> };
  perDayLimiter: { check(key: string): Promise<boolean> };
}

export async function processUploadRequest(
  deps: UploadDeps,
  input: UploadRequestInput,
): Promise<{ status: number; body: UploadResponseBody }> {
  // 1. Per-IP burst cap — cheapest check first.
  if (!(await deps.perMinLimiter.check(`qq-upload:ip:${input.ip}`))) {
    return { status: 429, body: { ok: false, reason: "quota" } };
  }

  // 2. Load the calculator + cheap authz: it must actually HAVE a
  //    photo_upload field with this field_id, so random calculator ids
  //    can't turn the endpoint into an anonymous file host.
  const calculator = await deps.loadCalculator(input.calculatorId);
  if (!calculator) return { status: 404, body: { ok: false, reason: "not_found" } };

  const advanced = (calculator.calculator_settings as any)?.advanced;
  const fields: Array<{ id?: unknown; type?: unknown; maxPhotoMb?: unknown }> =
    Array.isArray(advanced?.fields) ? advanced.fields : [];
  const field = fields.find((f) => f?.id === input.fieldId && f?.type === "photo_upload");
  if (!field) return { status: 404, body: { ok: false, reason: "not_found" } };

  // 3. Effective size cap — the field's maxPhotoMb (clamped 1..8) when
  //    configured, else the 8 MB hard ceiling. Never above HARD_MAX_MB.
  const fieldMb =
    typeof field.maxPhotoMb === "number" && Number.isFinite(field.maxPhotoMb)
      ? Math.min(HARD_MAX_MB, Math.max(1, field.maxPhotoMb))
      : HARD_MAX_MB;
  const maxBytes = fieldMb * BYTES_PER_MB;

  // 4. Decode. Pre-estimate from base64 length first so an over-cap payload
  //    is rejected without allocating the buffer (base64 → bytes is ~3/4).
  const b64 = stripDataUriPrefix(input.data);
  const estimatedBytes = Math.floor((b64.length * 3) / 4);
  if (estimatedBytes > maxBytes + 1024) {
    return { status: 413, body: { ok: false, reason: "too_large" } };
  }
  const buffer = Buffer.from(b64, "base64");
  if (buffer.length === 0) {
    return { status: 400, body: { ok: false, reason: "bad_request" } };
  }
  if (buffer.length > maxBytes) {
    return { status: 413, body: { ok: false, reason: "too_large" } };
  }

  // 5. Magic bytes decide the type (filename/extension carries no trust).
  const sniffed = sniffImageType(buffer);
  if (!sniffed) {
    return { status: 415, body: { ok: false, reason: "bad_type" } };
  }

  // 6. Per-IP daily budget — checked LAST so rejected junk doesn't burn a
  //    real buyer's daily allowance; only uploads that will be stored count.
  if (!(await deps.perDayLimiter.check(`qq-upload:ip-day:${input.ip}`))) {
    return { status: 429, body: { ok: false, reason: "quota" } };
  }

  // 7. Store. saveFile generates a 16-byte-random hex name + our detected
  //    extension under data/uploads/lead-photos and returns the public URL
  //    (/uploads/lead-photos/<random><ext>), served by the static mount.
  const displayName = sanitizeFilename(input.filename, sniffed.ext);
  const url = await deps.saveFile(buffer, displayName, UPLOAD_SUBFOLDER);

  log.info("lead photo saved", {
    calculator_id: input.calculatorId,
    field_id: input.fieldId,
    size: buffer.length,
    mime: sniffed.mime,
  });

  return {
    status: 200,
    body: { ok: true, url, filename: displayName, size: buffer.length, mime: sniffed.mime },
  };
}

/* ─── Express wiring ─── */

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown"
  );
}

export function registerQuoteWidgetUploadRoutes(app: Express): void {
  app.post("/api/quote-widget/upload", async (req, res) => {
    try {
      const parsed = uploadRequestBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, reason: "bad_request" });
      }
      const { status, body } = await processUploadRequest(
        {
          loadCalculator: (id) => storage.getCalculatorById(id),
          saveFile,
          perMinLimiter: photoUploadPerMinLimiter,
          perDayLimiter: photoUploadPerDayLimiter,
        },
        {
          calculatorId: parsed.data.calculator_id,
          fieldId: parsed.data.field_id,
          filename: parsed.data.filename,
          data: parsed.data.data,
          ip: getClientIp(req),
        },
      );
      return res.status(status).json(body);
    } catch (error: any) {
      // Unexpected throw (disk full, etc.) — log honestly (never the file
      // content), return an enumerated failure the widget renders as a
      // retry badge. Expected paths never reach here.
      log.error("upload endpoint threw", { error: error?.message });
      return res.status(500).json({ ok: false, reason: "error" });
    }
  });
}
