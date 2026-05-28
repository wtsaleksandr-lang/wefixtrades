/**
 * Wave 64 — Pricing-doc extractor.
 *
 * Detects the MIME type of an uploaded pricing document and dispatches to
 * the right text-extraction routine. Returns either:
 *
 *   { kind: "image", buffer, mediaType }  — caller feeds the buffer to
 *                                            Claude's vision model.
 *   { kind: "text",  text, sourceLabel }  — caller prepends a one-line
 *                                            preamble and feeds the string
 *                                            to the text-mode chat path.
 *
 * Why one helper for both auth + anon routes:
 *   - Same MIME-detection + fallback logic.
 *   - Same "too little text" guard (PDF that's actually a scan, blank XLSX,
 *     empty .eml body, etc.) — single source of truth keeps both surfaces
 *     producing the same 422 error messages.
 *   - The two routes still own their own Anthropic call + audit because they
 *     have different rate-limit / spend-tracking / fallback strategies.
 *
 * Phase 1 scope (this wave):
 *   - PDF  → `pdf-parse` (mature, no native bindings; pinned to 1.1.1).
 *   - XLSX → `xlsx`/SheetJS first sheet only, joined as TSV-style text.
 *   - Email/plain text → strip MIME headers, return body.
 *   - Image → pass through (caller handles vision).
 *
 * Phase 2 (Wave 65) richens the JSON schema; Phase 3 (Wave 66) adds the
 * homeowner-job-photo direct-quote endpoint. Don't expand the schema here.
 *
 * Known limitations (documented in the PR body too):
 *   - Image-heavy / scanned PDFs that yield < 50 chars of text are rejected
 *     with a clear error; OCR fallback is intentionally NOT in Phase 1.
 *   - Multi-sheet Excel: only the FIRST sheet is parsed. We surface this in
 *     the audit metadata so we can see how often it bites.
 *   - Encrypted PDFs throw, and the route maps that to a 400 with an
 *     actionable message.
 */

// Import the lib entry directly to bypass pdf-parse's index.js debug shim,
// which under ESM detects `!module.parent` and tries to read a missing
// test fixture on first require. The lib export is the same function.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — no separate types for the deep path.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { createLogger } from "../lib/logger";

const log = createLogger("PricingDocExtractor");

/* ─── Lazy xlsx loader ──────────────────────────────────────────────────
 * Wave 97: xlsx is only needed for the Excel-MIME branch. We dynamic-import
 * it instead of a top-level static import so the server bundle compiles even
 * when xlsx isn't installed in the build environment (e.g. drifted
 * node_modules on Replit's publish container, where the workspace lockfile
 * lists xlsx but the install step has skipped it). If xlsx is missing at
 * runtime, the Excel branch fails with a clear 503 instead of taking down
 * the whole extractor — PDF / image / email / text paths keep working.
 *
 * Keep xlsx in package.json: it's still a real dependency for the runtime
 * Excel path when the install is healthy.
 */
// Types are erased at compile time; this `import("xlsx")` in a type position
// never reaches esbuild's bundle graph.
type XlsxRead = typeof import("xlsx").read;
type XlsxUtils = typeof import("xlsx").utils;
type XlsxModule =
  | { ok: true; read: XlsxRead; utils: XlsxUtils }
  | { ok: false; reason: "xlsx_module_unavailable" };

async function loadXlsx(): Promise<XlsxModule> {
  try {
    // Dynamic `import()` — esbuild keeps this as a runtime resolution and
    // does NOT hard-fail the bundle when xlsx is missing from node_modules
    // (unlike a top-level static `import`, which made Replit's publish step
    // crash with `Could not resolve "xlsx"` whenever the workspace drifted
    // from the lockfile). At runtime, a missing xlsx is caught here and the
    // Excel branch degrades to a clear 503 instead of crashing the request.
    const mod = (await import("xlsx")) as
      | { read: XlsxRead; utils: XlsxUtils }
      | { default: { read: XlsxRead; utils: XlsxUtils } };
    const resolved =
      "read" in mod
        ? mod
        : (mod as { default: { read: XlsxRead; utils: XlsxUtils } }).default;
    return { ok: true, read: resolved.read, utils: resolved.utils };
  } catch (err) {
    log.warn("xlsx module unavailable, Excel extraction disabled", {
      error: String((err as { message?: string })?.message ?? err).slice(0, 200),
    });
    return { ok: false, reason: "xlsx_module_unavailable" };
  }
}

/* ─── Accepted MIME types (single source of truth for both routes) ──── */

export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

export const PDF_MIME_TYPES = ["application/pdf"] as const;

export const EXCEL_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
] as const;

export const TEXT_MIME_TYPES = [
  "text/plain",
  "message/rfc822", // .eml
] as const;

export const ALL_ACCEPTED_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...PDF_MIME_TYPES,
  ...EXCEL_MIME_TYPES,
  ...TEXT_MIME_TYPES,
] as const;

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp";

/** Minimum extracted text length we'll send to the LLM. Anything shorter is
 *  almost certainly a scan-of-a-photo PDF, an empty XLSX, or a blank email
 *  body — we'd rather return a clear 422 than burn an AI call on noise. */
export const MIN_TEXT_LENGTH = 50;

/** Hard cap on extracted text we hand to the model. Past this we're paying
 *  per-token for noise; pricing docs rarely exceed a few KB. */
const MAX_TEXT_CHARS = 60_000;

/* ─── Discriminated result type ─────────────────────────────────────── */

export type ExtractionResult =
  | {
      kind: "image";
      mediaType: ImageMediaType;
      buffer: Buffer;
      /** Human label for audit logs (e.g. "image/png"). */
      sourceLabel: string;
    }
  | {
      kind: "text";
      /** Plain text to feed to the model. Already trimmed + length-capped. */
      text: string;
      /** Human-facing source kind: "pdf" | "spreadsheet" | "email". Used
       *  to build the one-line preamble before the extraction prompt. */
      sourceKind: "pdf" | "spreadsheet" | "email";
      /** Detailed label for audit metadata: "pdf:5pages",
       *  "xlsx:Sheet1of3", "email:plaintext". */
      sourceLabel: string;
      /** Optional notes for the audit/UI layer (e.g. "multi_sheet_xlsx"). */
      notes?: string[];
    };

/* ─── Structured errors ─────────────────────────────────────────────── */

export class ExtractionError extends Error {
  /** Stable code the route maps to an HTTP status. */
  code:
    | "unsupported_type"
    | "encrypted_pdf"
    | "empty_pdf"
    | "empty_spreadsheet"
    | "empty_text"
    | "too_little_text"
    | "parse_failed"
    | "xlsx_unavailable";
  /** Suggested HTTP status (the route is free to override). */
  status: number;
  /** Customer-facing message; the route can use as-is. */
  userMessage: string;

  constructor(
    code: ExtractionError["code"],
    status: number,
    userMessage: string,
    cause?: unknown,
  ) {
    super(userMessage);
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
    if (cause && cause instanceof Error) this.stack = cause.stack;
  }
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function normalizeMime(raw: string): string {
  return raw.toLowerCase().trim();
}

function isImageMime(mime: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}
function isPdfMime(mime: string): boolean {
  return (PDF_MIME_TYPES as readonly string[]).includes(mime);
}
function isExcelMime(mime: string): boolean {
  return (EXCEL_MIME_TYPES as readonly string[]).includes(mime);
}
function isTextMime(mime: string): boolean {
  return (TEXT_MIME_TYPES as readonly string[]).includes(mime);
}

function clipText(s: string): string {
  if (s.length <= MAX_TEXT_CHARS) return s;
  return s.slice(0, MAX_TEXT_CHARS) + "\n…[truncated]";
}

/** Strip common email/rfc822 headers (everything up to the first blank line
 *  that separates headers from the body). Falls back to the original text
 *  if no obvious header/body split is detected. */
function stripEmailHeaders(raw: string): string {
  // Normalize line endings before splitting.
  const norm = raw.replace(/\r\n/g, "\n");
  // RFC 5322: header block ends at the first empty line.
  const splitIdx = norm.indexOf("\n\n");
  if (splitIdx < 0) return norm;
  const headerBlock = norm.slice(0, splitIdx);
  // Heuristic: real headers look like "Header-Name: value" at line start.
  const looksLikeHeaders =
    /^(From|To|Subject|Date|Message-Id|Reply-To|Cc|Bcc|Content-Type):/im.test(
      headerBlock,
    );
  if (!looksLikeHeaders) return norm;
  return norm.slice(splitIdx + 2);
}

/* ─── PDF extraction ────────────────────────────────────────────────── */

async function extractFromPdf(
  buffer: Buffer,
): Promise<{ text: string; pages: number }> {
  let parsed: { text: string; numpages: number };
  try {
    // pdf-parse returns { text, numpages, info, metadata, version }.
    parsed = await pdfParse(buffer);
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (/password|encrypted|encryption/i.test(msg)) {
      throw new ExtractionError(
        "encrypted_pdf",
        400,
        "This PDF is encrypted — re-save it without password protection and try again.",
        err,
      );
    }
    log.warn("pdf-parse threw", { error: msg.slice(0, 200) });
    throw new ExtractionError(
      "parse_failed",
      422,
      "We couldn't read this PDF. Try a different file or paste your pricing as text.",
      err,
    );
  }
  const text = (parsed.text ?? "").trim();
  return { text, pages: parsed.numpages ?? 1 };
}

/* ─── Excel extraction ──────────────────────────────────────────────── */

async function extractFromExcel(buffer: Buffer): Promise<{
  text: string;
  sheetUsed: string;
  totalSheets: number;
}> {
  const xlsx = await loadXlsx();
  if (!xlsx.ok) {
    // Bundle was built without xlsx available (drifted node_modules etc.).
    // Surface a clear, actionable message instead of a 500 — the uploader
    // can fall back to PDF/photo/email of the same price list.
    throw new ExtractionError(
      "xlsx_unavailable",
      503,
      "Excel uploads are temporarily unavailable on this deployment. Please upload a PDF, photo, or email of your pricing instead.",
    );
  }
  let workbook: ReturnType<typeof xlsx.read>;
  try {
    workbook = xlsx.read(buffer, { type: "buffer" });
  } catch (err: any) {
    log.warn("xlsx read threw", { error: String(err?.message ?? err).slice(0, 200) });
    throw new ExtractionError(
      "parse_failed",
      422,
      "We couldn't read this spreadsheet. Try saving it as .xlsx and uploading again.",
      err,
    );
  }
  const totalSheets = workbook.SheetNames?.length ?? 0;
  if (totalSheets === 0) {
    throw new ExtractionError(
      "empty_spreadsheet",
      422,
      "This spreadsheet appears to be empty. Add your pricing rows and try again.",
    );
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new ExtractionError(
      "empty_spreadsheet",
      422,
      "This spreadsheet appears to be empty. Add your pricing rows and try again.",
    );
  }
  // Render as 2D array → join rows with \n, cells with \t. Matches how a
  // plain-text dump of a price list reads in chat, which is what the
  // extraction prompt was trained against.
  const rows: unknown[][] = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  }) as unknown[][];
  const text = rows
    .map((row) =>
      row
        .map((cell) =>
          cell == null ? "" : String(cell).replace(/\t/g, " ").replace(/\n/g, " "),
        )
        .join("\t"),
    )
    .join("\n")
    .trim();
  return { text, sheetUsed: sheetName, totalSheets };
}

/* ─── Plain-text / email extraction ─────────────────────────────────── */

function extractFromText(
  buffer: Buffer,
  mime: string,
): { text: string; isEmail: boolean } {
  const raw = buffer.toString("utf8");
  if (mime === "message/rfc822") {
    return { text: stripEmailHeaders(raw).trim(), isEmail: true };
  }
  return { text: raw.trim(), isEmail: false };
}

/* ─── Public entry point ────────────────────────────────────────────── */

/**
 * Detect the file's MIME type and route to the right extractor.
 *
 * Throws ExtractionError on any failure the caller should surface as a
 * specific HTTP status. Generic crashes bubble up unmodified.
 */
export async function extractFromFile(
  buffer: Buffer,
  mimeTypeRaw: string,
): Promise<ExtractionResult> {
  const mime = normalizeMime(mimeTypeRaw);

  /* ─── Image: pass through. ─── */
  if (isImageMime(mime)) {
    // image/jpg → image/jpeg (Anthropic only accepts the canonical form).
    const mediaType: ImageMediaType =
      mime === "image/jpg" ? "image/jpeg" : (mime as ImageMediaType);
    return {
      kind: "image",
      mediaType,
      buffer,
      sourceLabel: mediaType,
    };
  }

  /* ─── PDF. ─── */
  if (isPdfMime(mime)) {
    const { text, pages } = await extractFromPdf(buffer);
    if (!text) {
      throw new ExtractionError(
        "empty_pdf",
        422,
        "We couldn't read enough text from this PDF. Try a clearer copy or a photo of the original.",
      );
    }
    if (text.length < MIN_TEXT_LENGTH) {
      throw new ExtractionError(
        "too_little_text",
        422,
        "We couldn't read enough text from this PDF — it may be a scanned image. Try a photo of the original instead.",
      );
    }
    return {
      kind: "text",
      text: clipText(text),
      sourceKind: "pdf",
      sourceLabel: `pdf:${pages}pages`,
    };
  }

  /* ─── Excel. ─── */
  if (isExcelMime(mime)) {
    const { text, sheetUsed, totalSheets } = await extractFromExcel(buffer);
    if (!text || text.length < MIN_TEXT_LENGTH) {
      throw new ExtractionError(
        "too_little_text",
        422,
        "We couldn't read enough text from this spreadsheet. Make sure your pricing rows are on the first sheet and try again.",
      );
    }
    return {
      kind: "text",
      text: clipText(text),
      sourceKind: "spreadsheet",
      sourceLabel: `xlsx:${sheetUsed}-of-${totalSheets}`,
      notes: totalSheets > 1 ? ["multi_sheet_xlsx_first_only"] : undefined,
    };
  }

  /* ─── Plain text / email. ─── */
  if (isTextMime(mime)) {
    const { text, isEmail } = extractFromText(buffer, mime);
    if (!text) {
      throw new ExtractionError(
        "empty_text",
        422,
        "This file appears to be empty. Paste your pricing details and try again.",
      );
    }
    if (text.length < MIN_TEXT_LENGTH) {
      throw new ExtractionError(
        "too_little_text",
        422,
        "We couldn't read enough text from this file. Add more pricing detail and try again.",
      );
    }
    return {
      kind: "text",
      text: clipText(text),
      sourceKind: "email",
      sourceLabel: isEmail ? "email:rfc822" : "email:plaintext",
    };
  }

  throw new ExtractionError(
    "unsupported_type",
    400,
    "Upload a photo, PDF, Excel sheet, or email of your pricing.",
  );
}

/** One-line preamble we prepend to the extraction prompt for text-mode. */
export function buildTextModePreamble(
  sourceKind: "pdf" | "spreadsheet" | "email",
): string {
  const label =
    sourceKind === "pdf"
      ? "PDF"
      : sourceKind === "spreadsheet"
        ? "spreadsheet"
        : "email";
  return `Below is the text extracted from a ${label}. Treat tabs as column separators and newlines as row separators where relevant.\n\n`;
}
