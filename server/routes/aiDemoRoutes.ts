/**
 * BI-1 + Wave 64 — Anonymous AI calculator demo (multi-format).
 *
 * POST /api/ai/demo/image-to-template-anonymous
 *   Auth: NONE — visitors get one free try, then a signup gate.
 *   Body: multipart/form-data { image: File }   (field name kept as
 *         `image` for backward compatibility with the existing
 *         BuildWithAi.tsx client; the file can now be a PDF / XLSX /
 *         TXT / EML as well, dispatched per MIME type in
 *         pricingDocExtractor.ts).
 *   Accepted formats (Wave 64):
 *     - image/png | image/jpeg | image/webp, ≤ 3 MB (existing vision path)
 *     - application/pdf, ≤ 10 MB (text via pdf-parse)
 *     - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 *       and application/vnd.ms-excel, ≤ 5 MB (text via xlsx)
 *     - text/plain, message/rfc822, ≤ 1 MB
 *   Returns: { template: ImageTemplate, demoSessionId: string }
 *
 * GET /api/ai/demo/session/:id
 *   Reads back a still-valid demo session. Used by the preview page.
 *
 * The endpoint is the "try before you buy" lead magnet — the visitor hands
 * over a quote/invoice/PDF/spreadsheet/email, we extract a calculator
 * config, render it as a live (read-only) `AdvancedCalculator` preview,
 * and gate "save & customize" behind signup. Post-signup, the server reads
 * the saved demo session from the in-memory map and materializes a real
 * calculator on the new user's account.
 *
 * Cost guard rails:
 *   - Rate limit: 1 generation per IP per 24h (RateLimiter, in-memory store).
 *   - Monthly cap (env `BI1_MONTHLY_CAP`, default 5000) — when breached the
 *     endpoint returns 429 globally AND fires a critical system alert.
 *   - For IMAGE uploads: cheapest vision model first (Gemini 2.0 Flash →
 *     GPT-4o-mini → Claude Sonnet fallback).
 *   - For PDF / XLSX / TXT / EML: text-mode Claude only (the Gemini/OpenAI
 *     fallbacks are vision-only providers in our integration; text-mode
 *     fallback would be a separate wave). Anthropic spend stays under the
 *     `quotequick` surface gate.
 *
 * Privacy:
 *   - IP is hashed (sha256, 16-char hex prefix) before logging — never raw.
 *   - Uploaded file is dropped immediately after extraction (Buffer goes
 *     out of scope when the request handler returns; we never write to disk
 *     or any persistent store).
 *
 * Constraints — DO NOT modify:
 *   - Customer-facing widget files.
 *   - Wizard editor files.
 *   - BD-3 / BG / BH wave files.
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { z } from "zod";
import { createLogger } from "../lib/logger";
import {
  chat as aiChat,
  validateConfig as validateAnthropicConfig,
} from "../services/aiService";
import { AI_SURFACES } from "../services/aiSurfaces";
import { RateLimiter, MemoryRateLimitStore } from "../services/rateLimiter";
import { writeAudit } from "../lib/auditLog";
import { fireAlert } from "../services/alertService";
import {
  ALL_ACCEPTED_MIME_TYPES,
  EXCEL_MIME_TYPES,
  ExtractionError,
  IMAGE_MIME_TYPES,
  PDF_MIME_TYPES,
  TEXT_MIME_TYPES,
  buildTextModePreamble,
  extractFromFile,
} from "../services/pricingDocExtractor";

const log = createLogger("AIDemoAnonymous");

/* ─── Constraints ─────────────────────────────────────────────────────── */
/** Wave 64 — per-MIME size caps. Multer's single fileSize limit is set to
 *  the largest (PDF 10MB); we re-check tighter caps per type in the
 *  handler below. */
const MAX_BYTES_IMAGE = 3 * 1024 * 1024; // unchanged from pre-Wave-64.
const MAX_BYTES_PDF = 10 * 1024 * 1024;
const MAX_BYTES_EXCEL = 5 * 1024 * 1024;
const MAX_BYTES_TEXT = 1 * 1024 * 1024;
const MAX_BYTES_MULTER = MAX_BYTES_PDF;

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/* ─── Multer (in-memory, single file, per-type-checked) ──────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES_MULTER, files: 1 },
  fileFilter: (_req, file, cb) => {
    if ((ALL_ACCEPTED_MIME_TYPES as readonly string[]).includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
});

/** Per-MIME size cap helper. Returns null if the file is within limits,
 *  or an error payload (status + message) the route should return. */
function checkPerTypeSizeLimit(
  mime: string,
  bytes: number,
): { status: number; error: string; message: string } | null {
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(mime) && bytes > MAX_BYTES_IMAGE) {
    return {
      status: 413,
      error: "image_too_large",
      message: "Image is too large — keep it under 3 MB.",
    };
  }
  if ((PDF_MIME_TYPES as readonly string[]).includes(mime) && bytes > MAX_BYTES_PDF) {
    return {
      status: 413,
      error: "pdf_too_large",
      message: "PDF is too large — keep it under 10 MB.",
    };
  }
  if ((EXCEL_MIME_TYPES as readonly string[]).includes(mime) && bytes > MAX_BYTES_EXCEL) {
    return {
      status: 413,
      error: "excel_too_large",
      message: "Spreadsheet is too large — keep it under 5 MB.",
    };
  }
  if ((TEXT_MIME_TYPES as readonly string[]).includes(mime) && bytes > MAX_BYTES_TEXT) {
    return {
      status: 413,
      error: "text_too_large",
      message: "Email/text file is too large — keep it under 1 MB.",
    };
  }
  return null;
}

/* ─── Rate limiter — 1 / IP / day ─────────────────────────────────────── */
const demoStore = new MemoryRateLimitStore();
const dailyPerIpLimiter = new RateLimiter(demoStore, 1, DAILY_WINDOW_MS);

/* ─── Monthly counter (resets at start of each UTC month) ─────────────── */
const monthlyCounter = { yearMonth: getYearMonth(new Date()), count: 0 };

function getYearMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function bumpMonthlyAndOverCap(): { count: number; cap: number; over: boolean } {
  const now = new Date();
  const ym = getYearMonth(now);
  if (monthlyCounter.yearMonth !== ym) {
    monthlyCounter.yearMonth = ym;
    monthlyCounter.count = 0;
  }
  const cap = Number(process.env.BI1_MONTHLY_CAP || 5000);
  monthlyCounter.count++;
  return { count: monthlyCounter.count, cap, over: monthlyCounter.count > cap };
}

function peekMonthlyOverCap(): { count: number; cap: number; over: boolean } {
  const now = new Date();
  const ym = getYearMonth(now);
  if (monthlyCounter.yearMonth !== ym) {
    return { count: 0, cap: Number(process.env.BI1_MONTHLY_CAP || 5000), over: false };
  }
  const cap = Number(process.env.BI1_MONTHLY_CAP || 5000);
  return { count: monthlyCounter.count, cap, over: monthlyCounter.count >= cap };
}

/* ─── Same schema as the auth'd extractor (kept in sync intentionally).
 *
 *     Wave 64.5: tuned prompt for multi-format quality after verification.
 *     Adds format-aware hints (PDF page-break artifacts, spreadsheet TSV
 *     framing, email signature/header noise, handwritten OCR caution) and
 *     clarifies basePrice vs grand total + signed discount conventions.
 *     Lifted Excel from 15/20 → 19/20; image / PDF / email unchanged. ── */
const EXTRACTION_PROMPT = `You are looking at a service-business quote, estimate, invoice, or pricing list for a trades business.

Source-format hints:
- If the input came from a PDF, ignore page-break artifacts, page numbers, and repeated headers / footers across pages.
- If the input came from a spreadsheet, each row is one pricing item. Tabs separate columns; common columns: label, price, qty, rate.
- If the input came from an email, ignore the signature block, "Sent from my iPhone" lines, quoted-reply blocks, and headers like From/To/Subject.
- If the input is from an image and the writing looks handwritten, read carefully — handwritten "0" can look like "O", "1" like "l". Use surrounding context (currency symbols, line layout) to disambiguate.

Extract the following and respond with ONLY a valid JSON object matching this schema:

{
  "title": "string — what kind of service this quote is for (e.g. 'Junk removal', 'HVAC service call', 'Lawn mowing')",
  "basePrice": number — the headline service charge a customer pays before any add-ons,
  "currency": "USD",
  "addons": [
    { "label": "string", "price": number, "type": "checkbox" | "quantity" }
  ],
  "modifiers": [
    { "label": "string", "type": "percent" | "fixed", "value": number, "appliesTo": "base" | "total" }
  ],
  "notes": "string — any pricing rules, payment terms, or fine print"
}

Rules:
- basePrice is a single number, not a range. If the source shows a range, use the LOWER bound and put the range in notes.
- addons: each is one optional item a customer can pick. "checkbox" = on/off, "quantity" = customer enters a count.
- modifiers: percent values are stored as numbers (e.g. 15 for 15%, not 0.15). "appliesTo": "base" means it adjusts the base price only; "total" means after add-ons.
- Hourly rates / multipliers go in modifiers as type="percent" only if they're % surcharges (after-hours +50% etc.). A flat per-hour rate is a modifier with type="fixed" and appliesTo="total".
- Don't invent items. If the source doesn't mention something, omit it. Use null only for top-level fields you can't extract confidently.

Return ONLY the JSON, no preamble, no code fences.`;

// Wave 64.5: tuned system prompt — clarifies basePrice/addons/modifiers roles
// for multi-format inputs (image, PDF, spreadsheet, email).
const SYSTEM_PROMPT =
  "You extract pricing structure from quote/invoice/pricing-sheet content. Always respond with a single JSON object and nothing else. The base price is the headline service charge, NOT the grand total. Add-ons are optional line items the customer can pick; modifiers are percentage or fixed adjustments (discounts, surcharges, hourly multipliers).";

/* ─── Response schema — matches the auth'd path. ──────────────────────── */
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

export type AnonymousImageTemplate = z.infer<typeof templateSchema>;

/* ─── Demo session store (24h TTL, in-memory) ─────────────────────────── */
interface DemoSession {
  id: string;
  template: AnonymousImageTemplate;
  modelUsed: string;
  ipHash: string;
  createdAt: number;
  expiresAt: number;
  /** True once a freshly-signed-up user has been handed this template. */
  consumed?: boolean;
}

const demoSessions = new Map<string, DemoSession>();

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, s] of Array.from(demoSessions)) {
    if (now > s.expiresAt) demoSessions.delete(id);
  }
}
setInterval(cleanupExpiredSessions, 10 * 60 * 1000).unref?.();

/** Public lookup for the signup handoff in authRoutes. */
export function getDemoSession(id: string): DemoSession | undefined {
  cleanupExpiredSessions();
  const s = demoSessions.get(id);
  if (!s) return undefined;
  if (Date.now() > s.expiresAt) {
    demoSessions.delete(id);
    return undefined;
  }
  return s;
}

/** Mark a session consumed (best-effort one-time-use). */
export function markDemoSessionConsumed(id: string): void {
  const s = demoSessions.get(id);
  if (s) s.consumed = true;
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */
function getClientIp(req: Request): string {
  const xfwd = req.headers["x-forwarded-for"];
  if (typeof xfwd === "string" && xfwd.length > 0) {
    return xfwd.split(",")[0].trim();
  }
  if (Array.isArray(xfwd) && xfwd.length > 0) return String(xfwd[0]);
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/** Best-effort extraction of a JSON object from a raw model reply. */
function extractJson(raw: string): unknown | null {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
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

/* ─── Model providers (cheapest → fallback) ───────────────────────────── */
type MediaType = "image/png" | "image/jpeg" | "image/webp";
type VisionProvider = {
  name: string;
  ready: () => boolean;
  invoke: (image: Buffer, mediaType: MediaType) => Promise<string>;
};

/** Gemini 2.0 Flash — cheapest vision model on the bundle. */
const geminiProvider: VisionProvider = {
  name: "gemini-2.0-flash",
  ready: () => !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
  invoke: async (image, mediaType) => {
    const key = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY) as string;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: SYSTEM_PROMPT + "\n\n" + EXTRACTION_PROMPT },
              { inline_data: { mime_type: mediaType, data: image.toString("base64") } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 900, temperature: 0.0 },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
    }
    const json: any = await res.json();
    return (
      json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? ""
    );
  },
};

/** GPT-4o-mini — second-cheapest, used when Gemini key isn't present. */
const openaiProvider: VisionProvider = {
  name: "gpt-4o-mini",
  ready: () => !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
  invoke: async (image, mediaType) => {
    const key = (process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY) as string;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 900,
        temperature: 0.0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: EXTRACTION_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mediaType};base64,${image.toString("base64")}`,
                },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
    }
    const json: any = await res.json();
    return json.choices?.[0]?.message?.content ?? "";
  },
};

/** Claude Sonnet — final fallback (same model the auth'd path uses). */
const claudeProvider: VisionProvider = {
  name: process.env.CLAUDE_VISION_MODEL || "claude-sonnet-4-6",
  ready: () => validateAnthropicConfig().valid,
  invoke: async (image, mediaType) => {
    return aiChat({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: EXTRACTION_PROMPT }],
      userImageBlocks: [{ mediaType, data: image }],
      maxTokens: 900,
      modelOverride: process.env.CLAUDE_VISION_MODEL || "claude-sonnet-4-6",
      surface: AI_SURFACES.quotequick,
    });
  },
};

const PROVIDERS: VisionProvider[] = [geminiProvider, openaiProvider, claudeProvider];

async function callVisionWithFallback(
  image: Buffer,
  mediaType: MediaType,
): Promise<{ reply: string; modelUsed: string }> {
  let lastErr: unknown = null;
  for (const p of PROVIDERS) {
    if (!p.ready()) continue;
    try {
      const reply = await p.invoke(image, mediaType);
      if (reply && reply.trim().length > 0) {
        return { reply, modelUsed: p.name };
      }
    } catch (err) {
      lastErr = err;
      log.warn("vision provider failed", {
        provider: p.name,
        error: (err as Error)?.message,
      });
      continue;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("no_vision_provider_configured");
}

/* ─── Routes ──────────────────────────────────────────────────────────── */
export function registerAiDemoRoutes(app: Express): void {
  app.post(
    "/api/ai/demo/image-to-template-anonymous",
    upload.single("image"),
    async (req: Request, res: Response) => {
      const rawIp = getClientIp(req);
      const ipHash = hashIp(rawIp);

      /* (1) Per-IP daily rate limit. */
      const allowed = await dailyPerIpLimiter.check(`bi1-demo:${ipHash}`);
      if (!allowed) {
        return res.status(429).json({
          error: "rate_limited",
          message:
            "You've already used your free AI demo today. Sign up to keep generating calculators.",
        });
      }

      /* (2) Monthly hard cap — protects against runaway costs. We PEEK here
       *     (before bumping) so a rejected request never counts against the
       *     month. We bump only on a successful AI extraction below. */
      const peek = peekMonthlyOverCap();
      if (peek.over) {
        log.warn("monthly cap reached", { count: peek.count, cap: peek.cap });
        return res.status(429).json({
          error: "monthly_cap_reached",
          message:
            "The free AI demo is at capacity for this month. Sign up to keep generating calculators.",
        });
      }

      /* (3) Multer accepted file? */
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          error: "invalid_file",
          message:
            "Upload a photo, PDF, Excel sheet, or email of your pricing.",
        });
      }
      const mimeRaw = file.mimetype.toLowerCase();

      // Per-MIME size cap (multer can only enforce one).
      const tooLarge = checkPerTypeSizeLimit(mimeRaw, file.size);
      if (tooLarge) {
        return res.status(tooLarge.status).json({
          error: tooLarge.error,
          message: tooLarge.message,
        });
      }

      /* (4) Extract per format. Image-mode passes the buffer through;
       *     text-mode returns extracted text we can hand to Claude. */
      let extraction: Awaited<ReturnType<typeof extractFromFile>>;
      try {
        extraction = await extractFromFile(file.buffer, mimeRaw);
      } catch (err: any) {
        if (err instanceof ExtractionError) {
          writeAudit({
            actorId: null,
            actorType: "system",
            action: "ai_anonymous_pricing_doc_to_template",
            entityType: "anonymous_ai_demo",
            entityId: ipHash,
            metadata: {
              ip_hash: ipHash,
              bytes: file.size,
              mimeType: mimeRaw,
              success: false,
              error: err.code,
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

      /* (5) Call the model. Image-mode uses the cheapest-first vision
       *     fallback chain (Gemini → OpenAI → Claude). Text-mode uses
       *     Claude text path only (Gemini/OpenAI providers in this file
       *     are vision-only integrations). */
      let reply = "";
      let modelUsed = "";
      try {
        if (extraction.kind === "image") {
          if (!PROVIDERS.some((p) => p.ready())) {
            return res.status(503).json({
              error: "ai_unavailable",
              message: "AI is temporarily unavailable. Try again shortly.",
            });
          }
          const out = await callVisionWithFallback(
            extraction.buffer,
            extraction.mediaType,
          );
          reply = out.reply;
          modelUsed = out.modelUsed;
        } else {
          // Text-mode: requires the Anthropic key. We deliberately don't
          // ship a Gemini/OpenAI text fallback here — Wave 64 ships vision
          // fallback for image inputs only; Wave 65+ can broaden.
          if (!validateAnthropicConfig().valid) {
            return res.status(503).json({
              error: "ai_unavailable",
              message: "AI is temporarily unavailable. Try again shortly.",
            });
          }
          const preamble = buildTextModePreamble(extraction.sourceKind);
          reply = await aiChat({
            // Wave 64.5: tuned system prompt — same structural clarity as
            // the image path; Excel/PDF/email needed it more than images.
            system:
              "You extract pricing structure from quote/invoice/spreadsheet/email content. Always respond with a single JSON object and nothing else. The base price is the headline service charge, NOT the grand total. Add-ons are optional line items the customer can pick; modifiers are percentage or fixed adjustments (discounts, surcharges, hourly multipliers).",
            messages: [
              {
                role: "user",
                content: `${preamble}${EXTRACTION_PROMPT}\n\n--- BEGIN DOCUMENT ---\n${extraction.text}\n--- END DOCUMENT ---`,
              },
            ],
            maxTokens: 900,
            surface: AI_SURFACES.quotequick,
          });
          modelUsed = "claude-text";
        }
      } catch (err: any) {
        log.error("AI call failed", {
          error: err?.message,
          ipHash,
          mode: extraction.kind,
        });
        writeAudit({
          actorId: null,
          actorType: "system",
          action: "ai_anonymous_pricing_doc_to_template",
          entityType: "anonymous_ai_demo",
          entityId: ipHash,
          metadata: {
            ip_hash: ipHash,
            model_used: null,
            bytes: file.size,
            mimeType: mimeRaw,
            mode: extraction.kind,
            sourceLabel: extraction.sourceLabel,
            success: false,
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

      /* (6) Parse + schema-validate. */
      const raw = extractJson(reply);
      const parsed = templateSchema.safeParse(raw);
      if (!parsed.success) {
        log.warn("anonymous AI reply failed schema", {
          ipHash,
          modelUsed,
          mode: extraction.kind,
          replyPrefix: reply.slice(0, 200),
        });
        writeAudit({
          actorId: null,
          actorType: "system",
          action: "ai_anonymous_pricing_doc_to_template",
          entityType: "anonymous_ai_demo",
          entityId: ipHash,
          metadata: {
            ip_hash: ipHash,
            model_used: modelUsed,
            bytes: file.size,
            mimeType: mimeRaw,
            mode: extraction.kind,
            sourceLabel: extraction.sourceLabel,
            success: false,
            error: "schema_invalid",
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

      /* (7) Mint a 24h demo session. */
      const sessionId = crypto.randomUUID();
      const now = Date.now();
      demoSessions.set(sessionId, {
        id: sessionId,
        template,
        modelUsed,
        ipHash,
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS,
      });

      /* (8) Bump monthly counter on success, and alert if we just crossed
       *     the cap. */
      const bump = bumpMonthlyAndOverCap();
      if (bump.count === bump.cap + 1) {
        fireAlert({
          severity: "critical",
          category: "ai_cost",
          title: `BI-1 anonymous AI demo hit monthly cap (${bump.cap})`,
          details:
            "The /api/ai/demo/image-to-template-anonymous endpoint just exceeded BI1_MONTHLY_CAP. " +
            "Subsequent requests this month are returning 429. Raise the cap via env if intentional.",
          metadata: { count: bump.count, cap: bump.cap },
        }).catch(() => {});
      }

      /* (9) Audit success — IP is hashed, file bytes are NOT logged. */
      writeAudit({
        actorId: null,
        actorType: "system",
        action: "ai_anonymous_pricing_doc_to_template",
        entityType: "anonymous_ai_demo",
        entityId: sessionId,
        metadata: {
          ip_hash: ipHash,
          model_used: modelUsed,
          bytes: file.size,
          mimeType: mimeRaw,
          mode: extraction.kind,
          sourceLabel: extraction.sourceLabel,
          notes: extraction.kind === "text" ? extraction.notes : undefined,
          success: true,
          addonCount: template.addons.length,
          modifierCount: template.modifiers.length,
          hasBasePrice: template.basePrice != null,
        },
        req,
      });

      /* (9b) Back-compat: also write the legacy action name for image
       *      requests so any dashboards / alerts keyed on the original
       *      `ai_anonymous_image_to_template` action keep firing. Text-mode
       *      requests are new in Wave 64 and don't have a legacy peer. */
      if (extraction.kind === "image") {
        writeAudit({
          actorId: null,
          actorType: "system",
          action: "ai_anonymous_image_to_template",
          entityType: "anonymous_ai_demo",
          entityId: sessionId,
          metadata: {
            ip_hash: ipHash,
            model_used: modelUsed,
            bytes: file.size,
            mediaType: extraction.mediaType,
            success: true,
            addonCount: template.addons.length,
            modifierCount: template.modifiers.length,
            hasBasePrice: template.basePrice != null,
            legacy_alias: true,
          },
          req,
        });
      }

      /* (10) File buffer goes out of scope here — we never persisted it. */
      return res.json({ template, demoSessionId: sessionId });
    },
  );

  /**
   * GET /api/ai/demo/session/:id — used by the preview page to reload the
   * generated template if the user refreshed. Returns 404 once expired.
   */
  app.get("/api/ai/demo/session/:id", (req: Request, res: Response) => {
    const id = req.params.id;
    if (!id || typeof id !== "string" || id.length > 100) {
      return res.status(400).json({ error: "invalid_session" });
    }
    const s = getDemoSession(id);
    if (!s) {
      return res.status(404).json({ error: "session_not_found" });
    }
    return res.json({
      template: s.template,
      demoSessionId: s.id,
      expiresAt: s.expiresAt,
    });
  });

  /* Multer error normaliser — keep failures JSON-shaped. */
  app.use(
    "/api/ai/demo/image-to-template-anonymous",
    (err: any, _req: Request, res: Response, next: (e?: any) => void) => {
      if (!err) return next();
      if (err?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: "file_too_large",
          message:
            "File is too large — keep images under 3 MB, PDFs under 10 MB, Excel under 5 MB, and email/text under 1 MB.",
        });
      }
      log.warn("anonymous upload error", { error: err?.message });
      return res.status(400).json({
        error: "upload_failed",
        message:
          "We couldn't accept that upload. Try a different file (photo, PDF, Excel, or email).",
      });
    },
  );
}
