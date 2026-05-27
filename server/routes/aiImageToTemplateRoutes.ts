/**
 * BF-5 + Wave 64 — Wizard "pricing doc → calculator template" endpoint.
 *
 * POST /api/ai/wizard/image-to-template
 *   Auth: requireAuth (wizard owner only — anonymous rejected).
 *   Body: multipart/form-data { image: File }   (field name kept as
 *         `image` for backward compatibility with the wizard's existing
 *         AIBubble client; the file can now be a PDF / XLSX / TXT / EML
 *         as well, dispatched per MIME type in pricingDocExtractor.ts).
 *   Returns: { template: ImageTemplate }
 *
 * Wave 64 expands the accepted formats from images-only to any common
 * pricing-doc format:
 *   - PNG / JPG / WEBP             → Claude vision (existing path)
 *   - PDF (application/pdf)        → pdf-parse → text → Claude text path
 *   - XLSX / XLS                   → sheetjs first sheet → text → Claude
 *   - text/plain, message/rfc822   → strip headers → text → Claude
 *
 * The JSON output schema is unchanged — Wave 65 owns schema expansion.
 *
 * Rate-limit: 5/hour/user via imageToTemplateRateLimiter. Vision calls
 * cost ~3-6× a text call so a per-IP / per-minute cap is not enough.
 * Text-mode calls are cheaper, but we keep the same limiter so we don't
 * have to ship a second rate-limit bucket for the v1 of this surface.
 *
 * Spend + auditing: aiService.chat() already routes spend through the
 * `quotequick` AI surface (see usageTracker + recordAiSpend). We write
 * an `audit_log` row with action `ai_pricing_doc_to_template` carrying
 * the source kind + byte-size + parse outcome. For dashboards that still
 * watch the old action name, we ALSO write the legacy
 * `ai_image_to_template` row for image-mode requests only. Pure-text
 * requests don't write the legacy action (they had no precedent).
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../auth";
import { createLogger } from "../lib/logger";
import { chat as aiChat, validateConfig } from "../services/aiService";
import { imageToTemplateRateLimiter } from "../services/rateLimiter";
import { AI_SURFACES } from "../services/aiSurfaces";
import { writeAudit } from "../lib/auditLog";
import {
  ALL_ACCEPTED_MIME_TYPES,
  ExtractionError,
  buildTextModePreamble,
  extractFromFile,
  IMAGE_MIME_TYPES,
} from "../services/pricingDocExtractor";

const log = createLogger("AIImageToTemplate");

/* ─── Multer config — broader accept list + size caps per type ──────── */
/** Hard cap for non-image uploads. PDFs of multi-page invoices are
 *  commonly 8-12MB; we set 15MB so a clean copy of a long pricing book
 *  goes through. */
const MAX_BYTES_NON_IMAGE = 15 * 1024 * 1024;
/** Image cap is held at 5MB (unchanged from the pre-Wave-64 limit) so
 *  Claude vision base64 payloads stay manageable. */
const MAX_BYTES_IMAGE = 5 * 1024 * 1024;
/** Multer can only enforce a single fileSize limit per upload; we set
 *  the higher cap and re-check the image-specific limit by hand in the
 *  handler below. */
const MAX_BYTES_MULTER = MAX_BYTES_NON_IMAGE;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES_MULTER, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (
      (ALL_ACCEPTED_MIME_TYPES as readonly string[]).includes(
        file.mimetype.toLowerCase(),
      )
    ) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

/* ─── Prompt — pinned per the BF-5 spec. Same schema applies to text +
 *     image inputs; text-mode prepends a one-line preamble naming the
 *     source kind so the model can disambiguate columns vs. line items. ── */
const EXTRACTION_PROMPT = `You are looking at a service-business quote, estimate, invoice, or pricing list for a trades business.
Extract the following and respond with ONLY a valid JSON object matching this schema:

{
  "title": "string — what kind of service",
  "basePrice": number,
  "currency": "USD",
  "addons": [
    { "label": "string", "price": number, "type": "checkbox" | "quantity" }
  ],
  "modifiers": [
    { "label": "string", "type": "percent" | "fixed", "value": number, "appliesTo": "base" | "total" }
  ],
  "notes": "string — any pricing rules or fine print visible"
}

Use null for any field you can't extract confidently. Do not guess. Return ONLY the JSON, no preamble.`;

/* ─── Response schema (matches spec — basePrice / addons / modifiers) ─── */
const addonSchema = z.object({
  label: z.string().min(1).max(120),
  price: z.number().finite().nullable(),
  type: z.enum(["checkbox", "quantity"]).default("checkbox"),
});

const modifierSchema = z.object({
  label: z.string().min(1).max(120),
  type: z.enum(["percent", "fixed"]),
  value: z.number().finite(),
  appliesTo: z.enum(["base", "total"]).default("total"),
});

const templateSchema = z.object({
  title: z.string().min(1).max(200).nullable(),
  basePrice: z.number().finite().nullable(),
  currency: z.string().min(1).max(8).default("USD"),
  addons: z.array(addonSchema).max(20).default([]),
  modifiers: z.array(modifierSchema).max(10).default([]),
  notes: z.string().max(2000).nullable().default(null),
});

export type ImageTemplate = z.infer<typeof templateSchema>;

/** Best-effort extraction of a JSON object from a raw model reply. */
function extractJson(raw: string): unknown | null {
  // Fast path: already pure JSON.
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  // Strip ``` fences.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  // Last resort: first { ... } block.
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

export function registerAiImageToTemplateRoutes(app: Express): void {
  app.post(
    "/api/ai/wizard/image-to-template",
    requireAuth,
    upload.single("image"),
    async (req: Request, res: Response) => {
      const userId = (req.user as Express.User).id;
      const rlKey = `image2tmpl:${userId}`;

      /* (1) Rate-limit — vision is expensive, text-mode less so but we
       *     share the bucket for v1. */
      const ok = await imageToTemplateRateLimiter.check(rlKey);
      if (!ok) {
        return res.status(429).json({
          error: "rate_limited",
          message:
            "You can only generate 5 templates from documents per hour. Try again later.",
        });
      }

      /* (2) Multer accepted file? */
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          error: "invalid_file",
          message:
            "Upload a PNG, JPG, WEBP image (≤5MB) or PDF / Excel / email (≤15MB).",
        });
      }
      const mimeRaw = file.mimetype.toLowerCase();

      // Re-enforce the image-specific size cap (multer can only carry one).
      const isImage = (IMAGE_MIME_TYPES as readonly string[]).includes(mimeRaw);
      if (isImage && file.size > MAX_BYTES_IMAGE) {
        return res.status(413).json({
          error: "image_too_large",
          message: "Image is too large — keep it under 5 MB.",
        });
      }

      /* (3) Anthropic key present? */
      const cfg = validateConfig();
      if (!cfg.valid) {
        return res.status(503).json({ error: "ai_unavailable", reason: cfg.error });
      }

      /* (4) Extract per format. The helper handles MIME detection +
       *     dispatches to pdf-parse / xlsx / text strippers. Image input
       *     is returned as a pass-through with the canonical mediaType. */
      let extraction: Awaited<ReturnType<typeof extractFromFile>>;
      try {
        extraction = await extractFromFile(file.buffer, mimeRaw);
      } catch (err: any) {
        if (err instanceof ExtractionError) {
          writeAudit({
            actorId: String(userId),
            actorType: "user",
            action: "ai_pricing_doc_to_template",
            entityType: "quotequick_calculator",
            entityId: `user:${userId}`,
            metadata: {
              outcome: "extraction_failed",
              code: err.code,
              bytes: file.size,
              mimeType: mimeRaw,
            },
            req,
          });
          return res.status(err.status).json({
            error: err.code,
            message: err.userMessage,
          });
        }
        log.error("unexpected extraction failure", {
          error: err?.message,
          mimeType: mimeRaw,
        });
        return res.status(500).json({
          error: "extraction_failed",
          message: "We couldn't read that file. Try a different format.",
        });
      }

      /* (5) Call Claude — vision path for images, text path for everything
       *     else. We deliberately reuse aiService.chat() so the spend
       *     automatically routes through the existing usageTracker +
       *     ai_system_gates pipeline keyed on `quotequick`. */
      let reply = "";
      try {
        if (extraction.kind === "image") {
          reply = await aiChat({
            system:
              "You extract pricing structure from quote/invoice images. Always respond with a single JSON object and nothing else.",
            messages: [{ role: "user", content: EXTRACTION_PROMPT }],
            userImageBlocks: [
              { mediaType: extraction.mediaType, data: extraction.buffer },
            ],
            maxTokens: 900,
            modelOverride: process.env.CLAUDE_VISION_MODEL || "claude-sonnet-4-6",
            surface: AI_SURFACES.quotequick,
            userId,
          });
        } else {
          // Text-mode: preamble + extraction prompt + the extracted text.
          // No vision model needed — let aiService pick its default text
          // Sonnet (cheaper, faster).
          const preamble = buildTextModePreamble(extraction.sourceKind);
          reply = await aiChat({
            system:
              "You extract pricing structure from quote/invoice/spreadsheet text. Always respond with a single JSON object and nothing else.",
            messages: [
              {
                role: "user",
                content: `${preamble}${EXTRACTION_PROMPT}\n\n--- BEGIN DOCUMENT ---\n${extraction.text}\n--- END DOCUMENT ---`,
              },
            ],
            maxTokens: 900,
            surface: AI_SURFACES.quotequick,
            userId,
          });
        }
      } catch (err: any) {
        log.error("AI call failed", {
          error: err?.message,
          status: err?.status,
          mode: extraction.kind,
        });
        writeAudit({
          actorId: String(userId),
          actorType: "user",
          action: "ai_pricing_doc_to_template",
          entityType: "quotequick_calculator",
          entityId: `user:${userId}`,
          metadata: {
            outcome: "ai_call_failed",
            bytes: file.size,
            mimeType: mimeRaw,
            mode: extraction.kind,
            sourceLabel: extraction.sourceLabel,
            error: String(err?.message ?? err).slice(0, 240),
          },
          req,
        });
        return res.status(502).json({
          error: "ai_call_failed",
          message:
            "We couldn't process that file right now. Try again in a moment.",
        });
      }

      /* (6) Parse + validate. */
      const rawJson = extractJson(reply);
      const parsed = templateSchema.safeParse(rawJson);
      if (!parsed.success) {
        log.warn("AI reply failed schema", {
          userId,
          mode: extraction.kind,
          replyPrefix: reply.slice(0, 200),
          issues: parsed.error.issues.slice(0, 4),
        });
        writeAudit({
          actorId: String(userId),
          actorType: "user",
          action: "ai_pricing_doc_to_template",
          entityType: "quotequick_calculator",
          entityId: `user:${userId}`,
          metadata: {
            outcome: "schema_invalid",
            bytes: file.size,
            mimeType: mimeRaw,
            mode: extraction.kind,
            sourceLabel: extraction.sourceLabel,
            replyPrefix: reply.slice(0, 200),
          },
          req,
        });
        return res.status(422).json({
          error: "extraction_failed",
          message:
            "I couldn't read that file clearly. Try a sharper copy, or paste your pricing details as text.",
        });
      }

      const template = parsed.data;

      /* (7) Audit success. Includes notes (e.g. multi-sheet xlsx) for
       *     dashboards tracking limitation hits. */
      writeAudit({
        actorId: String(userId),
        actorType: "user",
        action: "ai_pricing_doc_to_template",
        entityType: "quotequick_calculator",
        entityId: `user:${userId}`,
        metadata: {
          outcome: "ok",
          bytes: file.size,
          mimeType: mimeRaw,
          mode: extraction.kind,
          sourceLabel: extraction.sourceLabel,
          notes: extraction.kind === "text" ? extraction.notes : undefined,
          addonCount: template.addons.length,
          modifierCount: template.modifiers.length,
          hasBasePrice: template.basePrice != null,
        },
        req,
      });

      /* (7b) Back-compat: also emit the legacy action name for image-mode
       *      so any dashboards / alerts still keyed on
       *      `ai_image_to_template` keep firing. Text-mode is new and
       *      doesn't have a legacy peer. */
      if (extraction.kind === "image") {
        writeAudit({
          actorId: String(userId),
          actorType: "user",
          action: "ai_image_to_template",
          entityType: "quotequick_calculator",
          entityId: `user:${userId}`,
          metadata: {
            outcome: "ok",
            bytes: file.size,
            mediaType: extraction.mediaType,
            addonCount: template.addons.length,
            modifierCount: template.modifiers.length,
            hasBasePrice: template.basePrice != null,
            legacy_alias: true,
          },
          req,
        });
      }

      return res.json({ template });
    },
  );

  // Multer error normaliser — keep failures JSON-shaped for the wizard UI.
  app.use(
    "/api/ai/wizard/image-to-template",
    (
      err: any,
      _req: Request,
      res: Response,
      next: (e?: any) => void,
    ) => {
      if (!err) return next();
      if (err?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: "file_too_large",
          message:
            "File is too large — keep images under 5 MB and PDFs/Excel/email under 15 MB.",
        });
      }
      log.warn("upload error", { error: err?.message });
      return res.status(400).json({
        error: "upload_failed",
        message:
          "We couldn't accept that upload. Try a different file (photo, PDF, Excel, or email).",
      });
    },
  );
}
