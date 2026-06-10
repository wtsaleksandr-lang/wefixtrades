/**
 * BF-5 + Wave 64 — Wizard "pricing doc → calculator template" endpoint.
 *
 * POST /api/ai/wizard/image-to-template
 *   Auth: anonymous + free (Wave WAI). Vision is the most expensive call, so
 *     anonymous callers get the STRICTEST per-IP caps (per-minute + per-day);
 *     logged-in callers keep the per-user hourly cap.
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
import { createLogger } from "../lib/logger";
import { chat as aiChat, validateConfig } from "../services/aiService";
import {
  imageToTemplateRateLimiter,
  anonImageToTemplatePerMinLimiter,
  anonImageToTemplatePerDayLimiter,
} from "../services/rateLimiter";
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
 *     source kind so the model can disambiguate columns vs. line items.
 *
 *     Wave 64.5: tuned prompt for multi-format quality after verification.
 *     Adds format-aware hints (PDF page-break artifacts, spreadsheet TSV
 *     framing, email signature/header noise, handwritten OCR caution) and
 *     clarifies basePrice vs grand total + signed discount conventions.
 *     Lifted Excel from 15/20 → 19/20 without regressing other formats.
 *
 *     Wave 65.1: added optional `clarification` (ask the user one question
 *     when pricing is genuinely ambiguous) and `styling` (brand-colour / CTA
 *     hints extracted from the quote's visual identity). ── */
const EXTRACTION_PROMPT = `You are looking at a service-business quote, estimate, invoice, or pricing list for a trades business.

Source-format hints:
- If the input came from a PDF, ignore page-break artifacts, page numbers, and repeated headers / footers across pages.
- If the input came from a spreadsheet, each row is one pricing item. Tabs separate columns; common columns: label, price, qty, rate.
- If the input came from an email, ignore the signature block, "Sent from my iPhone" lines, quoted-reply blocks, and headers like From/To/Subject.
- If the input is from an image and the writing looks handwritten, read carefully — handwritten "0" can look like "O", "1" like "l". Use surrounding context (currency symbols, line layout) to disambiguate.

Extract the following and respond with ONLY a valid JSON object matching this schema:

{
  "title": "string — what kind of service this quote is for (e.g. 'Junk removal', 'HVAC service call', 'Lawn mowing')",
  "basePrice": number — the headline service charge a customer pays before any add-ons (use ONLY for a single flat service; see lineItems below for multi-unit jobs),
  "lineItems": [
    { "label": "string — the priced product/unit (e.g. 'Double-hung window')", "unitPrice": number, "quantity": number, "unit": "string — optional, e.g. 'window', 'room', 'hour', 'sq ft'" }
  ],
  "currency": "USD",
  "addons": [
    { "label": "string", "price": number, "type": "checkbox" | "quantity" }
  ],
  "modifiers": [
    { "label": "string", "type": "percent" | "fixed", "value": number, "appliesTo": "base" | "total" }
  ],
  "notes": "string — any pricing rules, payment terms, or fine print",
  "clarification": {
    "question": "string — ONE concise question for the user",
    "options": [
      { "label": "string — short answer option (2-4 options total)", "hint": "string — optional extra context" }
    ],
    "reason": "string — optional: why you need this clarification"
  },
  "styling": {
    "themeHint": "blue" | "red" | "green" | "dark" | "yellow" | "neutral",
    "businessName": "string — business name if visible on the quote",
    "tagline": "string — tagline or slogan if visible",
    "ctaLabel": "string — e.g. 'Get My Towing Quote', 'Book a Cleaning', derived from the service type",
    "trustHints": ["string — ONLY trust signals LITERALLY present on the quote, e.g. 'Licensed & Insured', 'Family owned since 1998'"]
  }
}

Rules:
- basePrice vs lineItems — pick ONE:
  - If the quote prices a SINGLE flat service (e.g. "Standard house clean — $180"), put that number in basePrice and leave lineItems empty.
  - If the quote's price is driven by MULTIPLE priced units/products (e.g. "8 double-hung windows @ $525 each + 2 picture windows @ $640 each", or per-room / per-hour / per-sq-ft pricing), emit EACH as a lineItem with its per-unit price (unitPrice) and the quoted count (quantity). Do NOT multiply unit price × quantity into a single basePrice, and do NOT also fill basePrice — the customer must be able to change the counts. Set basePrice to null in this case.
- basePrice (when used) is a single number, not a range. If the source shows a range, use the LOWER bound and put the range in notes.
- lineItems.unitPrice is the price of ONE unit (not the line total). lineItems.quantity is the quoted count for that unit.
- addons: each is one optional item a customer can pick. "checkbox" = on/off, "quantity" = customer enters a count.
- modifiers: percent values are stored as numbers (e.g. 15 for 15%, not 0.15). "appliesTo": "base" means it adjusts the base price only; "total" means after add-ons.
- Hourly rates / multipliers go in modifiers as type="percent" only if they're % surcharges (after-hours +50% etc.). A flat per-hour rate is a modifier with type="fixed" and appliesTo="total".
- Don't invent items. If the source doesn't mention something, omit it. Use null only for top-level fields you can't extract confidently.
- clarification: ONLY include this field when the pricing structure is genuinely ambiguous in a way that materially changes the calculator — e.g. you cannot tell if a price is per-unit or a total, you cannot read key numbers, or there are multiple plausible pricing models. Do NOT guess when ambiguous: return clarification with ONE concise question and 2-4 concrete answer options. Include your best-effort partial template if any. Omit clarification entirely when you can extract the pricing confidently.
- styling: Extract ONLY from what is visually present on the quote. themeHint is the dominant brand-colour family you see (logo, header, accent colour). businessName and tagline are taken verbatim from the document. ctaLabel is a short action phrase appropriate for the service type. trustHints are ONLY trust signals LITERALLY printed on the quote — do not invent them. Omit the entire styling object (or individual fields) when you are unsure.

Return ONLY the JSON, no preamble, no code fences.`;

/* ─── Wave 65.1 — clarification + styling schemas ─────────────────────── */

/** One answer option the user can tap to resolve an ambiguous quote. */
const clarificationOptionSchema = z.object({
  label: z.string().min(1).max(120),
  hint: z.string().max(200).optional(),
});

/**
 * Returned by the AI when pricing is too ambiguous to extract confidently.
 * The client renders the question + options as chat quick-replies, then
 * re-POSTs the same file with `clarificationAnswer=<label>` so the model
 * can extract on the second pass with the answer in context.
 */
const clarificationSchema = z.object({
  question: z.string().min(1).max(300),
  options: z.array(clarificationOptionSchema).min(2).max(4),
  reason: z.string().max(300).optional(),
});

/**
 * Brand / visual identity hints the AI picks from the quote.  All fields are
 * optional — the client falls back gracefully when any are absent.
 */
const stylingSchema = z.object({
  themeHint: z.enum(['blue', 'red', 'green', 'dark', 'yellow', 'neutral']).optional(),
  businessName: z.string().max(120).optional(),
  tagline: z.string().max(200).optional(),
  ctaLabel: z.string().max(120).optional(),
  trustHints: z.array(z.string().max(120)).max(6).optional(),
});

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

/* Wave 65 — quantity-driven primary line items. A multi-unit quote (N
 * windows @ $P each, per-room, per-hour, per-sq-ft) emits one line item
 * per priced unit so the customer can change counts, instead of collapsing
 * to a single flat basePrice. Tolerant: missing quantity defaults to 1. */
const lineItemSchema = z.object({
  label: z.string().min(1).max(120),
  unitPrice: z.number().finite().nullable(),
  quantity: z.number().finite().nullable().default(1),
  unit: z.string().min(1).max(40).nullable().optional(),
});

const templateSchema = z.object({
  title: z.string().min(1).max(200).nullable(),
  basePrice: z.number().finite().nullable(),
  lineItems: z.array(lineItemSchema).max(20).default([]),
  currency: z.string().min(1).max(8).default("USD"),
  addons: z.array(addonSchema).max(20).default([]),
  modifiers: z.array(modifierSchema).max(10).default([]),
  notes: z.string().max(2000).nullable().default(null),
  /** Wave 65.1 — present only when the AI needs more info before extracting. */
  clarification: clarificationSchema.optional(),
  /** Wave 65.1 — brand / visual identity hints extracted from the quote. */
  styling: stylingSchema.optional(),
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
    upload.single("image"),
    async (req: Request, res: Response) => {
      /* Wave WAI — anonymous + free. `req.user` may be absent (most wizard
       * traffic is anonymous). Null-safe: never dereference a missing user. */
      const userId = (req.user as Express.User | undefined)?.id ?? null;
      const ip = req.ip || req.socket?.remoteAddress || "unknown";

      /* Audit identity — authed callers are attributed by user id; anonymous
       * callers by their IP (so the audit trail still distinguishes sources).
       * `actorType` is constrained to admin|system|user by the shared audit
       * type, so anonymous maps to "system" with an `ip:`-prefixed actorId +
       * `anon:` entity id to keep it greppable. Used by every writeAudit()
       * below + the entity id. */
      const auditActorId = userId != null ? String(userId) : `ip:${ip}`;
      const auditActorType: "user" | "system" = userId != null ? "user" : "system";
      const auditEntityId = userId != null ? `user:${userId}` : `anon:${ip}`;

      /* (1) Rate-limit — vision is the most expensive call.
       *       - Authed: per-user 5/hour (imageToTemplateRateLimiter).
       *       - Anonymous: STRICT per-IP per-minute AND per-day caps (the only
       *         ceiling, since there's no DB budget row for an anonymous IP). */
      if (userId != null) {
        const ok = await imageToTemplateRateLimiter.check(`image2tmpl:${userId}`);
        if (!ok) {
          return res.status(429).json({
            error: "rate_limited",
            message:
              "You can only generate 5 templates from documents per hour. Try again later.",
          });
        }
      } else {
        const dayOk = await anonImageToTemplatePerDayLimiter.check(`anon-img2tmpl-day:${ip}`);
        if (!dayOk) {
          return res.status(429).json({
            error: "rate_limited",
            scope: "daily",
            message:
              "You've reached today's free document-to-template limit. Create a free account or try again tomorrow.",
          });
        }
        const minOk = await anonImageToTemplatePerMinLimiter.check(`anon-img2tmpl-min:${ip}`);
        if (!minOk) {
          return res.status(429).json({
            error: "rate_limited",
            scope: "minute",
            message:
              "You're generating templates too quickly. Please wait a moment and try again.",
          });
        }
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

      /* Wave 65.1 — optional clarification answer from a prior round-trip.
       * Sent as a multipart text field alongside the (re-uploaded) file.
       * When present, prepend it to the prompt so the second-pass extraction
       * has the user's answer in context. The server remains fully stateless —
       * the client re-uploads the same file rather than caching on the server. */
      const clarificationAnswer =
        typeof req.body?.clarificationAnswer === "string"
          ? req.body.clarificationAnswer.slice(0, 500).trim()
          : null;
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
            actorId: auditActorId,
            actorType: auditActorType,
            action: "ai_pricing_doc_to_template",
            entityType: "quotequick_calculator",
            entityId: auditEntityId,
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
      /* Wave 65.1 — when the user answered a clarification question, prepend
       * their answer to the prompt so the model extracts with that context. */
      const clarificationPreamble = clarificationAnswer
        ? `The user clarified: "${clarificationAnswer}"\n\nNow extract the pricing using that answer. `
        : "";

      /* Wave 65.1 — when a clarification answer is present, instruct the model
       * to extract confidently (not ask again). Appended to the system prompt. */
      const clarificationSystemSuffix = clarificationAnswer
        ? " The user has already answered a clarification question — do NOT return another clarification; extract the pricing directly."
        : "";

      let reply = "";
      try {
        if (extraction.kind === "image") {
          reply = await aiChat({
            // Wave 64.5: tuned system prompt to clarify basePrice vs grand total
            // and add-on vs modifier distinction after verification.
            system:
              `You extract pricing structure from quote/invoice/pricing-sheet content. Always respond with a single JSON object and nothing else. The base price is the headline service charge, NOT the grand total. Add-ons are optional line items the customer can pick; modifiers are percentage or fixed adjustments (discounts, surcharges, hourly multipliers).${clarificationSystemSuffix}`,
            messages: [{ role: "user", content: `${clarificationPreamble}${EXTRACTION_PROMPT}` }],
            userImageBlocks: [
              { mediaType: extraction.mediaType, data: extraction.buffer },
            ],
            maxTokens: 1100,
            modelOverride: process.env.CLAUDE_VISION_MODEL || "claude-sonnet-4-6",
            surface: AI_SURFACES.quotequick,
            // Anonymous (null) → undefined so aiService attributes the spend to
            // the quotequick surface without a user id (anon usage is bounded
            // by the per-IP rate limiter above, not a per-user budget row).
            userId: userId ?? undefined,
          });
        } else {
          // Text-mode: preamble + extraction prompt + the extracted text.
          // No vision model needed — let aiService pick its default text
          // Sonnet (cheaper, faster).
          const preamble = buildTextModePreamble(extraction.sourceKind);
          reply = await aiChat({
            // Wave 64.5: tuned system prompt — same structural clarity as
            // the image path; Excel/PDF/email needed it more than images.
            system:
              `You extract pricing structure from quote/invoice/spreadsheet/email content. Always respond with a single JSON object and nothing else. The base price is the headline service charge, NOT the grand total. Add-ons are optional line items the customer can pick; modifiers are percentage or fixed adjustments (discounts, surcharges, hourly multipliers).${clarificationSystemSuffix}`,
            messages: [
              {
                role: "user",
                content: `${clarificationPreamble}${preamble}${EXTRACTION_PROMPT}\n\n--- BEGIN DOCUMENT ---\n${extraction.text}\n--- END DOCUMENT ---`,
              },
            ],
            maxTokens: 1100,
            surface: AI_SURFACES.quotequick,
            // Anonymous (null) → undefined so aiService attributes the spend to
            // the quotequick surface without a user id (anon usage is bounded
            // by the per-IP rate limiter above, not a per-user budget row).
            userId: userId ?? undefined,
          });
        }
      } catch (err: any) {
        log.error("AI call failed", {
          error: err?.message,
          status: err?.status,
          mode: extraction.kind,
        });
        writeAudit({
          actorId: auditActorId,
          actorType: auditActorType,
          action: "ai_pricing_doc_to_template",
          entityType: "quotequick_calculator",
          entityId: auditEntityId,
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
          actorId: auditActorId,
          actorType: auditActorType,
          action: "ai_pricing_doc_to_template",
          entityType: "quotequick_calculator",
          entityId: auditEntityId,
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
      const hasClarification = !!template.clarification;

      /* (7) Audit success. Includes notes (e.g. multi-sheet xlsx) for
       *     dashboards tracking limitation hits. */
      writeAudit({
        actorId: auditActorId,
        actorType: auditActorType,
        action: "ai_pricing_doc_to_template",
        entityType: "quotequick_calculator",
        entityId: auditEntityId,
        metadata: {
          outcome: hasClarification ? "clarification_needed" : "ok",
          bytes: file.size,
          mimeType: mimeRaw,
          mode: extraction.kind,
          sourceLabel: extraction.sourceLabel,
          notes: extraction.kind === "text" ? extraction.notes : undefined,
          addonCount: template.addons.length,
          modifierCount: template.modifiers.length,
          lineItemCount: template.lineItems.length,
          hasBasePrice: template.basePrice != null,
          hasClarification,
          hasStyling: !!template.styling,
          clarificationRound: clarificationAnswer ? true : undefined,
        },
        req,
      });

      /* (7b) Back-compat: also emit the legacy action name for image-mode
       *      so any dashboards / alerts still keyed on
       *      `ai_image_to_template` keep firing. Text-mode is new and
       *      doesn't have a legacy peer. */
      if (extraction.kind === "image") {
        writeAudit({
          actorId: auditActorId,
          actorType: auditActorType,
          action: "ai_image_to_template",
          entityType: "quotequick_calculator",
          entityId: auditEntityId,
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

      /* Wave 65.1 — include clarification + styling in the response when
       * present. The client decides what to render based on hasClarification. */
      return res.json({
        template,
        ...(template.clarification ? { clarification: template.clarification } : {}),
        ...(template.styling ? { styling: template.styling } : {}),
      });
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
