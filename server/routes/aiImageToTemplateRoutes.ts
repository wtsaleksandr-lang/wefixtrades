/**
 * BF-5 — Wizard "image → calculator template" endpoint.
 *
 * POST /api/ai/wizard/image-to-template
 *   Auth: requireAuth (wizard owner only — anonymous rejected).
 *   Body: multipart/form-data { image: File }
 *         image/png | image/jpeg | image/webp, ≤ 5 MB.
 *   Returns: { template: ImageTemplate }
 *
 * The owner uploads a screenshot of a service-business quote / invoice /
 * estimate from inside the wizard editor's AI panel. We send it to Claude's
 * vision model with a strict extraction prompt and validate the JSON before
 * handing it back to the client, which dispatches a custom event that the
 * `WizardShell` listens for and applies via the existing `replaceTemplate()`
 * helper (so the change lands on the BD-3a undo stack).
 *
 * Rate-limit: 5/hour/user via imageToTemplateRateLimiter. Vision calls
 * cost ~3-6× a text call so a per-IP / per-minute cap is not enough.
 *
 * Spend + auditing: the underlying aiService.chat() already routes spend
 * through the `quotequick` AI surface (see usageTracker + recordAiSpend),
 * so the wizard owner's cost ledger continues to attribute correctly.
 * We additionally write an `audit_log` row with action
 * `ai_image_to_template` carrying byte-size + parse outcome (no raw image).
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

const log = createLogger("AIImageToTemplate");

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"] as const;
const MAX_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if ((ACCEPTED_TYPES as readonly string[]).includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

/* ─── Prompt — pinned per the BF-5 spec ───────────────────────────────── */
const EXTRACTION_PROMPT = `You are looking at an image of a service-business quote, estimate, or invoice for a trades business.
Extract the following from the image and respond with ONLY a valid JSON object matching this schema:

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

      /* (1) Rate-limit — vision is expensive. */
      const ok = await imageToTemplateRateLimiter.check(rlKey);
      if (!ok) {
        return res.status(429).json({
          error: "rate_limited",
          message: "You can only generate 5 templates from images per hour. Try again later.",
        });
      }

      /* (2) Multer accepted file? */
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          error: "invalid_image",
          message: "Upload a PNG, JPG, or WEBP image up to 5 MB.",
        });
      }
      const mimeRaw = file.mimetype.toLowerCase();
      const mediaType =
        mimeRaw === "image/jpg" ? "image/jpeg" : (mimeRaw as "image/png" | "image/jpeg" | "image/webp");
      if (!(["image/png", "image/jpeg", "image/webp"] as const).includes(mediaType)) {
        return res.status(400).json({
          error: "invalid_image_type",
          message: "Use PNG, JPG, or WEBP.",
        });
      }

      /* (3) Anthropic key present? */
      const cfg = validateConfig();
      if (!cfg.valid) {
        return res.status(503).json({ error: "ai_unavailable", reason: cfg.error });
      }

      /* (4) Call the shared Anthropic vision model. We deliberately reuse
       *     aiService.chat() so the spend automatically routes through the
       *     existing usageTracker + ai_system_gates pipeline keyed on
       *     `quotequick`. The model override picks the current vision-capable
       *     Sonnet (same one the wizard chat uses for image turns). */
      let reply = "";
      try {
        reply = await aiChat({
          system:
            "You extract pricing structure from quote/invoice images. Always respond with a single JSON object and nothing else.",
          messages: [{ role: "user", content: EXTRACTION_PROMPT }],
          userImageBlocks: [{ mediaType, data: file.buffer }],
          maxTokens: 900,
          modelOverride: process.env.CLAUDE_VISION_MODEL || "claude-sonnet-4-6",
          surface: AI_SURFACES.quotequick,
          userId,
        });
      } catch (err: any) {
        log.error("vision call failed", { error: err?.message, status: err?.status });
        // Best-effort audit even on failure.
        writeAudit({
          actorId: String(userId),
          actorType: "user",
          action: "ai_image_to_template",
          entityType: "quotequick_calculator",
          entityId: `user:${userId}`,
          metadata: {
            outcome: "ai_call_failed",
            bytes: file.size,
            mediaType,
            error: String(err?.message ?? err).slice(0, 240),
          },
          req,
        });
        return res.status(502).json({
          error: "ai_call_failed",
          message: "We couldn't process that image right now. Try again in a moment.",
        });
      }

      /* (5) Parse + validate. */
      const raw = extractJson(reply);
      const parsed = templateSchema.safeParse(raw);
      if (!parsed.success) {
        log.warn("vision reply failed schema", {
          userId,
          replyPrefix: reply.slice(0, 200),
          issues: parsed.error.issues.slice(0, 4),
        });
        writeAudit({
          actorId: String(userId),
          actorType: "user",
          action: "ai_image_to_template",
          entityType: "quotequick_calculator",
          entityId: `user:${userId}`,
          metadata: {
            outcome: "schema_invalid",
            bytes: file.size,
            mediaType,
            replyPrefix: reply.slice(0, 200),
          },
          req,
        });
        return res.status(422).json({
          error: "extraction_failed",
          message:
            "I couldn't read that image clearly. Try a sharper photo, or paste your pricing details as text.",
        });
      }

      const template = parsed.data;

      writeAudit({
        actorId: String(userId),
        actorType: "user",
        action: "ai_image_to_template",
        entityType: "quotequick_calculator",
        entityId: `user:${userId}`,
        metadata: {
          outcome: "ok",
          bytes: file.size,
          mediaType,
          addonCount: template.addons.length,
          modifierCount: template.modifiers.length,
          hasBasePrice: template.basePrice != null,
        },
        req,
      });

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
          error: "image_too_large",
          message: "Image is too large — keep it under 5 MB.",
        });
      }
      log.warn("upload error", { error: err?.message });
      return res.status(400).json({
        error: "upload_failed",
        message: "We couldn't accept that upload. Try a different image.",
      });
    },
  );
}
