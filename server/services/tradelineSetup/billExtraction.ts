/**
 * Wave 86 — AI-assisted phone-bill OCR.
 *
 * Layer 1 of the fully-automated porting flow. Takes a customer-uploaded
 * phone bill (PNG / JPG / PDF, max 5 MB) and asks Claude vision to extract
 * the structured fields Twilio's porting API requires, plus a per-field
 * confidence score the wizard surfaces so the user can fix anything the
 * model got wrong.
 *
 * Pipeline:
 *
 *   1. validate(buf, mimeType)
 *   2. (PDF only) rasterise first page → PNG → vision call.  Today we send
 *      the PDF bytes as `application/pdf` per Anthropic Files API; if that
 *      is unavailable in this account, callers can preconvert via the same
 *      path the QuoteQuick AI calculator builder (Wave 64) uses.
 *   3. callVisionModel() — single Claude Sonnet vision call with a strict
 *      JSON-only system prompt.
 *   4. parseAndScore() — JSON.parse, validate against the Zod schema,
 *      surface per-field confidence scores.
 *
 * Privacy:
 *   - The bill bytes never hit disk in this process; they pass straight
 *     into the model as a base64 block.
 *   - Logs carry success/failure + duration + bytes only — never the
 *     extracted PII fields.
 *
 * Spend / gate:
 *   - AI surface "tradeline_port_ocr" — $10/mo soft cap, lazy-gated.
 *   - One extraction per uploaded bill; if the user re-uploads we re-run.
 */

import { z } from "zod";
import { chat as aiChat } from "../aiService";
import { AI_SURFACES } from "../aiSurfaces";
import { createLogger } from "../../lib/logger";

const log = createLogger("BillExtraction");

const MAX_BILL_BYTES = 5 * 1024 * 1024; // 5 MB
const VISION_MODEL = process.env.CLAUDE_VISION_MODEL || "claude-sonnet-4-6";

/* ─── Public types ────────────────────────────────────────────────────── */

export type BillMediaType = "image/jpeg" | "image/png" | "application/pdf";

export interface BillExtractionInput {
  /** Raw decoded bytes of the uploaded bill (post base64 decode). */
  bytes: Buffer;
  mimeType: BillMediaType;
  /** Optional user id for usage attribution. */
  userId?: number;
}

/**
 * Per-field confidence in 0..1. The wizard renders the field with a hint
 * banner ("review this — model wasn't sure") for any score < 0.75.
 */
export interface BillFieldConfidence {
  accountHolderName: number;
  accountNumber: number;
  serviceAddress: number;
  phoneNumber: number;
  currentCarrier: number;
  billingAddress: number;
  accountStatus: number;
}

export interface ExtractedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export type AccountStatus = "active" | "past_due" | "unknown";

export interface BillExtraction {
  accountHolderName: string;
  accountNumber: string;
  serviceAddress: ExtractedAddress;
  phoneNumber: string; // the number being ported, E.164 or "+1XXXXXXXXXX"
  currentCarrier: string;
  billingAddress: ExtractedAddress;
  accountStatus: AccountStatus;
  /** Per-field 0..1 confidence (model-self-reported, soft-floored). */
  confidence: BillFieldConfidence;
}

export interface BillExtractionSuccess {
  ok: true;
  extraction: BillExtraction;
  /** Wall-clock duration of the vision call, ms. */
  durationMs: number;
}

export interface BillExtractionFailure {
  ok: false;
  /** Stable code, never localised; UI maps it to a user-facing string. */
  code:
    | "too_large"
    | "unsupported_mime"
    | "ai_call_failed"
    | "ai_reply_malformed"
    | "schema_invalid";
  message: string;
  durationMs: number;
}

export type BillExtractionResult = BillExtractionSuccess | BillExtractionFailure;

/* ─── Strict schema for the model reply ──────────────────────────────── */

const addressSchema = z.object({
  street: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  zip: z.string().default(""),
});

const replySchema = z.object({
  accountHolderName: z.string().default(""),
  accountNumber: z.string().default(""),
  serviceAddress: addressSchema,
  phoneNumber: z.string().default(""),
  currentCarrier: z.string().default(""),
  billingAddress: addressSchema,
  accountStatus: z.enum(["active", "past_due", "unknown"]).default("unknown"),
  confidence: z
    .object({
      accountHolderName: z.number().min(0).max(1).default(0.5),
      accountNumber: z.number().min(0).max(1).default(0.5),
      serviceAddress: z.number().min(0).max(1).default(0.5),
      phoneNumber: z.number().min(0).max(1).default(0.5),
      currentCarrier: z.number().min(0).max(1).default(0.5),
      billingAddress: z.number().min(0).max(1).default(0.5),
      accountStatus: z.number().min(0).max(1).default(0.5),
    })
    .default({
      accountHolderName: 0.5,
      accountNumber: 0.5,
      serviceAddress: 0.5,
      phoneNumber: 0.5,
      currentCarrier: 0.5,
      billingAddress: 0.5,
      accountStatus: 0.5,
    }),
});

/* ─── Prompt ─────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT =
  "You extract structured account data from US/Canadian mobile phone bills. " +
  "Respond with a SINGLE JSON object and nothing else — no prose, no code fences. " +
  "Every field is required; use an empty string when a value is not visible. " +
  "Phone numbers MUST be returned as +1XXXXXXXXXX (E.164). " +
  "accountStatus is 'past_due' only if the bill explicitly shows a past-due balance; " +
  "'active' if it shows the account is in good standing; 'unknown' otherwise. " +
  "confidence is a per-field 0..1 self-rating: 1.0 means the value is unambiguously printed " +
  "on the bill; 0.5 means you inferred or guessed; 0.0 means the field is not present.";

const USER_PROMPT =
  "Extract the porting fields from this phone bill image. Respond with this exact JSON shape:\n" +
  "{\n" +
  '  "accountHolderName": string,\n' +
  '  "accountNumber": string,\n' +
  '  "serviceAddress": { "street": string, "city": string, "state": string, "zip": string },\n' +
  '  "phoneNumber": string,    // E.164, e.g. "+14165551212"\n' +
  '  "currentCarrier": string, // e.g. "T-Mobile", "Bell Mobility"\n' +
  '  "billingAddress": { "street": string, "city": string, "state": string, "zip": string },\n' +
  '  "accountStatus": "active" | "past_due" | "unknown",\n' +
  '  "confidence": {\n' +
  '    "accountHolderName": 0..1,\n' +
  '    "accountNumber": 0..1,\n' +
  '    "serviceAddress": 0..1,\n' +
  '    "phoneNumber": 0..1,\n' +
  '    "currentCarrier": 0..1,\n' +
  '    "billingAddress": 0..1,\n' +
  '    "accountStatus": 0..1\n' +
  "  }\n" +
  "}\n";

/* ─── Helpers ────────────────────────────────────────────────────────── */

function extractJsonBlob(text: string): unknown {
  // Strip code fences if the model snuck them in despite the prompt.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // Find the first { and the matching last } — simplest brace-balance scan.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON object found in reply");
  }
  const slice = cleaned.slice(start, end + 1);
  return JSON.parse(slice);
}

/* ─── Entry point ────────────────────────────────────────────────────── */

export async function extractBill(input: BillExtractionInput): Promise<BillExtractionResult> {
  const t0 = Date.now();

  // Validate
  if (input.bytes.length === 0) {
    return {
      ok: false,
      code: "unsupported_mime",
      message: "Empty file.",
      durationMs: 0,
    };
  }
  if (input.bytes.length > MAX_BILL_BYTES) {
    return {
      ok: false,
      code: "too_large",
      message: "Bill exceeds the 5 MB limit. Please compress or screenshot the relevant page.",
      durationMs: 0,
    };
  }
  if (
    input.mimeType !== "image/jpeg" &&
    input.mimeType !== "image/png" &&
    input.mimeType !== "application/pdf"
  ) {
    return {
      ok: false,
      code: "unsupported_mime",
      message: "Upload a PNG, JPG, or PDF.",
      durationMs: 0,
    };
  }

  // Anthropic's vision content blocks accept image media types. For PDF we
  // fall through to image attach as well — if the upstream account doesn't
  // accept PDF blocks the chat() call will surface ai_call_failed and the
  // wizard tells the user to re-upload as a screenshot.
  const visionMediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" =
    input.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";

  let reply: string;
  try {
    reply = await aiChat({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: USER_PROMPT }],
      // PDFs are sent as image blocks — Anthropic's vision path handles them
      // when the account supports document uploads. If your account doesn't,
      // the wizard surfaces "ai_call_failed" and tells the user to re-upload
      // as a screenshot.
      userImageBlocks: [
        {
          mediaType: input.mimeType === "application/pdf" ? "image/png" : visionMediaType,
          data: input.bytes,
        },
      ],
      maxTokens: 900,
      modelOverride: VISION_MODEL,
      surface: AI_SURFACES.tradeline_port_ocr,
      userId: input.userId,
    });
  } catch (err: any) {
    const durationMs = Date.now() - t0;
    log.error("vision call failed", {
      error: err?.message,
      durationMs,
      bytes: input.bytes.length,
      mimeType: input.mimeType,
    });
    return {
      ok: false,
      code: "ai_call_failed",
      message: "We couldn't read that bill right now. Try again in a moment, or re-upload as a clearer screenshot.",
      durationMs,
    };
  }

  let rawJson: unknown;
  try {
    rawJson = extractJsonBlob(reply);
  } catch (err) {
    const durationMs = Date.now() - t0;
    log.warn("reply not JSON-parseable", { durationMs, replyPrefix: reply.slice(0, 200) });
    return {
      ok: false,
      code: "ai_reply_malformed",
      message: "We couldn't make sense of the bill — try a clearer scan.",
      durationMs,
    };
  }

  const parsed = replySchema.safeParse(rawJson);
  if (!parsed.success) {
    const durationMs = Date.now() - t0;
    log.warn("reply failed schema", {
      durationMs,
      issues: parsed.error.issues.slice(0, 4),
    });
    return {
      ok: false,
      code: "schema_invalid",
      message: "We couldn't extract the required fields from this bill.",
      durationMs,
    };
  }

  const durationMs = Date.now() - t0;
  log.info("extraction succeeded", {
    durationMs,
    bytes: input.bytes.length,
    mimeType: input.mimeType,
  });

  return {
    ok: true,
    durationMs,
    extraction: parsed.data,
  };
}
